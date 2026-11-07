-- ChurchConnect row-level security, least-privilege grants and safe audit events.
-- Apply only after 20261107001200_churchconnect_core_schema.sql.
-- No anon access. Browser operations use the authenticated role and RLS.
-- Privileged provisioning, handover, workflow scheduling, SMS and sensitive access
-- grants must be executed by trusted server-side functions, never by frontend secrets.

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

create or replace function private.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = (select auth.uid())
      and up.account_status = 'ACTIVE'
  );
$$;

create or replace function private.current_user_is_provisioned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = (select auth.uid())
      and up.account_status in ('ACTIVE', 'INVITED')
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = (select auth.uid())
      and up.account_status = 'ACTIVE'
      and up.role_code = 'ADMIN'
  );
$$;

create or replace function private.has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.user_permission_grants g
      on g.user_id = up.user_id
     and g.grant_status = 'ACTIVE'
    join public.permission_catalog pc
      on pc.permission_code = g.permission_code
    where up.user_id = (select auth.uid())
      and up.account_status = 'ACTIVE'
      and pc.permission_code = p_permission_code
  );
$$;

create or replace function private.can_access_visitor(p_visitor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.current_user_is_active()
    and (
      private.is_admin()
      or exists (
        select 1
        from public.assignments a
        where a.visitor_id = p_visitor_id
          and a.assignment_status = 'ACTIVE'
          and a.ended_at is null
          and (
            a.primary_user_id = (select auth.uid())
            or exists (
              select 1
              from public.assignment_collaborators ac
              where ac.assignment_id = a.assignment_id
                and ac.user_id = (select auth.uid())
                and ac.collaborator_status = 'ACTIVE'
                and ac.removed_at is null
            )
          )
      )
      -- A former owner retains narrowly scoped visitor access while an
      -- explicitly retained open task remains assigned to them.
      or exists (
        select 1
        from public.follow_up_tasks t
        where t.visitor_id = p_visitor_id
          and t.assigned_user_id = (select auth.uid())
          and t.task_status in ('PENDING', 'DUE', 'IN_PROGRESS', 'RESCHEDULED')
      )
      -- The person who registered a visitor retains access while that profile
      -- remains unassigned. Registration capability never grants directory-wide
      -- read access.
      or exists (
        select 1
        from public.visitors v
        where v.visitor_id = p_visitor_id
          and v.created_by_user_id = (select auth.uid())
          and not exists (
            select 1
            from public.assignments a2
            where a2.visitor_id = v.visitor_id
              and a2.assignment_status = 'ACTIVE'
              and a2.ended_at is null
          )
      )
    );
$$;

create or replace function private.can_access_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.current_user_is_active()
    and (
      private.is_admin()
      or exists (
        select 1
        from public.assignments a
        where a.assignment_id = p_assignment_id
          and a.assignment_status = 'ACTIVE'
          and a.ended_at is null
          and (
            a.primary_user_id = (select auth.uid())
            or exists (
              select 1
              from public.assignment_collaborators ac
              where ac.assignment_id = a.assignment_id
                and ac.user_id = (select auth.uid())
                and ac.collaborator_status = 'ACTIVE'
                and ac.removed_at is null
            )
          )
      )
      or exists (
        select 1
        from public.follow_up_tasks t
        where t.assignment_id = p_assignment_id
          and t.assigned_user_id = (select auth.uid())
          and t.task_status in ('PENDING', 'DUE', 'IN_PROGRESS', 'RESCHEDULED')
      )
    );
$$;

create or replace function private.can_view_prayer_request(p_prayer_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.current_user_is_active()
    and private.has_permission('PASTORAL_VIEW')
    and exists (
      select 1
      from public.prayer_requests pr
      join public.prayer_request_access pra
        on pra.prayer_request_id = pr.prayer_request_id
      where pr.prayer_request_id = p_prayer_request_id
        and pra.user_id = (select auth.uid())
        and pra.revoked_at is null
        and private.can_access_visitor(pr.visitor_id)
    );
$$;

create or replace function private.can_view_faith_commitment(p_commitment_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.current_user_is_active()
    and private.has_permission('PASTORAL_VIEW')
    and exists (
      select 1
      from public.faith_commitment_events fce
      join public.faith_commitment_access fca
        on fca.commitment_event_id = fce.commitment_event_id
      where fce.commitment_event_id = p_commitment_event_id
        and fca.user_id = (select auth.uid())
        and fca.revoked_at is null
        and private.can_access_visitor(fce.visitor_id)
    );
$$;

-- SECURITY DEFINER is intentionally confined to the unexposed private schema.
-- Every function pins an empty search_path and schema-qualifies its references.
revoke all on function private.current_user_is_active() from public, anon, authenticated;
revoke all on function private.current_user_is_provisioned() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.has_permission(text) from public, anon, authenticated;
revoke all on function private.can_access_visitor(uuid) from public, anon, authenticated;
revoke all on function private.can_access_assignment(uuid) from public, anon, authenticated;
revoke all on function private.can_view_prayer_request(uuid) from public, anon, authenticated;
revoke all on function private.can_view_faith_commitment(uuid) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.current_user_is_provisioned() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.can_access_visitor(uuid) to authenticated;
grant execute on function private.can_access_assignment(uuid) to authenticated;
grant execute on function private.can_view_prayer_request(uuid) to authenticated;
grant execute on function private.can_view_faith_commitment(uuid) to authenticated;


-- Validate referenced application users on privileged assignment/configuration
-- rows. The frontend cannot choose an arbitrary active user or third role.
create or replace function private.enforce_profile_role_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_required_role text;
begin
  v_user_id := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_required_role := tg_argv[1];

  if v_user_id is null or not exists (
    select 1
    from public.user_profiles up
    where up.user_id = v_user_id
      and up.role_code = v_required_role
      and up.account_status = 'ACTIVE'
  ) then
    raise exception 'Referenced user must be an active % account', v_required_role
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_profile_role_reference() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Safe audit trigger. It logs changed field names, never the values themselves.
-- Sensitive text, phone numbers, emails, tokens and message bodies are excluded.
-- ---------------------------------------------------------------------------

create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_target_id text;
  v_changed_fields text[];
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_target_id := v_new ->> tg_argv[0];
    select coalesce(array_agg(k order by k), array[]::text[])
      into v_changed_fields
    from jsonb_object_keys(v_new) as keys(k)
    where k not in ('note_body', 'request_text', 'restricted_summary',
                    'message_body', 'message_body_snapshot',
                    'recipient_phone_snapshot', 'normalized_phone',
                    'email_address', 'contact_email', 'phone_number',
                    'failure_message', 'safe_metadata');
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_target_id := v_new ->> tg_argv[0];
    select coalesce(array_agg(n.key order by n.key), array[]::text[])
      into v_changed_fields
    from jsonb_each(v_new) as n(key, value)
    where (v_old -> n.key) is distinct from n.value
      and n.key not in ('note_body', 'request_text', 'restricted_summary',
                        'message_body', 'message_body_snapshot',
                        'recipient_phone_snapshot', 'normalized_phone',
                        'email_address', 'contact_email', 'phone_number',
                        'failure_message', 'safe_metadata');
  else
    v_old := to_jsonb(old);
    v_target_id := v_old ->> tg_argv[0];
    v_changed_fields := array[]::text[];
  end if;

  v_action := tg_table_name || '.' || lower(tg_op);

  insert into public.audit_logs (
    actor_user_id,
    action_code,
    target_entity,
    target_record_id,
    occurred_at,
    safe_metadata
  )
  values (
    (select auth.uid()),
    v_action,
    tg_table_name,
    v_target_id,
    now(),
    jsonb_build_object('changed_fields', to_jsonb(v_changed_fields))
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_audit_event() from public, anon, authenticated;

create trigger audit_user_permission_grants
  after insert or update on public.user_permission_grants
  for each row execute function private.capture_audit_event('grant_id');
create trigger audit_visitors
  after insert or update on public.visitors
  for each row execute function private.capture_audit_event('visitor_id');
create trigger audit_visitor_visits
  after insert on public.visitor_visits
  for each row execute function private.capture_audit_event('visit_id');
create trigger audit_visitor_consents
  after insert on public.visitor_consents
  for each row execute function private.capture_audit_event('consent_id');
create trigger audit_faith_commitment_events
  after insert on public.faith_commitment_events
  for each row execute function private.capture_audit_event('commitment_event_id');
create trigger audit_prayer_requests
  after insert or update on public.prayer_requests
  for each row execute function private.capture_audit_event('prayer_request_id');
create trigger audit_assignments
  after insert or update on public.assignments
  for each row execute function private.capture_audit_event('assignment_id');
create trigger audit_assignment_collaborators
  after insert or update on public.assignment_collaborators
  for each row execute function private.capture_audit_event('collaborator_id');
create trigger audit_assignment_history
  after insert on public.assignment_history
  for each row execute function private.capture_audit_event('assignment_history_id');
create trigger audit_follow_up_tasks
  after insert or update on public.follow_up_tasks
  for each row execute function private.capture_audit_event('task_id');
create trigger audit_follow_up_records
  after insert on public.follow_up_records
  for each row execute function private.capture_audit_event('follow_up_record_id');
create trigger audit_team_notes
  after insert or update on public.team_notes
  for each row execute function private.capture_audit_event('team_note_id');
create trigger audit_sms_templates
  after insert or update on public.sms_templates
  for each row execute function private.capture_audit_event('sms_template_id');
create trigger audit_sms_messages
  after insert or update on public.sms_messages
  for each row execute function private.capture_audit_event('sms_message_id');
create trigger audit_sms_delivery_events
  after insert on public.sms_delivery_events
  for each row execute function private.capture_audit_event('delivery_event_id');
create trigger audit_visitor_stage_history
  after insert on public.visitor_stage_history
  for each row execute function private.capture_audit_event('stage_history_id');
create trigger audit_program_enrolments
  after insert or update on public.program_enrolments
  for each row execute function private.capture_audit_event('enrolment_id');
create trigger audit_program_attendance
  after insert on public.program_attendance
  for each row execute function private.capture_audit_event('program_attendance_id');
create trigger audit_system_settings
  after insert or update on public.system_settings
  for each row execute function private.capture_audit_event('setting_id');


-- Follow-up task history is an append-only operational event stream. It records
-- creation, rescheduling, status changes, cancellation and reassignment.
create or replace function private.capture_follow_up_task_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change_type text;
begin
  if tg_op = 'INSERT' then
    insert into public.follow_up_task_history (
      task_id, actor_user_id, change_type,
      old_assigned_user_id, new_assigned_user_id,
      old_due_at, new_due_at, old_status, new_status, change_reason
    )
    values (
      new.task_id, (select auth.uid()), 'CREATED',
      null, new.assigned_user_id,
      null, new.due_at, null, new.task_status, new.cancellation_reason
    );
    return new;
  end if;

  if old.assigned_user_id is distinct from new.assigned_user_id then
    v_change_type := 'REASSIGNED';
  elsif new.task_status = 'CANCELLED'
        and old.task_status is distinct from new.task_status then
    v_change_type := 'CANCELLED';
  elsif old.due_at is distinct from new.due_at
        or (new.task_status = 'RESCHEDULED'
            and old.task_status is distinct from new.task_status) then
    v_change_type := 'RESCHEDULED';
  elsif old.task_status is distinct from new.task_status then
    v_change_type := 'STATUS_CHANGED';
  else
    return new;
  end if;

  insert into public.follow_up_task_history (
    task_id, actor_user_id, change_type,
    old_assigned_user_id, new_assigned_user_id,
    old_due_at, new_due_at, old_status, new_status, change_reason
  )
  values (
    new.task_id, (select auth.uid()), v_change_type,
    old.assigned_user_id, new.assigned_user_id,
    old.due_at, new.due_at, old.task_status, new.task_status,
    case when new.task_status = 'CANCELLED' then new.cancellation_reason else null end
  );

  return new;
end;
$$;

revoke all on function private.capture_follow_up_task_history() from public, anon, authenticated;

create trigger follow_up_task_history_capture
  after insert or update of assigned_user_id, due_at, task_status
  on public.follow_up_tasks
  for each row execute function private.capture_follow_up_task_history();



-- Enforce exactly the intended account type at the database boundary.
create trigger permission_grants_target_mission_member
  before insert or update of user_id on public.user_permission_grants
  for each row execute function private.enforce_profile_role_reference('user_id', 'MISSION_MEMBER');
create trigger permission_grants_actor_admin
  before insert or update of granted_by_user_id on public.user_permission_grants
  for each row execute function private.enforce_profile_role_reference('granted_by_user_id', 'ADMIN');

create trigger assignments_primary_mission_member
  before insert or update of primary_user_id on public.assignments
  for each row execute function private.enforce_profile_role_reference('primary_user_id', 'MISSION_MEMBER');
create trigger assignments_actor_admin
  before insert or update of assigned_by_user_id on public.assignments
  for each row execute function private.enforce_profile_role_reference('assigned_by_user_id', 'ADMIN');

create trigger collaborators_target_mission_member
  before insert or update of user_id on public.assignment_collaborators
  for each row execute function private.enforce_profile_role_reference('user_id', 'MISSION_MEMBER');
create trigger collaborators_actor_admin
  before insert or update of added_by_user_id on public.assignment_collaborators
  for each row execute function private.enforce_profile_role_reference('added_by_user_id', 'ADMIN');

create trigger assignment_history_actor_admin
  before insert or update of actor_user_id on public.assignment_history
  for each row execute function private.enforce_profile_role_reference('actor_user_id', 'ADMIN');

create trigger follow_up_task_assignee_mission_member
  before insert or update of assigned_user_id on public.follow_up_tasks
  for each row execute function private.enforce_profile_role_reference('assigned_user_id', 'MISSION_MEMBER');

create trigger sms_templates_creator_admin
  before insert or update of created_by_user_id on public.sms_templates
  for each row execute function private.enforce_profile_role_reference('created_by_user_id', 'ADMIN');
create trigger sms_templates_approver_admin
  before insert or update of approved_by_user_id on public.sms_templates
  for each row when (new.approved_by_user_id is not null)
  execute function private.enforce_profile_role_reference('approved_by_user_id', 'ADMIN');

create trigger workflows_creator_admin
  before insert or update of created_by_user_id on public.follow_up_workflows
  for each row execute function private.enforce_profile_role_reference('created_by_user_id', 'ADMIN');
create trigger workflows_approver_admin
  before insert or update of approved_by_user_id on public.follow_up_workflows
  for each row when (new.approved_by_user_id is not null)
  execute function private.enforce_profile_role_reference('approved_by_user_id', 'ADMIN');

create trigger integration_programs_creator_admin
  before insert or update of created_by_user_id on public.integration_programs
  for each row execute function private.enforce_profile_role_reference('created_by_user_id', 'ADMIN');

create trigger system_settings_editor_admin
  before insert or update of updated_by_user_id on public.system_settings
  for each row when (new.updated_by_user_id is not null)
  execute function private.enforce_profile_role_reference('updated_by_user_id', 'ADMIN');

-- Sensitive creators receive a record-specific grant to their own new pastoral
-- record. Reading still requires PASTORAL_VIEW and current visitor access.
create or replace function private.grant_sensitive_record_creator_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'prayer_requests' then
    insert into public.prayer_request_access (
      prayer_request_id, user_id, granted_by_user_id
    )
    values (new.prayer_request_id, new.created_by_user_id, new.created_by_user_id)
    on conflict (prayer_request_id, user_id) do nothing;
  elsif tg_table_name = 'faith_commitment_events' then
    insert into public.faith_commitment_access (
      commitment_event_id, user_id, granted_by_user_id
    )
    values (new.commitment_event_id, new.recorded_by_user_id, new.recorded_by_user_id)
    on conflict (commitment_event_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.grant_sensitive_record_creator_access() from public, anon, authenticated;

create trigger prayer_requests_grant_creator_access
  after insert on public.prayer_requests
  for each row execute function private.grant_sensitive_record_creator_access();

create trigger faith_commitment_grant_creator_access
  after insert on public.faith_commitment_events
  for each row execute function private.grant_sensitive_record_creator_access();


-- A Mission Member may update the current stage only with the explicit
-- INTEGRATION_RECORD capability. Row access is independently enforced by RLS.
create or replace function private.enforce_visitor_stage_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_integration_stage_id is distinct from old.current_integration_stage_id
     and not (select private.is_admin())
     and not (select private.has_permission('INTEGRATION_RECORD')) then
    raise exception 'INTEGRATION_RECORD capability is required to change visitor integration stage'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_visitor_stage_permission() from public, anon, authenticated;

create trigger visitors_enforce_stage_permission
  before update of current_integration_stage_id on public.visitors
  for each row execute function private.enforce_visitor_stage_permission();

-- Every integration-stage change creates its own historical event in the same
-- transaction as the visitor update.
create or replace function private.capture_visitor_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_integration_stage_id is distinct from old.current_integration_stage_id then
    if (select auth.uid()) is null then
      raise exception 'A signed-in actor is required for stage changes'
        using errcode = '42501';
    end if;

    insert into public.visitor_stage_history (
      visitor_id, integration_stage_id, changed_by_user_id, changed_at
    )
    values (
      new.visitor_id, new.current_integration_stage_id, (select auth.uid()), now()
    );
  end if;
  return new;
end;
$$;

revoke all on function private.capture_visitor_stage_change() from public, anon, authenticated;

create trigger visitors_capture_stage_history
  after update of current_integration_stage_id on public.visitors
  for each row execute function private.capture_visitor_stage_change();


-- ---------------------------------------------------------------------------
-- RLS and table privileges: no anonymous browser access.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to service_role;

do $$
declare
  v_table record;
begin
  for v_table in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', v_table.tablename);
  end loop;
end;
$$;

-- Identity and access catalogue
grant select on public.roles, public.permission_catalog to authenticated;
grant select on public.user_profiles to authenticated;
grant update (full_name) on public.user_profiles to authenticated;
grant select, insert on public.user_contact_details to authenticated;
grant update (contact_email, phone_number) on public.user_contact_details to authenticated;
grant select on public.user_permission_grants to authenticated;

create policy roles_read_active_users
  on public.roles for select to authenticated
  using ((select private.current_user_is_active()));

create policy permission_catalog_read_active_users
  on public.permission_catalog for select to authenticated
  using ((select private.current_user_is_active()));

create policy user_profiles_read_team_directory
  on public.user_profiles for select to authenticated
  using (
    (select private.current_user_is_provisioned())
    and (account_status = 'ACTIVE' or (select private.is_admin()) or user_id = (select auth.uid()))
  );

create policy user_profiles_update_own_name
  on public.user_profiles for update to authenticated
  using (
    user_id = (select auth.uid())
    and account_status in ('ACTIVE', 'INVITED')
  )
  with check (
    user_id = (select auth.uid())
    and account_status in ('ACTIVE', 'INVITED')
  );

create policy user_contact_details_read_self_or_admin
  on public.user_contact_details for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

create policy user_contact_details_update_self_or_admin
  on public.user_contact_details for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  )
  with check (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

create policy user_contact_details_insert_self_or_admin
  on public.user_contact_details for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

create policy user_permission_grants_read_self_or_admin
  on public.user_permission_grants for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Visitor identity and attendance

-- Service types are visible to active team members; only administrators configure them.
grant select, insert, update on public.service_types to authenticated;

create policy service_types_read_active_or_admin
  on public.service_types for select to authenticated
  using (
    (select private.is_admin())
    or (select private.current_user_is_active())
  );

create policy service_types_insert_admin_only
  on public.service_types for insert to authenticated
  with check ((select private.is_admin()));

create policy service_types_update_admin_only
  on public.service_types for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

grant select, insert on public.visitors to authenticated;
grant update (
  full_name, normalized_phone, email_address, residential_area,
  referral_source, follow_up_required, updated_by_user_id,
  current_integration_stage_id
) on public.visitors to authenticated;

create policy visitors_read_permitted_scope
  on public.visitors for select to authenticated
  using (
    (select private.current_user_is_active())
    and (
      (select private.is_admin())
      or (select private.can_access_visitor(visitor_id))
      or (select private.has_permission('VISITOR_DIRECTORY_VIEW'))
    )
  );

create policy visitors_insert_authorized_registration
  on public.visitors for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and updated_by_user_id = (select auth.uid())
    and (
      (select private.is_admin())
      or (select private.has_permission('VISITOR_REGISTER'))
    )
  );

create policy visitors_update_permitted_scope
  on public.visitors for update to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
  )
  with check (
    (select private.is_admin())
    or (
      (select private.can_access_visitor(visitor_id))
      and updated_by_user_id = (select auth.uid())
    )
  );

grant select, insert on public.visitor_visits to authenticated;

create policy visitor_visits_read_permitted_scope
  on public.visitor_visits for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
    or (select private.has_permission('VISITOR_DIRECTORY_VIEW'))
  );

create policy visitor_visits_insert_authorized
  on public.visitor_visits for insert to authenticated
  with check (
    recorded_by_user_id = (select auth.uid())
    and (
      (select private.is_admin())
      or (
        (select private.has_permission('ATTENDANCE_RECORD'))
        and (
          (select private.can_access_visitor(visitor_id))
          or (select private.has_permission('VISITOR_DIRECTORY_VIEW'))
        )
      )
    )
  );

grant select, insert on public.visitor_consents to authenticated;

create policy visitor_consents_read_permitted_scope
  on public.visitor_consents for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
    or (select private.has_permission('VISITOR_REGISTER'))
  );

create policy visitor_consents_insert_authorized
  on public.visitor_consents for insert to authenticated
  with check (
    captured_by_user_id = (select auth.uid())
    and (
      (select private.is_admin())
      or (
        (select private.can_access_visitor(visitor_id))
        and (
          (select private.has_permission('CONSENT_MANAGE'))
          or (select private.has_permission('VISITOR_REGISTER'))
        )
      )
    )
  );

-- Sensitive pastoral information: explicit capability plus record-specific grant.
grant select, insert on public.faith_commitment_events to authenticated;
grant select on public.faith_commitment_access to authenticated;

create policy faith_commitment_events_read_explicit_grant
  on public.faith_commitment_events for select to authenticated
  using ((select private.can_view_faith_commitment(commitment_event_id)));

create policy faith_commitment_events_insert_sensitive_permission
  on public.faith_commitment_events for insert to authenticated
  with check (
    recorded_by_user_id = (select auth.uid())
    and (select private.has_permission('PASTORAL_RECORD'))
    and (select private.can_access_visitor(visitor_id))
  );

create policy faith_commitment_access_read_self_or_admin
  on public.faith_commitment_access for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

grant select, insert on public.prayer_requests to authenticated;
grant update (request_status, closed_at) on public.prayer_requests to authenticated;
grant select on public.prayer_request_access to authenticated;

create policy prayer_requests_read_explicit_grant
  on public.prayer_requests for select to authenticated
  using ((select private.can_view_prayer_request(prayer_request_id)));

create policy prayer_requests_insert_sensitive_permission
  on public.prayer_requests for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and (select private.has_permission('PASTORAL_RECORD'))
    and (select private.can_access_visitor(visitor_id))
  );

