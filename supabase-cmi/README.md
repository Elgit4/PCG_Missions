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

## Hosted production status — verified 12 November 2026

The connected production project `cgwffpxlwgbnlinzwfoj` has 16 ordered migrations, 50 public tables with RLS enabled, 61 active capability catalogue entries and 65 active role-capability grants across six roles. PR #42 is deployed and the staff UI exposes Overview, Contacts, Follow-up, Events, Calendar, Announcements, Visitor Content, Staff and Access Requests. The contact-detail dialog supports ordinary notes and call/visit/message interaction history.

Ten Edge Function entries are active, including the retired `pcg-first-admin-once` endpoint which responds HTTP 410. The production event, calendar, announcement and content functions permit private draft operations only. The `pastoral-operations` function remains undeployed pending the independent security review.

**Known production configuration faults:** contact capture returns `IDEMPOTENCY_NOT_CONFIGURED` / HTTP 503 if `CMI_CONTACT_IDEMPOTENCY_HMAC_KEY` is absent/too short or its version setting is invalid; follow-up task creation requires its own `CMI_FOLLOWUP_IDEMPOTENCY_HMAC_KEY`. Configure both as strong Supabase Edge Function secrets, not in source control or frontend variables. The available connector session cannot set these secrets.

The current Resend sender is `onboarding@resend.dev`, a test-domain sender. A verified sender domain and updated `CMI_AUTH_EMAIL_FROM` are required before staff invitation and recovery delivery are production-ready. One active staff account was created during an invitation attempt that failed email delivery; do not recreate it.

The working branch `feat/admin-operational-modules-and-hardening` contains the new draft-management UI, API/time-zone tests and a seven-grant Admin/Pastor-only branch-scoped migration. These changes are pending CI, review, merge and migration application; they are not yet production functionality. Public registration, event capacity, transport, attendance/check-in, closeout, publishing, team management, reports/exports, pastoral mutations, SMS dispatch and offline mode remain gated or incomplete. SMS remains disabled while provider approval is pending.

## Current source layout

- `supabase/migrations/`: ordered permanent CMI migrations for the identity foundation, contacts/follow-up, restricted pastoral records, events/attendance/public content, capability catalogue, trusted follow-up/pastoral operations, staff access/auth lifecycle, visitor authorization and hosted RLS-helper privilege remediation.
- `supabase/tests/`: foundation pgTAP suite; the backend CI stages matching domain pgTAP suites from `schema-drafts/` before running the complete migration/test sequence.
- `schema-drafts/`: retained as reviewable source copies and test fixtures. The SQL now has matching permanent migration files; do not create temporary duplicate migrations in CI.

### Domain schema sources

1. `contacts_followup_domain.sql` and matching test.
2. `restricted_pastoral_domain.sql` and matching test.
3. `events_attendance_public_content.sql` and matching test.
4. `backend_capability_catalogue.sql` and matching security test; it seeds capability metadata only. The owner-directed visitor MVP authorization baseline in PR #38 seeds 55 ordinary visitor/follow-up grants plus three sensitive read grants (58 total).

The third slice covers event lifecycle, typed event staff/team assignments, registration, transport, check-in, closeout, typed calendar scope, typed announcement audiences, church public profile, welcome messages, sermons, daily word, digital tracts and typed external document links.

All domain drafts preserve branch-consistent foreign keys, RLS and closed browser grants. No client table policies are created. The visitor MVP authorization baseline is updated by PR #38 through a forward-only migration to 58 grants under the product-owner-directed safe-default decision record, including assigned prayer reads for Prayer Intercessor and explicit audited prayer/care oversight reads for Admin/Pastor. Phone/email identity grants are removed from Coordinator, Team Leader, Field Worker and Follow-up Volunteer; pastoral oversight, exports, SMS and capability-policy editing remain ungranted. The event draft removes the unapproved waitlist state, requires idempotency for public registrations and check-ins, and avoids polymorphic scope/audience/content references.

## Validation

