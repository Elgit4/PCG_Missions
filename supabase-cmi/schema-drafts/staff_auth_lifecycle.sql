-- CMI staff authentication lifecycle.
-- This draft is validated only on the isolated local CMI stack.
-- The first administrator is provisioned through a one-time server-only
-- bootstrap function. The temporary password is generated at runtime, sent
-- only to the verified administrator mailbox, and never stored in Postgres.
-- Staff reset requests are private, rate-limited, admin-approved and audited.
begin;

alter table public.staff_profile
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_setup_expires_at timestamptz,
  add column if not exists password_changed_at timestamptz;

comment on column public.staff_profile.must_change_password is
  'When true, the staff-session projection withholds workspace access until a new password is set through the authenticated password lifecycle.';
comment on column public.staff_profile.password_setup_expires_at is
  'Expiry of the one-time bootstrap password window. Expired bootstrap sessions cannot access staff APIs.';
comment on column public.staff_profile.password_changed_at is
  'Timestamp of the most recent successful staff-initiated password setup or reset.';

create table private.staff_password_reset_request (
  id uuid primary key default gen_random_uuid(),
  target_profile_id uuid references public.staff_profile(id) on delete set null,
  branch_id uuid references public.branch(id) on delete set null,
  email_normalized text,
  email_fingerprint text not null check (email_fingerprint ~ '^[0-9a-f]{64}$'),
  ip_fingerprint text not null check (ip_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'approved', 'denied', 'completed', 'unmatched', 'expired')),
  notification_sent_at timestamptz,
  notification_attempts integer not null default 0 check (notification_attempts >= 0),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  reviewed_by_profile_id uuid references public.staff_profile(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or length(btrim(review_reason)) between 1 and 300),
  completed_at timestamptz,
  check (
    (status = 'unmatched' and target_profile_id is null and branch_id is null and email_normalized is null)
    or
    (status <> 'unmatched' and target_profile_id is not null and branch_id is not null and email_normalized is not null)
  ),
  check ((reviewed_by_profile_id is null) = (reviewed_at is null))
);

create index staff_password_reset_pending_branch_idx
  on private.staff_password_reset_request(branch_id, requested_at desc)
  where status = 'pending';
create index staff_password_reset_email_fingerprint_idx
  on private.staff_password_reset_request(email_fingerprint, requested_at desc);
create index staff_password_reset_ip_fingerprint_idx
  on private.staff_password_reset_request(ip_fingerprint, requested_at desc);
create index staff_password_reset_expiry_idx
  on private.staff_password_reset_request(expires_at)
  where status in ('pending', 'processing', 'approved');

alter table private.staff_password_reset_request enable row level security;
revoke all on table private.staff_password_reset_request from public, anon, authenticated, service_role;

create table private.staff_password_reset_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references private.staff_password_reset_request(id) on delete restrict,
  branch_id uuid references public.branch(id) on delete restrict,
  actor_profile_id uuid references public.staff_profile(id) on delete restrict,
  event_type text not null check (event_type in (
    'requested', 'notification_sent', 'notification_failed',
    'approved', 'denied', 'reset_completed', 'expired'
  )),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index staff_password_reset_audit_request_time_idx
  on private.staff_password_reset_audit(request_id, created_at);
alter table private.staff_password_reset_audit enable row level security;
revoke all on table private.staff_password_reset_audit from public, anon, authenticated, service_role;

create or replace function private.reject_staff_password_reset_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000', message = 'password reset audit is append-only';
end;
$$;
revoke all on function private.reject_staff_password_reset_audit_mutation() from public, anon, authenticated;
create trigger staff_password_reset_audit_no_update_delete
  before update or delete on private.staff_password_reset_audit
  for each row execute function private.reject_staff_password_reset_audit_mutation();
create trigger staff_password_reset_audit_no_truncate
  before truncate on private.staff_password_reset_audit
  for each statement execute function private.reject_staff_password_reset_audit_mutation();

insert into public.capability(code, description, sensitivity)
values (
  'staff.password_reset.manage',
  'Review staff password-reset requests and initiate a one-time recovery link.',
  'restricted'
)
on conflict (code) do update set
  description = excluded.description,
  sensitivity = excluded.sensitivity;

