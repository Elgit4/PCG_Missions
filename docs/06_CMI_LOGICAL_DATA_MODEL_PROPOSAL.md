# CMI Follow-up — Logical Data Model (Proposal)

**Version:** 0.1 | **Requirements baseline:** CMI Follow-up v2.1 | **Status:** Proposed for review  
**Branch:** `design/cmi-logical-data-model`  
**Purpose:** Define a normalized, security-aware logical model from which the CMI Crow's Foot ERD and, after approval, PostgreSQL migrations can be produced.

> This is a design artifact only. It has not been applied to Supabase or any database. Names and relationships are proposed and must be reconciled with the approved role/scope matrix and policy decisions before migrations are generated.

## 1. Modelling conventions

- Every primary entity uses a UUID primary key unless a provider/external identifier is explicitly required.
- `created_at` and `updated_at` are UTC timestamps where lifecycle tracking applies. Actor references use staff profile IDs where an authenticated staff actor exists.
- Foreign-key columns are named `<singular_entity>_id`; a field can be nullable only where the workflow genuinely allows an unlinked record.
- Use constrained status values (PostgreSQL enums or checked text) with documented transitions. Do not let arbitrary client strings define workflow state.
- Store phone numbers in normalized E.164 form and retain a display value only when necessary.
- Do not duplicate prayer/care narratives into general notes, logs, SMS, analytics or notification payloads.
- `branch_id` scopes records to the configured branch context. This is not a multi-church design; do not introduce a tenant/network administration layer.
- Supabase Auth owns credentials and sessions. The application schema stores a profile link, never a PIN or password.
- Public read access is limited to explicit published/public content and enabled public event-registration operations.

## 2. Entity inventory

### A. Church, identity and authorization

| Entity | Purpose | Key attributes (in addition to identifiers/audit timestamps) |
|---|---|---|
| `church_branches` | Configured branch context for the single church instance | name, code, timezone, active |
| `staff_profiles` | Staff-facing profile linked to Supabase Auth | auth_user_id (unique), full_name, email, phone_e164, active |
| `roles` | Six approved operational roles | code, name, description, active |
| `capabilities` | Atomic permissions used by API/RLS checks | code, description, sensitivity |
| `role_capabilities` | Explicit role-to-capability grants | role_id, capability_id, scope_mode |
| `staff_role_assignments` | Active and historical role assignments | staff_profile_id, role_id, branch_id, assigned_by, starts_at, ends_at, active |
| `teams` | Ministry teams | branch_id, name, description, active |
| `staff_team_memberships` | Staff membership and team leadership | staff_profile_id, team_id, membership_role, starts_at, ends_at, active |
| `service_areas` | Configured field/service areas | branch_id, name, code, active |
| `staff_area_coverage` | Staff-to-area coverage | staff_profile_id, service_area_id, starts_at, ends_at |
| `event_staff_assignments` | Event-specific staff role and access | event_id, staff_profile_id, event_role, scope_notes, active |

**Identity constraints**
- `staff_profiles.auth_user_id` is unique and references the Auth user UUID.
- One person may have multiple active role assignments. Effective capability union must still pass all record/team/event/assignment predicates.
- Team and area membership are many-to-many; do not store a single team or area directly on the staff profile.
- `role_capabilities` is the authoritative role grant table. Any administrator exception must be represented as an explicit capability/policy rule, not a hard-coded UI assumption.
- The six role codes are: `admin_pastor`, `coordinator`, `team_leader`, `field_worker`, `follow_up_volunteer`, `prayer_intercessor`.

### B. Contacts, capture and interaction history

