-- Draft pgTAP suite for CMI events, attendance, transport and public content.
-- Synthetic fixtures only. Executed by the isolated CMI CI workflow.
begin;
create extension if not exists pgtap with schema extensions;
select plan(77);

select has_table('public','event','event table exists');
select has_table('public','event_staff_assignment','typed staff assignment table exists');
select has_table('public','event_team_assignment','typed team assignment table exists');
select has_table('public','event_registration','event registration table exists');
select has_table('public','transport_option','transport option table exists');
select has_table('public','transport_reservation','transport reservation table exists');
select has_table('public','event_checkin','event check-in table exists');
select extensions.ok(
  (select pg_get_constraintdef(oid) not like '%offline_sync%'
   from pg_constraint
   where conrelid='public.event_checkin'::regclass
     and conname='event_checkin_source_check'),
  'offline check-in source is not accepted while offline mode is disabled'
);
select has_table('public','event_closeout','event closeout table exists');
select has_table('public','event_closeout_event','event closeout history table exists');
select has_table('public','event_idempotency_receipt','event idempotency receipt ledger exists');
select has_column('public','event_idempotency_receipt','request_digest','idempotency request digest is stored');
select has_column('public','event_idempotency_receipt','digest_key_version','HMAC key version is stored for rotation-safe replay');
select has_index('public','event_idempotency_receipt','event_idempotency_receipt_created_idx','idempotency receipt retention index exists');
select has_table('public','calendar_entry','typed calendar entry table exists');
select has_table('public','announcement','announcement table exists');
select has_table('public','announcement_team_audience','typed team audience table exists');
select has_table('public','announcement_event_audience','typed event audience table exists');
select has_table('public','church_public_profile','church public profile table exists');
select has_table('public','welcome_message','welcome message table exists');
select has_table('public','sermon','sermon table exists');
select has_table('public','daily_word','daily word table exists');
select has_table('public','digital_tract','digital tract table exists');
select has_table('public','external_document_link','typed external document link table exists');

select extensions.ok(
  (select count(*) = 20 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname = any(array[
    'event','event_staff_assignment','event_team_assignment','event_registration',
    'transport_option','transport_reservation','event_checkin','event_closeout',
    'event_closeout_event','event_idempotency_receipt','calendar_entry','announcement','announcement_team_audience',
    'announcement_event_audience','church_public_profile','welcome_message','sermon',
    'daily_word','digital_tract','external_document_link'
   ]) and c.relrowsecurity),
  'RLS is enabled on all 20 event and public-content tables'
);
select extensions.ok(
  not has_table_privilege('anon','public.event','SELECT')
  and not has_table_privilege('authenticated','public.event','SELECT')
  and not has_table_privilege('anon','public.event_registration','INSERT')
  and not has_table_privilege('authenticated','public.event_registration','INSERT')
  and not has_table_privilege('anon','public.event_idempotency_receipt','SELECT')
  and not has_table_privilege('authenticated','public.event_idempotency_receipt','SELECT')
  and not has_table_privilege('anon','public.event_idempotency_receipt','INSERT')
  and not has_table_privilege('authenticated','public.event_idempotency_receipt','INSERT')
  and not has_table_privilege('anon','public.sermon','SELECT')
  and not has_table_privilege('authenticated','public.sermon','SELECT'),
  'browser roles have no direct event, registration or public-content grants'
);
select extensions.ok(
  not exists (
    select 1 from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname = any(array[
      'event','event_staff_assignment','event_team_assignment','event_registration',
      'transport_option','transport_reservation','event_checkin','event_closeout',
      'event_closeout_event','event_idempotency_receipt','calendar_entry','announcement','announcement_team_audience',
      'announcement_event_audience','church_public_profile','welcome_message','sermon',
      'daily_word','digital_tract','external_document_link'
    ])
  ),
  'no client policies exist before trusted public projections and reviewed role grants'
);
select extensions.is((select count(*)::integer from public.role_capability),67,
  'the owner-directed visitor MVP role baseline remains present');

