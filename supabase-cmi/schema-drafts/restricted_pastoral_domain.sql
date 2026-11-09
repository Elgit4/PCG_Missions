-- CMI Follow-up v2.1 — restricted prayer and pastoral care domain.
--
-- DRAFT ONLY. This source remains under schema-drafts/ and is not part
-- of permanent migration history. CI applies it through a temporary
-- CLI-generated migration on the disposable local CMI stack only.
-- Do not promote or apply to a hosted database until required approvals.
--
-- Depends on identity foundation and contacts/follow-up domain.
-- No browser grants or client policies are introduced.
-- R-01, R-02, R-10, R-11 and D-07 remain pending.
--
-- Critical boundary: prayer/care narrative reads must go through trusted,
-- transactionally audited server operations. Direct client SELECT remains off.

begin;

create table public.prayer_request (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  contact_id uuid,
  created_by uuid references public.staff_profile(auth_user_id) on delete set null,
  request_text text not null check (length(btrim(request_text)) > 0),
  status text not null default 'open'
    check (status in ('open', 'assigned', 'in_progress', 'answered', 'closed', 'expired')),
  sensitivity text not null default 'restricted'
    check (sensitivity in ('restricted', 'highly_restricted')),
  expires_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id),
  foreign key (contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  check (expires_at is null or expires_at > created_at),
  check (
    (status = 'answered' and answered_at is not null)
    or (status <> 'answered' and answered_at is null)
  )
);

comment on table public.prayer_request is
  'Highly restricted pastoral narrative. No direct browser SELECT; use a trusted, audited read operation only.';
comment on column public.prayer_request.contact_id is
  'Optional contact link. A linked contact does not inherit prayer narrative access or identity-field access.';

create index prayer_request_branch_status_time_idx
  on public.prayer_request(branch_id, status, created_at desc);
create index prayer_request_contact_time_idx
  on public.prayer_request(contact_id, created_at desc)
  where contact_id is not null;

