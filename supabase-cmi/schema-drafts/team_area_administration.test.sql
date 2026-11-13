begin;
select plan(30);

select has_table('public','team_management_audit','Team administration audit ledger exists');
select ok(
  (select relrowsecurity from pg_class where oid='public.team_management_audit'::regclass),
  'Team administration audit ledger has RLS enabled'
);
select ok(
  not has_table_privilege('anon','public.team_management_audit','SELECT')
  and not has_table_privilege('authenticated','public.team_management_audit','SELECT'),
  'Browser roles cannot read the internal team administration audit ledger'
);
select ok(
  not has_table_privilege('service_role','public.team_management_audit','INSERT,UPDATE,DELETE,TRUNCATE'),
  'Service role cannot directly mutate the team administration audit ledger'
);
select ok(
  (select prosecdef from pg_proc where oid='private.cmi_manage_team_operations(uuid,text,jsonb)'::regprocedure),
  'Private team mutation function is SECURITY DEFINER'
);
select ok(
  not (select prosecdef from pg_proc where oid='public.cmi_manage_team_operations(uuid,text,jsonb)'::regprocedure),
  'Public RPC wrapper remains SECURITY INVOKER'
);
select ok(
  (select coalesce(array_to_string(proconfig,','),'') like '%search_path=""%'
   from pg_proc where oid='private.cmi_manage_team_operations(uuid,text,jsonb)'::regprocedure),
  'Private mutation function pins an empty search_path'
);
select ok(
  not has_schema_privilege('anon','public','USAGE')
  and not has_schema_privilege('authenticated','public','USAGE')
  and has_schema_privilege('service_role','public','USAGE')
  and has_schema_privilege('service_role','private','USAGE')
  and not has_schema_privilege('authenticated','private','USAGE'),
  'Only the trusted service role has namespace access needed for the private write RPC'
);
select ok(
  not has_table_privilege('authenticated','public.team','SELECT')
  and not has_table_privilege('authenticated','public.staff_team_membership','SELECT')
  and not has_table_privilege('authenticated','public.service_area','SELECT')
  and not has_table_privilege('authenticated','public.staff_area_coverage','SELECT'),
  'Authenticated browser sessions retain no direct read access to team or service-area tables'
);
select ok(
  has_function_privilege('service_role','public.cmi_manage_team_operations(uuid,text,jsonb)','EXECUTE'),
  'Only the trusted service role can invoke the public RPC wrapper'
);
select ok(
  not has_function_privilege('anon','public.cmi_manage_team_operations(uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_manage_team_operations(uuid,text,jsonb)','EXECUTE'),
  'Browser roles cannot invoke the public RPC wrapper'
);
select ok(
  has_function_privilege('service_role','private.cmi_manage_team_operations(uuid,text,jsonb)','EXECUTE'),
  'The trusted service role can execute the private mutation function'
);
select ok(
  not has_function_privilege('anon','private.cmi_manage_team_operations(uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','private.cmi_manage_team_operations(uuid,text,jsonb)','EXECUTE'),
  'Browser roles cannot invoke the private mutation function'
);
select is(
  (select count(*)::integer from public.role_capability rc
   join public.role r on r.id=rc.role_id
   join public.capability c on c.id=rc.capability_id
   where r.code='admin_pastor' and c.code='team.manage'
     and c.is_active and rc.scope_mode='branch'),
  1,
  'Admin/Pastor receives team management at branch scope'
);
select is(
  (select count(*)::integer from public.role_capability rc
   join public.role r on r.id=rc.role_id
   join public.capability c on c.id=rc.capability_id
   where r.code='admin_pastor' and c.code='area.manage'
     and c.is_active and rc.scope_mode='branch'),
  1,
  'Admin/Pastor receives service-area management at branch scope'
);
select ok(
  not exists (
    select 1 from public.role_capability rc
    join public.role r on r.id=rc.role_id
    join public.capability c on c.id=rc.capability_id
    where r.code <> 'admin_pastor'
      and c.code in ('team.manage','area.manage')
  ),
  'Team and service-area administration is not granted to lower roles'
);
select throws_ok(
  $q$ select private.cmi_manage_team_operations(null::uuid,'team.create','{}'::jsonb) $q$,
  '42501',
  null,
  'Private team mutation rejects missing authenticated identity'
);