| Entity | Purpose | Key attributes |
|---|---|---|
| `contacts` | Canonical person/contact record | branch_id, first_name, last_name, preferred_name, phone_e164, email, age_range, preferred_language, contact_status, created_by |
| `contact_captures` | Capture provenance and field intake | contact_id, captured_by, capture_source, event_id (nullable), service_area_id (nullable), client_capture_id, captured_at |
| `contact_notes` | Ordinary follow-up notes with explicit visibility | contact_id, author_id, note_body, visibility_scope, team_id (nullable) |
| `contact_assignments` | Current/historical ownership and follow-up responsibility | contact_id, staff_profile_id (nullable), team_id (nullable), assigned_by, starts_at, ends_at, active |
| `contact_interactions` | Calls, visits and actual contact attempts/outcomes | contact_id, actor_id, interaction_type, outcome, occurred_at, summary, next_action_at |
| `contact_merge_history` | Auditable contact merge/recovery record | source_contact_id, survivor_contact_id, merged_by, merged_at, reason, reversal_metadata |

**Contact rules**
- A contact may have multiple capture records, notes, assignments over time, interactions, event registrations, attendance records and follow-up tasks.
- `client_capture_id` is unique per originating device/user scope to make offline retries idempotent.
- Contact identity is distinct from event registration and attendance.
- A merge must transactionally re-point eligible foreign keys, preserve the source identity and history, and record before/after references. Do not hard-delete the source row during the initial merge operation.
- Notes marked sensitive must not use this ordinary notes table; prayer and care narratives belong in their restricted domains.

### C. Follow-up work management

| Entity | Purpose | Key attributes |
|---|---|---|
| `follow_up_lists` | Scoped collections of follow-up work | branch_id, title, description, created_by, team_id (nullable), status |
| `follow_up_tasks` | Actionable work item for a contact | list_id (nullable), contact_id, assigned_staff_id (nullable), assigned_team_id (nullable), created_by, due_at, priority, status, task_notes, completed_at |
| `follow_up_task_events` | Append-only task lifecycle history | task_id, actor_id, event_type, from_status, to_status, event_note, occurred_at |

**Follow-up rules**
- A task must reference one contact and have at least one valid assignment target or an explicitly approved unassigned state.
- Team assignment and individual assignment can coexist only if the business rule is approved; otherwise enforce exactly one assignment mode.
- Completion, reassignment, overdue resolution and reopening are recorded in task events.
- A task note is operational information, not a place for confidential pastoral narratives.

### D. Prayer and pastoral care (restricted domain)

| Entity | Purpose | Key attributes |
|---|---|---|
| `prayer_requests` | Private prayer request record | branch_id, contact_id (nullable), request_text, created_by, status, expires_at, answered_at, sensitivity |
| `prayer_assignments` | Current/historical intercessor assignment | prayer_request_id, intercessor_staff_id, assigned_by, starts_at, ends_at, active |
| `prayer_access_events` | Append-only audit of prayer narrative reads and privileged actions | prayer_request_id, actor_id, action, reason, occurred_at |
| `care_access_audit` | Append-only audit of care narrative reads and privileged actions | care_record_id, actor_id, action, reason, request_id, accessed_at |
| `care_groups` | Care grouping/directory category | branch_id, name, description, active |
| `care_group_memberships` | Contact membership in care groups | care_group_id, contact_id, starts_at, ends_at, active |
| `care_records` | Restricted care status and pastoral summary | contact_id, status, assigned_staff_id (nullable), created_by, reviewed_at |
| `care_interactions` | Restricted pastoral calls/visits and outcomes | care_record_id, actor_id, interaction_type, outcome, occurred_at, restricted_summary, next_action_at |

**Sensitive-data rules**
- Prayer request text and care summaries/interactions require separate RLS policies from ordinary contacts.
- Intercessors can read only requests currently assigned to them, plus explicitly permitted history needed to perform their task. Prayer and care each require a dedicated access-audit relation so every sensitive narrative read is attributable to the correct record type. They cannot discover unassigned or another intercessor's requests by list, search, export, direct ID or relationship traversal.
- Admin/Pastor oversight is a separately granted and audited capability; it must not be inferred solely from a role name.
- Avoid broad views, search indexes, notifications and exports that expose these narratives.
- Do not place prayer/care records in the general offline capture queue.

