-- Staff access lifecycle proposal based on docs 00,02,07,08,11,12.
-- No role_capability grants are seeded; R-01..R-12 and D-01..D-13 remain pending.
-- CI-only draft; do not promote to permanent migration until approved.
begin;
create table public.staff_access_audit(
 id uuid primary key default gen_random_uuid(),branch_id uuid not null references public.branch(id) on delete restrict,
 actor_profile_id uuid not null references public.staff_profile(id) on delete restrict,
 target_profile_id uuid not null references public.staff_profile(id) on delete restrict,
 action text not null check(action in('role_assigned','role_revoked','account_deactivated','account_reactivated')),
 reason text not null check(length(btrim(reason)) between 10 and 500),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),created_at timestamptz not null default now()
);
create index staff_access_audit_branch_created_idx on public.staff_access_audit(branch_id,created_at desc);
create index staff_access_audit_target_created_idx on public.staff_access_audit(target_profile_id,created_at desc);
alter table public.staff_access_audit enable row level security;
revoke all on table public.staff_access_audit from public,anon,authenticated,service_role;
create or replace function private.reject_staff_access_audit_mutation() returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception using errcode='55000',message='staff access audit is append-only';end;$$;
revoke all on function private.reject_staff_access_audit_mutation() from public,anon,authenticated;
create trigger staff_access_audit_no_update_delete before update or delete on public.staff_access_audit for each row execute function private.reject_staff_access_audit_mutation();
create trigger staff_access_audit_no_truncate before truncate on public.staff_access_audit for each statement execute function private.reject_staff_access_audit_mutation();

create or replace function public.cmi_assign_staff_role(p_actor_auth_user_id uuid,p_target_profile_id uuid,p_branch_id uuid,p_role_code text,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid;v_role uuid;v_assignment uuid;
begin
 if p_actor_auth_user_id is null or p_target_profile_id is null or p_branch_id is null or p_role_code is null or p_starts_at is null or(p_ends_at is not null and p_ends_at<=p_starts_at) or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception using errcode='22023',message='invalid role assignment';end if;
 select id into v_actor from public.staff_profile where auth_user_id=p_actor_auth_user_id and account_status='active';
 if v_actor is null then raise exception using errcode='42501',message='active staff actor required';end if;
 if not exists(select 1 from public.branch b join public.church c on c.id=b.church_id and c.is_configured_instance where b.id=p_branch_id and b.is_active) then raise exception using errcode='42501',message='active configured branch required';end if;
 if not exists(select 1 from public.staff_role_assignment s join public.role r on r.id=s.role_id and r.is_active join public.role_capability rc on rc.role_id=r.id and rc.scope_mode='branch' join public.capability cap on cap.id=rc.capability_id and cap.code='access.role.assign' and cap.is_active where s.staff_profile_id=v_actor and s.branch_id=p_branch_id and s.starts_at<=now() and(s.ends_at is null or s.ends_at>now()) and s.revoked_at is null) then raise exception using errcode='42501',message='role assignment capability required';end if;
 if not exists(select 1 from public.staff_profile where id=p_target_profile_id and account_status='active') then raise exception using errcode='P0002',message='active target staff not found';end if;
 select id into v_role from public.role where code=p_role_code and is_active;
 if v_role is null then raise exception using errcode='22023',message='active role not found';end if;
 if p_role_code='admin_pastor' and not exists(select 1 from public.staff_role_assignment s join public.role r on r.id=s.role_id where s.staff_profile_id=v_actor and s.branch_id=p_branch_id and r.code='admin_pastor' and s.starts_at<=now() and(s.ends_at is null or s.ends_at>now()) and s.revoked_at is null) then raise exception using errcode='42501',message='existing Admin/Pastor assignment required';end if;
 if exists(select 1 from public.staff_role_assignment s where s.staff_profile_id=p_target_profile_id and s.role_id=v_role and s.branch_id=p_branch_id and s.revoked_at is null and s.starts_at<coalesce(p_ends_at,'infinity'::timestamptz) and coalesce(s.ends_at,'infinity'::timestamptz)>p_starts_at) then raise exception using errcode='23505',message='overlapping active role assignment';end if;
 insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by,starts_at,ends_at,reason) values(p_target_profile_id,v_role,p_branch_id,v_actor,p_starts_at,p_ends_at,p_reason) returning id into v_assignment;
 insert into public.staff_access_audit(branch_id,actor_profile_id,target_profile_id,action,reason,metadata) values(p_branch_id,v_actor,p_target_profile_id,'role_assigned',p_reason,jsonb_build_object('assignment_id',v_assignment,'role_code',p_role_code,'starts_at',p_starts_at,'ends_at',p_ends_at));
 return jsonb_build_object('assignment_id',v_assignment,'staff_profile_id',p_target_profile_id,'branch_id',p_branch_id,'role_code',p_role_code,'starts_at',p_starts_at,'ends_at',p_ends_at);
