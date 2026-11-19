-- Private notification inbox and event flyer storage security contract.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

select * from finish();
rollback;
