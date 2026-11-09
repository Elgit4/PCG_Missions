# CMI Follow-up backend workspace

This directory is the isolated Supabase CLI project root for the CMI Follow-up v2.1 backend. The CLI configuration and executable files live under `supabase-cmi/supabase/`.

## Critical migration boundary

The repository's top-level `supabase/` directory contains historical ChurchConnect migrations and tests for a two-role product. They are **not** the CMI schema. Never run CMI CLI commands against that directory.

Use this workspace explicitly:

```bash
supabase --workdir supabase-cmi --help
supabase --workdir supabase-cmi start
supabase --workdir supabase-cmi status
supabase --workdir supabase-cmi db reset
supabase --workdir supabase-cmi test db
```

Supabase CLI v3 is local-first. Do not add `--remote`, hosted credentials or `--yes` for a hosted mutation without explicit approval.

## Current source layout

- `supabase/migrations/`: permanent CMI identity/authorization foundation migration only.
- `supabase/tests/`: foundation pgTAP suite.
- `schema-drafts/`: reviewable domain SQL and pgTAP drafts, not yet permanent migration history. The capability catalogue/contact-capture and follow-up task transactions are also validated from this workspace.

### Domain drafts

1. `contacts_followup_domain.sql` and matching test.
2. `restricted_pastoral_domain.sql` and matching test.
3. `events_attendance_public_content.sql` and matching test.
4. `backend_capability_catalogue.sql` and matching security test; it seeds capability metadata only and does not create role grants.

The third slice covers event lifecycle, typed event staff/team assignments, registration, transport, check-in, closeout, typed calendar scope, typed announcement audiences, church public profile, welcome messages, sermons, daily word, digital tracts and typed external document links.

All domain drafts preserve branch-consistent foreign keys, RLS and closed browser grants. No client policies or role-capability grants are created while stakeholder approvals remain pending. The event draft removes the unapproved waitlist state, requires idempotency for public registrations and check-ins, and avoids polymorphic scope/audience/content references.

## Validation

