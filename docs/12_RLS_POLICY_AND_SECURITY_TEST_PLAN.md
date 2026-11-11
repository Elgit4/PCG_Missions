# CMI Follow-up — RLS Policy & Security Test Plan

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Status:** Proposed test specification — not executable pgTAP and not evidence of passing tests  
**Branch:** design/cmi-logical-data-model  
**Depends on:** [Role/Capability Matrix](07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md), [Physical Schema Proposal](08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md), [Validation Report](09_DATABASE_DESIGN_VALIDATION_REPORT.md), [Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md)

## 1. Purpose

This document turns the proposed capability/scope model into a database-security test plan for future PostgreSQL RLS policies, SQL grants, trusted server-side endpoints and pgTAP/integration tests.

It does not contain applied policies or executable tests. Role grants remain proposals. Decision-dependent tests must not be treated as permission approval. Build the suite against a disposable local Supabase/PostgreSQL environment with synthetic identities and records before any hosted deployment.

## 2. Security model under test

Every protected operation must satisfy all applicable predicates:

1. Valid authenticated identity.
2. Active staff profile and non-revoked credential/session state.
3. Required capability from current server-controlled role assignments.
4. Correct branch context and relational branch consistency.
5. Correct team, event, contact-assignment or explicit-share scope.
6. Field-level access for requested columns.
7. Separate prayer/care assignment or explicit audited oversight.
8. Valid state transition and required approval.
9. Current SMS recipient eligibility and suppression/consent checks for dispatch.

**Role union is additive only for eligible capabilities.** It must not remove scope restrictions, field restrictions, mandatory denies or sensitive-record assignment requirements.

RLS protects rows, not individual columns. Use column-level SQL grants, carefully designed security-invoker views, or server-side DTO/endpoints for field visibility. Do not expose a base-table SELECT grant and assume RLS hides selected contact columns.

## 3. Test environment and fixtures

### 3.1 Synthetic users

Create isolated Auth identities and linked staff profiles for:

- U-ADMIN: Admin/Pastor.
- U-COORD: Coordinator.
- U-LEAD-A and U-LEAD-B: Team Leaders for Team A and Team B.
- U-FIELD-A: Field Worker assigned to Team A.
- U-VOL-A: Follow-up Volunteer assigned to Team A.
- U-INTER-A and U-INTER-B: Prayer Intercessors assigned Prayer A and Prayer B respectively.
- U-MULTI: Field Worker + Prayer Intercessor, assigned only Contact A and Prayer A.
- U-REVOKED: deactivated staff profile/revoked role assignment.
- ANON: unauthenticated public caller.

Use two branch fixtures only if the approved branch model supports multiple branches. A second branch in tests proves isolation; it does not imply multi-church tenancy.

### 3.2 Synthetic records

Seed Branch A/B, Team A/B, Contact A assigned to Team A, Contact B assigned to Team B, Contact C unassigned, scoped notes, assigned and unassigned tasks, Prayer A/B/C, assigned/unassigned care records, Event A/B, published and draft public content, public registration-enabled and closed events, SMS campaign/automation/outbox examples, suppression and eligible recipients, and idempotency receipts.

Use clearly synthetic names, phone numbers and emails. Never use real congregant or visitor data.

## 4. Table/domain policy matrix

This is expected policy behaviour, not final role approval. Conditional grants must follow document 11.

