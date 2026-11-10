-- CMI Follow-up v2.1 — audited pastoral narrative read transactions.
--
-- DRAFT ONLY. CI applies this source through a temporary CLI-generated
-- migration on the disposable local CMI stack. Do not promote to permanent
-- migration history or apply to a hosted database before stakeholder review.
--
-- R-01, R-10, R-11 and D-07 remain pending. No role grants are seeded.
-- Assigned reads require an exact assigned capability AND a live record
-- assignment. Oversight reads require a separate oversight capability,
-- explicit oversight scope and a non-empty reason. Both paths audit inside
-- the same transaction before returning any narrative.
--
-- This is intentionally read-only. Mutation, assignment, archive and
-- retention workflows remain blocked pending the relevant approvals.

begin;

-- A row trigger does not run for TRUNCATE. Protect both ledgers at statement
-- level as well so append-only means INSERT-only for all ordinary paths.
create trigger prayer_access_audit_no_truncate
  before truncate on public.prayer_access_audit
  for each statement execute function private.reject_append_only_mutation();

create trigger care_access_audit_no_truncate
  before truncate on public.care_access_audit
  for each statement execute function private.reject_append_only_mutation();

create or replace function public.cmi_read_prayer_request(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_prayer_request_id uuid,
  p_access_mode text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_capability_code text;
  v_scope_mode text;
  v_authorized boolean := false;
  v_payload jsonb;
begin
  if p_actor_auth_user_id is null
     or p_branch_id is null
     or p_prayer_request_id is null
     or p_request_id is null
     or pg_catalog.length(pg_catalog.btrim(p_request_id)) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid pastoral read input';
  end if;

  if p_access_mode is null or p_access_mode not in ('assigned', 'oversight') then
    raise exception using errcode = '22023', message = 'invalid pastoral access mode';
  end if;

  if p_access_mode = 'oversight' then
    if p_reason is null or p_reason not in (
      'pastoral_review',
      'continuity_of_care',
      'safeguarding_concern',
      'complaint_review',
      'administrative_review'
    ) then
      raise exception using errcode = '22023', message = 'oversight reason code is required';
    end if;
    v_capability_code := 'prayer.oversight.read';
    v_scope_mode := 'oversight';
  else
    if p_reason is not null then
      raise exception using errcode = '22023', message = 'assigned read must not include an oversight reason';
    end if;
    v_capability_code := 'prayer.request.read.assigned';
    v_scope_mode := 'assigned';
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
     and sra.starts_at <= pg_catalog.now()
     and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
     and sra.revoked_at is null
    join public.role r
      on r.id = sra.role_id
     and r.is_active
    join public.role_capability rc
      on rc.role_id = r.id
     and rc.scope_mode = v_scope_mode
    join public.capability cap
      on cap.id = rc.capability_id
     and cap.code = v_capability_code
     and cap.is_active
    where sp.auth_user_id = p_actor_auth_user_id
      and sp.account_status = 'active'
  ) into v_authorized;

  if not v_authorized then
    raise exception using errcode = '42501', message = 'pastoral read not authorized';
  end if;

  if p_access_mode = 'assigned' and not exists (
    select 1
    from public.prayer_assignment pa
    where pa.prayer_request_id = p_prayer_request_id
      and pa.branch_id = p_branch_id
      and pa.intercessor_user_id = p_actor_auth_user_id
      and pa.starts_at <= pg_catalog.now()
      and (pa.ends_at is null or pa.ends_at > pg_catalog.now())
      and pa.revoked_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'prayer request not found';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', pr.id,
    'branch_id', pr.branch_id,
    'request_text', pr.request_text,
    'status', pr.status,
    'sensitivity', pr.sensitivity,
    'expires_at', pr.expires_at,
    'answered_at', pr.answered_at,
    'created_at', pr.created_at,
    'updated_at', pr.updated_at
  )
  into v_payload
  from public.prayer_request pr
  where pr.id = p_prayer_request_id
    and pr.branch_id = p_branch_id;

  if v_payload is null then
    raise exception using errcode = 'P0002', message = 'prayer request not found';
  end if;

  insert into public.prayer_access_audit (
    prayer_request_id,
    branch_id,
    actor_user_id,
    action,
    reason,
    request_id,
    safe_metadata
  ) values (
    p_prayer_request_id,
    p_branch_id,
    p_actor_auth_user_id,
    case when p_access_mode = 'oversight' then 'oversight' else 'read' end,
    case when p_access_mode = 'oversight' then pg_catalog.btrim(p_reason) else null end,
    p_request_id,
    pg_catalog.jsonb_build_object('access_mode', p_access_mode)
  );

  return pg_catalog.jsonb_build_object('request', v_payload);
end;
$$;

