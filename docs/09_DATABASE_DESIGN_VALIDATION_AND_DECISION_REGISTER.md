# CMI Follow-up — Database Design Validation & Decision Register

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Status:** Review worksheet — recommendations are not stakeholder approvals  
**Branch:** `design/cmi-logical-data-model`  
**Related documents:** [Logical Data Model](06_CMI_LOGICAL_DATA_MODEL_PROPOSAL.md) · [Role/Capability Matrix](07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md) · [Physical PostgreSQL Schema Proposal](08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md)

## 1. Purpose and decision discipline

This document is the Stage 4 validation gate between proposed logical/physical design and executable migrations. It consolidates two different decision lists that must remain distinct:

- **D-01–D-13** are cross-domain data-model and product-policy decisions in the logical model.
- **R-01–R-12** are role, capability, field-visibility and authorization decisions in the role matrix.

They overlap but are not interchangeable. D-01 explicitly depends on the role matrix; D-07, D-09, D-10 and D-11 also depend on several R decisions. A single R decision may affect multiple D decisions and multiple tables/policies.

**No stakeholder decisions are recorded as approved in this document.** The recommended defaults below are engineering recommendations to reduce risk while decisions are pending. They must not be represented as church policy or used to enable conditional production grants.

## 2. Decision status vocabulary

| Status | Meaning |
|---|---|
| Pending | No stakeholder decision recorded |
| Recommended | Engineering default proposed for review; not approved |
| Approved | Explicitly approved by an authorized stakeholder and recorded with date/evidence |
| Rejected | Explicitly rejected; record replacement rule |
| Deferred | Deliberately postponed; safe default remains in force |
| Superseded | Replaced by a newer, referenced decision |

For every approval, record the exact rule, scope, exception, approver, date, source (meeting/minutes/email), affected document revision, and required positive/negative test IDs. Silence, implementation convenience and an open pull request do not count as approval.

## 3. Cross-domain decision register — D-01 to D-13

| ID | Decision required | Recommended default pending approval | Main design impact | Status |
|---|---|---|---|---|
| D-01 | Approve role/capability matrix and Admin/Pastor oversight exceptions | Use the conservative grants in document 07; conditional grants stay disabled; sensitive access is assignment-bound or separately granted and audited | Role grants, capability helpers, RLS, field projections and tests | Pending |
| D-02 | Confirm branch as operational boundary or fixed configuration | Retain branch IDs on operational rows and enforce same-branch relationships; start with one configured branch; no multi-church tenancy | Foreign keys, composite branch consistency, RLS and UI context | Pending |
| D-03 | Confirm contact identity, duplicates, household handling and phone uniqueness | Phone/email are matching signals, not person keys; no unique phone constraint; staff-reviewed merge with immutable merge history; household is a separate future decision | Contact uniqueness, merge transaction, capture and registration linking | Pending |
| D-04 | Decide whether a task can be assigned to both a person and a team | Exactly one active assignment target per task unless a clear shared-responsibility workflow is approved | Task check constraints, assignment table shape, task visibility | Pending |
| D-05 | Confirm public registration fields, anonymous-to-contact linking and duplicate review | Collect minimum attendee details; keep registration separate from canonical contact; link/create through trusted server workflow after validation and duplicate review | Public intake, privacy, idempotency, contact merge/link workflow | Pending |
| D-06 | Confirm capacity, cancellation, waitlist and transport seat rules | Capacity applies to confirmed registrations; reserve atomically; cancellation releases capacity; no waitlist until its ordering/expiry rules are specified; transport seats have their own cap | Event state machine, locking/counters, reservation constraints | Pending |
| D-07 | Approve prayer/care oversight, retention and deletion | Separate prayer and care data; intercessors see current assignments only; no Coordinator narrative access by default; Admin/Pastor oversight is an explicit audited capability; retention remains configurable only after policy approval | Restricted schemas/tables, access path, audit, retention and deletion | Pending |
| D-08 | Approve offline device identity, local expiry, sign-out and conflict recovery | Only approved field capture and previously opened event check-in; no prayer/care queue; encrypt local data; expire on sign-out/TTL; reauthorize on sync; idempotent operation receipt | Device identity, client keys, sync receipts, conflict UX and retention | Pending |
| D-09 | Select SMS provider and approve consent, opt-out, quiet hours, sender ID, templates and service-message exceptions | Provider integration disabled; maintain auditable preference and suppression records; no send without documented lawful basis/consent policy, verified sender and approved templates; opt-out suppresses subsequent sends | Preference/suppression schema, inbound STOP path, provider callbacks and dispatch worker | Pending |
| D-10 | Define automation triggers and recipient class per trigger | Automation disabled by default; explicit allowlist of event triggers and recipient classes; one idempotent execution per rule/trigger/recipient | Automation rule validation, execution uniqueness, trigger handlers | Pending |
| D-11 | Approve campaign creator/approver/sender separation, caps and spend limits | Creator cannot approve own bulk campaign; Admin/Pastor or approved Coordinator approves; Team Leader may draft only within own scope; hard campaign/daily/monthly caps | Campaign state machine, capability grants, approval checks and atomic budget reservation | Pending |
| D-12 | Confirm report fields and review authority | Typed columns for known metrics; validated versioned JSON only for genuinely variable supplemental fields; separate author/reviewer and immutable review history | Report schema, validation, RLS and aggregation | Pending |
| D-13 | Confirm retention periods for contacts, pastoral records, messages, delivery events and audit | No automatic deletion until schedule approved; minimize collection now; retain immutable security/audit evidence only as policy requires; purge/redact message content separately from delivery/cost metadata | Retention jobs, legal holds, anonymization, audit and backup expiry | Pending |

