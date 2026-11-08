# CMI Follow-up — Event Transaction API Contract

**Baseline:** CMI Follow-up v2.1  
**Status:** Engineering contract proposal; not an implementation or policy approval  
**Depends on:** `supabase-cmi/schema-drafts/events_attendance_public_content.sql`, stakeholder decisions D-05, D-06, D-13 and applicable R-01–R-12  
**Scope:** Registration, capacity, transport reservation, check-in and event closeout  
**Safety boundary:** No endpoint, database grant, RLS policy, hosted project or production migration is activated by this document.

## 1. Purpose and implementation gate

The event schema is present as a reviewable draft and passes isolated pgTAP validation. The next backend stage must make all state-changing operations transactional. A browser must never implement capacity by reading a count and then inserting a registration; concurrent requests can exceed capacity. The server must serialize the relevant operation and commit the state change and idempotency receipt together.

This contract defines expected inputs, invariants, transaction boundaries, errors and tests. It deliberately does not choose unresolved church policies. Before implementation, stakeholders must approve D-05 (public registration fields and identity linking), D-06 (capacity, cancellation, waitlist, walk-in and transport rules), D-13 (retention), and the applicable role/scope decisions.

## 2. Endpoint inventory

| Operation | Intended route | Caller class | Current state |
|---|---|---|---|
| Public event registration | `POST /functions/v1/event-registration` | Anonymous visitor | Blocked by D-05/D-06 |
| Staff registration create/update/cancel | `POST /functions/v1/event-registration-staff` | Authenticated staff | Blocked by R-01–R-12, D-05/D-06 |
| Transport reservation/cancellation | `POST /functions/v1/event-transport` | Authenticated staff / approved attendee flow | Blocked by D-06 |
| Event check-in | `POST /functions/v1/event-checkin` | Authenticated event staff | Blocked by R-04, D-06, offline policy D-08 |
| Event closeout submit/review | `POST /functions/v1/event-closeout` | Authenticated staff | Blocked by R-04 and approved review authority |

Routes are proposed names, not deployed routes. Public content remains a separate read-only function. Do not add event write operations to that function or reuse its public service-role client for staff APIs.

## 3. Shared request and response rules

### 3.1 Request envelope

- Require HTTPS and JSON with a strict schema; reject unknown properties.
- Require a UUID `Idempotency-Key` for every mutation. The key is scoped to operation + event + caller class/actor.
- Enforce body-size limits, per-IP and per-event rate limits, abuse controls and request timeouts at the gateway.
- Normalize phone/email only according to approved Ghana/international input rules. Do not treat a phone number as proof of identity.
- Never accept caller-supplied `branch_id`, `created_by`, `recorded_by`, actor role, approval identity, capacity count or authoritative status transition. Derive actor and branch from trusted server-side records.
- Do not log names, phone numbers, email addresses, consent text, tokens or raw request bodies. Use request correlation IDs.

### 3.2 Response envelope

Successful create/update operations return a minimal projection and a stable operation receipt. Do not return internal contact fields, staff identifiers, raw database errors, service-role details or private notes.

Use consistent outcomes:
- `201`: new resource created.
- `200`: idempotent replay or successful state transition.
- `400`: malformed/unsupported input.
- `401`: missing/invalid staff authentication where required.
- `403`: authenticated caller lacks an approved capability/scope.
- `404`: resource unavailable in the caller's permitted/public scope; avoid existence disclosure.
- `409`: closed registration, capacity reached, duplicate/invalid state transition or idempotency-key payload conflict.
- `422`: syntactically valid input that fails an approved business rule.
- `429`: rate limit or abuse threshold exceeded.
- `500/503`: generic server failure; detailed cause remains in protected operational telemetry.

## 4. Registration transaction

### 4.1 Proposed input

Public registration may accept only:
- `event_id`
- attendee display name
- one or more contact channels only if approved
- required consent acknowledgement/reference only after D-05 and privacy review
- `Idempotency-Key`

It must not accept `contact_id`, branch, registration status, timestamps, staff actor, or arbitrary metadata from an anonymous caller.

Staff registration uses a separate contract and must resolve the authenticated staff actor, branch and event authorization server-side. Linking to an existing canonical contact must use a trusted picker/review workflow, never an arbitrary UUID supplied by a public caller.

### 4.2 Required transaction sequence

1. Validate request shape and idempotency key before opening the transaction.
2. Begin a database transaction.
3. Lock the event row with `SELECT ... FOR UPDATE`. All capacity-affecting registration operations for the event must use this same lock.
4. Re-read event status, visibility, registration state, branch, start/end times and capacity under the lock.
5. Confirm public registration is permitted for the event and current time under the approved registration-window rule.
6. Resolve idempotency. Same key + same normalized request returns the original receipt; same key + different request returns `409`.
7. Apply approved duplicate-review policy without treating name/phone equality as identity proof.
8. If capacity is finite, count capacity-consuming registrations under the same serialized event lock. Exclude cancelled registrations; inclusion of other states must be explicitly defined.
9. If the approved capacity rule allows the registration, insert the minimized snapshot and its idempotency receipt atomically.
10. Commit. On any failure, roll back both the registration and receipt.

