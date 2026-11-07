# CMI Follow-up — Physical PostgreSQL Database Schema Proposal

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Status:** Engineering proposal for stakeholder and security review — **not approved SQL and not applied to Supabase**  
**Depends on:** [Logical Data Model](06_CMI_LOGICAL_DATA_MODEL_PROPOSAL.md), [Role/Capability Matrix](07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md), [Data Architecture](03_DATA_AND_DATABASE_ARCHITECTURE.md)

## 1. Purpose and non-goals

This document translates the approved-product direction and proposed logical model into a PostgreSQL-oriented physical design. It defines candidate schemas, tables, keys, constraints, indexes, row-level security (RLS), migration sequencing and operational safeguards.

It is not an executable migration. No database has been changed, no Supabase project has been selected or connected, and no production permissions are being granted. Names and types below are proposed conventions to validate against the final ERD and stakeholder decisions. The entity-by-entity crosswalk is maintained in [10 — ERD-to-Physical Schema Traceability](10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md). The first typed column-level slice is documented in [13 — Foundation, Contacts & Follow-up Data Dictionary](13_FOUNDATION_CONTACT_FOLLOWUP_DATA_DICTIONARY.md); its DD-01–DD-07 findings must be reconciled before migration drafting.

The design targets one church instance with a configured branch context. It does not introduce multi-church network administration. It supports the six operational roles, multi-role users, public visitor content and registration, staff workflows, limited offline queues, and manual/bulk/automated SMS. It does not imply full offline operation or WhatsApp automation.

## 2. PostgreSQL conventions

| Concern | Proposed convention |
|---|---|
| Database | Supabase-managed PostgreSQL, subject to project/version confirmation |
| Application schema | `public` for Data API-facing tables; internal-only helpers in a non-exposed schema such as `private` |
| IDs | `uuid`, generated with `gen_random_uuid()` |
| Case-insensitive email | Enable PostgreSQL `citext` explicitly if used; otherwise store a normalized lowercase email and enforce a unique index |
| Time | `timestamptz` stored in UTC; church timezone stored as an IANA name in settings |
| Dates | `date` for calendar dates; never encode local calendar dates as UTC timestamps |
| Money/budget | `numeric(12,2)` plus explicit currency code; avoid floating point |
| Phone | normalized E.164 value plus optional display form; do not assume all contacts have a phone |
| Status | constrained text or lookup FK; prefer constrained text for workflow states that change under governance |
| Audit | `created_at`, `updated_at`, actor IDs where meaningful; append-only event tables for critical history |
| Soft deletion | only where recovery/retention policy requires it; do not use soft-delete as a substitute for authorization |
| Branch | `branch_id` on operational records where branch ownership/scope applies; branch must belong to the single church instance |
| Referential integrity | explicit FK constraints; deliberate `ON DELETE` behaviour, generally RESTRICT for business history |
| Naming | singular snake_case table names; explicit FK column names |

Use a single configured church record and a branch table even if the initial deployment has one branch. The branch model enables scope boundaries without turning the product into a multi-church network. Do not accept arbitrary client-supplied branch IDs without server-side membership validation.

### 2.1 Proposed PostgreSQL schemas

- `public`: Data API-facing operational entities that need client access under RLS.
- `private`: authorization helper data and narrowly scoped internal routines not exposed through PostgREST.
- Supabase-managed `auth` and `storage`: managed services; do not duplicate credential tables.

RLS must be enabled on every table in an exposed schema. Revoke broad table/function privileges where not needed. A table being in `public` does not mean it should be readable by anonymous users.

## 3. Physical table inventory

The following is the proposed inventory. Exact columns and nullable rules must be reconciled with the ERD and approved field-level requirements before migration generation.

### 3.1 Church, branch and settings

| Table | Candidate columns and constraints |
|---|---|
| `church` | `id uuid PK`; `name text NOT NULL`; `timezone text NOT NULL`; `is_configured_instance boolean NOT NULL DEFAULT true CHECK (is_configured_instance)`; `created_at`, `updated_at`. Add a unique index on the constant configured-instance flag so a second church row cannot be inserted. |
| `branch` | `id uuid PK`; `church_id FK NOT NULL`; `name text NOT NULL`; `code text`; `is_active bool NOT NULL DEFAULT true`; unique `(church_id, code)` when code is present. |
| `church_setting` | `id uuid PK`; `church_id FK NOT NULL`; `setting_key text NOT NULL`; typed/config JSON value with strict server-side validation; unique `(church_id, setting_key)`. Never store provider secrets here. |

Church/branch configuration is administered by the privileged settings workflow. Branch deactivation must not erase historical records.

### 3.2 Identity, roles, capabilities and scope

Supabase Auth owns credential verification and sessions. The application stores a profile linked 1:1 to `auth.users.id`; it must not store plaintext PINs or duplicate password hashes.

