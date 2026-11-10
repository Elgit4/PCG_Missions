begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

select has_column(
  'public', 'staff_profile', 'must_change_password',
  'staff profiles carry a mandatory first-login password-change flag'
);
select has_column(
  'public', 'staff_profile', 'password_setup_expires_at',
  'bootstrap password has a finite setup window'
);
select has_column(
  'public', 'staff_profile', 'password_changed_at',
  'staff profiles record when the private password was last changed'
);
select has_table(
  'private', 'staff_password_reset_request',
  'reset requests are stored in an unexposed private schema'
);
select has_table(
  'private', 'staff_password_reset_audit',
  'reset lifecycle audit is stored in a private schema'
);

select ok(
  (select relrowsecurity from pg_class where oid='private.staff_password_reset_request'::regclass)
  and (select relrowsecurity from pg_class where oid='private.staff_password_reset_audit'::regclass),
  'RLS is enabled on both private authentication lifecycle tables'
);
select ok(
  not has_table_privilege('anon','private.staff_password_reset_request','SELECT')
  and not has_table_privilege('authenticated','private.staff_password_reset_request','SELECT')
  and not has_table_privilege('service_role','private.staff_password_reset_request','SELECT')
  and not has_table_privilege('anon','private.staff_password_reset_audit','SELECT')
  and not has_table_privilege('authenticated','private.staff_password_reset_audit','SELECT')
  and not has_table_privilege('service_role','private.staff_password_reset_audit','SELECT'),
  'private reset tables are not directly readable by browser or service roles'
);
select is(
  (select count(*)::integer from public.role_capability),
  65,
  'the reviewed visitor MVP role baseline exists before first-admin bootstrap'
);
select ok(
  exists(select 1 from public.capability where code='staff.password_reset.manage' and is_active),
  'the narrow staff password-reset capability is present in the catalogue'
);

select ok(
  has_function_privilege('service_role','public.cmi_bootstrap_first_admin(uuid,text,text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.cmi_bootstrap_first_admin(uuid,text,text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_bootstrap_first_admin(uuid,text,text,text,text)','EXECUTE'),
  'bootstrap function can be called only by a trusted server'
);
select ok(
  has_function_privilege('service_role','public.cmi_request_staff_password_reset(text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.cmi_request_staff_password_reset(text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_request_staff_password_reset(text,text,text)','EXECUTE'),
  'public reset requests must pass through the rate-limited Edge Function'
);
select ok(
  has_function_privilege('service_role','public.cmi_list_staff_password_reset_requests(uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.cmi_claim_staff_password_reset_request(uuid,uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.cmi_finish_staff_password_reset_request(uuid,uuid,uuid,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_claim_staff_password_reset_request(uuid,uuid,uuid)','EXECUTE'),
  'admin review RPCs are server-only and validate actor capability inside the transaction'
);
select ok(
  has_function_privilege('service_role','public.cmi_complete_staff_password_change(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.cmi_complete_staff_password_change(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_complete_staff_password_change(uuid)','EXECUTE'),
  'password-change completion is available only through the authenticated server boundary'
);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
  'authenticated', 'authenticated', 'first-admin@example.test',
  'not-a-real-password-hash', pg_catalog.now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
);

