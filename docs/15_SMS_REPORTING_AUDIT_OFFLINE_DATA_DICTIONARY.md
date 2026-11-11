# CMI Follow-up — SMS, Reporting, Audit & Offline Data Dictionary

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Status:** Typed design proposal — not executable SQL and not applied to Supabase  
**Depends on:** [Physical Schema Proposal](08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md), [Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md), [RLS Test Plan](12_RLS_POLICY_AND_SECURITY_TEST_PLAN.md), [Foundation Data Dictionary](13_FOUNDATION_CONTACT_FOLLOWUP_DATA_DICTIONARY.md)

## 1. Scope and conventions

This reference specifies candidate PostgreSQL types, nullability, keys and constraints for SMS, typed ministry reports and audit. Offline synchronization is a future extension only and is disabled for the initial release. All IDs are UUIDs unless specified. All timestamps are `timestamptz` UTC. Money uses `numeric(12,2)` and an explicit ISO currency code. Provider secrets remain in server-side secret storage, never in Data API tables.

SMS is cost-bearing and must be disabled until provider, sender identity, legal basis/consent handling, opt-out, quiet hours, templates, caps and approval are configured and tested.

## 2. SMS preferences, suppression and templates

### 2.1 `communication_preference`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Preference ID |
| `contact_id` | uuid | No | FK → contact, RESTRICT | Contact |
| `channel` | text | No | CHECK | sms, email, other_approved |
| `consent_state` | text | No | CHECK | granted, denied, withdrawn, unknown |
| `lawful_basis` | text | Yes | — | Approved basis code; do not infer consent |
| `source` | text | No | CHECK | form, staff_recorded, inbound_keyword, imported, other |
| `captured_at` | timestamptz | No | DEFAULT now() | Evidence capture time |
| `captured_by` | uuid | Yes | FK → staff_profile | Staff recorder |
| `evidence_ref` | text | Yes | — | Restricted evidence reference |
| `withdrawn_at` | timestamptz | Yes | — | Withdrawal instant |
| `policy_version` | text | No | — | Policy notice/version shown |
| `created_at` | timestamptz | No | DEFAULT now() | Record time |

Use append-only preference history; do not overwrite an earlier grant when withdrawal occurs. A current eligibility decision must consider the latest applicable preference and active suppression.

### 2.2 `communication_suppression`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Suppression ID |
| `contact_id` | uuid | Yes | FK → contact, RESTRICT | Optional contact |
| `phone_e164` | text | Yes | — | Phone-level suppression |
| `channel` | text | No | CHECK | sms, email, other_approved |
| `reason` | text | No | CHECK | opt_out, complaint, invalid_number, admin_block, legal_hold |
| `source` | text | No | — | staff, inbound_callback, provider, import |
| `effective_at` | timestamptz | No | DEFAULT now() | Effective instant |
| `lifted_at` | timestamptz | Yes | — | Only controlled authorized release |
| `created_by` | uuid | Yes | FK → staff_profile | Actor if staff initiated |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

CHECK at least one of contact_id/phone_e164 is present. Active phone/channel suppression must be checked at dispatch even if a stale campaign snapshot says eligible. Opt-out lifting requires explicit governance and audit.

### 2.3 `sms_template`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Template ID |
| `name` | text | No | — | Human label |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, active, archived |
| `owner_scope` | text | No | CHECK | church, branch, team, event |
| `branch_id` | uuid | Yes | FK → branch | Required for branch/team/event scope |
| `created_by` | uuid | No | FK → staff_profile | Creator |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

### 2.4 `sms_template_version`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Version ID |
| `template_id` | uuid | No | FK → sms_template, RESTRICT | Parent template |
| `version` | integer | No | — | Positive version number |
| `body` | text | No | — | Approved message body |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, approved, retired |
| `approved_by` | uuid | Yes | FK → staff_profile | Approver |
| `approved_at` | timestamptz | Yes | — | Approval instant |
| `created_by` | uuid | No | FK → staff_profile | Author |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

UNIQUE `(template_id, version)`; positive version; approved versions immutable. A dispatch must reference an approved version at send time.

## 3. SMS campaigns and automation

