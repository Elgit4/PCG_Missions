# CMI backend implementation status

**Baseline:** CMI Follow-up v2.1  
**Workspace:** `supabase-cmi/` (isolated from historical `supabase/`)  
**Status:** PRs #3–#9 are merged into `main`. The `main` baseline passed 129 pgTAP assertions across four local CMI suites. The implementation was tested on commit `0cc2ed86baee16928e14d9e015608128b43e7a0d`; the three commits since then only reconcile implementation/readme documentation and function guidance. The latest PR-head run also passes with no executable-code changes after the tested implementation. PR #10 (`feat/cmi-staff-session-api`) remains an open draft review branch. Its current exact head `7ab4174ebe529279eda55a96ab4f52345aef74e3` passed [CI run 42588602409](https://github.com/Elgit4/PCG_Missions/actions/runs/42588602409): Edge Function formatting, linting, type-checks and Deno tests plus **178 pgTAP assertions across six files** on the disposable local CMI stack. The tested task slice includes scoped list/detail/create/update/reassignment operations, archived-contact exclusion, timezone-aware due dates, HMAC idempotency, sanitized RPC responses, `SECURITY INVOKER` transactions and append-only task history. PR #10 is not merged or deployed; these are source-only review-branch changes. No hosted CMI database was linked, queried, migrated or modified. The PR #8 merge commit is [d091a894](https://github.com/Elgit4/PCG_Missions/commit/d091a89404165d11e96949b5aa7d35a646a89db8).

## New staff API implementation in review branch

The `feat/cmi-staff-session-api` branch adds an initial API layer for frontend integration:

- `staff-session` validates a Supabase Auth token, requires an active staff profile and returns current active branch assignments, roles and exact approved capabilities.
- `staff-operations` provides scoped contact list/detail, atomic contact capture and ordinary-field update routes.
- `staff-operations` also provides scoped follow-up task list/detail, idempotent creation and atomic ordinary-field/status updates. Visibility is filtered by branch, active team membership, direct assignment or task creator; unsupported scope modes do not broaden access.
- Follow-up task reassignment is a separate branch-authorized transaction. It can target one active same-branch staff member or team, rejects completed/cancelled tasks, appends old/new target metadata and is a no-op for an unchanged target.
- Task creation enforces exactly one primary assignee (staff member OR team), active same-branch contact/list references, assignment-scope rules and a branch-scoped versioned HMAC idempotency receipt. Task create/update RPCs are service-role-only `SECURITY INVOKER` functions.
- A new task may reference only an `active` contact; archived or merged contacts are rejected. Task RPC responses use an allowlisted projection and never return the idempotency key or HMAC digest fields.
- Task updates validate status transitions and append lifecycle history in the same transaction. Database triggers reject UPDATE, DELETE and TRUNCATE on the task event ledger; task-note text is not copied into event metadata.
- Capability definitions are populated from the proposed action catalogue, but no `role_capability` rows are seeded. Until R-01–R-12 and D-01 are approved, staff sessions return no business capabilities and business operations remain denied.
- Contact phone/email capture, read and update are separately capability-gated to preserve field-level privacy.
- Contact creation is one database transaction: validate the actor, branch and capability; enforce the request idempotency key; write the contact and capture provenance; and create the required self/team assignment.
- The contact RPC uses `SECURITY INVOKER`, a pinned `pg_catalog` search path and `EXECUTE` permission for `service_role` only. CI invokes it as `service_role`, proving it does not need migration-owner privilege elevation.
- Both staff Edge Functions require JWT verification at the Supabase gateway and independently validate the bearer token with Supabase Auth.
- The CI workflow type-checks/tests the staff functions and applies the capability/contact transaction draft to the isolated local CMI database for pgTAP validation.

The matching API contract is [document 19](../docs/19_CMI_STAFF_API_CONTRACT.md). These changes are source-only in a review branch and have not been deployed or applied to a hosted database.

## Implemented and validated