create or replace function public.cmi_bootstrap_first_admin(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_church_name text,
  p_branch_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_church_id uuid;
  v_branch_id uuid;
  v_profile_id uuid;
  v_role_id uuid;
begin
  if p_auth_user_id is null
     or length(btrim(coalesce(p_email, ''))) not between 6 and 254
     or p_email <> lower(btrim(p_email))
     or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(btrim(coalesce(p_full_name, ''))) not between 2 and 180
     or length(btrim(coalesce(p_church_name, ''))) not between 2 and 180
     or length(btrim(coalesce(p_branch_name, ''))) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'invalid bootstrap input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pcg_missions_first_admin_bootstrap', 0));

  if (select count(*) from auth.users) <> 1
     or not exists (select 1 from auth.users where id = p_auth_user_id)
     or exists (select 1 from public.staff_profile)
     or exists (select 1 from public.church)
     or exists (select 1 from public.branch) then
    raise exception using errcode = '55000', message = 'first-admin bootstrap is already used';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_auth_user_id
      and lower(u.email) = p_email
      and u.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'confirmed bootstrap Auth user required';
  end if;

  select id into v_role_id from public.role where code = 'admin_pastor' and is_active;
  if v_role_id is null then
    raise exception using errcode = '55000', message = 'Admin/Pastor role catalogue is unavailable';
  end if;

  if not exists (
    select 1 from public.capability
    where code = 'staff.password_reset.manage' and is_active
  ) then
    insert into public.capability(code, description, sensitivity)
    values (
      'staff.password_reset.manage',
      'Review staff password-reset requests and initiate a one-time recovery link.',
      'restricted'
    );
  end if;

  insert into public.church(name, timezone, is_configured_instance)
  values (btrim(p_church_name), 'Africa/Accra', true)
  returning id into v_church_id;

  insert into public.branch(church_id, name, timezone, is_active)
  values (v_church_id, btrim(p_branch_name), 'Africa/Accra', true)
  returning id into v_branch_id;

  insert into public.staff_profile(
    auth_user_id, full_name, email, account_status,
    must_change_password, password_setup_expires_at, password_changed_at
  )
  values (
    p_auth_user_id, btrim(p_full_name), p_email, 'active',
    true, pg_catalog.now() + interval '24 hours', null
  )
  returning id into v_profile_id;

  insert into public.staff_role_assignment(
    staff_profile_id, role_id, branch_id, assigned_by,
    starts_at, reason
  )
  values (
    v_profile_id, v_role_id, v_branch_id, v_profile_id,
    pg_catalog.now(), 'Initial one-time PCG Missions administrator bootstrap'
  );

  insert into public.role_capability(role_id, capability_id, scope_mode)
  select v_role_id, capability_id, 'branch'
  from public.capability
  where code = 'staff.password_reset.manage'
    and is_active
  on conflict do nothing;

  return pg_catalog.jsonb_build_object(
    'church_id', v_church_id,
    'branch_id', v_branch_id,
    'staff_profile_id', v_profile_id,
    'must_change_password', true
  );
end;
$$;

