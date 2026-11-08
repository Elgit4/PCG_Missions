# CMI Follow-up — Restricted Pastoral, Events & Public Content Data Dictionary

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Status:** Typed design proposal — not executable SQL and not applied to Supabase  
**Depends on:** [Physical Schema Proposal](08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md), [ERD Traceability](10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md), [Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md), [Foundation Data Dictionary](13_FOUNDATION_CONTACT_FOLLOWUP_DATA_DICTIONARY.md)

## 1. Scope and conventions

This slice specifies candidate PostgreSQL types, nullability, keys and core constraints for restricted prayer/care, event registration/transport/attendance, calendar/announcements and public visitor content. It complements document 13; shared conventions there apply here.

All IDs are UUIDs unless explicitly stated. Timestamps are `timestamptz` in UTC. Branch-owned tables carry `branch_id` and require composite branch-consistency keys/FKs. Use RESTRICT for business history. This document is a design proposal only.

## 2. Restricted prayer and care

These tables must have stricter policies than ordinary contact records. A permitted row read does not imply access to linked contact fields. If every narrative read must be audited, block direct client SELECT and use a trusted mediated read path that writes the audit event before returning approved fields.

### 2.1 `prayer_request`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Request ID |
| `branch_id` | uuid | No | FK → branch | Owning branch |
| `contact_id` | uuid | Yes | FK → contact | Optional linked contact; identity visibility separately controlled |
| `created_by` | uuid | Yes | FK → staff_profile | Staff creator; nullable only for approved public intake |
| `request_text` | text | No | — | Restricted narrative |
| `status` | text | No | DEFAULT 'open', CHECK | open, assigned, in_progress, answered, closed, expired |
| `sensitivity` | text | No | DEFAULT 'restricted', CHECK | restricted, highly_restricted |
| `expires_at` | timestamptz | Yes | — | Optional expiry |
| `answered_at` | timestamptz | Yes | — | Set only through valid status transition |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Composite FK `(contact_id, branch_id)` → contact `(id, branch_id)` when contact_id is not null. Index status/created_at and branch/status for authorized workflow queries. No general contact-directory join or search exposure.

### 2.2 `prayer_assignment`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Assignment ID |
| `prayer_request_id` | uuid | No | FK → prayer_request, RESTRICT | Request |
| `intercessor_user_id` | uuid | No | FK → staff_profile.user_id, RESTRICT | Assigned intercessor |
| `assigned_by` | uuid | No | FK → staff_profile.user_id, RESTRICT | Assigning actor |
| `starts_at` | timestamptz | No | DEFAULT now() | Assignment start |
| `ends_at` | timestamptz | Yes | — | Planned end |
| `revoked_at` | timestamptz | Yes | — | Immediate revocation |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

Check end after start and revocation not before start. Partial index active assignments by `(intercessor_user_id, prayer_request_id)` and reverse. Access requires active assignment at query time; expired/revoked assignment immediately removes subsequent access.

### 2.3 `prayer_access_audit`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Audit ID |
| `prayer_request_id` | uuid | No | FK → prayer_request, RESTRICT | Accessed request |
| `actor_user_id` | uuid | No | FK → staff_profile.user_id, RESTRICT | Actor |
| `action` | text | No | CHECK | read, update, assign, revoke, oversight |
| `reason` | text | Yes | — | Required for oversight/break-glass where policy says so |
| `request_id` | text | Yes | — | Correlation/request ID |
| `accessed_at` | timestamptz | No | DEFAULT now() | Access/action instant |
| `safe_metadata` | jsonb | No | DEFAULT '{}' | No narrative or secrets |

Append-only; no client update/delete. A permitted SELECT policy alone cannot write this row. Use a transactionally audited server endpoint for per-read auditing.

### 2.4 `care_group`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Group ID |
| `branch_id` | uuid | No | FK → branch | Owning branch |
| `name` | text | No | — | Group name |
| `description` | text | Yes | — | Non-sensitive directory description |
| `is_active` | boolean | No | DEFAULT true | Active group |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

UNIQUE `(id, branch_id)`; unique active normalized group name per branch.

### 2.5 `care_group_membership`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Membership ID |
| `care_group_id` | uuid | No | FK → care_group | Group |
| `contact_id` | uuid | No | FK → contact | Contact |
| `branch_id` | uuid | No | FK → branch | Must match both parents |
| `starts_at` | timestamptz | No | DEFAULT now() | Membership start |
| `ends_at` | timestamptz | Yes | — | Membership end |
| `created_by` | uuid | Yes | FK → staff_profile | Assigning actor |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

