-- Admin/Pastor branch-scoped event closeout with segregated review.
-- Counts are calculated from the event ledger; transport fields remain unused.
begin;

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'branch'
from public.role r
join public.capability c
  on c.code in ('event.closeout.submit', 'event.closeout.review')
where r.code = 'admin_pastor'
  and c.is_active
on conflict do nothing;

do $$
declare
  submit_grants integer;
  review_grants integer;
begin
  select count(*)::integer
    into submit_grants
  from public.role_capability rc
  join public.role r on r.id = rc.role_id
  join public.capability c on c.id = rc.capability_id
  where r.code = 'admin_pastor'
    and c.code = 'event.closeout.submit'
    and c.is_active
    and rc.scope_mode = 'branch';

  select count(*)::integer
    into review_grants
  from public.role_capability rc
  join public.role r on r.id = rc.role_id
  join public.capability c on c.id = rc.capability_id
  where r.code = 'admin_pastor'
    and c.code = 'event.closeout.review'
    and c.is_active
    and rc.scope_mode = 'branch';

  if submit_grants <> 1 or review_grants <> 1 then
    raise exception 'Expected one Admin/Pastor branch closeout submit/review grant, found submit %, review %',
      submit_grants, review_grants;
  end if;
end;
$$;

grant select, insert, update on table public.event_closeout to service_role;
grant select, insert on table public.event_closeout_event to service_role;
grant select, insert on table public.event_idempotency_receipt to service_role;

create or replace function public.cmi_staff_submit_event_closeout(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_branch_id uuid,
  p_idempotency_key uuid,
  p_digest_key_version smallint,
  p_request_digest_hex text,
  p_summary_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_event public.event%rowtype;
  v_closeout public.event_closeout%rowtype;
  v_profile_id uuid;
  v_existing_digest bytea;
  v_existing_resource_id uuid;
  v_existing_status smallint;
  v_registration_count integer;
  v_attendee_count integer;
  v_notes text;
  v_closeout_json jsonb;
begin
  if p_actor_auth_user_id is null
     or p_event_id is null
     or p_branch_id is null
     or p_idempotency_key is null
     or p_digest_key_version is null
     or p_digest_key_version < 1
     or p_request_digest_hex is null
     or p_request_digest_hex !~ '^[0-9a-fA-F]{64}$'
     or (
       p_summary_notes is not null
       and pg_catalog.length(pg_catalog.btrim(p_summary_notes)) > 4000
     ) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_CLOSEOUT_INPUT';
  end if;

  v_notes := nullif(pg_catalog.btrim(p_summary_notes), '');

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
   and cap.code = 'event.closeout.submit'
   and cap.is_active
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active'
    and not sp.must_change_password
  limit 1;

  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'EVENT_CLOSEOUT_SUBMIT_NOT_AUTHORIZED';
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
    and receipt.operation = 'closeout_submit'
    and receipt.caller_class = 'staff'
    and receipt.actor_user_id = p_actor_auth_user_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_digest <> pg_catalog.decode(p_request_digest_hex, 'hex') then
      raise exception using errcode = '23505', message = 'EVENT_IDEMPOTENCY_KEY_REUSED';
    end if;

    select pg_catalog.jsonb_build_object(
      'id', closeout.id,
      'event_id', closeout.event_id,
      'branch_id', closeout.branch_id,
      'submitted_by', closeout.submitted_by,
      'submitted_at', closeout.submitted_at,
      'reviewed_by', closeout.reviewed_by,
      'reviewed_at', closeout.reviewed_at,
      'status', closeout.status,
      'attendee_count', closeout.attendee_count,
      'registration_count', closeout.registration_count,
      'transport_seat_count', closeout.transport_seat_count,
      'summary_notes', closeout.summary_notes
    )
      into v_closeout_json
    from public.event_closeout closeout
    where closeout.id = v_existing_resource_id
      and closeout.event_id = p_event_id
      and closeout.branch_id = p_branch_id;

    if v_closeout_json is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'closeout', v_closeout_json,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  if v_event.status not in ('published', 'completed')
     or v_event.ends_at > pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_CLOSEOUT_NOT_READY';
  end if;

  select pg_catalog.count(*)::integer
    into v_registration_count
  from public.event_registration registration
  where registration.event_id = p_event_id
    and registration.branch_id = p_branch_id
    and registration.status <> 'cancelled';

  select pg_catalog.count(*)::integer
    into v_attendee_count
  from public.event_checkin checkin
  where checkin.event_id = p_event_id
    and checkin.branch_id = p_branch_id;

  select closeout.*
    into v_closeout
  from public.event_closeout closeout
  where closeout.event_id = p_event_id
    and closeout.branch_id = p_branch_id
  for update;

  if found then
    if v_closeout.status not in ('draft', 'returned') then
      raise exception using errcode = 'P0001', message = 'EVENT_CLOSEOUT_ALREADY_SUBMITTED';
    end if;

    update public.event_closeout
       set submitted_by = p_actor_auth_user_id,
           submitted_at = pg_catalog.clock_timestamp(),
           reviewed_by = null,
           reviewed_at = null,
           status = 'submitted',
           attendee_count = v_attendee_count,
           registration_count = v_registration_count,
           transport_seat_count = null,
           summary_notes = v_notes,
           updated_at = pg_catalog.clock_timestamp()
     where id = v_closeout.id
    returning * into v_closeout;
  else
    insert into public.event_closeout (
      event_id,
      branch_id,
      submitted_by,
      status,
      attendee_count,
      registration_count,
      transport_seat_count,
      summary_notes
    ) values (
      p_event_id,
      p_branch_id,
      p_actor_auth_user_id,
      'submitted',
      v_attendee_count,
      v_registration_count,
      null,
      v_notes
    )
    returning * into v_closeout;
  end if;

  if v_event.status <> 'completed' then
    update public.event
       set status = 'completed'
     where id = p_event_id
       and branch_id = p_branch_id
       and status = 'published';
  end if;

  insert into public.event_closeout_event (
    closeout_id,
    actor_user_id,
    action,
    details
  ) values (
    v_closeout.id,
    p_actor_auth_user_id,
    'submitted',
    pg_catalog.jsonb_build_object(
      'registration_count', v_registration_count,
      'attendee_count', v_attendee_count,
      'transport_seat_count', null
    )
  );

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
    'closeout_submit',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_closeout',
    v_closeout.id,
    201
  );

  select pg_catalog.jsonb_build_object(
    'id', closeout.id,
    'event_id', closeout.event_id,
    'branch_id', closeout.branch_id,
    'submitted_by', closeout.submitted_by,
    'submitted_at', closeout.submitted_at,
    'reviewed_by', closeout.reviewed_by,
    'reviewed_at', closeout.reviewed_at,
    'status', closeout.status,
    'attendee_count', closeout.attendee_count,
    'registration_count', closeout.registration_count,
    'transport_seat_count', closeout.transport_seat_count,
    'summary_notes', closeout.summary_notes
  )
    into v_closeout_json
  from public.event_closeout closeout
  where closeout.id = v_closeout.id;

  return pg_catalog.jsonb_build_object(
    'closeout', v_closeout_json,
    'replayed', false,
    'response_status', 201
  );
