-- Permanent CMI migration promoted from the isolated-CI-validated schema draft.
-- Keeps browser table access closed; business access remains behind trusted
-- Edge Functions and explicit capability/scope checks. Production application
-- is a separate, reviewed deployment operation.

begin;

alter table public.followup_task
  add column client_request_id uuid,
  add column digest_key_version smallint,
  add column request_digest bytea,
  add constraint followup_task_idempotency_fields_ck check (
    (client_request_id is null and digest_key_version is null and request_digest is null)
    or
    (client_request_id is not null
      and digest_key_version is not null and digest_key_version > 0
      and request_digest is not null and pg_catalog.octet_length(request_digest) = 32)
  );

create unique index followup_task_branch_request_uq
  on public.followup_task(branch_id, client_request_id)
  where client_request_id is not null;

alter table public.followup_task_event
  drop constraint if exists followup_task_event_event_type_check;
alter table public.followup_task_event
  add constraint followup_task_event_event_type_check
  check (event_type in (
    'created', 'assigned', 'reassigned', 'status_changed',
    'note_added', 'details_updated', 'completed', 'reopened', 'cancelled'
  ));

comment on column public.followup_task.client_request_id is
  'Branch-scoped idempotency key for trusted task creation; never supplied as an authoritative actor or status field.';
comment on column public.followup_task.request_digest is
  'Versioned HMAC digest of the normalized create request; raw request bodies are never stored.';

create or replace function private.cmi_reject_followup_task_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $task_event_guard$
begin
  raise exception using
    errcode = '55000',
    message = 'follow-up task lifecycle history is append-only';
  return null;
end;
$task_event_guard$;

revoke all on function private.cmi_reject_followup_task_event_mutation()
  from public, anon, authenticated;

create trigger followup_task_event_reject_row_mutation
before update or delete on public.followup_task_event
for each row
execute function private.cmi_reject_followup_task_event_mutation();

create trigger followup_task_event_reject_truncate
before truncate on public.followup_task_event
for each statement
execute function private.cmi_reject_followup_task_event_mutation();