end;$$;

create or replace function public.cmi_revoke_staff_role(p_actor_auth_user_id uuid,p_assignment_id uuid,p_branch_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid;v_target uuid;v_code text;
begin
 if p_actor_auth_user_id is null or p_assignment_id is null or p_branch_id is null or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception using errcode='22023',message='invalid role revocation';end if;
 select id into v_actor from public.staff_profile where auth_user_id=p_actor_auth_user_id and account_status='active';
 if v_actor is null or not exists(select 1 from public.staff_role_assignment s join public.role r on r.id=s.role_id and r.is_active join public.role_capability rc on rc.role_id=r.id and rc.scope_mode='branch' join public.capability cap on cap.id=rc.capability_id and cap.code='access.role.assign' and cap.is_active where s.staff_profile_id=v_actor and s.branch_id=p_branch_id and s.starts_at<=now() and(s.ends_at is null or s.ends_at>now()) and s.revoked_at is null) then raise exception using errcode='42501',message='role assignment capability required';end if;
 select s.staff_profile_id,r.code into v_target,v_code from public.staff_role_assignment s join public.role r on r.id=s.role_id where s.id=p_assignment_id and s.branch_id=p_branch_id and s.revoked_at is null and(s.ends_at is null or s.ends_at>now()) for update of s;
 if v_target is null then raise exception using errcode='P0002',message='active role assignment not found';end if;
 update public.staff_role_assignment set revoked_at=now() where id=p_assignment_id and branch_id=p_branch_id;
 insert into public.staff_access_audit(branch_id,actor_profile_id,target_profile_id,action,reason,metadata) values(p_branch_id,v_actor,v_target,'role_revoked',p_reason,jsonb_build_object('assignment_id',p_assignment_id,'role_code',v_code));
 return jsonb_build_object('assignment_id',p_assignment_id,'staff_profile_id',v_target,'branch_id',p_branch_id,'role_code',v_code,'status','revoked');
end;$$;

create or replace function public.cmi_set_staff_account_status(p_actor_auth_user_id uuid,p_target_profile_id uuid,p_branch_id uuid,p_target_status text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid;v_current text;
begin
 if p_actor_auth_user_id is null or p_target_profile_id is null or p_branch_id is null or p_target_status not in('active','inactive') or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception using errcode='22023',message='invalid account status request';end if;
 select id into v_actor from public.staff_profile where auth_user_id=p_actor_auth_user_id and account_status='active';
 if v_actor is null or not exists(select 1 from public.staff_role_assignment s join public.role r on r.id=s.role_id and r.is_active join public.role_capability rc on rc.role_id=r.id and rc.scope_mode='branch' join public.capability cap on cap.id=rc.capability_id and cap.code='staff.account.manage' and cap.is_active where s.staff_profile_id=v_actor and s.branch_id=p_branch_id and s.starts_at<=now() and(s.ends_at is null or s.ends_at>now()) and s.revoked_at is null) then raise exception using errcode='42501',message='staff account management capability required';end if;
 select account_status into v_current from public.staff_profile where id=p_target_profile_id and exists(select 1 from public.staff_role_assignment s where s.staff_profile_id=p_target_profile_id and s.branch_id=p_branch_id) for update;
 if v_current is null then raise exception using errcode='P0002',message='staff account not found in branch';end if;
 if v_current not in('active','inactive') then raise exception using errcode='22023',message='invalid account state transition';end if;
 if v_current=p_target_status then return jsonb_build_object('staff_profile_id',p_target_profile_id,'branch_id',p_branch_id,'account_status',p_target_status,'no_change',true);end if;
 update public.staff_profile set account_status=p_target_status,deactivated_at=case when p_target_status='inactive' then now() else null end where id=p_target_profile_id;
 insert into public.staff_access_audit(branch_id,actor_profile_id,target_profile_id,action,reason,metadata) values(p_branch_id,v_actor,p_target_profile_id,case when p_target_status='inactive' then 'account_deactivated' else 'account_reactivated' end,p_reason,jsonb_build_object('from',v_current,'to',p_target_status));
 return jsonb_build_object('staff_profile_id',p_target_profile_id,'branch_id',p_branch_id,'account_status',p_target_status);
end;$$;

revoke all on function public.cmi_assign_staff_role(uuid,uuid,uuid,text,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function public.cmi_revoke_staff_role(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cmi_set_staff_account_status(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.cmi_assign_staff_role(uuid,uuid,uuid,text,timestamptz,timestamptz,text) to service_role;
grant execute on function public.cmi_revoke_staff_role(uuid,uuid,uuid,text) to service_role;
grant execute on function public.cmi_set_staff_account_status(uuid,uuid,uuid,text,text) to service_role;
comment on table public.staff_access_audit is 'Append-only staff role and account status audit; no credential or PIN material.';
commit;