create policy prayer_requests_update_restricted_handler
  on public.prayer_requests for update to authenticated
  using ((select private.is_admin()) or (select private.can_view_prayer_request(prayer_request_id)))
  with check (
    (select private.is_admin())
    or (
      (select private.can_view_prayer_request(prayer_request_id))
      and (select private.has_permission('PASTORAL_RECORD'))
    )
  );

create policy prayer_request_access_read_self_or_admin
  on public.prayer_request_access for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Assignments and team collaboration
grant select, insert, update on public.assignments to authenticated;
grant select, insert, update on public.assignment_collaborators to authenticated;
grant select, insert on public.assignment_history to authenticated;

create policy assignments_read_permitted_scope
  on public.assignments for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
  );

create policy assignments_insert_admin_only
  on public.assignments for insert to authenticated
  with check ((select private.is_admin()));

create policy assignments_update_admin_only
  on public.assignments for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy assignment_collaborators_read_permitted_scope
  on public.assignment_collaborators for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_assignment(assignment_id))
  );

create policy assignment_collaborators_insert_admin_only
  on public.assignment_collaborators for insert to authenticated
  with check ((select private.is_admin()));

create policy assignment_collaborators_update_admin_only
  on public.assignment_collaborators for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy assignment_history_read_permitted_scope
  on public.assignment_history for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
  );