### 3.1 Decision dependencies

- D-01 is the umbrella authorization decision and must be resolved with R-01 through R-12.
- D-07 depends especially on R-01, R-02, R-10 and R-11.
- D-09 depends on R-06, R-07, R-08 and R-12, as well as provider/legal/consent decisions.
- D-10 depends on R-09 and the explicit recipient-class/trigger catalogue.
- D-11 depends on R-06 through R-09 and R-12.
- D-12 depends on R-12 and the report review authority.
- D-03/D-05/D-06/D-08/D-13 are additional product/data decisions not fully covered by the role matrix.

## 4. Role and authorization decisions — R-01 to R-12

| ID | Decision question | Recommended safe default | Consequence if changed | Status |
|---|---|---|---|---|
| R-01 | Does Admin/Pastor have unrestricted prayer/care narrative access, or explicit oversight? | Explicit oversight capability, separately assigned, purpose/reason captured and access audited; no blanket role bypass | Determines oversight grant, audited read endpoint and exceptional-access workflow | Pending |
| R-02 | What does Coordinator prayer management mean? | Assignment/status/workflow metadata only; no request narrative read | Narrative access would require a separately approved capability and field-level test suite | Pending |
| R-03 | Can Coordinator access all ordinary contacts or only operationally shared contacts? | Operational workspace access with minimized fields; no pastoral fields; scope and purpose defined | Changes contact read policies and list/detail projections | Pending |
| R-04 | Can Team Leader create contacts, assign across teams, manage membership and export? | Own team and explicitly assigned event only; no cross-team reassignment, membership administration or export by default | Changes team administration, assignment and export capabilities | Pending |
| R-05 | Which fields can Field Worker/Follow-up Volunteer read/update? | Minimum work-required fields; phone access only where needed for assigned follow-up; no broad export | Requires approved field matrix and potentially separate read DTOs/views | Pending |
| R-06 | Can Field Worker/Follow-up Volunteer send individual SMS? | Disabled pending purpose, recipient eligibility, consent/lawful basis, cost cap and sender policy | Enables manual-send capability and scoped outbox creation | Pending |
| R-07 | Can Team Leader create/approve/send bulk campaigns? | Draft own-team/event campaigns only; approval by a different authorized user; no self-approval | Changes campaign create/approve/send capability and scope | Pending |
| R-08 | Must creator and approver differ? | Yes; no self-approval. If no second approver is available, campaign waits rather than bypassing separation | Determines approval constraints and exception governance | Pending |
| R-09 | Can Coordinator configure automated SMS? | No global provider/rule configuration by default; allow only approved trigger/template catalogue if later delegated; Admin/Pastor controls global enablement | Changes automation rule management, approval and kill-switch capabilities | Pending |
| R-10 | Which roles read/update care records? | Assigned care workers only; explicit audited Admin/Pastor oversight; no general contact access inheritance | Determines care assignment RLS and restricted interaction access | Pending |
| R-11 | Can Intercessor create requests and see linked contact identity? | Allow creation of a request; expose only request fields needed; linked name/phone hidden unless an approved use case requires them | Determines request intake and safe contact identity projection | Pending |
| R-12 | Which roles export contacts/reports and what masking applies? | Admin/Pastor only by default; scoped reports only after explicit grant; no unrestricted contact export | Determines export capability, field masking, audit and rate limits | Pending |

