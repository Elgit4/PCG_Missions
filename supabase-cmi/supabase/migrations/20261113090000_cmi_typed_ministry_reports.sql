-- PCG Missions CMI — typed ministry reports foundation.
-- This migration creates protected storage only. It deliberately does not
-- grant report capabilities or expose report operations until the trusted
-- API, scope enforcement and role tests are complete.

begin;

create table if not exists public.ministry_report (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  report_type text not null
    check (report_type in ('daily_evangelism','event_evangelism','weekly_ministry')),
  period_start date not null,
  period_end date not null,
  author_profile_id uuid not null references public.staff_profile(id) on delete restrict,
  team_id uuid null references public.team(id) on delete restrict,
  event_id uuid null references public.event(id) on delete restrict,
  contacts_captured integer not null default 0 check (contacts_captured >= 0),
  gospel_presentations integer not null default 0 check (gospel_presentations >= 0),
  decisions_for_christ integer not null default 0 check (decisions_for_christ >= 0),
  followup_required integer not null default 0 check (followup_required >= 0),
  followup_completed integer not null default 0 check (followup_completed >= 0),
  visits_completed integer not null default 0 check (visits_completed >= 0),
  calls_completed integer not null default 0 check (calls_completed >= 0),
  events_supported integer not null default 0 check (events_supported >= 0),
  attendance_count integer not null default 0 check (attendance_count >= 0),
  status text not null default 'draft'
    check (status in ('draft','submitted','returned','approved')),
  submitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ministry_report_period_valid check (
    period_end >= period_start
    and (
      (report_type in ('daily_evangelism','event_evangelism')
        and period_end = period_start)
      or
      (report_type = 'weekly_ministry'
        and period_end = period_start + 6)
    )
  ),
  constraint ministry_report_event_scope check (
    (report_type = 'event_evangelism' and event_id is not null)
    or
    (report_type <> 'event_evangelism' and event_id is null)
  ),
  constraint ministry_report_decisions_not_over_presentations check (
    decisions_for_christ <= gospel_presentations
  ),
  constraint ministry_report_followup_not_over_required check (
    followup_completed <= followup_required
  )
);

create index if not exists ministry_report_branch_period_idx
  on public.ministry_report(branch_id, period_start desc, report_type);
create index if not exists ministry_report_author_created_idx
  on public.ministry_report(author_profile_id, created_at desc);
create index if not exists ministry_report_team_period_idx
  on public.ministry_report(team_id, period_start desc)
  where team_id is not null;
create index if not exists ministry_report_event_idx
  on public.ministry_report(event_id)
  where event_id is not null;

-- Enforce branch consistency independently of the API. A report cannot
-- smuggle a team or event belonging to a different branch.
create or replace function private.cmi_validate_ministry_report_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id is not null and not exists (
    select 1 from public.team t
    where t.id = new.team_id and t.branch_id = new.branch_id
  ) then
    raise exception using errcode = '23514', message = 'REPORT_TEAM_BRANCH_MISMATCH';
  end if;

  if new.event_id is not null and not exists (
    select 1 from public.event e
    where e.id = new.event_id and e.branch_id = new.branch_id
  ) then
    raise exception using errcode = '23514', message = 'REPORT_EVENT_BRANCH_MISMATCH';
  end if;

  if not exists (
    select 1 from public.staff_profile sp
    where sp.id = new.author_profile_id
  ) then
    raise exception using errcode = '23503', message = 'REPORT_AUTHOR_NOT_FOUND';
  end if;

  return new;
end;
$$;

drop trigger if exists ministry_report_scope_guard on public.ministry_report;
create trigger ministry_report_scope_guard
before insert or update of branch_id, team_id, event_id, author_profile_id
on public.ministry_report
for each row execute function private.cmi_validate_ministry_report_scope();

create table if not exists public.report_review_event (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.ministry_report(id) on delete restrict,
  actor_profile_id uuid not null references public.staff_profile(id) on delete restrict,
  decision text not null check (decision in ('approved','returned','comment','resubmitted')),
  comment text null check (comment is null or length(comment) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists report_review_event_report_created_idx
  on public.report_review_event(report_id, created_at desc);

alter table public.ministry_report enable row level security;
alter table public.report_review_event enable row level security;

revoke all on public.ministry_report from public, anon, authenticated;
revoke all on public.report_review_event from public, anon, authenticated;
grant select, insert, update on public.ministry_report to service_role;
grant select, insert on public.report_review_event to service_role;

create or replace function private.reject_report_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'REPORT_REVIEW_HISTORY_IMMUTABLE';
end;
$$;

drop trigger if exists report_review_event_immutable on public.report_review_event;
create trigger report_review_event_immutable
before update or delete on public.report_review_event
for each row execute function private.reject_report_review_mutation();

drop trigger if exists report_review_event_no_truncate on public.report_review_event;
create trigger report_review_event_no_truncate
before truncate on public.report_review_event
for each statement execute function private.reject_report_review_mutation();

revoke all on function private.cmi_validate_ministry_report_scope()
  from public, anon, authenticated, service_role;
revoke all on function private.reject_report_review_mutation()
  from public, anon, authenticated, service_role;

comment on table public.ministry_report is
'Typed daily evangelism, event evangelism and weekly ministry reports. No arbitrary JSON or pastoral narrative fields. Report capabilities remain disabled until trusted API and role-scope tests are complete.';
comment on table public.report_review_event is
'Append-only review history for ministry reports. Report exports remain disabled.';

commit;