create policy assignment_history_insert_admin_only
  on public.assignment_history for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and (select private.is_admin())
  );

-- Workflow catalog and instances
grant select, insert, update on public.follow_up_workflows to authenticated;
grant select, insert, update on public.follow_up_workflow_steps to authenticated;
grant select, insert, update on public.visitor_workflow_instances to authenticated;

create policy follow_up_workflows_read_active_or_admin
  on public.follow_up_workflows for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.current_user_is_active())
      and workflow_status = 'ACTIVE'
    )
  );

create policy follow_up_workflows_insert_admin_only
  on public.follow_up_workflows for insert to authenticated
  with check ((select private.is_admin()));

create policy follow_up_workflows_update_admin_only
  on public.follow_up_workflows for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy follow_up_workflow_steps_read_active_or_admin
  on public.follow_up_workflow_steps for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.follow_up_workflows wf
      where wf.workflow_id = public.follow_up_workflow_steps.workflow_id
        and wf.workflow_status = 'ACTIVE'
        and (select private.current_user_is_active())
    )
  );

create policy follow_up_workflow_steps_insert_admin_only
  on public.follow_up_workflow_steps for insert to authenticated
  with check ((select private.is_admin()));

create policy follow_up_workflow_steps_update_admin_only
  on public.follow_up_workflow_steps for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy visitor_workflow_instances_read_permitted_scope
  on public.visitor_workflow_instances for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
  );

