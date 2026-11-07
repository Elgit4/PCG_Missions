# ChurchConnect — Logical Database Design and ERD

**Version:** 1.1  
**Date:** 7 November 2026  
**Status:** Physical-schema-aligned logical design; draft for technical and stakeholder review  
**Repository:** `Elgit4/PCG_Missions`

## 1. Design objectives

The database is designed for one church and the requirements in the ChurchConnect SRS. The logical model must:

- maintain one canonical visitor profile with multiple attendance and follow-up events;
- preserve the complete history of assignments, contacts, consent changes and integration-stage changes;
- identify one primary Mission Member for each active visitor assignment while allowing supporting collaborators;
- separate planned follow-up tasks from interactions that have actually happened;
- distinguish SMS submission/delivery events from human contact or visitor response;
- enforce exactly two application roles and additional user-specific capability grants;
- isolate sensitive prayer and pastoral information from ordinary visitor notes;
- support scheduled workflow automation without generating duplicate tasks or messages.

The ERD uses Crow’s Foot relationships. The key symbols inside entity attributes are:

| Symbol | Meaning |
|---|---|
| ◆ | Primary key |
| ◇ | Foreign key |
| ◆◇ | Attribute is both a primary key and a foreign key |

No physical data types are shown in the ERD. The later physical schema will use PostgreSQL types and constraints.

## 2. Scope and modelling decisions

1. **One church:** no church/tenant foreign key is required in every table. A single church profile and its configuration belong to this deployment.
2. **Supabase identity:** Supabase-managed `auth.users` remains the credential source. ChurchConnect stores a matching application profile; it must not store passwords.
3. **Exactly two roles:** `roles` contains only `ADMIN` and `MISSION_MEMBER`. Additional duties are represented by individual permission grants, not additional roles.
4. **Visitor identity versus events:** `visitors` stores the person; `visitor_visits`, `follow_up_records`, consent events and stage history store repeated events.
5. **First-time visitors and new converts:** a first-time visit is an attendance event. A new faith commitment is recorded separately as a restricted commitment event; the two concepts are not interchangeable.
6. **Assignment history:** each primary assignment is a dated row. A handover ends the former row and creates a new active assignment; a separate history event records the transfer.
7. **Tasks versus interactions:** `follow_up_tasks` stores work planned. `follow_up_records` stores actual contact attempts and outcomes. A task can have no interaction yet or more than one recorded attempt.
8. **Workflow instances:** a visitor's enrolment in a configured follow-up sequence is stored separately from the sequence definition. Generated tasks reference both the instance and the applicable step.
9. **Consent history:** consent is event-based, so a person may grant, change or withdraw permission over time and by channel/purpose.
10. **Sensitive data:** prayer requests and faith-commitment records are separate from ordinary notes and require narrower access.
11. **Current and historical integration:** the visitor profile can reference the current integration stage, while stage-history rows preserve every transition.
12. **Statuses are distinct:** visitor lifecycle status, visitor engagement status, integration stage, task status and SMS delivery status must not be overloaded into one field.

## 3. ERD files

Open the editable diagram in diagrams.net (draw.io):

- [ChurchConnect Crow’s Foot ERD v1.0](database/ChurchConnect_ERD_v1.1.drawio)

The diagram has four pages: **Identity & Access**, **Visitor & Attendance**, **Assignments & Follow-up**, and **SMS & Integration**. The textual catalogue below is the authoritative logical attribute inventory for this version.

## 4. Logical entity catalogue

### 4.1 Identity and access control

#### `roles`
- ◆ `role_code` — text key restricted to `ADMIN` or `MISSION_MEMBER`
- `role_name`
- `description`
- `is_system_role`

#### `user_profiles`
- ◆◇ `user_id` — also references Supabase `auth.users.id`
- ◇ `role_code`
- `full_name`
- `account_status` — `INVITED`, `ACTIVE` or `INACTIVE`
- `last_active_at`
- `created_at`
- `updated_at`

#### `user_contact_details`
- ◆◇ `user_id` — profile reference
- `contact_email`
- `phone_number`
- `updated_at`

Team directory identity data is separated from private contact details. Active team members may read basic active-profile names and roles; contact email and phone are visible only to the account owner and Administrator.

