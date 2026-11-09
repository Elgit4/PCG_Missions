-- DRAFT pgTAP suite for audited prayer and pastoral-care read operations.
-- Synthetic fixtures only. Role grants and records are rolled back at end.
-- Run only through the isolated CMI CI workflow.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select has_function(
  'public', 'cmi_read_prayer_request',
  array['uuid','uuid','uuid','text','text','text'],
  'Audited prayer read transaction exists'
);
select has_function(
  'public', 'cmi_read_care_record',
  array['uuid','uuid','uuid','text','text','text'],
  'Audited care read transaction exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cmi_read_prayer_request(uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute prayer read transaction'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.cmi_read_prayer_request(uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Authenticated browser role cannot execute prayer read transaction directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cmi_read_prayer_request(uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Trusted service role can execute prayer read transaction'
);
select ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.cmi_read_prayer_request(uuid,uuid,uuid,text,text,text)'::regprocedure
  ),
  'Prayer read transaction uses SECURITY INVOKER'
);
select ok(
  (
    select coalesce(array_to_string(proconfig, ','), '') like '%search_path=pg_catalog%'
    from pg_proc
    where oid = 'public.cmi_read_prayer_request(uuid,uuid,uuid,text,text,text)'::regprocedure
  ),
  'Prayer read transaction pins search_path'
);
select is(
  (select count(*)::integer from public.role_capability),
  0,
  'No stakeholder role grants exist before synthetic fixtures'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cmi_read_care_record(uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Trusted service role can execute care read transaction'
);
select ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.cmi_read_care_record(uuid,uuid,uuid,text,text,text)'::regprocedure
  ),
  'Care read transaction uses SECURITY INVOKER'
);
select ok(
  (
    select coalesce(array_to_string(proconfig, ','), '') like '%search_path=pg_catalog%'
    from pg_proc
    where oid = 'public.cmi_read_care_record(uuid,uuid,uuid,text,text,text)'::regprocedure
  ),
  'Care read transaction pins search_path'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001', 'authenticated', 'authenticated',
   'cmi-pastoral-assigned@example.invalid', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002', 'authenticated', 'authenticated',
   'cmi-pastoral-oversight@example.invalid', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003', 'authenticated', 'authenticated',
   'cmi-pastoral-unassigned@example.invalid', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff_profile(id, auth_user_id, full_name, account_status)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb101',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001', 'Synthetic Assigned Worker', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb102',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002', 'Synthetic Oversight Reviewer', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb103',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003', 'Synthetic Unassigned Worker', 'active');

insert into public.church(id, name, timezone)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba001', 'Synthetic Pastoral Operations Church', 'Africa/Accra');

insert into public.branch(id, church_id, name, code)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba001', 'Pastoral Branch A', 'PAST-OPS-A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba102', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba001', 'Pastoral Branch B', 'PAST-OPS-B');

insert into public.role_capability(role_id, capability_id, scope_mode)
select r.id, c.id, g.scope_mode
from (
  values
    ('prayer_intercessor', 'prayer.request.read.assigned', 'assigned'),
    ('follow_up_volunteer', 'care.record.read.assigned', 'assigned'),
    ('admin_pastor', 'prayer.oversight.read', 'oversight'),
    ('admin_pastor', 'care.oversight.read', 'oversight')
) as g(role_code, capability_code, scope_mode)
join public.role r on r.code = g.role_code
join public.capability c on c.code = g.capability_code;

insert into public.staff_role_assignment(
  staff_profile_id, role_id, branch_id, assigned_by, starts_at
)
select
  p.staff_profile_id,
  r.id,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb102',
  now() - interval '1 day'
from (
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb101', 'prayer_intercessor'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb101', 'follow_up_volunteer'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb102', 'admin_pastor'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb103', 'prayer_intercessor'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb103', 'follow_up_volunteer')
) as p(staff_profile_id, role_code)
join public.role r on r.code = p.role_code;

insert into public.contact(id, branch_id, first_name, created_by)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba201',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'Synthetic Restricted Contact',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb101'
);

insert into public.prayer_request(
  id, branch_id, contact_id, created_by, request_text
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba201',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'Synthetic confidential prayer request for the assigned intercessor.'
);

insert into public.prayer_assignment(
  prayer_request_id, branch_id, intercessor_user_id, assigned_by
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002'
);

insert into public.care_record(
  id, branch_id, contact_id, created_by
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba201',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001'
);

insert into public.care_assignment(
  care_record_id, branch_id, assignee_user_id, assigned_by
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002'
);

insert into public.care_interaction(
  care_record_id, branch_id, actor_user_id, interaction_type, outcome_code, restricted_note
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'visit',
  'follow_up_required',
  'Synthetic confidential pastoral interaction note.'
);