revoke all on function public.cmi_read_prayer_request(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cmi_read_prayer_request(uuid, uuid, uuid, text, text, text)
  to service_role;

comment on function public.cmi_read_prayer_request(uuid, uuid, uuid, text, text, text) is
  'Returns an allowlisted prayer projection only after active staff, branch, explicit capability and (for assigned mode) live assignment checks; audits the request in the same transaction. Oversight reasons are allowlisted codes. Service-role only.';

create or replace function public.cmi_read_care_record(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_care_record_id uuid,
  p_access_mode text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_capability_code text;
  v_scope_mode text;
  v_authorized boolean := false;
  v_record jsonb;
  v_interactions jsonb := '[]'::jsonb;
begin
  if p_actor_auth_user_id is null
     or p_branch_id is null
     or p_care_record_id is null
     or p_request_id is null
     or pg_catalog.length(pg_catalog.btrim(p_request_id)) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid pastoral read input';
  end if;

  if p_access_mode is null or p_access_mode not in ('assigned', 'oversight') then
    raise exception using errcode = '22023', message = 'invalid pastoral access mode';
  end if;

  if p_access_mode = 'oversight' then
    if p_reason is null or p_reason not in (
      'pastoral_review',
      'continuity_of_care',
      'safeguarding_concern',
      'complaint_review',
      'administrative_review'
    ) then
      raise exception using errcode = '22023', message = 'oversight reason code is required';
    end if;
    v_capability_code := 'care.oversight.read';
    v_scope_mode := 'oversight';
  else
    if p_reason is not null then
      raise exception using errcode = '22023', message = 'assigned read must not include an oversight reason';
    end if;
    v_capability_code := 'care.record.read.assigned';
    v_scope_mode := 'assigned';
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
     and sra.starts_at <= pg_catalog.now()
     and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
     and sra.revoked_at is null
    join public.role r
      on r.id = sra.role_id
     and r.is_active
    join public.role_capability rc
      on rc.role_id = r.id
     and rc.scope_mode = v_scope_mode
    join public.capability cap
      on cap.id = rc.capability_id
     and cap.code = v_capability_code
     and cap.is_active
    where sp.auth_user_id = p_actor_auth_user_id
      and sp.account_status = 'active'
  ) into v_authorized;

  if not v_authorized then
    raise exception using errcode = '42501', message = 'pastoral read not authorized';
  end if;

  if p_access_mode = 'assigned' and not exists (
    select 1
    from public.care_assignment ca
    where ca.care_record_id = p_care_record_id
      and ca.branch_id = p_branch_id
      and ca.assignee_user_id = p_actor_auth_user_id
      and ca.starts_at <= pg_catalog.now()
      and (ca.ends_at is null or ca.ends_at > pg_catalog.now())
      and ca.revoked_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'care record not found';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', cr.id,
    'branch_id', cr.branch_id,
    'status', cr.status,
    'reviewed_at', cr.reviewed_at,
    'created_at', cr.created_at,
    'updated_at', cr.updated_at
  )
  into v_record
  from public.care_record cr
  where cr.id = p_care_record_id
    and cr.branch_id = p_branch_id;

  if v_record is null then
    raise exception using errcode = 'P0002', message = 'care record not found';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item.id,
        'interaction_type', item.interaction_type,
        'outcome_code', item.outcome_code,
        'restricted_note', item.restricted_note,
        'occurred_at', item.occurred_at
      )
      order by item.occurred_at desc
    ),
    '[]'::jsonb
  )
  into v_interactions
  from (
    select ci.id, ci.interaction_type, ci.outcome_code, ci.restricted_note, ci.occurred_at
    from public.care_interaction ci
    where ci.care_record_id = p_care_record_id
      and ci.branch_id = p_branch_id
    order by ci.occurred_at desc
    limit 100
  ) item;

  insert into public.care_access_audit (
    care_record_id,
    branch_id,
    actor_user_id,
    action,
    reason,
    request_id,
    safe_metadata
  ) values (
    p_care_record_id,
    p_branch_id,
    p_actor_auth_user_id,
    case when p_access_mode = 'oversight' then 'oversight' else 'read' end,
    case when p_access_mode = 'oversight' then pg_catalog.btrim(p_reason) else null end,
    p_request_id,
    pg_catalog.jsonb_build_object(
      'access_mode', p_access_mode,
      'interaction_count', pg_catalog.jsonb_array_length(v_interactions)
    )
  );

  return pg_catalog.jsonb_build_object(
    'record', v_record,
    'interactions', v_interactions
  );
end;
$$;

revoke all on function public.cmi_read_care_record(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cmi_read_care_record(uuid, uuid, uuid, text, text, text)
  to service_role;

comment on function public.cmi_read_care_record(uuid, uuid, uuid, text, text, text) is
  'Returns an allowlisted care projection and latest 100 restricted interactions only after active staff, branch, explicit capability and (for assigned mode) live assignment checks; audits the request in the same transaction. Oversight reasons are allowlisted codes. Service-role only.';

commit;