#### `permission_catalog`
- ◆ `permission_code`
- `permission_name`
- `description`
- `is_sensitive`

#### `user_permission_grants`
- ◆ `grant_id`
- ◇ `user_id` — active Mission Member receiving the capability
- ◇ `permission_code`
- ◇ `granted_by_user_id` — active Administrator who granted it
- `grant_status`
- `granted_at`
- `revoked_at`
- `grant_reason`

**Access rules:** each application profile has exactly one role. A role can be assigned to many user profiles. Permission grants are explicit, attributable and revocable. The database must prevent Mission Members from granting permissions to themselves or others. An account's deactivation must immediately block normal access without deleting historical records.

### 4.2 Visitor and attendance domain

#### `visitors`
- ◆ `visitor_id`
- `full_name`
- `normalized_phone`
- `email_address`
- `residential_area`
- `referral_source`
- `visitor_type` — `VISITOR`, `NEW_CONVERT` or `OTHER`
- `lifecycle_status`
- `engagement_status`
- ◇ `current_integration_stage_id` — nullable until a stage is assigned
- `follow_up_required`
- ◇ `created_by_user_id`
- ◇ `updated_by_user_id`
- `created_at`
- `updated_at`
- `archived_at` — nullable

The first visit date and first service are derived from the earliest recorded `visitor_visits` row. A normalized phone is a matching signal, not a globally unique person key; family members may share a phone number.

#### `service_types`
- ◆ `service_type_id`
- `service_name`
- `service_category`
- `is_active`
- `display_order`

#### `visitor_visits`
- ◆ `visit_id`
- ◇ `visitor_id`
- ◇ `service_type_id`
- ◇ `recorded_by_user_id`
- `visit_date`
- `attendance_time`
- `attendance_notes`
- `created_at`

Each attendance entry represents one recorded visit or church activity. A returning attendance is added to the existing visitor profile, not entered as a new person.

#### `visitor_consents`
- ◆ `consent_id`
- ◇ `visitor_id`
- `channel` — for example SMS, phone or email
- `purpose` — visitor follow-up, programme updates, or another approved purpose
- `consent_status` — granted, withdrawn, declined or not recorded
- `captured_at`
- `capture_method`
- ◇ `captured_by_user_id`
- `withdrawn_at`
- `evidence_note`

Consent rows are historical events. Current eligibility is determined from the applicable latest consent and suppression rules, not by deleting earlier consent evidence.

#### `faith_commitment_events` (restricted)
- ◆ `commitment_event_id`
- ◇ `visitor_id`
- ◇ `recorded_by_user_id`
- `occurred_at`
- `commitment_type`
- `restricted_summary`
- `created_at`

#### `faith_commitment_access`
- ◆ `commitment_access_id`
- ◇ `commitment_event_id`
- ◇ `user_id`
- ◇ `granted_by_user_id`
- `granted_at`
- `revoked_at`

Each faith-commitment event requires a record-specific grant plus the `PASTORAL_VIEW` capability and visitor access. The creator receives a record-specific grant automatically; an Administrator grants access to additional users through a trusted server-side operation.

#### `prayer_requests` (restricted)
- ◆ `prayer_request_id`
- ◇ `visitor_id`
- ◇ `created_by_user_id`
- `request_text`
- `request_status`
- `submitted_at`
- `created_at`
- `closed_at`

#### `prayer_request_access`
- ◆ `prayer_access_id`
- ◇ `prayer_request_id`
- ◇ `user_id`
- ◇ `granted_by_user_id`
- `granted_at`
- `revoked_at`

Access to a prayer request is explicit and record-specific. RLS must also verify that the account is active and has the necessary sensitive-record capability.

### 4.3 Assignment and follow-up domain

#### `assignments`
- ◆ `assignment_id`
- ◇ `visitor_id`
- ◇ `primary_user_id` — the accountable Mission Member
- ◇ `assigned_by_user_id` — Administrator
- `assignment_status`
- `started_at`
- `ended_at`
- `assignment_reason`

A visitor can have many historical assignment rows, but no more than one active primary assignment at a time. This rule requires a database constraint/partial unique index in the physical schema.

#### `assignment_collaborators`
- ◆ `collaborator_id`
- ◇ `assignment_id`
- ◇ `user_id`
- ◇ `added_by_user_id`
- `added_at`
- `removed_at`
- `collaborator_status`