### 3.1 `sms_campaign`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Campaign ID |
| `branch_id` | uuid | No | FK → branch | Campaign scope |
| `name` | text | No | — | Campaign name |
| `send_mode` | text | No | CHECK | bulk only; manual and automated sends are outbox modes |
| `audience_definition` | jsonb | No | DEFAULT '{}' | Validated query/filter definition, never trusted as a final recipient list |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, awaiting_approval, approved, scheduled, dispatching, completed, paused, cancelled |
| `created_by` | uuid | No | FK → staff_profile | Creator |
| `approved_by` | uuid | Yes | FK → staff_profile | Separate approver |
| `approved_at` | timestamptz | Yes | — | Approval time |
| `scheduled_at` | timestamptz | Yes | — | Scheduled dispatch |
| `budget_limit` | numeric(12,2) | Yes | CHECK > 0 | Campaign spend ceiling |
| `currency` | char(3) | No | — | ISO currency code; confirm provider billing currency |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

CHECK creator != approver where approval exists, unless a separately approved emergency exception is implemented. Dispatch requires approved status, current scope and caps.

### 3.2 `sms_campaign_recipient`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Snapshot ID |
| `campaign_id` | uuid | No | FK → sms_campaign, RESTRICT | Campaign |
| `contact_id` | uuid | Yes | FK → contact | Canonical contact recipient |
| `staff_user_id` | uuid | Yes | FK → staff_profile.user_id | Staff recipient if approved |
| `phone_snapshot` | text | No | — | E.164 snapshot, tightly restricted |
| `recipient_class` | text | No | CHECK | contact, staff, visitor, other_approved |
| `eligibility_state` | text | No | CHECK | eligible, excluded, pending_recheck |
| `exclusion_reason` | text | Yes | — | Sanitized reason |
| `evaluated_at` | timestamptz | No | DEFAULT now() | Eligibility evaluation |
| `template_version_id` | uuid | No | FK → sms_template_version | Immutable content version |
| `created_at` | timestamptz | No | DEFAULT now() | Snapshot time |

Enforce exactly one canonical identity where recipient_class requires it; enforce phone snapshot format; unique campaign/identity. Do not expose snapshots to roles without dispatch/recipient-review permission.

### 3.3 `sms_automation_rule`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Rule ID |
| `branch_id` | uuid | No | FK → branch | Scope |
| `name` | text | No | — | Rule label |
| `trigger_code` | text | No | — | Approved trigger catalogue code |
| `recipient_class` | text | No | CHECK | contact, staff, visitor, other_approved |
| `template_version_id` | uuid | No | FK → sms_template_version | Approved template version |
| `is_enabled` | boolean | No | DEFAULT false | Kill-switch default OFF |
| `quiet_hours` | jsonb | No | DEFAULT '{}' | Validated local-time window and timezone |
| `daily_cap` | integer | No | CHECK > 0 | Per-rule daily limit |
| `monthly_budget` | numeric(12,2) | No | CHECK > 0 | Rule spend ceiling |
| `configured_by` | uuid | No | FK → staff_profile | Configurator |
| `approved_by` | uuid | Yes | FK → staff_profile | Separate approver where required |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Do not accept arbitrary SQL or arbitrary table names in trigger configuration. Quiet hours and budgets must be evaluated atomically in trusted dispatch logic.

### 3.4 `sms_automation_execution`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Execution ID |
| `rule_id` | uuid | No | FK → sms_automation_rule, RESTRICT | Rule |
| `trigger_event_id` | text | No | — | Stable source event identifier |
| `recipient_identity` | text | No | — | Pseudonymous recipient key |
| `idempotency_key` | text | No | UNIQUE | Stable rule/event/recipient key |
| `status` | text | No | CHECK | evaluated, queued, skipped, failed, completed |
| `evaluated_at` | timestamptz | No | DEFAULT now() | Evaluation instant |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

UNIQUE `(rule_id, trigger_event_id, recipient_identity)`; do not place sensitive recipient details in trigger metadata.

## 4. SMS outbox and provider lifecycle

