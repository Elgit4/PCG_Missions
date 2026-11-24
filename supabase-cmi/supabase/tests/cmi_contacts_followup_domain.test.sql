-- DRAFT pgTAP suite for contacts/follow-up domain.
-- Promote to supabase-cmi/tests only after the matching migration is generated
-- and applied in the isolated local workspace.
-- This file has not been executed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select has_table('public', 'contact', 'contact table exists');
select has_table('public', 'contact_capture', 'contact capture table exists');
select has_table('public', 'contact_assignment', 'contact assignment table exists');
select has_table('public', 'contact_note', 'contact note table exists');
select has_table('public', 'contact_interaction', 'contact interaction table exists');
select has_table('public', 'contact_merge', 'contact merge table exists');
select has_table('public', 'followup_list', 'follow-up list table exists');
select has_table('public', 'followup_task', 'follow-up task table exists');
select has_table('public', 'followup_task_event', 'follow-up task event table exists');

select extensions.ok(
  (select count(*) = 9
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'contact', 'contact_capture', 'contact_assignment', 'contact_note',
       'contact_interaction', 'contact_merge', 'followup_list',
       'followup_task', 'followup_task_event'
     ])
     and c.relrowsecurity),
  'RLS is enabled on all nine domain tables'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.contact', 'SELECT')
  and not has_table_privilege('authenticated', 'public.contact', 'SELECT'),
  'contact Data API access remains closed to browser roles'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.followup_task', 'SELECT')
  and not has_table_privilege('authenticated', 'public.followup_task', 'SELECT'),
  'follow-up Data API access remains closed to browser roles'
);

select extensions.ok(
  has_table_privilege('service_role', 'public.contact', 'SELECT')
  and has_table_privilege('service_role', 'public.contact', 'INSERT')
  and has_table_privilege('service_role', 'public.contact', 'UPDATE')
  and has_table_privilege('service_role', 'public.contact_capture', 'INSERT')
  and has_table_privilege('service_role', 'public.followup_task_event', 'INSERT')
  and not has_table_privilege('service_role', 'public.contact', 'DELETE')
  and not has_table_privilege('service_role', 'public.contact_capture', 'UPDATE')
  and not has_table_privilege('service_role', 'public.followup_task_event', 'DELETE'),
  'service_role receives minimal application table grants and append-only ledger protections'
);

select extensions.is(
  (select count(*)::integer from public.role_capability),
  76,
  'the owner-directed visitor MVP role baseline remains present'
);

-- Synthetic fixtures only.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'cmi-backend-test@example.invalid', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff_profile(auth_user_id, full_name, account_status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Synthetic Backend Tester', 'active');

insert into public.church(id, name, timezone)
values ('10000000-0000-4000-8000-000000000001', 'Synthetic CMI Test Church', 'Africa/Accra');

insert into public.branch(id, church_id, name, code)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Test Branch A', 'TEST-A'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Test Branch B', 'TEST-B');

insert into public.team(id, branch_id, name)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Test Team A'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Test Team B');

insert into public.contact(id, branch_id, first_name, phone_e164, created_by)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Visitor One', '+233200000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Visitor Two', '+233200000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

select extensions.is(
  (select count(*)::integer from public.contact where phone_e164 = '+233200000001'),
  2,
  'shared phone numbers are allowed and can be reviewed as possible duplicates'
);

select extensions.throws_ok(
  $q$ insert into public.contact(branch_id, first_name, phone_e164)
      values ('20000000-0000-4000-8000-000000000001', 'Bad Number', '0200000000') $q$,
  '23514', null, 'contact phone must use E.164 format'
);

insert into public.contact_capture (
  contact_id, branch_id, captured_by, capture_source, client_request_id, digest_key_version, request_digest, source_metadata
) values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'staff_manual',
  '50000000-0000-4000-8000-000000000001',
  1,
  decode(repeat('00', 32), 'hex'),
  '{"app_version":"test"}'::jsonb
);