#### `assignment_history`
- ◆ `assignment_history_id`
- ◇ `visitor_id`
- ◇ `previous_assignment_id` — nullable for initial assignment
- ◇ `new_assignment_id`
- ◇ `actor_user_id`
- `change_type` — initial assignment, handover, reassignment or closure
- `change_reason`
- `changed_at`

Assignment rows preserve the time-bounded ownership. History rows explain the transition and who authorized it.

#### `follow_up_workflows`
- ◆ `workflow_id`
- `workflow_name`
- `description`
- `trigger_type`
- `workflow_status`
- ◇ `created_by_user_id`
- ◇ `approved_by_user_id`
- `created_at`
- `updated_at`

#### `follow_up_workflow_steps`
- ◆ `workflow_step_id`
- ◇ `workflow_id`
- ◇ `sms_template_id` — nullable for non-SMS steps
- `step_order`
- `day_offset`
- `time_of_day`
- `channel`
- `step_purpose`
- `is_active`

Each workflow step defines a planned action and its relative timing. A workflow may contain many ordered steps.

#### `visitor_workflow_instances`
- ◆ `workflow_instance_id`
- ◇ `visitor_id`
- ◇ `workflow_id`
- ◇ `assignment_id`
- `instance_status`
- `started_at`
- `paused_at`
- `completed_at`
- ◇ `started_by_user_id`

This represents one visitor's enrolment in a particular workflow. A visitor may have multiple historical instances, but the system should prevent duplicate active enrolments for the same workflow unless deliberately restarted under an audited action.

#### `follow_up_tasks`
- ◆ `task_id`
- ◇ `visitor_id`
- ◇ `assignment_id`
- ◇ `workflow_instance_id` — nullable for manually created tasks
- ◇ `workflow_step_id` — nullable for manually created tasks
- ◇ `assigned_user_id`
- ◇ `created_by_user_id`
- `task_title`
- `task_purpose`
- `channel`
- `due_at`
- `task_status`
- `completed_at`
- `cancelled_at`
- `cancellation_reason`
- `idempotency_key`
- `created_at`
- `updated_at`

Task statuses describe the planned work only: pending, due, in progress, completed, rescheduled, cancelled or overdue. Overdue may be derived from an open task's due time and current time; if persisted for reporting, it must be recalculated reliably.

#### `follow_up_task_history`
- ◆ `task_history_id`
- ◇ `task_id`
- ◇ `actor_user_id`
- ◇ `old_assigned_user_id`
- ◇ `new_assigned_user_id`
- `change_type`
- `old_due_at`
- `new_due_at`
- `old_status`
- `new_status`
- `change_reason`
- `changed_at`

This event history preserves rescheduling, status changes, cancellations, handovers and task transfers without overwriting earlier values.

#### `follow_up_records`
- ◆ `follow_up_record_id`
- ◇ `visitor_id`
- ◇ `task_id` — nullable for an interaction not attached to a planned task
- ◇ `assignment_id`
- ◇ `actor_user_id`
- `channel`
- `occurred_at`
- `contact_outcome`
- `visitor_response`
- `interaction_summary`
- `next_action`
- `next_follow_up_at`
- `created_at`

Each record represents an actual attempt or interaction. Keep outcomes that distinguish no answer, unreachable, message sent, human conversation, visitor response and do-not-contact.

#### `team_notes`
- ◆ `team_note_id`
- ◇ `visitor_id`
- ◇ `assignment_id`
- ◇ `author_user_id`
- `note_body`
- `visibility_scope`
- `created_at`
- `updated_at`
- `archived_at`

Internal team notes must never be confused with SMS content or visitor-facing correspondence. Do not store sensitive prayer/pastoral narratives here; use the restricted entities.

### 4.4 SMS and communications domain

#### `sms_templates`
- ◆ `sms_template_id`
- `template_name`
- `template_category`
- `message_body`
- `approval_status`
- `is_active`
- ◇ `created_by_user_id`
- ◇ `approved_by_user_id`
- `created_at`
- `approved_at`

