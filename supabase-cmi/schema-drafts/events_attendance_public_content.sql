-- CMI Follow-up v2.1 — events, attendance, transport and public-content schema draft.
-- Review draft only: CI applies this in a disposable local CMI stack.
-- Do not promote to permanent migration or hosted database until D-05/D-06,
-- D-12/D-13 and applicable R-01..R-12 decisions are approved.
-- All tables remain RLS-enabled with no browser grants or policies.
begin;

create table public.event (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 220),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Accra',
  location text,
  capacity integer check (capacity is null or capacity > 0),
  registration_state text not null default 'closed'
    check (registration_state in ('closed', 'open')),
  visibility text not null default 'private'
    check (visibility in ('public', 'staff', 'private')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'cancelled', 'completed')),
  transport_enabled boolean not null default false,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id),
  check (ends_at > starts_at),
  check (timezone = 'Africa/Accra' or length(timezone) between 3 and 64)
);
create index event_branch_schedule_idx on public.event(branch_id, starts_at desc);
create index event_public_schedule_idx on public.event(starts_at)
  where status = 'published' and visibility = 'public';

-- Explicit typed assignment relations avoid polymorphic target IDs.
create table public.event_staff_assignment (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  branch_id uuid not null,
  staff_auth_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  assignment_role text not null default 'support'
    check (assignment_role in ('owner', 'organizer', 'checkin', 'transport', 'support')),
  assigned_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);
create unique index event_staff_assignment_active_uq
  on public.event_staff_assignment(event_id, staff_auth_user_id, assignment_role)
  where ends_at is null and revoked_at is null;

