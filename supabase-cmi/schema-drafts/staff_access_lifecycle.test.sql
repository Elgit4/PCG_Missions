begin;
select plan(32);
select has_table('public','staff_access_audit','Staff access audit exists');
select ok((select relrowsecurity from pg_class where oid='public.staff_access_audit'::regclass),'Audit RLS enabled');
select ok(not has_table_privilege('anon','public.staff_access_audit','SELECT'),'Anon cannot read access audit');
select ok(not has_table_privilege('authenticated','public.staff_access_audit','SELECT'),'Browser cannot read access audit');
select ok(not has_table_privilege('service_role','public.staff_access_audit','INSERT'),'Service role cannot directly append audit');
select ok(not has_function_privilege('anon','public.cmi_assign_staff_role(uuid,uuid,uuid,text,timestamptz,timestamptz,text)','EXECUTE'),'Anon cannot assign roles');
select ok(not has_function_privilege('authenticated','public.cmi_assign_staff_role(uuid,uuid,uuid,text,timestamptz,timestamptz,text)','EXECUTE'),'Browser cannot assign roles directly');
select ok(has_function_privilege('service_role','public.cmi_assign_staff_role(uuid,uuid,uuid,text,timestamptz,timestamptz,text)','EXECUTE'),'Service role can call guarded assignment');
select ok(has_function_privilege('service_role','public.cmi_revoke_staff_role(uuid,uuid,uuid,text)','EXECUTE'),'Service role can call guarded revocation');
select ok(not has_function_privilege('authenticated','public.cmi_set_staff_account_status(uuid,uuid,uuid,text,text)','EXECUTE'),'Browser cannot mutate account state');
select ok(has_function_privilege('service_role','public.cmi_set_staff_account_status(uuid,uuid,uuid,text,text)','EXECUTE'),'Service role can call guarded account mutation');
select ok((select prosecdef from pg_proc where oid='public.cmi_assign_staff_role(uuid,uuid,uuid,text,timestamptz,timestamptz,text)'::regprocedure),'Assignment RPC is SECURITY DEFINER');
select ok(not has_table_privilege('service_role','public.staff_profile','UPDATE'),'Service role cannot directly update staff profiles');
select ok(not has_table_privilege('service_role','public.staff_role_assignment','INSERT,UPDATE'),'Service role cannot directly mutate role assignments');
select ok((select coalesce(array_to_string(proconfig,','),'') like '%search_path=pg_catalog%' from pg_proc where oid='public.cmi_assign_staff_role(uuid,uuid,uuid,text,timestamptz,timestamptz,text)'::regprocedure),'Assignment pins search_path');
select is((select count(*)::integer from public.role_capability),67,'The owner-directed visitor MVP role baseline is seeded');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20','authenticated','authenticated','access-actor@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21','authenticated','authenticated','access-target@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','authenticated','authenticated','access-coordinator@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
insert into public.staff_profile(id,auth_user_id,full_name,account_status) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20','Access Actor','active'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21','Access Target','active'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa24','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','Access Coordinator','active');
insert into public.church(id,name,timezone) values('10000000-0000-4000-8000-000000000020','Access Test Church','Africa/Accra');
insert into public.branch(id,church_id,name,code) values('20000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000020','Access Test Branch','ACCESS');
insert into public.team(id,branch_id,name)
values('30000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000020','Overlap Test Team');
insert into public.service_area(id,branch_id,name,code)
values('40000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000020','Overlap Test Area','OVERLAP');
insert into public.role_capability(role_id,capability_id,scope_mode) select r.id,c.id,'branch' from public.role r cross join public.capability c where r.code='admin_pastor' and c.code in('access.role.assign','staff.account.manage')
on conflict do nothing;
insert into public.role_capability(role_id,capability_id,scope_mode)
select r.id,c.id,'branch' from public.role r cross join public.capability c
where r.code='coordinator' and c.code='staff.account.manage'
on conflict do nothing;
insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by,starts_at) select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',r.id,'20000000-0000-4000-8000-000000000020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',now()-interval '1 day' from public.role r where r.code='admin_pastor';
insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by,starts_at)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa24',r.id,'20000000-0000-4000-8000-000000000020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',now()-interval '1 day'
from public.role r where r.code='coordinator';

insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by,starts_at,ends_at)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',r.id,'20000000-0000-4000-8000-000000000020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',now()-interval '1 day',now()+interval '5 days'
from public.role r where r.code='field_worker';
select throws_ok(
  $q$insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by,starts_at,ends_at)
     select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',r.id,'20000000-0000-4000-8000-000000000020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',now(),now()+interval '6 days'
     from public.role r where r.code='field_worker'$q$,
  '23P01',null,'Overlapping time-bounded staff role assignments are rejected'
);
insert into public.staff_team_membership(staff_profile_id,team_id,branch_id,created_by,starts_at,ends_at)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','30000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',now()-interval '1 day',now()+interval '5 days');
select throws_ok(
  $q$insert into public.staff_team_membership(staff_profile_id,team_id,branch_id,created_by,starts_at,ends_at)
     values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','30000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',now(),now()+interval '6 days')$q$,
  '23P01',null,'Overlapping staff team membership periods are rejected'
);
insert into public.staff_area_coverage(staff_profile_id,service_area_id,branch_id,created_by,starts_at,ends_at)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','40000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',now()-interval '1 day',now()+interval '5 days');
select throws_ok(
  $q$insert into public.staff_area_coverage(staff_profile_id,service_area_id,branch_id,created_by,starts_at,ends_at)
     values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','40000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22',now(),now()+interval '6 days')$q$,
  '23P01',null,'Overlapping staff service-area coverage periods are rejected'
);
set local role service_role;
select public.cmi_assign_staff_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23','20000000-0000-4000-8000-000000000020','field_worker',now(),'2026-12-31T23:59:59Z','Approved test assignment');
reset role;
select is((select count(*)::integer from public.staff_role_assignment where staff_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23'),1,'Guarded role assignment creates assignment');
select is((select count(*)::integer from public.staff_access_audit where target_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23' and action='role_assigned'),1,'Role assignment and audit are atomic');

set local role service_role;
select throws_ok($q$select public.cmi_assign_staff_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23','20000000-0000-4000-8000-000000000020','field_worker',now(),'2026-12-31T23:59:59Z','Unauthorized duplicate assignment')$q$,'42501',null,'Staff without role-assignment capability cannot assign roles');
select throws_ok($q$select public.cmi_revoke_staff_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21',(select id from public.staff_role_assignment where staff_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23'),'20000000-0000-4000-8000-000000000020','Unauthorized role revocation')$q$,'42501',null,'Staff without role-assignment capability cannot revoke roles');
select throws_ok($q$select public.cmi_set_staff_account_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23','20000000-0000-4000-8000-000000000020','inactive','Unauthorized account deactivation')$q$,'42501',null,'Staff without account-management capability cannot change account state');
select throws_ok($q$select public.cmi_set_staff_account_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','20000000-0000-4000-8000-000000000020','inactive','Attempt to deactivate own admin account')$q$,'22023',null,'An administrator cannot deactivate their own account');
select throws_ok($q$select public.cmi_set_staff_account_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22','20000000-0000-4000-8000-000000000020','inactive','Attempt to remove the only active Admin')$q$,'22023',null,'The last active Admin/Pastor cannot be deactivated by another authorised account');
reset role;
set local role service_role;
select throws_ok($q$select public.cmi_assign_staff_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23','20000000-0000-4000-8000-000000000099','field_worker',now(),null,'Branch outside configured instance')$q$,'42501',null,'Role assignment rejects an unconfigured branch');
select throws_ok($q$select public.cmi_assign_staff_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23','20000000-0000-4000-8000-000000000020','super_admin',now(),null,'Unsupported role assignment')$q$,'22023',null,'Role assignment rejects unknown role codes');
select throws_ok($q$select public.cmi_assign_staff_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23','20000000-0000-4000-8000-000000000020','field_worker',now()+interval '1 day',null,'Overlapping duplicate assignment')$q$,'23505',null,'Overlapping role assignments are rejected');
reset role;
select throws_ok($q$update public.staff_access_audit set reason='tampered audit entry' where action='role_assigned'$q$,'55000',null,'Audit rows cannot be updated');
set local role service_role;
select public.cmi_revoke_staff_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',(select id from public.staff_role_assignment where staff_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23'),'20000000-0000-4000-8000-000000000020','Role no longer required');
select public.cmi_set_staff_account_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23','20000000-0000-4000-8000-000000000020','inactive','Staff member has left the team');
reset role;
select is((select account_status from public.staff_profile where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23'),'inactive','Account deactivation updates profile');
select is((select count(*)::integer from public.staff_access_audit where target_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23'),3,'Role changes and deactivation produce audit records');
select * from finish();
rollback;