Composite FKs to care_group and contact by `(id, branch_id)`; valid interval; prevent duplicate active group/contact membership.

### 2.6 `care_record`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Care record ID |
| `branch_id` | uuid | No | FK → branch | Owning branch |
| `contact_id` | uuid | No | FK → contact | Subject contact |
| `care_group_id` | uuid | Yes | FK → care_group | Optional grouping |
| `status` | text | No | DEFAULT 'open', CHECK | open, active, monitoring, resolved, closed |
| `created_by` | uuid | No | FK → staff_profile | Creator |
| `reviewed_at` | timestamptz | Yes | — | Last review |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Composite FKs enforce contact/group branch equality. Care record existence and assignment must not grant broad contact access.

### 2.7 `care_assignment`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Assignment ID |
| `care_record_id` | uuid | No | FK → care_record, RESTRICT | Care record |
| `assignee_user_id` | uuid | No | FK → staff_profile.user_id, RESTRICT | Assigned care worker |
| `assigned_by` | uuid | No | FK → staff_profile.user_id, RESTRICT | Assigning actor |
| `starts_at` | timestamptz | No | DEFAULT now() | Start |
| `ends_at` | timestamptz | Yes | — | End |
| `revoked_at` | timestamptz | Yes | — | Revocation |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

Check validity; partial active index by assignee/record. Assignment is mandatory for ordinary care narrative access.

### 2.8 `care_interaction`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Interaction ID |
| `care_record_id` | uuid | No | FK → care_record, RESTRICT | Care record |
| `actor_user_id` | uuid | No | FK → staff_profile.user_id, RESTRICT | Actor |
| `interaction_type` | text | No | CHECK | call, visit, meeting, other |
| `outcome_code` | text | Yes | — | Approved outcome |
| `restricted_note` | text | Yes | — | Restricted narrative |
| `occurred_at` | timestamptz | No | DEFAULT now() | Interaction instant |
| `created_at` | timestamptz | No | DEFAULT now() | Record time |

No generic contact-note or report exposure. RLS and audited read path must be independently tested.

### 2.9 `care_access_audit` (required companion to prayer audit)

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Audit ID |
| `care_record_id` | uuid | No | FK → care_record, RESTRICT | Accessed care record |
| `branch_id` | uuid | No | FK → branch | Same branch as care record |
| `actor_user_id` | uuid | No | FK → staff_profile.user_id, RESTRICT | Actor |
| `action` | text | No | CHECK | read, update, assign, revoke, oversight |
| `reason` | text | Yes | — | Required for oversight/break-glass |
| `request_id` | text | Yes | — | Correlation/request ID |
| `accessed_at` | timestamptz | No | DEFAULT now() | Access/action instant |
| `safe_metadata` | jsonb | No | DEFAULT '{}' | No narrative or secrets |

Append-only, like prayer_access_audit. Direct client SELECT is denied. A trusted server-mediated care read writes this row in the same transaction before returning a minimal authorized projection. This table is a required schema addition because a prayer-specific audit row cannot safely identify and audit a care record read.

## 3. Events, registration, transport and attendance

### 3.1 `event`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Event ID |
| `branch_id` | uuid | No | FK → branch | Owning branch |
| `title` | text | No | — | Public/internal title |
| `description` | text | Yes | — | Approved description |
| `starts_at` | timestamptz | No | — | Start instant |
| `ends_at` | timestamptz | No | — | End instant; later than start |
| `timezone` | text | No | — | IANA timezone used for event display |
| `location` | text | Yes | — | Venue/location |
| `capacity` | integer | Yes | — | Positive attendee capacity; null means no fixed cap |
| `registration_state` | text | No | DEFAULT 'closed', CHECK | closed, open, waitlist_only (waitlist requires D-06 approval) |
| `visibility` | text | No | DEFAULT 'private', CHECK | public, staff, private |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, published, cancelled, completed |
| `transport_enabled` | boolean | No | DEFAULT false | Enable transport reservations |
| `created_by` | uuid | No | FK → staff_profile | Creator |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

UNIQUE `(id, branch_id)` for child branch FKs. CHECK ends_at > starts_at and capacity > 0 when not null. Capacity must be enforced transactionally, not by client-side count.