create policy visitor_workflow_instances_insert_admin_only
  on public.visitor_workflow_instances for insert to authenticated
  with check ((select private.is_admin()));

create policy visitor_workflow_instances_update_admin_only
  on public.visitor_workflow_instances for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Planned tasks and actual contact records
grant select, insert on public.follow_up_tasks to authenticated;
grant update (
  task_title, task_purpose, channel, due_at, task_status,
  completed_at, cancelled_at, cancellation_reason, updated_at
) on public.follow_up_tasks to authenticated;

create policy follow_up_tasks_read_permitted_scope
  on public.follow_up_tasks for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.can_access_visitor(visitor_id))
      and (
        assigned_user_id = (select auth.uid())
        or (select private.can_access_assignment(assignment_id))
      )
    )
  );

create policy follow_up_tasks_insert_manual_or_admin
  on public.follow_up_tasks for insert to authenticated
  with check (
    (select private.is_admin())
    or (
      created_by_user_id = (select auth.uid())
      and assigned_user_id = (select auth.uid())
      and workflow_instance_id is null
      and workflow_step_id is null
      and (select private.can_access_visitor(visitor_id))
      and (select private.can_access_assignment(assignment_id))
    )
  );

create policy follow_up_tasks_update_owner_or_admin
  on public.follow_up_tasks for update to authenticated
  using (
    (select private.is_admin())
    or (
      assigned_user_id = (select auth.uid())
      and (select private.can_access_visitor(visitor_id))
    )
  )
  with check (
    (select private.is_admin())
    or (
      assigned_user_id = (select auth.uid())
      and (select private.can_access_visitor(visitor_id))
    )
  );

