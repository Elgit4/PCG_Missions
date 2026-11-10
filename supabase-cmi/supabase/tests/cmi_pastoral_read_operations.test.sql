-- DRAFT pgTAP suite for audited prayer and pastoral-care read operations.
-- Synthetic fixtures only. Role grants and records are rolled back at end.
-- Run only through the isolated CMI CI workflow.

begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

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
  65,
  'the reviewed visitor MVP role baseline exists before synthetic fixtures'
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
  not has_function_privilege(
    'anon',
    'public.cmi_read_care_record(uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute care read transaction'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.cmi_read_care_record(uuid,uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'Authenticated browser role cannot execute care read transaction directly'
);
select ok(
  not has_table_privilege('anon', 'public.prayer_access_audit', 'SELECT')
  and not has_table_privilege('authenticated', 'public.prayer_access_audit', 'SELECT'),
  'Browser roles cannot read prayer access audit rows directly'
);
select ok(
  not has_table_privilege('anon', 'public.care_access_audit', 'SELECT')
  and not has_table_privilege('authenticated', 'public.care_access_audit', 'SELECT'),
  'Browser roles cannot read care access audit rows directly'
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
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb004', 'authenticated', 'authenticated',
   'cmi-pastoral-no-capability@example.invalid', 'not-a-real-password-hash',
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff_profile(id, auth_user_id, full_name, account_status)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb101',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001', 'Synthetic Assigned Worker', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb102',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002', 'Synthetic Oversight Reviewer', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb103',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003', 'Synthetic Unassigned Worker', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb104',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb004', 'Synthetic Staff Without Grants', 'active');

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
  p.staff_profile_id::uuid,
  r.id,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb102'::uuid,
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
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001'
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

-- Populate more than the response limit so the projection cap is exercised.
insert into public.care_interaction(
  care_record_id, branch_id, actor_user_id, interaction_type,
  outcome_code, restricted_note, occurred_at
)
select
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'visit',
  'follow_up_required',
  'Synthetic restricted history row ' || series.n::text,
  now() - (series.n * interval '1 second')
from generate_series(1, 105) as series(n);

-- Separate records test assignments that have expired or were explicitly revoked.
insert into public.prayer_request(
  id, branch_id, contact_id, created_by, request_text
) values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba302',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba201',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'Synthetic expired prayer assignment fixture.'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba303',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba201',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'Synthetic revoked prayer assignment fixture.'
  );

insert into public.prayer_assignment(
  prayer_request_id, branch_id, intercessor_user_id, assigned_by, starts_at, ends_at
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba302',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
  now() - interval '2 days',
  now() - interval '1 day'
);

insert into public.prayer_assignment(
  prayer_request_id, branch_id, intercessor_user_id, assigned_by, starts_at, revoked_at
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba303',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
  now() - interval '2 days',
  now() - interval '1 day'
);

insert into public.care_record(
  id, branch_id, contact_id, created_by
) values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba402',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba201',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba403',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba201',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001'
  );

insert into public.care_assignment(
  care_record_id, branch_id, assignee_user_id, assigned_by, starts_at, ends_at
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba402',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
  now() - interval '2 days',
  now() - interval '1 day'
);

insert into public.care_assignment(
  care_record_id, branch_id, assignee_user_id, assigned_by, starts_at, revoked_at
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba403',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
  now() - interval '2 days',
  now() - interval '1 day'
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
reset role;
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
set local role service_role;
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
reset role;
select extensions.ok(
  not exists (
    select 1 from public.prayer_access_audit
    where request_id = 'synthetic-prayer-unassigned'
  ),
  'A denied prayer read does not create an access-audit event'
);
set local role service_role;
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
reset role;
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
set local role service_role;
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
select extensions.is(
  pg_catalog.jsonb_array_length(public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
    'assigned',
    null,
    'synthetic-care-history-limit'
  )->'interactions'),
  100,
  'Care read returns no more than the latest 100 restricted interactions'
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
reset role;
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
set local role service_role;
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
reset role;
select extensions.ok(
  not exists (
    select 1 from public.care_access_audit
    where request_id = 'synthetic-care-unassigned'
  ),
  'A denied care read does not create an access-audit event'
);
set local role service_role;
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
reset role;
select extensions.ok(
  exists (
    select 1 from public.care_access_audit
    where request_id = 'synthetic-care-oversight'
      and actor_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002'
      and action = 'oversight'
      and reason = 'continuity_of_care'
      and (safe_metadata->>'interaction_count')::integer = 100
  ),
  'Care oversight audit records reason and the bounded returned interaction count'
);
select extensions.ok(
  not exists (
    select 1 from public.prayer_access_audit
    where request_id = 'synthetic-prayer-assigned-read'
      and safe_metadata::text like '%Synthetic confidential prayer request%'
  ),
  'Prayer audit metadata never duplicates prayer narrative text'
);
select extensions.ok(
  not exists (
    select 1 from public.care_access_audit
    where request_id = 'synthetic-care-assigned-read'
      and safe_metadata::text like '%Synthetic confidential pastoral interaction note%'
  ),
  'Care audit metadata never duplicates restricted interaction text'
);
set local role service_role;
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'oversight', 'free_text_not_allowed', 'synthetic-prayer-invalid-reason'
  ) $q$,
  '22023', 'oversight reason code is required',
  'Database rejects prayer oversight reason codes outside its allowlist'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
    'oversight', 'free_text_not_allowed', 'synthetic-care-invalid-reason'
  ) $q$,
  '22023', 'oversight reason code is required',
  'Database rejects care oversight reason codes outside its allowlist'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb004',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'assigned', null, 'synthetic-prayer-no-capability'
  ) $q$,
  '42501', 'pastoral read not authorized',
  'Active staff without any role grant cannot read prayer narratives'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb004',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
    'assigned', null, 'synthetic-care-no-capability'
  ) $q$,
  '42501', 'pastoral read not authorized',
  'Active staff without any role grant cannot read care narratives'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba302',
    'assigned', null, 'synthetic-prayer-expired-assignment'
  ) $q$,
  'P0002', 'prayer request not found',
  'Expired prayer assignments no longer authorize narrative reads'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba303',
    'assigned', null, 'synthetic-prayer-revoked-assignment'
  ) $q$,
  'P0002', 'prayer request not found',
  'Revoked prayer assignments no longer authorize narrative reads'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba402',
    'assigned', null, 'synthetic-care-expired-assignment'
  ) $q$,
  'P0002', 'care record not found',
  'Expired care assignments no longer authorize restricted reads'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba403',
    'assigned', null, 'synthetic-care-revoked-assignment'
  ) $q$,
  'P0002', 'care record not found',
  'Revoked care assignments no longer authorize restricted reads'
);
select extensions.throws_ok(
  $q$ select public.cmi_read_care_record(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba102',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba401',
    'assigned', null, 'synthetic-care-wrong-branch'
  ) $q$,
  '42501', 'pastoral read not authorized',
  'Care record reads require an active role assignment in that branch'
);
reset role;
update public.staff_profile
set account_status = 'inactive',
    deactivated_at = now()
where auth_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002';
set local role service_role;
select extensions.throws_ok(
  $q$ select public.cmi_read_prayer_request(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301',
    'oversight', 'pastoral_review', 'synthetic-prayer-inactive-staff'
  ) $q$,
  '42501', 'pastoral read not authorized',
  'Inactive staff cannot read prayer narratives even with an oversight grant'
);
reset role;
update public.staff_profile
set account_status = 'active',
    deactivated_at = null
where auth_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002';

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