create table public.event_team_assignment (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  branch_id uuid not null,
  team_id uuid not null,
  assignment_role text not null default 'support'
    check (assignment_role in ('organizer', 'ushering', 'transport', 'support')),
  assigned_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict,
  foreign key (team_id, branch_id) references public.team(id, branch_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);
create unique index event_team_assignment_active_uq
  on public.event_team_assignment(event_id, team_id, assignment_role)
  where ends_at is null and revoked_at is null;

create table public.event_registration (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  branch_id uuid not null,
  contact_id uuid,
  attendee_name_snapshot text not null
    check (length(btrim(attendee_name_snapshot)) between 2 and 180),
  attendee_phone_snapshot text
    check (attendee_phone_snapshot is null or attendee_phone_snapshot ~ '^\+[1-9][0-9]{7,14}$'),
  attendee_email_snapshot text
    check (attendee_email_snapshot is null or attendee_email_snapshot = lower(btrim(attendee_email_snapshot))),
  registration_source text not null
    check (registration_source in ('public_site', 'staff', 'event_workspace')),
  consent_record_id uuid,
  status text not null default 'registered'
    check (status in ('registered', 'cancelled', 'attended', 'no_show')),
  registered_at timestamptz not null default now(),
  client_request_id uuid,
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict,
  foreign key (contact_id, branch_id) references public.contact(id, branch_id) on delete restrict,
  unique (id, event_id, branch_id),
  check (registration_source <> 'public_site' or client_request_id is not null)
);
create unique index event_registration_idempotency_uq
  on public.event_registration(event_id, registration_source, client_request_id)
  where client_request_id is not null;
create index event_registration_event_status_idx
  on public.event_registration(event_id, status, registered_at);
create index event_registration_contact_idx
  on public.event_registration(contact_id) where contact_id is not null;

create table public.transport_option (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  branch_id uuid not null,
  label text not null check (length(btrim(label)) between 2 and 160),
  capacity integer check (capacity is null or capacity > 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict,
  unique (id, event_id, branch_id)
);
create index transport_option_event_idx on public.transport_option(event_id) where is_enabled;

create table public.transport_reservation (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  event_id uuid not null,
  transport_option_id uuid not null,
  branch_id uuid not null,
  pickup_area text,
  seat_count integer not null default 1 check (seat_count between 1 and 20),
  status text not null default 'reserved'
    check (status in ('reserved', 'cancelled', 'boarded', 'no_show')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (registration_id, event_id, branch_id)
    references public.event_registration(id, event_id, branch_id) on delete restrict,
  foreign key (transport_option_id, event_id, branch_id)
    references public.transport_option(id, event_id, branch_id) on delete restrict
);
create unique index transport_reservation_one_active_uq
  on public.transport_reservation(registration_id, transport_option_id)
  where status in ('reserved', 'boarded');
create index transport_reservation_option_status_idx
  on public.transport_reservation(transport_option_id, status);

create table public.event_checkin (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  branch_id uuid not null,
  registration_id uuid,
  contact_id uuid,
  attendee_name_snapshot text
    check (attendee_name_snapshot is null or length(btrim(attendee_name_snapshot)) between 2 and 180),
  checked_in_at timestamptz not null default now(),
  recorded_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  source text not null check (source in ('staff', 'event_workspace', 'offline_sync')),
  client_request_id uuid not null,
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict,
  foreign key (registration_id, event_id, branch_id)
    references public.event_registration(id, event_id, branch_id) on delete restrict,
  foreign key (contact_id, branch_id) references public.contact(id, branch_id) on delete restrict,
  unique (event_id, client_request_id),
  check (registration_id is not null or contact_id is not null
    or length(btrim(coalesce(attendee_name_snapshot, ''))) > 0)
);
create unique index event_checkin_registration_once_uq
  on public.event_checkin(event_id, registration_id) where registration_id is not null;
create index event_checkin_event_time_idx on public.event_checkin(event_id, checked_in_at desc);

create table public.event_closeout (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  branch_id uuid not null,
  submitted_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.staff_profile(auth_user_id) on delete restrict,
  reviewed_at timestamptz,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'approved', 'returned')),
  attendee_count integer check (attendee_count is null or attendee_count >= 0),
  registration_count integer check (registration_count is null or registration_count >= 0),
  transport_seat_count integer check (transport_seat_count is null or transport_seat_count >= 0),
  summary_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict,
  unique (event_id, branch_id),
  check ((reviewed_by is null and reviewed_at is null)
    or (reviewed_by is not null and reviewed_at is not null))
);
create table public.event_closeout_event (
  id uuid primary key default gen_random_uuid(),
  closeout_id uuid not null references public.event_closeout(id) on delete restrict,
  actor_user_id uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  action text not null check (action in ('submitted', 'approved', 'returned', 'reopened')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create table public.event_idempotency_receipt (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  branch_id uuid not null,
  operation text not null check (operation in (
    'public_registration','staff_registration','registration_cancel',
    'transport_reservation','transport_cancel','event_checkin',
    'closeout_submit','closeout_review'
  )),
  caller_class text not null check (caller_class in ('public','staff')),
  actor_user_id uuid references public.staff_profile(auth_user_id) on delete restrict,
  idempotency_key uuid not null,
  -- SHA-256 of the server-normalized, canonical request; never accept a client digest.
  request_digest bytea not null check (octet_length(request_digest) = 32),
  resource_type text not null check (resource_type in (
    'event_registration','transport_reservation','event_checkin','event_closeout'
  )),
  resource_id uuid not null,
  response_status smallint not null check (response_status between 200 and 299),
  created_at timestamptz not null default now(),
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict,
  check (
    (caller_class = 'public' and actor_user_id is null and operation = 'public_registration')
    or
    (caller_class = 'staff' and actor_user_id is not null and operation <> 'public_registration')
  ),
  unique nulls not distinct (
    event_id, branch_id, operation, caller_class, actor_user_id, idempotency_key
  )
);
create index event_idempotency_receipt_created_idx
  on public.event_idempotency_receipt(created_at);

-- A check-in that carries both references must identify the same canonical contact.
create or replace function public.enforce_event_checkin_identity_consistency()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  linked_contact_id uuid;
begin
  if new.registration_id is not null and new.contact_id is not null then
    select r.contact_id
      into linked_contact_id
      from public.event_registration r
     where r.id = new.registration_id
       and r.event_id = new.event_id
       and r.branch_id = new.branch_id;

    if linked_contact_id is distinct from new.contact_id then
      raise exception 'check-in contact must match the registration contact'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

create trigger event_checkin_identity_consistency_trg
before insert or update of registration_id, contact_id, event_id, branch_id
on public.event_checkin
for each row
execute function public.enforce_event_checkin_identity_consistency();

-- Closeout history is append-only; protect against UPDATE, DELETE and TRUNCATE.
create or replace function public.prevent_event_closeout_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'event closeout history is append-only'
    using errcode = '55000';
end;
$function$;

create trigger event_closeout_event_no_mutation_trg
before update or delete on public.event_closeout_event
for each row
execute function public.prevent_event_closeout_event_mutation();

create trigger event_closeout_event_no_truncate_trg
before truncate on public.event_closeout_event
for each statement
execute function public.prevent_event_closeout_event_mutation();


-- Typed calendar scope: branch, team, event, or an individual's own entry.
create table public.calendar_entry (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  entry_type text not null check (entry_type in ('service', 'event', 'followup', 'prayer_schedule', 'other')),
  title text not null check (length(btrim(title)) between 2 and 220),
  starts_at timestamptz not null,
  ends_at timestamptz,
  scope_type text not null check (scope_type in ('branch', 'team', 'event', 'own')),
  team_id uuid,
  event_id uuid,
  owner_user_id uuid references public.staff_profile(auth_user_id) on delete restrict,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, branch_id) references public.team(id, branch_id) on delete restrict,
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (
    (scope_type = 'branch' and team_id is null and event_id is null and owner_user_id is null)
    or (scope_type = 'team' and team_id is not null and event_id is null and owner_user_id is null)
    or (scope_type = 'event' and team_id is null and event_id is not null and owner_user_id is null)
    or (scope_type = 'own' and team_id is null and event_id is null and owner_user_id = created_by)
  )
);
create index calendar_entry_branch_time_idx on public.calendar_entry(branch_id, starts_at);
create index calendar_entry_team_time_idx on public.calendar_entry(team_id, starts_at) where team_id is not null;
create index calendar_entry_event_time_idx on public.calendar_entry(event_id, starts_at) where event_id is not null;

-- Announcement audience is normalized into typed link tables. No polymorphic audience_ref.
create table public.announcement (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branch(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 220),
  body text not null check (length(btrim(body)) between 1 and 20000),
  is_public boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id),
  check (status <> 'published' or published_at is not null)
);
create table public.announcement_team_audience (
  announcement_id uuid not null,
  branch_id uuid not null,
  team_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (announcement_id, team_id),
  foreign key (announcement_id, branch_id)
    references public.announcement(id, branch_id) on delete restrict,
  foreign key (team_id, branch_id) references public.team(id, branch_id) on delete restrict
);
create table public.announcement_event_audience (
  announcement_id uuid not null,
  branch_id uuid not null,
  event_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (announcement_id, event_id),
  foreign key (announcement_id, branch_id)
    references public.announcement(id, branch_id) on delete restrict,
  foreign key (event_id, branch_id) references public.event(id, branch_id) on delete restrict
);

create table public.church_public_profile (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null unique references public.church(id) on delete restrict,
  public_name text not null check (length(btrim(public_name)) between 2 and 180),
  welcome_content text,
  public_phone text check (public_phone is null or public_phone ~ '^\+[1-9][0-9]{7,14}$'),
  public_email text,
  address_text text,
  website_url text check (website_url is null or website_url ~ '^https://'),
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  updated_by uuid references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.welcome_message (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branch(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 220),
  body text not null check (length(btrim(body)) between 1 and 12000),
  display_order integer not null default 0 check (display_order >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);
create table public.sermon (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branch(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 220),
  body text not null check (length(btrim(body)) between 1 and 30000),
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);
create index sermon_published_idx on public.sermon(published_at desc) where status = 'published';
create table public.daily_word (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 220),
  body text not null check (length(btrim(body)) between 1 and 20000),
  publication_date date not null,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);
create index daily_word_publication_idx on public.daily_word(publication_date desc) where status = 'published';
create table public.digital_tract (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 220),
  body text,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

-- Typed document links replace the former content_type/content_id polymorphic pair.
create table public.external_document_link (
  id uuid primary key default gen_random_uuid(),
  digital_tract_id uuid references public.digital_tract(id) on delete restrict,
  sermon_id uuid references public.sermon(id) on delete restrict,
  label text not null check (length(btrim(label)) between 2 and 180),
  url text not null check (url ~ '^https://'),
  created_by uuid not null references public.staff_profile(auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((digital_tract_id is not null)::integer + (sermon_id is not null)::integer = 1)
);
create index external_document_link_tract_idx on public.external_document_link(digital_tract_id) where digital_tract_id is not null;
create index external_document_link_sermon_idx on public.external_document_link(sermon_id) where sermon_id is not null;

-- Mutable rows receive consistent updated_at timestamps.
do $$
declare t text;
begin
  foreach t in array array[
    'event','transport_reservation','event_closeout','calendar_entry','announcement',
    'church_public_profile','welcome_message','sermon','daily_word','digital_tract'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- Explicit deny-by-default: no public/anon/authenticated table access yet.
do $$
declare t text;
begin
  foreach t in array array[
    'event','event_staff_assignment','event_team_assignment','event_registration',
    'transport_option','transport_reservation','event_checkin','event_closeout',
    'event_closeout_event','event_idempotency_receipt','calendar_entry','announcement','announcement_team_audience',
    'announcement_event_audience','church_public_profile','welcome_message','sermon',
    'daily_word','digital_tract','external_document_link'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;

comment on schema public is
  'CMI event and public-content draft; public projections and trusted endpoints are not yet enabled.';
comment on table public.event_registration is
  'Registration snapshots are retained only pending D-05/D-13 approval; public callers must use a narrow trusted endpoint.';
comment on table public.event_checkin is
  'Check-in requires event-scoped idempotency. Name-only matching is not identity proof; walk-in policy remains subject to D-06.';
comment on table public.event_idempotency_receipt is
  'Private idempotency ledger. Trusted server code computes SHA-256 over normalized requests and compares digests on replay; no browser role receives direct access. Retention remains subject to D-13.';
comment on table public.transport_reservation is
  'Seat capacity requires a serialized trusted transaction; a client-side count is not sufficient.';
comment on table public.announcement is
  'SMS delivery is intentionally delegated to the canonical SMS outbox/campaign domain; no competing delivery state is stored here.';

commit;
