-- ChurchConnect authorization and history hardening
-- Applies after 20261107001300_churchconnect_rls_and_audit.sql.
-- Safe additive changes; no production data is assumed or inserted.

-- ---------------------------------------------------------------------------
-- 1. Directory visibility is a separate explicit permission.
-- Registration and attendance permissions alone must not expose the directory.
-- ---------------------------------------------------------------------------

drop policy if exists visitor_consents_read_permitted_scope on public.visitor_consents;

create policy visitor_consents_read_permitted_scope
  on public.visitor_consents for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
    or (select private.has_permission('VISITOR_DIRECTORY_VIEW'))
  );

-- ---------------------------------------------------------------------------
-- 2. Sensitive access grants are revocable history, with one active grant.
-- Administrators may receive sensitive capabilities but not ordinary member
-- capabilities. Mission Members may receive approved capabilities as usual.
-- ---------------------------------------------------------------------------

alter table public.faith_commitment_access
  drop constraint if exists faith_commitment_access_user_event_unique;

alter table public.prayer_request_access
  drop constraint if exists prayer_access_user_request_unique;

create unique index if not exists faith_commitment_access_one_active_idx
  on public.faith_commitment_access(commitment_event_id, user_id)
  where revoked_at is null;

create unique index if not exists prayer_request_access_one_active_idx
  on public.prayer_request_access(prayer_request_id, user_id)
  where revoked_at is null;

create or replace function private.enforce_permission_grant_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_code text;
  v_is_sensitive boolean;
begin
  select up.role_code, pc.is_sensitive
    into v_role_code, v_is_sensitive
  from public.user_profiles up
  join public.permission_catalog pc
    on pc.permission_code = new.permission_code
  where up.user_id = new.user_id
    and up.account_status = 'ACTIVE';

  if not found then
    raise exception 'Permission target must be an active application account'
      using errcode = '23514';
  end if;

  if v_role_code = 'MISSION_MEMBER' then
    return new;
  end if;

  if v_role_code = 'ADMIN' and v_is_sensitive then
    return new;
  end if;

  raise exception 'Administrators may receive only explicitly designated sensitive capabilities'
    using errcode = '23514';
end;
$$;

revoke all on function private.enforce_permission_grant_target()
  from public, anon, authenticated;

drop trigger if exists permission_grants_target_mission_member
  on public.user_permission_grants;

create trigger permission_grants_valid_target
  before insert or update of user_id, permission_code
  on public.user_permission_grants
  for each row
  execute function private.enforce_permission_grant_target();

-- A specific pastoral record can be granted only to an active application
-- account. The actor must be an Administrator or the creator granting access
-- to their own newly-created record (the existing creator-access trigger).
create or replace function private.enforce_sensitive_access_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_active boolean;
  v_actor_admin boolean;
begin
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = new.user_id
      and up.account_status = 'ACTIVE'
  ) into v_target_active;

  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = new.granted_by_user_id
      and up.account_status = 'ACTIVE'
      and up.role_code = 'ADMIN'
  ) into v_actor_admin;

  if not v_target_active then
    raise exception 'Sensitive access target must be an active application account'
      using errcode = '23514';
  end if;

  if not v_actor_admin and new.granted_by_user_id <> new.user_id then
    raise exception 'Only an Administrator or the record creator may create a sensitive access grant'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_sensitive_access_grant()
  from public, anon, authenticated;

create trigger prayer_request_access_validate_grant
  before insert or update of user_id, granted_by_user_id
  on public.prayer_request_access
  for each row
  execute function private.enforce_sensitive_access_grant();

create trigger faith_commitment_access_validate_grant
  before insert or update of user_id, granted_by_user_id
  on public.faith_commitment_access
  for each row
  execute function private.enforce_sensitive_access_grant();

-- The creator grant trigger must infer the revocable partial unique indexes by
-- including their predicates in ON CONFLICT targets.
create or replace function private.grant_sensitive_record_creator_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  if tg_table_name = 'prayer_requests' then
    insert into public.prayer_request_access (
      prayer_request_id, user_id, granted_by_user_id
    )
    values (new.prayer_request_id, new.created_by_user_id, new.created_by_user_id)
    on conflict (prayer_request_id, user_id)
      where revoked_at is null
      do nothing;
  elsif tg_table_name = 'faith_commitment_events' then
    insert into public.faith_commitment_access (
      commitment_event_id, user_id, granted_by_user_id
    )
    values (new.commitment_event_id, new.recorded_by_user_id, new.recorded_by_user_id)
    on conflict (commitment_event_id, user_id)
      where revoked_at is null
      do nothing;
  end if;
  return new;
end;
$;

revoke all on function private.grant_sensitive_record_creator_access()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Integration-stage history records both sides of a transition, including
-- an explicit transition back to no current stage.
-- ---------------------------------------------------------------------------

alter table public.visitor_stage_history
  add column if not exists previous_integration_stage_id uuid
    references public.integration_stages(integration_stage_id) on delete restrict;

alter table public.visitor_stage_history
  alter column integration_stage_id drop not null;

create or replace function private.capture_visitor_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_integration_stage_id is distinct from old.current_integration_stage_id then
    insert into public.visitor_stage_history (
      visitor_id,
      previous_integration_stage_id,
      integration_stage_id,
      changed_by_user_id,
      changed_at
    )
    values (
      new.visitor_id,
      old.current_integration_stage_id,
      new.current_integration_stage_id,
      coalesce((select auth.uid()), new.updated_by_user_id),
      now()
    );
  end if;

  return new;
end;
$$;

revoke all on function private.capture_visitor_stage_change()
  from public, anon, authenticated;

-- Existing trigger continues to call the replaced function.

comment on column public.visitor_stage_history.previous_integration_stage_id is
  'Stage before the transition; null indicates that the visitor previously had no stage.';

comment on column public.visitor_stage_history.integration_stage_id is
  'Stage after the transition; null indicates that the current stage was cleared.';