#### `sms_messages`
- ◆ `sms_message_id`
- ◇ `visitor_id`
- ◇ `sms_template_id` — nullable for an approved free-text manual message
- ◇ `task_id` — nullable
- ◇ `follow_up_record_id` — nullable
- ◇ `initiated_by_user_id` — nullable for a system-triggered message
- `send_mode` — manual or automated
- `recipient_phone_snapshot`
- `message_body_snapshot`
- `provider_message_id`
- `idempotency_key`
- `submission_status`
- `estimated_cost`
- `queued_at`
- `submitted_at`
- `final_status_at`
- `failure_code`
- `failure_message`

A message row stores the exact recipient and content snapshot used at send time. Provider identifiers and idempotency keys must be unique where present. Never expose provider credentials to the browser.

#### `sms_delivery_events`
- ◆ `delivery_event_id`
- ◇ `sms_message_id`
- `provider_event_id`
- `provider_status`
- `normalized_status`
- `event_payload_redacted`
- `occurred_at`
- `received_at`

Delivery events are append-only. Webhook handling must validate provider authenticity and process duplicate callbacks idempotently. Delivered does not mean read, understood or answered.

### 4.5 Integration and operations domain

#### `integration_stages`
- ◆ `integration_stage_id`
- `stage_name`
- `stage_description`
- `stage_order`
- `completion_criteria`
- `is_active`

#### `visitor_stage_history`
- ◆ `stage_history_id`
- ◇ `visitor_id`
- ◇ `integration_stage_id`
- ◇ `changed_by_user_id`
- `changed_at`
- `change_reason`

The current stage is referenced from the visitor profile. History rows preserve each change and must be added transactionally with the current-stage update.

#### `integration_programs`
- ◆ `program_id`
- `program_name`
- `program_category`
- `description`
- `is_active`
- ◇ `created_by_user_id`

#### `program_enrolments`
- ◆ `enrolment_id`
- ◇ `visitor_id`
- ◇ `program_id`
- ◇ `enrolled_by_user_id`
- `enrolled_at`
- `enrolment_status`
- `completed_at`

#### `program_attendance`
- ◆ `program_attendance_id`
- ◇ `enrolment_id`
- ◇ `recorded_by_user_id`
- `session_date`
- `attendance_status`
- `attendance_note`
- `created_at`

A programme can have many enrolments. Each enrolment can have many session-attendance entries.

#### `notifications`
- ◆ `notification_id`
- ◇ `recipient_user_id`
- ◇ `related_visitor_id` — nullable
- ◇ `related_task_id` — nullable
- `notification_type`
- `title`
- `body`
- `read_at`
- `created_at`

#### `audit_logs`
- ◆ `audit_log_id`
- ◇ `actor_user_id` — nullable for a system event
- `action_code`
- `target_entity`
- `target_record_id`
- `occurred_at`
- `safe_metadata`

Audit metadata must not duplicate sensitive note bodies, passwords, tokens, provider credentials or unnecessary personal information. Target references are polymorphic and therefore are not represented as ordinary foreign keys.

#### `system_settings`
- ◆ `setting_id`
- `setting_key`
- `setting_value`
- ◇ `updated_by_user_id`
- `updated_at`

Settings include church time zone, workflow defaults, alert thresholds and SMS usage limits. Store secrets in server-side secret management, not in this table.

## 5. Relationship and cardinality catalogue

