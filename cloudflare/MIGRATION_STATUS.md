# Cloudflare migration status

## Current implementation and validation — 2026-11-14

- Latest functional implementation commit: `7eacbf25f35e6c843b1184479bab4a2ba697f82f`; subsequent commit `12ab25b7c6996bf1e46e4d41825bbf20143030ce` updates this status document.
- Cloudflare D1 Foundation: [run 43609352440](https://github.com/Elgit4/PCG_Missions/actions/runs/43609352440) — SQLite/security suite, Worker TypeScript check, Wrangler dry-run bundle and local Worker/D1/Better Auth integration all passed.
- Frontend Worker Integration: [run 43609352489](https://github.com/Elgit4/PCG_Missions/actions/runs/43609352489) — passed.
- CMI web CI: [run 43609352441](https://github.com/Elgit4/PCG_Missions/actions/runs/43609352441) — passed.
- CMI frontend CI: [run 43609352446](https://github.com/Elgit4/PCG_Missions/actions/runs/43609352446) — passed.
- The Vercel status check still reports the account deployment build-rate limit. No new Vercel preview is claimed for this head.
- Fixed the Worker nullability failures in `listTeams` and `listServiceAreas` by retaining the narrowed active-branch value. Added a regression test for both handlers.
- Added a same-origin invitation acceptance client and staff onboarding screen. It accepts the one-time invitation token via the `?invite=` query parameter, removes the token from the browser URL immediately, validates the chosen password, and posts to `/api/v1/staff/invitations/accept` through the Worker proxy. The invitation API client and validation tests pass in the current CI. Invitation token delivery remains manual; automated invitation email is not configured.
- Administrator-approved password recovery and forced temporary-password replacement remain incomplete. The browser client deliberately fails closed rather than silently falling back to Supabase or sending an unapproved reset.
- These are pull-request validation runs. Credential validation, R2 provisioning, remote D1 migration, Worker deployment and live health checks were skipped by design. No deployment or migration was performed by this implementation pass.

## EU non-production state and external blockers

- Database: `pcg-missions-dev`, UUID `376a6782-d059-41f9-9e09-f93718fef2bb`, EU jurisdiction, primary region `EEUR`.
- Last direct read-only inspection: schema version 28, 28 migration-ledger entries, 81 application tables (82 user tables including `d1_migrations`), and no `PRAGMA foreign_key_check` violations. Migrations 0029–0031 remain pending.
- The six active role records, branch/team scopes, explicit-share-only prayer and pastoral narrative access, and append-only prayer/care/sensitive access audit protections were verified in the D1 catalog. Authenticated remote acceptance remains blocked by the empty staff identity/assignment dataset and requires the owner-approved first Admin/QA bootstrap.
- R2 remains unavailable at account level: the Cloudflare API returned error 10042 (R2 must first be enabled in the Cloudflare Dashboard). The event-media bucket was not created.
- The deployment workflow must separately confirm the scoped `CLOUDFLARE_API_TOKEN` and `BETTER_AUTH_SECRET` secrets, provision the EU R2 bucket, apply migrations 0029–0031, deploy the non-production Worker, and pass schema-31 Worker and Pages health checks. A green PR validation is not evidence that any of these remote steps occurred.
- Production Supabase, production Vercel, DNS, live accounts, SMS and email configuration remain untouched.

## Team and service-area administration — implementation update (2026-11-14)

- Ported the branch-scoped Teams & Service Areas workspace API to the Cloudflare Worker: team create/update/deactivate/reactivate; add/change-role/revoke membership; service-area create/update/deactivate/reactivate; add/revoke staff coverage; and scoped listing.
- Mutations use the authenticated Better Auth session, server-derived staff profile, selected branch and the relevant `team.manage` / `area.manage` capability. Member names and coverage names are returned only when the actor has branch-scoped `staff.directory.read`.
- Added append-only `team_management_audit` records. Migration `0031_team_area_administration_guards.sql` adds database guards for active branch/team/area, active staff membership, Team Leader role requirements, no deactivation while assignments remain, and immutable audit history.
- Added SQLite guard tests and Worker API contract tests, plus unauthenticated integration checks for team and service-area routes. The browser adapter no longer hard-blocks the team module with HTTP 501.
- The migration branch now targets schema 31. The remote EU D1 database remains schema 28; migrations 0029–0031 are all pending until the R2 provisioning preflight succeeds and the deployment workflow applies them. No authenticated browser acceptance is claimed until an approved first Admin exists.

## Event flyer media — current non-production gate (2026-11-14)

- Migration branch now contains migration `0030_event_flyer_media.sql`, the `EVENT_MEDIA` R2 binding, and the event upload/read handlers. Each event draft in the Operations workspace requires a PNG, JPEG or WebP flyer (16 bytes–5 MB); the Worker checks the actual file signature and MIME type, writes to a branch/event-scoped private object key, and only allows authorized staff to read it. Event publishing fails closed unless a flyer exists.
- Added an integration assertion that unauthenticated POST requests to the event-flyer upload route return HTTP 401 before media is accepted. Added a deployment preflight that provisions the bucket in the EU jurisdiction before applying D1 migrations or deploying the Worker; it never enables public R2 access.
- Corrected the Pages health smoke test to require schema version 31, matching the Worker health gate.
- **External account prerequisite remains:** direct Cloudflare R2 bucket-list and creation requests currently return error 10042, “Please enable R2 through the Cloudflare Dashboard.” The bucket `pcg-missions-event-media-nonprod` therefore does not yet exist and the R2 binding cannot be deployed. Enable R2 in the Cloudflare Dashboard for this account; the workflow will then create the bucket with `--jurisdiction eu` and continue. The scoped Actions token must also include R2 bucket edit permission. No image bytes are currently stored.
- The remote EU D1 database remains at schema 28 until the preflight succeeds; migrations 0029, 0030 and 0031 have not been applied remotely. The deployed Worker is therefore still the previous version without event media. Do not treat event image upload as live until the R2 bucket, schema 30 and Worker deployment gates all pass.


## Current deployment gate — 2026-11-14

- Password-change PR #62 has been squash-merged into the non-production migration branch at `38fc65dd`; the migration branch is now `145b2ea7`. The production branch was not changed.
- Signed-in staff can open the Change password dialog. The flow requires the current password, confirmation of the new password, and a 12–128 character password containing lowercase, uppercase, a number and a symbol.
- The Worker enforces the composition policy before Better Auth handles the request; Better Auth also enforces the 12–128 length bounds. The browser client applies the same policy.
- Local Worker/D1 acceptance passed in push workflow [43555094682](https://github.com/Elgit4/PCG_Missions/actions/runs/43555094682): weak passwords rejected, initiating session remains active after the refreshed cookie is used, other device session revoked, old password rejected and new password accepted. Worker type-check and bundle plus SQLite/security tests also passed.
- Frontend type-check, lint, unit tests and production build passed at the UI commit `b07c418f`; the Pages deployment completed. Pages Functions are configured to proxy to the non-production Worker.
- **Worker deployment is blocked at credential validation:** the same workflow run could not find the GitHub repository Actions secret `CLOUDFLARE_API_TOKEN`. It did not apply migrations or deploy the updated Worker. `BETTER_AUTH_SECRET` was present; the existing Pages deploy token is separate.
- Restore `CLOUDFLARE_API_TOKEN` under the repository's Actions secrets. Scope it to this Cloudflare account and grant Workers Editor (or Workers Scripts Edit) for the existing non-production Worker plus D1 Write/Edit for the non-production migration step. Never place the token in source control or chat. Once restored, rerun the push workflow and require its remote Worker and Pages-proxy smoke checks to pass.
- Signed-in self-service password change is implemented; forgotten-password/admin-approved reset and forced temporary-password replacement remain separate incomplete workflows. Email delivery still needs a verified sender and provider configuration.
- Production records have not been exported or copied, and no production cutover has occurred.


**Track:** non-production only  
**Database jurisdiction:** EU (`eu`) — remote non-production database `pcg-missions-dev` created on 2026-11-13 (primary region `EEUR`, replication disabled)  
**Worker:** full API Worker `pcg-missions-api-nonprod` deployed successfully on 2026-11-13 from `migration/cloudflare-nonprod-completion`; diagnostic Worker `pcg-missions-d1-smoke` remains separate. Post-deploy workflow verification passed for non-production health, D1 schema 28 and unauthenticated API denial.  
**Production:** unchanged

## Implemented D1 schema slices

| Migration | Tables | Main invariants |
| --- | --- | --- |
| `0001_platform_core.sql` | 17 | Better Auth core identity table shape, church/branch tenancy, roles/capabilities, staff profiles and scoped assignments, append-only access audit, teams and service areas |
| `0002_contacts_followup.sql` | 9 | Contacts, capture provenance/idempotency, assignment history, visibility-scoped notes, interactions, merge history, follow-up lists/tasks and append-only task events |
| `0003_staff_authorization_policy.sql` | 5 security tables | Seeds six fixed roles and scoped grants; adds explicit shares, sensitive-access audit, two-person Admin/Pastor elevation requests, elevation audit and two-slot owner bootstrap state |
| `0004_staff_session_revocation.sql` | 0 new tables | Revokes all Better Auth sessions immediately when a staff account is deactivated or suspended |
| `0005_better_auth_rate_limit.sql` | 1 | Adds the Better Auth rate-limit table; counters persist in D1 across Worker isolates |
| `0006_last_role_session_revocation.sql` | 0 new tables | Revokes sessions when a staff member loses their final active role across active branches; schema version 6 |
| `0007_staff_lifecycle_and_admin_revocation.sql` | 3 new audit/workflow tables | Audited deactivate/suspend/reactivate, branch-aware last-Admin protection and two-person Admin/Pastor revocation; schema version 7 |
| `0008_staff_invitation_onboarding.sql` | 2 new tables | One-time, expiring, hashed staff invitations; Admin/Pastor-only issuance/revocation; invitation acceptance audit; schema version 8 |
| `0009_contacts_private_field_write.sql` | 0 new tables | Separates highly restricted contact demographic/language writes from ordinary contact updates; schema version 9 |
| `0010_contact_assignment_audit.sql` | 1 new table | Enforces active branch actor/target checks, preserves assignment history, and records immutable assignment/reassignment audit; schema version 10 |
| `0011_followup_task_idempotency.sql` | 0 new tables | Enforces branch-scoped uniqueness for follow-up task idempotency keys; schema version 11 |
| `0012_prayer_pastoral_care.sql` | 9 restricted domain tables | Prayer requests/assignments, separate prayer and care access ledgers, care groups/memberships, care records/assignments/interactions; creation and assignment triggers enforce capability, branch and intercessor-role boundaries; schema version 12 |
| `0013_events_attendance_transport.sql` | 10 operational tables | Events, typed staff/team assignments, staff registrations, transport options/reservations, check-in, closeout, append-only closeout events and idempotency receipts; branch-scoped actor checks; public registration remains disabled; schema version 13 |
| `0014_calendar_announcements_public_content.sql` | 11 content/workspace tables | Typed calendar scopes; branch/team/event announcement audiences; in-app-only delivery ledger; public profile, welcome messages, sermons, daily word, digital tracts and typed external links; actor-scoped create/update checks; schema version 14 |
| `0015_prayer_share_revocation_hardening.sql` | 0 new tables | Requires a reason for sensitive-share revocation, ties prayer-assignment revocation to the matching revoked share, records actor/reason, and appends immutable prayer and sensitive-access audit events; schema version 15 |
| `0016_event_lifecycle_audit.sql` | 1 new table | Adds event actor attribution, database-enforced active Admin/Pastor/Coordinator event-manager checks for updates, and append-only before/after event lifecycle audit; schema version 16 |
| `0017_public_content_management_audit.sql` | 1 new table | Adds church-public-profile and external-link write authorization, immutable HTTPS document links, and append-only before/after audit for public profile, welcome messages, sermons, daily words, digital tracts and document links; schema version 17 |
| `0018_event_operations_guards.sql` | 0 new tables | Adds database-enforced registration open/capacity rules, cancellation actor checks, transport option/reservation capacity and actor guards, and closeout audit actor authorization; schema version 18 |
| `0019_event_cancellation_idempotency.sql` | 0 new tables | Adds persisted cancellation request keys and per-event uniqueness for registration and transport cancellation replay; schema version 19 |
| `0020_event_assignment_privilege_guards.sql` | 0 new tables | Narrows registration, cancellation and check-in authorization to event assignment roles appropriate to each operation; schema version 20 |
| `0021_announcement_delivery_read_receipts.sql` | 1 new table | Adds audience-checked in-app delivery fan-out, recipient indexes and immutable staff read receipts; schema version 21 |
| `0022_typed_ministry_reports.sql` | 2 new tables | Adds typed daily/event/weekly ministry reports, D-12 report capabilities, branch/team reviewer scopes, self-review protection and atomic append-only review/resubmission history; schema version 22 |
| `0023_prayer_request_idempotency.sql` | 1 new table | Adds branch-scoped actor-bound idempotency receipts for authenticated prayer intake; schema version 23 |
| `0024_calendar_audit_cancellation_read_receipts.sql` | 2 new tables | Adds active/cancelled state, actor attribution, immutable calendar change audit and staff-scoped immutable read receipts; schema version 24 |
| `0025_pastoral_care_explicit_share.sql` | 0 new tables | Restricts care metadata to Admin/Pastor branch scope; restricted reads, updates and interactions require explicit shares and active assignments; adds reasoned assignment revocation and immutable care audit; schema version 25 (applied and verified in EU non-production D1) |
| `0026_calendar_recurring_series.sql` | 2 new tables | Adds branch-authorized recurring series, timezone-aware bounded daily/weekly/monthly occurrences, unique series occurrence keys, reasoned future cancellation and append-only series audit; schema version 26 (applied and verified in EU non-production D1) |
| `0027_ministry_report_aggregate_exports.sql` | 1 new table | Adds Admin/Pastor-only `reports.export`, aggregate CSV export audit, append-only export history and a minimum-three-author privacy threshold; schema version 27 (applied and verified in EU non-production D1) |
| `0028_staff_password_reset_audit.sql` | 1 new table | Preserves approved private password-reset audit history as append-only records; `request_id` remains an opaque reference because live reset requests/tokens are excluded; schema version 28 (applied and verified in EU non-production D1) |

These migrations are a first porting slice from the live schema. They are not a complete replacement for the live 50 public tables and three private application tables.

## Remote non-production D1 verification

- Database UUID: `376a6782-d059-41f9-9e09-f93718fef2bb`.
- Migrations `0001` through `0028` are present in the EU non-production D1 migration ledger; schema version is `28` and environment marker is `non-production`.
- Database contains 81 application tables and all six expected role records.
- `PRAGMA foreign_key_check` returned no violations.
- Wrangler migration ledger `d1_migrations` contains 28 applied migration filenames. Migrations `0025`–`0028` are now independently verified in the EU non-production database through the Cloudflare D1 API: explicit-share pastoral-care guards, recurring calendar series, aggregate ministry-report export audit/privacy threshold and append-only staff password-reset audit are present.
- This is a direct remote D1 schema test. The new local Worker/D1 integration suite is now part of CI and exercises Better Auth, protected route gates, security headers and CORS against the built Worker; the full non-production Worker is now deployed; the push deployment run also verified the remote health endpoint and unauthenticated staff-context gate.
- A source/target audit gap was corrected in migration 0028: the source password-reset audit is no longer mapped to a nonexistent target. Its historical rows can be reconciled without copying ephemeral reset-request state or weakening append-only behavior.

## Current test coverage

The GitHub Actions workflow `Cloudflare D1 Foundation` runs the SQL migrations against an in-memory SQLite database and checks:
- migration application through schema version 28 and non-production marker;
- identity foreign keys;
- temporal overlap rejection for staff role assignments, team membership, area coverage and contact assignments;
- adjacent assignment periods;
- append-only staff-access and follow-up-task event records;
- exact six-role privilege matrix, field-level contact detail separation and prohibited capability grants;
- time-bounded explicit-share grant/revoke authorization and automatic audit attribution;
- dual-control Admin/Pastor elevation, two bootstrap slots, request/review/application audit and last-admin protection;
- explicit-share overlap, expiry/revocation history and automatic share grant/revoke audit events;
- immediate Better Auth session deletion on staff deactivation/suspension or loss of the final active branch role, plus persistent rate-limit key uniqueness;
- contact normalization, capture idempotency and metadata allowlists;
- follow-up task completion and target invariants;
- restricted prayer/care creation authorization, intercessor-only prayer assignment, no prayer-intercessor CRM/pastoral grants, assignment audit writes and append-only sensitive-access ledgers;
- branch-scoped event creation, event check-in capability and event/team assignment authorization, staff registration actor checks, required idempotency keys, transport assignment checks and closeout review capability;
- typed calendar scope integrity, branch-scoped announcement management, content-manager checks on public content creation and update, church-scoped public-profile authorization, external-link immutability and append-only public-content change audit.

Latest verified CI run: [43514971428](https://github.com/Elgit4/PCG_Missions/actions/runs/43514971428) — 110 Python/SQLite tests passed; Worker/Better Auth TypeScript type-check, Wrangler dry-run bundle and local Worker/D1 + Better Auth integration tests passed, including the local scheduled-event trigger and unauthenticated gates for pastoral care, recurring calendar and report export. The earlier pull-request workflow run skipped remote deployment by design. The subsequent push deployment run [43526171588](https://github.com/Elgit4/PCG_Missions/actions/runs/43526171588) passed the required secret gate, applied/reconciled remote migrations, deployed the full API Worker and verified its health/API gate. Remote EU D1 is now schema version 28 with all 28 migration records, 81 application tables and zero foreign-key violations. Migrations 0025–0028 were applied to the isolated `pcg-missions-dev` database and verified through the Cloudflare connection. Remote checks also confirm `reports.export` is granted only to `admin_pastor` at branch scope, the new calendar/report/reset audit triggers exist, and the new series/export/reset/care tables contain zero rows. The full API Worker is deployed. The workflow's successful required-secret gate confirms the two required secrets are configured without exposing their values. Migration 0028 has focused local SQLite validation and append-only/JSON-object checks.

## Frontend integration progress

- Replaced the browser Supabase Auth/token-storage client with Better Auth sign-in, get-session and sign-out using HttpOnly cookies.
- Routed browser business API requests through the Cloudflare Worker same-origin API proxy; branch context is sent as `X-Branch-Id` and remains server-validated.
- Added the Cloudflare Pages Functions same-origin API proxy, a local Wrangler Vite proxy and the Pages origin to the Worker trusted-origin allow-list. Direct Upload configuration is version-controlled in `web/wrangler.toml`.
- Updated frontend API adapters for staff context, contacts, follow-up, reports, events, calendar, announcements, content and pastoral endpoints. Team/service-area administration, administrator-approved password recovery and forced temporary-password replacement remain explicitly blocked rather than falling back to Supabase.
- Frontend type-check, lint, unit tests and production build all pass in CI run [43516535210](https://github.com/Elgit4/PCG_Missions/actions/runs/43516535210); Worker integration CI also passes in run [43516535132](https://github.com/Elgit4/PCG_Missions/actions/runs/43516535132).
- The previously deployed non-production Worker passed health and unauthenticated API gates. A real authenticated browser-to-Worker end-to-end acceptance run remains pending. Production routing and DNS remain unchanged.

## Authentication and authorization progress

- Better Auth `1.7.22` is pinned; D1-backed auth is initialized per request and mounted under `/api/auth/*`.
- Email/password sign-in for provisioned identities is enabled; public self-registration is disabled.
- Exact-origin checks, secure HttpOnly session cookies, no cookie cache, seven-day server-side sessions, Cloudflare client-IP detection and D1-persistent rate-limit counters are configured.
- `GET /api/v1/me` resolves the session to an active staff profile and branch-valid roles/capability metadata; caller-supplied branch IDs are validated against active assignments.
- The endpoint is context discovery, not a substitute for server-side authorization.
- Branch-scoped staff directory, paginated governance audit, deactivate/suspend/reactivate routes and account audit are implemented.
- Invitation issuance/list/revocation/acceptance routes are implemented. A 256-bit one-time token is hashed before storage, expires after 72 hours, and is consumed during account provisioning. The invitee sets their own password; public Better Auth sign-up remains disabled outside the private acceptance path. D1 enforces actor capability, branch membership, self-change denial and last-Admin/Pastor protection; deactivation/suspension immediately revoke sessions.
- Admin/Pastor revocation now has its own request/list/approve/reject workflow. The requester and reviewer must be distinct; the assignment update must reference the approved request, and the existing last-Admin/Pastor guard remains in force. Contact and follow-up endpoints are implemented with server-side branch/record predicates. Prayer queue metadata, explicit-share intercessor narrative reads, share grant/revocation and assigned-request status updates now have Worker handlers with transactionally paired audit writes.

## Not implemented yet

- Remote Better Auth sign-in/session lifecycle using a provisioned non-production staff identity (the local D1/Worker integration flow passes; credentialed remote acceptance remains pending).
- Worker-level integration tests for staff invitation, account lifecycle, staff governance and the existing contact/follow-up routes.
- Pastoral-care metadata and explicit-share narrative handlers are now implemented in Worker source. The model grants branch metadata to Admin/Pastor only; narrative read/update/interact require an active explicit share and care assignment. Remote migration 0025 is applied; authenticated runtime integration tests remain outstanding.
- Worker-level integration tests for the new event registration, capacity, cancellation replay, transport, check-in and closeout endpoints; the handlers and D1 guards are implemented but not runtime-tested.
- Calendar and announcement CRUD/lifecycle, in-app delivery fan-out, recipient-scoped announcement inbox/read receipts, public content CRUD/publishing, church profile management, HTTPS external links and the published-only public read projection are deployed. Authenticated domain-by-domain acceptance remains outstanding.
- Ministry report submission, branch/team review, correction/resubmission, aggregate overview, prior-period time-series comparisons and Admin/Pastor-only aggregate CSV export with append-only export audit are implemented in Worker source. Deployed Worker verification remains; migration export/import and source-to-D1 reconciliation also remain.
- Complete authenticated browser-to-Worker acceptance after the non-production Worker deployment is updated; the Pages API proxy configuration is already committed and deployed.
- Email provider integration for invitations and password resets. SMS remains intentionally unconfigured.

## Events, registration, transport and attendance

- Event schema and core constraints are present in D1. Staff can list events within branch/team/event assignment scope, create private drafts, update drafts, publish staff-only events and cancel events. The event actor is server-derived; D1 enforces active event-manager capability on updates and records append-only before/after audit events.
- Staff registration/list/cancel, open/close registration, check-in, transport option/reservation and closeout submit/resubmit/review routes are implemented in Worker source. D1 migrations 0018–0020 enforce registration and transport capacity, actor authorization, cancellation idempotency keys and role-specific assignment permissions.
- Public registration remains deliberately excluded. Events are published staff-only with registration closed by default; opening registration is a separate branch-manager action. These deployed routes still require authenticated Worker/D1 acceptance tests.
- Event walk-in identity is currently represented by a name snapshot; deduplication across walk-in names is not claimed.

## Restricted prayer and pastoral care

- Prayer Intercessor remains isolated from the visitor CRM; only the `prayer.request.read` and `prayer.request.respond` capabilities are baseline grants, both with explicit-share scope.
- Prayer requests can be created by Admin/Pastor and Coordinator, but narrative reads are not granted by those roles. Assignment requires an active Admin/Pastor share capability and an active Prayer Intercessor role in the same branch.
- Pastoral-care record creation and sharing are Admin/Pastor-controlled. Care assignment is branch-bound; actual narrative reads must still be authorized through the separate care access ledger.
- Prayer and care read ledgers are append-only. Prayer narrative reads write prayer-specific and sensitive-record access audit rows before returning narrative fields. Care narrative reads, updates and interactions require an active explicit share and assignment, and are audited before returning restricted content.
- Public prayer/care intake, public reports, SMS, generic search and offline access remain disabled. The deployed Worker includes an Admin/Pastor-only aggregate CSV with a three-author threshold and immutable audit; authenticated export privacy and audit acceptance remains outstanding.

## Required next steps

1. Restore the repository Actions secret `CLOUDFLARE_API_TOKEN` with the Workers Editor/Workers Scripts Edit and D1 Write/Edit permissions described above. The latest local Worker/D1 password acceptance run passed, but remote migrations and Worker deployment were skipped because this secret was absent.
2. Add the real frontend origin to `BETTER_AUTH_TRUSTED_ORIGINS`, then exercise Better Auth sign-in, session refresh, sign-out, invitation acceptance/revocation and all API domains against EU D1.
3. Add authenticated remote Worker/D1 tests for cross-branch, wrong-team, wrong-assignment, expired/revoked share, duplicate-key, capacity-race, scheduled publication and audit-failure cases.
4. Remote schema version 28, all 28 migration ledger entries, 81 application tables and foreign-key integrity are verified. The deployed Worker health and unauthenticated API gate passed. Still verify authorization triggers, password-reset audit append-only behavior, aggregate CSV export privacy/audit and scheduled-announcement publication through authenticated Worker tests.
5. Validate Better Auth's generated schema against the pinned release and complete the controlled source-to-D1 export/import and row/count/hash reconciliation for the remaining live schema. No production snapshot should be exported without a separate data-migration approval.
6. Integrate the frontend with the non-production API and verify end-to-end user workflows. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` sender for password-reset emails; invitation tokens remain manual until the invitation acceptance UI is integrated. Production cutover remains a separate approval gate.


## Event flyer media — schema 30 (implementation staged)
- Event workspace requires a PNG, JPEG or WebP flyer/image for every event (maximum 5 MiB).
- Binary objects are stored in the dedicated R2 bucket `pcg-missions-event-media-nonprod`; D1 stores only an opaque object key, verified content type, size and update timestamp.
- Upload and read routes are branch/capability scoped. The Worker validates file signature and declared MIME. Publishing is blocked unless a flyer exists.
- Migration `0030_event_flyer_media.sql` advances non-production schema to 30.
- R2 provisioning is blocked because R2 is not enabled on this Cloudflare account (Cloudflare API error 10042). Enable R2 in the Dashboard and create the bucket with EU jurisdiction before deploying this binding. No public arbitrary-file fallback is used.


## Team and service-area administration — schema 31
- Team and service-area CRUD, membership assignment/role change/revocation, and staff coverage assignment/revocation are implemented in the Worker and connected to the workspace API.
- Mutations are branch-scoped, capability-gated and recorded in the append-only `team_management_audit` table. D1 triggers enforce active parent records, active staff membership, Team Leader role requirements, and deactivation guards.
- Migration `0031_team_area_administration_guards.sql` adds the audit table and database invariants. It is the sole schema-31 migration.
- Remote EU D1 is still at schema 28; migrations 29–31 are staged and must be applied only after the non-production deployment credentials and event-media R2 bucket are available.