select extensions.throws_ok(
  $q$ insert into public.contact_capture (
        contact_id, branch_id, capture_source, client_request_id, digest_key_version, request_digest, source_metadata
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'offline_queue',
        '50000000-0000-4000-8000-000000000001',
        1,
        decode(repeat('00', 32), 'hex'),
        '{}'::jsonb
      ) $q$,
  '23505', null, 'capture retries are idempotent per branch and request ID'
);

select extensions.throws_ok(
  $q$ insert into public.contact_capture (
        contact_id, branch_id, capture_source, client_request_id,
        digest_key_version, request_digest, source_metadata
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'staff_manual',
        '50000000-0000-4000-8000-000000000002',
        1,
        decode(repeat('00', 32), 'hex'),
        '{"pastoral_note":"must not be cached"}'::jsonb
      ) $q$,
  '23514', null, 'capture metadata rejects non-allowlisted sensitive fields'
);

select extensions.throws_ok(
  $q$ insert into public.contact_assignment (
        contact_id, branch_id, assigned_by
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      ) $q$,
  '23514', null, 'contact assignment requires exactly one assignment target'
);

select extensions.throws_ok(
  $q$ insert into public.contact_assignment (
        contact_id, branch_id, assignee_user_id, team_id, assigned_by
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '30000000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      ) $q$,
  '23514', null, 'contact assignment forbids simultaneous user and team targets'
);

select extensions.lives_ok(
  $q$insert into public.contact_assignment(
    contact_id,branch_id,assignee_user_id,assigned_by,starts_at,ends_at
  ) values (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    now()-interval '1 day',now()+interval '5 days'
  )$q$,
  'finite contact assignment period is accepted'
);
select extensions.throws_ok(
  $q$insert into public.contact_assignment(
    contact_id,branch_id,assignee_user_id,assigned_by,starts_at,ends_at
  ) values (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    now(),now()+interval '6 days'
  )$q$,
  '23P01',null,'overlapping assignments to the same contact and staff member are rejected'
);
select extensions.lives_ok(
  $q$insert into public.contact_assignment(
    contact_id,branch_id,team_id,assigned_by,starts_at,ends_at
  ) values (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    now()-interval '1 day',now()+interval '5 days'
  )$q$,
  'finite contact team-assignment period is accepted'
);
select extensions.throws_ok(
  $q$insert into public.contact_assignment(
    contact_id,branch_id,team_id,assigned_by,starts_at,ends_at
  ) values (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    now(),now()+interval '6 days'
  )$q$,
  '23P01',null,'overlapping assignments to the same contact and team are rejected'
);

select extensions.throws_ok(
  $q$ insert into public.contact_note (
        contact_id, branch_id, author_user_id, body, visibility, team_id
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'Synthetic note',
        'team_scope',
        '30000000-0000-4000-8000-000000000002'
      ) $q$,
  '23503', null, 'team-scoped note cannot reference a team from another branch'
);

select extensions.throws_ok(
  $q$ insert into public.followup_task (
        contact_id, branch_id, created_by, priority
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        6
      ) $q$,
  '23514', null, 'follow-up priority is constrained to the documented range'
);

select extensions.throws_ok(
  $q$ insert into public.followup_task (
        contact_id, branch_id, created_by
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      ) $q$,
  '23514', null, 'follow-up task requires exactly one primary assignment target'
);

select extensions.throws_ok(
  $q$ insert into public.followup_task (
        contact_id, branch_id, team_id, assignee_user_id, created_by
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      ) $q$,
  '23514', null, 'follow-up task forbids simultaneous team and individual assignment'
);

select extensions.throws_ok(
  $q$ insert into public.followup_task (
        contact_id, branch_id, created_by, status
      ) values (
        '40000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'completed'
      ) $q$,
  '23514', null, 'completed task must include a completion timestamp'
);

select * from finish();
rollback;