end;
$$;

revoke all on function public.cmi_staff_submit_event_closeout(
  uuid, uuid, uuid, uuid, smallint, text, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_submit_event_closeout(
  uuid, uuid, uuid, uuid, smallint, text, text
) to service_role;

create or replace function public.cmi_staff_review_event_closeout(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_branch_id uuid,
  p_closeout_id uuid,
  p_decision text,
  p_reason text,
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
  v_closeout public.event_closeout%rowtype;
  v_profile_id uuid;
  v_existing_digest bytea;
  v_existing_resource_id uuid;
  v_existing_status smallint;
  v_reason text;
  v_closeout_json jsonb;
begin
  if p_actor_auth_user_id is null
     or p_event_id is null
     or p_branch_id is null
     or p_closeout_id is null
     or p_decision not in ('approved', 'returned')
     or p_idempotency_key is null
     or p_digest_key_version is null
     or p_digest_key_version < 1
     or p_request_digest_hex is null
     or p_request_digest_hex !~ '^[0-9a-fA-F]{64}$'
     or (
       p_reason is not null
       and pg_catalog.length(pg_catalog.btrim(p_reason)) > 2000
     )
     or (
       p_decision = 'returned'
       and pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) < 2
     ) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_CLOSEOUT_REVIEW_INPUT';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');

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
   and cap.code = 'event.closeout.review'
   and cap.is_active
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active'
    and not sp.must_change_password
  limit 1;

  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'EVENT_CLOSEOUT_REVIEW_NOT_AUTHORIZED';
  end if;

  select receipt.request_digest,
         receipt.resource_id,
         receipt.response_status
    into v_existing_digest, v_existing_resource_id, v_existing_status
  from public.event_idempotency_receipt receipt
  where receipt.event_id = p_event_id
    and receipt.branch_id = p_branch_id
    and receipt.operation = 'closeout_review'
    and receipt.caller_class = 'staff'
    and receipt.actor_user_id = p_actor_auth_user_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_digest <> pg_catalog.decode(p_request_digest_hex, 'hex') then
      raise exception using errcode = '23505', message = 'EVENT_IDEMPOTENCY_KEY_REUSED';
    end if;

    select pg_catalog.jsonb_build_object(
      'id', closeout.id,
      'event_id', closeout.event_id,
      'branch_id', closeout.branch_id,
      'submitted_by', closeout.submitted_by,
      'submitted_at', closeout.submitted_at,
      'reviewed_by', closeout.reviewed_by,
      'reviewed_at', closeout.reviewed_at,
      'status', closeout.status,
      'attendee_count', closeout.attendee_count,
      'registration_count', closeout.registration_count,
      'transport_seat_count', closeout.transport_seat_count,
      'summary_notes', closeout.summary_notes
    )
      into v_closeout_json
    from public.event_closeout closeout
    where closeout.id = v_existing_resource_id
      and closeout.event_id = p_event_id
      and closeout.branch_id = p_branch_id;

    if v_closeout_json is null then
      raise exception using errcode = 'P0001', message = 'EVENT_IDEMPOTENCY_RESOURCE_MISSING';
    end if;

    return pg_catalog.jsonb_build_object(
      'closeout', v_closeout_json,
      'replayed', true,
      'response_status', v_existing_status
    );
  end if;

  select closeout.*
    into v_closeout
  from public.event_closeout closeout
  where closeout.id = p_closeout_id
    and closeout.event_id = p_event_id
    and closeout.branch_id = p_branch_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'EVENT_CLOSEOUT_NOT_FOUND';
  end if;

  if v_closeout.submitted_by = p_actor_auth_user_id then
    raise exception using errcode = '42501', message = 'EVENT_CLOSEOUT_SELF_REVIEW';
  end if;

  if v_closeout.status <> 'submitted' then
    raise exception using errcode = 'P0001', message = 'EVENT_CLOSEOUT_NOT_REVIEWABLE';
  end if;

  update public.event_closeout
     set status = p_decision,
         reviewed_by = p_actor_auth_user_id,
         reviewed_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = p_closeout_id
     and event_id = p_event_id
     and branch_id = p_branch_id
     and status = 'submitted'
  returning * into v_closeout;

  if not found then
    raise exception using errcode = '40001', message = 'EVENT_CLOSEOUT_CHANGED';
  end if;

  insert into public.event_closeout_event (
    closeout_id,
    actor_user_id,
    action,
    details
  ) values (
    v_closeout.id,
    p_actor_auth_user_id,
    p_decision,
    pg_catalog.jsonb_build_object('reason', v_reason)
  );

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
    'closeout_review',
    'staff',
    p_actor_auth_user_id,
    p_idempotency_key,
    p_digest_key_version,
    pg_catalog.decode(p_request_digest_hex, 'hex'),
    'event_closeout',
    v_closeout.id,
    200
  );

  select pg_catalog.jsonb_build_object(
    'id', closeout.id,
    'event_id', closeout.event_id,
    'branch_id', closeout.branch_id,
    'submitted_by', closeout.submitted_by,
    'submitted_at', closeout.submitted_at,
    'reviewed_by', closeout.reviewed_by,
    'reviewed_at', closeout.reviewed_at,
    'status', closeout.status,
    'attendee_count', closeout.attendee_count,
    'registration_count', closeout.registration_count,
    'transport_seat_count', closeout.transport_seat_count,
    'summary_notes', closeout.summary_notes
  )
    into v_closeout_json
  from public.event_closeout closeout
  where closeout.id = v_closeout.id;

  return pg_catalog.jsonb_build_object(
    'closeout', v_closeout_json,
    'replayed', false,
    'response_status', 200
  );
end;
$$;

revoke all on function public.cmi_staff_review_event_closeout(
  uuid, uuid, uuid, uuid, text, text, uuid, smallint, text
) from public, anon, authenticated;
grant execute on function public.cmi_staff_review_event_closeout(
  uuid, uuid, uuid, uuid, text, text, uuid, smallint, text
) to service_role;

comment on function public.cmi_staff_submit_event_closeout(
  uuid, uuid, uuid, uuid, smallint, text, text
) is
  'Admin/Pastor branch-scoped closeout submission. Requires an ended event, computes registration and staff check-in counts in the transaction, sets the event complete, retains append-only history and records an idempotency receipt. Transport counts remain null.';

comment on function public.cmi_staff_review_event_closeout(
  uuid, uuid, uuid, uuid, text, text, uuid, smallint, text
) is
  'Admin/Pastor branch-scoped closeout review. The submitter cannot self-review. Approval/return, review history and the idempotency receipt commit atomically.';

commit;
