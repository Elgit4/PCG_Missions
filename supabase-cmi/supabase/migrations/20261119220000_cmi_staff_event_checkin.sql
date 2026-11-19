-- Branch-scoped event check-in for Admin/Pastor only.
-- Offline check-in remains disabled. Each registration is checked in once.
begin;

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'branch'
from public.role r
join public.capability c on c.code = 'event.checkin.scoped'
where r.code = 'admin_pastor'
  and c.is_active
on conflict do nothing;

do $$
declare
  grant_count integer;
begin
  select count(*)::integer
    into grant_count
  from public.role_capability rc
  join public.role r on r.id = rc.role_id
  join public.capability c on c.id = rc.capability_id
  where r.code = 'admin_pastor'
    and c.code = 'event.checkin.scoped'
    and c.is_active
    and rc.scope_mode = 'branch';

  if grant_count <> 1 then
    raise exception 'Expected one Admin/Pastor branch check-in grant, found %', grant_count;
  end if;
end;
$$;

grant select, insert on table public.event_checkin to service_role;
grant select, insert on table public.event_idempotency_receipt to service_role;

create or replace function public.cmi_staff_checkin_event_registration(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_branch_id uuid,
  p_registration_id uuid,
  p_idempotency_key uuid,
  p_digest_key_version smallint,
  p_request_digest_hex text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_event public.event%rowtype;
  v_registration public.event_registration%rowtype;
  v_profile_id uuid;
  v_existing_digest bytea;
  v_existing_resource_id uuid;
  v_existing_status smallint;
  v_checkin_id uuid;
  v_checkin_json jsonb;
begin
  if p_actor_auth_user_id is null
     or p_event_id is null
     or p_branch_id is null
     or p_registration_id is null
     or p_idempotency_key is null
     or p_digest_key_version is null
     or p_digest_key_version < 1
     or p_request_digest_hex is null
     or p_request_digest_hex !~ '^[0-9a-fA-F]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_CHECKIN_INPUT';
  end if;

  select sp.id
    into v_profile_id
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
   and rc.scope_mode = 'branch'
  join public.capability cap
    on cap.id = rc.capability_id
   and cap.code = 'event.checkin.scoped'
   and cap.is_active
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active'
    and not sp.must_change_password
  limit 1;

  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'EVENT_CHECKIN_NOT_AUTHORIZED';
  end if;

  select e.*
    into v_event
  from public.event e
  where e.id = p_event_id
    and e.branch_id = p_branch_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'EVENT_NOT_FOUND';
  end if;

  select receipt.request_digest,
         receipt.resource_id,
         receipt.response_status
    into v_existing_digest, v_existing_resource_id, v_existing_status
  from public.event_idempotency_receipt receipt
  where receipt.event_id = p_event_id
    and receipt.branch_id = p_branch_id
    and receipt.operation = 'event_checkin'
    and receipt.caller_class = 'staff'
    and receipt.actor_user_id = p_actor_auth_user_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_digest <> pg_catalog.decode(p_request_digest_hex, 'hex') then
      raise exception using errcode = '23505', message = 'EVENT_IDEMPOTENCY_KEY_REUSED';
    end if;

    select pg_catalog.jsonb_build_object(
      'id', checkin.id,
      'event_id', checkin.event_id,
      'branch_id', checkin.branch_id,
      'registration_id', checkin.registration_id,
      'attendee_name_snapshot', checkin.attendee_name_snapshot,
      'checked_in_at', checkin.checked_in_at,
      'recorded_by', checkin.recorded_by,
      'source', checkin.source
    )
      into v_checkin_json
    from public.event_checkin checkin
    where checkin.id = v_existing_resource_id
      and checkin.event_id = p_event_id
      and checkin.branch_id = p_branch_id;

    if v_checkin_json is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'checkin', v_checkin_json,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.status in ('cancelled', 'completed')
     or v_event.ends_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_CHECKIN_CLOSED';
  end if;

  select registration.*
    into v_registration
  from public.event_registration registration
  where registration.id = p_registration_id
    and registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'EVENT_REGISTRATION_NOT_FOUND';
  end if;

  if v_registration.status <> 'registered' then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_NOT_ACTIVE';
  end if;

  if exists (
    select 1
    from public.event_checkin checkin
    where checkin.event_id = p_event_id
      and checkin.branch_id = p_branch_id
      and checkin.registration_id = p_registration_id
  ) then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_ALREADY_CHECKED_IN';
  end if;

  insert into public.event_checkin (
    event_id,
    branch_id,
    registration_id,
    attendee_name_snapshot,
    recorded_by,
    source,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    p_registration_id,
    v_registration.attendee_name_snapshot,
    p_actor_auth_user_id,
    'staff',
    p_idempotency_key
  )
  returning id into v_checkin_id;

  insert into public.event_idempotency_receipt (
    event_id,
    branch_id,
    operation,
    caller_class,
    actor_user_id,
    idempotency_key,
    digest_key_version,
    request_digest,
    resource_type,
    resource_id,
    response_status
  ) values (
    p_event_id,
    p_branch_id,
    'event_checkin',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_checkin',
    v_checkin_id,
    201
  );

  select pg_catalog.jsonb_build_object(
    'id', checkin.id,
    'event_id', checkin.event_id,
    'branch_id', checkin.branch_id,
    'registration_id', checkin.registration_id,
    'attendee_name_snapshot', checkin.attendee_name_snapshot,
    'checked_in_at', checkin.checked_in_at,
    'recorded_by', checkin.recorded_by,
    'source', checkin.source
  )
    into v_checkin_json
  from public.event_checkin checkin
  where checkin.id = v_checkin_id;

  return pg_catalog.jsonb_build_object(
    'checkin', v_checkin_json,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_checkin_event_registration(
  uuid, uuid, uuid, uuid, uuid, smallint, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_checkin_event_registration(
  uuid, uuid, uuid, uuid, uuid, smallint, text
) to service_role;

comment on function public.cmi_staff_checkin_event_registration(
  uuid, uuid, uuid, uuid, uuid, smallint, text
) is
  'Admin/Pastor branch-scoped check-in of an active staff registration. Locks the event and registration, stores one check-in and a server-computed HMAC idempotency receipt atomically. Offline check-in is not enabled.';

commit;