### 4.1 `sms_outbox`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Outbox ID |
| `branch_id` | uuid | No | FK → branch | Dispatch scope |
| `send_mode` | text | No | CHECK | manual, bulk, automated |
| `contact_id` | uuid | Yes | FK → contact | Contact recipient if applicable |
| `recipient_staff_user_id` | uuid | Yes | FK → staff_profile.user_id | Staff recipient if applicable |
| `recipient_phone_snapshot` | text | No | — | E.164 dispatch snapshot |
| `recipient_class` | text | No | CHECK | contact, staff, visitor, other_approved |
| `manual_sender_user_id` | uuid | Yes | FK → staff_profile.user_id | Required for manual sends |
| `campaign_id` | uuid | Yes | FK → sms_campaign | Required for bulk sends |
| `campaign_recipient_id` | uuid | Yes | FK → sms_campaign_recipient | Required for bulk sends |
| `automation_execution_id` | uuid | Yes | FK → sms_automation_execution | Required for automated sends |
| `template_version_id` | uuid | Yes | FK → sms_template_version | Required for template-based sends |
| `message_body_ciphertext` | bytea | Yes | — | Encrypted body or protected reference; key external to DB |
| `message_body_ref` | text | Yes | — | Alternative protected reference |
| `idempotency_key` | text | No | UNIQUE | Prevent duplicate provider submission |
| `provider_message_id` | text | Yes | UNIQUE when present | Provider receipt ID |
| `segment_count` | integer | Yes | CHECK > 0 | Billing segment count |
| `status` | text | No | DEFAULT 'queued', CHECK | queued, submitting, submitted, delivered, failed, undeliverable, cancelled |
| `queued_at` | timestamptz | No | DEFAULT now() | Queue time |
| `submitted_at` | timestamptz | Yes | — | Provider accepted time |
| `delivered_at` | timestamptz | Yes | — | Delivery confirmation |
| `failed_at` | timestamptz | Yes | — | Failure time |
| `last_error_code` | text | Yes | — | Sanitized provider/error code |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

**Mode constraints:** exactly one source path is valid. Manual requires manual_sender_user_id and no campaign/automation source. Bulk requires campaign_id and campaign_recipient_id, no manual/automation source. Automated requires automation_execution_id, no manual/campaign source. Enforce identity consistency between outbox and source row. Require one of encrypted body or protected reference; never store plaintext body in client-readable tables. At dispatch, recheck active sender/capability, branch/team/event scope, recipient class, current preference/suppression, quiet hours, approved template and budget.

### 4.2 `sms_delivery_event`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Delivery event ID |
| `outbox_id` | uuid | No | FK → sms_outbox, RESTRICT | Outbox item |
| `provider_event_id` | text | No | — | Provider unique callback ID |
| `provider_status` | text | No | CHECK | accepted, delivered, failed, undeliverable |
| `received_at` | timestamptz | No | DEFAULT now() | Callback receipt |
| `signature_verified` | boolean | No | DEFAULT false | Must be true before trusted state change |
| `safe_payload` | jsonb | No | DEFAULT '{}' | Allowlisted non-sensitive callback fields only |

UNIQUE provider/event ID; append-only; callback endpoint verifies signature, replay protection and provider identity before state mutation.

### 4.3 `sms_inbound_event`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Inbound event ID |
| `provider_event_id` | text | No | UNIQUE | Provider event ID |
| `from_phone_e164` | text | No | — | Sender phone; restricted |
| `to_sender_id` | text | Yes | — | Church/provider sender identity |
| `received_at` | timestamptz | No | DEFAULT now() | Callback receipt |
| `keyword` | text | Yes | — | Normalized opt-out keyword only where possible |
| `signature_verified` | boolean | No | DEFAULT false | Trust flag |
| `processing_state` | text | No | CHECK | received, processed, ignored, failed |
| `suppression_id` | uuid | Yes | FK → communication_suppression | Resulting suppression |
| `payload_hash` | text | No | — | Replay/deduplication fingerprint |

Store only minimum inbound data needed to create suppression. Never persist unrestricted inbound message text unless a separately approved workflow requires it.