insert into public.church(id,name,timezone)
values('70000000-0000-4000-8000-000000000010','Team Test Church','Africa/Accra');
insert into public.branch(id,church_id,name,code,timezone)
values('71000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000010','Team Test Branch','TEAM-TEST','Africa/Accra');

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000000','72000000-0000-4000-8000-000000000010','authenticated','authenticated','team-admin@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
('00000000-0000-0000-0000-000000000000','72000000-0000-4000-8000-000000000011','authenticated','authenticated','team-leader@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.staff_profile(id,auth_user_id,full_name,account_status,must_change_password)
values
('73000000-0000-4000-8000-000000000010','72000000-0000-4000-8000-000000000010','Team Test Admin','active',false),
('73000000-0000-4000-8000-000000000011','72000000-0000-4000-8000-000000000011','Team Test Leader','active',false);

insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by,starts_at)
select '73000000-0000-4000-8000-000000000010',r.id,'71000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000010',now()-interval '1 minute'
from public.role r where r.code='admin_pastor';
insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by,starts_at)
select '73000000-0000-4000-8000-000000000011',r.id,'71000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000010',now()-interval '1 minute'
from public.role r where r.code='team_leader';

select set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000010',true);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'team.create',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'name','Test Follow-up Team',
    'description','Temporary team used by the isolated authorization test.'
  )
);

select is(
  (select count(*)::integer from public.team
   where branch_id='71000000-0000-4000-8000-000000000010'
     and name='Test Follow-up Team' and is_active),
  1,
  'Authorized branch administrator can create a team'
);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'team.member.add',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'team_id',(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Test Follow-up Team'),
    'staff_profile_id','73000000-0000-4000-8000-000000000011',
    'membership_role','leader'
  )
);

select is(
  (select count(*)::integer from public.staff_team_membership stm
   join public.team t on t.id=stm.team_id and t.branch_id=stm.branch_id
   where t.branch_id='71000000-0000-4000-8000-000000000010'
     and t.name='Test Follow-up Team'
     and stm.staff_profile_id='73000000-0000-4000-8000-000000000011'
     and stm.membership_role='leader'
     and stm.revoked_at is null),
  1,
  'Only an active branch Team Leader can be assigned leader membership'
);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'team.member.update_role',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'team_id',(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Test Follow-up Team'),
    'membership_id',(select id from public.staff_team_membership where staff_profile_id='73000000-0000-4000-8000-000000000011'),
    'membership_role','member'
  )
);

select is(
  (select membership_role from public.staff_team_membership
   where staff_profile_id='73000000-0000-4000-8000-000000000011'
     and team_id=(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Test Follow-up Team')),
  'member',
  'Administrator can safely change an active membership role'
);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'team.member.revoke',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'team_id',(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Test Follow-up Team'),
    'membership_id',(select id from public.staff_team_membership where staff_profile_id='73000000-0000-4000-8000-000000000011')
  )
);

select ok(
  (select revoked_at is not null from public.staff_team_membership
   where staff_profile_id='73000000-0000-4000-8000-000000000011'
     and team_id=(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Test Follow-up Team')),
  'Removing a member revokes the membership without deleting its history'
);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'team.update',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'team_id',(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Test Follow-up Team'),
    'is_active',false
  )
);

select ok(
  (select not is_active from public.team
   where branch_id='71000000-0000-4000-8000-000000000010'
     and name='Test Follow-up Team'),
  'Empty teams can be deactivated without deleting team history'
);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'area.create',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'name','Northern Area',
    'code','NORTH'
  )
);