| Table | Candidate columns and constraints |
|---|---|
| `staff_profile` | `user_id uuid PK` references `auth.users(id)`; `display_name text NOT NULL`; `email citext NOT NULL`; `phone_e164 text`; `is_active bool NOT NULL DEFAULT true`; timestamps. Unique normalized email. |
| `role` | `id uuid PK`; `code text UNIQUE NOT NULL`; `name text NOT NULL`; `is_system bool NOT NULL DEFAULT true`. Seed the six approved roles only. |
| `staff_role_assignment` | `id uuid PK`; `user_id FK`; `role_id FK`; `branch_id FK NULL` only if role scope is branch-bound; `valid_from timestamptz`; `valid_until timestamptz NULL`; `assigned_by uuid FK`; `revoked_at`; check valid interval. |
| `capability` | `id uuid PK`; `code text UNIQUE NOT NULL`; `description text NOT NULL`; `sensitivity text CHECK`. |
| `role_capability_grant` | `role_id FK`; `capability_id FK`; `grant_state text CHECK IN ('grant','conditional','deny')`; `approval_reference text NULL`; composite PK. Conditional entries are not effective grants until approved. |
| `staff_capability_override` | `id uuid PK`; `user_id FK`; `capability_id FK`; `effect text CHECK IN ('grant','deny')`; `scope_type`, `scope_id`; validity and approver. Overrides require governance approval and audit. |
| `team` | `id uuid PK`; `branch_id FK NOT NULL`; `name text NOT NULL`; `is_active bool`; timestamps; unique active team name per branch. |
| `team_membership` | `id uuid PK`; `team_id FK`; `user_id FK`; `membership_role text`; validity dates; `assigned_by`; unique active membership per team/user. |
| `service_area` | `id uuid PK`; `branch_id FK`; `name text NOT NULL`; `is_active bool`. |
| `staff_area_assignment` | `id uuid PK`; `area_id FK`; `user_id FK`; validity dates; unique active area/user pair. |
| `event_team_assignment` | `id uuid PK`; `event_id FK`; `team_id FK NULL`; `user_id FK NULL`; `event_role text`; `scope jsonb` only for non-sensitive, validated configuration; enforce exactly one of team/user where applicable. |

Role union determines candidate capabilities, but every operation also evaluates active status, branch, team/event/contact scope and restricted-record assignment. A broad role grant cannot bypass a sensitive-record assignment rule.

### 3.3 Contacts, capture, assignment and interaction

| Table | Candidate columns and constraints |
|---|---|
| `contact` | `id uuid PK`; `branch_id FK NOT NULL`; `first_name text NOT NULL`; `last_name text`; `phone_e164 text`; `phone_display text`; `email citext`; approved demographic/profile fields; `record_status text CHECK`; `created_by uuid FK`; timestamps; `merged_into_contact_id uuid FK NULL`. |
| `contact_capture` | `id uuid PK`; `contact_id FK`; `branch_id FK`; `capture_source text CHECK`; `captured_by uuid FK NULL`; `event_id uuid FK NULL`; `client_request_id uuid NOT NULL`; `captured_at timestamptz`; minimal source metadata. Unique `(branch_id, client_request_id)`. |
| `contact_assignment` | `id uuid PK`; `contact_id FK`; `assignee_user_id uuid FK NULL`; `team_id uuid FK NULL`; `assigned_by uuid FK`; `starts_at`; `ends_at NULL`; `reason`; ensure at least one assignee target and valid interval. |
| `contact_note` | `id uuid PK`; `contact_id FK`; `author_user_id FK`; `body text NOT NULL`; `visibility text CHECK`; timestamps. Ordinary notes only; pastoral/care narratives must use restricted tables. |
| `contact_interaction` | `id uuid PK`; `contact_id FK`; `actor_user_id FK`; `interaction_type text CHECK`; `occurred_at timestamptz`; `outcome_code text`; `summary text`; `next_action_at timestamptz NULL`; timestamps. |
| `contact_merge` | `id uuid PK`; `source_contact_id FK`; `surviving_contact_id FK`; `merged_by uuid FK`; `merged_at`; `reason`; `reversal_of uuid FK NULL`; unique active merge per source. |

Do not assume phone number alone is a unique person identifier. Duplicate detection should be advisory (normalized phone/email plus review); merge is an explicit privileged, transactional action. Preserve original capture provenance and re-link dependent rows with a merge audit record. Avoid destructive cascade deletion of contacts with history.

### 3.4 Follow-up

| Table | Candidate columns and constraints |
|---|---|
| `followup_list` | `id uuid PK`; `branch_id FK`; `title text NOT NULL`; `scope_type text`; `scope_id uuid NULL`; `created_by uuid FK`; `status text CHECK`; timestamps. |
| `followup_task` | `id uuid PK`; `list_id FK NULL`; `contact_id FK`; `branch_id FK`; `assignee_user_id uuid FK NULL`; `team_id uuid FK NULL`; `priority smallint CHECK BETWEEN 1 AND 5`; `due_at timestamptz NULL`; `status text CHECK`; `task_note text`; `created_by uuid FK`; timestamps; check at least one assignee scope. |
| `followup_task_event` | `id uuid PK`; `task_id FK`; `actor_user_id FK`; `event_type text`; `from_status text`; `to_status text`; `details jsonb` restricted to non-sensitive metadata; `created_at`. Append-only. |

