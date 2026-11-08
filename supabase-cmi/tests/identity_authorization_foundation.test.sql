-- CMI identity/authorization foundation tests.
-- Run only in the isolated /supabase-cmi local project after reviewing the
-- migration. Uses pgTAP and synthetic catalogue data only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public', 'church', 'church table exists');
select has_table('public', 'branch', 'branch table exists');
select has_table('public', 'staff_profile', 'staff profile table exists');
select has_table('public', 'role', 'role catalogue exists');
select has_table('public', 'capability', 'capability catalogue exists');
select has_table('public', 'role_capability', 'role capability mapping exists');
select has_table('public', 'staff_role_assignment', 'staff role assignment exists');
select has_table('public', 'team', 'team table exists');
select has_table('public', 'staff_team_membership', 'team membership exists');
select has_table('public', 'service_area', 'service area exists');
select has_table('public', 'staff_area_coverage', 'area coverage exists');

select is(
  (select count(*)::integer from public.role),
  6,
  'exactly six CMI roles are seeded'
);

select is(
  (select count(*)::integer from public.role_capability),
  0,
  'no unapproved role-capability grants are seeded'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.staff_profile'::regclass),
  'staff profile has row-level security enabled'
);

select * from finish();
rollback;