### 4.3 Capacity invariants

- Capacity `NULL` means unlimited only if stakeholders confirm that interpretation.
- A finite capacity must never be exceeded by concurrent registrations.
- No waitlist state is introduced unless D-06 explicitly approves it.
- Cancellation must use a valid state transition and release capacity exactly once.
- A retry after timeout must not create a second registration.
- A replay with a different payload must not silently return or mutate the original attendee's registration.

### 4.4 Required schema review before implementation

The current draft has an event/source/client-request uniqueness index for non-null request IDs, but it does not store a normalized request fingerprint. Add a dedicated idempotency receipt with a request digest and minimal response reference, or an equivalent immutable digest on the registration, before implementing safe replay semantics.

The current `consent_record_id` is a UUID field without a declared FK to an approved consent ledger. D-05/D-13 must determine the consent evidence model and retention before this field is used as proof of consent.

## 5. Transport reservation transaction

### 5.1 Proposed input

- `event_id`
- `registration_id`
- `transport_option_id`
- `seat_count` (only if approved; otherwise fixed to one)
- pickup selection from an approved list, if pickup zones are introduced
- `Idempotency-Key`

Do not accept branch, reservation status, actor or free-form internal notes from an attendee-facing caller.

### 5.2 Required transaction sequence

1. Authenticate/authorize staff or validate the approved attendee claim for the registration.
2. Lock the parent event row, then lock the transport option row, in a consistent order.
3. Confirm event transport is enabled, option belongs to the same event/branch, option is enabled and event/registration state permits reservation.
4. Resolve idempotency and detect key/payload mismatch.
5. Sum `seat_count` for reservations in capacity-consuming states (`reserved` and `boarded`) while holding the option lock.
6. Reject if the requested seats would exceed finite option capacity.
7. Insert or transition the reservation and idempotency receipt in one transaction.
8. Commit.

### 5.3 Unresolved transport rules

D-06 must decide whether one registration can hold more than one active transport option, whether a reservation can contain multiple seats, whether pickup areas are free text or controlled entities, when boarding changes state, and whether cancelled/no-show seats are released. The current unique index permits a registration to reserve different options; that behavior must not be exposed until approved.

## 6. Check-in transaction

### 6.1 Proposed input

- `event_id`
- exactly one approved attendee reference: registration, canonical contact, or an approved walk-in token/snapshot
- source: staff workspace or an approved offline-sync operation
- `Idempotency-Key`

A public browser must not be able to submit arbitrary `contact_id` or mark a visitor present. Offline sync requires D-08 approval, device enrollment, expiry and server-side reauthorization.

### 6.2 Required transaction sequence

1. Authenticate staff and resolve current event assignment/capability/scope.
2. Lock the event row and validate the event is in a check-in-allowed state.
3. Resolve the attendee reference and verify event/branch consistency.
4. Resolve idempotency. A repeated key returns the original check-in receipt.
5. Enforce the approved duplicate policy. A registration can be checked in only once for an event.
6. Insert check-in and append audit/event history in the same transaction.
7. Commit and return a minimal receipt.

### 6.3 Schema correction required

The current check-in table allows both `registration_id` and `contact_id` to be supplied, without asserting that the contact is the same contact linked to that registration. Before implementation, either enforce exactly one identity source or add a database constraint/trigger that proves the two references are consistent.

The current table permits a name-only snapshot. That is not proof of identity. Do not enable name-only walk-in check-in until D-06 defines the verification method, duplicate handling and audit requirements.

## 7. Event closeout transaction

### 7.1 Submit

- Resolve actor and event scope server-side.
- Lock the event and existing closeout row.
- Derive registration, check-in and transport counts from authoritative rows; never trust client-supplied totals.
- Save a closeout snapshot with submitter and timestamp.
- Append an immutable closeout event in the same transaction.
- Prevent edits to a submitted closeout except through an approved return/reopen transition.

### 7.2 Review

- Require a separately approved reviewer capability and scope.
- Enforce any submitter/reviewer separation rule if stakeholders approve it.
- Lock closeout row, validate current state and reviewer authority, then transition to approved or returned.
- Append the review event atomically.
- Never allow a client to set `reviewed_by`, `reviewed_at` or status directly.

### 7.3 Schema review

The current `event_closeout_event` table is intended as history but has no explicit immutability trigger in the draft. Add database-level update/delete prevention and a narrow append-only insert path before using it as an audit history.

## 8. Authorization and Supabase boundary

- Do not grant `anon` or `authenticated` direct INSERT/UPDATE/DELETE on event, registration, transport, check-in or closeout base tables.
- Public registration, if approved, must be a narrow server-side endpoint with a fixed input allowlist and a narrowly scoped database operation. Never expose the service-role key to a browser.
- Staff operations must verify the Supabase Auth user server-side, resolve an active staff profile, and enforce the approved capability + branch + team/event assignment predicates on every operation. Do not trust role names or branch IDs sent by the client.
- The current role matrix is proposed only. Until R-01–R-12/D-01 are approved, no role-specific write capability should be seeded.
- Avoid broad `SECURITY DEFINER` functions. If a privileged database function is unavoidable for a public transaction, place it in a non-exposed schema, use a fixed `search_path`, grant EXECUTE only to the intended server role, revoke default PUBLIC execution, validate every argument and test privilege boundaries.
- Use separate clients/configuration for public-content reads and staff mutation paths. Never reuse the public-content service-role client as a general-purpose API client.
- Keep audit metadata minimal and append-only. Do not copy attendee PII into generic audit JSON.

