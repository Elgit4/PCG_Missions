-- ChurchConnect core schema
-- Logical baseline: SRS v1.0 and DATABASE_DESIGN_v1.0.md
-- One church, two roles only. This migration creates structure and seed data only.
-- Apply first to a dedicated ChurchConnect Supabase project, never to SkillSprint.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Identity and access catalogue
-- ---------------------------------------------------------------------------

create table public.roles (
  role_code text primary key,
  role_name text not null,
  description text,
  is_system_role boolean not null default true,
  constraint roles_allowed_codes check (role_code in ('ADMIN', 'MISSION_MEMBER'))
);

insert into public.roles (role_code, role_name, description)
values
  ('ADMIN', 'Church Administrator', 'Full ChurchConnect administration.'),
  ('MISSION_MEMBER', 'Mission Member', 'Assigned follow-up and specifically authorized duties.')
on conflict (role_code) do update
set role_name = excluded.role_name,
    description = excluded.description;

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role_code text not null references public.roles(role_code) on update restrict on delete restrict,
  full_name text not null,
  account_status text not null default 'INVITED'
    check (account_status in ('INVITED', 'ACTIVE', 'INACTIVE')),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_contact_details (
  user_id uuid primary key references public.user_profiles(user_id) on delete restrict,
  contact_email text,
  phone_number text,
  updated_at timestamptz not null default now()
);

create table public.permission_catalog (
  permission_code text primary key,
  permission_name text not null,
  description text not null,
  is_sensitive boolean not null default false
);

insert into public.permission_catalog
  (permission_code, permission_name, description, is_sensitive)
values
  ('VISITOR_REGISTER', 'Register visitors', 'Create new visitor profiles and capture initial consent.', false),
  ('ATTENDANCE_RECORD', 'Record attendance', 'Record an attendance event for a visitor within the member\'s permitted scope.', false),
  ('VISITOR_DIRECTORY_VIEW', 'Search visitor directory', 'Search existing visitor records for explicitly authorized registration or attendance duties.', false),
  ('SMS_SEND', 'Send SMS', 'Initiate permitted manual SMS to assigned or shared visitors.', false),
  ('CONSENT_MANAGE', 'Manage contact consent', 'Capture or update channel consent evidence.', false),
  ('INTEGRATION_RECORD', 'Record integration activity', 'Record approved stage and programme activity.', false),
  ('PASTORAL_VIEW', 'View restricted pastoral records', 'View prayer requests and sensitive commitment records.', true),
  ('PASTORAL_RECORD', 'Record restricted pastoral information', 'Create prayer or sensitive pastoral records.', true),
  ('REPORT_EXPORT', 'Export reports', 'Export approved operational reports.', false)
on conflict (permission_code) do update
set permission_name = excluded.permission_name,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