### 4.4 `sms_dispatch_attempt`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Attempt ID |
| `outbox_id` | uuid | No | FK → sms_outbox, RESTRICT | Outbox item |
| `attempt_number` | integer | No | CHECK > 0 | Monotonic attempt number |
| `started_at` | timestamptz | No | DEFAULT now() | Start |
| `finished_at` | timestamptz | Yes | — | Completion |
| `result_code` | text | Yes | — | Sanitized result |
| `provider_request_ref` | text | Yes | — | Non-secret provider correlation |
| `created_at` | timestamptz | No | DEFAULT now() | Record time |

UNIQUE `(outbox_id, attempt_number)`; no provider credentials or full message body in attempt logs.

## 5. Reports and audit (offline extension deferred)

### 5.1 `ministry_report`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Report ID |
| `branch_id` | uuid | No | FK → branch | Branch |
| `report_type` | text | No | CHECK | daily_evangelism, event_evangelism, weekly_ministry |
| `period_start` | date | No | — | Start date in church-local calendar |
| `period_end` | date | No | — | Same day for daily/event reports; seven-day inclusive range for weekly report |
| `author_user_id` | uuid | No | FK → staff_profile | Author |
| `team_id` | uuid | Yes | FK → team, RESTRICT | Optional typed team scope; must belong to branch |
| `event_id` | uuid | Yes | FK → event, RESTRICT | Required for event evangelism; must belong to branch |
| `contacts_captured` | integer | No | DEFAULT 0, CHECK >= 0 | Count of new contacts captured |
| `gospel_presentations` | integer | No | DEFAULT 0, CHECK >= 0 | Count of gospel presentations |
| `decisions_for_christ` | integer | No | DEFAULT 0, CHECK >= 0 | Count of recorded decisions; cannot exceed presentations |
| `followup_required` | integer | No | DEFAULT 0, CHECK >= 0 | Count of people needing follow-up |
| `followup_completed` | integer | No | DEFAULT 0, CHECK >= 0 | Count of follow-up activities completed |
| `visits_completed` | integer | No | DEFAULT 0, CHECK >= 0 | Count of completed visits |
| `calls_completed` | integer | No | DEFAULT 0, CHECK >= 0 | Count of completed calls |
| `events_supported` | integer | No | DEFAULT 0, CHECK >= 0 | Count of events supported |
| `attendance_count` | integer | No | DEFAULT 0, CHECK >= 0 | Attendance count for event evangelism |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, submitted, returned, approved |
| `submitted_at` | timestamptz | Yes | — | Submission |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Use typed checks: daily evangelism has a single-day period and no event; event evangelism has a single-day period and a same-branch event; weekly ministry spans exactly seven inclusive calendar days. Enforce `decisions_for_christ <= gospel_presentations`. No generic JSON payload or free-form pastoral narrative is accepted. Review scope is author-own, branch (Admin/Pastor and Coordinator) or active own-team (Team Leader). Field Worker and Follow-up Volunteer submit/read own reports only; Prayer Intercessor has no report access. This report schema and API are not yet implemented, so no report capabilities are granted.

### 5.2 `report_review_event`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Review event |
| `report_id` | uuid | No | FK → ministry_report, RESTRICT | Report |
| `reviewer_user_id` | uuid | No | FK → staff_profile | Reviewer |
| `decision` | text | No | CHECK | approved, returned, comment |
| `comment` | text | Yes | — | Operational review comment |
| `created_at` | timestamptz | No | DEFAULT now() | Review time |

Append-only. The selected reviewer default is Admin/Pastor and Coordinator at branch scope, Team Leader within active own-team scope; authors may view their own reports. Field Worker and Follow-up Volunteer may submit/read only their own reports. Prayer Intercessor has no report access. Implement and test these grants before enabling the report module.

### 5.3 `audit_event`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Audit event |
| `actor_user_id` | uuid | Yes | FK → staff_profile | Null only for verified public/system actor |
| `action_code` | text | No | — | Stable action code |
| `target_type` | text | No | — | Table/domain code |
| `target_id` | uuid | Yes | — | Target ID if applicable |
| `branch_id` | uuid | Yes | FK → branch | Branch context |
| `occurred_at` | timestamptz | No | DEFAULT now() | Event instant |
| `request_id` | text | Yes | — | Request correlation ID |
| `safe_metadata` | jsonb | No | DEFAULT '{}' | Allowlisted metadata only |

