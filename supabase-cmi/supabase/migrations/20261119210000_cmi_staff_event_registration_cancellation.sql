-- Staff-side cancellation of an event registration.
-- Cancellation is atomic, idempotent, and releases one capacity slot.
begin;

grant select, update on table public.event_registration to service_role;
grant select on table public.event_checkin to service_role;
grant select, insert on table public.event_idempotency_receipt to service_role;

create or replace function public.cmi_staff_cancel_event_registration(
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
  v_registration_json jsonb;
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
    raise exception using errcode = '22023', message = 'INVALID_REGISTRATION_CANCEL_INPUT';
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
   and cap.code = 'event.registration.manage.scoped'
   and cap.is_active
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active'
    and not sp.must_change_password
  limit 1;

  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'EVENT_REGISTRATION_NOT_AUTHORIZED';
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
    and receipt.operation = 'registration_cancel'
    and receipt.caller_class = 'staff'
    and receipt.actor_user_id = p_actor_auth_user_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_digest <> pg_catalog.decode(p_request_digest_hex, 'hex') then
      raise exception using errcode = '23505', message = 'EVENT_IDEMPOTENCY_KEY_REUSED';
    end if;

    select pg_catalog.jsonb_build_object(
      'id', registration.id,
      'event_id', registration.event_id,
      'branch_id', registration.branch_id,
      'attendee_name_snapshot', registration.attendee_name_snapshot,
      'attendee_phone_snapshot', registration.attendee_phone_snapshot,
      'status', registration.status,
      'registered_at', registration.registered_at
    )
      into v_registration_json
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration_json is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration_json,
      'replayed', true,
      'response_status', v_existing_status
    );
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

  if exists (
    select 1
    from public.event_checkin checkin
    where checkin.event_id = p_event_id
      and checkin.branch_id = p_branch_id
      and checkin.registration_id = p_registration_id
  ) then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_ALREADY_CHECKED_IN';
  end if;

  if v_registration.status not in ('registered', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_NOT_CANCELLABLE';
  end if;

  if v_event.starts_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CANCELLATION_CLOSED';
  end if;

  if v_registration.status <> 'cancelled' then
    update public.event_registration
       set status = 'cancelled'
     where id = p_registration_id
       and event_id = p_event_id
       and branch_id = p_branch_id
       and status = 'registered'
    returning * into v_registration;

    if not found then
      raise exception using errcode = '40001', message = 'EVENT_REGISTRATION_CHANGED';
    end if;
  end if;

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
    'registration_cancel',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    p_registration_id,
    200
  );

  select pg_catalog.jsonb_build_object(
    'id', registration.id,
    'event_id', registration.event_id,
    'branch_id', registration.branch_id,
    'attendee_name_snapshot', registration.attendee_name_snapshot,
    'attendee_phone_snapshot', registration.attendee_phone_snapshot,
    'status', registration.status,
    'registered_at', registration.registered_at
  )
    into v_registration_json
  from public.event_registration registration
  where registration.id = p_registration_id
    and registration.event_id = p_event_id
    and registration.branch_id = p_branch_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration_json,
    'replayed', false,
    'response_status', 200
  );
end;
$$;

revoke all on function public.cmi_staff_cancel_event_registration(
  uuid, uuid, uuid, uuid, uuid, smallint, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_cancel_event_registration(
  uuid, uuid, uuid, uuid, uuid, smallint, text
) to service_role;

comment on function public.cmi_staff_cancel_event_registration(
  uuid, uuid, uuid, uuid, uuid, smallint, text
) is
  'Cancels an un-checked-in staff registration before the event starts. Event-row locking, registration locking and a server-computed idempotency receipt make cancellation atomic and capacity-releasing.';

commit;
