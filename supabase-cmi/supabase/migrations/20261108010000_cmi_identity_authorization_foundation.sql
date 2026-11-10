-- CMI Follow-up v2.1 — identity and authorization foundation.
-- This migration belongs ONLY to /supabase-cmi. Do not apply legacy
-- /supabase ChurchConnect migrations to a CMI environment.
--
-- Security posture:
--   * six-role catalogue only; no role-capability grants are seeded;
--   * no anon/authenticated table grants or RLS policies are created;
--   * all tables have RLS enabled (deny by default);
--   * Auth credentials remain in Supabase Auth; no PIN/password columns exist.
--
-- Stakeholder approvals R-01..R-12 and D-01..D-13 remain pending.
-- This is a reviewable local-development migration and has not been applied.

begin;

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create table public.church (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 180),
  timezone text not null default 'Africa/Accra',
  is_configured_instance boolean not null default true check (is_configured_instance),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id)
);

-- CMI is one church instance. The unique index permits at most one configured
-- church row; bootstrap must create exactly one through a controlled process.
create unique index church_single_configured_instance_uq
  on public.church (is_configured_instance);

create table public.branch (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.church(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  code text,
  timezone text not null default 'Africa/Accra',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, church_id),
  unique (church_id, code)
);

create table public.staff_profile (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 2 and 180),
  email text,
  phone_e164 text,
  account_status text not null default 'invited'
    check (account_status in ('invited', 'active', 'inactive', 'suspended')),
  last_active_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((account_status = 'inactive' and deactivated_at is not null)
      or (account_status <> 'inactive' and deactivated_at is null))
);

create index staff_profile_status_idx on public.staff_profile(account_status);
create index staff_profile_name_idx on public.staff_profile using btree (lower(full_name));

create table public.role (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code in (
      'admin_pastor',
      'coordinator',
      'team_leader',
      'field_worker',
      'follow_up_volunteer',
      'prayer_intercessor'
    )),
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.role (code, name, description) values
  ('admin_pastor', 'Admin / Pastor', 'Combined church administration and pastoral leadership role.'),
  ('coordinator', 'Coordinator', 'Coordinates operational follow-up and ministry workflows.'),
  ('team_leader', 'Team Leader', 'Leads an explicitly assigned ministry team.'),
  ('field_worker', 'Field Worker', 'Captures contacts and performs assigned field follow-up.'),
  ('follow_up_volunteer', 'Follow-up Volunteer', 'Completes assigned follow-up activities.'),
  ('prayer_intercessor', 'Prayer Intercessor', 'Works only with prayer requests assigned to the intercessor.')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description;