### 3.2 `event_registration`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Registration ID |
| `event_id` | uuid | No | FK → event, RESTRICT | Event |
| `branch_id` | uuid | No | FK → branch | Must match event branch |
| `contact_id` | uuid | Yes | FK → contact | Linked only by trusted server/review flow |
| `attendee_name_snapshot` | text | No | — | Name captured at registration |
| `attendee_phone_snapshot` | text | Yes | — | Optional E.164 phone snapshot |
| `attendee_email_snapshot` | text | Yes | — | Optional normalized email snapshot |
| `registration_source` | text | No | CHECK | public_site, staff, event_workspace |
| `consent_record_id` | uuid | Yes | — | Link to approved communication preference evidence if applicable |
| `status` | text | No | DEFAULT 'registered', CHECK | registered, cancelled, attended, no_show |
| `registered_at` | timestamptz | No | DEFAULT now() | Registration instant |
| `client_request_id` | uuid | Yes | — | Idempotency key from trusted endpoint |

Composite FK `(event_id, branch_id)` → event; contact branch match where linked. Unique idempotency scope (event, source, client_request_id) when request ID exists. Public registration endpoint validates exact allowed fields, event window, capacity, rate limits and replay/idempotency. Snapshot fields and retention require D-05 approval.

### 3.3 `transport_option`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Option ID |
| `event_id` | uuid | No | FK → event, RESTRICT | Event |
| `branch_id` | uuid | No | FK → branch | Same branch as event |
| `label` | text | No | — | Route/vehicle/pickup option label |
| `capacity` | integer | Yes | — | Positive seat capacity if capped |
| `is_enabled` | boolean | No | DEFAULT true | Reservation availability |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

Composite FK to event; CHECK capacity > 0 when not null.

### 3.4 `transport_reservation`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Reservation ID |
| `registration_id` | uuid | No | FK → event_registration, RESTRICT | Attendee registration |
| `transport_option_id` | uuid | No | FK → transport_option, RESTRICT | Selected option |
| `branch_id` | uuid | No | FK → branch | Must match registration and option |
| `pickup_area` | text | Yes | — | D-06 decision: free text vs controlled lookup |
| `seat_count` | integer | No | DEFAULT 1, CHECK > 0 | Number of seats |
| `status` | text | No | DEFAULT 'reserved', CHECK | reserved, cancelled, boarded, no_show |
| `notes` | text | Yes | — | Restricted staff operational note |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Enforce event/branch equality through composite keys. Prevent duplicate active reservation for the same registration/option. Seat capacity is transactional and must account for seat_count, cancellations and concurrent writes.

### 3.5 `event_checkin`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Check-in ID |
| `event_id` | uuid | No | FK → event, RESTRICT | Event |
| `branch_id` | uuid | No | FK → branch | Same branch |
| `registration_id` | uuid | Yes | FK → event_registration | Registered attendee |
| `contact_id` | uuid | Yes | FK → contact | Known walk-in/contact |
| `attendee_name_snapshot` | text | Yes | — | Required when neither registration nor contact is present |
| `checked_in_at` | timestamptz | No | DEFAULT now() | Check-in instant |
| `recorded_by` | uuid | No | FK → staff_profile | Staff actor |
| `source` | text | No | CHECK | staff, event_workspace, offline_sync |
| `client_request_id` | uuid | Yes | — | Idempotency key |

Require at least one of registration_id, contact_id or a non-empty attendee_name_snapshot. If registration_id is present, it must belong to event_id and branch_id. Prevent duplicate check-in for same attendee/event using a canonical attendee identity key or transactionally deduplicated operation ID; D-06/traceability item remains to approve the walk-in rule.

### 3.6 `event_closeout`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Closeout ID |
| `event_id` | uuid | No | UNIQUE, FK → event, RESTRICT | One current closeout per event |
| `branch_id` | uuid | No | FK → branch | Same branch |
| `submitted_by` | uuid | No | FK → staff_profile | Submitter |
| `submitted_at` | timestamptz | No | DEFAULT now() | Submission |
| `reviewed_by` | uuid | Yes | FK → staff_profile | Reviewer |
| `reviewed_at` | timestamptz | Yes | — | Review instant |
| `status` | text | No | DEFAULT 'submitted', CHECK | draft, submitted, approved, returned |
| `summary_counts` | jsonb | No | DEFAULT '{}' | Validated typed counts only |

Closeout counts require a defined report schema; do not accept arbitrary JSON keys. Review event history is append-only.