grant select on public.follow_up_task_history to authenticated;

create policy follow_up_task_history_read_permitted_scope
  on public.follow_up_task_history for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.follow_up_tasks t
      where t.task_id = public.follow_up_task_history.task_id
        and (select private.can_access_visitor(t.visitor_id))
    )
  );

grant select, insert on public.follow_up_records to authenticated;

create policy follow_up_records_read_permitted_scope
  on public.follow_up_records for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
  );

create policy follow_up_records_insert_permitted_scope
  on public.follow_up_records for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and (
      (select private.is_admin())
      or (
        (select private.can_access_visitor(visitor_id))
        and (select private.can_access_assignment(assignment_id))
      )
    )
  );

grant select, insert on public.team_notes to authenticated;
grant update (note_body, updated_at) on public.team_notes to authenticated;

create policy team_notes_read_permitted_scope
  on public.team_notes for select to authenticated
  using (
    (select private.is_admin())
    or (
      visibility_scope = 'ASSIGNED_TEAM'
      and (select private.can_access_visitor(visitor_id))
    )
  );

create policy team_notes_insert_permitted_scope
  on public.team_notes for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and (
      (select private.is_admin())
      or (
        visibility_scope = 'ASSIGNED_TEAM'
        and (select private.can_access_visitor(visitor_id))
      )
    )
  );