Use explicit task state transitions in trusted server logic; do not let clients set arbitrary status values or rewrite task history.

### 3.5 Prayer and care — separate restricted domain

Prayer and care tables must not be joined into broad contact views or general search endpoints. Keep their policies stricter than ordinary contact RLS. Store only the minimum necessary contact linkage and expose a linked contact's name/phone to an intercessor only if that exact field access is approved.

| Table | Candidate columns and constraints |
|---|---|
| `prayer_request` | `id uuid PK`; `branch_id FK`; `contact_id FK NULL`; `created_by uuid FK`; `request_text text NOT NULL`; `status text CHECK`; `sensitivity text CHECK`; `expires_at timestamptz NULL`; timestamps. |
| `prayer_assignment` | `id uuid PK`; `prayer_request_id FK`; `intercessor_user_id uuid FK`; `assigned_by uuid FK`; `starts_at`; `ends_at NULL`; `revoked_at NULL`; index active assignments by request/user. |
| `prayer_access_audit` | `id uuid PK`; `prayer_request_id FK`; `actor_user_id FK`; `action text`; `accessed_at`; minimal metadata; never copy request text. |
| `care_group` | `id uuid PK`; `branch_id FK`; `name text NOT NULL`; `is_active bool`. |
| `care_group_membership` | `id uuid PK`; `care_group_id FK`; `contact_id FK`; `starts_at timestamptz`; `ends_at timestamptz NULL`; `created_by uuid FK`; timestamps; unique active membership per care-group/contact pair. |
| `care_record` | `id uuid PK`; `branch_id FK`; `contact_id FK`; `care_group_id FK NULL`; `status text CHECK`; `created_by uuid FK`; timestamps. |
| `care_assignment` | `id uuid PK`; `care_record_id FK`; `assignee_user_id uuid FK`; `assigned_by uuid FK`; validity/revocation fields. |
| `care_interaction` | `id uuid PK`; `care_record_id FK`; `actor_user_id FK`; `interaction_type text`; `outcome_code text`; `restricted_note text`; `occurred_at`; timestamps. |

Do not create a general-purpose `pastoral_note` table accessible through contact RLS. Prayer/care oversight by Admin/Pastor must be a distinct, explicit, audited capability; Coordinator workflow metadata access must not imply request-text access. Intercessors must see only currently assigned requests. An assignment end/revocation must take effect immediately for subsequent queries. PostgreSQL RLS does not automatically write an audit row when a SELECT policy permits a read. Therefore, if the requirement is to audit every narrative read, do not expose direct table SELECT for those narratives through PostgREST: route reads through a narrowly scoped server-side function/Edge Function that verifies the actor, writes the access audit event transactionally, and returns only approved fields. Test that no alternate query path bypasses this audited read path.

### 3.6 Events, registration, transport and attendance

| Table | Candidate columns and constraints |
|---|---|
| `event` | `id uuid PK`; `branch_id FK`; `title text NOT NULL`; `description`; `starts_at`, `ends_at`; `timezone`; `location`; `capacity integer CHECK > 0 NULL`; `registration_state text CHECK`; `visibility text CHECK`; `status text CHECK`; `transport_enabled bool`; `created_by FK`; timestamps; check ends after starts. |
| `event_registration` | `id uuid PK`; `event_id FK`; `contact_id FK NULL`; `attendee_name_snapshot text NOT NULL`; `attendee_phone_snapshot text NULL`; `attendee_email_snapshot citext NULL`; `registration_source text`; `consent_record_id uuid NULL`; `status text CHECK`; `registered_at`; `client_request_id uuid NULL`; unique idempotency key per event/source where supplied. Store only fields approved for public intake and retention. |
| `transport_option` | `id uuid PK`; `event_id FK`; `label text`; `capacity integer CHECK > 0 NULL`; `is_enabled bool`. |
| `transport_reservation` | `id uuid PK`; `registration_id FK`; `transport_option_id FK`; `pickup_area text NULL`; `seat_count integer CHECK > 0`; `status text CHECK`; `notes text NULL` with restricted staff access; timestamps; unique active reservation per registration/option. |
| `event_checkin` | `id uuid PK`; `event_id FK`; `registration_id FK NULL`; `contact_id FK NULL`; `attendee_name_snapshot text NULL`; `checked_in_at`; `recorded_by uuid FK`; `source text`; `client_request_id uuid NULL`; prevent duplicate active check-in for same attendee/event. Snapshot supports walk-in and offline check-in when no canonical contact/registration is available. |
| `event_closeout` | `id uuid PK`; `event_id FK UNIQUE`; `submitted_by uuid FK`; `submitted_at`; `reviewed_by uuid FK NULL`; `reviewed_at NULL`; `status text CHECK`; structured aggregate fields. |
| `event_closeout_event` | `id uuid PK`; `closeout_id FK`; `actor_user_id FK`; `action text`; `details jsonb`; `created_at`. Append-only. |

