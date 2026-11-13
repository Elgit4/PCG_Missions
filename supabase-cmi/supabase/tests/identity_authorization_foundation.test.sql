-- CMI identity/authorization foundation tests.
-- Run only in the isolated /supabase-cmi local project after reviewing the
-- migration. Uses pgTAP and synthetic catalogue data only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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
  76,
  'the owner-directed visitor MVP role baseline is seeded'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.staff_profile'::regclass),
  'staff profile has row-level security enabled'
);

select ok(
  has_table_privilege('service_role', 'public.staff_profile', 'SELECT')
  and has_table_privilege('service_role', 'public.branch', 'SELECT')
  and has_table_privilege('service_role', 'public.role_capability', 'SELECT')
  and not has_table_privilege('service_role', 'public.staff_profile', 'INSERT')
  and not has_table_privilege('service_role', 'public.staff_profile', 'UPDATE')
  and not has_table_privilege('anon', 'public.staff_profile', 'SELECT')
  and not has_table_privilege('authenticated', 'public.staff_profile', 'SELECT'),
  'service_role has read-only identity lookups while browser access stays closed'
);

select ok(
  not has_schema_privilege('anon', 'public', 'USAGE')
  and not has_schema_privilege('authenticated', 'public', 'USAGE')
  and has_schema_privilege('service_role', 'public', 'USAGE'),
  'browser roles cannot use public schema; trusted Edge Functions retain schema usage'
);

create sequence public.cmi_default_acl_probe_seq;
create table public.cmi_default_acl_probe(id bigint);
create function public.cmi_default_acl_probe_fn()
returns integer language sql as 'select 1';

select ok(
  (select count(*) = 11
   from pg_class c
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public'
     and c.relname = any(array[
       'church','branch','staff_profile','role','capability',
       'role_capability','staff_role_assignment','team',
       'staff_team_membership','service_area','staff_area_coverage'
     ])
     and c.relrowsecurity),
  'RLS is explicitly enabled on every foundation table independent of hosted event triggers'
);
select ok(
  not has_table_privilege('anon', 'public.cmi_default_acl_probe', 'SELECT')
  and not has_table_privilege('authenticated', 'public.cmi_default_acl_probe', 'SELECT')
  and not has_table_privilege('service_role', 'public.cmi_default_acl_probe', 'SELECT'),
  'new public tables do not inherit browser or service-role table grants'
);
select ok(
  not has_sequence_privilege('anon', 'public.cmi_default_acl_probe_seq', 'USAGE')
  and not has_sequence_privilege('authenticated', 'public.cmi_default_acl_probe_seq', 'USAGE')
  and not has_sequence_privilege('service_role', 'public.cmi_default_acl_probe_seq', 'USAGE'),
  'new public sequences do not inherit browser or service-role privileges'
);
select ok(
  not has_function_privilege('anon', 'public.cmi_default_acl_probe_fn()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.cmi_default_acl_probe_fn()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.cmi_default_acl_probe_fn()', 'EXECUTE'),
  'new public functions do not inherit browser or service-role execute grants'
);
select ok(
  coalesce((
    select
      not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    from pg_proc p
    where p.oid=to_regprocedure('public.rls_auto_enable()')
  ), true),
  'RLS event-trigger helper cannot be called directly by browser or service roles'
);

drop function public.cmi_default_acl_probe_fn();
drop table public.cmi_default_acl_probe;
drop sequence public.cmi_default_acl_probe_seq;

select * from finish();
rollback;
