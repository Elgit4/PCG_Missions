-- PCG Missions: private staff notifications and private event flyer metadata.
-- All browser access remains closed; trusted Edge Functions use service_role only.

begin;

create table if not exists public.staff_notification (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  recipient_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  category text not null check (category in (
    'followup_assigned','event_assigned','report_reviewed','system'
  )),
  title text not null check (length(btrim(title)) between 2 and 160),
  body text not null check (length(btrim(body)) between 1 and 500),
  target_type text check (target_type is null or target_type in (
    'followup_task','event','ministry_report'
  )),
  target_id uuid,
  idempotency_key text not null unique
    check (length(idempotency_key) between 8 and 240),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint staff_notification_target_pair check (
    (target_type is null and target_id is null)
    or (target_type is not null and target_id is not null)
  )
);

create index if not exists staff_notification_recipient_inbox_idx
  on public.staff_notification(recipient_user_id, branch_id, created_at desc);
create index if not exists staff_notification_unread_idx
  on public.staff_notification(recipient_user_id, branch_id)
  where read_at is null;

alter table public.staff_notification enable row level security;
revoke all on public.staff_notification from public, anon, authenticated;
grant select, insert, update on public.staff_notification to service_role;

alter table public.event
  add column if not exists flyer_object_path text,
  add column if not exists flyer_mime_type text,
  add column if not exists flyer_size_bytes integer,
  add column if not exists flyer_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.event'::regclass
      and conname = 'event_flyer_metadata_consistent'
  ) then
    alter table public.event
      add constraint event_flyer_metadata_consistent check (
        (
          flyer_object_path is null
          and flyer_mime_type is null
          and flyer_size_bytes is null
          and flyer_updated_at is null
        )
        or
        (
          flyer_object_path is not null
          and flyer_object_path ~ ('^' || branch_id::text || '/' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
          and flyer_mime_type is not null
          and flyer_mime_type in ('image/jpeg','image/png','image/webp')
          and flyer_size_bytes is not null
          and flyer_size_bytes between 1 and 5242880
          and flyer_updated_at is not null
        )
      );
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-flyers',
  'event-flyers',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Notification creation is database-triggered so every trusted writer receives
-- the same behavior. No notification includes contact identity or pastoral text.
create or replace function private.cmi_notify_followup_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('open','in_progress') then
    if new.assignee_user_id is not null
       and new.team_id is null
       and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id)
       and new.assignee_user_id is distinct from new.created_by
       and exists (
         select 1 from public.staff_profile sp
         where sp.auth_user_id = new.assignee_user_id
           and sp.account_status = 'active'
       ) then
      insert into public.staff_notification (
        branch_id, recipient_user_id, category, title, body,
        target_type, target_id, idempotency_key
      ) values (
        new.branch_id, new.assignee_user_id, 'followup_assigned',
        'New follow-up assigned',
        'A follow-up task has been assigned to you. Open your follow-up list to review it.',
        'followup_task', new.id,
        'followup:' || new.id::text || ':' || new.assignee_user_id::text
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if new.team_id is not null
       and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id) then
      insert into public.staff_notification (
        branch_id, recipient_user_id, category, title, body,
        target_type, target_id, idempotency_key
      )
      select new.branch_id, sp.auth_user_id, 'followup_assigned',
        'New team follow-up assigned',
        'A follow-up task has been assigned to your team. Open your follow-up list to review it.',
        'followup_task', new.id,
        'followup:' || new.id::text || ':' || sp.auth_user_id::text
      from public.staff_team_membership stm
      join public.staff_profile sp on sp.id = stm.staff_profile_id
      where stm.team_id = new.team_id
        and stm.branch_id = new.branch_id
        and stm.starts_at <= now()
        and (stm.ends_at is null or stm.ends_at > now())
        and stm.revoked_at is null
        and sp.account_status = 'active'
        and sp.auth_user_id is distinct from new.created_by
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists followup_task_notify_assignment on public.followup_task;
create trigger followup_task_notify_assignment
after insert or update of assignee_user_id, team_id, status on public.followup_task
for each row execute function private.cmi_notify_followup_assignment();