select extensions.ok(
  has_table_privilege('service_role','public.event','SELECT')
  and has_table_privilege('service_role','public.event','INSERT')
  and has_table_privilege('service_role','public.calendar_entry','UPDATE')
  and has_table_privilege('service_role','public.announcement','INSERT')
  and has_table_privilege('service_role','public.sermon','UPDATE')
  and has_table_privilege('service_role','public.church_public_profile','SELECT')
  and not has_table_privilege('service_role','public.event','DELETE')
  and not has_table_privilege('service_role','public.event_registration','INSERT')
  and not has_table_privilege('anon','public.event','SELECT')
  and not has_table_privilege('authenticated','public.sermon','SELECT'),
  'service_role has explicit least-privilege calendar/event/content access while browser access and registration writes stay closed'
);

-- Keep the Edge Function's fixed public projections aligned with real schema columns.
select extensions.ok(
  (select count(*) = 8 from information_schema.columns
   where table_schema='public' and table_name='church_public_profile'
   and column_name = any(array['public_name','welcome_content','public_phone','public_email','address_text','website_url','social_links','updated_at'])),
  'church profile projection columns exist'
);
select extensions.ok(
  (select count(*) = 7 from information_schema.columns
   where table_schema='public' and table_name='sermon'
   and column_name = any(array['id','title','body','public_slug','published_at','created_at','status'])),
  'sermon projection, filter and ordering columns exist'
);
select extensions.ok(
  (select count(*) = 8 from information_schema.columns
   where table_schema='public' and table_name='daily_word'
   and column_name = any(array['id','title','body','publication_date','public_slug','published_at','created_at','status'])),
  'daily word projection, filter and ordering columns exist'
);
select extensions.ok(
  (select count(*) = 7 from information_schema.columns
   where table_schema='public' and table_name='digital_tract'
   and column_name = any(array['id','title','body','public_slug','published_at','created_at','status'])),
  'digital tract projection, filter and ordering columns exist'
);
select extensions.ok(
  (select count(*) = 8 from information_schema.columns
   where table_schema='public' and table_name='welcome_message'
   and column_name = any(array['id','title','body','display_order','published_at','created_at','status','branch_id'])),
  'welcome message projection and filter columns exist'
);
select extensions.ok(
  (select count(*) = 8 from information_schema.columns
   where table_schema='public' and table_name='announcement'
   and column_name = any(array['id','title','body','publish_at','published_at','created_at','status','is_public'])),
  'announcement projection and filter columns exist'
);
select extensions.ok(
  (select count(*) = 11 from information_schema.columns
   where table_schema='public' and table_name='event'
   and column_name = any(array['id','title','description','starts_at','ends_at','timezone','location','registration_state','transport_enabled','status','visibility'])),
  'public event projection, filter and ordering columns exist'
);


insert into auth.users (
 instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
 '00000000-0000-0000-0000-000000000000',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated',
 'cmi-event-test@example.invalid','not-a-real-password-hash',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
);
insert into public.staff_profile(auth_user_id,full_name,account_status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Synthetic Event Tester','active');
insert into public.church(id,name,timezone)
values ('11000000-0000-4000-8000-000000000001','Synthetic Event Test Church','Africa/Accra');
insert into public.branch(id,church_id,name,code) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Event Branch A','EV-A'),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','Event Branch B','EV-B');
insert into public.team(id,branch_id,name) values
 ('31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Event Team A'),
 ('31000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','Event Team B');
