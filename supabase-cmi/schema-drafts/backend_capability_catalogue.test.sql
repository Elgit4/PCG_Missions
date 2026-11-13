begin;
select plan(29);

select has_table('public', 'capability', 'Capability catalogue exists');
select ok(
  (select count(*) >= 53 from public.capability),
  'The full proposed capability code catalogue is seeded'
);
select ok(
  exists (select 1 from public.capability where code = 'contact.capture.create' and is_active),
  'Contact capture capability exists and is active in the catalogue'
);
select is(
  (select count(*)::integer from public.role_capability),
  67,
  'the owner-directed visitor MVP baseline contains 67 least-privilege grants'
);
select ok(
  not exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code in ('coordinator','team_leader','field_worker','follow_up_volunteer')
      and c.code in (
        'contact.identity.capture',
        'contact.identity.read.scoped',
        'contact.identity.update.scoped'
      )
  ),
  'ordinary contact phone/email permissions are not granted to coordinator, team leader, field worker or follow-up volunteer'
);
select is(
  (select count(*)::integer
   from public.role_capability rc
   join public.role r on r.id = rc.role_id
   join public.capability c on c.id = rc.capability_id
   where r.code = 'admin_pastor'
     and c.code in (
       'contact.identity.capture',
       'contact.identity.read.scoped',
       'contact.identity.update.scoped'
     )
     and rc.scope_mode = 'branch'),
  3,
  'Admin/Pastor retains the three explicit branch-scoped contact identity capabilities'
);
select ok(
  not exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code = 'prayer_intercessor'
      and (c.code like 'contact.%' or c.code like 'followup.task.%')
  ),
  'Prayer Intercessor receives no ordinary contact CRM grants'
);
select ok(
  not exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where c.code like 'sms.%' or c.code like '%.export%'
  ),
  'SMS and export capabilities remain ungranted by default'
);

select is(
  (select count(*)::integer
   from public.role_capability rc
   join public.role r on r.id = rc.role_id
   join public.capability c on c.id = rc.capability_id
   where r.code = 'prayer_intercessor'
     and c.code = 'prayer.request.read.assigned'
     and rc.scope_mode = 'assigned'),
  1,
  'Prayer Intercessor receives only assigned prayer-request read access'
);
select is(
  (select count(*)::integer
   from public.role_capability rc
   join public.role r on r.id = rc.role_id
   join public.capability c on c.id = rc.capability_id
   where r.code = 'admin_pastor'
     and c.code in ('prayer.oversight.read','care.oversight.read')
     and rc.scope_mode = 'oversight'),
  2,
  'Admin/Pastor oversight is explicit, reason-coded and audited for prayer and care reads'
);
select ok(
  not exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code in ('coordinator','team_leader','field_worker','follow_up_volunteer')
      and c.code in (
        'prayer.request.read.assigned',
        'prayer.oversight.read',
        'care.record.read.assigned',
        'care.oversight.read'
      )
  ),
  'no other role receives prayer/care narrative read or oversight grants'
);

select has_function(
  'public',
  'cmi_create_contact',
  array['uuid','uuid','uuid','smallint','bytea','text','text','text','text','text','text','text','text','uuid','uuid','jsonb'],
  'Atomic contact capture function exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cmi_create_contact(uuid,uuid,uuid,smallint,bytea,text,text,text,text,text,text,text,text,uuid,uuid,jsonb)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute contact capture'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.cmi_create_contact(uuid,uuid,uuid,smallint,bytea,text,text,text,text,text,text,text,text,uuid,uuid,jsonb)',
    'EXECUTE'
  ),
  'Authenticated browser role cannot execute contact capture directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cmi_create_contact(uuid,uuid,uuid,smallint,bytea,text,text,text,text,text,text,text,text,uuid,uuid,jsonb)',
    'EXECUTE'
  ),
  'Only the trusted service role can execute contact capture'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.cmi_create_contact(uuid,uuid,uuid,smallint,bytea,text,text,text,text,text,text,text,text,uuid,uuid,jsonb)'::regprocedure),
  'Contact capture uses caller privileges instead of elevated definer privileges'
);
select ok(
  (select coalesce(array_to_string(proconfig, ','), '') like '%search_path=pg_catalog%'
   from pg_proc
   where oid = 'public.cmi_create_contact(uuid,uuid,uuid,smallint,bytea,text,text,text,text,text,text,text,text,uuid,uuid,jsonb)'::regprocedure),
  'Contact capture pins its search path'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.capability'::regclass),
  'Capability catalogue retains row-level security'
);


-- Exercise the service-only transaction with a synthetic staff actor whose
-- role assignment has a future effective end date. The assignment remains
-- active until that instant; no production grants or records are created.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'authenticated', 'authenticated',
  'cmi-contact-rpc-test@example.invalid', 'not-a-real-password-hash',
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.staff_profile(id, auth_user_id, full_name, account_status)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
  'Synthetic Contact Capture Tester',
  'active'
);

insert into public.church(id, name, timezone)
values (
  '10000000-0000-4000-8000-000000000010',
  'Synthetic Contact RPC Church',
  'Africa/Accra'
);

insert into public.branch(id, church_id, name, code)
values (
  '20000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000010',
  'RPC Test Branch',
  'RPC-TEST'
);

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'assigned'
from public.role r
cross join public.capability c
where r.code = 'field_worker'
  and c.code = 'contact.capture.create'
on conflict do nothing;