create policy team_notes_update_author_or_admin
  on public.team_notes for update to authenticated
  using (
    (select private.is_admin())
    or (
      author_user_id = (select auth.uid())
      and visibility_scope = 'ASSIGNED_TEAM'
      and (select private.can_access_visitor(visitor_id))
    )
  )
  with check (
    (select private.is_admin())
    or (
      author_user_id = (select auth.uid())
      and visibility_scope = 'ASSIGNED_TEAM'
      and (select private.can_access_visitor(visitor_id))
    )
  );

-- SMS: clients can read permitted message history; send/update is server-side only.
grant select on public.sms_templates, public.sms_messages, public.sms_delivery_events to authenticated;

create policy sms_templates_read_approved_or_admin
  on public.sms_templates for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.current_user_is_active())
      and approval_status = 'APPROVED'
      and is_active
    )
  );

create policy sms_templates_insert_admin_only
  on public.sms_templates for insert to authenticated
  with check ((select private.is_admin()));

create policy sms_templates_update_admin_only
  on public.sms_templates for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy sms_messages_read_permitted_scope
  on public.sms_messages for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
  );

create policy sms_delivery_events_read_permitted_scope
  on public.sms_delivery_events for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.sms_messages sm
      where sm.sms_message_id = public.sms_delivery_events.sms_message_id
        and (select private.can_access_visitor(sm.visitor_id))
    )
  );

