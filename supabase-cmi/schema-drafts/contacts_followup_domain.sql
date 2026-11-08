-- CMI Follow-up v2.1 — contacts, capture, assignment and follow-up domain.
--
-- DRAFT ONLY. This file is deliberately outside the Supabase migrations/
-- directory because the Supabase CLI is not available in the authoring
-- environment. Before promotion, create a migration with:
--   supabase migration new cmi_contacts_followup_domain --workdir supabase-cmi
-- Then copy this reviewed SQL into the generated migration file.
--
-- Depends on: 20261108010000 CMI identity/authorization foundation.
-- Does NOT grant Data API access or create client RLS policies.
-- CMI policy decisions R-03..R-05, D-03 and D-04 remain pending.
--
-- This SQL has not been parsed or executed. Do not apply manually.

begin;

create table public.contact (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  first_name text not null check (length(btrim(first_name)) between 1 and 120),
  last_name text check (last_name is null or length(btrim(last_name)) <= 120),
  preferred_name text check (preferred_name is null or length(btrim(preferred_name)) <= 120),
  phone_e164 text,
  phone_display text,
  email_normalized text,
  age_range text,
  preferred_language text,
  contact_status text not null default 'active'
    check (contact_status in ('active', 'archived', 'merged')),
  created_by uuid references public.staff_profile(auth_user_id) on delete set null,
  merged_into_contact_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id),
  foreign key (merged_into_contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  check (
    email_normalized is null
    or (
      email_normalized = lower(btrim(email_normalized))
      and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  check (
    (contact_status = 'merged' and merged_into_contact_id is not null)
    or (contact_status <> 'merged' and merged_into_contact_id is null)
  )
);

comment on table public.contact is
  'Canonical ordinary contact record. Never store prayer/care narratives or credentials here.';
comment on column public.contact.phone_e164 is
  'Normalized phone identifier for communication; deliberately not unique because multiple people can share a number.';
comment on column public.contact.merged_into_contact_id is
  'Set only by a trusted, transactional contact-merge operation.';

create index contact_branch_name_search_idx
  on public.contact(branch_id, lower(coalesce(last_name, '')), lower(first_name));
create index contact_phone_duplicate_review_idx
  on public.contact(branch_id, phone_e164) where phone_e164 is not null;
create index contact_email_duplicate_review_idx
  on public.contact(branch_id, email_normalized) where email_normalized is not null;
create index contact_status_created_idx
  on public.contact(branch_id, contact_status, created_at desc);

create table public.contact_capture (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  branch_id uuid not null references public.branch(id) on delete restrict,
  captured_by uuid references public.staff_profile(auth_user_id) on delete set null,
  capture_source text not null
    check (capture_source in ('staff_manual', 'public_site', 'offline_queue', 'import')),
  service_area_id uuid,
  client_request_id uuid not null,
  captured_at timestamptz not null default now(),
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  foreign key (service_area_id, branch_id)
    references public.service_area(id, branch_id) on delete restrict,
  unique (branch_id, client_request_id),
  check (jsonb_typeof(source_metadata) = 'object'),
  check (
    source_metadata - array['app_version', 'form_version', 'device_type', 'locale']
    = '{}'::jsonb
  )
);

comment on table public.contact_capture is
  'Capture provenance and idempotency. Event linkage is added in the later event-domain migration.';
comment on column public.contact_capture.source_metadata is
  'Allowlisted non-sensitive metadata only; never place identity, contact, pastoral or authorization claims here.';

create index contact_capture_contact_time_idx
  on public.contact_capture(contact_id, captured_at desc);
create index contact_capture_branch_time_idx
  on public.contact_capture(branch_id, captured_at desc);
create index contact_capture_actor_time_idx
  on public.contact_capture(captured_by, captured_at desc)
  where captured_by is not null;

create table public.contact_assignment (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  branch_id uuid not null references public.branch(id) on delete restrict,
  assignee_user_id uuid references public.staff_profile(auth_user_id) on delete restrict,
  team_id uuid,
  assigned_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  foreign key (team_id, branch_id)
    references public.team(id, branch_id) on delete restrict,
  check ((assignee_user_id is not null) <> (team_id is not null)),
  check (ends_at is null or ends_at > starts_at)
);

comment on table public.contact_assignment is
  'Time-bounded assignment history. Ending an assignment immediately removes future access under the eventual RLS predicates.';

create index contact_assignment_active_contact_idx
  on public.contact_assignment(contact_id, starts_at desc) where ends_at is null;
create index contact_assignment_active_user_idx
  on public.contact_assignment(assignee_user_id, contact_id) where ends_at is null;
create index contact_assignment_active_team_idx
  on public.contact_assignment(team_id, contact_id) where ends_at is null;

create table public.contact_note (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  branch_id uuid not null references public.branch(id) on delete restrict,
  author_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  body text not null check (length(btrim(body)) > 0),
  visibility text not null
    check (visibility in ('author_only', 'assigned_scope', 'team_scope', 'branch_scope')),
  team_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  foreign key (team_id, branch_id)
    references public.team(id, branch_id) on delete restrict,
  check ((visibility = 'team_scope' and team_id is not null)
      or (visibility <> 'team_scope' and team_id is null))
);

comment on table public.contact_note is
  'Ordinary operational follow-up notes only. Prayer and care narratives belong in separately restricted tables.';

create index contact_note_contact_time_idx
  on public.contact_note(contact_id, created_at desc);
create index contact_note_author_time_idx
  on public.contact_note(author_user_id, created_at desc);
create index contact_note_team_time_idx
  on public.contact_note(team_id, created_at desc) where team_id is not null;

create table public.contact_interaction (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  branch_id uuid not null references public.branch(id) on delete restrict,
  actor_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  interaction_type text not null
    check (interaction_type in ('call', 'visit', 'message', 'meeting', 'other')),
  occurred_at timestamptz not null default now(),
  outcome_code text
    check (outcome_code is null or outcome_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  summary text,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict
);

comment on table public.contact_interaction is
  'Ordinary contact attempts and outcomes. Outcome codes are syntactically constrained pending approval of the final outcome catalogue.';

create index contact_interaction_contact_time_idx
  on public.contact_interaction(contact_id, occurred_at desc);
create index contact_interaction_actor_time_idx
  on public.contact_interaction(actor_user_id, occurred_at desc);

create table public.contact_merge (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  source_contact_id uuid not null,
  surviving_contact_id uuid not null,
  merged_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  merged_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) > 0),
  reversal_of uuid references public.contact_merge(id) on delete restrict,
  reversed_at timestamptz,
  reversal_metadata jsonb,
  foreign key (source_contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  foreign key (surviving_contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  check (source_contact_id <> surviving_contact_id),
  check (reversal_of is null or reversal_of <> id),
  check (reversal_metadata is null or jsonb_typeof(reversal_metadata) = 'object'),
  unique (reversal_of)
);

comment on table public.contact_merge is
  'Merge audit history. Actual merge/reversal must be one trusted transaction that re-points eligible child rows and preserves history.';

create unique index contact_merge_one_active_source_idx
  on public.contact_merge(source_contact_id)
  where reversal_of is null and reversed_at is null;
create index contact_merge_survivor_time_idx
  on public.contact_merge(surviving_contact_id, merged_at desc);

create table public.followup_list (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 180),
  description text,
  team_id uuid,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id),
  foreign key (team_id, branch_id)
    references public.team(id, branch_id) on delete restrict
);

comment on table public.followup_list is
  'A branch-level list when team_id is null, otherwise a team-scoped list. Event scope is added in the event-domain migration.';
create index followup_list_branch_status_idx
  on public.followup_list(branch_id, status, created_at desc);
create index followup_list_team_status_idx
  on public.followup_list(team_id, status, created_at desc) where team_id is not null;

create table public.followup_task (
  id uuid primary key default gen_random_uuid(),
  list_id uuid,
  contact_id uuid not null,
  branch_id uuid not null references public.branch(id) on delete restrict,
  assignee_user_id uuid references public.staff_profile(auth_user_id) on delete restrict,
  team_id uuid,
  priority smallint not null default 3 check (priority between 1 and 5),
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  task_note text,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (list_id, branch_id)
    references public.followup_list(id, branch_id) on delete restrict,
  foreign key (contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  foreign key (team_id, branch_id)
    references public.team(id, branch_id) on delete restrict,
  check ((assignee_user_id is not null) <> (team_id is not null)),
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

comment on table public.followup_task is
  'Actionable contact follow-up. One primary target (staff OR team) is the conservative pending-D-04 default.';
comment on column public.followup_task.task_note is
  'Operational task note only. Do not store prayer/care narratives or unrelated sensitive data.';

create index followup_task_branch_status_due_idx
  on public.followup_task(branch_id, status, due_at);
create index followup_task_contact_created_idx
  on public.followup_task(contact_id, created_at desc);
create index followup_task_assignee_status_due_idx
  on public.followup_task(assignee_user_id, status, due_at)
  where assignee_user_id is not null;
create index followup_task_team_status_due_idx
  on public.followup_task(team_id, status, due_at)
  where team_id is not null;
create index followup_task_list_idx
  on public.followup_task(list_id, created_at desc) where list_id is not null;

create table public.followup_task_event (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.followup_task(id) on delete restrict,
  actor_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  event_type text not null
    check (event_type in (
      'created', 'assigned', 'reassigned', 'status_changed',
      'note_added', 'completed', 'reopened', 'cancelled'
    )),
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(details) = 'object'),
  check (from_status is null or from_status in ('open', 'in_progress', 'completed', 'cancelled')),
  check (to_status is null or to_status in ('open', 'in_progress', 'completed', 'cancelled'))
);

comment on table public.followup_task_event is
  'Append-only task lifecycle history. Details must be allowlisted metadata and must not include sensitive narratives, credentials or provider secrets.';

create index followup_task_event_task_time_idx
  on public.followup_task_event(task_id, created_at desc);
create index followup_task_event_actor_time_idx
  on public.followup_task_event(actor_user_id, created_at desc);

create trigger contact_set_updated_at before update on public.contact
  for each row execute function private.set_updated_at();
create trigger contact_note_set_updated_at before update on public.contact_note
  for each row execute function private.set_updated_at();
create trigger followup_list_set_updated_at before update on public.followup_list
  for each row execute function private.set_updated_at();
create trigger followup_task_set_updated_at before update on public.followup_task
  for each row execute function private.set_updated_at();

-- Keep domain tables completely closed until role/scoped policies are approved.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'contact', 'contact_capture', 'contact_assignment', 'contact_note',
    'contact_interaction', 'contact_merge', 'followup_list',
    'followup_task', 'followup_task_event'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end;
$$;

commit;
