-- DRAFT pgTAP suite for the restricted prayer/care schema.
-- Promote to supabase-cmi/tests only after the SQL has been reviewed,
-- generated as a CLI migration and applied in the isolated local workspace.
-- Synthetic fixtures only. This file has not been executed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('public', 'prayer_request', 'prayer request table exists');
select has_table('public', 'prayer_assignment', 'prayer assignment table exists');
select has_table('public', 'prayer_access_audit', 'prayer access audit table exists');
select has_table('public', 'care_group', 'care group table exists');
select has_table('public', 'care_group_membership', 'care group membership table exists');
select has_table('public', 'care_record', 'care record table exists');
select has_table('public', 'care_assignment', 'care assignment table exists');
select has_table('public', 'care_interaction', 'care interaction table exists');
select has_table('public', 'care_access_audit', 'care access audit table exists');

select extensions.ok(
  (select count(*) = 9
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'prayer_request', 'prayer_assignment', 'prayer_access_audit',
       'care_group', 'care_group_membership', 'care_record',
       'care_assignment', 'care_interaction', 'care_access_audit'
     ])
     and c.relrowsecurity),
  'RLS enabled for all nine restricted pastoral tables'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.prayer_request', 'SELECT')
  and not has_table_privilege('authenticated', 'public.prayer_request', 'SELECT')
  and not has_table_privilege('anon', 'public.care_record', 'SELECT')
  and not has_table_privilege('authenticated', 'public.care_record', 'SELECT'),
  'browser roles cannot directly read prayer or care narratives'
);

select extensions.ok(
  not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'prayer_request', 'prayer_assignment', 'prayer_access_audit',
        'care_group', 'care_group_membership', 'care_record',
        'care_assignment', 'care_interaction', 'care_access_audit'
      ])
  ),
  'no direct client policies exist before the audited read service is implemented'
);

select extensions.ok(
  has_table_privilege('service_role', 'public.prayer_request', 'SELECT')
  and has_table_privilege('service_role', 'public.care_record', 'SELECT')
  and has_table_privilege('service_role', 'public.prayer_access_audit', 'INSERT')
  and has_table_privilege('service_role', 'public.care_access_audit', 'INSERT')
  and not has_table_privilege('service_role', 'public.prayer_access_audit', 'SELECT')
  and not has_table_privilege('service_role', 'public.prayer_access_audit', 'UPDATE')
  and not has_table_privilege('service_role', 'public.care_access_audit', 'DELETE'),
  'service_role can read restricted records and append audits without mutating audit history'
);