The first three suites passed in [GitHub Actions run 42436473154](https://github.com/Elgit4/PCG_Missions/actions/runs/42436473154): 14 + 24 + 20 = 58 assertions. The events/attendance/public-content draft is included in the isolated local CI workflow with an expanded 46-assertion suite. The original 36 assertions passed in [run 42437731467](https://github.com/Elgit4/PCG_Missions/actions/runs/42437731467); the expanded 46 assertions and the full 104-assertion workflow passed in [run 42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140).

CI generates temporary migration filenames using `supabase migration new`, copies the drafts into the isolated CLI project, applies them locally, runs pgTAP, then removes the temporary files. Draft SQL is not yet promoted to permanent migrations.

## Edge Functions

The first server-side function draft is `supabase/functions/public-content/`. It provides fixed read-only projections for published sermons, daily words, tracts, welcome messages, public announcements, public events and the church public profile. It does not grant anonymous access to the underlying tables. See [Edge Function security and deployment rules](supabase/functions/README.md).

Run its input-validation tests with:

```bash
deno test supabase-cmi/supabase/functions/public-content/validation_test.ts
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and exact `PUBLIC_CONTENT_ALLOWED_ORIGINS` only in the Edge Function's server environment. The service-role key bypasses RLS; the function's fixed query allowlist is therefore security-critical. It exposes only church-wide welcome messages and omits event capacity from public event responses. Do not reuse it for staff operations. Platform rate limiting and production origin configuration are required before deployment. At the PR #5 milestone, Deno type-check and request-validation tests passed in [run 42438088374](https://github.com/Elgit4/PCG_Missions/actions/runs/42438088374) and the expanded event/public-content suite contributed to 104 database assertions in [run 42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140). Those are historical validation checkpoints; the later PR #8 exact-head run [42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750) passed the current 129-assertion total and current Deno checks. This function is not deployed.

## Event draft operations (merged to main in PR #15)

The `event-operations` Edge Function adds branch-scoped list/detail and private-draft create/edit endpoints. Event mutations require `event.manage.scoped` with branch scope; reads require `event.read.scoped` with branch scope or a current direct staff event assignment.

New events are always created as private drafts with registration closed. The API does not accept capacity, publication, assignment, registration, transport, check-in or closeout fields. It therefore does not implement the decision-gated event transactions in document 17.

See [document 20 — Event Draft Operations API Contract](../docs/20_EVENT_DRAFT_OPERATIONS_API_CONTRACT.md). The function is source-only and remains inaccessible until approved capability grants are provisioned. It has not been deployed.

## Announcement draft operations (merged to main in PR #16)

The `announcement-operations` Edge Function provides branch-scoped draft list/detail, create and creator-only edit operations. New announcements are forced to private draft state; publication flags, scheduling, audience links and all delivery channels are excluded.

See [document 21 — Announcement Draft Operations API Contract](../docs/21_ANNOUNCEMENT_DRAFT_OPERATIONS_API_CONTRACT.md). No role grants are seeded, so the API stays fail-closed until the applicable church decisions are approved. It has not been deployed.

## Visitor content draft operations (merged to main in PR #16)

The `content-operations` Edge Function implements branch-scoped draft list/detail, create and creator-only edit for sermons and welcome messages. It requires `content.manage.draft` with explicit branch scope and only exposes the authenticated user's own drafts. Publication fields remain server-controlled and every new record is a private draft.

Daily Word, Digital Tracts and church-wide public profile editing are excluded until their global authoring scope and approval rules are defined under D-02. Publishing remains a separate restricted capability and is not enabled. See [document 22 — Visitor Content Draft Operations API Contract](../docs/22_VISITOR_CONTENT_DRAFT_OPERATIONS_API_CONTRACT.md). No role grants are seeded and the function has not been deployed.

## Branch calendar operations (merged to main in PR #16)

The `calendar-operations` Edge Function provides branch-scoped list/detail/create/update for `calendar_entry`. It requires `calendar.read.scoped` or `calendar.manage.scoped` with explicit branch scope. New rows are forced to `scope_type='branch'`; caller-supplied scope and identity fields are rejected. Team/event/own scopes, `followup` and `prayer_schedule` entry types, and deletion are excluded.

See [document 23 — Branch Calendar Operations API Contract](../docs/23_BRANCH_CALENDAR_OPERATIONS_API_CONTRACT.md). No role grants are seeded; the function has not been deployed.

## Staff API (merged to main)

PR #10 merged the `feat/cmi-staff-session-api` implementation into `main` on 2026-11-09 (merge commit `5487debe93b9a556bfa9fc70d21a6131204682bd`). The merged source provides the initial server API for frontend integration:
- `staff-session`: validates a Supabase Auth access token, checks the active staff profile and returns branch, role and approved capability projections.
- `staff-operations`: scoped contact list/detail, idempotent contact capture and ordinary-field update endpoints.
- The same Edge Function now provides scoped follow-up task list/detail, idempotent creation and atomic note/priority/due-date/status updates. It never changes assignment targets through PATCH.
- Capability definitions are seeded as metadata only. `role_capability` remains empty until R-01–R-12 and D-01 are approved.
- Phone/email capture, read and update use separate identity capabilities. Without the appropriate grant, identity fields are not returned.
- Team-scoped capture requires active team membership. Assigned-only capture creates an assignment to the capturing staff member in the same transaction.

Task creation uses a separate HMAC idempotency key and exactly one primary assignment target (staff member or team). Branch/team/assigned/self scope is evaluated on the server. Task updates append lifecycle events atomically; event history is protected against update, delete and truncate.

See [the Staff API Contract](../docs/19_CMI_STAFF_API_CONTRACT.md). These functions and their capability/contact/follow-up task transaction drafts are source-controlled but have not been deployed or applied to a hosted database.

## Security and approval gates

- Auth credentials stay in Supabase Auth; no PIN/password columns.
- Role-capability grants and full role/scope RLS wait for R-01–R-12 and D-01 approvals.
- Prayer/care narratives remain unavailable through direct browser reads. Audited individual-record reads are now being implemented on `feat/cmi-audited-pastoral-reads`; no list or mutation endpoints are included.
- Public registration and public content require narrow server-mediated projections; no base-table public grants.
- Registration snapshot retention, walk-in identity, event waitlist, transport pickup model and data retention remain decision-gated.
- SMS uses one future canonical outbox/campaign state machine; announcement delivery must not duplicate SMS lifecycle state.
- No hosted Supabase project has been linked or modified.

See `IMPLEMENTATION_STATUS.md` and `../docs/16_CMI_SCHEMA_RECONCILIATION_AND_DECISION_CROSSWALK.md` for detailed status and design gates.


The event schema's attendee and public-profile phone constraints use the correct single-plus E.164 expression. Tests verify a valid +233 value, reject a number without the international plus and reject a literal backslash prefix. The 104-assertion run [42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140) is an earlier PR #5 checkpoint; it was superseded by the PR #8 exact-head validation of 129 assertions in [run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750).


## Event integrity test status

At the PR #7 milestone, the event-domain suite contained **53 pgTAP assertions**, including registration/contact identity consistency on check-in and append-only closeout history protections. The latest PR #7 head passed all four database suites (**112 assertions total**) plus Deno checks in [run 42448742945](https://github.com/Elgit4/PCG_Missions/actions/runs/42448742945). PR #8 subsequently expanded the event/idempotency suite to 71 assertions. These changes are source-control only; they are not deployed and no hosted project was changed.


## Event idempotency ledger

The event schema draft includes a private HMAC-backed idempotency receipt ledger. Keys are scoped by event, branch, operation, caller class and (for staff) trusted actor. Receipts store only a versioned digest and resource reference, not request PII. The helper's canonical JSON serializer rejects unsafe/accessor-backed object structures and sorts Unicode-normalized keys deterministically. The reconciled migration and test suite also verify the event integrity trigger functions cannot be invoked by browser roles. PR #8 is merged to `main` as commit [d091a894](https://github.com/Elgit4/PCG_Missions/commit/d091a89404165d11e96949b5aa7d35a646a89db8); its exact head passed [CI run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750), including 129 database assertions across four suites and the Deno idempotency helper tests. This is not an active transaction endpoint or production feature.


## Historical implementation checkpoints

The milestones below document earlier successful validation runs. They are not a claim that the latest `main` CI is green.

Backend PRs #3–#19 are now merged to `main`. PR #10 merged as `5487debe93b9a556bfa9fc70d21a6131204682bd`; PR #11 merged as `edd8b155c20ffd13aa3e6b071b0e7fe342039b4b`; PR #13 merged as `b8843c2ea09561ccaf712222dccb282490126fd6`; PR #15 merged as `a6a3a8948932039d1a85666b7f49f9f7e4ed9e1c` and added branch-scoped private event-draft operations. PR #15 exact-head [CI run 42611211003](https://github.com/Elgit4/PCG_Missions/actions/runs/42611211003) passed the full workflow: 227 pgTAP assertions across seven suites and all 70 Deno unit tests.

The current PR #10 head `7ab4174ebe529279eda55a96ab4f52345aef74e3` passed [CI run 42588602409](https://github.com/Elgit4/PCG_Missions/actions/runs/42588602409). Deno formatting, linting, type-checking and unit tests passed. The workflow applied all reviewed SQL drafts using temporary CLI-generated migrations on the disposable local CMI stack; **all six pgTAP files passed, 178 assertions with zero failures**.

The three commits after the tested implementation commit changed status/contract documentation only; no executable SQL or Edge Function logic changed after the successful implementation test. The 30-assertion task suite covers scoped creation, replay/conflict, one-target assignment, separate reassignment, status transitions, archived-contact rejection, sanitized RPC projections and append-only history.

Task due dates require an explicit timezone. RPC task responses omit the internal client request key and versioned HMAC digest. All temporary migration and test copies were removed after local verification.

No `role_capability` rows are seeded; business access remains denied until R-01–R-12 and D-01 are approved. No hosted CMI project has been linked, queried, migrated or modified; no Edge Function has been deployed and no SMS has been sent.


## Audited pastoral reads — merged to main (2026-11-09)

PR #11 merged the `feat/cmi-audited-pastoral-reads` implementation into `main`, adding two read-only POST routes through `pastoral-operations`:

- `/pastoral-operations/prayer/requests/{requestId}/read`
- `/pastoral-operations/care/records/{recordId}/read`

The database RPCs independently validate the active staff profile, active branch, active role assignment, exact capability and (for assigned mode) current record assignment. Privileged oversight uses a separate `oversight` scope and one of five allowlisted reason codes. The read and append-only audit insert occur in one database transaction. Prayer responses omit the linked contact ID; care responses also omit contact identity and include at most the latest 100 restricted interactions.

Both RPCs are `SECURITY DEFINER`, pin `search_path` to `pg_catalog`, and are executable only by `service_role`. Browser table grants remain closed. The SQL remains in `schema-drafts/`, not permanent migration history. CI applies it only through temporary CLI-generated migrations on the disposable local CMI stack. PR #11's exact-head run [42594351467](https://github.com/Elgit4/PCG_Missions/actions/runs/42594351467) passed the initial 30-assertion pastoral suite (208 assertions total). Subsequent hardening expanded it to 46 assertions (224 total) in main CI run [42596909576](https://github.com/Elgit4/PCG_Missions/actions/runs/42596909576). PR #13 then added three tests for the bounded 100-interaction projection and absence of audit rows after denied reads. Its exact-head run [42600705230](https://github.com/Elgit4/PCG_Missions/actions/runs/42600705230) passed all seven pgTAP files (**227 assertions**), Deno formatting/lint/type-checks and all 58 Deno unit tests. PR #13 is merged as [b8843c2](https://github.com/Elgit4/PCG_Missions/commit/b8843c2ea09561ccaf712222dccb282490126fd6); the post-merge `main` workflow [42601107555](https://github.com/Elgit4/PCG_Missions/actions/runs/42601107555) also passed.

No role-capability grants are seeded. R-01, R-10, R-11 and D-07 remain pending; these reads remain denied for actual staff until decisions are approved and the approved grants are provisioned. No create, list, update, assignment, archive, delete or retention endpoints are included. The functions remain undeployed; nothing has been applied to a hosted Supabase project.


## Current backend readiness snapshot — 2026-11-09

- Repository: `Elgit4/PCG_Missions`; current audited `main` commit: `55a3004b84a6934efd100c7614338f3ffae58b44` (PR #19 merge).
- Latest `main` workflow run: [42671972079](https://github.com/Elgit4/PCG_Missions/actions/runs/42671972079) concluded `failure`. GitHub's jobs endpoint returned an empty job list for that run, so there is no job log or identified failing step available from the current run record. Treat `main` CI as not verified green until a new run succeeds.
- The CMI schema foundation is the only permanent CMI migration. The six domain SQL drafts and matching pgTAP suites are validated through temporary migrations on the isolated local CI stack; they are not permanent migration history.
- Source-only Edge Functions currently cover public-content projections, staff session/operations, pastoral audited reads, private event drafts, announcement drafts, sermon/welcome drafts and branch calendar operations.
- No role-capability grants are seeded. R-01–R-12, D-01–D-13 and authentication/SMS/offline/audit approvals remain pending. Do not infer access rules or activate messaging.
- Staff invitation/activation and private PIN lifecycle, complete prayer/care management, event registration/capacity/transport/check-in transactions, reporting, offline sync and SMS dispatch remain incomplete or approval-gated.
- No frontend application is present in `main`; no hosted Supabase project has been linked or modified; no production migration or Edge Function has been deployed.

The next unblocked engineering step is to restore a verifiable green CMI CI run and keep documentation aligned. Feature work requiring the outstanding church policy decisions must remain blocked until those decisions are recorded.


## Staff access lifecycle — source branch

The staff-access-operations Edge Function implements guarded role assignment, role revocation, staff account deactivation and reactivation. It requires access.role.assign or staff.account.manage with branch scope and delegates final checks/writes to service-role-only SECURITY DEFINER RPCs. The append-only staff_access_audit table records role and account-state changes. No role grants are seeded, so these operations fail closed until the church approves R-01–R-12 and D-01 and approved grants are provisioned. See document 24.

The email+PIN lifecycle, invitation/activation, private PIN setup, reset/reissue and recovery remain unimplemented because document 11 explicitly leaves the credential lifecycle and PIN security parameters pending and document 16 prohibits implementing a PIN verifier before approval/security review. No hosted Auth or database changes are made by this source-only branch.


## Requirements-driven engineering baseline

See [document 25](../docs/25_CMI_REQUIREMENTS_DRIVEN_ENGINEERING_BASELINE.md) for the source-traced decisions governing authentication, authorization, SMS, offline boundaries, pastoral privacy, public access, events and retention. It distinguishes selected technical defaults from church-policy approvals. Do not create role grants, activate SMS dispatch, implement a PIN verifier or promote policy-gated domain migrations merely because a recommendation is documented. The approval state remains in document 11.