create table public.user_permission_grants (
  grant_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  permission_code text not null references public.permission_catalog(permission_code) on delete restrict,
  granted_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  grant_status text not null default 'ACTIVE'
    check (grant_status in ('ACTIVE', 'REVOKED')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  grant_reason text,
  constraint permission_grant_revocation_consistent
    check ((grant_status = 'ACTIVE' and revoked_at is null)
        or (grant_status = 'REVOKED' and revoked_at is not null))
);

create unique index user_permission_grants_one_active_idx
  on public.user_permission_grants(user_id, permission_code)
  where grant_status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Visitor, attendance, consent and restricted pastoral records
-- ---------------------------------------------------------------------------

create table public.service_types (
  service_type_id uuid primary key default gen_random_uuid(),
  service_name text not null unique,
  service_category text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.integration_stages (
  integration_stage_id uuid primary key default gen_random_uuid(),
  stage_name text not null unique,
  stage_description text,
  stage_order integer not null,
  completion_criteria text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_stage_order_nonnegative check (stage_order >= 0)
);

create table public.visitors (
  visitor_id uuid primary key default gen_random_uuid(),
  full_name text not null,
  normalized_phone text,
  email_address text,
  residential_area text,
  referral_source text,
  visitor_type text not null default 'VISITOR'
    check (visitor_type in ('VISITOR', 'NEW_CONVERT', 'OTHER')),
  lifecycle_status text not null default 'OPEN'
    check (lifecycle_status in ('OPEN', 'INTEGRATING', 'INTEGRATED', 'CLOSED', 'ARCHIVED')),
  engagement_status text not null default 'NEW'
    check (engagement_status in ('NEW', 'CONTACT_ATTEMPTED', 'CONTACTED', 'RESPONDED', 'UNREACHABLE', 'DO_NOT_CONTACT')),
  current_integration_stage_id uuid references public.integration_stages(integration_stage_id) on delete set null,
  follow_up_required boolean not null default true,
  created_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  updated_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint visitor_name_not_blank check (length(trim(full_name)) > 0)
);

create table public.visitor_visits (
  visit_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  service_type_id uuid not null references public.service_types(service_type_id) on delete restrict,
  recorded_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  visit_date date not null,
  attendance_time time,
  attendance_notes text,
  created_at timestamptz not null default now(),
  constraint visitor_service_date_unique unique (visitor_id, service_type_id, visit_date)
);

create table public.visitor_consents (
  consent_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  channel text not null check (channel in ('SMS', 'PHONE', 'EMAIL')),
  purpose text not null
    check (purpose in ('VISITOR_FOLLOW_UP', 'PROGRAM_UPDATES', 'GENERAL_UPDATES', 'PASTORAL_CARE')),
  consent_status text not null
    check (consent_status in ('GRANTED', 'WITHDRAWN', 'DECLINED', 'NOT_RECORDED')),
  captured_at timestamptz not null default now(),
  capture_method text,
  captured_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  withdrawn_at timestamptz,
  evidence_note text,
  constraint consent_withdrawal_time_consistent
    check ((consent_status = 'WITHDRAWN' and withdrawn_at is not null)
        or consent_status <> 'WITHDRAWN')
);

create table public.faith_commitment_events (
  commitment_event_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  recorded_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null,
  commitment_type text not null,
  restricted_summary text,
  created_at timestamptz not null default now()
);

create table public.faith_commitment_access (
  commitment_access_id uuid primary key default gen_random_uuid(),
  commitment_event_id uuid not null references public.faith_commitment_events(commitment_event_id) on delete restrict,
  user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  granted_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint faith_commitment_access_user_event_unique unique (commitment_event_id, user_id)
);

create table public.prayer_requests (
  prayer_request_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  created_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  request_text text not null,
  request_status text not null default 'OPEN'
    check (request_status in ('OPEN', 'IN_PROGRESS', 'REFERRED', 'CLOSED')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.prayer_request_access (
  prayer_access_id uuid primary key default gen_random_uuid(),
  prayer_request_id uuid not null references public.prayer_requests(prayer_request_id) on delete restrict,
  user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  granted_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint prayer_access_user_request_unique unique (prayer_request_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Assignment and follow-up operations
-- ---------------------------------------------------------------------------

create table public.assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  primary_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  assigned_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  assignment_status text not null default 'ACTIVE'
    check (assignment_status in ('ACTIVE', 'ENDED', 'CANCELLED')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  assignment_reason text,
  constraint assignment_end_state_consistent
    check ((assignment_status = 'ACTIVE' and ended_at is null)
        or (assignment_status in ('ENDED', 'CANCELLED') and ended_at is not null)),
  constraint assignment_id_visitor_unique unique (assignment_id, visitor_id)
);

create unique index assignments_one_active_primary_per_visitor_idx
  on public.assignments(visitor_id)
  where assignment_status = 'ACTIVE' and ended_at is null;

create table public.assignment_collaborators (
  collaborator_id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(assignment_id) on delete restrict,
  user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  added_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  collaborator_status text not null default 'ACTIVE'
    check (collaborator_status in ('ACTIVE', 'REMOVED')),
  constraint collaborator_removal_consistent
    check ((collaborator_status = 'ACTIVE' and removed_at is null)
        or (collaborator_status = 'REMOVED' and removed_at is not null))
);

create unique index assignment_collaborators_one_active_idx
  on public.assignment_collaborators(assignment_id, user_id)
  where collaborator_status = 'ACTIVE' and removed_at is null;

create table public.assignment_history (
  assignment_history_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  previous_assignment_id uuid,
  new_assignment_id uuid not null,
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  change_type text not null
    check (change_type in ('INITIAL_ASSIGNMENT', 'HANDOVER', 'REASSIGNMENT', 'CLOSURE')),
  change_reason text,
  changed_at timestamptz not null default now(),
  constraint assignment_history_previous_visitor_fk
    foreign key (previous_assignment_id, visitor_id)
    references public.assignments(assignment_id, visitor_id) on delete restrict,
  constraint assignment_history_new_visitor_fk
    foreign key (new_assignment_id, visitor_id)
    references public.assignments(assignment_id, visitor_id) on delete restrict
);

create table public.sms_templates (
  sms_template_id uuid primary key default gen_random_uuid(),
  template_name text not null,
  template_category text not null,
  message_body text not null,
  approval_status text not null default 'DRAFT'
    check (approval_status in ('DRAFT', 'APPROVED', 'REJECTED', 'INACTIVE')),
  is_active boolean not null default false,
  created_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  approved_by_user_id uuid references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint sms_template_approval_consistent
    check ((approval_status = 'APPROVED' and approved_by_user_id is not null and approved_at is not null)
        or approval_status <> 'APPROVED')
);

create table public.follow_up_workflows (
  workflow_id uuid primary key default gen_random_uuid(),
  workflow_name text not null,
  description text,
  trigger_type text not null
    check (trigger_type in ('ON_ASSIGNMENT', 'MANUAL_START', 'ON_VISIT', 'OTHER')),
  workflow_status text not null default 'DRAFT'
    check (workflow_status in ('DRAFT', 'ACTIVE', 'PAUSED', 'INACTIVE')),
  created_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  approved_by_user_id uuid references public.user_profiles(user_id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_approval_consistent
    check ((workflow_status = 'ACTIVE' and approved_by_user_id is not null and approved_at is not null)
        or workflow_status <> 'ACTIVE')
);

create table public.follow_up_workflow_steps (
  workflow_step_id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.follow_up_workflows(workflow_id) on delete restrict,
  sms_template_id uuid references public.sms_templates(sms_template_id) on delete restrict,
  step_order integer not null,
  day_offset integer not null default 0,
  time_of_day time not null default time '10:00',
  channel text not null check (channel in ('CALL', 'SMS', 'IN_PERSON', 'OTHER')),
  step_purpose text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint workflow_step_order_nonnegative check (step_order > 0),
  constraint workflow_step_day_offset_nonnegative check (day_offset >= 0),
  constraint workflow_step_order_unique unique (workflow_id, step_order),
  constraint sms_workflow_step_requires_template check (channel <> 'SMS' or sms_template_id is not null)
);

create table public.visitor_workflow_instances (
  workflow_instance_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  workflow_id uuid not null references public.follow_up_workflows(workflow_id) on delete restrict,
  assignment_id uuid not null references public.assignments(assignment_id) on delete restrict,
  instance_status text not null default 'ACTIVE'
    check (instance_status in ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  started_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  constraint workflow_instance_assignment_visitor_fk
    foreign key (assignment_id, visitor_id)
    references public.assignments(assignment_id, visitor_id) on delete restrict,
  constraint workflow_instance_id_visitor_unique unique (workflow_instance_id, visitor_id)
);

create unique index visitor_workflow_one_active_instance_idx
  on public.visitor_workflow_instances(visitor_id, workflow_id)
  where instance_status = 'ACTIVE';

create table public.follow_up_tasks (
  task_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  assignment_id uuid not null,
  workflow_instance_id uuid,
  workflow_step_id uuid references public.follow_up_workflow_steps(workflow_step_id) on delete restrict,
  assigned_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  created_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  task_title text not null,
  task_purpose text,
  channel text not null check (channel in ('CALL', 'SMS', 'IN_PERSON', 'OTHER')),
  due_at timestamptz not null,
  task_status text not null default 'PENDING'
    check (task_status in ('PENDING', 'DUE', 'IN_PROGRESS', 'COMPLETED', 'RESCHEDULED', 'CANCELLED')),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_assignment_visitor_fk
    foreign key (assignment_id, visitor_id)
    references public.assignments(assignment_id, visitor_id) on delete restrict,
  constraint task_workflow_instance_visitor_fk
    foreign key (workflow_instance_id, visitor_id)
    references public.visitor_workflow_instances(workflow_instance_id, visitor_id) on delete restrict,
  constraint task_id_visitor_unique unique (task_id, visitor_id),
  constraint task_workflow_step_requires_instance check (workflow_step_id is null or workflow_instance_id is not null),
  constraint task_completion_consistent check (
    (task_status = 'COMPLETED' and completed_at is not null)
    or (task_status <> 'COMPLETED' and completed_at is null)
  ),
  constraint task_cancellation_consistent check (
    (task_status = 'CANCELLED' and cancelled_at is not null)
    or (task_status <> 'CANCELLED' and cancelled_at is null)
  )
);

create unique index follow_up_tasks_idempotency_key_idx
  on public.follow_up_tasks(idempotency_key)
  where idempotency_key is not null;

create table public.follow_up_task_history (
  task_history_id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.follow_up_tasks(task_id) on delete restrict,
  actor_user_id uuid references public.user_profiles(user_id) on delete restrict,
  change_type text not null
    check (change_type in ('CREATED', 'RESCHEDULED', 'STATUS_CHANGED', 'REASSIGNED', 'CANCELLED', 'TRANSFERRED')),
  old_assigned_user_id uuid references public.user_profiles(user_id) on delete restrict,
  new_assigned_user_id uuid references public.user_profiles(user_id) on delete restrict,
  old_due_at timestamptz,
  new_due_at timestamptz,
  old_status text,
  new_status text,
  change_reason text,
  changed_at timestamptz not null default now()
);

create table public.follow_up_records (
  follow_up_record_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  task_id uuid,
  assignment_id uuid not null,
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  channel text not null check (channel in ('CALL', 'SMS', 'IN_PERSON', 'OTHER')),
  occurred_at timestamptz not null default now(),
  contact_outcome text not null,
  visitor_response text,
  interaction_summary text,
  next_action text,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  constraint record_assignment_visitor_fk
    foreign key (assignment_id, visitor_id)
    references public.assignments(assignment_id, visitor_id) on delete restrict,
  constraint record_task_visitor_fk
    foreign key (task_id, visitor_id)
    references public.follow_up_tasks(task_id, visitor_id) on delete restrict,
  constraint follow_up_record_id_visitor_unique unique (follow_up_record_id, visitor_id)
);

create table public.team_notes (
  team_note_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  assignment_id uuid references public.assignments(assignment_id) on delete restrict,
  author_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  note_body text not null,
  visibility_scope text not null default 'ASSIGNED_TEAM'
    check (visibility_scope in ('ASSIGNED_TEAM', 'ADMIN_ONLY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint team_note_assignment_visitor_fk
    foreign key (assignment_id, visitor_id)
    references public.assignments(assignment_id, visitor_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- SMS, integration programmes, notifications and audit records
-- ---------------------------------------------------------------------------

create table public.sms_messages (
  sms_message_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  sms_template_id uuid references public.sms_templates(sms_template_id) on delete restrict,
  task_id uuid,
  follow_up_record_id uuid,
  initiated_by_user_id uuid references public.user_profiles(user_id) on delete restrict,
  provider_name text not null,
  send_mode text not null check (send_mode in ('MANUAL', 'AUTOMATED')),
  recipient_phone_snapshot text not null,
  message_body_snapshot text not null,
  provider_message_id text,
  idempotency_key text,
  submission_status text not null default 'QUEUED'
    check (submission_status in ('QUEUED', 'SUBMITTED', 'DELIVERED', 'FAILED', 'UNKNOWN', 'SUPPRESSED')),
  estimated_cost numeric(12,4),
  cost_currency char(3),
  queued_at timestamptz not null default now(),
  submitted_at timestamptz,
  final_status_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  constraint sms_cost_nonnegative check (estimated_cost is null or estimated_cost >= 0),
  constraint sms_message_task_visitor_fk
    foreign key (task_id, visitor_id)
    references public.follow_up_tasks(task_id, visitor_id) on delete restrict,
  constraint sms_message_record_visitor_fk
    foreign key (follow_up_record_id, visitor_id)
    references public.follow_up_records(follow_up_record_id, visitor_id) on delete restrict
);

create unique index sms_messages_provider_message_id_idx
  on public.sms_messages(provider_name, provider_message_id)
  where provider_message_id is not null;

create unique index sms_messages_idempotency_key_idx
  on public.sms_messages(idempotency_key)
  where idempotency_key is not null;

create table public.sms_delivery_events (
  delivery_event_id uuid primary key default gen_random_uuid(),
  sms_message_id uuid not null references public.sms_messages(sms_message_id) on delete restrict,
  provider_event_id text,
  provider_status text not null,
  normalized_status text not null
    check (normalized_status in ('QUEUED', 'SUBMITTED', 'DELIVERED', 'FAILED', 'UNKNOWN')),
  event_payload_redacted jsonb,
  occurred_at timestamptz,
  received_at timestamptz not null default now()
);

create unique index sms_delivery_events_provider_event_idx
  on public.sms_delivery_events(provider_event_id)
  where provider_event_id is not null;

create table public.visitor_stage_history (
  stage_history_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  integration_stage_id uuid not null references public.integration_stages(integration_stage_id) on delete restrict,
  changed_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  changed_at timestamptz not null default now(),
  change_reason text
);

create table public.integration_programs (
  program_id uuid primary key default gen_random_uuid(),
  program_name text not null unique,
  program_category text not null,
  description text,
  is_active boolean not null default true,
  created_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.program_enrolments (
  enrolment_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(visitor_id) on delete restrict,
  program_id uuid not null references public.integration_programs(program_id) on delete restrict,
  enrolled_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  enrolled_at timestamptz not null default now(),
  enrolment_status text not null default 'ACTIVE'
    check (enrolment_status in ('ACTIVE', 'PAUSED', 'COMPLETED', 'WITHDRAWN')),
  completed_at timestamptz,
  constraint programme_enrolment_completed_consistent
    check ((enrolment_status = 'COMPLETED' and completed_at is not null)
        or (enrolment_status <> 'COMPLETED' and completed_at is null))
);

create table public.program_attendance (
  program_attendance_id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.program_enrolments(enrolment_id) on delete restrict,
  recorded_by_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  session_date date not null,
  attendance_status text not null
    check (attendance_status in ('PRESENT', 'ABSENT', 'EXCUSED', 'UNKNOWN')),
  attendance_note text,
  created_at timestamptz not null default now(),
  constraint programme_attendance_session_unique unique (enrolment_id, session_date)
);

create table public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  related_visitor_id uuid references public.visitors(visitor_id) on delete restrict,
  related_task_id uuid references public.follow_up_tasks(task_id) on delete restrict,
  notification_type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  audit_log_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.user_profiles(user_id) on delete restrict,
  action_code text not null,
  target_entity text not null,
  target_record_id text,
  occurred_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb
);

create table public.system_settings (
  setting_id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null,
  updated_by_user_id uuid references public.user_profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint system_settings_no_secret_keys check (
    setting_key !~* '(secret|password|api[_-]?key|token|credential)'
  )
);

-- ---------------------------------------------------------------------------
-- Foreign-key helper indexes and common query indexes
-- ---------------------------------------------------------------------------

create index user_profiles_role_status_idx on public.user_profiles(role_code, account_status);
create index user_permission_grants_granted_by_idx on public.user_permission_grants(granted_by_user_id);

create index visitors_normalized_phone_idx on public.visitors(normalized_phone)
  where normalized_phone is not null;
create index visitors_name_search_idx on public.visitors using gin (to_tsvector('simple', full_name));
create index visitors_lifecycle_engagement_idx on public.visitors(lifecycle_status, engagement_status);
create index visitors_integration_stage_idx on public.visitors(current_integration_stage_id);
create index visitors_created_at_idx on public.visitors(created_at desc);

create index visitor_visits_visitor_date_idx on public.visitor_visits(visitor_id, visit_date desc);
create index visitor_visits_service_date_idx on public.visitor_visits(service_type_id, visit_date desc);
create index visitor_consents_visitor_channel_purpose_idx
  on public.visitor_consents(visitor_id, channel, purpose, captured_at desc);

create index faith_commitment_events_visitor_idx
  on public.faith_commitment_events(visitor_id, occurred_at desc);
create index prayer_requests_visitor_status_idx
  on public.prayer_requests(visitor_id, request_status);
create index faith_commitment_access_user_idx
  on public.faith_commitment_access(user_id, commitment_event_id)
  where revoked_at is null;
create index faith_commitment_access_event_idx
  on public.faith_commitment_access(commitment_event_id)
  where revoked_at is null;
create index prayer_request_access_user_idx
  on public.prayer_request_access(user_id, prayer_request_id)
  where revoked_at is null;

create index assignments_primary_user_active_idx
  on public.assignments(primary_user_id, visitor_id)
  where assignment_status = 'ACTIVE' and ended_at is null;
create index assignment_collaborators_user_active_idx
  on public.assignment_collaborators(user_id, assignment_id)
  where collaborator_status = 'ACTIVE' and removed_at is null;
create index assignment_history_visitor_changed_idx
  on public.assignment_history(visitor_id, changed_at desc);

create index follow_up_workflows_status_idx on public.follow_up_workflows(workflow_status);
create index follow_up_workflow_steps_workflow_order_idx
  on public.follow_up_workflow_steps(workflow_id, step_order);
create index visitor_workflow_instances_visitor_idx
  on public.visitor_workflow_instances(visitor_id, started_at desc);

create index follow_up_tasks_assignee_status_due_idx
  on public.follow_up_tasks(assigned_user_id, task_status, due_at);
create index follow_up_tasks_visitor_due_idx on public.follow_up_tasks(visitor_id, due_at desc);
create index follow_up_tasks_assignment_idx on public.follow_up_tasks(assignment_id);
create index follow_up_tasks_workflow_instance_idx
  on public.follow_up_tasks(workflow_instance_id, workflow_step_id);
create index follow_up_task_history_task_changed_idx
  on public.follow_up_task_history(task_id, changed_at desc);
create index follow_up_records_visitor_occurred_idx
  on public.follow_up_records(visitor_id, occurred_at desc);
create index follow_up_records_task_idx on public.follow_up_records(task_id);
create index team_notes_visitor_created_idx on public.team_notes(visitor_id, created_at desc);
create index team_notes_author_idx on public.team_notes(author_user_id);

create index sms_messages_visitor_created_idx on public.sms_messages(visitor_id, created_at desc);
create index sms_messages_status_created_idx on public.sms_messages(submission_status, created_at desc);
create index sms_delivery_events_message_received_idx
  on public.sms_delivery_events(sms_message_id, received_at desc);

create index visitor_stage_history_visitor_changed_idx
  on public.visitor_stage_history(visitor_id, changed_at desc);
create index program_enrolments_visitor_idx on public.program_enrolments(visitor_id, enrolled_at desc);
create index program_enrolments_program_status_idx
  on public.program_enrolments(program_id, enrolment_status);
create index program_attendance_enrolment_session_idx
  on public.program_attendance(enrolment_id, session_date desc);

create index notifications_recipient_unread_idx
  on public.notifications(recipient_user_id, created_at desc)
  where read_at is null;
create index audit_logs_actor_occurred_idx on public.audit_logs(actor_user_id, occurred_at desc);
create index audit_logs_target_occurred_idx
  on public.audit_logs(target_entity, target_record_id, occurred_at desc);

-- Use generic updated_at handling without storing application secrets in settings.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function private.set_updated_at();
create trigger user_contact_details_set_updated_at
  before update on public.user_contact_details
  for each row execute function private.set_updated_at();
create trigger visitors_set_updated_at
  before update on public.visitors
  for each row execute function private.set_updated_at();
create trigger integration_stages_set_updated_at
  before update on public.integration_stages
  for each row execute function private.set_updated_at();
create trigger follow_up_workflows_set_updated_at
  before update on public.follow_up_workflows
  for each row execute function private.set_updated_at();
create trigger follow_up_tasks_set_updated_at
  before update on public.follow_up_tasks
  for each row execute function private.set_updated_at();
create trigger team_notes_set_updated_at
  before update on public.team_notes
  for each row execute function private.set_updated_at();
create trigger sms_templates_set_updated_at
  before update on public.sms_templates
  for each row execute function private.set_updated_at();
create trigger system_settings_set_updated_at
  before update on public.system_settings
  for each row execute function private.set_updated_at();

comment on schema private is
  'Unexposed helper functions used by ChurchConnect RLS policies and trusted triggers.';
comment on table public.visitors is
  'One canonical person record. Attendance and follow-up are stored as separate event rows.';
comment on table public.visitor_consents is
  'Append-only consent evidence; latest applicable state is evaluated at send time.';
comment on table public.assignments is
  'Time-bounded primary ownership. A partial unique index permits only one active primary assignment per visitor.';
comment on table public.follow_up_tasks is
  'Planned work; actual interaction attempts are stored separately in follow_up_records.';
comment on table public.sms_messages is
  'Outbound SMS content/recipient snapshots and provider submission state; inserts and provider updates are server-side only.';
comment on table public.audit_logs is
  'Audit trail containing action metadata, not raw sensitive note bodies or credentials.';
