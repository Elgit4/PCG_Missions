begin;
select plan(30);

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

-- Assign only the minimum report capabilities needed by the workflow fixture.
insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by)
select '73000000-0000-4000-8000-000000000020',r.id,'71000000-0000-4000-8000-000000000020','73000000-0000-4000-8000-000000000021'
from public.role r where r.code='field_worker';
insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by)
select '73000000-0000-4000-8000-000000000021',r.id,'71000000-0000-4000-8000-000000000020','73000000-0000-4000-8000-000000000021'
from public.role r where r.code='coordinator';

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  '00000000-0000-0000-0000-000000000000',
  '72000000-0000-4000-8000-000000000022',
  'authenticated','authenticated','report-unassigned@example.invalid',
  'not-a-real-password-hash',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
);
insert into public.staff_profile(id,auth_user_id,full_name,account_status,must_change_password)
values('73000000-0000-4000-8000-000000000022','72000000-0000-4000-8000-000000000022','Unassigned Report User','active',false);

-- A Team Leader with a valid active team membership but an incomplete
-- first-login password change must not be permitted to review reports.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  '00000000-0000-0000-0000-000000000000',
  '72000000-0000-4000-8000-000000000023',
  'authenticated','authenticated','report-team-reviewer@example.invalid',
  'not-a-real-password-hash',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
);
insert into public.staff_profile(id,auth_user_id,full_name,account_status,must_change_password)
values('73000000-0000-4000-8000-000000000023','72000000-0000-4000-8000-000000000023','Pending Team Leader','active',true);
insert into public.team(id,branch_id,name)
values('74000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000020','Report Test Team');
insert into public.staff_role_assignment(staff_profile_id,role_id,branch_id,assigned_by)
select '73000000-0000-4000-8000-000000000023',r.id,'71000000-0000-4000-8000-000000000020','73000000-0000-4000-8000-000000000021'
from public.role r where r.code='team_leader';
insert into public.staff_team_membership(
  staff_profile_id,team_id,branch_id,membership_role,created_by
) values
  ('73000000-0000-4000-8000-000000000020','74000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000020','member','73000000-0000-4000-8000-000000000021'),
  ('73000000-0000-4000-8000-000000000023','74000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000020','leader','73000000-0000-4000-8000-000000000021');

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

insert into public.ministry_report(branch_id,report_type,period_start,period_end,author_profile_id,team_id)
values('71000000-0000-4000-8000-000000000020','daily_evangelism','2026-11-10','2026-11-10','73000000-0000-4000-8000-000000000020','74000000-0000-4000-8000-000000000020');
select is((select count(*)::integer from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),1,
  'A valid typed daily report can be stored');
select throws_ok(
  $q$ insert into public.ministry_report(branch_id,report_type,period_start,period_end,author_profile_id)
      values('71000000-0000-4000-8000-000000000020','daily_evangelism','2026-11-10','2026-11-10','73000000-0000-4000-8000-000000000020') $q$,
  '23505', null, 'Duplicate author, period and team/event report scope is rejected');

insert into public.report_review_event(report_id,actor_profile_id,decision,comment)
select id,'73000000-0000-4000-8000-000000000020','comment','Test review'
from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020';
select throws_ok(
  $q$ update public.report_review_event set decision='approved'
      where report_id in (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020') $q$,
  '42501','REPORT_REVIEW_HISTORY_IMMUTABLE',
  'Review history cannot be rewritten');
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

select throws_ok(
  $q$ select public.cmi_review_ministry_report(
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
    '73000000-0000-4000-8000-000000000022','approved',null
  ) $q$,
  '42501','REPORT_REVIEW_SCOPE_REQUIRED',
  'A staff member without an active report review grant is denied transactionally');

select throws_ok(
  $q$ select public.cmi_review_ministry_report(
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
    '73000000-0000-4000-8000-000000000023','approved',null
  ) $q$,
  '42501','REPORT_REVIEW_SCOPE_REQUIRED',
  'A Team Leader with incomplete first-login password change cannot review through team scope');
select lives_ok(
  $q$ select public.cmi_review_ministry_report(
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
    '73000000-0000-4000-8000-000000000021','returned','Please correct the figures.'
  ) $q$,
  'Review transaction commits status and history together');
select is(
  (select status from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
  'returned',
  'Reviewer return changes report status');
select is(
  (select count(*)::integer from public.report_review_event where report_id in
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020')),
  2,
  'Review event is appended to existing review history');

select lives_ok(
  $q$ select public.cmi_resubmit_ministry_report(
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
    '73000000-0000-4000-8000-000000000020',
    4,3,1,2,1,1,0,0,0
  ) $q$,
  'Author can atomically correct and resubmit a returned report');
select is(
  (select status from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
  'submitted',
  'Corrected report returns to submitted state');
select is(
  (select contacts_captured from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020'),
  4,
  'Corrected count values are stored');
select is(
  (select count(*)::integer from public.report_review_event where report_id in
    (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020')),
  3,
  'Resubmission appends to immutable report history');
select is(
  (select actor_profile_id::text || ':' || decision
   from public.report_review_event
   where report_id in (select id from public.ministry_report where branch_id='71000000-0000-4000-8000-000000000020')
   order by created_at desc limit 1),
  '73000000-0000-4000-8000-000000000020:resubmitted',
  'History records the original author as the resubmission actor');

select * from finish();
rollback;