### 3.7 `event_closeout_event`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Event ID |
| `closeout_id` | uuid | No | FK → event_closeout, RESTRICT | Closeout |
| `actor_user_id` | uuid | No | FK → staff_profile | Actor |
| `action` | text | No | CHECK | submitted, approved, returned, reopened |
| `details` | jsonb | No | DEFAULT '{}' | Non-sensitive metadata |
| `created_at` | timestamptz | No | DEFAULT now() | Event instant |

Append-only; no client update/delete.

## 4. Calendar, announcements and public content

### 4.1 `calendar_entry`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Calendar entry |
| `branch_id` | uuid | No | FK → branch | Branch scope |
| `entry_type` | text | No | CHECK | service, event, followup, prayer_schedule, other |
| `title` | text | No | — | Entry title |
| `starts_at` | timestamptz | No | — | Start instant |
| `ends_at` | timestamptz | Yes | — | End, later than start if present |
| `scope_type` | text | No | CHECK | branch, team, event, own |
| `scope_id` | uuid | Yes | — | Scope target; polymorphic risk noted below |
| `created_by` | uuid | No | FK → staff_profile | Creator |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

**Design note:** scope_type/scope_id cannot enforce FK integrity across multiple target tables. Prefer typed nullable FK columns or separate scope-link tables before migration.

### 4.2 `announcement`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Announcement ID |
| `branch_id` | uuid | No | FK → branch | Branch |
| `title` | text | No | — | Title |
| `body` | text | No | — | Message body |
| `audience_type` | text | No | CHECK | public, branch, team, event, staff |
| `audience_ref` | uuid | Yes | — | Typed audience target; polymorphic risk |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, scheduled, published, archived |
| `publish_at` | timestamptz | Yes | — | Scheduled publication |
| `published_at` | timestamptz | Yes | — | Actual publication |
| `created_by` | uuid | No | FK → staff_profile | Creator |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Do not use an audience_ref alone as authorization. Replace polymorphic audience target with typed FK/scope link before migration. Public content must be explicitly published.

### 4.3 `announcement_delivery`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Delivery ID |
| `announcement_id` | uuid | No | FK → announcement, RESTRICT | Announcement |
| `channel` | text | No | CHECK | in_app, sms, email, other_approved |
| `recipient_ref` | text | No | — | Pseudonymous or typed recipient reference |
| `status` | text | No | CHECK | queued, submitted, delivered, failed |
| `attempted_at` | timestamptz | Yes | — | Attempt time |
| `provider_ref` | text | Yes | — | External delivery ID |
| `safe_error_code` | text | Yes | — | Sanitized error only |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |

Avoid duplicate SMS tracking logic: if announcement SMS uses the SMS provider, link to the SMS outbox/campaign rather than maintaining a separate competing delivery state.

### 4.4 `church_public_profile`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Profile ID |
| `church_id` | uuid | No | UNIQUE, FK → church, RESTRICT | One public profile |
| `public_name` | text | No | — | Public display name |
| `welcome_content` | text | Yes | — | Approved general welcome content |
| `public_phone` | text | Yes | — | Public contact number |
| `public_email` | text | Yes | — | Public contact email |
| `address_text` | text | Yes | — | Public address |
| `website_url` | text | Yes | — | HTTPS URL |
| `social_links` | jsonb | No | DEFAULT '{}' | Allowlisted public social URLs only |
| `updated_by` | uuid | Yes | FK → staff_profile | Editor |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Validate public URL schemes/domains and social_links structure. Never expose internal settings or private contact fields through this row.

### 4.5 `welcome_message`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Message ID |
| `branch_id` | uuid | Yes | FK → branch | Null for church-wide content |
| `title` | text | No | — | Heading |
| `body` | text | No | — | Public welcome text |
| `display_order` | integer | No | DEFAULT 0 | Non-negative sort order |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, published, archived |
| `published_at` | timestamptz | Yes | — | Publication instant |
| `created_by` | uuid | No | FK → staff_profile | Author |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Public projection returns published fields only.

### 4.6 `sermon`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Sermon ID |
| `branch_id` | uuid | Yes | FK → branch | Null for church-wide sermon |
| `title` | text | No | — | Title |
| `body` | text | No | — | Sermon content/summary |
| `public_slug` | text | No | UNIQUE | Stable URL slug |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, published, archived |
| `published_at` | timestamptz | Yes | — | Publication instant |
| `created_by` | uuid | No | FK → staff_profile | Author |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Published index on `published_at`; public read restricted to published rows.

