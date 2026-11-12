begin;
select plan(12);

select is(
  (select count(*)::integer from public.role_capability),
  65,
  'MVP has the exact owner-directed role-capability grant count'
);

select ok(
  exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code='admin_pastor' and c.code='contact.read.scoped' and rc.scope_mode='branch'
  ),
  'Admin/Pastor can read visitor records within the branch'
);

select ok(
  exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code='coordinator' and c.code='contact.read.scoped' and rc.scope_mode='branch'
  ),
  'Coordinator can read visitor records within the branch'
);

select ok(
  exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code='team_leader' and c.code='contact.read.scoped' and rc.scope_mode='team'
  ),
  'Team Leader is limited to team scope'
);

select ok(
  exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code='field_worker' and c.code='contact.read.scoped' and rc.scope_mode='assigned'
  ),
  'Field Worker is limited to assigned visitors'
);

select ok(
  exists (
    select 1 from public.role_capability rc
    join public.role r on r.id = rc.role_id
    join public.capability c on c.id = rc.capability_id
    where r.code='follow_up_volunteer' and c.code='contact.read.scoped' and rc.scope_mode='assigned'
  ),
  'Follow-up Volunteer is limited to assigned visitors'
);

select is(
  (select count(*)::integer from public.role_capability rc
   join public.role r on r.id=rc.role_id
   join public.capability c on c.id=rc.capability_id
   where r.code='prayer_intercessor' and (c.code like 'contact.%' or c.code like 'followup.task.%')), 
  0,
  'Prayer Intercessor has no visitor CRM permissions'
);

select is(
  (select count(*)::integer from public.role_capability rc
   join public.role r on r.id=rc.role_id
   join public.capability c on c.id=rc.capability_id
   where r.code='coordinator' and c.code in ('staff.account.manage','access.role.assign','staff.password_reset.manage')),
  0,
  'Coordinator cannot administer staff accounts or role assignments'
);

select is(
  (select count(*)::integer from public.role_capability rc
   join public.role r on r.id=rc.role_id
   join public.capability c on c.id=rc.capability_id
   where c.code in ('contact.export.scoped','report.export.scoped','sms.campaign.send.scoped','sms.provider.configure','prayer.oversight.manage','care.oversight.manage','prayer.request.create','prayer.request.update.assigned','care.record.read.assigned','care.record.update.assigned','access.capability.manage')),
  0,
  'MVP does not grant exports, SMS, pastoral mutation, care assignment access or policy editing'
);

select ok(
  not has_table_privilege('anon','public.staff_profile','SELECT')
  and not has_table_privilege('authenticated','public.staff_profile','SELECT'),
  'Browser roles cannot directly read staff profiles'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.role_capability'::regclass),
  'Role capability table remains protected by RLS'
);

select ok(
  has_table_privilege('service_role','public.role_capability','SELECT'),
  'Trusted Edge Functions can resolve role grants'
);

select * from finish();
rollback;