## 5. Cross-document consistency validation

The following are the validation rules to apply when the logical model, ERD, role matrix and physical schema are reconciled. These are not proof of a running implementation.

| Area | Validation finding / required reconciliation | Required resolution before migrations |
|---|---|---|
| Naming | Logical model uses plural names (for example `contacts`, `prayer_requests`); physical proposal uses singular names (for example `contact`, `prayer_request`) | Select one canonical naming convention and publish a traceable logical-to-physical mapping |
| Staff identity | Logical model calls the linked profile `staff_profiles` with `auth_user_id`; physical proposal uses `staff_profile.user_id` | Standardize one FK name and ensure it references `auth.users(id)`; do not create a second credential store |
| Branch identity | Logical model has `church_branches`; physical proposal has `church` and `branch` | Confirm one-church/one-or-more-branch model and whether a church table is required for a single configured instance |
| Role scope | Logical `role_capabilities.scope_mode` differs from physical role grant plus staff override tables | Define one source of truth for capability grants, conditional state, scope constraints and deny precedence; disallow user-level override from bypassing mandatory sensitive checks |
| Team/event assignments | Logical model uses event staff assignments; physical model introduces event team/user assignment and a generic scope JSON | Prefer normalized assignment rows with explicit FKs; do not use JSON as authorization source |
| Contact notes | Logical notes include visibility/team scope; physical notes list a visibility field but no full team-sharing semantics | Define allowed visibility levels and ensure sensitive pastoral content cannot enter ordinary notes |
| Task assignment | Logical model permits a staff and/or team target subject to decision D-04; physical model checks at least one target | Resolve D-04 and enforce exact-one or explicitly approved shared-assignment semantics consistently |
| Prayer audit | Logical model has access events; physical proposal initially suggests audit table | RLS SELECT policies do not themselves write audit records; if every narrative read must be audited, use a narrow audited read path and block direct narrative SELECT |
| Care ownership | Logical care record has an assigned staff field; physical proposal separates care assignments | Keep assignment history in a separate table and derive current assignment from active rows |
| Event registration | Logical registration supports contact linkage and snapshots; physical model has snapshot and contact link | Define canonical public intake fields, consent evidence, idempotency key scope and when contact linking occurs |
| Capacity/transport | Logical transport reservation is tied to registration and pickup area; physical model introduces transport options | Confirm pickup-area/route model and independent transport capacity; do not assume a single generic option matches actual transport operations |
| SMS recipients | Logical model explicitly supports contact and staff recipients; physical proposal campaign recipient table initially models contact and later staff identity | Standardize recipient identity with explicit contact/staff FKs and a CHECK ensuring exactly one permitted identity for recipient class |
| SMS body storage | Physical proposal leaves encryption/protected-reference choice open | Choose encryption/key ownership, retention, access logging and redaction before storing real message content |
| SMS inbound opt-out | Logical SMS suppression exists; physical schema should support provider inbound events if STOP processing is required | Confirm provider capability and opt-out flow; create suppression idempotently before subsequent queued dispatch |
| Reports | Logical model allows validated payload; physical proposal suggests structured counts | Define report types/field dictionary and versioning; avoid unvalidated free-form JSON as the only report schema |
| Offline sync | Logical operation key is actor/device scoped; physical receipt proposal has unique client request ID | Use a composite uniqueness key such as actor + device + client operation; bind payload hash, operation type and replay policy |
| Audit | Logical audit metadata is safe/minimal; physical schema needs immutable actor/action/target history | Define tamper resistance, access to audit records, retention and append-only permissions |
| Public content | Logical model includes welcome messages and branch-level content; physical proposal must retain all approved public content types | Reconcile church-wide vs branch-specific publication scope and public-only projections |
| Naming consistency | Logical and physical documents have differing singular/plural and field names | Create a final mapping appendix before writing migrations or ERD changes |