insert into public.contact(id,branch_id,first_name,created_by) values
 ('41000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'Synthetic Attendee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('41000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002',
  'Synthetic Other-Branch Attendee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('41000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000001',
  'Synthetic Same-Branch Alternate','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.event(id,branch_id,title,starts_at,ends_at,created_by,status,visibility,registration_state)
values
 ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'Synthetic Event A',now()+interval '1 day',now()+interval '1 day 2 hours',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','published','public','open'),
 ('51000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002',
  'Synthetic Event B',now()+interval '2 days',now()+interval '2 days 2 hours',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','draft','private','closed');

select extensions.throws_ok(
 $q$insert into public.event(branch_id,title,starts_at,ends_at,created_by)
 values ('21000000-0000-4000-8000-000000000001','Bad interval',now(),now(),
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$,
 '23514',null,'event end must be later than event start');
select extensions.throws_ok(
 $q$insert into public.event(branch_id,title,starts_at,ends_at,created_by,registration_state)
 values ('21000000-0000-4000-8000-000000000001','Waitlist',now(),now()+interval '1 hour',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','waitlist_only')$q$,
 '23514',null,'unapproved waitlist state is not available');

select extensions.throws_ok(
 $q$insert into public.event_registration(event_id,branch_id,attendee_name_snapshot,registration_source)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 'Public Attendee','public_site')$q$,
 '23514',null,'public registration requires an idempotency key');
select extensions.throws_ok(
 $q$insert into public.event_registration(event_id,branch_id,contact_id,attendee_name_snapshot,registration_source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 '41000000-0000-4000-8000-000000000002','Wrong Branch Contact','staff',
 '61000000-0000-4000-8000-000000000001')$q$,
 '23503',null,'registration cannot link a contact from another branch');

select extensions.throws_ok(
 $q$insert into public.event_team_assignment(event_id,branch_id,team_id,assigned_by)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 '31000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$,
 '23503',null,'event team assignment cannot cross branches');

select extensions.lives_ok(
 $q$insert into public.event_staff_assignment(
   event_id,branch_id,staff_auth_user_id,assignment_role,assigned_by,starts_at,ends_at
 ) values (
   '51000000-0000-4000-8000-000000000001',
   '21000000-0000-4000-8000-000000000001',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'support','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   now()-interval '1 day',now()+interval '5 days'
 )$q$,
 'finite event staff assignment period is accepted'
);
select extensions.throws_ok(
 $q$insert into public.event_staff_assignment(
   event_id,branch_id,staff_auth_user_id,assignment_role,assigned_by,starts_at,ends_at
 ) values (
   '51000000-0000-4000-8000-000000000001',
   '21000000-0000-4000-8000-000000000001',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'support','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   now(),now()+interval '6 days'
 )$q$,
 '23P01',null,'overlapping event assignment for the same staff member and role is rejected'
);
select extensions.lives_ok(
 $q$insert into public.event_team_assignment(
   event_id,branch_id,team_id,assignment_role,assigned_by,starts_at,ends_at
 ) values (
   '51000000-0000-4000-8000-000000000001',
   '21000000-0000-4000-8000-000000000001',
   '31000000-0000-4000-8000-000000000001',
   'support','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   now()-interval '1 day',now()+interval '5 days'
 )$q$,
 'finite event team assignment period is accepted'
);
select extensions.throws_ok(
 $q$insert into public.event_team_assignment(
   event_id,branch_id,team_id,assignment_role,assigned_by,starts_at,ends_at
 ) values (
   '51000000-0000-4000-8000-000000000001',
   '21000000-0000-4000-8000-000000000001',
   '31000000-0000-4000-8000-000000000001',
   'support','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   now(),now()+interval '6 days'
 )$q$,
 '23P01',null,'overlapping event assignment for the same team and role is rejected'
);

insert into public.event_registration(
 id,event_id,branch_id,contact_id,attendee_name_snapshot,registration_source,client_request_id
) values (
 '71000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
 '21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
 'Synthetic Attendee','staff','61000000-0000-4000-8000-000000000002'
);

select extensions.lives_ok(
 $q$insert into public.event_registration(event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,registration_source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 'Valid E164 Phone','+233241234567','staff','61000000-0000-4000-8000-000000000007')$q$,
 'E.164 phone with leading plus is accepted');
select extensions.throws_ok(
 $q$insert into public.event_registration(event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,registration_source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 'Invalid Phone','233241234567','staff','61000000-0000-4000-8000-000000000008')$q$,
 '23514',null,'phone without international plus is rejected');
select extensions.throws_ok(
 $q$insert into public.event_registration(event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,registration_source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 'Escaped Plus Phone',chr(92)||'+233241234567','staff','61000000-0000-4000-8000-000000000009')$q$,
 '23514',null,'literal backslash before phone plus is rejected');

select extensions.throws_ok(
 $q$insert into public.event_checkin(event_id,branch_id,recorded_by,source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','staff','61000000-0000-4000-8000-000000000003')$q$,
 '23514',null,'check-in requires a registration, contact or explicit name snapshot');
select extensions.throws_ok(
 $q$insert into public.event_checkin(event_id,branch_id,registration_id,attendee_name_snapshot,recorded_by,source,client_request_id)
 values ('51000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002',
 '71000000-0000-4000-8000-000000000001','Wrong Event',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','staff','61000000-0000-4000-8000-000000000004')$q$,
 '23503',null,'registration must belong to the checked-in event and branch');

insert into public.event_checkin(
 event_id,branch_id,registration_id,recorded_by,source,client_request_id
) values (
 '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 '71000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'staff','61000000-0000-4000-8000-000000000005'
);
select extensions.throws_ok(
 $q$insert into public.event_checkin(event_id,branch_id,registration_id,recorded_by,source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 '71000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'staff','61000000-0000-4000-8000-000000000006')$q$,
 '23505',null,'a registration cannot be checked in twice for one event');
select extensions.throws_ok(
 $q$insert into public.event_checkin(event_id,branch_id,contact_id,recorded_by,source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 '41000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'staff','61000000-0000-4000-8000-000000000005')$q$,
 '23505',null,'event check-in request idempotency key cannot be reused');

-- The same canonical contact may be paired with its registration, but a different
-- contact from the same branch must not be smuggled alongside that registration.
insert into public.event_registration(
 id,event_id,branch_id,contact_id,attendee_name_snapshot,registration_source,client_request_id
) values (
 '71000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001',
 '21000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
 'Paired Identity Attendee','staff','61000000-0000-4000-8000-000000000010'
);
select extensions.lives_ok(
 $q$insert into public.event_checkin(event_id,branch_id,registration_id,contact_id,recorded_by,source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 '71000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000001',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','staff','61000000-0000-4000-8000-000000000011')$q$,
 'matching registration and contact identities are accepted');
select extensions.throws_ok(
 $q$insert into public.event_checkin(event_id,branch_id,registration_id,contact_id,recorded_by,source,client_request_id)
 values ('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 '71000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000003',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','staff','61000000-0000-4000-8000-000000000012')$q$,
 '23514',null,'registration cannot be paired with a different same-branch contact');
select extensions.throws_ok(
 $q$update public.event_checkin set contact_id='41000000-0000-4000-8000-000000000003'
 where client_request_id='61000000-0000-4000-8000-000000000011'$q$,
 '23514',null,'registration/contact identity consistency also applies to updates');

insert into public.event_closeout(id,event_id,branch_id,submitted_by,status)
values ('91000000-0000-4000-8000-000000000001',
 '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','submitted');
select extensions.lives_ok(
 $q$insert into public.event_closeout_event(closeout_id,actor_user_id,action)
 values ('91000000-0000-4000-8000-000000000001',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','submitted')$q$,
 'closeout history accepts append-only inserts');
select extensions.throws_ok(
 $q$update public.event_closeout_event set details='{"edited":true}'::jsonb$q$,
 '55000',null,'closeout history rejects updates');
select extensions.throws_ok(
 $q$delete from public.event_closeout_event$q$,
 '55000',null,'closeout history rejects deletes');
select extensions.throws_ok(
 $q$truncate table public.event_closeout_event$q$,
 '55000',null,'closeout history rejects truncation');

insert into public.announcement(id,branch_id,title,body,created_by)
values ('81000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 'Synthetic Announcement','A synthetic announcement for tests.',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select extensions.throws_ok(
 $q$insert into public.announcement_team_audience(announcement_id,branch_id,team_id)
 values ('81000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
 '31000000-0000-4000-8000-000000000002')$q$,
 '23503',null,'announcement team audience cannot cross branches');

select extensions.throws_ok(
 $q$insert into public.external_document_link(label,url,created_by)
 values ('Invalid target','https://example.invalid/file.pdf',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$,
 '23514',null,'external document link requires exactly one typed parent');

select extensions.throws_ok(
 $q$insert into public.sermon(title,body,public_slug,status,created_by)
 values ('Unpublished sermon','Synthetic body','unpublished-sermon','published',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$,
 '23514',null,'published content requires a publication timestamp');

select extensions.throws_ok(
 $q$insert into public.calendar_entry(branch_id,entry_type,title,starts_at,scope_type,team_id,created_by)
 values ('21000000-0000-4000-8000-000000000001','other','Invalid scope',now(),'team',
 '31000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$,
 '23503',null,'calendar team scope must reference a team in the same branch');


select extensions.lives_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','public',null,'a1000000-0000-4000-8000-000000000001',
  decode(repeat('ab',32),'hex'),'event_registration',
  '71000000-0000-4000-8000-000000000101',201
 )$q$,
 'public idempotency receipt accepts a server-computed SHA-256 digest');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','public',null,'a1000000-0000-4000-8000-000000000001',
  decode(repeat('cd',32),'hex'),'event_registration',
  '71000000-0000-4000-8000-000000000102',201
 )$q$,
 '23505',null,'public idempotency key is unique within event and operation scope');
select extensions.lives_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'staff_registration','staff','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'a1000000-0000-4000-8000-000000000002',decode(repeat('ef',32),'hex'),
  'event_registration','71000000-0000-4000-8000-000000000103',201
 )$q$,
 'staff idempotency receipt is scoped to the authenticated actor');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','public','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'a1000000-0000-4000-8000-000000000003',decode(repeat('ab',32),'hex'),
  'event_registration','71000000-0000-4000-8000-000000000104',201
 )$q$,
 '23514',null,'public receipts cannot claim a staff actor');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'staff_registration','staff',null,'a1000000-0000-4000-8000-000000000004',
  decode(repeat('ab',32),'hex'),'event_registration',
  '71000000-0000-4000-8000-000000000105',201
 )$q$,
 '23514',null,'staff receipts require a server-resolved actor');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','public','a1000000-0000-4000-8000-000000000005',
  decode(repeat('ab',31),'hex'),'event_registration',
  '71000000-0000-4000-8000-000000000106',201
 )$q$,
 '23514',null,'request digest must be exactly 32 bytes');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'delete_event','public','a1000000-0000-4000-8000-000000000006',
  decode(repeat('ab',32),'hex'),'event_registration',
  '71000000-0000-4000-8000-000000000107',201
 )$q$,
 '23514',null,'unsupported idempotency operations are rejected');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','staff','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'a1000000-0000-4000-8000-000000000007',decode(repeat('ab',32),'hex'),
  'event_registration','71000000-0000-4000-8000-000000000108',201
 )$q$,
 '23514',null,'public registration cannot be recorded under staff caller class');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','public','a1000000-0000-4000-8000-000000000008',
  decode(repeat('ab',32),'hex'),'event_registration',
  '71000000-0000-4000-8000-000000000109',302
 )$q$,
 '23514',null,'receipt response status must be a successful HTTP status');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','public','a1000000-0000-4000-8000-000000000009',
  decode(repeat('ab',32),'hex'),'contact',
  '71000000-0000-4000-8000-000000000110',201
 )$q$,
 '23514',null,'receipt resource type is allowlisted');
