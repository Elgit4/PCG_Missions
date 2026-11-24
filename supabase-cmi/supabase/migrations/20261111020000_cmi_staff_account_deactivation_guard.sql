-- Protect the final active Admin/Pastor and prevent self-deactivation.
-- The staff status RPC is executed only by the trusted staff-access Edge Function.

begin;

create or replace function public.cmi_set_staff_account_status(p_actor_auth_user_id uuid,p_target_profile_id uuid,p_branch_id uuid,p_target_status text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid;v_current text;v_target_auth_user_id uuid;
begin
 if p_actor_auth_user_id is null or p_target_profile_id is null or p_branch_id is null or p_target_status not in('active','inactive') or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception using errcode='22023',message='invalid account status request';end if;
 select id into v_actor from public.staff_profile where auth_user_id=p_actor_auth_user_id and account_status='active';
 if v_actor is null or not exists(select 1 from public.staff_role_assignment s join public.role r on r.id=s.role_id and r.is_active join public.role_capability rc on rc.role_id=r.id and rc.scope_mode='branch' join public.capability cap on cap.id=rc.capability_id and cap.code='staff.account.manage' and cap.is_active where s.staff_profile_id=v_actor and s.branch_id=p_branch_id and s.starts_at<=now() and(s.ends_at is null or s.ends_at>now()) and s.revoked_at is null) then raise exception using errcode='42501',message='staff account management capability required';end if;
 select account_status,auth_user_id into v_current,v_target_auth_user_id from public.staff_profile where id=p_target_profile_id and exists(select 1 from public.staff_role_assignment s where s.staff_profile_id=p_target_profile_id and s.branch_id=p_branch_id) for update;
 if v_current is null then raise exception using errcode='P0002',message='staff account not found in branch';end if;
 if v_current not in('active','inactive') then raise exception using errcode='22023',message='invalid account state transition';end if;
 if p_target_status='inactive' and v_target_auth_user_id=p_actor_auth_user_id then raise exception using errcode='22023',message='cannot deactivate own staff account';end if;
 if p_target_status='inactive'
   and exists(
     select 1 from public.staff_role_assignment target_assignment
     join public.role target_role on target_role.id=target_assignment.role_id and target_role.code='admin_pastor' and target_role.is_active
     where target_assignment.staff_profile_id=p_target_profile_id
       and target_assignment.branch_id=p_branch_id
       and target_assignment.starts_at<=now()
       and (target_assignment.ends_at is null or target_assignment.ends_at>now())
       and target_assignment.revoked_at is null
   )
   and not exists(
     select 1 from public.staff_role_assignment other_assignment
     join public.staff_profile other_profile on other_profile.id=other_assignment.staff_profile_id and other_profile.account_status='active'
     join public.role other_role on other_role.id=other_assignment.role_id and other_role.code='admin_pastor' and other_role.is_active
     where other_assignment.staff_profile_id<>p_target_profile_id
       and other_assignment.branch_id=p_branch_id
       and other_assignment.starts_at<=now()
       and (other_assignment.ends_at is null or other_assignment.ends_at>now())
       and other_assignment.revoked_at is null
   ) then raise exception using errcode='22023',message='cannot deactivate the last active Admin/Pastor in this branch';end if;
 if v_current=p_target_status then return jsonb_build_object('staff_profile_id',p_target_profile_id,'branch_id',p_branch_id,'account_status',p_target_status,'auth_user_id',v_target_auth_user_id,'no_change',true);end if;
 update public.staff_profile set account_status=p_target_status,deactivated_at=case when p_target_status='inactive' then now() else null end where id=p_target_profile_id;
 insert into public.staff_access_audit(branch_id,actor_profile_id,target_profile_id,action,reason,metadata) values(p_branch_id,v_actor,p_target_profile_id,case when p_target_status='inactive' then 'account_deactivated' else 'account_reactivated' end,p_reason,jsonb_build_object('from',v_current,'to',p_target_status));
 return jsonb_build_object('staff_profile_id',p_target_profile_id,'branch_id',p_branch_id,'account_status',p_target_status,'auth_user_id',v_target_auth_user_id);
end;$$;

commit;
