-- ChurchConnect authorization and schema tests.
-- Run after migrations with: supabase test db
-- Uses isolated fixture identities and rolls back all fixture data.

begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

-- ---------------------------------------------------------------------------
-- Fixture identities
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'church-admin@example.test', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'mission-one@example.test', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'authenticated', 'authenticated', 'mission-two@example.test', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.user_profiles (user_id, role_code, full_name, account_status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ADMIN', 'Test Administrator', 'ACTIVE'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'MISSION_MEMBER', 'Mission Member One', 'ACTIVE'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'MISSION_MEMBER', 'Mission Member Two', 'ACTIVE');

insert into public.service_types (service_type_id, service_name, service_category)
values ('33333333-3333-4333-8333-333333333333', 'Sunday Service Test', 'SUNDAY');

insert into public.integration_stages (
  integration_stage_id, stage_name, stage_order, is_active
)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Test Orientation', 1, true);

insert into public.visitors (
  visitor_id, full_name, normalized_phone, lifecycle_status, engagement_status,
  follow_up_required, created_by_user_id, updated_by_user_id
)
values
  ('11111111-1111-4111-8111-111111111111', 'Visitor One', '+233200000001',
   'OPEN', 'NEW', true,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'Visitor Two', '+233200000002',
   'OPEN', 'NEW', true,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.assignments (
  assignment_id, visitor_id, primary_user_id, assigned_by_user_id,
  assignment_status, started_at
)
values
  ('44444444-4444-4444-8444-444444444444',
   '11111111-1111-4111-8111-111111111111',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE', now()),
  ('55555555-5555-4555-8555-555555555555',
   '22222222-2222-4222-8222-222222222222',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE', now());

insert into public.follow_up_tasks (
  task_id, visitor_id, assignment_id, assigned_user_id, created_by_user_id,
  task_title, channel, due_at, task_status
)
values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Test welcome call', 'CALL', now() + interval '1 day', 'PENDING'
);

insert into public.prayer_requests (
  prayer_request_id, visitor_id, created_by_user_id, request_text
)
values (
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Synthetic test request; no real pastoral data.'
);

-- Member Two is the creator and automatically receives the creator grant.
-- Member One receives a separate record-specific grant and PASTORAL_VIEW.
insert into public.prayer_request_access (
  prayer_request_id, user_id, granted_by_user_id
)
values (
  '77777777-7777-4777-8777-777777777777',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

-- Revocation is retained as history; a later active grant to the same user
-- and record must be possible without overwriting the prior grant.
update public.prayer_request_access
set revoked_at = now()
where prayer_request_id = '77777777-7777-4777-8777-777777777777'
  and user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into public.prayer_request_access (
  prayer_request_id, user_id, granted_by_user_id
)
values (
  '77777777-7777-4777-8777-777777777777',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

insert into public.user_permission_grants (
  grant_id, user_id, permission_code, granted_by_user_id, grant_status
)
values
  ('88888888-8888-4888-8888-888888888881',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'PASTORAL_VIEW',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE'),
  ('88888888-8888-4888-8888-888888888882',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'INTEGRATION_RECORD',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE'),
  ('88888888-8888-4888-8888-888888888883',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'VISITOR_REGISTER',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE'),
  ('88888888-8888-4888-8888-888888888884',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'ATTENDANCE_RECORD',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE'),
  ('88888888-8888-4888-8888-888888888885',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'PASTORAL_VIEW',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE');

-- ---------------------------------------------------------------------------
-- Schema-level assertions as the migration/test owner
-- ---------------------------------------------------------------------------

select extensions.is(
  (select count(*)::integer from public.roles),
  2,
  'Only the two approved application roles exist'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  'RLS is enabled on every public application table'
);

select extensions.ok(
  not pg_catalog.has_table_privilege('anon', 'public.visitors', 'select'),
  'Anonymous clients have no SELECT grant on visitor records'
);

select extensions.ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.user_permission_grants', 'insert'),
  'Authenticated clients cannot write permission grants directly'
);

select extensions.is(
  (select count(*)::integer from public.prayer_request_access
   where prayer_request_id = '77777777-7777-4777-8777-777777777777'
     and user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     and revoked_at is null),
  1,
  'A revoked sensitive access grant can be re-issued without overwriting history'
);

-- ---------------------------------------------------------------------------
-- Mission Member One: only the assigned visitor and permitted related rows
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select extensions.is(
  (select count(*)::integer from public.visitors),
  1,
  'Registration and attendance capabilities do not grant directory-wide visitor visibility'
);

select extensions.is(
  (select count(*)::integer from public.visitors
   where visitor_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'Mission Member One cannot see another member’s visitor'
);

select extensions.throws_ok(
  $q$
    insert into public.visitor_visits (
      visitor_id, service_type_id, recorded_by_user_id, visit_date
    )
    values (
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      (select auth.uid()),
      date '2026-11-07'
    )
  $q$,
  '42501',
  null,
  'Attendance capability alone cannot record attendance for an unrelated visitor'
);

select extensions.is(
  (select count(*)::integer from public.follow_up_tasks),
  1,
  'Mission Member One can see their assigned follow-up task'
);

select extensions.is(
  (select count(*)::integer from public.follow_up_task_history
   where task_id = '66666666-6666-4666-8666-666666666666'
     and change_type = 'CREATED'),
  1,
  'Task creation is captured in append-only follow-up task history'
);

select extensions.is(
  (select count(*)::integer from public.prayer_requests),
  1,
  'A member with PASTORAL_VIEW and a record grant can read that prayer request'
);

update public.visitors
set residential_area = 'Updated Test Area',
    updated_by_user_id = (select auth.uid())
where visitor_id = '11111111-1111-4111-8111-111111111111';

select extensions.is(
  (select residential_area from public.visitors
   where visitor_id = '11111111-1111-4111-8111-111111111111'),
  'Updated Test Area',
  'Mission Member can update permitted contact/profile fields on an assigned visitor'
);

select extensions.is_empty(
  $q$
    update public.visitors
       set residential_area = 'Unauthorized Change',
           updated_by_user_id = (select auth.uid())
     where visitor_id = '22222222-2222-4222-8222-222222222222'
     returning visitor_id
  $q$,
  'Mission Member cannot update a visitor outside their assignment'
);

update public.follow_up_tasks
set due_at = due_at + interval '1 day',
    task_status = 'RESCHEDULED'
where task_id = '66666666-6666-4666-8666-666666666666';

select extensions.is(
  (select count(*)::integer from public.follow_up_task_history
   where task_id = '66666666-6666-4666-8666-666666666666'),
  2,
  'Task rescheduling appends a second task-history event'
);

insert into public.team_notes (
  visitor_id, assignment_id, author_user_id, note_body, visibility_scope
)
values (
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  (select auth.uid()),
  'Synthetic internal collaboration note.',
  'ASSIGNED_TEAM'
);

select extensions.is(
  (select count(*)::integer from public.team_notes),
  1,
  'Mission Member can add and read an internal note for an assigned visitor'
);

select extensions.throws_ok(
  $q$
    insert into public.assignments (
      visitor_id, primary_user_id, assigned_by_user_id, assignment_status
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'ACTIVE'
    )
  $q$,
  '42501',
  null,
  'Mission Member cannot create or change primary assignments'
);

select extensions.throws_ok(
  $q$
    insert into public.user_permission_grants (
      user_id, permission_code, granted_by_user_id, grant_status
    )
    values (
      (select auth.uid()), 'REPORT_EXPORT', (select auth.uid()), 'ACTIVE'
    )
  $q$,
  '42501',
  null,
  'Mission Member cannot grant themselves additional capabilities'
);

select extensions.is(
  (select count(*)::integer from public.audit_logs),
  0,
  'Mission Member cannot read administrative audit logs'
);

update public.visitors
set current_integration_stage_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    updated_by_user_id = (select auth.uid())
where visitor_id = '11111111-1111-4111-8111-111111111111';

select extensions.is(
  (select count(*)::integer from public.visitor_stage_history
   where visitor_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'Integration-stage update creates an auditable history event'
);

update public.visitors
set current_integration_stage_id = null,
    updated_by_user_id = (select auth.uid())
where visitor_id = '11111111-1111-4111-8111-111111111111';

select extensions.is(
  (select count(*)::integer from public.visitor_stage_history
   where visitor_id = '11111111-1111-4111-8111-111111111111'
     and previous_integration_stage_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
     and integration_stage_id is null),
  1,
  'Clearing an integration stage records the previous stage and the null destination'
);

reset role;

-- ---------------------------------------------------------------------------
-- Mission Member Two: own visitor only; no pastoral/integration capability
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

select extensions.is(
  (select count(*)::integer from public.visitors),
  1,
  'Mission Member Two sees only their own assigned visitor'
);

select extensions.is(
  (select count(*)::integer from public.prayer_requests),
  0,
  'A record grant alone is insufficient without PASTORAL_VIEW capability'
);

select extensions.throws_ok(
  $q$
    update public.visitors
       set current_integration_stage_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
           updated_by_user_id = (select auth.uid())
     where visitor_id = '22222222-2222-4222-8222-222222222222'
  $q$,
  '42501',
  null,
  'Member without INTEGRATION_RECORD cannot change integration stage'
);

reset role;

insert into public.user_permission_grants (
  user_id, permission_code, granted_by_user_id, grant_status
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'VISITOR_DIRECTORY_VIEW',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'ACTIVE'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

select extensions.is(
  (select count(*)::integer from public.visitors),
  2,
  'Explicit VISITOR_DIRECTORY_VIEW grant enables full visitor-directory search'
);

reset role;

-- ---------------------------------------------------------------------------
-- Handover: a retained open task grants narrow, temporary access to the former
-- owner. The new owner can access the visitor but not the former owner's task.
-- ---------------------------------------------------------------------------

update public.assignments
set assignment_status = 'ENDED',
    ended_at = now()
where assignment_id = '44444444-4444-4444-8444-444444444444';

insert into public.assignments (
  assignment_id, visitor_id, primary_user_id, assigned_by_user_id,
  assignment_status, started_at, assignment_reason
)
values (
  '99999999-9999-4999-8999-999999999999',
  '11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'ACTIVE', now(), 'Test handover; existing task intentionally retained'
);

insert into public.assignment_history (
  visitor_id, previous_assignment_id, new_assignment_id, actor_user_id,
  change_type, change_reason
)
values (
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  '99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'HANDOVER', 'Synthetic handover test'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select extensions.is(
  (select count(*)::integer from public.visitors
   where visitor_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'Former owner retains visitor access while an open task remains assigned to them'
);

select extensions.is(
  (select count(*)::integer from public.follow_up_tasks
   where task_id = '66666666-6666-4666-8666-666666666666'),
  1,
  'Former owner can still access the specifically retained task'
);

insert into public.follow_up_records (
  visitor_id, task_id, assignment_id, actor_user_id,
  channel, contact_outcome, interaction_summary
)
values (
  '11111111-1111-4111-8111-111111111111',
  '66666666-6666-4666-8666-666666666666',
  '44444444-4444-4444-8444-444444444444',
  (select auth.uid()),
  'CALL', 'NO_ANSWER', 'Synthetic retained-task follow-up attempt.'
);

select extensions.is(
  (select count(*)::integer from public.follow_up_records
   where task_id = '66666666-6666-4666-8666-666666666666'),
  1,
  'Former owner can record an interaction against their retained task'
);

reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

select extensions.is(
  (select count(*)::integer from public.visitors
   where visitor_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'New primary owner can access the visitor after handover'
);

select extensions.is(
  (select count(*)::integer from public.follow_up_tasks
   where task_id = '66666666-6666-4666-8666-666666666666'),
  0,
  'New primary owner cannot access a task explicitly retained by the former owner'
);

select extensions.is(
  (select count(*)::integer from public.follow_up_task_history
   where task_id = '66666666-6666-4666-8666-666666666666'),
  0,
  'New primary owner cannot read history for a task retained by the former owner'
);

reset role;

-- ---------------------------------------------------------------------------
-- Administrator and integrity assertions
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select extensions.is(
  (select count(*)::integer from public.visitors),
  2,
  'Administrator can view all visitor profiles'
);

select extensions.is(
  (select count(*)::integer from public.prayer_requests),
  0,
  'Administrator cannot read sensitive pastoral data without a record-specific grant'
);

reset role;

select extensions.throws_ok(
  $q$
    insert into public.user_permission_grants (
      user_id, permission_code, granted_by_user_id, grant_status
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'REPORT_EXPORT',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'ACTIVE'
    )
  $q$,
  '23514',
  null,
  'Administrator cannot receive a non-sensitive Mission Member capability'
);

insert into public.prayer_request_access (
  prayer_request_id, user_id, granted_by_user_id
)
values (
  '77777777-7777-4777-8777-777777777777',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select extensions.is(
  (select count(*)::integer from public.prayer_requests),
  1,
  'Administrator with PASTORAL_VIEW and a record-specific grant can read restricted pastoral data'
);

reset role;

select extensions.throws_ok(
  $q$
    insert into public.assignments (
      visitor_id, primary_user_id, assigned_by_user_id, assignment_status
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'ACTIVE'
    )
  $q$,
  '23505',
  null,
  'Database prevents a second active primary assignment for one visitor'
);

select * from extensions.finish();
rollback;