### E. Events, public registration, transport and attendance

| Entity | Purpose | Key attributes |
|---|---|---|
| `events` | Church event and event lifecycle | branch_id, title, description, starts_at, ends_at, venue, capacity (nullable), registration_enabled, public_visibility, transport_enabled, status, created_by |
| `event_registrations` | One visitor/attendee registration for an event | event_id, contact_id (nullable), attendee_name, phone_e164, email, registration_source, consent_recorded_at, status, registered_at, public_reference |
| `transport_reservations` | Optional transport request attached to registration | event_registration_id, pickup_area, seat_count, status, notes |
| `event_attendance` | Check-in/attendance fact | event_id, event_registration_id (nullable), contact_id (nullable), attendee_name_snapshot, checked_in_at, recorded_by, source, client_checkin_id |
| `event_closeouts` | Event operational closeout summary | event_id, submitted_by, attendance_total, follow_up_summary, notes, status, reviewed_by, reviewed_at |

**Event rules**
- Registration and attendance are different facts. A registration does not imply attendance.
- Public registration may create or link a contact only through a trusted server workflow with duplicate review safeguards; anonymous clients must not receive staff-directory access.
- Capacity checks must be concurrency-safe. Define whether capacity includes confirmed registrations only and how cancellations/waitlists behave before implementation.
- Transport reservation is optional and exists only for an event registration when transport is enabled.
- Event staff assignments are stored in `event_staff_assignments`; event-scoped permissions must not leak to other events.
- Offline check-in requires a stable `client_checkin_id`, bounded local data retention and server-side reauthorization at sync.

### F. Calendar and announcements

| Entity | Purpose | Key attributes |
|---|---|---|
| `calendar_entries` | Services and scheduled ministry activities | branch_id, entry_type, title, starts_at, ends_at, location, team_id (nullable), event_id (nullable), assigned_staff_id (nullable), created_by |
| `announcements` | Church/team/event announcement content | branch_id, title, body, audience_type, team_id (nullable), event_id (nullable), status, scheduled_at, published_at, created_by |
| `announcement_deliveries` | Per-channel announcement delivery state | announcement_id, channel, recipient_group_snapshot, status, attempted_at, completed_at, provider_reference |

Announcement audience membership and channel permissions must be re-evaluated when publishing/sending. An announcement record is not evidence that a message was delivered.

### G. SMS communications (manual, bulk and automated)

| Entity | Purpose | Key attributes |
|---|---|---|
| `contact_communication_preferences` | Channel preference and consent evidence | contact_id, channel, preference_status, lawful_basis_code, evidence_source, evidence_recorded_at, evidence_actor_id, updated_at |
| `sms_suppressions` | Opt-out/invalid/administrative suppression ledger | phone_e164, contact_id (nullable), suppression_type, source, effective_at, lifted_at, reason |
| `sms_templates` | Stable template identity | name, purpose, active |
| `sms_template_versions` | Immutable approved content versions | sms_template_id, version_number, body, approved_by, approved_at, status |
| `sms_campaigns` | Manual/bulk campaign metadata | branch_id, campaign_type, title, body_snapshot, audience_definition, created_by, approved_by, scheduled_at, status, estimated_recipients, estimated_segments, estimated_cost |
| `sms_campaign_recipients` | Immutable recipient/evaluation snapshot | sms_campaign_id, contact_id (nullable), staff_profile_id (nullable), phone_snapshot, recipient_class, eligibility_status, exclusion_reason, evaluated_at |
| `sms_automation_rules` | Configurable trigger and recipient policy | name, trigger_type, recipient_class, timing_rule, eligibility_definition, template_version_id, enabled, configured_by |
| `sms_automation_executions` | One idempotent trigger execution per event/recipient | automation_rule_id, trigger_event_key, recipient_key, contact_id (nullable), staff_profile_id (nullable), status, executed_at |
| `sms_outbox_messages` | One queued provider-bound message per recipient | branch_id, send_mode, campaign_recipient_id (nullable), automation_execution_id (nullable), contact_id (nullable), staff_profile_id (nullable), sent_by_staff_id (nullable), recipient_phone_snapshot, message_body, template_version_id (nullable), idempotency_key, provider_message_id, status, segment_count, queued_at, submitted_at, delivered_at, failed_at, failure_code |
| `sms_delivery_events` | Append-only provider delivery/status events | sms_outbox_message_id, provider_event_id, event_type, payload_hash, occurred_at, received_at |