Public registration must execute through a narrow server endpoint/Edge Function that validates event publication, registration window, capacity, allowed fields, abuse limits and idempotency. Anonymous clients must not receive broad SELECT/INSERT grants on the staff contact table. Use a private intake path and only create/link a canonical contact after server-side validation and duplicate review.

Capacity enforcement must be transactional (for example, row locking or a safe counter/reservation strategy); a client-side count is not sufficient. Public registrations and attendance are distinct states.

### 3.7 Calendar, announcements and public content

| Table | Candidate columns and constraints |
|---|---|
| `calendar_entry` | `id uuid PK`; `branch_id FK`; `entry_type text CHECK`; `title`; `starts_at`, `ends_at`; `scope_type`, `scope_id`; `created_by FK`; timestamps. |
| `announcement` | `id uuid PK`; `branch_id FK`; `title`; `body`; `audience_type text CHECK`; `audience_ref uuid NULL`; `status text CHECK`; `publish_at`; `published_at`; `created_by FK`; timestamps. |
| `announcement_delivery` | `id uuid PK`; `announcement_id FK`; `channel text`; `recipient_ref`; `status text`; `attempted_at`; `provider_ref`; safe error code. |
| `church_public_profile` | `id uuid PK`; `church_id FK UNIQUE`; approved public contact/social links; `welcome_content`; `updated_by FK`; timestamps. |
| `welcome_message` | `id uuid PK`; `branch_id FK NULL` for church-wide messages; `title`; `body`; `display_order integer`; `status text CHECK`; `published_at`; `created_by FK`; timestamps. |
| `sermon` | `id uuid PK`; `branch_id FK NULL`; `title`; `body`; `published_at`; `status text CHECK`; `public_slug text UNIQUE`; `created_by FK`. |
| `daily_word` | `id uuid PK`; `title`; `body`; `publication_date date`; `status text CHECK`; `public_slug text UNIQUE`; `published_at`; `created_by FK`. |
| `digital_tract` | `id uuid PK`; `title`; `body`; `public_slug text UNIQUE`; `status text CHECK`; `published_at`; `created_by FK`. |
| `external_document_link` | `id uuid PK`; `content_type text`; `content_id uuid`; `label`; `url text NOT NULL`; `created_by FK`. Validate HTTPS and approved domains where policy requires. The application does not host PDFs. |

Public reads should use carefully scoped published-content policies or security-invoker views. A public slug is not authorization for draft/private content. If views are used on PostgreSQL 15+, specify `security_invoker = true`; otherwise place sensitive views in a non-exposed schema and revoke anonymous/authenticated access as appropriate.

### 3.8 SMS consent, campaigns, automation and delivery

SMS is a sensitive cost-bearing integration. Keep provider credentials in server-side secrets, never in table rows exposed through the Data API. Separate campaign planning, approval and dispatch. Re-evaluate eligibility immediately before each send.