revoke all on function public.cmi_bootstrap_first_admin(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cmi_bootstrap_first_admin(uuid, text, text, text, text)
  to service_role;

create or replace function public.cmi_request_staff_password_reset(
  p_email text,
  p_email_fingerprint text,
  p_ip_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile public.staff_profile%rowtype;
  v_branch_id uuid;
  v_request_id uuid;
  v_admin_emails text[];
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if length(v_email) not between 6 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_email_fingerprint !~ '^[0-9a-f]{64}$'
     or p_ip_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid reset request';
  end if;

  -- Serialize requests by both account and source fingerprint so concurrent
  -- bursts cannot race past the hourly counters.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cmi-reset-email:' || p_email_fingerprint, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cmi-reset-ip:' || p_ip_fingerprint, 0)
  );

  if (
    select count(*) from private.staff_password_reset_request
    where email_fingerprint = p_email_fingerprint
      and requested_at > pg_catalog.now() - interval '1 hour'
  ) >= 4 or (
    select count(*) from private.staff_password_reset_request
    where ip_fingerprint = p_ip_fingerprint
      and requested_at > pg_catalog.now() - interval '1 hour'
  ) >= 12 then
    return pg_catalog.jsonb_build_object('accepted', true, 'rate_limited', true);
  end if;

  if exists (
    select 1 from private.staff_password_reset_request
    where email_fingerprint = p_email_fingerprint
      and requested_at > pg_catalog.now() - interval '2 minutes'
      and status in ('pending', 'processing')
  ) then
    return pg_catalog.jsonb_build_object('accepted', true, 'rate_limited', true);
  end if;

  select * into v_profile
  from public.staff_profile sp
  where lower(sp.email) = v_email
    and sp.account_status = 'active'
  limit 1;

  if v_profile.id is null then
    insert into private.staff_password_reset_request(
      email_fingerprint, ip_fingerprint, status
    )
    values (p_email_fingerprint, p_ip_fingerprint, 'unmatched')
    returning id into v_request_id;
    return pg_catalog.jsonb_build_object('accepted', true, 'matched', false);
  end if;

  select sra.branch_id into v_branch_id
  from public.staff_role_assignment sra
  join public.branch b on b.id = sra.branch_id and b.is_active
  where sra.staff_profile_id = v_profile.id
    and sra.starts_at <= pg_catalog.now()
    and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
    and sra.revoked_at is null
  order by sra.starts_at desc
  limit 1;

  if v_branch_id is null then
    insert into private.staff_password_reset_request(
      email_fingerprint, ip_fingerprint, status
    )
    values (p_email_fingerprint, p_ip_fingerprint, 'unmatched')
    returning id into v_request_id;
    return pg_catalog.jsonb_build_object('accepted', true, 'matched', false);
  end if;

  insert into private.staff_password_reset_request(
    target_profile_id, branch_id, email_normalized,
    email_fingerprint, ip_fingerprint, status
  )
  values (
    v_profile.id, v_branch_id, v_email,
    p_email_fingerprint, p_ip_fingerprint, 'pending'
  )
  returning id into v_request_id;

  select coalesce(array_agg(distinct admin_profile.email), array[]::text[])
  into v_admin_emails
  from public.staff_role_assignment admin_assignment
  join public.staff_profile admin_profile
    on admin_profile.id = admin_assignment.staff_profile_id
   and admin_profile.account_status = 'active'
   and not admin_profile.must_change_password
   and (admin_profile.password_setup_expires_at is null or admin_profile.password_setup_expires_at > pg_catalog.now())
  join public.role_capability rc
    on rc.role_id = admin_assignment.role_id
   and rc.scope_mode = 'branch'
  join public.capability cap
    on cap.id = rc.capability_id
   and cap.code = 'staff.password_reset.manage'
   and cap.is_active
  join public.role admin_role
    on admin_role.id = admin_assignment.role_id
   and admin_role.is_active
  where admin_assignment.branch_id = v_branch_id
    and admin_assignment.starts_at <= pg_catalog.now()
    and (admin_assignment.ends_at is null or admin_assignment.ends_at > pg_catalog.now())
    and admin_assignment.revoked_at is null
    and admin_profile.email is not null
    and lower(admin_profile.email) <> v_email;

  insert into private.staff_password_reset_audit(
    request_id, branch_id, actor_profile_id, event_type, metadata
  )
  values (
    v_request_id, v_branch_id, null, 'requested',
    pg_catalog.jsonb_build_object('notification_recipient_count', pg_catalog.cardinality(v_admin_emails))
  );

  return pg_catalog.jsonb_build_object(
    'accepted', true,
    'matched', true,
    'request_id', v_request_id,
    'branch_id', v_branch_id,
    'staff_name', v_profile.full_name,
    'staff_email', v_email,
    'admin_emails', v_admin_emails
  );
end;
$$;