select extensions.is(
  (select count(*)::integer from public.role_capability),
  67,
  'the owner-directed visitor MVP role baseline remains present'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'cmi-pastoral-test@example.invalid', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff_profile(auth_user_id, full_name, account_status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Synthetic Pastoral Tester', 'active');

insert into public.church(id, name, timezone)
values ('11000000-0000-4000-8000-000000000001', 'Synthetic Pastoral Test Church', 'Africa/Accra');

insert into public.branch(id, church_id, name, code)
values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Pastoral Branch A', 'PAST-A'),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', 'Pastoral Branch B', 'PAST-B');

insert into public.contact(id, branch_id, first_name, created_by)
values ('41000000-0000-4000-8000-000000000001',
        '21000000-0000-4000-8000-000000000001',
        'Synthetic Contact', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.prayer_request(
  id, branch_id, contact_id, created_by, request_text
) values (
  '61000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Synthetic private prayer request for database testing.'
);

insert into public.prayer_assignment(
  prayer_request_id, branch_id, intercessor_user_id, assigned_by
) values (
  '61000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

select extensions.throws_ok(
  $q$ insert into public.prayer_assignment(
        prayer_request_id, branch_id, intercessor_user_id, assigned_by
      ) values (
        '61000000-0000-4000-8000-000000000001',
        '21000000-0000-4000-8000-000000000001',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      ) $q$,
  '23505', null, 'only one active assignment per intercessor/request pair'
);

update public.prayer_assignment
set ends_at=now()+interval '5 days'
where prayer_request_id='61000000-0000-4000-8000-000000000001'
  and intercessor_user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select extensions.throws_ok(
  $q$insert into public.prayer_assignment(
    prayer_request_id,branch_id,intercessor_user_id,assigned_by,starts_at,ends_at
  ) values (
    '61000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    now(),now()+interval '6 days'
  )$q$,
  '23P01',null,'overlapping time-bounded assignments to the same prayer request and intercessor are rejected'
);

select extensions.throws_ok(
  $q$ insert into public.prayer_request(branch_id, request_text, status)
      values ('21000000-0000-4000-8000-000000000001', 'invalid status fixture', 'unknown') $q$,
  '23514', null, 'prayer request status is constrained'
);

select extensions.throws_ok(
  $q$ insert into public.prayer_assignment(
        prayer_request_id, branch_id, intercessor_user_id, assigned_by, ends_at
      ) values (
        '61000000-0000-4000-8000-000000000001',
        '21000000-0000-4000-8000-000000000001',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        now() - interval '1 hour'
      ) $q$,
  '23514', null, 'assignment end must be after its start'
);

insert into public.prayer_access_audit(
  prayer_request_id, branch_id, actor_user_id, action, request_id
) values (
  '61000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'read',
  'synthetic-request-1'
);

select extensions.throws_ok(
  $q$ update public.prayer_access_audit
      set reason = 'tamper attempt'
      where request_id = 'synthetic-request-1' $q$,
  'P0001', 'This audit relation is append-only',
  'prayer access audit rows cannot be updated'
);

select extensions.throws_ok(
  $q$ insert into public.prayer_access_audit(
        prayer_request_id, branch_id, actor_user_id, action
      ) values (
        '61000000-0000-4000-8000-000000000001',
        '21000000-0000-4000-8000-000000000001',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'oversight'
      ) $q$,
  '23514', null, 'oversight audit event requires a reason'
);

insert into public.care_group(id, branch_id, name)
values ('71000000-0000-4000-8000-000000000001',
        '21000000-0000-4000-8000-000000000001',
        'Synthetic Care Group');

select extensions.throws_ok(
  $q$ insert into public.care_group_membership(
        care_group_id, contact_id, branch_id
      ) values (
        '71000000-0000-4000-8000-000000000001',
        '41000000-0000-4000-8000-000000000001',
        '21000000-0000-4000-8000-000000000002'
      ) $q$,
  '23503', null, 'care group membership cannot cross branches'
);

select extensions.lives_ok(
  $q$insert into public.care_group_membership(
    care_group_id,contact_id,branch_id,starts_at,ends_at,created_by
  ) values (
    '71000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    now()-interval '1 day',now()+interval '5 days',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  )$q$,
  'finite care group membership period is accepted'
);
select extensions.throws_ok(
  $q$insert into public.care_group_membership(
    care_group_id,contact_id,branch_id,starts_at,ends_at,created_by
  ) values (
    '71000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    now(),now()+interval '6 days',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  )$q$,
  '23P01',null,'overlapping membership for the same contact and care group is rejected'
);

insert into public.care_record(
  id, branch_id, contact_id, created_by
) values (
  '81000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

select extensions.lives_ok(
  $q$insert into public.care_assignment(
    care_record_id,branch_id,assignee_user_id,assigned_by,starts_at,ends_at
  ) values (
    '81000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    now()-interval '1 day',now()+interval '5 days'
  )$q$,
  'finite care assignment period is accepted'
);
select extensions.throws_ok(
  $q$insert into public.care_assignment(
    care_record_id,branch_id,assignee_user_id,assigned_by,starts_at,ends_at
  ) values (
    '81000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    now(),now()+interval '6 days'
  )$q$,
  '23P01',null,'overlapping care assignments to the same record and worker are rejected'
);

insert into public.care_access_audit(
  care_record_id, branch_id, actor_user_id, action, request_id
) values (
  '81000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'read',
  'synthetic-care-request-1'
);

select extensions.throws_ok(
  $q$ delete from public.care_access_audit
      where request_id = 'synthetic-care-request-1' $q$,
  'P0001', 'This audit relation is append-only',
  'care access audit rows cannot be deleted'
);

select * from finish();
rollback;
