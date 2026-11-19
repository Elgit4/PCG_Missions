-- Staff-assisted event registration. Public self-registration stays disabled.
-- The RPC serializes capacity with an event-row lock and records a server-computed
-- HMAC receipt in the same transaction as the registration.
begin;

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'branch'
from public.role r
join public.capability c on c.code = 'event.registration.manage.scoped'
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
    and c.code = 'event.registration.manage.scoped'
    and c.is_active
    and rc.scope_mode = 'branch';

  if grant_count <> 1 then
    raise exception 'Expected one Admin/Pastor branch event registration grant, found %', grant_count;
  end if;
end;
$$;

grant select, insert on table
  public.event_registration,
  public.event_idempotency_receipt
to service_role;

create or replace function public.cmi_staff_register_event_attendee(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_branch_id uuid,
  p_idempotency_key uuid,
  p_digest_key_version smallint,
  p_request_digest_hex text,
  p_attendee_name text,
  p_attendee_phone text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_event public.event%rowtype;
  v_profile_id uuid;
  v_existing_digest bytea;
  v_existing_resource_id uuid;
  v_existing_status smallint;
  v_registration jsonb;
  v_registration_id uuid;
  v_registered_count integer;
  v_name text;
  v_phone text;
begin
  if p_actor_auth_user_id is null
     or p_event_id is null
     or p_branch_id is null
     or p_idempotency_key is null
     or p_digest_key_version is null
     or p_digest_key_version < 1
     or p_request_digest_hex is null
     or p_request_digest_hex !~ '^[0-9a-fA-F]{64}$'
     or p_attendee_name is null
     or pg_catalog.length(pg_catalog.btrim(p_attendee_name)) not between 2 and 180
     or (
       p_attendee_phone is not null
       and p_attendee_phone !~ '^[+][1-9][0-9]{7,14}

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;

     ) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF_REGISTRATION_INPUT';
  end if;

  v_name := pg_catalog.btrim(p_attendee_name);
  v_phone := case
    when p_attendee_phone is null or pg_catalog.btrim(p_attendee_phone) = ''
      then null
    else pg_catalog.btrim(p_attendee_phone)
  end;

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
    and receipt.operation = 'staff_registration'
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
      into v_registration
    from public.event_registration registration
    where registration.id = v_existing_resource_id
      and registration.event_id = p_event_id
      and registration.branch_id = p_branch_id;

    if v_registration is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'registration', v_registration,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status <> 'published'
     or v_event.visibility not in ('staff', 'private')
     or v_event.registration_state <> 'open'
     or v_event.starts_at <= pg_catalog.clock_timestamp()
     or v_event.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'EVENT_REGISTRATION_CLOSED';
  end if;

  if v_event.capacity is null then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REQUIRED';
  end if;

  select pg_catalog.count(*)::integer
    into v_registered_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  if v_registered_count >= v_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_CAPACITY_REACHED';
  end if;

  insert into public.event_registration (
    event_id,
    branch_id,
    contact_id,
    attendee_name_snapshot,
    attendee_phone_snapshot,
    attendee_email_snapshot,
    registration_source,
    status,
    client_request_id
  ) values (
    p_event_id,
    p_branch_id,
    null,
    v_name,
    v_phone,
    null,
    'staff',
    'registered',
    p_idempotency_key
  )
  returning id into v_registration_id;

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
    'staff_registration',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_registration',
    v_registration_id,
    201
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
    into v_registration
  from public.event_registration registration
  where registration.id = v_registration_id;

  return pg_catalog.jsonb_build_object(
    'registration', v_registration,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) to service_role;

comment on function public.cmi_staff_register_event_attendee(
  uuid, uuid, uuid, uuid, smallint, text, text, text
) is
  'Admin/Pastor branch-scoped staff registration only. Locks the event while checking finite capacity, persists a server-computed HMAC idempotency receipt atomically, and never creates or links a canonical contact. Public registration remains disabled.';

commit;