| Domain/table family | Anonymous | Active authenticated staff | Additional predicate |
|---|---|---|---|
| Public profile, published sermons/daily words/tracts/welcome content | Published projection only | Published content; drafts require content capability | Publication state; no draft leakage |
| Events | Public event projection only | Branch and authorized event scope | Visibility/status/registration window |
| Staff profile/directory | None | Minimal permitted staff fields | Directory capability; no credential metadata |
| Roles/capabilities/grants/overrides | None | No direct client mutation | Privileged authorization administration |
| Teams/memberships/service areas | None | Branch and membership scope | Management capability; no cross-team escalation |
| Contacts | None | Permitted ordinary fields and scope | Contact capability + branch + assignment/team/share |
| Captures/interactions/ordinary notes | None | Own/assigned/team scope | Author/assignment/visibility; no pastoral narratives |
| Contact merge history | None | No general access | Privileged merge workflow and audit |
| Follow-up lists/tasks/events | None | Assigned task/team/event scope | Follow-up capability and valid transitions |
| Prayer requests/assignments | None | Assigned intercessor; separately authorized workflow/oversight | Active assignment; independent narrative policy |
| Prayer access audit | None | No general access | Privileged audit capability |
| Care records/groups/interactions | None | Assigned care worker; separate oversight | Care capability and active assignment |
| Registration/transport/check-in/closeout | None except narrow registration endpoint | Event/branch scope and action capability | Capacity transaction, event assignment, idempotency |
| Calendar/announcements | None | Audience/branch/team/event scope | Manage/publish capability |
| SMS preferences/suppressions | None | Minimum eligibility data for trusted dispatch | Restricted communication administration |
| SMS campaigns/recipients/outbox/delivery | None | Operator-specific scoped projections | Approval, recipient class, send mode, masking |
| SMS automation rules/executions | None | Approved configurators only | Trigger allowlist, approval, caps, kill switch |
| Reports/review events | None | Own/team/event/branch scope | Submit/read/review/export capability |
| Audit events | None | No general access | Privileged audit read; append-only |
| Offline sync receipts | None | Actor reads own receipt/status | Actor/device/operation key |
| Settings | None | No direct access except approved public projection | Settings capability |

## 5. Required policy invariants

### 5.1 Identity and role lifecycle

- Every protected table denies anonymous reads/writes unless an explicit public projection is documented.
- Inactive staff cannot read or mutate operational records, even with stale JWT metadata.
- Role assignments are effective only within validity dates and when not revoked.
- User-editable Auth metadata cannot create roles, capabilities, branch scope or privilege overrides.
- Role/capability tables cannot be mutated directly by ordinary clients.
- Multiple roles add eligible capabilities, but all record-scope and sensitive-domain predicates still apply.

### 5.2 Branch, team, event and contact scope

- Branch scope comes from trusted database relationships, not a caller-supplied branch ID alone.
- Parent and child records cannot reference different branches where branch consistency is required.
- Team leaders cannot enumerate or mutate another team's contacts, tasks, membership or campaigns without explicit sharing.
- Event assignment grants access only to that event and its approved workspace.
- Ended/revoked assignments cease granting access immediately.
- UPDATE policies require both old-row visibility and new-row scope validation, preventing records being moved across branches, teams, owners or sensitive scopes.

### 5.3 Field-level and sensitive-domain protection

- Contact field restrictions are enforced at SQL privilege/view/API projection level, not by row RLS alone.
- Ordinary contact notes cannot contain prayer/care narratives.
- Intercessors access only currently assigned prayer content; no unassigned or other-intercessor request through list, search, count, guessed ID, joins or exports.
- Coordinator workflow metadata access does not imply prayer narrative access.
- Admin/Pastor oversight is an explicit capability and must be audited; no hard-coded role-name bypass.
- If every narrative read must be audited, direct client SELECT on narrative tables is denied and reads use a narrow trusted endpoint that authorizes, writes the audit event and returns minimal approved fields.
- Care data is available only to active assigned care workers or separately authorized oversight.
- Sensitive text is excluded from generic audit metadata, reports, SMS, notifications and offline payloads.

### 5.4 Public endpoints and content

- Anonymous visitors read only published content fields.
- Anonymous users cannot query staff profiles, canonical contacts, prayer/care, reports, audit, settings or SMS tables.
- Public event registration uses a narrow server-side operation; it cannot enumerate contacts or choose arbitrary contact IDs.
- The endpoint validates publication, registration window, allowed fields, capacity, rate limits, abuse controls and idempotency.
- Public registration cannot change staff-only fields or bypass duplicate review.

### 5.5 SMS dispatch and callbacks