**SMS rules**
- Manual individual sends create an outbox message without a campaign or automation execution and record `sent_by_staff_id`. Bulk messages link to a campaign recipient. Automated messages link to an automation execution. Enforce the matching `send_mode`/origin constraint; recipient identity may be a contact or staff profile according to the approved recipient class.
- A campaign's recipient snapshot is immutable evidence of who was considered and why each recipient was included/excluded. It is not permanent send authorization.
- Immediately before dispatch, recheck active sender permissions, current contact/team/event scope, current consent/lawful-basis policy, phone validity and suppression state.
- `idempotency_key` is unique. Automation execution is unique on (rule, trigger event key, recipient key); provider callbacks are unique by provider/event identifier where available.
- A template version is immutable after approval. Editing approved wording creates a new version and requires approval.
- Outbox lifecycle distinguishes queued, submitted, delivered, failed and undeliverable. Campaign lifecycle additionally supports scheduled, sending, partially sent, completed, paused, cancelled and failed.
- Webhook callbacks are signature-verified, replay-protected and stored as untrusted input after validation. Append delivery events; do not overwrite history.
- Suppression must take effect before the next dispatch. Opt-out handling and any legally required service-message exceptions require explicit policy/legal/provider approval.
- Never send prayer/care narrative, credentials or confidential pastoral details. Use neutral templates for approved pastoral workflows.
- Keep provider secrets outside the database rows accessible to clients; store them only in managed server-side secrets.

### H. Public visitor content

| Entity | Purpose | Key attributes |
|---|---|---|
| `church_public_profile` | Configured public church profile | branch_id, public_name, description, address, phone, email, whatsapp_url, social_links, welcome_text, published |
| `sermons` | Sermon content | branch_id, title, body, sermon_date, status, created_by, published_by, published_at |
| `daily_words` | Daily word/devotional content | branch_id, title, body, content_date, status, created_by, published_by, published_at |
| `welcome_messages` | Visitor-facing welcome content | branch_id, title, body, display_order, status, published_at |
| `digital_tracts` | Public digital tract content | branch_id, title, slug, body, external_pdf_url (nullable), status, created_by, published_at |

Public anonymous reads must filter by published/active state in database policies. External PDF URLs must be HTTPS and are references only; this application does not host PDF files.

### I. Reports, governance and offline sync

| Entity | Purpose | Key attributes |
|---|---|---|
| `ministry_reports` | Daily evangelism, event evangelism and weekly ministry reports | branch_id, report_type, event_id (nullable), period_start, period_end, author_id, team_id (nullable), payload, status, submitted_at, reviewed_by, reviewed_at |
| `report_review_events` | Report approval/return history | report_id, reviewer_id, decision, comments, occurred_at |
| `audit_events` | Security and privileged-action audit trail | actor_id (nullable), action, entity_type, entity_id, branch_id, occurred_at, safe_metadata |
| `offline_sync_receipts` | Server acknowledgements for queued client operations | client_operation_id, actor_id, operation_type, result_status, server_entity_id, received_at, error_code |

**Governance rules**
- Reports must distinguish capture, follow-up task completion, contact attempts, successful conversations, registrations and actual attendance.
- Report payloads must be validated against report type; sensitive prayer/care narratives are not report payloads.
- Audit metadata must be minimized and must not contain PINs, provider secrets, full prayer text or confidential care narratives.
- Offline sync receipts contain only the minimum acknowledgement needed to make retries safe. They are not a general offline data store.