create table public.capability (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  description text not null,
  sensitivity text not null default 'ordinary'
    check (sensitivity in ('ordinary', 'restricted', 'highly_restricted')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Catalogue-to-role grants are intentionally empty until R-01..R-12 and
-- D-01 are approved. Scope is explicit and never inferred from role union.
create table public.role_capability (
  role_id uuid not null references public.role(id) on delete restrict,
  capability_id uuid not null references public.capability(id) on delete restrict,
  scope_mode text not null
    check (scope_mode in ('branch', 'team', 'assigned', 'event', 'self', 'explicit_share', 'oversight')),
  created_at timestamptz not null default now(),
  primary key (role_id, capability_id, scope_mode)
);

create table public.staff_role_assignment (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profile(id) on delete restrict,
  role_id uuid not null references public.role(id) on delete restrict,
  branch_id uuid not null references public.branch(id) on delete restrict,
  assigned_by uuid not null references public.staff_profile(id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create unique index staff_role_assignment_one_active_uq
  on public.staff_role_assignment(staff_profile_id, role_id, branch_id)
  where ends_at is null and revoked_at is null;

create index staff_role_assignment_branch_active_idx
  on public.staff_role_assignment(branch_id, role_id, staff_profile_id)
  where ends_at is null and revoked_at is null;

-- Prevent overlapping time-bounded assignments, including concurrent inserts.
-- The unique partial index above handles the common open-ended case; this
-- exclusion constraint closes the gap for finite, overlapping intervals.
alter table public.staff_role_assignment
  add constraint staff_role_assignment_no_overlap_excl
  exclude using gist (
    staff_profile_id with =,
    role_id with =,
    branch_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (revoked_at is null);

create table public.team (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id)
);

create unique index team_active_name_per_branch_uq
  on public.team(branch_id, lower(name))
  where is_active;

create table public.staff_team_membership (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profile(id) on delete restrict,
  team_id uuid not null,
  branch_id uuid not null,
  membership_role text not null default 'member'
    check (membership_role in ('member', 'leader')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.staff_profile(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (team_id, branch_id) references public.team(id, branch_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create unique index staff_team_membership_one_active_uq
  on public.staff_team_membership(staff_profile_id, team_id)
  where ends_at is null and revoked_at is null;

alter table public.staff_team_membership
  add constraint staff_team_membership_no_overlap_excl
  exclude using gist (
    staff_profile_id with =,
    team_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (revoked_at is null);

create table public.service_area (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id),
  unique (branch_id, code)
);

create table public.staff_area_coverage (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profile(id) on delete restrict,
  service_area_id uuid not null,
  branch_id uuid not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references public.staff_profile(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (service_area_id, branch_id)
    references public.service_area(id, branch_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at)
);

create unique index staff_area_coverage_one_active_uq
  on public.staff_area_coverage(staff_profile_id, service_area_id)
  where ends_at is null;

alter table public.staff_area_coverage
  add constraint staff_area_coverage_no_overlap_excl
  exclude using gist (
    staff_profile_id with =,
    service_area_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  );

-- Maintain timestamps on mutable catalogue/configuration rows.
create trigger church_set_updated_at before update on public.church
  for each row execute function private.set_updated_at();
create trigger branch_set_updated_at before update on public.branch
  for each row execute function private.set_updated_at();
create trigger staff_profile_set_updated_at before update on public.staff_profile
  for each row execute function private.set_updated_at();
create trigger team_set_updated_at before update on public.team
  for each row execute function private.set_updated_at();
create trigger service_area_set_updated_at before update on public.service_area
  for each row execute function private.set_updated_at();

-- RLS is enabled on every table. No policies and no browser grants are added
-- in this foundation slice: access is denied until reviewed policies exist.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'church', 'branch', 'staff_profile', 'role', 'capability',
    'role_capability', 'staff_role_assignment', 'team',
    'staff_team_membership', 'service_area', 'staff_area_coverage'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

-- Supabase Data API exposure is opt-in for newly created public tables.
-- Edge Functions use service_role through PostgREST, so grant only the
-- server-side identity lookups they require. Browser roles stay closed.
grant usage on schema public to service_role;
revoke all on table
  public.church,
  public.branch,
  public.staff_profile,
  public.role,
  public.capability,
  public.role_capability,
  public.staff_role_assignment,
  public.team,
  public.staff_team_membership,
  public.service_area,
  public.staff_area_coverage
from service_role;
grant select on table
  public.church,
  public.branch,
  public.staff_profile,
  public.role,
  public.capability,
  public.role_capability,
  public.staff_role_assignment,
  public.team,
  public.staff_team_membership,
  public.service_area,
  public.staff_area_coverage
to service_role;

comment on schema private is
  'Unexposed CMI helper routines. Never expose privileged routines through the Data API.';
comment on table public.staff_profile is
  'Application staff profile linked to Supabase Auth. Credentials and PINs are never stored here.';
comment on table public.role_capability is
  'Approved role-to-capability grants only. Empty until stakeholder decisions R-01..R-12 and D-01 are approved.';
comment on table public.staff_role_assignment is
  'Time-bounded role assignment. Effective access must additionally satisfy branch, team, event, assignment and sensitive-record predicates.';

commit;
