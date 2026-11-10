begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_column(
  'public', 'staff_profile', 'must_change_password',
  'staff profiles carry a mandatory first-login password-change flag'
);
select has_column(
  'public', 'staff_profile', 'password_changed_at',
  'staff profiles record when the private password was last changed'
);
select has_table(
  'private', 'staff_password_reset_request',
  'reset requests are stored in an unexposed private schema'
);
select has_table(
  'private', 'staff_password_reset_audit',
  'reset lifecycle audit is stored in a private schema'
);

select ok(
  (select relrowsecurity from pg_class where oid='private.staff_password_reset_request'::regclass)
  and (select relrowsecurity from pg_class where oid='private.staff_password_reset_audit'::regclass),
  'RLS is enabled on both private authentication lifecycle tables'
);
select ok(
  not has_table_privilege('anon','private.staff_password_reset_request','SELECT')
  and not has_table_privilege('authenticated','private.staff_password_reset_request','SELECT')
  and not has_table_privilege('service_role','private.staff_password_reset_request','SELECT')
  and not has_table_privilege('anon','private.staff_password_reset_audit','SELECT')
  and not has_table_privilege('authenticated','private.staff_password_reset_audit','SELECT')
  and not has_table_privilege('service_role','private.staff_password_reset_audit','SELECT'),
  'private reset tables are not directly readable by browser or service roles'
);
select is(
  (select count(*)::integer from public.role_capability),
  0,
  'no role permissions are granted before the one-time bootstrap is run'
);
select ok(
  exists(select 1 from public.capability where code='staff.password_reset.manage' and is_active),
  'the narrow staff password-reset capability is present in the catalogue'
);

select ok(
  has_function_privilege('service_role','public.cmi_bootstrap_first_admin(uuid,text,text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.cmi_bootstrap_first_admin(uuid,text,text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_bootstrap_first_admin(uuid,text,text,text,text)','EXECUTE'),
  'bootstrap function can be called only by a trusted server'
);
select ok(
  has_function_privilege('service_role','public.cmi_request_staff_password_reset(text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.cmi_request_staff_password_reset(text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_request_staff_password_reset(text,text,text)','EXECUTE'),
  'public reset requests must pass through the rate-limited Edge Function'
);
select ok(
  has_function_privilege('service_role','public.cmi_list_staff_password_reset_requests(uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.cmi_claim_staff_password_reset_request(uuid,uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.cmi_finish_staff_password_reset_request(uuid,uuid,uuid,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_claim_staff_password_reset_request(uuid,uuid,uuid)','EXECUTE'),
  'admin review RPCs are server-only and validate actor capability inside the transaction'
);
select ok(
  has_function_privilege('service_role','public.cmi_complete_staff_password_change(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.cmi_complete_staff_password_change(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_complete_staff_password_change(uuid)','EXECUTE'),
  'password-change completion is available only through the authenticated server boundary'
);

insert into private.staff_password_reset_request(
  email_fingerprint, ip_fingerprint, status
)
values (repeat('a',64), repeat('b',64), 'unmatched');

insert into private.staff_password_reset_audit(request_id,event_type)
select id, 'requested'
from private.staff_password_reset_request
where email_fingerprint = repeat('a',64);

select throws_ok(
  $update private.staff_password_reset_audit
    set event_type='approved'
    where request_id=(select id from private.staff_password_reset_request where email_fingerprint=repeat('a',64))$,
  '55000',
  'password reset audit is append-only',
  'reset audit UPDATE is rejected'
);
select throws_ok(
  $delete from private.staff_password_reset_audit
    where request_id=(select id from private.staff_password_reset_request where email_fingerprint=repeat('a',64))$,
  '55000',
  'password reset audit is append-only',
  'reset audit DELETE is rejected'
);

select * from finish();
rollback;