select lives_ok(
  'select public.cmi_bootstrap_first_admin(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'', ''first-admin@example.test'', ''First Administrator'', ''PCG Missions Test Church'', ''Main Test Branch'')',
  'one confirmed Auth user can bootstrap the first administrator'
);
select is(
  (select must_change_password from public.staff_profile where auth_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'),
  true,
  'the initial administrator must replace the temporary password'
);
select ok(
  (select password_setup_expires_at > pg_catalog.now()
     and password_setup_expires_at <= pg_catalog.now() + interval '24 hours'
   from public.staff_profile
   where auth_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'),
  'the one-time administrator password expires within 24 hours'
);
select is((select count(*)::integer from public.church),1,'bootstrap creates one church');
select is((select count(*)::integer from public.branch),1,'bootstrap creates one initial branch');
select is((select count(*)::integer from public.staff_profile),1,'bootstrap creates one staff profile');
select is(
  (select count(*)::integer
   from public.role_capability rc
   join public.capability cap on cap.id=rc.capability_id
   where cap.code='staff.password_reset.manage'),
  1,
  'bootstrap grants the narrow password-reset permission to the Admin/Pastor role'
);
select is(
  (select count(*)::integer from public.role_capability),
  4,
  'bootstrap grants only the minimum Admin/Pastor control-plane capabilities'
);
select is(
  (select count(*)::integer
   from public.role_capability rc
   join public.capability cap on cap.id=rc.capability_id
   where cap.code in ('staff.directory.read','staff.account.manage','access.role.assign','staff.password_reset.manage')
     and rc.scope_mode='branch'),
  4,
  'the first administrator can view the staff directory, manage staff accounts, assign roles and review reset requests'
);
select is(
  (select count(*)::integer
   from public.role_capability rc
   join public.capability cap on cap.id=rc.capability_id
   where cap.code in (
     'prayer.oversight.read','care.oversight.read',
     'sms.campaign.send.scoped','report.export.scoped','access.capability.manage'
   )),
  0,
  'bootstrap grants no business-domain, pastoral oversight, SMS, export or policy-editing privileges'
);
select throws_ok(
  'select public.cmi_bootstrap_first_admin(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'', ''first-admin@example.test'', ''First Administrator'', ''PCG Missions Test Church'', ''Main Test Branch'')',
  '55000',
  'first-admin bootstrap is already used',
  'the first-administrator bootstrap cannot be repeated'
);

select lives_ok(
  'select public.cmi_complete_staff_password_change(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'')',
  'staff completes the first-login password change through the trusted server boundary'
);
select is(
  (select must_change_password from public.staff_profile where auth_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'),
  false,
  'the forced password-change flag is cleared after password setup'
);
select is(
  (select password_setup_expires_at from public.staff_profile where auth_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'),
  null,
  'the one-time password expiry is cleared after setup'
);

insert into private.staff_password_reset_request(
  target_profile_id, branch_id, email_normalized,
  email_fingerprint, ip_fingerprint, status
)
select
  sp.id, sra.branch_id, sp.email,
  repeat('c',64), repeat('d',64), 'pending'
from public.staff_profile sp
join public.staff_role_assignment sra on sra.staff_profile_id=sp.id
where sp.auth_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20';

select is(
  jsonb_array_length(public.cmi_list_staff_password_reset_requests(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    (select branch_id from public.staff_role_assignment sra
     join public.staff_profile sp on sp.id=sra.staff_profile_id
     where sp.auth_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20' limit 1)
  )),
  1,
  'an authorised administrator can list a branch password reset request'
);
select throws_ok(
  'select public.cmi_claim_staff_password_reset_request(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'', (select branch_id from public.staff_role_assignment sra join public.staff_profile sp on sp.id=sra.staff_profile_id where sp.auth_user_id=''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'' limit 1), (select id from private.staff_password_reset_request where email_fingerprint=repeat(''c'',64)))',
  '42501',
  'self-approval is not permitted',
  'an administrator cannot approve their own password-reset request'
);
select throws_ok(
  'select public.cmi_finish_staff_password_reset_request(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'', (select branch_id from public.staff_role_assignment sra join public.staff_profile sp on sp.id=sra.staff_profile_id where sp.auth_user_id=''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'' limit 1), (select id from private.staff_password_reset_request where email_fingerprint=repeat(''c'',64)), ''denied'', ''Self-review should be blocked for this test.'')',
  '42501',
  'self-review is not permitted',
  'an administrator cannot deny or review their own reset request'
);
select is(
  (select status from private.staff_password_reset_request where email_fingerprint=repeat('c',64)),
  'pending',
  'self-review attempts leave the password-reset request pending'
);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'authenticated', 'authenticated', 'staff-member@example.test',
  'not-a-real-password-hash', pg_catalog.now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
);

insert into public.staff_profile(auth_user_id, full_name, email, account_status)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  'Staff Member',
  'staff-member@example.test',
  'active'
);

insert into private.staff_password_reset_request(
  id, target_profile_id, branch_id, email_normalized,
  email_fingerprint, ip_fingerprint, status,
  reviewed_by_profile_id, reviewed_at
)
select
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  target.id,
  assignment.branch_id,
  lower(target.email),
  repeat('e', 64),
  repeat('f', 64),
  'pending',
  null,
  null
from public.staff_profile target
cross join public.staff_profile administrator
join public.staff_role_assignment assignment
  on assignment.staff_profile_id = administrator.id
where target.auth_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  and administrator.auth_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'
limit 1;

select lives_ok(
  $$select public.cmi_claim_staff_password_reset_request(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    (select branch_id from public.staff_role_assignment assignment
     join public.staff_profile administrator
       on administrator.id = assignment.staff_profile_id
     where administrator.auth_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'
     limit 1),
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
  )$$,
  'an authorised administrator can claim another staff member reset request'
);
select is(
  (select status from private.staff_password_reset_request
   where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  'processing',
  'claiming a reset request records the processing state'
);
select lives_ok(
  $$select public.cmi_finish_staff_password_reset_request(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    (select branch_id from public.staff_role_assignment assignment
     join public.staff_profile administrator
       on administrator.id = assignment.staff_profile_id
     where administrator.auth_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'
     limit 1),
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'approved',
    'Verified the request with the staff member.'
  )$$,
  'an authorised administrator can approve another staff member reset request'
);
select is(
  (select status from private.staff_password_reset_request
   where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  'approved',
  'approval is recorded on the reset request'
);
select ok(
  (select must_change_password
     and password_setup_expires_at > pg_catalog.now()
   from public.staff_profile
   where auth_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  'approval gates the staff account until a new password is saved'
);
select is(
  (select reviewed_by_profile_id
   from private.staff_password_reset_request
   where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  (select id from public.staff_profile
   where auth_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'),
  'the approving administrator is recorded on the request'
);
select lives_ok(
  $$select public.cmi_complete_staff_password_change(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  )$$,
  'the staff member can complete the approved password recovery'
);
select is(
  (select must_change_password
   from public.staff_profile
   where auth_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  false,
  'successful recovery clears the forced password-change gate'
);
select is(
  (select status from private.staff_password_reset_request
   where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  'completed',
  'successful recovery completes the reset request'
);
select is(
  (select count(*)::integer
   from private.staff_password_reset_audit
   where request_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
     and event_type = 'reset_completed'),
  1,
  'successful recovery is recorded in the append-only audit'
);

insert into private.staff_password_reset_request(
  email_fingerprint, ip_fingerprint, status
)
values (repeat('a',64), repeat('b',64), 'unmatched');

insert into private.staff_password_reset_audit(request_id,event_type)
select id, 'requested'
from private.staff_password_reset_request
where email_fingerprint = repeat('a',64);

select throws_ok(
  'update private.staff_password_reset_audit set event_type = ''approved'' where request_id = (select id from private.staff_password_reset_request where email_fingerprint = repeat(''a'',64))',
  '55000',
  'password reset audit is append-only',
  'reset audit UPDATE is rejected'
);
select throws_ok(
  'delete from private.staff_password_reset_audit where request_id = (select id from private.staff_password_reset_request where email_fingerprint = repeat(''a'',64))',
  '55000',
  'password reset audit is append-only',
  'reset audit DELETE is rejected'
);

select * from finish();
rollback;
