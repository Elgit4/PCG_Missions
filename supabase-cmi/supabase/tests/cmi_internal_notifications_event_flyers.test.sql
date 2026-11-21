-- Private notification inbox and event flyer storage security contract.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select has_table('public','staff_notification','private staff notification inbox exists');
select extensions.ok(
  (select relrowsecurity from pg_class where oid='public.staff_notification'::regclass),
  'notification inbox has RLS enabled'
);
select extensions.ok(
  not has_table_privilege('anon','public.staff_notification','SELECT')
  and not has_table_privilege('authenticated','public.staff_notification','SELECT')
  and not has_table_privilege('anon','public.staff_notification','INSERT')
  and not has_table_privilege('authenticated','public.staff_notification','INSERT')
  and not has_table_privilege('anon','public.staff_notification','UPDATE')
  and not has_table_privilege('authenticated','public.staff_notification','UPDATE'),
  'browser roles cannot read or mutate notification rows directly'
);
select extensions.ok(
  has_table_privilege('service_role','public.staff_notification','SELECT')
  and has_table_privilege('service_role','public.staff_notification','INSERT')
  and has_table_privilege('service_role','public.staff_notification','UPDATE'),
  'trusted service role can operate the notification inbox'
);
select has_column('public','event','flyer_object_path','event stores a private object path');
select has_column('public','event','flyer_mime_type','event stores validated flyer MIME metadata');
select has_column('public','event','flyer_size_bytes','event stores validated flyer size');
select extensions.ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.event'::regclass
      and conname = 'event_flyer_metadata_consistent'
  ),
  'flyer metadata must be complete, scoped and within limits'
);
select extensions.ok(
  exists (select 1 from storage.buckets where id='event-flyers'),
  'private event flyer bucket exists'
);
select extensions.ok(
  (select public = false from storage.buckets where id='event-flyers'),
  'event flyer bucket is private'
);
select extensions.is(
  (select file_size_limit::bigint from storage.buckets where id='event-flyers'),
  5242880::bigint,
  'event flyer bucket enforces a 5 MiB limit'
);
select extensions.ok(
  (select allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
   from storage.buckets where id='event-flyers'),
  'event flyer bucket only accepts JPEG, PNG and WebP'
);
select has_trigger('public','followup_task','followup_task_notify_assignment','follow-up assignment notification trigger exists');
select has_trigger('public','event_staff_assignment','event_staff_assignment_notify','individual event assignment notification trigger exists');
select has_trigger('public','event_team_assignment','event_team_assignment_notify','team event assignment notification trigger exists');
select has_trigger('public','event_staff_assignment','event_staff_assignment_notify_update','individual assignment changes refresh notification eligibility');
select has_trigger('public','event_team_assignment','event_team_assignment_notify_update','team assignment changes refresh notification eligibility');
select extensions.ok(
  position('starts_at' in pg_get_functiondef('private.cmi_notify_event_assignment()'::regprocedure)) > 0,
  'individual assignment notifications require the assignment start time'
);
select extensions.ok(
  position('starts_at' in pg_get_functiondef('private.cmi_notify_event_team_assignment()'::regprocedure)) > 0,
  'team assignment notifications require the assignment start time'
);



-- Synthetic fixtures verify event notification timing and recipient isolation.
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31','authenticated','authenticated','notification-owner@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32','authenticated','authenticated','notification-active-member@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa33','authenticated','authenticated','notification-expired-member@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa34','authenticated','authenticated','notification-inactive-member@example.invalid','not-a-real-password-hash',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.staff_profile(id,auth_user_id,full_name,account_status,deactivated_at) values
  ('71000000-0000-4000-8000-000000000031','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31','Synthetic Notification Owner','active',null),
  ('71000000-0000-4000-8000-000000000032','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32','Synthetic Active Member','active',null),
  ('71000000-0000-4000-8000-000000000033','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa33','Synthetic Expired Member','active',null),
  ('71000000-0000-4000-8000-000000000034','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa34','Synthetic Inactive Member','inactive',now());

insert into public.church(id,name,timezone)
values ('11000000-0000-4000-8000-000000000031','Synthetic Notification Test Church','Africa/Accra');
insert into public.branch(id,church_id,name,code)
values ('21000000-0000-4000-8000-000000000031','11000000-0000-4000-8000-000000000031','Notification Test Branch','NT-BRANCH');
insert into public.team(id,branch_id,name)
values ('31000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000031','Notification Test Team');
insert into public.event(id,branch_id,title,starts_at,ends_at,created_by,status,visibility,registration_state)
values ('51000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000031','Synthetic Notification Event',now()-interval '2 days',now()+interval '3 days','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31','published','staff','closed');