- Clients cannot insert provider-bound outbox messages directly.
- Dispatch rechecks sender capability/scope, recipient class, current lawful-basis/consent policy, phone validity, suppression, quiet hours, template approval and caps.
- Manual outbox rows require a valid sender; bulk rows require campaign-recipient provenance; automated rows require an automation execution.
- Campaign creator cannot approve own campaign where separation is required.
- Automation rules remain disabled until approved and can be paused by an authorized kill switch.
- Provider credentials never leave server-side secrets.
- Provider callbacks require signature verification, replay protection and idempotent receipt.
- Inbound opt-out/STOP creates suppression before any later queued send.
- Delivery views mask phone numbers and message content according to role.

## 6. Security test catalogue

Tests must execute as the real application roles through the same API/database path used by the application, not only as database owner.

| Test ID | Scenario | Expected result |
|---|---|---|
| AUTH-001 | Anonymous caller selects any staff/private table | Denied |
| AUTH-002 | Authenticated user without active staff profile selects contacts | Denied |
| AUTH-003 | Deactivated user reuses a previously issued JWT | Denied for protected operations |
| AUTH-004 | User edits Auth metadata to add Admin/Pastor role | No privilege change |
| AUTH-005 | Expired or revoked role assignment | Capability not effective |
| AUTH-006 | Field Worker + Intercessor user reads unassigned prayer request | Denied; role union cannot bypass assignment |
| AUTH-007 | Ordinary user mutates role/capability/override tables | Denied |
| SCOPE-001 | Team Leader A lists Team B contacts | No rows |
| SCOPE-002 | Team Leader A reads Team B contact by guessed UUID | Denied/no row |
| SCOPE-003 | Field Worker reads assigned Contact A | Only approved fields |
| SCOPE-004 | Field Worker reads unassigned Contact C | Denied/no row |
| SCOPE-005 | Contact assignment is revoked, then read is repeated | Access denied immediately |
| SCOPE-006 | User changes a row's branch/team to an unauthorized scope | UPDATE rejected |
| SCOPE-007 | Branch A task references Branch B contact | FK/constraint rejects |
| SCOPE-008 | Team A event assignee reads Team B event workspace | Denied |
| FIELD-001 | Volunteer requests restricted contact columns | Columns unavailable or omitted |
| FIELD-002 | Intercessor queries general contact directory | Denied |
| FIELD-003 | User reads note outside visibility/team scope | Denied |
| PASTORAL-001 | Intercessor A reads assigned Prayer A | Only permitted request fields |
| PASTORAL-002 | Intercessor A reads Prayer B assigned to Intercessor B | Denied/no row |
| PASTORAL-003 | Intercessor reads unassigned Prayer C | Denied/no row |
| PASTORAL-004 | Coordinator reads prayer workflow metadata | Metadata only; no narrative |
| PASTORAL-005 | Coordinator selects request narrative directly | Denied |
| PASTORAL-006 | Admin/Pastor without explicit oversight grant reads narrative | Denied |
| PASTORAL-007 | Admin/Pastor with oversight grant reads narrative | Allowed only through audited path |
| PASTORAL-008 | Direct REST SELECT attempts to bypass audited read endpoint | Denied when audited-read mode is required |
| PASTORAL-009 | Intercessor queries care records | Denied |
| PASTORAL-010 | Generic audit/report/notification query searches pastoral narrative | No narrative present |
| PUBLIC-001 | Anonymous user reads published sermon | Public fields only |
| PUBLIC-002 | Anonymous user reads draft sermon by ID/slug | Denied/no row |
| PUBLIC-003 | Anonymous user queries contacts, staff, prayer, care, reports or SMS | Denied |
| PUBLIC-004 | Public registration supplies arbitrary contact ID | Ignored/rejected; no directory linkage |
| PUBLIC-005 | Registration targets unpublished/closed event | Rejected |
| PUBLIC-006 | Concurrent registrations compete for final capacity slot | Capacity never exceeded |
| PUBLIC-007 | Same idempotency key and same payload is retried | Original result; no duplicate |
| PUBLIC-008 | Same idempotency key with different payload hash | Rejected |
| SMS-001 | Client directly inserts an outbox row | Denied |
| SMS-002 | Manual send lacks valid sender or scope | Rejected |
| SMS-003 | Bulk send has no approved campaign recipient snapshot | Rejected |
| SMS-004 | Automated send has no approved rule/execution | Rejected |
| SMS-005 | Sender loses capability after queueing but before dispatch | Dispatch blocked |
| SMS-006 | Recipient opts out after campaign snapshot but before dispatch | Suppressed at dispatch |
| SMS-007 | Campaign creator attempts to approve own campaign | Rejected where separation is required |
| SMS-008 | Campaign exceeds approved budget/segment cap | Dispatch blocked atomically |
| SMS-009 | Provider callback has invalid signature | Rejected; no delivery-state change |
| SMS-010 | Duplicate provider callback arrives | Idempotently ignored |
| SMS-011 | Inbound STOP callback received | Suppression committed before later queued send |
| SMS-012 | Provider secret requested from browser/client | Never returned |
| WORK-001 | Client attempts invalid task status transition | Rejected |
| WORK-002 | User updates task and changes its branch/team in same request | Rejected |
| AUDIT-001 | Privileged prayer/care read succeeds | Required audit event written |
| AUDIT-002 | Audit metadata includes request text, PIN or provider secret | Test fails; sensitive value must not be logged |
| AUDIT-003 | Ordinary user updates/deletes audit event | Denied |
| OFFLINE-001 | Valid actor/device operation syncs | Processed once |
| OFFLINE-002 | Same operation ID and payload hash retried | Existing receipt returned |
| OFFLINE-003 | Same operation ID with changed payload hash | Rejected |
| OFFLINE-004 | Assignment/role revoked before sync | Reauthorized and denied if no longer eligible |
| OFFLINE-005 | Client submits prayer/care narrative in offline queue | Rejected |
| OFFLINE-006 | User reads another actor/device receipt | Denied |