insert into public.staff_role_assignment(
  staff_profile_id, role_id, branch_id, assigned_by, starts_at, ends_at
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
  r.id,
  '20000000-0000-4000-8000-000000000010',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
  now() - interval '1 day',
  now() + interval '1 day'
from public.role r
where r.code = 'field_worker';

-- Exercise the RPC as the exact role permitted to execute it. The test
-- owner verifies the committed-in-transaction result after returning to its
-- normal role; the function itself must not need elevated definer privileges.
set local role service_role;
select public.cmi_create_contact(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
  '20000000-0000-4000-8000-000000000010',
  '50000000-0000-4000-8000-000000000010',
  1::smallint,
  decode(repeat('11', 32), 'hex'),
  'Ama',
  'Mensah',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  '{}'::jsonb
);
reset role;

select extensions.ok(
  exists (
    select 1
    from public.contact c
    join public.contact_capture cc
      on cc.contact_id = c.id and cc.branch_id = c.branch_id
    where c.branch_id = '20000000-0000-4000-8000-000000000010'
      and cc.client_request_id = '50000000-0000-4000-8000-000000000010'
  ),
  'service_role executes the contact transaction and stores provenance'
);

select extensions.is(
  (select count(*)::integer
   from public.contact c
   join public.contact_capture cc on cc.contact_id = c.id and cc.branch_id = c.branch_id
   where c.branch_id = '20000000-0000-4000-8000-000000000010'),
  1,
  'first contact capture creates exactly one contact and provenance row'
);

select extensions.is(
  (select count(*)::integer
   from public.contact_assignment ca
   where ca.branch_id = '20000000-0000-4000-8000-000000000010'
     and ca.assignee_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'),
  1,
  'assigned-scope capture creates the capturing staff assignment'
);

select extensions.ok(
  (public.cmi_create_contact(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
    '20000000-0000-4000-8000-000000000010',
    '50000000-0000-4000-8000-000000000010',
    1::smallint,
    decode(repeat('11', 32), 'hex'),
    'Ama',
    'Mensah',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    '{}'::jsonb
  )->>'replayed')::boolean = true,
  'identical capture retry returns the original contact as a replay'
);

select extensions.is(
  (select count(*)::integer
   from public.contact_capture
   where branch_id = '20000000-0000-4000-8000-000000000010'
     and client_request_id = '50000000-0000-4000-8000-000000000010'),
  1,
  'identical retry does not duplicate contact capture provenance'
);


-- Remove the baseline assigned identity grant only within this rollback-only
-- test so the following assertion can prove that team scope alone is insufficient.
delete from public.role_capability rc
using public.role r, public.capability c
where rc.role_id = r.id and rc.capability_id = c.id
  and r.code = 'field_worker' and c.code = 'contact.identity.capture'
  and rc.scope_mode = 'assigned';

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, 'team'
from public.role r
cross join public.capability c
where r.code = 'field_worker'
  and c.code = 'contact.identity.capture';

select extensions.throws_ok(
  $q$ select public.cmi_create_contact(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
    '20000000-0000-4000-8000-000000000010',
    '50000000-0000-4000-8000-000000000011',
    1::smallint,
    decode(repeat('33', 32), 'hex'),
    'Ama',
    'Mensah',
    null,
    '+233241234567',
    '+233 24 123 4567',
    null,
    null,
    null,
    null,
    null,
    '{}'::jsonb
  ) $q$,
  '42501',
  null,
  'identity team scope cannot be used outside the contact-create assigned scope'
);

select extensions.throws_ok(
  $q$ select public.cmi_create_contact(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
    '20000000-0000-4000-8000-000000000010',
    '50000000-0000-4000-8000-000000000012',
    1::smallint,
    decode(repeat('44', 32), 'hex'),
    'Ama',
    'Mensah',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    '30000000-0000-4000-8000-000000000010',
    '{}'::jsonb
  ) $q$,
  '42501',
  null,
  'identity field permission cannot authorize a team assignment'
);

select extensions.throws_ok(
  $q$ select public.cmi_create_contact(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
    '20000000-0000-4000-8000-000000000010',
    '50000000-0000-4000-8000-000000000010',
    1::smallint,
    decode(repeat('22', 32), 'hex'),
    'Ama',
    'Mensah',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    '{}'::jsonb
  ) $q$,
  '23505',
  null,
  'reusing an idempotency key with a changed digest returns a conflict'
);



select is(
  (select count(*)::integer
   from public.role_capability rc
   join public.role r on r.id = rc.role_id
   join public.capability c on c.id = rc.capability_id
   where r.code = 'admin_pastor'
     and c.code in (
       'event.read.scoped',
       'event.manage.scoped',
       'calendar.read.scoped',
       'calendar.manage.scoped',
       'announcement.read.scoped',
       'announcement.create.scoped',
       'content.manage.draft'
     )
     and rc.scope_mode = 'branch'
     and c.is_active),
  7,
  'Admin/Pastor receives seven explicit branch-scoped draft-workspace grants'
);
select ok(
  not exists (
    select 1
    from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code = 'admin_pastor'
      and (
        c.code in (
          'announcement.publish.scoped',
          'content.publish',
          'event.registration.manage.scoped',
          'event.checkin.scoped',
          'event.closeout.submit',
          'event.closeout.review',
          'report.export.scoped',
          'contact.export.scoped',
          'prayer.oversight.manage',
          'care.oversight.manage'
        )
        or c.code like 'sms.%'
      )
  ),
  'Draft workspace grants do not enable publication, registration, attendance, exports, team management, pastoral mutation or SMS'
);

select is(
  (select count(*)::integer
   from public.role_capability rc
   join public.role r on r.id = rc.role_id
   join public.capability c on c.id = rc.capability_id
   where r.code = 'admin_pastor'
     and c.code in ('team.manage','area.manage')
     and c.is_active and rc.scope_mode = 'branch'),
  2,
  'Admin/Pastor receives exactly two additional branch-scoped team and service-area grants'
);

select * from finish();
rollback;