insert into public.staff_team_membership(id,staff_profile_id,team_id,branch_id,starts_at,ends_at,created_by)
values
  ('81000000-0000-4000-8000-000000000031','71000000-0000-4000-8000-000000000032','31000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000031',now()-interval '2 days',null,'71000000-0000-4000-8000-000000000031'),
  ('81000000-0000-4000-8000-000000000032','71000000-0000-4000-8000-000000000033','31000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000031',now()-interval '3 days',now()-interval '1 day','71000000-0000-4000-8000-000000000031'),
  ('81000000-0000-4000-8000-000000000033','71000000-0000-4000-8000-000000000034','31000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000031',now()-interval '2 days',null,'71000000-0000-4000-8000-000000000031');

insert into public.event_staff_assignment(id,event_id,branch_id,staff_auth_user_id,assignment_role,assigned_by,starts_at,ends_at)
values ('61000000-0000-4000-8000-000000000031','51000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000031','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32','support','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31',now()+interval '1 day',now()+interval '2 days');

select extensions.is(
  (select count(*)::integer from public.staff_notification
   where idempotency_key='event-assignment:61000000-0000-4000-8000-000000000031:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32'),
  0,
  'future-dated individual event assignments do not notify prematurely'
);

update public.event_staff_assignment set starts_at=now()-interval '1 hour'
where id='61000000-0000-4000-8000-000000000031';

select extensions.is(
  (select count(*)::integer from public.staff_notification
   where branch_id='21000000-0000-4000-8000-000000000031'
     and recipient_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32'
     and target_id='51000000-0000-4000-8000-000000000031'
     and idempotency_key='event-assignment:61000000-0000-4000-8000-000000000031:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32'),
  1,
  'activating an individual event assignment creates one recipient notification'
);

update public.event_staff_assignment set ends_at=now()+interval '3 days'
where id='61000000-0000-4000-8000-000000000031';

select extensions.is(
  (select count(*)::integer from public.staff_notification
   where idempotency_key='event-assignment:61000000-0000-4000-8000-000000000031:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32'),
  1,
  'repeated active assignment updates do not duplicate the notification'
);

insert into public.event_staff_assignment(id,event_id,branch_id,staff_auth_user_id,assignment_role,assigned_by,starts_at,ends_at)
values ('61000000-0000-4000-8000-000000000032','51000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000031','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32','transport','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31',now()-interval '1 hour',now()+interval '2 days');

select extensions.is(
  (select count(*)::integer from public.staff_notification
   where idempotency_key='event-assignment:61000000-0000-4000-8000-000000000032:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32'),
  0,
  'transport event assignments never create inbox notifications'
);

insert into public.event_team_assignment(id,event_id,branch_id,team_id,assignment_role,assigned_by,starts_at,ends_at)
values ('62000000-0000-4000-8000-000000000031','51000000-0000-4000-8000-000000000031','21000000-0000-4000-8000-000000000031','31000000-0000-4000-8000-000000000031','support','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31',now()+interval '1 day',now()+interval '2 days');

select extensions.is(
  (select count(*)::integer from public.staff_notification
   where idempotency_key='event-team-assignment:62000000-0000-4000-8000-000000000031:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32'),
  0,
  'future-dated team event assignments do not notify prematurely'
);

update public.event_team_assignment set starts_at=now()-interval '1 hour'
where id='62000000-0000-4000-8000-000000000031';

select extensions.ok(
  (select count(*)::integer from public.staff_notification
   where idempotency_key='event-team-assignment:62000000-0000-4000-8000-000000000031:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32') = 1
  and not exists (
    select 1 from public.staff_notification
    where idempotency_key in (
      'event-team-assignment:62000000-0000-4000-8000-000000000031:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa33',
      'event-team-assignment:62000000-0000-4000-8000-000000000031:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa34'
    )
  )
  and not exists (
    select 1 from public.staff_notification
    where idempotency_key like 'event-team-assignment:62000000-0000-4000-8000-000000000031:%'
      and recipient_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31'
  ),
  'team assignment activation notifies only active members, not expired, inactive or assigning staff'
);

select * from finish();
rollback;