Append-only; deny UPDATE/DELETE to application roles. Never log PINs, provider secrets, raw message bodies, prayer/care narratives or unnecessary contact data. Restrict audit read capability and define retention/tamper protection.

### 5.4 `offline_sync_receipt`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Receipt ID |
| `user_id` | uuid | No | FK → staff_profile.user_id | Actor |
| `device_key_id` | text | No | — | Pseudonymous registered device key |
| `client_request_id` | uuid | No | UNIQUE | Client idempotency key |
| `payload_hash` | text | No | — | Hash to detect altered retry |
| `result_state` | text | No | CHECK | accepted, rejected, conflict, processed |
| `server_record_id` | uuid | Yes | — | Resulting server record |
| `received_at` | timestamptz | No | DEFAULT now() | Receipt time |
| `expires_at` | timestamptz | No | — | Receipt expiry |

Offline sync receipts are deferred and not created or used in the initial release. If offline mode is re-enabled after a new D-08 change, require encrypted device/session binding, short expiry, sign-out revocation, reauthorization at sync and conflict recovery. Never queue prayer/care narratives.

## 6. Critical invariants

1. No SMS dispatch until provider, sender identity, recipient classes, legal basis/consent, opt-out, quiet hours, template and budget policy are approved.
2. Manual, bulk and automated sends have mutually exclusive source relationships.
3. Every outbox item has a unique idempotency key; retries never create duplicate provider submissions.
4. Opt-out suppression is checked immediately before dispatch, not only at campaign creation.
5. Provider callback signature verification and deduplication precede delivery-state changes.
6. Campaign creator/approver separation is enforced according to R-08/D-11.
7. Automated rules default OFF and require an approved trigger/recipient allowlist.
8. Audit events are append-only and do not duplicate sensitive payloads.
9. Reports cannot become an alternate channel for pastoral narratives.
10. Offline mode is disabled for the initial release; no local data queue, cache or offline check-in is permitted.

## 7. Reconciliation findings

| ID | Finding | Required action |
|---|---|---|
| DD-17 | Campaign recipient identity supports contact or staff, but recipient_class rules vary. | Define allowed identity per recipient class and enforce exactly-one identity constraint. |
| DD-18 | Campaign/outbox body may be template-only or snapshot-based. | Approve whether campaign-specific body snapshots are allowed; otherwise require immutable approved template versions. |
| DD-19 | Message-body encryption/key management and retention are undecided. | Select encryption-at-rest/application strategy, key rotation and retention before storing real message bodies. |
| DD-20 | SMS pricing/billing currency and segment-cost accounting are provider-dependent. | Confirm provider currency, per-segment pricing, taxes and spend caps; no assumptions hard-coded. |
| DD-21 | Inbound STOP callback depends on provider support and local requirements. | Confirm provider webhook/keyword capabilities and callback signature scheme. |
| DD-22 | Ministry report fields and report scope are not fully defined. | Resolve D-12; replace generic JSON/scope polymorphism where possible. |
| DD-23 | Audit retention and access to audit logs remain open. | Resolve D-13 and audit governance before production. |
| DD-24 | Offline device key enrollment/revocation and expiry are open. | Resolve D-08; never treat device_key_id as proof of identity. |
| DD-25 | SMS campaign cost caps need a global church-wide ceiling as well as campaign/rule caps. | Define atomic budget ledger/reservation mechanism before dispatch implementation. |

## 8. Validation status

- [x] Typed data dictionary drafted for SMS preference, suppression, templates, campaign, automation, outbox and callback lifecycle.
- [x] Typed data dictionary drafted for reports and append-only audit; offline receipt design is deferred and not part of the initial release.
- [x] Manual/bulk/automated source constraints and idempotency requirements documented.
- [x] Cost, opt-out, callback and key-management risks recorded.
- [ ] Reconcile DD-17–DD-25 with provider choice, ERD and physical schema.
- [ ] Stakeholder approval of R-01–R-12 and D-01–D-13.
- [ ] Complete cross-document dictionary reconciliation.
- [ ] Generate executable migrations only after schema and security sign-off.

No SQL has been executed, no local database was tested and no hosted Supabase project was changed.