create or replace function public.cmi_create_followup_task(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_client_request_id uuid,
  p_digest_key_version smallint,
  p_request_digest bytea,
  p_contact_id uuid,
  p_list_id uuid,
  p_assignee_user_id uuid,
  p_team_id uuid,
  p_priority smallint,
  p_due_at timestamptz,
  p_task_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid;
  v_branch_scope boolean := false;
  v_team_scope boolean := false;
  v_assigned_scope boolean := false;
  v_assign_branch_scope boolean := false;
  v_existing public.followup_task%rowtype;
  v_task public.followup_task%rowtype;
begin
  if p_actor_auth_user_id is null
     or p_branch_id is null
     or p_client_request_id is null
     or p_digest_key_version is null or p_digest_key_version < 1
     or p_request_digest is null or pg_catalog.octet_length(p_request_digest) <> 32
     or p_contact_id is null
     or ((p_assignee_user_id is null) = (p_team_id is null))
     or p_priority is null or p_priority not between 1 and 5
     or (p_task_note is not null and pg_catalog.length(p_task_note) > 2000) then
    raise exception using errcode = '22023', message = 'invalid follow-up task input';
  end if;

  select sp.id
    into v_profile_id
  from public.staff_profile sp
  join public.branch b on b.id = p_branch_id and b.is_active
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active';

  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'follow-up task creation not authorized';
  end if;

  select
    coalesce(pg_catalog.bool_or(rc.scope_mode = 'branch'), false),
    coalesce(pg_catalog.bool_or(rc.scope_mode = 'team'), false),
    coalesce(pg_catalog.bool_or(rc.scope_mode = 'assigned'), false)
  into v_branch_scope, v_team_scope, v_assigned_scope
  from public.staff_role_assignment sra
  join public.role r on r.id = sra.role_id and r.is_active
  join public.role_capability rc on rc.role_id = sra.role_id
  join public.capability cap on cap.id = rc.capability_id and cap.is_active
  where sra.staff_profile_id = v_profile_id
    and sra.branch_id = p_branch_id
    and sra.starts_at <= pg_catalog.now()
    and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
    and sra.revoked_at is null
    and cap.code = 'followup.task.create';

  if not v_branch_scope and not v_team_scope and not v_assigned_scope then
    raise exception using errcode = '42501', message = 'follow-up task creation not authorized';
  end if;

  if p_assignee_user_id is not null then
    if p_assignee_user_id = p_actor_auth_user_id and v_assigned_scope then
      null; -- Assigned-scope creators may create work for themselves only.
    elsif v_branch_scope then
      select coalesce(pg_catalog.bool_or(rc.scope_mode = 'branch'), false)
        into v_assign_branch_scope
      from public.staff_role_assignment sra
      join public.role r on r.id = sra.role_id and r.is_active
      join public.role_capability rc on rc.role_id = sra.role_id
      join public.capability cap on cap.id = rc.capability_id and cap.is_active
      where sra.staff_profile_id = v_profile_id
        and sra.branch_id = p_branch_id
        and sra.starts_at <= pg_catalog.now()
        and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
        and sra.revoked_at is null
        and cap.code = 'followup.task.assign.scoped';

      if not v_assign_branch_scope or not exists (
        select 1
        from public.staff_profile target
        where target.auth_user_id = p_assignee_user_id
          and target.account_status = 'active'
      ) or not exists (
        select 1
        from public.staff_role_assignment target_assignment
        join public.role target_role
          on target_role.id = target_assignment.role_id
         and target_role.is_active
        where target_assignment.staff_profile_id = (
          select target.id from public.staff_profile target
          where target.auth_user_id = p_assignee_user_id
            and target.account_status = 'active'
        )
          and target_assignment.branch_id = p_branch_id
          and target_assignment.starts_at <= pg_catalog.now()
          and (target_assignment.ends_at is null or target_assignment.ends_at > pg_catalog.now())
          and target_assignment.revoked_at is null
      ) then
        raise exception using errcode = '42501', message = 'task assignment not authorized';
      end if;
    else
      raise exception using errcode = '42501', message = 'task assignment not authorized';
    end if;
  else
    if v_team_scope and exists (
      select 1
      from public.staff_team_membership stm
      join public.team t
        on t.id = stm.team_id
       and t.branch_id = stm.branch_id
       and t.is_active
      where stm.staff_profile_id = v_profile_id
        and stm.branch_id = p_branch_id
        and stm.team_id = p_team_id
        and stm.starts_at <= pg_catalog.now()
        and (stm.ends_at is null or stm.ends_at > pg_catalog.now())
        and stm.revoked_at is null
    ) then
      null; -- Team-scope creators may create work for a team they belong to.
    elsif v_branch_scope then
      select coalesce(pg_catalog.bool_or(rc.scope_mode = 'branch'), false)
        into v_assign_branch_scope
      from public.staff_role_assignment sra
      join public.role r on r.id = sra.role_id and r.is_active
      join public.role_capability rc on rc.role_id = sra.role_id
      join public.capability cap on cap.id = rc.capability_id and cap.is_active
      where sra.staff_profile_id = v_profile_id
        and sra.branch_id = p_branch_id
        and sra.starts_at <= pg_catalog.now()
        and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
        and sra.revoked_at is null
        and cap.code = 'followup.task.assign.scoped';

      if not v_assign_branch_scope or not exists (
        select 1 from public.team t
        where t.id = p_team_id and t.branch_id = p_branch_id and t.is_active
      ) then
        raise exception using errcode = '42501', message = 'task assignment not authorized';
      end if;
    else
      raise exception using errcode = '42501', message = 'task assignment not authorized';
    end if;
  end if;

  if not exists (
    select 1 from public.contact c
    where c.id = p_contact_id
      and c.branch_id = p_branch_id
      and c.contact_status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'contact is not active in this branch';
  end if;

  if p_list_id is not null and not exists (
    select 1 from public.followup_list fl
    where fl.id = p_list_id
      and fl.branch_id = p_branch_id
      and fl.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'follow-up list is not active in this branch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_branch_id::text || ':' || p_client_request_id::text, 0)
  );

  select task.*
    into v_existing
  from public.followup_task task
  where task.branch_id = p_branch_id
    and task.client_request_id = p_client_request_id
  for update;

  if v_existing.id is not null then
    if v_existing.created_by is distinct from p_actor_auth_user_id
       or v_existing.digest_key_version is distinct from p_digest_key_version
       or v_existing.request_digest is distinct from p_request_digest then
      raise exception using errcode = '23505', message = 'task idempotency key already used';
    end if;

    return pg_catalog.jsonb_build_object(
      'task', pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'branch_id', v_existing.branch_id,
      'contact_id', v_existing.contact_id,
      'list_id', v_existing.list_id,
      'assignee_user_id', v_existing.assignee_user_id,
      'team_id', v_existing.team_id,
      'priority', v_existing.priority,
      'due_at', v_existing.due_at,
      'status', v_existing.status,
      'task_note', v_existing.task_note,
      'created_by', v_existing.created_by,
      'completed_at', v_existing.completed_at,
      'created_at', v_existing.created_at,
      'updated_at', v_existing.updated_at
    ),
      'replayed', true
    );
  end if;

  insert into public.followup_task (
    list_id,
    contact_id,
    branch_id,
    assignee_user_id,
    team_id,
    priority,
    due_at,
    task_note,
    created_by,
    client_request_id,
    digest_key_version,
    request_digest
  ) values (
    p_list_id,
    p_contact_id,
    p_branch_id,
    p_assignee_user_id,
    p_team_id,
    p_priority,
    p_due_at,
    nullif(pg_catalog.btrim(coalesce(p_task_note, '')), ''),
    p_actor_auth_user_id,
    p_client_request_id,
    p_digest_key_version,
    p_request_digest
  )
  returning * into v_task;

  insert into public.followup_task_event (
    task_id, actor_user_id, event_type, to_status, details
  ) values (
    v_task.id,
    p_actor_auth_user_id,
    'created',
    'open',
    pg_catalog.jsonb_build_object(
      'assignment_target',
      case when p_team_id is null then 'staff' else 'team' end
    )
  );

  return pg_catalog.jsonb_build_object(
    'task', pg_catalog.jsonb_build_object(
      'id', v_task.id,
      'branch_id', v_task.branch_id,
      'contact_id', v_task.contact_id,
      'list_id', v_task.list_id,
      'assignee_user_id', v_task.assignee_user_id,
      'team_id', v_task.team_id,
      'priority', v_task.priority,
      'due_at', v_task.due_at,
      'status', v_task.status,
      'task_note', v_task.task_note,
      'created_by', v_task.created_by,
      'completed_at', v_task.completed_at,
      'created_at', v_task.created_at,
      'updated_at', v_task.updated_at
    ),
    'replayed', false
  );
end;
$$;

create or replace function public.cmi_update_followup_task(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_task_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid;
  v_branch_scope boolean := false;
  v_assigned_scope boolean := false;
  v_team_scope boolean := false;
  v_self_scope boolean := false;
  v_task public.followup_task%rowtype;
  v_old_status text;
  v_new_status text;
  v_new_task_note text;
  v_new_priority smallint;
  v_new_due_at timestamptz;
  v_event_type text;
  v_changed_fields jsonb;
begin
  if p_actor_auth_user_id is null or p_branch_id is null or p_task_id is null
     or p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object'
     or p_patch = '{}'::jsonb
     or p_patch - array['task_note', 'priority', 'due_at', 'status'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'invalid follow-up task update';
  end if;

  if p_patch ? 'task_note' and
     pg_catalog.jsonb_typeof(p_patch->'task_note') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'invalid task note';
  end if;
  if p_patch ? 'task_note' and pg_catalog.length(coalesce(p_patch->>'task_note', '')) > 2000 then
    raise exception using errcode = '22023', message = 'task note is too long';
  end if;
  if p_patch ? 'priority' and (
    pg_catalog.jsonb_typeof(p_patch->'priority') <> 'number'
    or (p_patch->>'priority') !~ '^[1-5]$'
  ) then
    raise exception using errcode = '22023', message = 'invalid task priority';
  end if;
  if p_patch ? 'due_at' and
     pg_catalog.jsonb_typeof(p_patch->'due_at') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'invalid task due date';
  end if;
  if p_patch ? 'status' and (
    pg_catalog.jsonb_typeof(p_patch->'status') <> 'string'
    or p_patch->>'status' not in ('open', 'in_progress', 'completed', 'cancelled')
  ) then
    raise exception using errcode = '22023', message = 'invalid task status';
  end if;

  select sp.id
    into v_profile_id
  from public.staff_profile sp
  join public.branch b on b.id = p_branch_id and b.is_active
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active';

  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'follow-up task update not authorized';
  end if;

  select
    coalesce(pg_catalog.bool_or(rc.scope_mode = 'branch'), false),
    coalesce(pg_catalog.bool_or(rc.scope_mode = 'assigned'), false),
    coalesce(pg_catalog.bool_or(rc.scope_mode = 'team'), false),
    coalesce(pg_catalog.bool_or(rc.scope_mode = 'self'), false)
  into v_branch_scope, v_assigned_scope, v_team_scope, v_self_scope
  from public.staff_role_assignment sra
  join public.role r on r.id = sra.role_id and r.is_active
  join public.role_capability rc on rc.role_id = sra.role_id
  join public.capability cap on cap.id = rc.capability_id and cap.is_active
  where sra.staff_profile_id = v_profile_id
    and sra.branch_id = p_branch_id
    and sra.starts_at <= pg_catalog.now()
    and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
    and sra.revoked_at is null
    and cap.code = 'followup.task.update.scoped';

  select task.*
    into v_task
  from public.followup_task task
  where task.id = p_task_id
    and task.branch_id = p_branch_id
  for update;

  if v_task.id is null then
    raise exception using errcode = 'P0002', message = 'follow-up task not found';
  end if;

  if not (
    v_branch_scope
    or (v_assigned_scope and v_task.assignee_user_id = p_actor_auth_user_id)
    or (
      v_team_scope
      and v_task.team_id is not null
      and exists (
        select 1 from public.staff_team_membership stm
        join public.team t on t.id = stm.team_id and t.branch_id = stm.branch_id and t.is_active
        where stm.staff_profile_id = v_profile_id
          and stm.branch_id = p_branch_id
          and stm.team_id = v_task.team_id
          and stm.starts_at <= pg_catalog.now()
          and (stm.ends_at is null or stm.ends_at > pg_catalog.now())
          and stm.revoked_at is null
      )
    )
    or (v_self_scope and v_task.created_by = p_actor_auth_user_id)
  ) then
    raise exception using errcode = '42501', message = 'follow-up task update not authorized';
  end if;

  v_old_status := v_task.status;
  v_new_status := coalesce(p_patch->>'status', v_old_status);
  if v_new_status <> v_task.status and not (
    (v_task.status in ('open', 'in_progress') and v_new_status in ('open', 'in_progress', 'completed', 'cancelled'))
    or (v_task.status = 'completed' and v_new_status in ('open', 'in_progress'))
  ) then
    raise exception using errcode = '22023', message = 'invalid follow-up task status transition';
  end if;

  v_new_task_note := case
    when p_patch ? 'task_note' then nullif(pg_catalog.btrim(p_patch->>'task_note'), '')
    else v_task.task_note
  end;
  v_new_priority := case
    when p_patch ? 'priority' then (p_patch->>'priority')::smallint
    else v_task.priority
  end;

  begin
    v_new_due_at := case
      when not (p_patch ? 'due_at') then v_task.due_at
      when pg_catalog.jsonb_typeof(p_patch->'due_at') = 'null' then null
      else (p_patch->>'due_at')::timestamptz
    end;
  exception when others then
    raise exception using errcode = '22023', message = 'invalid task due date';
  end;

  update public.followup_task
  set task_note = v_new_task_note,
      priority = v_new_priority,
      due_at = v_new_due_at,
      status = v_new_status,
      completed_at = case
        when v_new_status = 'completed' then coalesce(v_task.completed_at, pg_catalog.now())
        else null
      end
  where id = p_task_id
    and branch_id = p_branch_id
  returning * into v_task;

  select pg_catalog.jsonb_agg(key order by key)
    into v_changed_fields
  from pg_catalog.jsonb_object_keys(p_patch) as keys(key);

  if v_new_status <> v_old_status then
    v_event_type := case
      when v_new_status = 'completed' then 'completed'
      when v_new_status = 'cancelled' then 'cancelled'
      when v_old_status = 'completed' then 'reopened'
      else 'status_changed'
    end;
  end if;

  if v_event_type is null then
    v_event_type := case
      when p_patch ? 'task_note' and v_new_task_note is not null then 'note_added'
      else 'details_updated'
    end;
  end if;

  insert into public.followup_task_event (
    task_id, actor_user_id, event_type, from_status, to_status, details
  ) values (
    p_task_id,
    p_actor_auth_user_id,
    v_event_type,
    case when v_new_status <> v_old_status then v_old_status else null end,
    case when v_new_status <> v_old_status then v_new_status else null end,
    pg_catalog.jsonb_build_object('changed_fields', coalesce(v_changed_fields, '[]'::jsonb))
  );

  return pg_catalog.jsonb_build_object('task', pg_catalog.jsonb_build_object(
      'id', v_task.id,
      'branch_id', v_task.branch_id,
      'contact_id', v_task.contact_id,
      'list_id', v_task.list_id,
      'assignee_user_id', v_task.assignee_user_id,
      'team_id', v_task.team_id,
      'priority', v_task.priority,
      'due_at', v_task.due_at,
      'status', v_task.status,
      'task_note', v_task.task_note,
      'created_by', v_task.created_by,
      'completed_at', v_task.completed_at,
      'created_at', v_task.created_at,
      'updated_at', v_task.updated_at
    ));
end;
$$;

create or replace function public.cmi_reassign_followup_task(
  p_actor_auth_user_id uuid,
  p_branch_id uuid,
  p_task_id uuid,
  p_assignee_user_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $task_reassign$
declare
  v_profile_id uuid;
  v_branch_assign_scope boolean := false;
  v_target_profile_id uuid;
  v_task public.followup_task%rowtype;
  v_old_assignee_user_id uuid;
  v_old_team_id uuid;
begin
  if p_actor_auth_user_id is null
     or p_branch_id is null
     or p_task_id is null
     or ((p_assignee_user_id is null) = (p_team_id is null)) then
    raise exception using errcode = '22023', message = 'invalid follow-up task assignment';
  end if;

  select sp.id
    into v_profile_id
  from public.staff_profile sp
  join public.branch b
    on b.id = p_branch_id
   and b.is_active
  where sp.auth_user_id = p_actor_auth_user_id
    and sp.account_status = 'active';

  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'task reassignment not authorized';
  end if;

  select coalesce(pg_catalog.bool_or(rc.scope_mode = 'branch'), false)
    into v_branch_assign_scope
  from public.staff_role_assignment sra
  join public.role r
    on r.id = sra.role_id
   and r.is_active
  join public.role_capability rc
    on rc.role_id = sra.role_id
  join public.capability cap
    on cap.id = rc.capability_id
   and cap.is_active
  where sra.staff_profile_id = v_profile_id
    and sra.branch_id = p_branch_id
    and sra.starts_at <= pg_catalog.now()
    and (sra.ends_at is null or sra.ends_at > pg_catalog.now())
    and sra.revoked_at is null
    and cap.code = 'followup.task.assign.scoped';

  if not v_branch_assign_scope then
    raise exception using errcode = '42501', message = 'task reassignment not authorized';
  end if;

  select task.*
    into v_task
  from public.followup_task task
  where task.id = p_task_id
    and task.branch_id = p_branch_id
  for update;

  if v_task.id is null then
    raise exception using errcode = 'P0002', message = 'follow-up task not found';
  end if;

  if v_task.status not in ('open', 'in_progress') then
    raise exception using errcode = '22023', message = 'only active follow-up tasks can be reassigned';
  end if;

  if p_assignee_user_id is not null then
    select target.id
      into v_target_profile_id
    from public.staff_profile target
    where target.auth_user_id = p_assignee_user_id
      and target.account_status = 'active';

    if v_target_profile_id is null or not exists (
      select 1
      from public.staff_role_assignment target_assignment
      join public.role target_role
        on target_role.id = target_assignment.role_id
       and target_role.is_active
      where target_assignment.staff_profile_id = v_target_profile_id
        and target_assignment.branch_id = p_branch_id
        and target_assignment.starts_at <= pg_catalog.now()
        and (target_assignment.ends_at is null or target_assignment.ends_at > pg_catalog.now())
        and target_assignment.revoked_at is null
    ) then
      raise exception using errcode = '42501', message = 'target staff member is not active in this branch';
    end if;
  else
    if not exists (
      select 1
      from public.team target_team
      where target_team.id = p_team_id
        and target_team.branch_id = p_branch_id
        and target_team.is_active
    ) then
      raise exception using errcode = '42501', message = 'target team is not active in this branch';
    end if;
  end if;

  if v_task.assignee_user_id is not distinct from p_assignee_user_id
     and v_task.team_id is not distinct from p_team_id then
    return pg_catalog.jsonb_build_object(
      'task', pg_catalog.jsonb_build_object(
      'id', v_task.id,
      'branch_id', v_task.branch_id,
      'contact_id', v_task.contact_id,
      'list_id', v_task.list_id,
      'assignee_user_id', v_task.assignee_user_id,
      'team_id', v_task.team_id,
      'priority', v_task.priority,
      'due_at', v_task.due_at,
      'status', v_task.status,
      'task_note', v_task.task_note,
      'created_by', v_task.created_by,
      'completed_at', v_task.completed_at,
      'created_at', v_task.created_at,
      'updated_at', v_task.updated_at
    ),
      'changed', false
    );
  end if;

  v_old_assignee_user_id := v_task.assignee_user_id;
  v_old_team_id := v_task.team_id;

  update public.followup_task
  set assignee_user_id = p_assignee_user_id,
      team_id = p_team_id
  where id = p_task_id
    and branch_id = p_branch_id
  returning * into v_task;

  insert into public.followup_task_event (
    task_id, actor_user_id, event_type, details
  ) values (
    p_task_id,
    p_actor_auth_user_id,
    'reassigned',
    pg_catalog.jsonb_build_object(
      'from_assignee_user_id', v_old_assignee_user_id,
      'from_team_id', v_old_team_id,
      'to_assignee_user_id', p_assignee_user_id,
      'to_team_id', p_team_id
    )
  );

  return pg_catalog.jsonb_build_object(
    'task', pg_catalog.jsonb_build_object(
      'id', v_task.id,
      'branch_id', v_task.branch_id,
      'contact_id', v_task.contact_id,
      'list_id', v_task.list_id,
      'assignee_user_id', v_task.assignee_user_id,
      'team_id', v_task.team_id,
      'priority', v_task.priority,
      'due_at', v_task.due_at,
      'status', v_task.status,
      'task_note', v_task.task_note,
      'created_by', v_task.created_by,
      'completed_at', v_task.completed_at,
      'created_at', v_task.created_at,
      'updated_at', v_task.updated_at
    ),
    'changed', true
  );
end;
$task_reassign$;

revoke all on function public.cmi_create_followup_task(uuid,uuid,uuid,smallint,bytea,uuid,uuid,uuid,uuid,smallint,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.cmi_create_followup_task(uuid,uuid,uuid,smallint,bytea,uuid,uuid,uuid,uuid,smallint,timestamptz,text)
  to service_role;

revoke all on function public.cmi_update_followup_task(uuid,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.cmi_update_followup_task(uuid,uuid,uuid,jsonb)
  to service_role;

revoke all on function public.cmi_reassign_followup_task(uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.cmi_reassign_followup_task(uuid,uuid,uuid,uuid,uuid)
  to service_role;

comment on function public.cmi_create_followup_task(uuid,uuid,uuid,smallint,bytea,uuid,uuid,uuid,uuid,smallint,timestamptz,text)
  is 'Atomic follow-up task creation with actor/scope checks, a branch idempotency key and created event history.';
comment on function public.cmi_update_followup_task(uuid,uuid,uuid,jsonb)
  is 'Atomic scoped follow-up task update with validated status transitions and append-only lifecycle event history.';

comment on function public.cmi_reassign_followup_task(uuid,uuid,uuid,uuid,uuid)
  is 'Atomic branch-authorized reassignment of an active task to one active same-branch staff member or team, with append-only history.';

commit;