### 5.1 High-priority technical corrections

1. **Prayer read auditing:** Do not promise read-level audit merely by adding an audit table. RLS SELECT does not trigger an audit insert. Decide whether all narrative reads must be audited. If yes, remove direct client SELECT from the narrative table and expose a narrowly authorized audited read endpoint.
2. **Same-branch referential integrity:** Use composite unique keys/FKs (or an equally strong relational design) to prevent a task, care record, prayer record, assignment or registration from referencing a parent in another branch. RLS alone is not a referential integrity constraint.
3. **Role grant/deny precedence:** Document effective capability evaluation, including active role dates, deny precedence, scope and non-overridable sensitive checks. A staff override must not become an escalation bypass.
4. **Offline idempotency:** Scope client operation IDs to authenticated actor/device and operation; store payload hash and reject replay with a different payload.
5. **SMS recipient identity:** Enforce recipient class and canonical identity (contact vs staff) at database level. Phone snapshot is delivery evidence, not the canonical identity.
6. **Campaign approval:** Enforce approval in trusted server logic and database state transitions, not only a disabled UI button.
7. **Public registration:** Anonymous access must not directly insert into or enumerate the canonical staff contact directory.

## 6. Required stakeholder approval order

To avoid approving downstream details before upstream policy, use this order:

1. Confirm the church/branch boundary and the six-role operating model.
2. Approve R-01 through R-05 (sensitive access, Coordinator scope, Team Leader scope and contact field access).
3. Approve R-10 and R-11 (care and intercessor restrictions).
4. Approve R-06 through R-09 and R-12 (SMS and export authority).
5. Approve D-03 through D-08 (contact identity, tasks, registration, capacity and offline).
6. Approve D-09 through D-11 (provider, consent, automation, campaigns and budget).
7. Approve D-12 and D-13 (reports and retention).
8. Freeze the capability matrix, logical ERD and physical schema as one versioned baseline.

A decision can be deferred, but the corresponding feature/capability remains disabled or uses the conservative safe default. No migration should silently encode a pending choice as a permanent policy.

## 7. Implementation gate — what is allowed next

### Allowed after this review

- Correct documentation inconsistencies and naming differences.
- Produce a logical-to-physical mapping appendix.
- Update the ERD after the entity inventory is reconciled.
- Create a local-only SQL draft clearly marked as non-production once the table/field mapping is frozen.
- Build synthetic RLS test fixtures and test specifications.
- Prepare provider-neutral SMS interface contracts without enabling live sends.

### Not allowed until the relevant approval

- Applying migrations to any hosted Supabase project.
- Enabling broad prayer/care narrative access.
- Enabling conditional individual/bulk/automated SMS grants.
- Selecting a live SMS provider or sending real messages.
- Collecting real visitor/contact data in a schema whose privacy/retention rules are unresolved.
- Treating local/offline cached permissions as current authorization.
- Merging the design PR as implementation sign-off.

## 8. Approval record template

Create one record per D/R item. Do not record a decision as approved unless the authorized stakeholder and evidence are known.

| Field | Value |
|---|---|
| Decision ID | Pending |
| Exact decision text | Pending |
| Outcome | Pending |
| Approved rule and scope | Pending |
| Exceptions / deferred items | Pending |
| Approver and authority | Pending |
| Approval date | Pending |
| Evidence/reference | Pending |
| Affected docs / schema objects | Pending |
| Required positive/negative tests | Pending |
| Follow-up owner | Pending |

## 9. Stage 4 exit criteria

Stage 4 is complete only when:

- [ ] D-01–D-13 have an explicit status and owner.
- [ ] R-01–R-12 have an explicit status and authorized approver.
- [ ] Naming and logical-to-physical mapping are reconciled.
- [ ] Branch consistency and role/deny precedence are specified.
- [ ] Prayer/care audited-read requirements are decided.
- [ ] SMS recipient identity, inbound opt-out, approval and retention are consistent.
- [ ] Registration, capacity, offline idempotency and report schemas are resolved.
- [ ] The logical ERD and physical proposal are updated to match the approved decisions.
- [ ] The approved design is frozen before executable migrations are prepared.

**Current outcome:** Stage 4 review worksheet created; stakeholder approvals remain pending. The database remains unmodified.