The first three suites passed in [GitHub Actions run 42436473154](https://github.com/Elgit4/PCG_Missions/actions/runs/42436473154): 14 + 24 + 20 = 58 assertions. The events/attendance/public-content draft is included in the isolated local CI workflow with an expanded 46-assertion suite. The original 36 assertions passed in [run 42437731467](https://github.com/Elgit4/PCG_Missions/actions/runs/42437731467); the expanded 46 assertions and the full 104-assertion workflow passed in [run 42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140).

The current authorization/domain feature branch contains permanent ordered migration files. CI replays them on an isolated local Supabase stack and runs the pgTAP suites. These migrations are applied in the hosted production project and are also replayed on an isolated local Supabase stack in CI for reproducible validation.

## Edge Functions

The first server-side function draft is `supabase/functions/public-content/`. It provides fixed read-only projections for published sermons, daily words, tracts, welcome messages, public announcements, public events and the church public profile. It does not grant anonymous access to the underlying tables. See [Edge Function security and deployment rules](supabase/functions/README.md).

Run its input-validation tests with:

```bash
deno test supabase-cmi/supabase/functions/public-content/validation_test.ts
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and exact `PUBLIC_CONTENT_ALLOWED_ORIGINS` only in the Edge Function's server environment. The service-role key bypasses RLS; the function's fixed query allowlist is therefore security-critical. It exposes only church-wide welcome messages and omits event capacity from public event responses. Do not reuse it for staff operations. Platform rate limiting and production origin configuration are required before deployment. At the PR #5 milestone, Deno type-check and request-validation tests passed in [run 42438088374](https://github.com/Elgit4/PCG_Missions/actions/runs/42438088374) and the expanded event/public-content suite contributed to 104 database assertions in [run 42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140). Those are historical validation checkpoints; the later PR #8 exact-head run [42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750) passed the current 129-assertion total and current Deno checks. This fixed read-only public-content function is deployed in the connected production project; its projections remain allowlisted and must not expose underlying staff or private tables.

## Event draft operations (merged to main in PR #15)

The `event-operations` Edge Function adds branch-scoped list/detail and private-draft create/edit endpoints. Event mutations require `event.manage.scoped` with branch scope; reads require `event.read.scoped` with branch scope or a current direct staff event assignment.

New events are always created as private drafts with registration closed. The API does not accept capacity, publication, assignment, registration, transport, check-in or closeout fields. It therefore does not implement the decision-gated event transactions in document 17.

See [document 20 — Event Draft Operations API Contract](../docs/20_EVENT_DRAFT_OPERATIONS_API_CONTRACT.md). The `event-operations` function is active in production for restricted branch-scoped private event draft operations. It does not implement public registration, transactional capacity, transport, attendance/check-in or closeout workflows.

## Announcement draft operations (merged to main in PR #16)

The `announcement-operations` Edge Function provides branch-scoped draft list/detail, create and creator-only edit operations. New announcements are forced to private draft state; publication flags, scheduling, audience links and all delivery channels are excluded.

See [document 21 — Announcement Draft Operations API Contract](../docs/21_ANNOUNCEMENT_DRAFT_OPERATIONS_API_CONTRACT.md). The `announcement-operations` function is active in production for private draft list/detail/create/edit operations; publication and message delivery remain outside its contract. The API continues to fail closed unless the caller has the required branch-scoped capability.

## Visitor content draft operations (merged to main in PR #16)

The `content-operations` Edge Function implements branch-scoped draft list/detail, create and creator-only edit for sermons and welcome messages. It requires `content.manage.draft` with explicit branch scope and only exposes the authenticated user's own drafts. Publication fields remain server-controlled and every new record is a private draft.

Daily Word, Digital Tracts and church-wide public profile editing are excluded until their global authoring scope and approval rules are defined under D-02. Publishing remains a separate restricted capability and is not enabled. See [document 22 — Visitor Content Draft Operations API Contract](../docs/22_VISITOR_CONTENT_DRAFT_OPERATIONS_API_CONTRACT.md). The `content-operations` function is active in production for restricted sermon and welcome-message draft operations. Daily Word, Digital Tracts, church-wide profile editing and publication remain separate capabilities and are not enabled by this endpoint.

## Branch calendar operations (merged to main in PR #16)

The `calendar-operations` Edge Function provides branch-scoped list/detail/create/update for `calendar_entry`. It requires `calendar.read.scoped` or `calendar.manage.scoped` with explicit branch scope. New rows are forced to `scope_type='branch'`; caller-supplied scope and identity fields are rejected. Team/event/own scopes, `followup` and `prayer_schedule` entry types, and deletion are excluded.

See [document 23 — Branch Calendar Operations API Contract](../docs/23_BRANCH_CALENDAR_OPERATIONS_API_CONTRACT.md). The `calendar-operations` function is active in production for branch-scoped calendar entry operations and continues to enforce the `calendar.read.scoped` or `calendar.manage.scoped` capability.

## Staff API (merged to main)

PR #10 merged the `feat/cmi-staff-session-api` implementation into `main` on 2026-11-09 (merge commit `5487debe93b9a556bfa9fc70d21a6131204682bd`). The merged source provides the initial server API for frontend integration:
- `staff-session`: validates a Supabase Auth access token, checks the active staff profile and returns branch, role and approved capability projections.
- `staff-operations`: scoped contact list/detail, idempotent contact capture and ordinary-field update endpoints.
- The same Edge Function now provides scoped follow-up task list/detail, idempotent creation and atomic note/priority/due-date/status updates. It never changes assignment targets through PATCH.
- The role/capability catalogue originally contained 58 visitor/follow-up grants; PR #42 added seven private-draft grants (65 production grants), and the pending team/area migration adds two Admin/Pastor-only grants for a target source total of 67. First-admin bootstrap creates the initial church, branch, staff profile and Admin/Pastor branch assignment; it does not create arbitrary role grants or enable SMS, exports or capability-policy editing. Effective capabilities come from the reviewed role-capability matrix and remain scope-checked by the server.
- Phone/email capture, read and update use separate identity capabilities. Without the appropriate grant, identity fields are not returned.
- Team-scoped capture requires active team membership. Assigned-only capture creates an assignment to the capturing staff member in the same transaction.

Task creation uses a separate HMAC idempotency key and exactly one primary assignment target (staff member or team). Branch/team/assigned/self scope is evaluated on the server. Task updates append lifecycle events atomically; event history is protected against update, delete and truncate.

See [the Staff API Contract](../docs/19_CMI_STAFF_API_CONTRACT.md). `staff-session`, `staff-operations`, `staff-access-operations` and `staff-auth` are active in production. Contact and follow-up operations are implemented behind trusted server-side authorization; event/content/calendar functions currently provide restricted draft workflows only.

## Security and approval gates

- Auth credentials stay in Supabase Auth; no PIN/password columns.
- Role-capability grants and full role/scope RLS wait for R-01–R-12 and D-01 approvals.
- Prayer/care narratives remain unavailable through direct browser reads. Audited individual-record reads are now being implemented on `feat/cmi-audited-pastoral-reads`; no list or mutation endpoints are included.
- Public registration and public content require narrow server-mediated projections; no base-table public grants.
- Registration snapshot retention, walk-in identity, event waitlist, transport pickup model and data retention remain decision-gated.
- SMS uses one future canonical outbox/campaign state machine; announcement delivery must not duplicate SMS lifecycle state.
- The connected hosted Supabase project is live; see `IMPLEMENTATION_STATUS.md` for the current production snapshot.

See `IMPLEMENTATION_STATUS.md` and `../docs/16_CMI_SCHEMA_RECONCILIATION_AND_DECISION_CROSSWALK.md` for detailed status and design gates.


The event schema's attendee and public-profile phone constraints use the correct single-plus E.164 expression. Tests verify a valid +233 value, reject a number without the international plus and reject a literal backslash prefix. The 104-assertion run [42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140) is an earlier PR #5 checkpoint; it was superseded by the PR #8 exact-head validation of 129 assertions in [run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750).


## Event integrity test status

At the PR #7 milestone, the event-domain suite contained **53 pgTAP assertions**, including registration/contact identity consistency on check-in and append-only closeout history protections. The latest PR #7 head passed all four database suites (**112 assertions total**) plus Deno checks in [run 42448742945](https://github.com/Elgit4/PCG_Missions/actions/runs/42448742945). PR #8 subsequently expanded the event/idempotency suite to 71 assertions. This paragraph is a historical PR #7 test milestone. The current hosted state is recorded above: the event-operations function is deployed for restricted draft operations, while public registration, capacity reservation, transport, attendance/check-in and closeout remain incomplete.


## Event idempotency ledger

The event schema draft includes a private HMAC-backed idempotency receipt ledger. Keys are scoped by event, branch, operation, caller class and (for staff) trusted actor. Receipts store only a versioned digest and resource reference, not request PII. The helper's canonical JSON serializer rejects unsafe/accessor-backed object structures and sorts Unicode-normalized keys deterministically. The reconciled migration and test suite also verify the event integrity trigger functions cannot be invoked by browser roles. PR #8 is merged to `main` as commit [d091a894](https://github.com/Elgit4/PCG_Missions/commit/d091a89404165d11e96949b5aa7d35a646a89db8); its exact head passed [CI run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750), including 129 database assertions across four suites and the Deno idempotency helper tests. This is not an active transaction endpoint or production feature.


## Historical implementation checkpoints

The milestones below document earlier successful validation runs. They are not a claim that the latest `main` CI is green.

Backend PRs #3–#19 are now merged to `main`. PR #10 merged as `5487debe93b9a556bfa9fc70d21a6131204682bd`; PR #11 merged as `edd8b155c20ffd13aa3e6b071b0e7fe342039b4b`; PR #13 merged as `b8843c2ea09561ccaf712222dccb282490126fd6`; PR #15 merged as `a6a3a8948932039d1a85666b7f49f9f7e4ed9e1c` and added branch-scoped private event-draft operations. PR #15 exact-head [CI run 42611211003](https://github.com/Elgit4/PCG_Missions/actions/runs/42611211003) passed the full workflow: 227 pgTAP assertions across seven suites and all 70 Deno unit tests.

The current PR #10 head `7ab4174ebe529279eda55a96ab4f52345aef74e3` passed [CI run 42588602409](https://github.com/Elgit4/PCG_Missions/actions/runs/42588602409). Deno formatting, linting, type-checking and unit tests passed. The workflow applied all reviewed SQL drafts using temporary CLI-generated migrations on the disposable local CMI stack; **all six pgTAP files passed, 178 assertions with zero failures**.

The three commits after the tested implementation commit changed status/contract documentation only; no executable SQL or Edge Function logic changed after the successful implementation test. The 30-assertion task suite covers scoped creation, replay/conflict, one-target assignment, separate reassignment, status transitions, archived-contact rejection, sanitized RPC projections and append-only history.

Task due dates require an explicit timezone. RPC task responses omit the internal client request key and versioned HMAC digest. All temporary migration and test copies were removed after local verification.

The hosted Supabase project has 58 explicit role-capability grants, 15 ordered migrations, 50 public tables with RLS enabled and nine active Edge Functions. No Auth users, staff profiles, church or branch records have been provisioned yet. The frontend is deployed through Vercel at https://pcg-missions.vercel.app. Bootstrap/email secrets have not been configured, so no first administrator exists. Live SMS dispatch remains disabled, and the bootstrap path sends email only.


## Audited pastoral reads — merged to main (2026-11-09)

PR #11 merged the `feat/cmi-audited-pastoral-reads` implementation into `main`, adding two read-only POST routes through `pastoral-operations`:

- `/pastoral-operations/prayer/requests/{requestId}/read`
- `/pastoral-operations/care/records/{recordId}/read`

The database RPCs independently validate the active staff profile, active branch, active role assignment, exact capability and (for assigned mode) current record assignment. Privileged oversight uses a separate `oversight` scope and one of five allowlisted reason codes. The read and append-only audit insert occur in one database transaction. Prayer responses omit the linked contact ID; care responses also omit contact identity and include at most the latest 100 restricted interactions.

Both RPCs are `SECURITY DEFINER`, pin `search_path` to `pg_catalog`, and are executable only by `service_role`. Browser table grants remain closed. The SQL remains in `schema-drafts/`, not permanent migration history. CI applies it only through temporary CLI-generated migrations on the disposable local CMI stack. PR #11's exact-head run [42594351467](https://github.com/Elgit4/PCG_Missions/actions/runs/42594351467) passed the initial 30-assertion pastoral suite (208 assertions total). Subsequent hardening expanded it to 46 assertions (224 total) in main CI run [42596909576](https://github.com/Elgit4/PCG_Missions/actions/runs/42596909576). PR #13 then added three tests for the bounded 100-interaction projection and absence of audit rows after denied reads. Its exact-head run [42600705230](https://github.com/Elgit4/PCG_Missions/actions/runs/42600705230) passed all seven pgTAP files (**227 assertions**), Deno formatting/lint/type-checks and all 58 Deno unit tests. PR #13 is merged as [b8843c2](https://github.com/Elgit4/PCG_Missions/commit/b8843c2ea09561ccaf712222dccb282490126fd6); the post-merge `main` workflow [42601107555](https://github.com/Elgit4/PCG_Missions/actions/runs/42601107555) also passed.

The owner-directed baseline grants only actively assigned prayer reads to Prayer Intercessors and separate reason-coded/audited prayer/care oversight reads to Admin/Pastor. No pastoral mutation, list, care-assignee or assignment-management capability is granted. The audited-read function remains deliberately undeployed pending independent security review; nine other Edge Functions are active in production. The production schema and 58 role-capability grants have been applied.


## Current backend readiness snapshot — 2026-11-09

- Repository: `Elgit4/PCG_Missions`; current audited `main` commit: `55a3004b84a6934efd100c7614338f3ffae58b44` (PR #19 merge).
- Latest `main` workflow run: [42671972079](https://github.com/Elgit4/PCG_Missions/actions/runs/42671972079) concluded `failure`. GitHub's jobs endpoint returned an empty job list for that run, so there is no job log or identified failing step available from the current run record. Treat `main` CI as not verified green until a new run succeeds.
- The CMI schema foundation is the only permanent CMI migration. The six domain SQL drafts and matching pgTAP suites are validated through temporary migrations on the isolated local CI stack; they are not permanent migration history.
- Source-only Edge Functions currently cover public-content projections, staff session/operations, pastoral audited reads, private event drafts, announcement drafts, sermon/welcome drafts and branch calendar operations.
- PR #38 implements the product-owner-directed safe-default baseline: 58 explicit grants, lower-role phone/email redaction, assigned-only intercessor reads and reason-coded/audited Admin/Pastor oversight reads. Church stakeholders may later amend the defaults through change control. SMS dispatch, exports, offline operation and public registration remain disabled; pastoral oversight requires independent security review before deployment with real records.
- Complete prayer/care mutation workflows, event registration/capacity/transport/check-in transactions, reporting and role-scoped event workflows remain incomplete. Offline sync and live SMS dispatch are intentionally disabled by the selected baseline.
- The frontend is maintained in `web/` and deployed via Vercel. Production has 15 migrations, 50 RLS-enabled public tables and nine active Edge Functions. No staff Auth accounts, church/branch records or first administrator are provisioned yet.

The next unblocked engineering step is to restore a verifiable green CMI CI run and keep documentation aligned. Feature work requiring the outstanding church policy decisions must remain blocked until those decisions are recorded.


## Staff access lifecycle — source branch

The staff-access-operations Edge Function implements guarded role assignment, role revocation, staff account deactivation and reactivation. The staff-auth function also exposes administrator-only staff account creation, backed by `cmi_create_staff_account`, which verifies branch-scoped staff-account and role-assignment capabilities before creating a profile, assigning one of the six roles and writing an access-audit record. New staff receive a one-time temporary credential by email and must replace it at first sign-in. See document 24.

The current authentication slice implements Supabase email/password sign-in, one-time temporary-password bootstrap, Admin/Pastor-created staff accounts, forced first-login password replacement and administrator-reviewed temporary-password recovery. The product owner confirmed email/password on 10 November 2026; the earlier PIN proposal is superseded. Production email configuration, first-admin recovery review, staging validation and deployment remain outstanding.


## Requirements-driven engineering baseline

See [document 25](../docs/25_CMI_REQUIREMENTS_DRIVEN_ENGINEERING_BASELINE.md) and [document 31](../docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md) for the selected owner-directed defaults. Do not activate SMS dispatch, exports, offline sync or privileged pastoral access until their implementation and compliance gates pass.


## Frontend integration contract

See [document 26](../docs/26_CMI_FRONTEND_INTEGRATION_HANDOFF.md) before implementing the PWA. It distinguishes source-controlled APIs from deployed services, lists exact function names and route families, documents the common bearer/publishable-key headers and identifies policy-gated screens. The current capability grant table is empty; the frontend must treat an empty capability projection as no business access.

## SMS provider adapter

A provider-specific, server-only Hubtel Business SMS adapter is available at `supabase/functions/_shared/sms/hubtel.ts`. It uses the documented business POST API and status lookup, requires an explicit live-enable flag, and refuses automatic retry after an ambiguous send outcome to avoid duplicate messages. Unit tests mock the network. It is not an Edge Function endpoint and is not connected to an outbox/dispatcher yet.

Read the [Hubtel SMS setup runbook](supabase/functions/_shared/sms/README.md). Do not configure live secrets, enable live dispatch, deploy or send messages until the D-09/D-10/D-11 and R-06–R-09 approvals, consent/suppression, campaign controls, budget controls and deployment authorization are complete.