-- Integration, programmes and in-app notifications
grant select, insert, update on public.integration_stages to authenticated;
grant select on public.visitor_stage_history to authenticated;
grant select, insert, update on public.integration_programs to authenticated;
grant select, insert, update on public.program_enrolments to authenticated;
grant select, insert on public.program_attendance to authenticated;

create policy integration_stages_read_active_or_admin
  on public.integration_stages for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.current_user_is_active())
      and is_active
    )
  );

create policy integration_stages_insert_admin_only
  on public.integration_stages for insert to authenticated
  with check ((select private.is_admin()));

create policy integration_stages_update_admin_only
  on public.integration_stages for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy visitor_stage_history_read_permitted_scope
  on public.visitor_stage_history for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
  );

create policy integration_programs_read_active_or_admin
  on public.integration_programs for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.current_user_is_active())
      and is_active
    )
  );

create policy integration_programs_insert_admin_only
  on public.integration_programs for insert to authenticated
  with check ((select private.is_admin()));

create policy integration_programs_update_admin_only
  on public.integration_programs for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy program_enrolments_read_permitted_scope
  on public.program_enrolments for select to authenticated
  using (
    (select private.is_admin())
    or (select private.can_access_visitor(visitor_id))
  );

create policy program_enrolments_insert_authorized
  on public.program_enrolments for insert to authenticated
  with check (
    enrolled_by_user_id = (select auth.uid())
    and (
      (select private.is_admin())
      or (
        (select private.has_permission('INTEGRATION_RECORD'))
        and (select private.can_access_visitor(visitor_id))
      )
    )
  );