select is(
  (select count(*)::integer from public.service_area
   where branch_id='71000000-0000-4000-8000-000000000010'
     and code='NORTH' and is_active),
  1,
  'Authorized branch administrator can create a service area'
);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'area.coverage.add',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'area_id',(select id from public.service_area where branch_id='71000000-0000-4000-8000-000000000010' and code='NORTH'),
    'staff_profile_id','73000000-0000-4000-8000-000000000011'
  )
);

select ok(
  exists (select 1 from public.staff_area_coverage
    where branch_id='71000000-0000-4000-8000-000000000010'
      and service_area_id=(select id from public.service_area where branch_id='71000000-0000-4000-8000-000000000010' and code='NORTH')
      and staff_profile_id='73000000-0000-4000-8000-000000000011'
      and ends_at is null),
  'Active branch staff can be assigned to an active service area'
);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'area.coverage.revoke',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'area_id',(select id from public.service_area where branch_id='71000000-0000-4000-8000-000000000010' and code='NORTH'),
    'coverage_id',(select id from public.staff_area_coverage where branch_id='71000000-0000-4000-8000-000000000010' and staff_profile_id='73000000-0000-4000-8000-000000000011')
  )
);

select ok(
  (select ends_at is not null from public.staff_area_coverage
   where branch_id='71000000-0000-4000-8000-000000000010'
     and staff_profile_id='73000000-0000-4000-8000-000000000011'),
  'Ending service-area coverage preserves its historical record'
);

select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'area.update',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'area_id',(select id from public.service_area where branch_id='71000000-0000-4000-8000-000000000010' and code='NORTH'),
    'is_active',false
  )
);

select ok(
  (select not is_active from public.service_area
   where branch_id='71000000-0000-4000-8000-000000000010'
     and code='NORTH'),
  'Service areas can be deactivated after coverage is ended'
);

select ok(
  (select count(*) >= 9 from public.team_management_audit
   where branch_id='71000000-0000-4000-8000-000000000010'),
  'Team, membership and service-area changes produce immutable audit records'
);

select throws_ok(
  $q$ update public.team_management_audit set action='tampered' where branch_id='71000000-0000-4000-8000-000000000010' $q$,
  '42501',
  'TEAM_MANAGEMENT_AUDIT_IMMUTABLE',
  'Team administration audit rows cannot be rewritten'
);



select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'team.create',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'name','Active Membership Guard',
    'description','Temporary active membership guard test.'
  )
);

select throws_ok(
  $q$ select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
    'team.member.add',
    jsonb_build_object(
      'branch_id','71000000-0000-4000-8000-000000000010',
      'team_id',(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Active Membership Guard'),
      'staff_profile_id','73000000-0000-4000-8000-000000000010',
      'membership_role','leader'
    )
  ) $q$,
  '42501',
  'TEAM_LEADER_ROLE_REQUIRED',
  'A Team Leader membership cannot be assigned from the Admin role alone'
);
select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
  'team.member.add',
  jsonb_build_object(
    'branch_id','71000000-0000-4000-8000-000000000010',
    'team_id',(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Active Membership Guard'),
    'staff_profile_id','73000000-0000-4000-8000-000000000011',
    'membership_role','member'
  )
);
select throws_ok(
  $q$ select public.cmi_manage_team_operations('72000000-0000-4000-8000-000000000010',
    'team.update',
    jsonb_build_object(
      'branch_id','71000000-0000-4000-8000-000000000010',
      'team_id',(select id from public.team where branch_id='71000000-0000-4000-8000-000000000010' and name='Active Membership Guard'),
      'is_active',false
    )
  ) $q$,
  '23514',
  'TEAM_HAS_ACTIVE_MEMBERS',
  'A team with active members cannot be deactivated'
);

select * from finish();
rollback;