- Dedicated Supabase CLI project with a distinct local project ID and non-conflicting ports.
- Church/branch foundation, Auth-linked staff profiles, six-role catalogue, capability catalogue, role assignments, teams and service areas.
- RLS enabled and browser grants withheld on foundation tables; no role-capability grants seeded.
- Contacts/follow-up draft: contacts, capture provenance/idempotency, staff/team assignment, notes, interactions, merge history, follow-up lists/tasks and append-only task events.
- Restricted pastoral draft: prayer requests/assignments, care groups/records/assignments/interactions, and separate append-only prayer/care access-audit ledgers.
- CI validation of the first three suites on an isolated local Supabase stack: identity/authorization (14 assertions), contacts/follow-up (24), restricted pastoral (20). Recorded in [run 42436473154](https://github.com/Elgit4/PCG_Missions/actions/runs/42436473154).

## Newly added — events, attendance, transport and public content

Source files:
- `schema-drafts/events_attendance_public_content.sql`
- `schema-drafts/events_attendance_public_content.test.sql`

The draft adds 19 relations covering:
- Events and separate typed staff/team event assignments.
- Event registrations with branch-consistent contact links and request idempotency.
- Transport options and seat reservations.
- Event check-in with mandatory event-scoped idempotency and registration duplicate protection.
- Event closeout and append-only closeout history.
- Calendar entries with typed branch/team/event/own scope rather than polymorphic IDs.
- Announcements with typed team/event audience links.
- Church public profile, welcome messages, sermons, daily words, digital tracts and typed external document links.

The draft intentionally excludes waitlists, public browser table access, role-specific policies, direct registration writes, announcement SMS delivery state, and public content projections. RLS is enabled and browser grants are withheld on all 19 new tables. Capacity enforcement remains a trusted serialized transaction requirement, not a client-side count. Public registration, attendee snapshot retention and walk-in identity rules remain subject to D-05, D-06 and D-13.

The CI workflow generates a temporary migration filename using `supabase migration new`, applies this draft on the disposable local CMI stack, runs its expanded 46-assertion pgTAP suite, and removes temporary files afterward. The original 36 assertions passed in [run 42437731467](https://github.com/Elgit4/PCG_Missions/actions/runs/42437731467); the expanded suite, including seven API-projection/schema alignment assertions plus three E.164 phone validation assertions, passed in [run 42447736530](https://github.com/Elgit4/PCG_Missions/actions/runs/42447736530).

## Newly added — public-content Edge Function (implementation draft)

Source files:
- `supabase/functions/public-content/index.ts`
- `supabase/functions/public-content/validation.ts`
- `supabase/functions/public-content/validation_test.ts`
- `supabase/functions/README.md`

The read-only Edge Function exposes fixed, allowlisted projections for the church public profile, published sermons, daily words, tracts, welcome messages, public announcements and published public events. It selects explicit columns, applies publication/visibility filters server-side, bounds pagination, rejects arbitrary resources/parameters, supports slug lookup only for slugged content, and allows GET/OPTIONS only. Database errors are not returned to callers. Exact allowed browser origins are configured through a server environment variable.

The function uses a server-side service-role key because public base-table grants remain closed. This key bypasses RLS, so the implementation is deliberately limited to fixed table/column/filter combinations and must never be reused for staff APIs. It fails closed when secrets are missing. It exposes only church-wide welcome messages (not branch-specific messages) and omits event capacity from the public event projection. Rate limiting and abuse controls must be configured at the platform/gateway layer; CORS is not a security boundary. The function is source-only and has not been deployed.

A Deno validation suite covers supported resources, pagination, slug validation, unknown and duplicate query parameters, inherited object-property resource names, and public-profile request shape. CI runs that suite before the local Supabase database suite. Deno type-check and request-validation tests passed in the PR #8 exact-head workflow [run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750). That run also executed the idempotency helper tests and passed all 129 database assertions.

## Deliberately not implemented

- Full six-role capability grants and role/scope RLS policies; R-01–R-12 and D-01 remain approval gates.
- Staff credential activation/reset implementation; Supabase Auth remains the credential authority.
- Trusted transactional contact merge/reversal.
- Audited prayer/care read Edge Function/RPC.
- Trusted registration, capacity reservation, transport-seat allocation and check-in endpoints.
- Public content Edge Function deployment and production-origin/rate-limit configuration.
- SMS provider adapter, consent/suppression, callback verification, dispatch budget and automation.
- Reporting, audit retention policy and limited-offline device enrollment.
- Production deployment or hosted database linking.

## Verification boundary

The merged `main` baseline contains 129 pgTAP assertions across four suites: identity/authorization (14), contacts/follow-up (24), restricted pastoral (20), and events/idempotency/public-content (71). PR #10 adds a 19-assertion capability-catalogue/contact-capture suite and a **30-assertion follow-up task transaction suite**. Its current exact head `7ab4174ebe529279eda55a96ab4f52345aef74e3` passed [CI run 42588602409](https://github.com/Elgit4/PCG_Missions/actions/runs/42588602409): **178 database assertions across six files**, plus Edge Function formatting, linting, type-checks and Deno unit tests for public-content, staff-session, staff-operations and idempotency helpers.

The new task suite validates service-role-only function execution, `SECURITY INVOKER`, idempotent creation/replay/conflict, assigned-task creation, scoped task updates, status transitions, completion timestamps and append-only event history (UPDATE/DELETE/TRUNCATE rejected). CI generates temporary migration names with the Supabase CLI, applies the reviewed draft SQL only to the disposable local CMI stack, runs pgTAP and removes temporary migration/test files afterward.

PR #10 remains an open draft and is not in `main`. No role-capability grants have been seeded; R-01–R-12 and D-01 remain approval gates, and business operations therefore remain denied until approved grants are provisioned. Draft SQL has not been promoted into permanent migration history. No hosted Supabase project, production schema or Edge Function has been changed or deployed.

Supabase CLI v3 is local-first. Keep CI on the isolated `supabase-cmi/` workspace and do not add `--remote` or hosted credentials without explicit deployment approval.


The event registration and public-profile E.164 constraints were corrected to match the single-plus international format. Three pgTAP cases cover valid +233 phone values, missing international plus and an invalid literal backslash prefix. The latest head, including schema restoration and qualified pgTAP calls, passed in [run 42447736530](https://github.com/Elgit4/PCG_Missions/actions/runs/42447736530): 104 database assertions total.


## Next-stage design — event transaction API contract

The proposed transactional contract is documented in [document 17](../docs/17_EVENT_TRANSACTION_API_CONTRACT.md). It defines public/staff registration, serialized event-capacity checks, transport-seat reservation, check-in, closeout, idempotency, authorization boundaries and concurrency/security tests.

The contract's idempotency digest/receipt requirement is now represented by the PR #8 ledger and tested canonicalization/HMAC helper. PR #7 added database enforcement for check-in registration/contact consistency and append-only closeout history. The consent-evidence relation and rule for multiple active transport options remain unresolved. No write endpoints or role grants have been activated. Implementation remains blocked by D-05, D-06, D-13 and applicable R-01–R-12/D-01 approvals.


## Event integrity hardening — 2026-11-08

PR #7 adds database-level protections for two event invariants:
- A check-in containing both registration and contact references must match the canonical contact linked to that registration in the same event and branch. The guard applies to inserts and relevant updates.
- Closeout history is append-only; UPDATE, DELETE and TRUNCATE are rejected while inserts remain available for a future authorized transaction path.

At the PR #7 milestone, the event-domain suite had **53 assertions**. The latest PR #7 head, `29588a1c6c579b4ffbc9d2635b662d2111f18c31`, passed **112 database assertions across four suites** plus Deno checks in [CI run 42448742945](https://github.com/Elgit4/PCG_Missions/actions/runs/42448742945). PR #8 subsequently expanded the event/idempotency suite to 71 assertions.

These protections remain source-only; no hosted database or production migration was changed. Stakeholder approval, including D-13 retention governance, is still required before production use.


## Event idempotency ledger — 2026-11-08

The ledger design and schema are included in [PR #8](https://github.com/Elgit4/PCG_Missions/pull/8). It adds a private `event_idempotency_receipt` relation to the event schema. The ledger scopes keys by event, branch, operation, caller class and, for staff, server-resolved actor. PostgreSQL 15+ `UNIQUE NULLS NOT DISTINCT` also makes public requests with NULL actor IDs unique within the same operation scope.

Each receipt stores a 32-byte versioned HMAC-SHA-256 request digest, an allowlisted operation/resource pairing, a resource reference and successful response status. It stores no raw request body or attendee PII. The Deno helper canonicalizes normalized JSON, computes the HMAC with a server-only key, and compares digest hex values; endpoint code must still implement atomic receipt claim, replay response and HTTP 409 changed-payload behavior. HMAC key retirement and receipt cleanup remain subject to D-13 retention approval.

The event pgTAP suite has **71 assertions**, including the trigger-function privilege-closure test. Together with 14 identity/authorization, 24 contacts/follow-up and 20 restricted-pastoral assertions, the verified total is **129 database assertions**. PR #8's exact head `c80a29a46a8a693449d66b209c84e2ba6894209a` passed [CI run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750); PR #8 is merged to `main` as [d091a894](https://github.com/Elgit4/PCG_Missions/commit/d091a89404165d11e96949b5aa7d35a646a89db8). No event mutation endpoint, private transaction function, role grant, hosted Supabase project or production migration is activated.
