begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_column('public', 'followup_task', 'client_request_id', 'task create idempotency key is stored');
select has_column('public', 'followup_task', 'digest_key_version', 'task digest key version is stored');
select has_column('public', 'followup_task', 'request_digest', 'task request digest is stored');
select has_function(
  'public', 'cmi_create_followup_task',
  array['uuid','uuid','uuid','smallint','bytea','uuid','uuid','uuid','uuid','smallint','timestamp with time zone','text'],
  'trusted follow-up task create function exists'
);
select has_function(
  'public', 'cmi_update_followup_task',
  array['uuid','uuid','uuid','jsonb'],
  'trusted follow-up task update function exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cmi_create_followup_task(uuid,uuid,uuid,smallint,bytea,uuid,uuid,uuid,uuid,smallint,timestamptz,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cmi_create_followup_task(uuid,uuid,uuid,smallint,bytea,uuid,uuid,uuid,uuid,smallint,timestamptz,text)',
    'EXECUTE'
  ),
  'browser roles cannot execute the task create transaction'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cmi_update_followup_task(uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cmi_update_followup_task(uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ),
  'browser roles cannot execute the task update transaction'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cmi_create_followup_task(uuid,uuid,uuid,smallint,bytea,uuid,uuid,uuid,uuid,smallint,timestamptz,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.cmi_update_followup_task(uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ),
  'the server service role can execute both task transactions'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.cmi_create_followup_task(uuid,uuid,uuid,smallint,bytea,uuid,uuid,uuid,uuid,smallint,timestamptz,text)'::regprocedure)
  and not (select prosecdef from pg_proc where oid = 'public.cmi_update_followup_task(uuid,uuid,uuid,jsonb)'::regprocedure),
  'task transactions use caller privileges and do not elevate to the migration owner'
);
select ok(
  (select count(*) = 0 from public.role_capability),
  'no role-capability grants are introduced by the task transaction migration'
);

-- Test fixtures are synthetic and fully rolled back at the end of this file.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
  'authenticated', 'authenticated', 'cmi-task-test@example.invalid',
  'not-a-real-password-hash', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.staff_profile(id, auth_user_id, full_name, account_status)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
  'Synthetic Task Worker',
  'active'
);

insert into public.church(id, name, timezone)
values ('10000000-0000-4000-8000-000000000020', 'Synthetic Task Test Church', 'Africa/Accra');

insert into public.branch(id, church_id, name, code)
values (
  '20000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000020',
  'Task Test Branch',
  'TASK-TEST'
);

insert into public.contact(id, branch_id, first_name, created_by)
values (
  '40000000-0000-4000-8000-000000000020',
  '20000000-0000-4000-8000-000000000020',
  'Task Test Contact',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20'
);

insert into public.staff_role_assignment(
  staff_profile_id, role_id, branch_id, assigned_by, starts_at, ends_at
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21',
  r.id,
  '20000000-0000-4000-8000-000000000020',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21',
  now() - interval '1 day',
  now() + interval '1 day'
from public.role r
where r.code = 'field_worker';

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'assigned'
from public.role r
cross join public.capability c
where r.code = 'field_worker'
  and c.code in ('followup.task.create', 'followup.task.update.scoped');

set local role service_role;
select extensions.ok(
  (public.cmi_create_followup_task(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    '20000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    1::smallint,
    decode(repeat('aa', 32), 'hex'),
    '40000000-0000-4000-8000-000000000020',
    null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    null,
    3::smallint,
    null,
    'Call this visitor'
  )->>'replayed')::boolean = false,
  'service_role creates an assigned task through the atomic transaction'
);

select extensions.ok(
  (public.cmi_create_followup_task(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    '20000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    1::smallint,
    decode(repeat('aa', 32), 'hex'),
    '40000000-0000-4000-8000-000000000020',
    null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    null,
    3::smallint,
    null,
    'Call this visitor'
  )->>'replayed')::boolean = true,
  'identical task create retry returns the original task'
);

select throws_ok(
  $q$ select public.cmi_create_followup_task(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    '20000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    1::smallint,
    decode(repeat('bb', 32), 'hex'),
    '40000000-0000-4000-8000-000000000020',
    null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    null,
    3::smallint,
    null,
    'Different request'
  ) $q$,
  '23505', null,
  'reusing a task request key with a changed digest is rejected'
);

select extensions.ok(
  (public.cmi_update_followup_task(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    '20000000-0000-4000-8000-000000000020',
    (select id from public.followup_task
     where client_request_id = '50000000-0000-4000-8000-000000000020'),
    '{"status":"completed","priority":2}'::jsonb
  )->'task'->>'status') = 'completed',
  'authorized task update completes the task and changes its priority'
);

select throws_ok(
  $q$ select public.cmi_update_followup_task(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20',
    '20000000-0000-4000-8000-000000000020',
    (select id from public.followup_task
     where client_request_id = '50000000-0000-4000-8000-000000000020'),
    '{"status":"cancelled"}'::jsonb
  ) $q$,
  '22023', null,
  'completed task cannot transition directly to cancelled'
);

select throws_ok(
  $q$ select public.cmi_update_followup_task(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '20000000-0000-4000-8000-000000000020',
    (select id from public.followup_task
     where client_request_id = '50000000-0000-4000-8000-000000000020'),
    '{"task_note":"unauthorized"}'::jsonb
  ) $q$,
  '42501', null,
  'task update is rejected when actor has no active staff profile'
);
reset role;

select is(
  (select count(*)::integer from public.followup_task
   where branch_id = '20000000-0000-4000-8000-000000000020'),
  1,
  'idempotent creation leaves exactly one task'
);

select is(
  (select count(*)::integer from public.followup_task_event event
   join public.followup_task task on task.id = event.task_id
   where task.branch_id = '20000000-0000-4000-8000-000000000020'),
  2,
  'create and completion each append one lifecycle event'
);

select ok(
  (select status = 'completed' and completed_at is not null and priority = 2
   from public.followup_task
   where client_request_id = '50000000-0000-4000-8000-000000000020'),
  'completed task stores completion timestamp and updated priority'
);

select ok(
  (select bool_and(event_type in ('created', 'completed'))
   from public.followup_task_event event
   join public.followup_task task on task.id = event.task_id
   where task.branch_id = '20000000-0000-4000-8000-000000000020'),
  'task lifecycle history records creation and completion without storing note text'
);

select ok(
  not has_table_privilege('anon', 'public.followup_task', 'SELECT')
  and not has_table_privilege('authenticated', 'public.followup_task', 'SELECT'),
  'follow-up task table remains closed to browser reads'
);

select * from finish();
rollback;
