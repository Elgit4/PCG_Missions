begin;
select plan(21);

select has_table('public','ministry_report','Typed ministry report table exists');
select has_table('public','report_review_event','Append-only report review history exists');
select ok((select relrowsecurity from pg_class where oid='public.ministry_report'::regclass),
  'Ministry reports have RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.report_review_event'::regclass),
  'Report review history has RLS enabled');
select ok(
  not has_table_privilege('anon','public.ministry_report','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.ministry_report','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','public.report_review_event','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.report_review_event','SELECT,INSERT,UPDATE,DELETE'),
  'Browser roles have no direct report or review-history access');
select ok(
  has_table_privilege('service_role','public.ministry_report','SELECT,INSERT,UPDATE')
  and has_table_privilege('service_role','public.report_review_event','SELECT,INSERT'),
  'Trusted service role has only the report operations needed by the future API');

insert into public.church(id,name,timezone)
values('70000000-0000-4000-8000-000000000020','Report Test Church','Africa/Accra');
insert into public.branch(id,church_id,name,code,timezone)
values('71000000-0000-4000-8000-000000000020','70000000-0000-4000-8000-000000000020','Report Test Branch','REPORT-TEST','Africa/Accra');
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  '00000000-0000-0000-0000-000000000000',
  '72000000-0000-4000-8000-000000000020',
  'authenticated','authenticated','report-author@example.invalid',
  'not-a-real-password-hash',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
);
insert into public.staff_profile(id,auth_user_id,full_name,account_status,must_change_password)
values('73000000-0000-4000-8000-000000000020','72000000-0000-4000-8000-000000000020','Report Test Author','active',false);

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  '00000000-0000-0000-0000-000000000000',
  '72000000-0000-4000-8000-000000000021',
  'authenticated','authenticated','report-reviewer@example.invalid',
  'not-a-real-password-hash',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
);
insert into public.staff_profile(id,auth_user_id,full_name,account_status,must_change_password)
values('73000000-0000-4000-8000-000000000021','72000000-0000-4000-8000-000000000021','Report Test Reviewer','active',false);

select throws_ok(
  $q$ insert into public.ministry_report(branch_id,report_type,period_start,period_end,author_profile_id)
      values('71000000-0000-4000-8000-000000000020','daily_evangelism','2026-11-10','2026-11-11','73000000-0000-4000-8000-000000000020') $q$,
  '23514', null, 'Daily reports must cover exactly one local calendar day');
select throws_ok(
  $q$ insert into public.ministry_report(branch_id,report_type,period_start,period_end,author_profile_id,decisions_for_christ,gospel_presentations)
      values('71000000-0000-4000-8000-000000000020','daily_evangelism','2026-11-10','2026-11-10','73000000-0000-4000-8000-000000000020',3,2) $q$,
  '23514', null, 'Decisions for Christ cannot exceed gospel presentations');
select throws_ok(
  $q$ insert into public.ministry_report(branch_id,report_type,period_start,period_end,author_profile_id,followup_required,followup_completed)
      values('71000000-0000-4000-8000-000000000020','daily_evangelism','2026-11-10','2026-11-10','73000000-0000-4000-8000-000000000020',1,2) $q$,
  '23514', null, 'Completed follow-ups cannot exceed required follow-ups');
select throws_ok(
  $q$ insert into public.ministry_report(branch_id,report_type,period_start,period_end,author_profile_id)
      values('71000000-0000-4000-8000-000000000020','event_evangelism','2026-11-10','2026-11-10','73000000-0000-4000-8000-000000000020') $q$,
  '23514', null, 'Event evangelism reports require an event reference');

insert into public.ministry_report(branch_id,report_type,period_start,period_end,author_profile_id)
values('71000000-0000-4000-8000-000000000020','daily_evangelism','2026-11-10','2026-11-10','73000000-0000-4000-8000-000000000020');
select is((select count(*)::integer from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),1,
  'A valid typed daily report can be stored');