create or replace function private.cmi_notify_event_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_title text;
begin
  if new.revoked_at is null
     and (new.ends_at is null or new.ends_at > now())
     and new.assignment_role <> 'transport'
     and new.staff_auth_user_id is distinct from new.assigned_by
     and exists (
       select 1 from public.staff_profile sp
       where sp.auth_user_id = new.staff_auth_user_id
         and sp.account_status = 'active'
     ) then
    select e.title into event_title
      from public.event e
     where e.id = new.event_id and e.branch_id = new.branch_id;

    if event_title is not null then
      insert into public.staff_notification (
        branch_id, recipient_user_id, category, title, body,
        target_type, target_id, idempotency_key
      ) values (
        new.branch_id,
        new.staff_auth_user_id,
        'event_assigned',
        'Event assignment updated',
        'You have been assigned to ' || left(event_title, 260) || '.',
        'event',
        new.event_id,
        'event-assignment:' || new.id::text || ':' || new.staff_auth_user_id::text
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists event_staff_assignment_notify on public.event_staff_assignment;
create trigger event_staff_assignment_notify
after insert on public.event_staff_assignment
for each row execute function private.cmi_notify_event_assignment();

-- The typed report migration is present in the source tree but is not yet
-- deployed to every environment. Install this trigger only where its tables exist.
do $$
begin
  if to_regclass('public.ministry_report') is not null
     and to_regclass('public.report_review_event') is not null then
    execute $trigger$
      create or replace function private.cmi_notify_report_review()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        recipient_id uuid;
        report_branch_id uuid;
      begin
        select sp.auth_user_id, mr.branch_id
          into recipient_id, report_branch_id
          from public.ministry_report mr
          join public.staff_profile sp on sp.id = mr.author_profile_id
         where mr.id = new.report_id;

        if recipient_id is not null and recipient_id is distinct from (
          select sp.auth_user_id from public.staff_profile sp
          where sp.id = new.actor_profile_id
        ) then
          insert into public.staff_notification (
            branch_id, recipient_user_id, category, title, body,
            target_type, target_id, idempotency_key
          ) values (
            report_branch_id,
            recipient_id,
            'report_reviewed',
            case new.decision
              when 'approved' then 'Ministry report approved'
              when 'returned' then 'Ministry report returned for updates'
              else 'Ministry report reviewed'
            end,
            case new.decision
              when 'approved' then 'Your ministry report has been approved.'
              when 'returned' then 'Your ministry report needs updates. Open it to review the feedback.'
              else 'Your ministry report has received a review update.'
            end,
            'ministry_report',
            new.report_id,
            'report-review:' || new.id::text || ':' || recipient_id::text
          )
          on conflict (idempotency_key) do nothing;
        end if;
        return new;
      end;
      $body$;
    $trigger$;
    execute 'drop trigger if exists report_review_notify_author on public.report_review_event';
    execute 'create trigger report_review_notify_author after insert on public.report_review_event for each row execute function private.cmi_notify_report_review()';
    execute 'revoke all on function private.cmi_notify_report_review() from public, anon, authenticated, service_role';
  end if;
end;
$$;

create or replace function private.cmi_notify_event_team_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $event_team$
declare
  event_title text;
begin
  if new.revoked_at is null
     and (new.ends_at is null or new.ends_at > now())
     and new.assignment_role <> 'transport' then
    select e.title into event_title
      from public.event e
     where e.id = new.event_id and e.branch_id = new.branch_id;

    if event_title is not null then
      insert into public.staff_notification (
        branch_id, recipient_user_id, category, title, body,
        target_type, target_id, idempotency_key
      )
      select new.branch_id, sp.auth_user_id, 'event_assigned',
        'Team event assignment updated',
        'Your team has been assigned to ' || left(event_title, 260) || '.',
        'event', new.event_id,
        'event-team-assignment:' || new.id::text || ':' || sp.auth_user_id::text
      from public.staff_team_membership stm
      join public.staff_profile sp on sp.id = stm.staff_profile_id
      where stm.team_id = new.team_id
        and stm.branch_id = new.branch_id
        and stm.starts_at <= now()
        and (stm.ends_at is null or stm.ends_at > now())
        and stm.revoked_at is null
        and sp.account_status = 'active'
        and sp.auth_user_id is distinct from new.assigned_by
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$event_team$;

drop trigger if exists event_team_assignment_notify on public.event_team_assignment;
create trigger event_team_assignment_notify
after insert on public.event_team_assignment
for each row execute function private.cmi_notify_event_team_assignment();

revoke all on function private.cmi_notify_followup_assignment()
  from public, anon, authenticated, service_role;
revoke all on function private.cmi_notify_event_assignment()
  from public, anon, authenticated, service_role;
revoke all on function private.cmi_notify_event_team_assignment()
  from public, anon, authenticated, service_role;

comment on table public.staff_notification is
'Private per-recipient in-app inbox. Direct client access is revoked; use staff-notifications Edge Function only.';
comment on column public.event.flyer_object_path is
'Private Storage object path in event-flyers; never a public URL.';
comment on column public.event.flyer_mime_type is
'Server-validated MIME type for the private event flyer.';
comment on column public.event.flyer_size_bytes is
'Server-validated flyer byte length, maximum 5 MiB.';

commit;