## 7. Test execution requirements

- Use pgTAP or equivalent transaction-isolated tests for schema, grants, constraints and RLS.
- Use Supabase local development stack or disposable PostgreSQL with equivalent Auth claims; never use production data.
- Execute tests as anon/authenticated and synthetic users, not database owner or service role.
- Test direct PostgREST calls as well as trusted Edge Function routes. A secure UI is not proof of secure RLS.
- For each table, test SELECT, INSERT, UPDATE and DELETE independently. Deny DELETE by default for business history.
- Test UPDATE old-row visibility and new-row WITH CHECK conditions.
- Review helper function grants, search paths, ownership and SECURITY DEFINER behaviour. Prefer SECURITY INVOKER.
- Verify no default PUBLIC execute grants on privileged functions.
- Test list, detail, search, count, pagination, export, relationship joins and guessed UUIDs.
- Run Supabase security advisors before staging.
- Keep fixture seeding and teardown deterministic; test migration reset from an empty database.
- CI must fail on unexpected policy allowance or denial. Store output without real personal data.

## 8. Release gate

The database security gate passes only when:

- [ ] R-01–R-12 and D-01–D-13 access decisions are approved or conservatively deferred.
- [ ] Every exposed table has RLS enabled and explicit grants.
- [ ] Every table has positive and negative role/scope tests.
- [ ] Prayer/care isolation and required narrative read-audit path are proven.
- [ ] Branch/team/event/contact scope and field-level controls are proven.
- [ ] Public endpoints cannot enumerate or mutate staff/private data.
- [ ] SMS eligibility, suppression, approval, budgets and callback verification are tested.
- [ ] Offline sync reauthorization and idempotency are tested.
- [ ] Clean database reset, migrations and CI tests pass.
- [ ] Security review signs off on Supabase email/password onboarding, temporary-password expiry, administrator-reviewed reset, delivery-failure recovery and provider integration.

**Current status:** Test plan authored only. No RLS policies, pgTAP tests, local database tests or hosted Supabase changes have been executed.