create or replace function public.cmi_mark_staff_password_reset_notification(
  p_request_id uuid,
  p_sent boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update private.staff_password_reset_request
  set notification_attempts = notification_attempts + 1,
      notification_sent_at = case when p_sent then pg_catalog.now() else notification_sent_at end
  where id = p_request_id
    and status = 'pending';

  if p_sent then
    insert into private.staff_password_reset_audit(request_id, branch_id, event_type)
    select id, branch_id, 'notification_sent'
    from private.staff_password_reset_request
    where id = p_request_id;
  else
    insert into private.staff_password_reset_audit(request_id, branch_id, event_type, metadata)
    select id, branch_id, 'notification_failed', pg_catalog.jsonb_build_object('source', 'email_provider')
    from private.staff_password_reset_request
    where id = p_request_id;
  end if;
end;
$$;

create or replace function public.cmi_list_staff_password_reset_requests(
  p_actor_auth_user_id uuid,
  p_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_profile_id uuid;
  v_requests jsonb;
begin
  select sp.id into v_actor_profile_id
  from public.staff_profile sp
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active'
    and not sp.must_change_password
    and (sp.password_setup_expires_at is null or sp.password_setup_expires_at > pg_catalog.now());

  if v_actor_profile_id is null or not exists (
    select 1
    from public.staff_role_assignment sra
    join public.role r on r.id = sra.role_id and r.is_active
    join public.role_capability rc on rc.role_id = r.id and rc.scope_mode = 'branch'
    join public.capability cap on cap.id = rc.capability_id and cap.code = 'staff.password_reset.manage' and cap.is_active
    join public.branch b on b.id = sra.branch_id and b.is_active
    where sra.staff_profile_id = v_actor_profile_id
      and sra.branch_id = p_branch_id
      and sra.starts_at <= pg_catalog.now()
      and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
      and sra.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'password reset administration not authorized';
  end if;

  with expired_requests as (
    update private.staff_password_reset_request
    set status = 'expired'
    where branch_id = p_branch_id
      and status in ('pending', 'processing')
      and expires_at <= pg_catalog.now()
    returning id, branch_id
  )
  insert into private.staff_password_reset_audit(request_id, branch_id, event_type)
  select id, branch_id, 'expired'
  from expired_requests;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', req.id,
      'email', req.email_normalized,
      'full_name', target.full_name,
      'requested_at', req.requested_at,
      'expires_at', req.expires_at,
      'status', req.status
    ) order by req.requested_at desc
  ), '[]'::jsonb)
  into v_requests
  from private.staff_password_reset_request req
  join public.staff_profile target on target.id = req.target_profile_id
  where req.branch_id = p_branch_id
    and req.status in ('pending', 'processing')
    and req.expires_at > pg_catalog.now();

  return v_requests;
end;
$$;