## 3. Relationship and cardinality summary

The ERD uses these principal relationship patterns:

1. One branch has many staff role assignments, teams, service areas, contacts, events, calendar entries, announcements, reports and public-content records.
2. One Auth identity has zero or one staff profile; one staff profile can have many role assignments, team memberships, area-coverage rows, event assignments and audit events.
3. Roles and capabilities are many-to-many through `role_capabilities`; staff and roles are many-to-many through `staff_role_assignments`.
4. Teams and staff are many-to-many through `staff_team_memberships`; service areas and staff are many-to-many through `staff_area_coverage`.
5. One contact has many captures, notes, assignments, interactions, tasks, event registrations/attendance, communication preferences and (where applicable) prayer/care records.
6. One follow-up list has many tasks; each task has one contact and zero or one individual assignee/team assignee according to the approved assignment rule; each task has many lifecycle events.
7. One prayer request has many assignment-history rows and access events; each active assignment points to one intercessor staff profile.
8. One event has many registrations, attendance records, event staff assignments and closeout records; one registration may have zero or one transport reservation.
9. One announcement has many channel delivery records; one SMS campaign has many recipient snapshots; one recipient snapshot can produce at most one outbox message.
10. One automation rule has many executions; one execution can produce at most one outbox message; one outbox message has many delivery events. Manual messages reference the sending staff profile; bulk and automated messages retain their campaign/trigger origin.
11. One template has many immutable versions; an automation rule references one approved version.
12. One report has many review events; one actor may create/review many reports.
13. One queued client operation has at most one server receipt; the client operation identifier is unique within the authenticated actor/device scope.

## 4. Important candidate constraints and indexes

These are design candidates; confirm exact nullability and partial-index syntax during physical schema design.

- Unique `staff_profiles.auth_user_id`.
- Unique `roles.code` and `capabilities.code`.
- Unique `role_capabilities(role_id, capability_id)`.
- Unique active role assignment per staff/role/branch using a partial unique index.
- Unique active team membership per staff/team and active area coverage per staff/area using partial unique indexes.
- Unique `contact_captures(client_capture_id)` within the defined client/actor scope.
- Index contacts by branch, normalized phone and searchable name fields; phone uniqueness is not assumed until duplicate/household policy is approved.
- Index active contact assignments by staff/team and status.
- Index follow-up tasks by assignee/team, status and due date.
- Index prayer assignments by intercessor and active state; index prayer requests by status/expiry only within secure policy boundaries.
- Index event registrations by event/status and public reference; enforce capacity using a transaction/locking strategy rather than a simple count query.
- Unique event check-in idempotency key in the appropriate actor/device scope.
- Unique SMS idempotency key; unique provider callback identifier where supported. Check that each outbox row has exactly one valid send mode: manual sender, bulk campaign recipient, or automated execution.
- Unique automation execution on `(automation_rule_id, trigger_event_key, recipient_key)`.
- Index outbox by status/queued time and provider message ID; index delivery events by message/time.
- Unique template version number per template.
- Index public content by publication status/date/slug; unique tract slug.
- Index reports by branch/type/period/status and author/team.
- Unique offline receipt by actor plus client operation ID.

## 5. RLS and access-policy design notes

Do not write a blanket `auth.uid() = user_id` policy for every table. Authorization is a composition of:
- active authenticated staff profile;
- explicit capability grants from active role assignments;
- branch context;
- team membership/leadership;
- event assignment;
- contact assignment/sharing;
- prayer/care assignment and separately granted oversight;
- content publication state;
- current SMS consent/suppression and send-time checks.