| Parent | Child | Cardinality | Meaning |
|---|---|---|---|
| Supabase `auth.users` | `user_profiles` | 1 to 0..1 | An auth identity may have one application profile; each profile belongs to one auth identity. |
| `roles` | `user_profiles` | 1 to 0..many | Each profile has exactly one role; a role may be assigned to many profiles. |
| `user_profiles` | `user_contact_details` | 1 to 0..1 | Each profile has at most one private contact-details row. |
| `user_profiles` | `user_permission_grants` | 1 to 0..many | A member may receive many capability grants. |
| `permission_catalog` | `user_permission_grants` | 1 to 0..many | A capability may be granted to many users. |
| `visitors` | `visitor_visits` | 1 to 0..many | One visitor can have many attendance records. |
| `service_types` | `visitor_visits` | 1 to 0..many | One service type may label many attendance events. |
| `visitors` | `visitor_consents` | 1 to 0..many | Consent changes are retained as events. |
| `visitors` | `faith_commitment_events` | 1 to 0..many | A visitor may have recorded commitment events where appropriate. |
| `faith_commitment_events` | `faith_commitment_access` | 1 to 0..many | Each restricted event may have specific user access grants. |
| `visitors` | `prayer_requests` | 1 to 0..many | A visitor may submit multiple prayer requests. |
| `prayer_requests` | `prayer_request_access` | 1 to 0..many | Each request may have access grants for selected users. |
| `visitors` | `assignments` | 1 to 0..many | Assignment rows form the visitor's assignment history. |
| `user_profiles` | `assignments` | 1 to 0..many | A Mission Member may own many active or historical assignments. |
| `assignments` | `assignment_collaborators` | 1 to 0..many | An assignment may have supporting collaborators. |
| `assignments` | `assignment_history` | 1 to 0..many | Assignment transitions are recorded in an event history. |
| `follow_up_workflows` | `follow_up_workflow_steps` | 1 to 1..many | A workflow contains ordered follow-up steps. |
| `visitors` | `visitor_workflow_instances` | 1 to 0..many | A visitor may enter multiple workflow instances over time. |
| `follow_up_workflows` | `visitor_workflow_instances` | 1 to 0..many | A workflow definition may be used by many visitors. |
| `visitor_workflow_instances` | `follow_up_tasks` | 1 to 0..many | An instance generates one or more scheduled tasks. |
| `follow_up_workflow_steps` | `follow_up_tasks` | 1 to 0..many | A workflow step may generate many visitor tasks. |
| `visitors` | `follow_up_tasks` | 1 to 0..many | A visitor can have many planned follow-up tasks. |
| `follow_up_tasks` | `follow_up_task_history` | 1 to 0..many | Task changes and transfers are retained as history events. |
| `follow_up_tasks` | `follow_up_records` | 1 to 0..many | A task may have multiple actual attempts or interaction records. |
| `visitors` | `follow_up_records` | 1 to 0..many | All contact history belongs to a visitor profile. |
| `visitors` | `team_notes` | 1 to 0..many | A visitor can have multiple internal notes. |
| `sms_templates` | `sms_messages` | 1 to 0..many | A template may be used to send many messages. |
| `visitors` | `sms_messages` | 1 to 0..many | Outbound messages are linked to their recipient profile. |
| `sms_messages` | `sms_delivery_events` | 1 to 0..many | Each message may receive multiple provider status events. |
| `visitors` | `visitor_stage_history` | 1 to 0..many | Integration-stage transitions are historical events. |
| `integration_stages` | `visitor_stage_history` | 1 to 0..many | A stage may be entered by many visitors. |
| `integration_programs` | `program_enrolments` | 1 to 0..many | A programme may enrol many visitors. |
| `visitors` | `program_enrolments` | 1 to 0..many | A visitor may enrol in multiple programmes. |
| `program_enrolments` | `program_attendance` | 1 to 0..many | An enrolment can have many attendance records. |
| `user_profiles` | `notifications` | 1 to 0..many | A user receives many notifications. |

For every relationship, the child-side foreign key is mandatory unless explicitly described as nullable. A parent can exist without children; the Crow’s Foot diagram shows that optionality.

## 6. Important database constraints

These constraints must be implemented in the physical PostgreSQL schema, not left to frontend validation.

1. **Exactly two roles:** seed only `ADMIN` and `MISSION_MEMBER`; enforce unique role codes and reject arbitrary role creation through normal app access.
2. **One active primary assignment:** add a partial unique index on `assignments(visitor_id)` for rows with active status and no end date.
3. **Active Mission Member references:** database triggers validate that primary assignees, collaborators and task assignees are active `MISSION_MEMBER` profiles; assignment/grant actors must be active Administrators.
4. **Collaborator uniqueness:** prevent duplicate active collaborator rows for the same assignment and user.
5. **Workflow step uniqueness:** `(workflow_id, step_order)` must be unique.
6. **Idempotent generation:** set unique idempotency keys for generated tasks and automated messages; retry logic must reuse the same key.
7. **Consent enforcement:** sending optional SMS must check the latest applicable consent and all opt-out/suppression states immediately before provider submission.
8. **Message integrity:** provider message IDs and idempotency keys must be unique when present; webhook callback identifiers must not be processed twice.
9. **Append-only history:** assignment history, SMS delivery events and audit records must not be silently overwritten by regular users.
10. **Visit duplication:** warn on probable duplicate visitor/service/date attendance; allow authorized correction after review rather than assuming a person can attend only once per date.
11. **Programme attendance:** prevent accidental duplicate attendance for the same enrolment/session while retaining legitimate multiple sessions.
12. **Status separation:** never reuse a visitor lifecycle field to store task, SMS or integration status.

