begin;
select plan(11);

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
  0,
  'No role grants are seeded while stakeholder approval is pending'
);
select has_function(
  'public',
  'cmi_create_contact',
  array['uuid','uuid','uuid','text','text','text','text','text','text','text','text','uuid','jsonb'],
  'Atomic contact capture function exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cmi_create_contact(uuid,uuid,uuid,text,text,text,text,text,text,text,text,uuid,uuid,jsonb)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute contact capture'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.cmi_create_contact(uuid,uuid,uuid,text,text,text,text,text,text,text,text,uuid,jsonb)',
    'EXECUTE'
  ),
  'Authenticated browser role cannot execute contact capture directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cmi_create_contact(uuid,uuid,uuid,text,text,text,text,text,text,text,text,uuid,jsonb)',
    'EXECUTE'
  ),
  'Only the trusted service role can execute contact capture'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.cmi_create_contact(uuid,uuid,uuid,text,text,text,text,text,text,text,text,uuid,jsonb)'::regprocedure),
  'Contact capture runs as a controlled definer function'
);
select ok(
  (select coalesce(array_to_string(proconfig, ','), '') like '%search_path=pg_catalog, public%'
   from pg_proc
   where oid = 'public.cmi_create_contact(uuid,uuid,uuid,text,text,text,text,text,text,text,text,uuid,jsonb)'::regprocedure),
  'Contact capture pins its search path'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.capability'::regclass),
  'Capability catalogue retains row-level security'
);

select * from finish();
rollback;