create or replace function public.cmi_claim_staff_password_reset_request(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_profile_id uuid;
  v_request private.staff_password_reset_request%rowtype;
  v_target_auth_user_id uuid;
begin
  select id into v_actor_profile_id
  from public.staff_profile
  where auth_user_id = p_actor_auth_user_id
    and account_status = 'active'
    and not must_change_password
    and (password_setup_expires_at is null or password_setup_expires_at > pg_catalog.now());

  if v_actor_profile_id is null or not exists (
    select 1
    from public.staff_role_assignment sra
    join public.role r on r.id = sra.role_id and r.is_active
    join public.role_capability rc on rc.role_id = r.id and rc.scope_mode = 'branch'
    join public.capability cap on cap.id = rc.capability_id and cap.code = 'staff.password_reset.manage' and cap.is_active
    where sra.staff_profile_id = v_actor_profile_id
      and sra.branch_id = p_branch_id
      and sra.starts_at <= pg_catalog.now()
      and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
      and sra.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'password reset administration not authorized';
  end if;

  select * into v_request
  from private.staff_password_reset_request
  where id = p_request_id
    and branch_id = p_branch_id
    and status in ('pending', 'processing')
    and (
      status = 'pending'
      or reviewed_at < pg_catalog.now() - interval '10 minutes'
    )
    and expires_at > pg_catalog.now()
  for update;

  if v_request.id is null then
    raise exception using errcode = 'P0002', message = 'pending password reset request not found';
  end if;

  select sp.auth_user_id into v_target_auth_user_id
  from public.staff_profile sp
  join auth.users u
    on u.id = sp.auth_user_id
   and lower(u.email) = lower(sp.email)
   and u.email_confirmed_at is not null
  where sp.id = v_request.target_profile_id
    and sp.account_status = 'active'
    and lower(sp.email) = v_request.email_normalized;

  if v_target_auth_user_id is null then
    raise exception using errcode = 'P0002', message = 'active verified staff account not found';
  end if;

  if v_target_auth_user_id = p_actor_auth_user_id then
    raise exception using errcode = '42501', message = 'self-approval is not permitted';
  end if;

  update private.staff_password_reset_request
  set status = 'processing',
      reviewed_by_profile_id = v_actor_profile_id,
      reviewed_at = pg_catalog.now()
  where id = p_request_id;

  return pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'target_auth_user_id', v_target_auth_user_id,
    'target_email', v_request.email_normalized,
    'target_name', (select full_name from public.staff_profile where id = v_request.target_profile_id)
  );
end;
$$;

create or replace function public.cmi_finish_staff_password_reset_request(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_request_id uuid,
  p_action text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_profile_id uuid;
  v_target_profile_id uuid;
begin
  select id into v_actor_profile_id
  from public.staff_profile
  where auth_user_id = p_actor_auth_user_id
    and account_status = 'active'
    and not must_change_password
    and (password_setup_expires_at is null or password_setup_expires_at > pg_catalog.now());

  if v_actor_profile_id is null or not exists (
    select 1
    from public.staff_role_assignment sra
    join public.role r on r.id = sra.role_id and r.is_active
    join public.role_capability rc on rc.role_id = r.id and rc.scope_mode = 'branch'
    join public.capability cap on cap.id = rc.capability_id and cap.code = 'staff.password_reset.manage' and cap.is_active
    where sra.staff_profile_id = v_actor_profile_id
      and sra.branch_id = p_branch_id
      and sra.starts_at <= pg_catalog.now()
      and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
      and sra.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'password reset administration not authorized';
  end if;

  if p_action not in ('approved', 'denied', 'pending') then
    raise exception using errcode = '22023', message = 'invalid password reset action';
  end if;

  if exists (
    select 1
    from private.staff_password_reset_request request
    join public.staff_profile target on target.id = request.target_profile_id
    where request.id = p_request_id
      and request.branch_id = p_branch_id
      and target.auth_user_id = p_actor_auth_user_id
  ) then
    raise exception using errcode = '42501', message = 'self-review is not permitted';
  end if;

  update private.staff_password_reset_request
  set status = p_action,
      review_reason = nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''),
      reviewed_by_profile_id = case
        when p_action = 'pending' then reviewed_by_profile_id
        else v_actor_profile_id
      end,
      reviewed_at = case
        when p_action = 'pending' then reviewed_at
        else pg_catalog.now()
      end
  where id = p_request_id
    and branch_id = p_branch_id
    and status in ('processing', 'pending')
    and expires_at > pg_catalog.now()
  returning target_profile_id, expires_at
  into v_target_profile_id, v_request_expires_at;

  if v_target_profile_id is null then
    raise exception using errcode = 'P0002', message = 'password reset request not found';
  end if;

  if p_action = 'approved' then
    update public.staff_profile
    set must_change_password = true,
        password_setup_expires_at = v_request_expires_at
    where id = v_target_profile_id
      and account_status = 'active';
    if not found then
      raise exception using errcode = 'P0002', message = 'active staff profile not found';
    end if;
  end if;

  insert into private.staff_password_reset_audit(
    request_id, branch_id, actor_profile_id, event_type, metadata
  )
  values (
    p_request_id,
    p_branch_id,
    v_actor_profile_id,
    case when p_action = 'approved' then 'approved' when p_action = 'denied' then 'denied' else 'notification_failed' end,
    pg_catalog.jsonb_build_object('reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''))
  );
end;
$$;

create or replace function public.cmi_complete_staff_password_change(
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid;
begin
  update public.staff_profile sp
  set must_change_password = false,
      password_setup_expires_at = null,
      password_changed_at = pg_catalog.now()
  where sp.auth_user_id = p_auth_user_id
    and sp.account_status = 'active'
    and (
      sp.must_change_password
      or exists (
        select 1
        from private.staff_password_reset_request req
        where req.target_profile_id = sp.id
          and req.status = 'approved'
          and req.expires_at > pg_catalog.now()
      )
    )
  returning sp.id into v_profile_id;

  if v_profile_id is null then
    raise exception using errcode = 'P0002', message = 'active staff profile not found';
  end if;

  with completed_requests as (
    update private.staff_password_reset_request
    set status = 'completed', completed_at = pg_catalog.now()
    where target_profile_id = v_profile_id
      and status = 'approved'
    returning id, branch_id
  )
  insert into private.staff_password_reset_audit(
    request_id, branch_id, actor_profile_id, event_type
  )
  select id, branch_id, v_profile_id, 'reset_completed'
  from completed_requests;

  return pg_catalog.jsonb_build_object('must_change_password', false);
end;
$$;

revoke all on function public.cmi_request_staff_password_reset(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.cmi_mark_staff_password_reset_notification(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.cmi_list_staff_password_reset_requests(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cmi_claim_staff_password_reset_request(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cmi_finish_staff_password_reset_request(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.cmi_complete_staff_password_change(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.cmi_request_staff_password_reset(text, text, text) to service_role;
grant execute on function public.cmi_mark_staff_password_reset_notification(uuid, boolean) to service_role;
grant execute on function public.cmi_list_staff_password_reset_requests(uuid, uuid) to service_role;
grant execute on function public.cmi_claim_staff_password_reset_request(uuid, uuid, uuid) to service_role;
grant execute on function public.cmi_finish_staff_password_reset_request(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.cmi_complete_staff_password_change(uuid) to service_role;

commit;