create policy program_enrolments_update_admin_only
  on public.program_enrolments for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy program_attendance_read_permitted_scope
  on public.program_attendance for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.program_enrolments pe
      where pe.enrolment_id = public.program_attendance.enrolment_id
        and (select private.can_access_visitor(pe.visitor_id))
    )
  );

create policy program_attendance_insert_authorized
  on public.program_attendance for insert to authenticated
  with check (
    recorded_by_user_id = (select auth.uid())
    and (
      (select private.is_admin())
      or (
        (select private.has_permission('INTEGRATION_RECORD'))
        and exists (
          select 1
          from public.program_enrolments pe
          where pe.enrolment_id = public.program_attendance.enrolment_id
            and (select private.can_access_visitor(pe.visitor_id))
        )
      )
    )
  );

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_read_own
  on public.notifications for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and (select private.current_user_is_active())
  );

create policy notifications_update_own_read_state
  on public.notifications for update to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and (select private.current_user_is_active())
  )
  with check (
    recipient_user_id = (select auth.uid())
    and (select private.current_user_is_active())
  );

-- Administrative data
grant select on public.audit_logs, public.system_settings to authenticated;

create policy audit_logs_read_admin_only
  on public.audit_logs for select to authenticated
  using ((select private.is_admin()));

create policy system_settings_read_admin_only
  on public.system_settings for select to authenticated
  using ((select private.is_admin()));

-- No DELETE policies are defined. Historical/operational records are archived,
-- ended or superseded. Deletion and privileged mutations go through controlled
-- server-side operations with explicit authorization and audit events.