## 7. Authorization and RLS design notes

RLS policies must be designed and tested table by table. Suggested access model:

- **Administrator:** broad operational access. Access to particularly sensitive pastoral records should still require the designated sensitive-record capability, rather than assuming every administrator needs to read every private narrative.
- **Mission Member:** visitor records where the member is the active primary assignee or a collaborator on the active assignment. A former owner retains only narrow visitor/task access while an explicitly retained open task remains assigned to them; that access ends when the task is completed or cancelled.
- **Registration duty:** a Mission Member with the `VISITOR_REGISTER` capability may create visitor records. This does not automatically grant access to every visitor record.
- **Attendance duty:** a Mission Member with the `ATTENDANCE_RECORD` capability may record the attendance they are authorized to manage.
- **SMS sending:** a Mission Member may send only to an assigned/shared visitor where a valid consent and suppression check passes. The operation runs through a trusted server-side function.
- **Prayer requests:** access requires a specific row in `prayer_request_access` and the `PASTORAL_VIEW` capability. The creator receives an initial record grant; additional access is Administrator-controlled.
- **Sensitive commitment events:** access requires `faith_commitment_access`, `PASTORAL_VIEW` and visitor access; do not expose details in notification previews or ordinary reports.
- **Audit logs and settings:** Mission Members must not read or modify system-wide security settings or administrative audit records.

Hiding controls in React is only a usability measure. Database RLS and trusted server-side checks must independently reject unauthorized reads and writes.

## 8. Transactional workflows

### 8.1 Initial assignment
1. Validate that the visitor exists and is eligible for follow-up.
2. Validate that the selected primary user is an active Mission Member.
3. Create the active assignment.
4. Create an assignment-history event.
5. Create a workflow instance if a workflow is active.
6. Generate the corresponding tasks with idempotency keys.
7. Create notifications for the assignee and Administrator as configured.

All steps that establish ownership and workflow generation should execute in a transaction or an idempotent server-side operation.

### 8.2 Handover
1. Lock or otherwise safely serialize the visitor's active assignment.
2. End the old assignment.
3. Create a new active assignment for the new primary owner.
4. Add an assignment-history event linking old and new rows.
5. Transfer or explicitly retain open tasks according to the Administrator's decision.
6. Preserve all completed interactions, notes and attendance.
7. Notify relevant users.

### 8.3 Follow-up task completion
1. Validate the user's access to the visitor, assignment and task.
2. Record the interaction in `follow_up_records`.
3. Mark or reschedule the planned task.
4. If required, create the next task with an idempotency key.
5. Update engagement indicators only from recorded evidence; do not infer a response from SMS delivery.

### 8.4 SMS submission and delivery
1. Check the active user/session and record-level authorization.
2. Re-check consent, opt-out, phone number and workflow eligibility.
3. Reserve/create the message using a unique idempotency key.
4. Submit via a server-side provider adapter.
5. Store provider response and external message ID.
6. Validate delivery webhooks and append status events.
7. Notify the responsible user about failure or final status where useful.
8. Never expose provider secrets or treat delivered as read/replied.

## 9. Recommended implementation order

1. Identity, roles, profiles and permission grants.
2. Visitor profiles, consent and attendance.
3. Primary assignments, collaborators and handover history.
4. Follow-up workflow definitions, instances, tasks and interaction records.
5. SMS templates, outgoing messages, delivery events and provider adapter.
6. Integration stages, programmes and attendance.
7. Restricted pastoral records, notifications, audit logs and reporting views.
8. RLS policies, security tests, indexes and backup/restore verification.

## 10. Decisions to carry forward

The schema can be designed now, but production values for workflow cadence, task escalation, SMS gateway, retention and integration-stage criteria remain stakeholder decisions. Track them in [STAKEHOLDER_DECISIONS.md](STAKEHOLDER_DECISIONS.md); do not hard-code assumed values into the database.