### 4.7 `daily_word`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Daily word ID |
| `title` | text | No | — | Title |
| `body` | text | No | — | Content |
| `publication_date` | date | No | — | Church-local publication date |
| `public_slug` | text | No | UNIQUE | Stable URL slug |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, published, archived |
| `published_at` | timestamptz | Yes | — | Publication instant |
| `created_by` | uuid | No | FK → staff_profile | Author |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

Unique publication date only if church policy permits one daily word per day. Use the church timezone to interpret scheduling; do not convert publication_date to UTC date.

### 4.8 `digital_tract`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Tract ID |
| `title` | text | No | — | Title |
| `body` | text | Yes | — | HTML/markdown content subject to sanitization |
| `public_slug` | text | No | UNIQUE | Public slug |
| `status` | text | No | DEFAULT 'draft', CHECK | draft, published, archived |
| `published_at` | timestamptz | Yes | — | Publication instant |
| `created_by` | uuid | No | FK → staff_profile | Author |
| `created_at` | timestamptz | No | DEFAULT now() | Creation |
| `updated_at` | timestamptz | No | DEFAULT now() | Update |

No PDF binary storage is introduced. Existing public HTTPS PDFs may be linked through external_document_link.

### 4.9 `external_document_link`

| Column | Type | Null? | Key/default | Rule |
|---|---|---:|---|---|
| `id` | uuid | No | PK, generated | Link ID |
| `content_type` | `text` | No | CHECK | digital_tract, sermon, other approved content type |
| `content_id` | `uuid` | No | — | Parent content ID; polymorphic FK limitation |
| `label` | `text` | No | — | Link label |
| `url` | `text` | No | — | HTTPS only; allowlist as required |
| `created_by` | `uuid` | No | FK → staff_profile | Creator |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation |

**Design limitation:** content_type/content_id is polymorphic and cannot enforce a standard FK. Prefer separate typed nullable FKs (e.g. `digital_tract_id`, `sermon_id`) with exactly-one CHECK, or a shared content supertype table.

## 5. Reconciliation findings

| ID | Finding | Required decision/action |
|---|---|---|
| DD-08 | Prayer request creator may be public or staff; public intake workflow is not yet defined. | Define permitted capture channel and server-side identity/audit behaviour before migration. |
| DD-09 | Per-read prayer/care audit requires mediated reads; ordinary RLS SELECT would bypass audit insertion. | Use separate append-only `prayer_access_audit` and `care_access_audit` relations; deny direct REST/table reads and implement trusted transactional audited-read endpoints. |
| DD-10 | Event walk-in check-in identity and duplicate prevention need a canonical idempotency rule. | Decide whether name-only walk-in check-in is allowed and how duplicate detection works. |
| DD-11 | Event registration snapshots and linked contact fields depend on D-05 and retention decision D-13. | Approve exact fields, retention and canonical contact linking workflow. |
| DD-12 | Waitlist state appears as a possible event status but D-06 safe default says no waitlist until approved. | Remove waitlist_only until explicitly approved or record D-06 decision. |
| DD-13 | Calendar scope, announcement audience and external_document_link use polymorphic references. | Replace with typed FK/scope tables before executable schema. |
| DD-14 | Announcement SMS delivery duplicates SMS outbox tracking if treated as a separate provider lifecycle. | Make announcement delivery reference outbox/campaign, or restrict to non-SMS channels. |
| DD-15 | Event assignment currently has team/user target ambiguity (DD-02 in document 13). | Resolve once in the ERD and dictionary; do not implement inconsistent target semantics. |
| DD-16 | `care_record` and `prayer_request` link to contacts, but linked contact fields remain separately restricted. | Define exact intercessor/care-worker identity projection under R-10/R-11. |

## 6. Validation status

- [x] Typed field proposal created for restricted prayer/care, event, registration, transport, attendance, closeout and public content.
- [x] RLS and sensitive narrative audit requirements restated at the data level.
- [x] Dedicated care access-audit companion table added; prayer-specific audit rows are not overloaded for care records.
- [x] Branch-consistent relationship requirements identified.
- [x] Polymorphic FK and duplicate-delivery-state risks called out.
- [ ] Reconcile DD-08–DD-16 with ERD and physical schema, including the new care-access audit entity.
- [ ] Complete SMS/report/audit/offline data dictionary.
- [ ] Stakeholder approval of R-01–R-12 and D-01–D-13.
- [ ] Generate migrations only after schema sign-off.

No SQL has been executed, no local database was tested and no hosted Supabase project was changed.
