-- PCG Missions CMI — assigned prayer inbox.
-- Returns a minimal, assigned-only narrative projection for the Prayer Intercessor.
-- Each narrative disclosed by the inbox is audited in the same transaction.
begin;

create or replace function public.cmi_list_assigned_prayer_requests(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_limit integer,
  p_offset integer,
  p_request_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_authorized boolean := false;
  v_total integer := 0;
  v_requests jsonb := '[]'::jsonb;
  v_row record;
begin
  if p_actor_auth_user_id is null
     or p_branch_id is null
     or p_request_id is null
     or pg_catalog.length(pg_catalog.btrim(p_request_id)) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid assigned prayer inbox input';
  end if;

  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset not between 0 and 5000 then
    raise exception using errcode = '22023', message = 'invalid assigned prayer inbox pagination';
  end if;

  select exists (
    select 1
    from public.staff_profile sp
    join public.branch b
      on b.id = p_branch_id
     and b.is_active
    join public.staff_role_assignment sra
      on sra.staff_profile_id = sp.id
     and sra.branch_id = p_branch_id
     and sra.starts_at <= pg_catalog.clock_timestamp()
     and (sra.ends_at is null or sra.ends_at > pg_catalog.clock_timestamp())
     and sra.revoked_at is null
    join public.role r
      on r.id = sra.role_id
     and r.is_active
    join public.role_capability rc
      on rc.role_id = r.id
     and rc.scope_mode = 'assigned'
    join public.capability cap
      on cap.id = rc.capability_id
     and cap.code = 'prayer.request.read.assigned'
     and cap.is_active
    where sp.auth_user_id = p_actor_auth_user_id
      and sp.account_status = 'active'
      and not sp.must_change_password
  ) into v_authorized;

  if not v_authorized then
    raise exception using errcode = '42501', message = 'assigned prayer inbox not authorized';
  end if;

  select pg_catalog.count(distinct pr.id)::integer
    into v_total
  from public.prayer_request pr
  join public.prayer_assignment pa
    on pa.prayer_request_id = pr.id
   and pa.branch_id = pr.branch_id
   and pa.intercessor_user_id = p_actor_auth_user_id
   and pa.starts_at <= pg_catalog.clock_timestamp()
   and (pa.ends_at is null or pa.ends_at > pg_catalog.clock_timestamp())
   and pa.revoked_at is null
  where pr.branch_id = p_branch_id
    and pr.status <> 'expired'
    and (pr.expires_at is null or pr.expires_at > pg_catalog.clock_timestamp());

  for v_row in
    select
      pr.id,
      pr.branch_id,
      pr.request_text,
      pr.status,
      pr.sensitivity,
      pr.expires_at,
      pr.answered_at,
      pr.created_at,
      pr.updated_at,
      pa.starts_at as assignment_starts_at,
      pa.ends_at as assignment_ends_at
    from public.prayer_request pr
    join public.prayer_assignment pa
      on pa.prayer_request_id = pr.id
     and pa.branch_id = pr.branch_id
     and pa.intercessor_user_id = p_actor_auth_user_id
     and pa.starts_at <= pg_catalog.clock_timestamp()
     and (pa.ends_at is null or pa.ends_at > pg_catalog.clock_timestamp())
     and pa.revoked_at is null
    where pr.branch_id = p_branch_id
      and pr.status <> 'expired'
      and (pr.expires_at is null or pr.expires_at > pg_catalog.clock_timestamp())
    order by pr.created_at desc, pr.id
    limit p_limit
    offset p_offset
  loop
    v_requests := v_requests || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_row.id,
        'branch_id', v_row.branch_id,
        'request_text', v_row.request_text,
        'status', v_row.status,
        'sensitivity', v_row.sensitivity,
        'expires_at', v_row.expires_at,
        'answered_at', v_row.answered_at,
        'created_at', v_row.created_at,
        'updated_at', v_row.updated_at,
        'assignment_starts_at', v_row.assignment_starts_at,
        'assignment_ends_at', v_row.assignment_ends_at
      )
    );

    insert into public.prayer_access_audit (
      prayer_request_id,
      branch_id,
      actor_user_id,
      action,
      reason,
      request_id,
      safe_metadata
    ) values (
      v_row.id,
      v_row.branch_id,
      p_actor_auth_user_id,
      'read',
      null,
      p_request_id,
      pg_catalog.jsonb_build_object(
        'access_mode', 'assigned',
        'read_surface', 'inbox'
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'requests', v_requests,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
end;
$$;

revoke all on function public.cmi_list_assigned_prayer_requests(uuid, uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.cmi_list_assigned_prayer_requests(uuid, uuid, integer, integer, text)
  to service_role;

comment on function public.cmi_list_assigned_prayer_requests(uuid, uuid, integer, integer, text) is
  'Lists only non-expired prayer requests actively assigned to the authenticated intercessor in the specified active branch. Returns no linked contact identity and audits each disclosed narrative in the same transaction. Service-role only.';

commit;