| Table | Candidate columns and constraints |
|---|---|
| `communication_preference` | `id uuid PK`; `contact_id FK`; `channel text CHECK`; `consent_state text CHECK`; `lawful_basis text NULL`; `source text`; `captured_at`; `captured_by FK NULL`; `evidence_ref text NULL`; `withdrawn_at NULL`; `policy_version`. Avoid claiming consent where another basis is relied on. |
| `communication_suppression` | `id uuid PK`; `contact_id FK NULL`; `phone_e164 text NULL`; `channel text`; `reason text`; `source text`; `effective_at`; `lifted_at NULL`; ensure at least contact or phone is present. Opt-out suppression must override stale preferences. |
| `sms_template` | `id uuid PK`; `name`; `status text CHECK`; `owner_scope`; timestamps. |
| `sms_template_version` | `id uuid PK`; `template_id FK`; `version integer`; `body text NOT NULL`; `approved_by FK NULL`; `approved_at NULL`; unique `(template_id, version)`; immutable after approval. |
| `sms_campaign` | `id uuid PK`; `branch_id FK`; `name`; `send_mode text CHECK IN ('bulk')`; `audience_definition jsonb`; `status text CHECK`; `created_by FK`; `approved_by FK NULL`; `approved_at NULL`; `scheduled_at NULL`; `budget_limit numeric(12,2) NULL`; `currency char(3)`; timestamps. |
| `sms_campaign_recipient` | `id uuid PK`; `campaign_id FK`; `contact_id FK NULL`; `staff_user_id uuid FK NULL`; `phone_snapshot text`; `recipient_class text CHECK`; `eligibility_state text CHECK`; `exclusion_reason text NULL`; `evaluated_at`; `template_version_id FK`; enforce exactly one canonical recipient identity where the recipient class requires it; unique campaign/recipient identity. Restrict snapshot visibility. |
| `sms_automation_rule` | `id uuid PK`; `branch_id FK`; `name`; `trigger_code text`; `recipient_class text CHECK`; `template_version_id FK`; `is_enabled bool`; `quiet_hours jsonb`; `daily_cap integer`; `monthly_budget numeric(12,2)`; `configured_by FK`; `approved_by FK NULL`; timestamps. |
| `sms_automation_execution` | `id uuid PK`; `rule_id FK`; `trigger_event_id text`; `recipient_identity text`; `idempotency_key text UNIQUE`; `status text CHECK`; `evaluated_at`; unique trigger/recipient/rule. |
| `sms_outbox` | `id uuid PK`; `branch_id FK`; `send_mode text CHECK IN ('manual','bulk','automated')`; `contact_id uuid FK NULL`; `recipient_staff_user_id uuid FK NULL`; `recipient_phone_snapshot text`; `recipient_class text CHECK`; `manual_sender_user_id uuid FK NULL`; `campaign_id FK NULL`; `campaign_recipient_id FK NULL`; `automation_execution_id FK NULL`; `template_version_id FK NULL`; `message_body_encrypted or protected reference`; `idempotency_key text UNIQUE`; `provider_message_id text NULL`; `segment_count integer CHECK > 0 NULL`; `status text CHECK`; `queued_at`, `submitted_at NULL`, `delivered_at NULL`, `failed_at NULL`; `last_error_code text NULL`. Enforce mode-specific source/sender relationships. |
| `sms_delivery_event` | `id uuid PK`; `outbox_id FK`; `provider_event_id text`; `provider_status text`; `received_at`; `signature_verified bool`; `safe_payload jsonb`; unique provider/event ID where available. Append-only. |
| `sms_inbound_event` | `id uuid PK`; `provider_event_id text UNIQUE`; `from_phone_e164 text`; `to_sender_id text`; `received_at`; `keyword text NULL`; `signature_verified bool`; `processing_state text CHECK`; `suppression_id FK NULL`; minimal payload hash. Append-only. Used only if the selected provider supports inbound STOP/opt-out messages or equivalent callbacks. |
| `sms_dispatch_attempt` | `id uuid PK`; `outbox_id FK`; `attempt_number integer`; `started_at`; `finished_at`; `result_code`; unique `(outbox_id, attempt_number)`. |

The exact message-body storage approach (encrypted database column, server-side encrypted object, or short retention with restricted access) remains an explicit decision. If inbound opt-out keywords are supported by the chosen provider, verify callback signatures and create suppression records idempotently before any further queued dispatch. Do not place raw message bodies, full phone snapshots or provider payloads in general audit logs. Keep a minimum required record for cost reconciliation and delivery troubleshooting.

**Required dispatch invariants**
1. Recheck active sender, capability, branch/team/event scope and recipient eligibility at dispatch time.
2. Check latest consent/lawful-basis policy, opt-out ledger, suppression, recipient class, quiet hours and approved template version.
3. Apply daily/monthly/campaign budget caps and message/segment limits atomically.
4. Creator and approver separation should be enforced where policy requires; never allow an unapproved campaign to dispatch.
5. Every send has a unique idempotency key. Retries must not create duplicate provider submissions.
6. Provider callbacks are signature-verified, replay-resistant and deduplicated; callback status is not accepted as trusted merely because the endpoint is public.
7. Distinguish queued, submitted/accepted, delivered, failed and undeliverable. Submission is not delivery.
8. Opt-out applies before the next dispatch; no prayer details, confidential care narrative, credentials or authentication codes in message content.
9. Automation rules remain disabled until recipient class, lawful basis, timing, template, caps and approval are explicitly configured.
10. WhatsApp automation is not included.

### 3.9 Reports, audit and offline sync

| Table | Candidate columns and constraints |
|---|---|
| `ministry_report` | `id uuid PK`; `branch_id FK`; `report_type text CHECK IN ('daily_evangelism','event_evangelism','weekly_ministry')`; `period_start date`; `period_end date`; `author_user_id FK`; `scope_type`, `scope_id`; `status text CHECK`; structured counts; timestamps; check period start <= end. |
| `report_review_event` | `id uuid PK`; `report_id FK`; `reviewer_user_id FK`; `decision text CHECK`; `comment`; `created_at`. Append-only. |
| `audit_event` | `id uuid PK`; `actor_user_id uuid NULL`; `action_code text`; `target_type text`; `target_id uuid NULL`; `branch_id uuid NULL`; `occurred_at`; `request_id`; `safe_metadata jsonb`. Append-only; exclude secrets, prayer text, care narratives and unnecessary phone/message content. |
| `offline_sync_receipt` | `id uuid PK`; `user_id FK`; `device_key_id text`; `client_request_id uuid UNIQUE`; `payload_hash text`; `result_state text CHECK`; `server_record_id uuid NULL`; `received_at`; `expires_at`. Do not store full unsynced payload indefinitely. |