Recommended implementation boundaries:
- Keep helper authorization functions in a non-exposed schema and prefer `SECURITY INVOKER`. If a narrowly scoped `SECURITY DEFINER` helper is unavoidable, document why, pin its search path, check `auth.uid()` internally, revoke default public execution and test it independently.
- Enable RLS on every exposed table. Revoke anonymous access to all staff/private tables.
- Public visitor reads should use carefully scoped published-content policies and public event data projections, not broad grants on base staff tables.
- Public registration should be a narrow server-side operation with input validation, abuse controls, capacity-safe writes and no ability to query the contact directory.
- Use Postgres 15+ security-invoker views where views are needed; do not assume a view automatically respects underlying RLS.
- Every UPDATE policy needs both `USING` and `WITH CHECK`; every table needs negative tests for cross-branch/team/event/assignment and sensitive-record access.
- SMS dispatch and webhook processing belong in trusted server-side code/Edge Functions. RLS does not replace provider-side signature verification, idempotency or send-time consent checks.

## 6. Decisions required before physical schema/migrations

| ID | Decision | Why it blocks a final schema |
|---|---|---|
| D-01 | Approve capability-by-role matrix and Admin/Pastor oversight exceptions; see [Role, Capability & Scope Matrix Proposal](07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md) | Determines grants, helper functions, RLS policies and test cases |
| D-02 | Confirm whether branch is a true operational boundary or one fixed configuration record | Determines branch FKs and whether branch-scoped policies are required |
| D-03 | Confirm contact identity/duplicate policy, household handling and phone uniqueness | Determines unique constraints and merge behaviour |
| D-04 | Decide whether a follow-up task can be assigned to both a staff member and a team | Determines task assignment nullability and check constraints |
| D-05 | Confirm public registration fields, anonymous-to-contact linking and duplicate review | Determines registration/contact relationship and trusted registration workflow |
| D-06 | Confirm capacity semantics, cancellation, waitlist and transport seat rules | Determines registration state machine and concurrency logic |
| D-07 | Approve prayer/care oversight, retention and deletion policy | Determines data separation, privileged access and archival model |
| D-08 | Approve offline device identity, local expiry, sign-out and conflict recovery | Determines client-operation keys and receipt retention |
| D-09 | Select SMS provider and approve consent, opt-out, quiet hours, sender ID, templates and service-message exceptions | Determines preference/suppression schema and dispatch policy |
| D-10 | Define automated SMS trigger catalogue and recipient class for each trigger | Determines automation rule constraints and recipient references |
| D-11 | Approve campaign creator/approver/sender separation, caps and spend limits | Determines campaign state machine and capabilities |
| D-12 | Confirm report payload fields and review authority | Determines typed report tables vs validated JSON payload |
| D-13 | Confirm retention periods for contacts, pastoral records, messages, delivery events and audit | Determines deletion/anonymization and archival constraints |

## 7. Validation and decision register

Cross-document validation findings are recorded in [09 — Database Design Validation Report](09_DATABASE_DESIGN_VALIDATION_REPORT.md). The ERD-to-physical entity mapping is maintained in [10 — ERD-to-Physical Schema Traceability](10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md), and stakeholder approvals for D-01–D-13 and R-01–R-12 are recorded in [11 — Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md). Do not treat recommended defaults as stakeholder approvals.

## 8. Recommended build sequence after approval

1. Freeze the role/capability/scope matrix and policy decisions D-01 through D-13.
2. Validate this logical model with the CMI guide and stakeholders; adjust entities/attributes/cardinalities.
3. Produce the reviewed Crow's Foot ERD from the approved model.
4. Convert this model into PostgreSQL physical design: schemas, enums, constraints, indexes, RLS and narrow server-side functions.
5. Generate migrations in a clean local Supabase project only after the physical design is approved.
6. Add positive and negative RLS tests, especially multi-role unions, cross-team/event boundaries and prayer/care isolation.
7. Build SMS provider sandbox pipeline only after D-09 through D-11 are approved.
8. Verify clean local reset, migrations, tests and staging before considering production deployment.

## 9. Explicit non-goals

This model does not add multi-church tenancy, WhatsApp automation, full offline operation, AI features, discipleship paths, retention/disengagement alerts, maps, testimonies/milestones or PDF hosting. It does not store credentials or provider secrets.