## 9. Required database and API tests

| Test | Scenario | Expected result |
|---|---|---|
| REG-001 | Two simultaneous requests for the last seat | Exactly one succeeds |
| REG-002 | Same idempotency key and same payload retried | Original receipt returned; one row |
| REG-003 | Same idempotency key with changed attendee payload | `409`; no mutation |
| REG-004 | Registration for draft/private/closed event | Rejected without leaking event details |
| REG-005 | Registration after approved closing time | Rejected |
| REG-006 | Registration cancellation retried | Capacity released once |
| REG-007 | Cross-branch contact ID submitted by staff | Rejected |
| REG-008 | Public caller submits `contact_id` or `branch_id` | Rejected as unknown/forbidden input |
| TRN-001 | Concurrent requests for final transport seat | Capacity never exceeded |
| TRN-002 | Option from another event/branch | Rejected |
| TRN-003 | Event transport disabled | Rejected |
| TRN-004 | Same registration reserves multiple options | Matches only approved policy |
| CHK-001 | Same check-in request retried | Original receipt returned |
| CHK-002 | Registration checked in twice | Second operation rejected/idempotent according to approved policy |
| CHK-003 | Registration and unrelated contact supplied together | Rejected by DB invariant |
| CHK-004 | Name-only walk-in before D-06 approval | Rejected |
| CHK-005 | Revoked event assignment | Denied |
| CHK-006 | Offline receipt replayed from expired/revoked device | Denied |
| CLO-001 | Client supplies false attendance totals | Server-derived totals used |
| CLO-002 | Unauthorized user reviews closeout | Denied |
| CLO-003 | Closeout history update/delete attempted | Rejected |
| AUTH-001 | Anonymous direct base-table mutation | Denied |
| AUTH-002 | Staff user forges role/branch/actor fields | No privilege escalation |
| AUD-001 | Mutation fails after audit insertion attempt | Both mutation and audit roll back |
| AUD-002 | Mutation commits | Exactly one corresponding immutable event exists |

Concurrency tests must use two independent database sessions and synchronize the competing transactions; sequential unit tests are insufficient.

## 10. Build sequence after approval

1. Record D-05, D-06, D-13 and applicable R/D decisions in `docs/11_CMI_STAKEHOLDER_DECISION_REGISTER.md`.
2. Revise event registration, transport and check-in schema for request digests, consent evidence, identity consistency and immutable closeout history.
3. Add database-level constraints and pgTAP tests for every invariant.
4. Implement narrow transaction functions in a private schema, with explicit execute grants and no public base-table access.
5. Implement separate Edge Function handlers for public registration and authenticated staff event operations.
6. Add authorization tests for every role, scope, inactive account, revoked assignment and forged field.
7. Add concurrent integration tests for event and transport capacity.
8. Run Deno checks, Supabase local migration reset, pgTAP, function integration tests and security advisors.
9. Keep all functions undeployed until a dedicated CMI hosted project, production secrets, rate limits, stakeholder approval and explicit deployment authorization exist.

## 11. Acceptance gate

This contract is accepted for implementation only when:
- D-05/D-06/D-13 are recorded as approved with approver/date;
- applicable R-01–R-12 and D-01 role/scope grants are approved;
- the schema corrections in Sections 4.4, 6.3 and 7.3 are addressed;
- all database and concurrency tests pass locally;
- no direct browser write grants are introduced;
- no hosted database or production function is changed without separate explicit approval.

**Current outcome:** contract documented; implementation remains blocked by pending stakeholder decisions and schema corrections.


## 12. Schema remediation progress (2026-11-08)

A follow-on draft PR, [PR #7 — event check-in identity and closeout history](https://github.com/Elgit4/PCG_Missions/pull/7), adds the two database guards called out in Sections 6.3 and 7.3:

- A check-in carrying both `registration_id` and `contact_id` must reference the same canonical contact linked to that registration in the same event and branch. The trigger applies on insert and relevant updates.
- `event_closeout_event` is protected against UPDATE, DELETE and TRUNCATE; append-only inserts remain possible for a future authorized transaction path.

These changes are in a separate draft PR and remain subject to its current CI run and review. They are not yet part of the base branch and must not be treated as approved or production-active.

The following schema/API gates remain unresolved:
- Idempotency requires a stored normalized request digest and replay receipt; a unique request key alone cannot safely distinguish same-payload retries from changed-payload reuse.
- `consent_record_id` still needs an approved consent-evidence relation and retention model before it can prove consent.
- The rule for multiple active transport options per registration remains pending D-06.
- Public registration, capacity, cancellation, waitlist, walk-in, transport and check-in policies remain blocked by D-05/D-06 and applicable role/scope approvals.