Offline support remains deliberately limited to queued field captures, cached picker data and previously opened event check-in data. Queue only approved minimal payloads. Do not queue prayer requests or care narratives. The server must re-authenticate, re-authorize and validate current field rules on sync; an old local permission snapshot is not authority. Define device encryption, sign-out recovery and expiry before release.

## 4. Constraints and indexes

Implement constraints as database invariants, not only form validation. For records with both `branch_id` and a parent record reference (for example task/contact, prayer/contact, care/contact, event/registration, team/membership), use composite unique keys and composite foreign keys where necessary to guarantee that parent and child belong to the same branch. RLS checks should not be the only defence against cross-branch relational inconsistencies. For active assignments/memberships, use partial unique indexes for the active-row convention or exclusion constraints if overlapping historical validity intervals must be prohibited; a normal unique key on `(user_id, team_id)` would incorrectly prevent valid history.

### 4.1 Required constraint families

- Unique normalized staff email; unique role/capability codes.
- Unique active team membership and staff role assignment within the defined validity interval.
- Valid time windows (`ends_at > starts_at`, `valid_until > valid_from`).
- Allowed status values and controlled transitions.
- Positive capacities, seat counts, SMS segment counts and retry numbers.
- Unique client idempotency keys for capture, registration, check-in, sync, automation execution and outbound messages.
- Mode-specific SMS source constraints: manual sends require a sender; bulk sends require campaign/recipient provenance; automated sends require an automation execution.
- Foreign keys for every business relationship; RESTRICT for important history; carefully chosen SET NULL only for optional actor references.
- Composite branch-consistency foreign keys where parent/child branch identity must match.
- Prevent unauthorized capability escalation through staff overrides; overrides must not grant a capability marked non-overridable or bypass a mandatory scope/sensitivity check.
- Unique active check-in per event/attendee; unique active transport reservation per registration/option.
- Prayer/care assignment validity and no public FK exposure to restricted narratives.
- No direct uniqueness constraint on contact phone as a person identity key.

### 4.2 Candidate indexes

| Table | Candidate index |
|---|---|
| `staff_role_assignment` | `(user_id, valid_from, valid_until)` partial for active assignments |
| `team_membership` | `(user_id, team_id)` and `(team_id, user_id)` partial active |
| `contact` | `(branch_id, lower(last_name), lower(first_name))`; partial normalized phone/email indexes for duplicate review |
| `contact_assignment` | `(assignee_user_id, starts_at DESC)`, `(team_id, starts_at DESC)`, partial active |
| `followup_task` | `(assignee_user_id, status, due_at)`, `(team_id, status, due_at)`, `(contact_id, created_at DESC)` |
| `prayer_assignment` | `(intercessor_user_id, prayer_request_id)` partial active; `(prayer_request_id, intercessor_user_id)` |
| `care_assignment` | `(assignee_user_id, care_record_id)` partial active |
| `event` | `(branch_id, starts_at)`; public active event partial index by visibility/status/date |
| `event_registration` | `(event_id, status, registered_at)`; unique idempotency key |
| `event_checkin` | `(event_id, checked_in_at)`; unique active attendee/event constraint |
| `announcement` | `(branch_id, publish_at)`; public published partial index |
| `sermon`, `daily_word`, `digital_tract` | unique slug; partial published index on publication date |
| `communication_suppression` | `(channel, phone_e164)` partial active; `(contact_id, channel)` partial active |
| `sms_outbox` | `(status, queued_at)` for worker polling; unique idempotency key; unique provider message ID where non-null |
| `sms_delivery_event` | unique provider/event ID; `(outbox_id, received_at)` |
| `sms_automation_execution` | unique idempotency key; `(rule_id, evaluated_at)` |
| `ministry_report` | `(branch_id, report_type, period_start, period_end)`; `(author_user_id, created_at DESC)` |
| `audit_event` | `(occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`, `(target_type, target_id, occurred_at DESC)` |

Validate index usefulness against real query plans after representative synthetic data is loaded. Avoid indexing every column; indexes add write cost and can expose sensitive search patterns.

## 5. RLS and authorization architecture

**Field-level access note:** PostgreSQL RLS is row-level, not column-level. Enforce contact-field restrictions through column grants, carefully designed views with invoker semantics, or server-side DTO/endpoints that return only approved fields. Do not rely on the UI to hide fields.

RLS is mandatory on every exposed application table. Policies must combine identity, active staff state, capability and record scope. `TO authenticated` alone is not authorization. Client-supplied role names, branch IDs, team IDs, metadata and user-editable JWT metadata must never grant access.

### 5.1 Trusted authorization inputs