insert into public.report_review_event(report_id,reviewer_profile_id,decision,comment)
select id,'73000000-0000-4000-8000-000000000020','comment','Test review'
from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020';
select has_function('public', 'cmi_review_ministry_report', array['uuid','uuid','text','text'],
  'Atomic report review transaction exists');
select has_function('public', 'cmi_resubmit_ministry_report', array['uuid','uuid','integer','integer','integer','integer','integer','integer','integer','integer','integer'],
  'Author report resubmission transaction exists');
select ok(
  has_function_privilege('service_role','public.cmi_review_ministry_report(uuid,uuid,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.cmi_review_ministry_report(uuid,uuid,text,text)','EXECUTE'),
  'Only the trusted service role can execute the review transaction');
select ok(
  exists(select 1 from public.role_capability rc join public.role r on r.id=rc.role_id join public.capability c on c.id=rc.capability_id where r.code='admin_pastor' and c.code='report.review.branch' and rc.scope_mode='branch')
  and exists(select 1 from public.role_capability rc join public.role r on r.id=rc.role_id join public.capability c on c.id=rc.capability_id where r.code='coordinator' and c.code='report.review.branch' and rc.scope_mode='branch'),
  'Admin/Pastor and Coordinator receive branch report review');
select ok(
  exists(select 1 from public.role_capability rc join public.role r on r.id=rc.role_id join public.capability c on c.id=rc.capability_id where r.code='team_leader' and c.code='report.review.team' and rc.scope_mode='team')
  and exists(select 1 from public.role_capability rc join public.role r on r.id=rc.role_id join public.capability c on c.id=rc.capability_id where r.code='team_leader' and c.code='report.read.own' and rc.scope_mode='self')
  and not exists(select 1 from public.role_capability rc join public.role r on r.id=rc.role_id join public.capability c on c.id=rc.capability_id where r.code='team_leader' and c.code='report.read.own' and rc.scope_mode<>'self')
  and exists(select 1 from public.role_capability rc join public.role r on r.id=rc.role_id join public.capability c on c.id=rc.capability_id where r.code='field_worker' and c.code='report.submit.own' and rc.scope_mode='self')
  and exists(select 1 from public.role_capability rc join public.role r on r.id=rc.role_id join public.capability c on c.id=rc.capability_id where r.code='follow_up_volunteer' and c.code='report.submit.own' and rc.scope_mode='self'),
  'Team Leader, Field Worker and Follow-up Volunteer receive only their D-12 report scopes');
select ok(
  not exists(select 1 from public.role_capability rc join public.role r on r.id=rc.role_id join public.capability c on c.id=rc.capability_id where r.code='prayer_intercessor' and c.code like 'report.%'),
  'Prayer Intercessor receives no report capabilities');

update public.ministry_report set status='submitted', submitted_at=now()
where branch_id='71000000-0000-4000-8000-000000000020';

select throws_ok(
  $q$ select public.cmi_review_ministry_report(
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
    '73000000-0000-4000-8000-000000000020','approved',null
  ) $q$,
  '42501','REPORT_SELF_REVIEW_FORBIDDEN',
  'Authors cannot review their own reports');

select ok(
  (select (public.cmi_review_ministry_report(
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
    '73000000-0000-4000-8000-000000000021','returned','Please correct the figures.'
   )).status) = 'returned'
  and (select count(*) from public.report_review_event where report_id in
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020')) = 2,
  'Review status and append-only history commit atomically');

select ok(
  (select (public.cmi_resubmit_ministry_report(
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
    '73000000-0000-4000-8000-000000000020',
    4,3,1,2,1,1,0,0,0
  )).status) = 'submitted'
  and (select contacts_captured from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020') = 4
  and (select count(*) from public.report_review_event where report_id in
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020')) = 2,
  'Author correction resubmits the report without rewriting review history');

select * from finish();
rollback;