set local role service_role;
select extensions.ok(
  (public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'assigned',
    null,
    'synthetic-prayer-assigned-read'
  )->'request'->>'request_text') =
    'Synthetic confidential prayer request for the assigned intercessor.',
  'Assigned prayer reader receives the allowlisted narrative projection'
);
select extensions.ok(
  not (
    public.cmi_read_prayer_request(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
      'assigned',
      null,
      'synthetic-prayer-no-contact-id'
    )->'request' ? 'contact_id'
  ),
  'Prayer projection does not expose linked contact identity'
);
select extensions.ok(
  exists (
    select 1 from public.prayer_access_audit
    where request_id = 'synthetic-prayer-assigned-read'
      and actor_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001'
      and action = 'read'
      and safe_metadata->>'access_mode' = 'assigned'
  ),
  'Assigned prayer narrative read is audited in the same transaction'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'assigned', null, 'synthetic-prayer-unassigned'
  ) $q$,
  'P0002', 'prayer request not found',
  'Intercessor cannot read a prayer request assigned to another user'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba102',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'assigned', null, 'synthetic-prayer-wrong-branch'
  ) $q$,
  '42501', 'pastoral read not authorized',
  'Branch role assignment is required before any prayer read'
);
select extensions.ok(
  (public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'oversight',
    'pastoral_review',
    'synthetic-prayer-oversight'
  )->'request'->>'id') = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
  'Explicitly scoped oversight capability can read the prayer request'
);
select extensions.ok(
  exists (
    select 1 from public.prayer_access_audit
    where request_id = 'synthetic-prayer-oversight'
      and actor_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002'
      and action = 'oversight'
      and reason = 'pastoral_review'
  ),
  'Prayer oversight read stores the reason and oversight audit action'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'oversight', null, 'synthetic-prayer-no-reason'
  ) $q$,
  '22023', 'oversight reason code is required',
  'Prayer oversight requires a reason'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'assigned', 'not an oversight access', 'synthetic-prayer-assigned-reason'
  ) $q$,
  '22023', 'assigned read must not include an oversight reason',
  'Assigned reads cannot inject a privileged oversight reason'
);

select extensions.ok(
  (public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
    'assigned',
    null,
    'synthetic-care-assigned-read'
  )->'interactions'->0->>'restricted_note') =
    'Synthetic confidential pastoral interaction note.',
  'Assigned care reader receives the restricted interaction projection'
);
select extensions.ok(
  not (
    public.cmi_read_care_record(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
      'assigned',
      null,
      'synthetic-care-no-contact-id'
    )->'record' ? 'contact_id'
  ),
  'Care projection does not expose linked contact identity'
);
select extensions.ok(
  exists (
    select 1 from public.care_access_audit
    where request_id = 'synthetic-care-assigned-read'
      and actor_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001'
      and action = 'read'
      and safe_metadata->>'access_mode' = 'assigned'
  ),
  'Assigned care narrative read is audited in the same transaction'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
    'assigned', null, 'synthetic-care-unassigned'
  ) $q$,
  'P0002', 'care record not found',
  'Care worker cannot read a care record assigned to another user'
);
select extensions.ok(
  (public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
    'oversight',
    'continuity_of_care',
    'synthetic-care-oversight'
  )->'record'->>'id') = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
  'Explicitly scoped oversight capability can read the care record'
);
select extensions.ok(
  exists (
    select 1 from public.care_access_audit
    where request_id = 'synthetic-care-oversight'
      and actor_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002'
      and action = 'oversight'
      and reason = 'continuity_of_care'
      and (safe_metadata->>'interaction_count')::integer = 1
  ),
  'Care oversight audit records reason and safe interaction count'
);
reset role;

select extensions.throws_ok(
  $q$ update public.prayer_access_audit
      set reason = 'synthetic audit tamper'
      where request_id = 'synthetic-prayer-assigned-read' $q$,
  'P0001', 'This audit relation is append-only',
  'Prayer access audit rows cannot be updated'
);
select extensions.throws_ok(
  $q$ delete from public.care_access_audit
      where request_id = 'synthetic-care-assigned-read' $q$,
  'P0001', 'This audit relation is append-only',
  'Care access audit rows cannot be deleted'
);
select extensions.throws_ok(
  $q$ truncate public.prayer_access_audit $q$,
  'P0001', 'This audit relation is append-only',
  'Prayer audit ledger cannot be truncated'
);
select extensions.throws_ok(
  $q$ truncate public.care_access_audit $q$,
  'P0001', 'This audit relation is append-only',
  'Care audit ledger cannot be truncated'
);

select * from finish();
rollback;
