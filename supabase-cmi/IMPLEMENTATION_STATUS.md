# CMI backend implementation status

**Baseline:** CMI Follow-up v2.1  
**Workspace:** `supabase-cmi/` (isolated from historical `supabase/`)  
**Status:** Identity, contacts/follow-up, restricted-pastoral and events/attendance/public-content schema suites have passed isolated local CMI validation. The public-content Edge Function source, Deno type-check and request-validation tests pass. The current PR #5 head passed the complete isolated CI workflow, including 104 pgTAP assertions, in [run 42447736530](https://github.com/Elgit4/PCG_Missions/actions/runs/42447736530). The function is not deployed.

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

A Deno validation suite covers supported resources, pagination, slug validation, unknown and duplicate query parameters, inherited object-property resource names, and public-profile request shape. CI runs that suite before the local Supabase database suite. Deno type-check and request-validation tests passed in [run 42438088374](https://github.com/Elgit4/PCG_Missions/actions/runs/42438088374) and again on the latest head in [run 42447736530](https://github.com/Elgit4/PCG_Missions/actions/runs/42447736530). The latest workflow also passed all 104 database assertions.

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

The 58 foundation assertions and the expanded 46 event/public-content assertions have passed on isolated local CMI stacks. The current PR #5 head also passed Deno type-checking, request-validation tests and the full database workflow (104 pgTAP assertions total) in [run 42447736530](https://github.com/Elgit4/PCG_Missions/actions/runs/42447736530). No hosted Supabase project was linked, queried, migrated or modified; no real visitor/prayer data or live SMS was used.

Supabase CLI v3 is local-first. Keep CI on the isolated `supabase-cmi/` workspace and do not add `--remote` or hosted credentials without explicit deployment approval.


The event registration and public-profile E.164 constraints were corrected to match the single-plus international format. Three pgTAP cases cover valid +233 phone values, missing international plus and an invalid literal backslash prefix. The latest head, including schema restoration and qualified pgTAP calls, passed in [run 42447736530](https://github.com/Elgit4/PCG_Missions/actions/runs/42447736530): 104 database assertions total.


## Next-stage design — event transaction API contract

The proposed transactional contract is documented in [document 17](../docs/17_EVENT_TRANSACTION_API_CONTRACT.md). It defines public/staff registration, serialized event-capacity checks, transport-seat reservation, check-in, closeout, idempotency, authorization boundaries and concurrency/security tests.

The contract identifies schema corrections required before implementation: idempotency request digest; consent evidence relation; check-in registration/contact identity consistency; database-level closeout history immutability; and an approved rule for multiple active transport options. No write endpoints or role grants have been activated. Implementation remains blocked by D-05, D-06, D-13 and applicable R-01–R-12/D-01 approvals.


## Event integrity hardening — 2026-11-08

PR #7 adds database-level protections for two event invariants:
- A check-in containing both registration and contact references must match the canonical contact linked to that registration in the same event and branch. The guard applies to inserts and relevant updates.
- Closeout history is append-only; UPDATE, DELETE and TRUNCATE are rejected while inserts remain available for a future authorized transaction path.

The event-domain pgTAP suite now has **53 assertions**. The full isolated CMI workflow passed **111 database assertions across four suites**, plus Deno type-check and public-content request-validation tests, on PR #7 head `45be0c2563cdc827a56748eac3ee4580f802b54b` in [CI run 42441280069](https://github.com/Elgit4/PCG_Missions/actions/runs/42441280069).

These protections remain source-only; no hosted database or production migration was changed. Stakeholder approval, including D-13 retention governance, is still required before production use.


## Event idempotency ledger — 2026-11-08

The ledger design and schema are included in [PR #8](https://github.com/Elgit4/PCG_Missions/pull/8). It adds a private `event_idempotency_receipt` relation to the event schema. The ledger scopes keys by event, branch, operation, caller class and, for staff, server-resolved actor. PostgreSQL 15+ `UNIQUE NULLS NOT DISTINCT` also makes public requests with NULL actor IDs unique within the same operation scope.

Each receipt stores a 32-byte versioned HMAC-SHA-256 request digest, an allowlisted operation/resource pairing, a resource reference and successful response status. It stores no raw request body or attendee PII. The Deno helper canonicalizes normalized JSON, computes the HMAC with a server-only key, and compares digest hex values; endpoint code must still implement atomic receipt claim, replay response and HTTP 409 changed-payload behavior. HMAC key retirement and receipt cleanup remain subject to D-13 retention approval.

The event pgTAP suite now has **71 assertions** after adding an explicit check that trigger-only integrity functions are not executable by browser roles. With 14 foundation, 24 contacts/follow-up, 20 restricted-pastoral and 71 event/idempotency assertions, the expected full total is **129 database assertions**. Current reconciled PR #8 CI is pending. No event mutation endpoint, private transaction function, role grant, hosted Supabase project or production migration is activated.