- `auth.uid()` identifies the authenticated Supabase user.
- Active staff status is read from a protected staff profile record.
- Role/capability grants come from server-controlled tables; never trust `raw_user_meta_data`.
- Branch/team/event/contact scope is checked against current database relationships.
- Prayer/care access requires a separate active assignment or approved oversight capability.
- JWT app metadata may be a cache only if freshness and revocation behaviour are explicitly handled; database-backed checks remain authoritative for sensitive operations.

### 5.2 Policy pattern

Policies should be table- and action-specific. Conceptually:

- SELECT: authenticated user is active AND has the read capability AND record branch/team/event/contact scope matches AND sensitive assignment/oversight condition passes.
- INSERT: authenticated actor is active AND has create capability AND branch/scope is valid AND `created_by = auth.uid()` or is set by trusted server logic.
- UPDATE: `USING` checks current row visibility and `WITH CHECK` checks the resulting row remains in authorized scope; prevent reassignment/branch changes through direct client updates.
- DELETE: deny by default for business records; use controlled archival/retention workflows.
- Public SELECT: only explicitly published public content, preferably through narrowly scoped policies or security-invoker views.
- Public registration: no generic anonymous table policy; use a narrow server endpoint that validates and writes only permitted intake data.

### 5.3 Internal authorization helpers

Candidate helper functions belong in `private` and should normally be `SECURITY INVOKER`. Functions must have fixed search paths and minimal grants. Avoid `SECURITY DEFINER`: it bypasses RLS and can become a public API if exposed. If a future implementation demonstrates a compelling need, isolate it in a non-exposed schema, check `auth.uid()` inside the function, revoke default PUBLIC execute, grant only to the intended role, review SQL search path/ownership, and test with least-privileged roles. Confirm the helper can actually read its authorization tables under the chosen grants/RLS arrangement; do not silently change to definer rights merely to make a policy compile.

Use stable helper concepts such as:
- active staff identity;
- effective capability for action and branch;
- active team membership/leadership;
- event assignment;
- contact assignment or explicit sharing;
- active prayer assignment;
- active care assignment;
- privileged prayer/care oversight with audit.

Do not implement a single broad `is_admin()` bypass. A privileged Admin/Pastor capability must still be explicit and auditable for restricted pastoral records.

### 5.4 RLS test requirements

Use pgTAP or equivalent database tests with seeded synthetic users for all six roles and multi-role combinations. Tests must include:
- positive access for assigned records;
- negative access for unassigned/other-team/other-branch records;
- intercessor cannot read another intercessor's request;
- Coordinator workflow metadata does not expose prayer narrative by default;
- Admin/Pastor oversight requires explicit grant and creates an audit event;
- multi-role union does not bypass prayer/care assignment restrictions;
- UPDATE cannot move a row to another branch/team/contact scope;
- public clients cannot query contacts, staff, prayer, care, reports or draft content;
- anonymous event registration cannot enumerate contacts or exceed capacity;
- deactivated staff cannot reuse stale sessions for sensitive operations;
- opt-out and suppression block subsequent SMS dispatch;
- duplicate webhook/capture/registration/dispatch events are idempotently ignored.

## 6. Authentication and staff PIN implications

The product baseline is staff sign-in using **email plus PIN**, with the PIN treated as a private credential and never as a role or authorization claim. The database must not store plaintext PINs or duplicate credential hashes.

A safe provisioning pattern is:
1. Admin creates the staff identity and issues a one-time activation PIN/invitation.
2. On first activation, the staff member establishes a private PIN that the administrator cannot view or recover.
3. Subsequent sign-in uses email plus the private PIN through a server-validated authentication flow, if that is the approved product decision.
4. PIN reset/reissue uses a verified recovery process and invalidates previous credentials/sessions as appropriate.

The exact Supabase Auth integration for reusable PIN sign-in is a security design decision, not something to improvise by passing a short PIN directly as a password. Before implementation, threat-model PIN entropy, rate limits, progressive throttling/lockout, secure hashing/verification, session issuance, recovery, device sharing and credential stuffing. A custom verifier must run only in a trusted server environment and must not expose a user-enumeration oracle. Never put PINs in user metadata, logs or browser-readable tables, and never allow role changes through client-editable metadata.

If the product owner instead chooses one-time PIN activation followed by a different sign-in secret, that changes the stated email-plus-PIN login requirement and must be explicitly approved rather than silently substituted.

## 7. Mapping unresolved decisions R-01 to R-12

Do not turn conditional matrix entries into production grants until these decisions are approved.

