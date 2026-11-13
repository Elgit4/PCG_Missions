-- PCG Missions — branch-scoped team and service-area administration.
-- Product-owner direction: implement the first complete Admin operational
-- directory after the private draft workspaces. All changes are server-side,
-- branch-scoped, permission checked against the caller's live Auth session,
-- and recorded in an append-only audit ledger.

begin;

create table if not exists public.team_management_audit (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  actor_profile_id uuid not null references public.staff_profile(id) on delete restrict,
  target_type text not null
    check (target_type in ('team','team_membership','service_area','area_coverage')),
  target_id uuid not null,
  action text not null
    check (action ~ '^[a-z][a-z0-9_.]{2,79}$'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists team_management_audit_branch_created_idx
  on public.team_management_audit(branch_id, created_at desc);

alter table public.team_management_audit enable row level security;
revoke all on public.team_management_audit from public, anon, authenticated;
grant select on public.team_management_audit to service_role;

create or replace function private.reject_team_management_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'TEAM_MANAGEMENT_AUDIT_IMMUTABLE';
end;
$$;

drop trigger if exists team_management_audit_no_update_delete
  on public.team_management_audit;
create trigger team_management_audit_no_update_delete
before update or delete on public.team_management_audit
for each row execute function private.reject_team_management_audit_mutation();
revoke all on function private.reject_team_management_audit_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists team_management_audit_no_truncate
  on public.team_management_audit;
create trigger team_management_audit_no_truncate
before truncate on public.team_management_audit
for each statement execute function private.reject_team_management_audit_mutation();

create or replace function private.cmi_manage_team_operations(
  p_actor_auth_user_id uuid,
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := p_actor_auth_user_id;
  v_actor_profile_id uuid;
  v_branch_id uuid;
  v_capability_code text;
  v_name text;
  v_description text;
  v_code text;
  v_is_active boolean;
  v_team_id uuid;
  v_area_id uuid;
  v_staff_profile_id uuid;
  v_membership_id uuid;
  v_coverage_id uuid;
  v_membership_role text;
  v_result jsonb;
  v_exists boolean;
  v_now timestamptz := now();
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_action is null or p_action not in (
    'team.create','team.update','team.member.add','team.member.update_role',
    'team.member.revoke','area.create','area.update',
    'area.coverage.add','area.coverage.revoke'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_OPERATION';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_PAYLOAD';
  end if;

  if coalesce(p_payload->>'branch_id','') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023', message = 'INVALID_BRANCH_ID';
  end if;
  v_branch_id := (p_payload->>'branch_id')::uuid;
  v_capability_code := case
    when p_action like 'team.%' then 'team.manage'
    else 'area.manage'
  end;

  select sp.id
  into v_actor_profile_id
  from public.staff_profile sp
  where sp.auth_user_id = v_auth_user_id
    and sp.account_status = 'active'
    and sp.must_change_password = false;

  if v_actor_profile_id is null then
    raise exception using errcode = '42501', message = 'ACTIVE_STAFF_REQUIRED';
  end if;

  select exists (
    select 1
    from public.branch b
    join public.staff_role_assignment sra
      on sra.branch_id = b.id
     and sra.staff_profile_id = v_actor_profile_id
     and sra.starts_at <= v_now
     and (sra.ends_at is null or sra.ends_at > v_now)
     and sra.revoked_at is null
    join public.role r
      on r.id = sra.role_id and r.is_active
    join public.role_capability rc
      on rc.role_id = r.id and rc.scope_mode = 'branch'
    join public.capability c
      on c.id = rc.capability_id
     and c.code = v_capability_code
     and c.is_active
    where b.id = v_branch_id and b.is_active
  ) into v_exists;

  if not v_exists then
    raise exception using errcode = '42501', message = 'BRANCH_CAPABILITY_REQUIRED';
  end if;

  if p_action = 'team.create' then
    if p_payload - array['branch_id','name','description'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'UNSUPPORTED_TEAM_FIELDS';
    end if;
    if pg_catalog.jsonb_typeof(p_payload->'name') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'INVALID_TEAM_NAME';
    end if;
    if p_payload ? 'description' and pg_catalog.jsonb_typeof(p_payload->'description') not in ('string','null') then
      raise exception using errcode = '22023', message = 'INVALID_TEAM_DESCRIPTION';
    end if;
    v_name := pg_catalog.btrim(coalesce(p_payload->>'name',''));
    v_description := nullif(pg_catalog.btrim(coalesce(p_payload->>'description','')),'');
    if pg_catalog.length(v_name) not between 2 and 160
       or pg_catalog.length(coalesce(v_description,'')) > 1000 then
      raise exception using errcode = '22023', message = 'INVALID_TEAM_DETAILS';
    end if;
    insert into public.team(branch_id,name,description)
    values(v_branch_id,v_name,v_description)
    returning to_jsonb(team.*) into v_result;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'team',(v_result->>'id')::uuid,
      'team.created',jsonb_build_object('name',v_name)
    );
    return v_result;
  end if;

  if p_action = 'team.update' then
    if p_payload - array['branch_id','team_id','name','description','is_active'] <> '{}'::jsonb
       or (p_payload - array['branch_id','team_id']) = '{}'::jsonb then
      raise exception using errcode = '22023', message = 'INVALID_TEAM_UPDATE_FIELDS';
    end if;
    if coalesce(p_payload->>'team_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'INVALID_TEAM_ID';
    end if;
    v_team_id := (p_payload->>'team_id')::uuid;
    if p_payload ? 'name' then
      if pg_catalog.jsonb_typeof(p_payload->'name') is distinct from 'string' then
        raise exception using errcode = '22023', message = 'INVALID_TEAM_NAME';
      end if;
      v_name := pg_catalog.btrim(coalesce(p_payload->>'name',''));
      if pg_catalog.length(v_name) not between 2 and 160 then
        raise exception using errcode = '22023', message = 'INVALID_TEAM_NAME';
      end if;
    end if;
    if p_payload ? 'description' then
      if pg_catalog.jsonb_typeof(p_payload->'description') not in ('string','null') then
        raise exception using errcode = '22023', message = 'INVALID_TEAM_DESCRIPTION';
      end if;
      v_description := nullif(pg_catalog.btrim(coalesce(p_payload->>'description','')),'');
      if pg_catalog.length(coalesce(v_description,'')) > 1000 then
        raise exception using errcode = '22023', message = 'INVALID_TEAM_DESCRIPTION';
      end if;
    end if;
    if p_payload ? 'is_active' then
      if pg_catalog.jsonb_typeof(p_payload->'is_active') <> 'boolean' then
        raise exception using errcode = '22023', message = 'INVALID_TEAM_STATUS';
      end if;
      v_is_active := (p_payload->>'is_active')::boolean;
      if not v_is_active and exists (
        select 1 from public.staff_team_membership stm
        where stm.team_id = v_team_id and stm.branch_id = v_branch_id
          and stm.revoked_at is null
          and (stm.ends_at is null or stm.ends_at > v_now)
      ) then
        raise exception using errcode = '23514', message = 'TEAM_HAS_ACTIVE_MEMBERS';
      end if;
    end if;
    update public.team t
    set name = case when p_payload ? 'name' then v_name else t.name end,
        description = case when p_payload ? 'description' then v_description else t.description end,
        is_active = case when p_payload ? 'is_active' then v_is_active else t.is_active end
    where t.id = v_team_id and t.branch_id = v_branch_id
    returning to_jsonb(t.*) into v_result;
    if v_result is null then
      raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND';
    end if;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'team',v_team_id,'team.updated',
      jsonb_build_object('changed_fields',
        (select coalesce(jsonb_agg(key),'[]'::jsonb)
         from pg_catalog.jsonb_object_keys(p_payload - array['branch_id','team_id']) as fields(key)))
    );
    return v_result;
  end if;

  if p_action = 'team.member.add' then
    if p_payload - array['branch_id','team_id','staff_profile_id','membership_role'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'UNSUPPORTED_MEMBERSHIP_FIELDS';
    end if;
    if coalesce(p_payload->>'team_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(p_payload->>'staff_profile_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_REFERENCE';
    end if;
    v_team_id := (p_payload->>'team_id')::uuid;
    v_staff_profile_id := (p_payload->>'staff_profile_id')::uuid;
    if p_payload ? 'membership_role' and pg_catalog.jsonb_typeof(p_payload->'membership_role') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_ROLE';
    end if;
    v_membership_role := coalesce(p_payload->>'membership_role','member');
    if v_membership_role not in ('member','leader') then
      raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_ROLE';
    end if;
    if not exists (
      select 1 from public.team t
      where t.id = v_team_id and t.branch_id = v_branch_id and t.is_active
    ) then
      raise exception using errcode = 'P0002', message = 'ACTIVE_TEAM_NOT_FOUND';
    end if;
    if not exists (
      select 1 from public.staff_profile sp
      where sp.id = v_staff_profile_id
        and sp.account_status = 'active'
        and sp.must_change_password = false
        and exists (
          select 1 from public.staff_role_assignment sra
          join public.role r on r.id = sra.role_id and r.is_active
          where sra.staff_profile_id = sp.id and sra.branch_id = v_branch_id
            and sra.starts_at <= v_now
            and (sra.ends_at is null or sra.ends_at > v_now)
            and sra.revoked_at is null
        )
    ) then
      raise exception using errcode = '42501', message = 'STAFF_NOT_ACTIVE_IN_BRANCH';
    end if;
    if v_membership_role = 'leader' and not exists (
      select 1
      from public.staff_role_assignment sra
      join public.role r on r.id = sra.role_id and r.is_active and r.code = 'team_leader'
      where sra.staff_profile_id = v_staff_profile_id
        and sra.branch_id = v_branch_id
        and sra.starts_at <= v_now
        and (sra.ends_at is null or sra.ends_at > v_now)
        and sra.revoked_at is null
    ) then
      raise exception using errcode = '42501', message = 'TEAM_LEADER_ROLE_REQUIRED';
    end if;
    insert into public.staff_team_membership(
      staff_profile_id,team_id,branch_id,membership_role,starts_at,created_by
    ) values (
      v_staff_profile_id,v_team_id,v_branch_id,v_membership_role,v_now,v_actor_profile_id
    ) returning to_jsonb(staff_team_membership.*) into v_result;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'team_membership',(v_result->>'id')::uuid,
      'team.member_added',
      jsonb_build_object('team_id',v_team_id,'staff_profile_id',v_staff_profile_id,'membership_role',v_membership_role)
    );
    return v_result;
  end if;

  if p_action = 'team.member.update_role' then
    if p_payload - array['branch_id','team_id','membership_id','membership_role'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'UNSUPPORTED_MEMBERSHIP_UPDATE_FIELDS';
    end if;
    if coalesce(p_payload->>'team_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(p_payload->>'membership_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_REFERENCE';
    end if;
    v_team_id := (p_payload->>'team_id')::uuid;
    v_membership_id := (p_payload->>'membership_id')::uuid;
    if pg_catalog.jsonb_typeof(p_payload->'membership_role') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_ROLE';
    end if;
    v_membership_role := p_payload->>'membership_role';
    if v_membership_role not in ('member','leader') then
      raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_ROLE';
    end if;
    if not exists (
      select 1 from public.staff_team_membership stm
      where stm.id = v_membership_id and stm.team_id = v_team_id
        and stm.branch_id = v_branch_id
        and stm.revoked_at is null and (stm.ends_at is null or stm.ends_at > v_now)
    ) then
      raise exception using errcode = 'P0002', message = 'ACTIVE_MEMBERSHIP_NOT_FOUND';
    end if;
    select stm.staff_profile_id into v_staff_profile_id
    from public.staff_team_membership stm where stm.id = v_membership_id;
    if v_membership_role = 'leader' and not exists (
      select 1
      from public.staff_role_assignment sra
      join public.role r on r.id = sra.role_id and r.is_active and r.code = 'team_leader'
      where sra.staff_profile_id = v_staff_profile_id
        and sra.branch_id = v_branch_id
        and sra.starts_at <= v_now
        and (sra.ends_at is null or sra.ends_at > v_now)
        and sra.revoked_at is null
    ) then
      raise exception using errcode = '42501', message = 'TEAM_LEADER_ROLE_REQUIRED';
    end if;
    update public.staff_team_membership
    set membership_role = v_membership_role
    where id = v_membership_id
    returning to_jsonb(staff_team_membership.*) into v_result;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'team_membership',v_membership_id,
      'team.member_role_changed',jsonb_build_object('membership_role',v_membership_role)
    );
    return v_result;
  end if;

  if p_action = 'team.member.revoke' then
    if p_payload - array['branch_id','team_id','membership_id'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'UNSUPPORTED_MEMBERSHIP_REVOKE_FIELDS';
    end if;
    if coalesce(p_payload->>'team_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(p_payload->>'membership_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_REFERENCE';
    end if;
    v_team_id := (p_payload->>'team_id')::uuid;
    v_membership_id := (p_payload->>'membership_id')::uuid;
    update public.staff_team_membership
    set revoked_at = v_now
    where id = v_membership_id and team_id = v_team_id
      and branch_id = v_branch_id
      and revoked_at is null and (ends_at is null or ends_at > v_now)
    returning to_jsonb(staff_team_membership.*) into v_result;
    if v_result is null then
      raise exception using errcode = 'P0002', message = 'ACTIVE_MEMBERSHIP_NOT_FOUND';
    end if;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'team_membership',v_membership_id,
      'team.member_revoked',jsonb_build_object('team_id',v_team_id)
    );
    return v_result;
  end if;

  if p_action = 'area.create' then
    if p_payload - array['branch_id','name','code'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'UNSUPPORTED_AREA_FIELDS';
    end if;
    if pg_catalog.jsonb_typeof(p_payload->'name') is distinct from 'string'
       or (p_payload ? 'code' and pg_catalog.jsonb_typeof(p_payload->'code') not in ('string','null')) then
      raise exception using errcode = '22023', message = 'INVALID_SERVICE_AREA_DETAILS';
    end if;
    v_name := pg_catalog.btrim(coalesce(p_payload->>'name',''));
    v_code := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_payload->>'code',''))),'');
    if pg_catalog.length(v_name) not between 2 and 160
       or (v_code is not null and v_code !~ '^[A-Z0-9_-]{2,24}$') then
      raise exception using errcode = '22023', message = 'INVALID_SERVICE_AREA_DETAILS';
    end if;
    insert into public.service_area(branch_id,name,code)
    values(v_branch_id,v_name,v_code)
    returning to_jsonb(service_area.*) into v_result;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'service_area',(v_result->>'id')::uuid,
      'service_area.created',jsonb_build_object('name',v_name,'code',v_code)
    );
    return v_result;
  end if;

  if p_action = 'area.update' then
    if p_payload - array['branch_id','area_id','name','code','is_active'] <> '{}'::jsonb
       or (p_payload - array['branch_id','area_id']) = '{}'::jsonb then
      raise exception using errcode = '22023', message = 'INVALID_AREA_UPDATE_FIELDS';
    end if;
    if coalesce(p_payload->>'area_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'INVALID_AREA_ID';
    end if;
    v_area_id := (p_payload->>'area_id')::uuid;
    if p_payload ? 'name' then
      if pg_catalog.jsonb_typeof(p_payload->'name') is distinct from 'string' then
        raise exception using errcode = '22023', message = 'INVALID_SERVICE_AREA_NAME';
      end if;
      v_name := pg_catalog.btrim(coalesce(p_payload->>'name',''));
      if pg_catalog.length(v_name) not between 2 and 160 then
        raise exception using errcode = '22023', message = 'INVALID_SERVICE_AREA_NAME';
      end if;
    end if;
    if p_payload ? 'code' then
      if pg_catalog.jsonb_typeof(p_payload->'code') not in ('string','null') then
        raise exception using errcode = '22023', message = 'INVALID_SERVICE_AREA_CODE';
      end if;
      v_code := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_payload->>'code',''))),'');
      if v_code is not null and v_code !~ '^[A-Z0-9_-]{2,24}$' then
        raise exception using errcode = '22023', message = 'INVALID_SERVICE_AREA_CODE';
      end if;
    end if;
    if p_payload ? 'is_active' then
      if pg_catalog.jsonb_typeof(p_payload->'is_active') <> 'boolean' then
        raise exception using errcode = '22023', message = 'INVALID_SERVICE_AREA_STATUS';
      end if;
      v_is_active := (p_payload->>'is_active')::boolean;
      if not v_is_active and exists (
        select 1 from public.staff_area_coverage sac
        where sac.service_area_id = v_area_id and sac.branch_id = v_branch_id
          and (sac.ends_at is null or sac.ends_at > v_now)
      ) then
        raise exception using errcode = '23514', message = 'AREA_HAS_ACTIVE_COVERAGE';
      end if;
    end if;
    update public.service_area sa
    set name = case when p_payload ? 'name' then v_name else sa.name end,
        code = case when p_payload ? 'code' then v_code else sa.code end,
        is_active = case when p_payload ? 'is_active' then v_is_active else sa.is_active end
    where sa.id = v_area_id and sa.branch_id = v_branch_id
    returning to_jsonb(sa.*) into v_result;
    if v_result is null then
      raise exception using errcode = 'P0002', message = 'SERVICE_AREA_NOT_FOUND';
    end if;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'service_area',v_area_id,'service_area.updated',
      jsonb_build_object('changed_fields',
        (select coalesce(jsonb_agg(key),'[]'::jsonb)
         from pg_catalog.jsonb_object_keys(p_payload - array['branch_id','area_id']) as fields(key)))
    );
    return v_result;
  end if;

  if p_action = 'area.coverage.add' then
    if p_payload - array['branch_id','area_id','staff_profile_id'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'UNSUPPORTED_AREA_COVERAGE_FIELDS';
    end if;
    if coalesce(p_payload->>'area_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}
    v_area_id := (p_payload->>'area_id')::uuid;
    v_staff_profile_id := (p_payload->>'staff_profile_id')::uuid;
    if not exists (
      select 1 from public.service_area sa
      where sa.id = v_area_id and sa.branch_id = v_branch_id and sa.is_active
    ) then
      raise exception using errcode = 'P0002', message = 'ACTIVE_SERVICE_AREA_NOT_FOUND';
    end if;
    if not exists (
      select 1 from public.staff_profile sp
      where sp.id = v_staff_profile_id
        and sp.account_status = 'active'
        and sp.must_change_password = false
        and exists (
          select 1 from public.staff_role_assignment sra
          join public.role r on r.id = sra.role_id and r.is_active
          where sra.staff_profile_id = sp.id and sra.branch_id = v_branch_id
            and sra.starts_at <= v_now
            and (sra.ends_at is null or sra.ends_at > v_now)
            and sra.revoked_at is null
        )
    ) then
      raise exception using errcode = '42501', message = 'STAFF_NOT_ACTIVE_IN_BRANCH';
    end if;
    insert into public.staff_area_coverage(
      staff_profile_id,service_area_id,branch_id,starts_at,created_by
    ) values (
      v_staff_profile_id,v_area_id,v_branch_id,v_now,v_actor_profile_id
    ) returning to_jsonb(staff_area_coverage.*) into v_result;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'area_coverage',(v_result->>'id')::uuid,
      'service_area.coverage_added',
      jsonb_build_object('service_area_id',v_area_id,'staff_profile_id',v_staff_profile_id)
    );
    return v_result;
  end if;

  if p_action = 'area.coverage.revoke' then
    if p_payload - array['branch_id','area_id','coverage_id'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'UNSUPPORTED_AREA_COVERAGE_REVOKE_FIELDS';
    end if;
    if coalesce(p_payload->>'area_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(p_payload->>'coverage_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'INVALID_AREA_COVERAGE_REFERENCE';
    end if;
    v_area_id := (p_payload->>'area_id')::uuid;
    v_coverage_id := (p_payload->>'coverage_id')::uuid;
    update public.staff_area_coverage
    set ends_at = v_now
    where id = v_coverage_id and service_area_id = v_area_id
      and branch_id = v_branch_id
      and starts_at <= v_now and (ends_at is null or ends_at > v_now)
    returning to_jsonb(staff_area_coverage.*) into v_result;
    if v_result is null then
      raise exception using errcode = 'P0002', message = 'ACTIVE_AREA_COVERAGE_NOT_FOUND';
    end if;
    insert into public.team_management_audit(
      branch_id,actor_profile_id,target_type,target_id,action,metadata
    ) values (
      v_branch_id,v_actor_profile_id,'area_coverage',v_coverage_id,
      'service_area.coverage_revoked',jsonb_build_object('service_area_id',v_area_id)
    );
    return v_result;
  end if;

  raise exception using errcode = '22023', message = 'INVALID_TEAM_OPERATION';
end;
$$;

revoke all on function private.cmi_manage_team_operations(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant execute on function private.cmi_manage_team_operations(uuid,text,jsonb)
  to service_role;

create or replace function public.cmi_manage_team_operations(
  p_actor_auth_user_id uuid,
  p_action text,
  p_payload jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.cmi_manage_team_operations(p_actor_auth_user_id,p_action,p_payload);
$$;

revoke all on function public.cmi_manage_team_operations(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
-- Only the authenticated Edge Function's server-side service client may call
-- this wrapper. The function revalidates the supplied Auth user against the
-- active staff profile, role, branch and capability before every mutation.
-- Browser roles retain their existing no-USAGE-on-public/no-direct-table model.
grant execute on function public.cmi_manage_team_operations(uuid,text,jsonb)
  to service_role;

-- Admin/Pastor receives management of teams and service areas only at the
-- selected active branch. Team Leader membership is not inferred from this.
insert into public.role_capability(role_id,capability_id,scope_mode)
select r.id,c.id,'branch'
from public.role r
cross join public.capability c
where r.code='admin_pastor'
  and c.is_active
  and c.code in ('team.manage','area.manage')
on conflict do nothing;

do $$
declare
  v_count integer;
begin
  select count(*)::integer into v_count
  from public.role_capability rc
  join public.role r on r.id=rc.role_id
  join public.capability c on c.id=rc.capability_id
  where r.code='admin_pastor'
    and rc.scope_mode='branch'
    and c.is_active
    and c.code in ('team.manage','area.manage');
  if v_count <> 2 then
    raise exception 'Expected two Admin/Pastor branch team/area grants, found %', v_count;
  end if;
end;
$$;

comment on table public.team_management_audit is
'Append-only audit evidence for team, membership, service-area and staff-coverage administration. No contact, prayer or care narratives are included.';

commit;
