# Cloudflare migration status

**Track:** non-production only  
**Database jurisdiction:** EU (`eu`) — remote non-production database `pcg-missions-dev` created on 2026-11-13 (primary region `EEUR`, replication disabled)  
**Worker:** full API Worker not deployed. A temporary read-only D1 smoke Worker (`pcg-missions-d1-smoke`) is deployed on the non-production `workers.dev` subdomain with the EU D1 binding; it exposes only `GET /health`.  
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

These migrations are a first porting slice from the live schema. They are not a complete replacement for the live 50 public tables and three private application tables.

## Remote non-production D1 verification

- Database UUID: `376a6782-d059-41f9-9e09-f93718fef2bb`.
- Migrations `0001` through `0015` applied successfully; schema version reports `15` and environment marker is `non-production`.
- Database contains 69 application tables and all six expected role records.
- `PRAGMA foreign_key_check` returned no violations.
- Wrangler migration ledger `d1_migrations` contains all 15 applied migration filenames. Migration `0015` was applied to the EU non-production database and verified through the Cloudflare D1 API.
- The full API Worker is not yet deployed. The diagnostic smoke Worker has its D1 binding and `workers.dev` route enabled, but its public HTTP response has not yet been independently verified from this session. Better Auth login and business endpoints have not been exercised in a deployed Worker.

## Current test coverage

The GitHub Actions workflow `Cloudflare D1 Foundation` runs the SQL migrations against an in-memory SQLite database and checks:
- migration application through schema version 15 and non-production marker;
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
- typed calendar scope integrity, branch-scoped announcement management, content-manager checks on public content creation and update, and typed external document links.