select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002',
  'public_registration','public','a1000000-0000-4000-8000-000000000010',
  decode(repeat('ab',32),'hex'),'event_registration',
  '71000000-0000-4000-8000-000000000111',201
 )$q$,
 '23503',null,'receipt event and branch must match');


select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,idempotency_key,
  request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','public','a1000000-0000-4000-8000-000000000012',
  decode(repeat('ab',32),'hex'),'event_checkin',
  '71000000-0000-4000-8000-000000000112',201
 )$q$,
 '23514',null,'operation and response resource type must agree');


select extensions.throws_ok(
 $q$insert into public.event_idempotency_receipt(
  event_id,branch_id,operation,caller_class,idempotency_key,
  digest_key_version,request_digest,resource_type,resource_id,response_status
 ) values (
  '51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
  'public_registration','public','a1000000-0000-4000-8000-000000000013',
  0,decode(repeat('ab',32),'hex'),'event_registration',
  '71000000-0000-4000-8000-000000000113',201
 )$q$,
 '23514',null,'HMAC key version must be a positive version number');

select extensions.ok(
  not has_function_privilege('anon','public.enforce_event_checkin_identity_consistency()','EXECUTE')
  and not has_function_privilege('authenticated','public.enforce_event_checkin_identity_consistency()','EXECUTE')
  and not has_function_privilege('anon','public.prevent_event_closeout_event_mutation()','EXECUTE')
  and not has_function_privilege('authenticated','public.prevent_event_closeout_event_mutation()','EXECUTE'),
  'trigger-only event integrity functions are not executable by browser roles'
);

select * from finish();
rollback;