create table public.prayer_assignment (
  id uuid primary key default gen_random_uuid(),
  prayer_request_id uuid not null,
  branch_id uuid not null,
  intercessor_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  assigned_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (prayer_request_id, branch_id)
    references public.prayer_request(id, branch_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create unique index prayer_assignment_one_active_user_request_idx
  on public.prayer_assignment(intercessor_user_id, prayer_request_id)
  where ends_at is null and revoked_at is null;
create index prayer_assignment_request_idx
  on public.prayer_assignment(prayer_request_id, starts_at desc);
create table public.prayer_access_audit (
  id uuid primary key default gen_random_uuid(),
  prayer_request_id uuid not null,
  branch_id uuid not null,
  actor_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  action text not null
    check (action in ('read', 'update', 'assign', 'revoke', 'oversight')),
  reason text,
  request_id text,
  accessed_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  foreign key (prayer_request_id, branch_id)
    references public.prayer_request(id, branch_id) on delete restrict,
  check (jsonb_typeof(safe_metadata) = 'object'),
  check (action <> 'oversight' or length(btrim(coalesce(reason, ''))) > 0)
);

comment on table public.prayer_access_audit is
  'Append-only record of prayer narrative reads and privileged actions. Metadata must never include narrative or secrets.';

create index prayer_access_audit_record_time_idx
  on public.prayer_access_audit(prayer_request_id, accessed_at desc);
create index prayer_access_audit_actor_time_idx
  on public.prayer_access_audit(actor_user_id, accessed_at desc);

create table public.care_group (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, branch_id)
);

create unique index care_group_active_name_branch_idx
  on public.care_group(branch_id, lower(name))
  where is_active;

create table public.care_group_membership (
  id uuid primary key default gen_random_uuid(),
  care_group_id uuid not null,
  contact_id uuid not null,
  branch_id uuid not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.staff_profile(auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (care_group_id, branch_id)
    references public.care_group(id, branch_id) on delete restrict,
  foreign key (contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at)
);

create unique index care_group_membership_one_active_contact_idx
  on public.care_group_membership(care_group_id, contact_id)
  where ends_at is null;
create index care_group_membership_contact_active_idx
  on public.care_group_membership(contact_id, care_group_id)
  where ends_at is null;

create table public.care_record (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  contact_id uuid not null,
  care_group_id uuid,
  status text not null default 'open'
    check (status in ('open', 'active', 'monitoring', 'resolved', 'closed')),
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id),
  foreign key (contact_id, branch_id)
    references public.contact(id, branch_id) on delete restrict,
  foreign key (care_group_id, branch_id)
    references public.care_group(id, branch_id) on delete restrict
);

comment on table public.care_record is
  'Restricted pastoral-care record. Assignment to this record does not grant broad access to the linked contact directory.';

create index care_record_branch_status_idx
  on public.care_record(branch_id, status, created_at desc);
create index care_record_contact_idx
  on public.care_record(contact_id, created_at desc);

create table public.care_assignment (
  id uuid primary key default gen_random_uuid(),
  care_record_id uuid not null,
  branch_id uuid not null,
  assignee_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  assigned_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (care_record_id, branch_id)
    references public.care_record(id, branch_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create unique index care_assignment_one_active_assignee_record_idx
  on public.care_assignment(assignee_user_id, care_record_id)
  where ends_at is null and revoked_at is null;
create index care_assignment_record_idx
  on public.care_assignment(care_record_id, assignee_user_id)
  where ends_at is null and revoked_at is null;

create table public.care_interaction (
  id uuid primary key default gen_random_uuid(),
  care_record_id uuid not null,
  branch_id uuid not null,
  actor_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  interaction_type text not null
    check (interaction_type in ('call', 'visit', 'meeting', 'other')),
  outcome_code text
    check (outcome_code is null or outcome_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  restricted_note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (care_record_id, branch_id)
    references public.care_record(id, branch_id) on delete restrict
);

comment on table public.care_interaction is
  'Restricted pastoral interaction record. Never expose in generic contact history, reports, notifications or offline data.';

create index care_interaction_record_time_idx
  on public.care_interaction(care_record_id, occurred_at desc);
create index care_interaction_actor_time_idx
  on public.care_interaction(actor_user_id, occurred_at desc);

-- The original data dictionary had a prayer audit table but no separate care
-- audit table. This companion table is required so per-read care auditing is
-- actually enforceable without overloading prayer_request_id.
create table public.care_access_audit (
  id uuid primary key default gen_random_uuid(),
  care_record_id uuid not null,
  branch_id uuid not null,
  actor_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  action text not null
    check (action in ('read', 'update', 'assign', 'revoke', 'oversight')),
  reason text,
  request_id text,
  accessed_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  foreign key (care_record_id, branch_id)
    references public.care_record(id, branch_id) on delete restrict,
  check (jsonb_typeof(safe_metadata) = 'object'),
  check (action <> 'oversight' or length(btrim(coalesce(reason, ''))) > 0)
);

comment on table public.care_access_audit is
  'Append-only record of care narrative reads and privileged actions. A dedicated relation is required for auditable care reads.';

create index care_access_audit_record_time_idx
  on public.care_access_audit(care_record_id, accessed_at desc);
create index care_access_audit_actor_time_idx
  on public.care_access_audit(actor_user_id, accessed_at desc);

create or replace function private.reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'This audit relation is append-only';
end;
$$;

revoke all on function private.reject_append_only_mutation() from public, anon, authenticated;

create trigger prayer_access_audit_append_only
  before update or delete on public.prayer_access_audit
  for each row execute function private.reject_append_only_mutation();
create trigger care_access_audit_append_only
  before update or delete on public.care_access_audit
  for each row execute function private.reject_append_only_mutation();

create trigger prayer_request_set_updated_at before update on public.prayer_request
  for each row execute function private.set_updated_at();
create trigger care_record_set_updated_at before update on public.care_record
  for each row execute function private.set_updated_at();

-- Never grant direct client access to pastoral narratives or audit ledgers.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'prayer_request', 'prayer_assignment', 'prayer_access_audit',
    'care_group', 'care_group_membership', 'care_record',
    'care_assignment', 'care_interaction', 'care_access_audit'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end;
$$;

-- Only the trusted pastoral Edge Function and invoker-rights RPCs receive
-- Data API table privileges. Browser roles remain revoked. Audit ledgers are
-- insert-only for the service role.
revoke all on table
  public.prayer_request,
  public.prayer_assignment,
  public.prayer_access_audit,
  public.care_group,
  public.care_group_membership,
  public.care_record,
  public.care_assignment,
  public.care_interaction,
  public.care_access_audit
from service_role;
grant select on table
  public.prayer_request,
  public.prayer_assignment,
  public.care_record,
  public.care_assignment,
  public.care_interaction
to service_role;
grant insert on table
  public.prayer_access_audit,
  public.care_access_audit
to service_role;

commit;