Latest verified CI run: [43469371911](https://github.com/Elgit4/PCG_Missions/actions/runs/43469371911) — **56 Python/SQLite tests passed** and Worker/Better Auth TypeScript type-check passed. This verifies migration replay and tested invariants in CI's SQLite runtime; it does not replace real D1 Worker request testing or Better Auth schema compatibility validation.

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

- Better Auth schema compatibility validation against the exact pinned package in a real local D1/Worker runtime.
- Worker-level integration tests for staff invitation, account lifecycle, staff governance and the existing contact/follow-up routes.
- Pastoral-care narrative read/write routes remain disabled until explicit care-reader capability decisions are approved.
- Event lifecycle handlers, capacity enforcement, replay-safe request-digest verification, transport reservations, check-in and closeout workflows.
- Calendar and announcement management handlers, content editing/publication handlers, and public content read projections.
- Reporting, analytics, export/import tooling and source-to-D1 reconciliation.
- Cloudflare Pages preview binding and frontend API integration.
- Email provider integration for invitations and password resets. SMS remains intentionally unconfigured.

## Events, registration, transport and attendance

- Event schema and core constraints are now present in D1. Event creation and check-in are protected by database actor/capability triggers. Staff registration requires an authenticated actor and idempotency key. Transport assignment and closeout review have explicit branch/capability boundaries.
- Public registration is deliberately excluded. Capacity enforcement, request-digest verification, transactional replay handling, event lifecycle routes and reporting are Worker responsibilities and remain disabled until implemented and tested.
- Event walk-in identity is currently represented by a name snapshot; deduplication across walk-in names is not claimed.

## Restricted prayer and pastoral care

- Prayer Intercessor remains isolated from the visitor CRM; only the `prayer.request.read` and `prayer.request.respond` capabilities are baseline grants, both with explicit-share scope.
- Prayer requests can be created by Admin/Pastor and Coordinator, but narrative reads are not granted by those roles. Assignment requires an active Admin/Pastor share capability and an active Prayer Intercessor role in the same branch.
- Pastoral-care record creation and sharing are Admin/Pastor-controlled. Care assignment is branch-bound; actual narrative reads must still be authorized through the separate care access ledger.
- Prayer and care read ledgers are append-only. Prayer narrative reads now write both prayer-specific and sensitive-record access audit rows in the same D1 batch before returning narrative fields. Care narrative reads remain disabled.
- No public prayer intake, public care intake, SMS, export, generic search, report or offline access is enabled.

## Required next steps

1. Implement event lifecycle handlers, capacity enforcement, replay-safe request-digest validation, transport reservations, check-in and closeout workflows.
2. Implement calendar, announcement and public-content handlers with per-operation capability checks and D1 transactional invariants.
3. Validate Better Auth's generated schema against the pinned release and exercise the complete auth/session lifecycle on the EU D1 binding.
4. Add Worker-level integration tests for staff, contacts, follow-up and prayer routes; then implement migration export/import and reconciliation for the remaining live schema.
5. Configure a non-production Workers Build/preview deployment and verify the deployed Worker against EU D1. Production cutover remains a separate approval gate.


---

## Current migration snapshot — 21 November 2026

This section supersedes older status statements above where they conflict. The earlier sections describe historical Better Auth / schema-v15 work and are not the current implementation state.

### Verified source and CI state

- `cloudflare/src/auth.ts` validates Supabase bearer access tokens by calling the Auth `GET /auth/v1/user` endpoint; it does not trust locally decoded JWT claims.
- `cloudflare/src/staff-context.ts` resolves the verified Supabase Auth UUID to an active D1 staff profile, active branch assignments and capability grants.
- `cloudflare/src/index.ts` uses the Supabase Auth verifier and has no Better Auth runtime handler. Supabase Auth remains responsible for sign-in, refresh, recovery and logout.
- The six-role team/service-area policy is enforced in the D1 Worker: Admin/Pastor manages branch-scoped teams and areas; Coordinator reads the branch directory; Team Leader reads only their active teams and related active coverage; Field Worker, Follow-up Volunteer and Prayer Intercessor receive no team/area directory grants.
- On Worker source commit `3e2d893350ee04bf71c8f4fd5d25fc23cb81f210`, Cloudflare D1 Foundation run [44952239573](https://github.com/Elgit4/PCG_Missions/actions/runs/44952239573) passed 64 Python migration/schema/security tests, Worker type-check and 45 Node Auth/Worker route tests. CMI web CI run [44952239477](https://github.com/Elgit4/PCG_Missions/actions/runs/44952239477) passed type-check, lint, 173 frontend tests and production build. Both suites were rerun successfully on the documentation-only PR head `dc41daf496709d02a8e41ac78b802a7a0381766a` (D1 run [44952581246](https://github.com/Elgit4/PCG_Missions/actions/runs/44952581246); web run [44952581279](https://github.com/Elgit4/PCG_Missions/actions/runs/44952581279)).
- The Worker route tests use mocked Supabase Auth and an in-memory D1 adapter. They exercise the real Worker handlers, but are not equivalent to authenticated six-role acceptance against the deployed preview Worker.

### Current EU D1 rehearsal verification

Read-only checks against `pcg-missions-migration-test` returned:

| Check | Verified value |
| --- | ---: |
| Environment | `non-production` |
| Schema version | 39 |
| Applied D1 migrations | 39 |
| Application tables | 85 |
| Active capabilities | 63 |
| Role-capability grants | 73 |
| Staff profiles | 3 |
| Staff-role assignments | 2 |
| Supabase Auth identity references | 3 |
| Staff-access audit rows | 6 |
| `PRAGMA foreign_key_check` | 0 violations |

The D1 migration ledger ends at `0039_team_area_directory_read_grants.sql`. The migration chain and foreign-key check were queried without changing D1 data. The directory fixture tables are currently empty: 0 teams, 0 service areas, 0 active team memberships and 0 active area-coverage rows. Active role assignments exist only for Admin/Pastor (1) and Team Leader (1); Coordinator, Field Worker, Follow-up Volunteer and Prayer Intercessor currently have none. No test identities or directory fixtures were inserted.

### Six-role grant reconciliation

The live Supabase database currently has 65 role-capability grants. The EU D1 rehearsal has 73. A row-for-row comparison found no Supabase-only grants and exactly eight additional D1 grants:

| Role | Live Supabase | D1 rehearsal | Team/service-area access |
| --- | ---: | ---: | --- |
| Admin/Pastor | 27 | 31 | Branch read and manage |
| Coordinator | 11 | 13 | Branch read only |
| Team Leader | 11 | 13 | Team-scoped read only |
| Field Worker | 9 | 9 | No directory access |
| Follow-up Volunteer | 6 | 6 | No directory access |
| Prayer Intercessor | 1 | 1 | No directory access |

The eight additions are four Admin/Pastor grants (`team.read`, `area.read`, `team.manage`, `area.manage`), two Coordinator branch-read grants and two Team Leader team-read grants. All management capabilities remain Admin/Pastor-only and branch-scoped.

The live Supabase migration ledger does not yet contain `20261113010000_team_area_administration.sql`; Supabase currently has no grants for `team.read`, `area.read`, `team.manage` or `area.manage`. The two D1 migrations were applied only to the non-production rehearsal. No production migration or role-grant write was made.

### Current Cloudflare preview state

- Pages project `pcg-missions` has the preview build at [feat-cloudflare-d1-migration.pcg-missions.pages.dev](https://feat-cloudflare-d1-migration.pcg-missions.pages.dev). Its preview config sets `VITE_CMI_WORKER_API_URL` to the preview Worker and `VITE_CMI_PREVIEW_MODE=true`; the production config keeps the Worker URL empty and preview mode disabled.
- The isolated Worker `pcg-missions-api-preview` is bound to EU D1 `pcg-missions-migration-test`. Cloudflare reports version 16 `9777d6f6-5d86-4518-9365-940e8d6c2f59` at 100% of preview traffic via deployment `858066f9-a6e8-4b76-a572-0e756988c75c` (21 November 2026, 21:38 UTC). Its version annotations identify PR #85 source commit `3e2d893350ee04bf71c8f4fd5d25fc23cb81f210`.
- The active preview version includes the active-team, active-covered-staff and active-covered-team restrictions for Team Leader directory projections. The active script content was read back from Cloudflare and all three SQL filters were verified. The version preserved the EU D1 binding, non-production environment, preview CORS allowlist and existing observability settings; no secret bindings were introduced.
- Post-promotion smoke run [44952577439](https://github.com/Elgit4/PCG_Missions/actions/runs/44952577439) checked the active preview Worker after version 16 was promoted: `/health` returned ready with `environment=non-production` and `schema_version=39`; anonymous session, contact, interaction and follow-up requests returned `UNAUTHENTICATED`; team/service-area mutation protection and preview Pages origin checks passed. The workflow was cancelled only in its final artifact-upload step, after these runtime assertions completed.
- The preview Worker has no Cloudflare secret bindings at present. In particular, `SUPABASE_SERVICE_ROLE_KEY` is not configured; Worker-side Auth Admin invitation provisioning must remain disabled until the secret is added securely and tested.
- Preview Pages and Worker use the existing Supabase Auth project, while business rehearsal data is stored in the isolated non-production D1 database. This is not a separate Auth tenant. Unsupported preview read routes may still use the existing Supabase API; unsupported non-GET business writes are blocked by `VITE_CMI_PREVIEW_MODE`.
- Production Pages and the live Supabase database have not been switched to the preview Worker or D1.

### Worker authorization coverage and remaining release gates

The current Worker source implements team and service-area collection reads, team/area create and update, team membership changes, and service-area coverage changes. The route tests verify that all five non-admin roles are denied those four mutation families before any D1 write. Team Leader directory projections also require active leader membership, active teams and active covered staff, and do not expose staff names.

The following frontend domains are not yet fully ported to Worker-compatible operations: typed ministry reports and review/resubmission/export flows; calendar; announcements; sermons and welcome content; event drafts, assignments, registration, cancellation, check-in and closeout; private flyer upload/delivery; and staff password-reset lifecycle operations. SMS/Arkesel remains intentionally disabled.

Before production cutover:

1. The latest verified source bundle is deployed to preview version 16. Its post-promotion health, CORS, anonymous-route, team/service-area protection and Pages-origin checks passed on run [44952577439](https://github.com/Elgit4/PCG_Missions/actions/runs/44952577439). Repeat these smoke checks after any subsequent Worker deployment.
2. Complete authenticated browser/API acceptance with real Supabase identities for all six roles against the preview Worker and rehearsal D1. The current 45 Node route tests use mocked Auth/D1 and do not satisfy this gate.
3. Complete route parity, deterministic data reconciliation, backup/restore, observability, incident response and rollback tests.
4. Resolve the missing Worker Auth Admin secret before enabling invitation provisioning. Review the Supabase Auth leaked-password-protection warning and the 52 RLS-enabled/no-policy advisor findings before any client-direct database access or production cutover.

The GitHub Vercel status check currently reports a build-rate-limit failure; the Cloudflare D1 Foundation and CMI web CI runs above passed. This Vercel status is separate from the Worker authorization test results.

SMS/Arkesel remains intentionally disabled. Existing production application data, production Pages routing and live Supabase grants remain untouched.


## 2026-11-22 implementation update — report, event, and prayer API slice

Implemented on `feat/cloudflare-d1-migration-foundation`:

- Cloudflare Worker ministry-report endpoints: scoped list/detail/history, team and event options, submit, review, and resubmit.
- Cloudflare Worker event-workspace endpoints: staff registration open/close, registration roster and creation, cancellation, check-in, and closeout read/submit/review. Idempotency receipts and database authorization triggers remain part of the write path.
- Frontend API routing for typed ministry reports, event registration/check-in/closeout, and the assigned prayer inbox now targets the Cloudflare Worker when the Worker API base URL is configured.
- Assigned prayer inbox now accepts pagination and returns the frontend's expected `data.requests/total/limit/offset` envelope.
- Preview workflow schema assertions were corrected to the live non-production D1 schema version 43 (the previous 39/40 assertions were stale).

Validation recorded for the implementation commit:
- Worker TypeScript typecheck: passed.
- SQLite foundation checks: passed.
- Worker bundle tests: 47 passed, 0 failed.
- Worker bundle dry-run build: passed.
- Preview health smoke: returned `ok=true`, `environment=non-production`, `schema_version=43`.
- Frontend typecheck, lint, tests, and production build: passed.
- Cloudflare Pages check: passed.

**Important boundary:** these checks validate the source bundle and the existing preview health endpoint. They do not prove that this new Worker bundle has been deployed to preview, nor do they constitute authenticated six-role browser acceptance or production cutover.

Still blocked:
- Event flyer object storage: Cloudflare reports R2 is not enabled for the account; bucket creation requires activation in the Cloudflare Dashboard.
- Staff Auth Admin lifecycle: the Worker-only Supabase service-role secret is not available in the Worker environment. Do not substitute the publishable key.
- Production Worker: no production Worker is deployed or bound to a verified production D1 database.
- Backup: no independently verified Supabase backup/export and restore test is recorded.
- Acceptance: six-role browser acceptance with real staff identities and branch-scoped records is outstanding.
- Cutover: reconcile the production-named D1 database against the migration-test D1 and Supabase data, then complete audit/data reconciliation, rollback checks, and explicit release approval before changing production Pages routing.

No production Worker deployment, production Pages routing change, production D1 write, or SMS send was performed in this implementation slice.


## Preview deployment verification — 2026-11-22

The verified bundle was deployed to the isolated `pcg-missions-api-preview` Worker:
- Worker version: `17`
- Version ID: `38916fe1-9120-4af3-9e36-b5342b4dd042`
- Deployment ID: `a2e48bae-f0cc-4f1f-b77c-0a367ef2d966`
- Source commit: `6e680e50966736c3d6727106065335b3231daac5`
- D1 binding: `pcg-missions-migration-test` (`74074d53-1edc-4ad7-83e6-bb3333a6ab4f`)
- Worker environment: `non-production`

Post-deployment smoke passed: health returned `ok=true`, schema version `43`; the report, event registration/check-in/closeout, prayer inbox, team, and service-area route probes returned the expected anonymous `401 UNAUTHENTICATED` response. Worker typecheck and SQLite foundation checks passed; bundle tests were 47/47.

This proves deployment and anonymous boundary protection only. It does not prove successful authenticated writes, six-role browser acceptance, flyer uploads, staff Auth Admin provisioning, or production readiness.


## Staff lifecycle integration update — 2026-11-22

The staff directory read and staff account deactivate/reactivate actions are now routed through the Cloudflare Worker. Frontend tests and the deployed-preview anonymous route probes pass for both status actions.

Still not migrated end-to-end: staff account creation/invitation acceptance and password-reset approval. The Worker invitation acceptance path calls Supabase Auth Admin and requires the Worker secret `SUPABASE_SERVICE_ROLE_KEY`; that secret is not configured. The existing frontend creation/reset flows still target Supabase Edge Functions. Do not mark staff lifecycle complete until the secret is added securely, the invitation/manual-handoff UI is migrated, and authenticated acceptance/reset tests pass.


## Read-only D1 identity comparison — 2026-11-22

A read-only comparison was run between the D1 resource named `pcg-missions-production` and `pcg-missions-migration-test`. Both databases report `app_meta.environment='non-production'` and schema version 43. Their core identity row counts match: 1 church, 1 branch, 3 staff profiles, and 2 staff-role assignments; contacts, follow-up tasks, events, and prayer requests are all 0 in both.

The church, branch, staff-profile identity/status rows match. Staff-role assignments are semantically equivalent after joining the database-specific role IDs to `role.code` (the two assignments are `admin_pastor` and `team_leader`); raw role IDs differ because the role catalogue IDs are database-specific, and timestamp text precision differs. This is a limited identity-baseline comparison, not a full row-content or audit-log reconciliation, and it is not a verified backup.

No D1 rows were written or changed. The resource named `pcg-missions-production` is not yet a production runtime database: its internal environment marker is `non-production`, and no production Worker exists.


## Better Auth consolidation update — 22 November 2026

The target architecture is now being consolidated on this branch: `migration/cloudflare-auth-consolidation`. It restores the Better Auth identity/account/session/verification/rate-limit tables with forward-only migration `0044_restore_better_auth_identity.sql`, keeps the six-role D1 authorization model, moves password/account operations into D1, and routes the browser through the Cloudflare Pages same-origin Worker gateway.

The application tests are green on commit `71854b4ce78941adb531833d6879f2c7d9bd6bab`:
- [Cloudflare D1 Foundation 45039540425](https://github.com/Elgit4/PCG_Missions/actions/runs/45039540425): SQLite migration/security tests, Worker type-check and 76/76 Worker tests passed.
- [CMI web CI 45039540483](https://github.com/Elgit4/PCG_Missions/actions/runs/45039540483): frontend type-check, lint, unit tests and production build passed.

The preview release workflows [45039791431](https://github.com/Elgit4/PCG_Missions/actions/runs/45039791431) and [45040385774](https://github.com/Elgit4/PCG_Missions/actions/runs/45040385774) reached the preview deployment permission gate, but the GitHub Actions Cloudflare token lacks account-scoped **Workers Scripts Write** required to upload a Worker version. The Better Auth signing secret has since been created directly on the preview Worker through the connected Cloudflare account. The secret-list permission check was removed; the release workflow now preflights Worker version upload before touching D1. Add Workers Scripts Write to the existing token and retain its existing D1 Edit permission.

**Do not treat the new auth implementation as deployed yet:** the live preview Worker is still the older schema-43 version 27, D1 migration 0044 has not been applied, and existing source bcrypt password hashes have not yet been imported into Better Auth. Real-user authentication and six-role browser acceptance remain outstanding. Production Pages, production D1, source Supabase services, Vercel and DNS are unchanged. The private Supabase event-flyer bucket remains the only planned Supabase runtime exception. SMS remains disabled.