| Decision | Physical-design impact | Safe default until approved |
|---|---|---|
| R-01 Admin/Pastor prayer/care oversight | Separate capability grants and access audit; possible break-glass workflow | No narrative access unless explicit oversight grant is assigned and audited |
| R-02 Coordinator prayer management | Separate workflow metadata from request-text access | Assignment/status metadata only; no narrative SELECT |
| R-03 Coordinator ordinary contacts | Branch/team/contact scope and field projection | Operational workspace with minimized fields; no pastoral fields |
| R-04 Team leader team administration | Team membership, reassignment and export capabilities | Own team only; no cross-team membership/export |
| R-05 Field worker/volunteer contact fields | Column-level projections or API DTOs; possibly split sensitive fields | Minimum fields required for assigned work |
| R-06 Individual SMS by field worker/volunteer | Conditional capability grant and dispatch scope | Disabled |
| R-07 Team leader campaign permissions | Campaign scope, approval and dispatch constraints | Team-scoped draft only; no approval; send only after explicit grant and approval |
| R-08 Creator/approver separation | Check/trigger and audit rules on campaign approval | Different active users for creator and approver |
| R-09 Coordinator automation configuration | Rule management capability, approval and limits | Disabled; Admin/Pastor-only configuration until approved |
| R-10 Care record access roles | Care assignments and separate oversight capability | Assigned care workers only plus explicit audited oversight |
| R-11 Intercessor contact identity visibility | Field projection/linked-contact access path | Prayer content only; reveal no contact phone unless approved |
| R-12 Report/contact exports | Export-specific capability, scope and audit event | Admin/Pastor only, minimized and audited |

Additional gates remain: PIN format/expiry/recovery, branch scope semantics, retention/deletion, offline encryption/recovery, SMS provider/sender identity, Ghana-specific legal/provider compliance, lawful basis/consent evidence, opt-out wording, quiet hours, budget limits, automated recipient classes, and public registration abuse controls.

## 8. Migration sequence (future, after approval)

No migration files should be generated from this proposal until the logical ERD, role matrix and decisions are approved.

1. **Foundation:** required extensions (including `citext` if retained), private schema; church/branch/settings; staff profile linkage; audit primitives.
2. **Authorization:** role/capability catalogue, grants, role assignments, team/area membership and tested helper functions.
3. **Contacts:** contacts, capture, assignments, notes, interactions, merge history and duplicate-review workflow.
4. **Follow-up:** lists, tasks and append-only task events.
5. **Restricted pastoral domains:** prayer/care tables, assignment lifecycle, oversight audit and negative RLS tests before any real data.
6. **Events:** events, public registration endpoint, transport, check-in and closeout.
7. **Public content/calendar:** publication workflows and anonymous read policies for approved published records only.
8. **SMS foundation:** preference/suppression, templates/versioning, campaign approval, outbox, automation execution, callback verification, budgets and dry-run tests; provider integration remains disabled until approved.
9. **Reports/offline:** reports, review events, minimal offline sync receipts and expiry controls.
10. **Hardening:** indexes/query plans, grants audit, RLS test matrix, backups/restore rehearsal, retention controls and staged deployment.

Each migration must be reviewed, versioned, reproducible in a clean local database and accompanied by tests. Use synthetic data. Run Supabase security advisors and test both authenticated and anonymous access. Do not apply schema changes to a hosted project without explicit project identification and user approval.

## 9. Cross-document validation

Use [09 — Database Design Validation Report](09_DATABASE_DESIGN_VALIDATION_REPORT.md) for identified design risks and their dispositions, [10 — ERD-to-Physical Schema Traceability](10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md) for the entity mapping and unresolved reconciliation items, and [11 — Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md) for D-01–D-13 and R-01–R-12 approvals. This proposal must match approved decisions before executable migrations are generated.

## 10. Review checklist and approval record

Before implementation sign-off, reviewers must approve:
- [ ] Logical ERD and relationship cardinalities.
- [ ] Physical table inventory, field-level contact requirements and retention.
- [ ] Role/capability matrix and R-01 to R-12.
- [ ] Branch ownership and scope rules.
- [ ] Prayer/care separation, intercessor field visibility and Admin/Pastor oversight.
- [ ] PIN/authentication flow and account recovery.
- [ ] Public registration privacy, capacity and abuse controls.
- [ ] SMS recipient classes, consent/lawful basis, opt-out, quiet hours, caps, provider and creator/approver separation.
- [ ] Offline encryption, expiry and sign-out recovery.
- [ ] RLS policy matrix and automated negative tests.
- [ ] Migration and rollback plan.

| Approval field | Record |
|---|---|
| Reviewer / stakeholder | Pending |
| Decision | Pending — proposal only |
| Date | Pending |
| Approved ERD revision | Pending |
| Approved role matrix revision | Pending |
| Approved decisions R-01–R-12 | Pending |
| Conditions / exceptions | Pending |

## 11. Verification status

This is a design artifact only. It has not been parsed or applied as SQL, tested against a PostgreSQL instance, checked with Supabase advisors, or validated against a running application. It makes no claim that repository code or a hosted database currently implements this design. The next gate is stakeholder approval and a traceable schema-to-ERD reconciliation; only then should executable migration drafts and RLS tests be created.
