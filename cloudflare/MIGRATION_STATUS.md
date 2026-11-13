# Cloudflare migration status

**Track:** non-production only  
**Database jurisdiction:** EU (`eu`) — remote non-production database `pcg-missions-dev` created on 2026-11-13 (primary region `EEUR`, replication disabled)  
**Worker:** not deployed; D1 schema applied directly to the isolated non-production database  
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

These migrations are a first porting slice from the live schema. They are not a complete replacement for the live 50 public tables and three private application tables.

## Remote non-production D1 verification

- Database UUID: `376a6782-d059-41f9-9e09-f93718fef2bb`.
- Migrations `0001` through `0014` applied successfully; schema version reports `14` and environment marker is `non-production`.
- Database contains 69 application tables and all six expected role records.
- `PRAGMA foreign_key_check` returned no violations.
- Wrangler migration ledger `d1_migrations` was initialized with the 14 applied migration filenames after applying the SQL through the Cloudflare D1 API.
- This is a direct remote D1 schema test; Better Auth login, Worker request lifecycle and domain endpoints have not yet been exercised against a deployed Worker.

## Current test coverage

The GitHub Actions workflow `Cloudflare D1 Foundation` runs the SQL migrations against an in-memory SQLite database and checks:
- migration application through schema version 14 and non-production marker;
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
- branch-scoped event creation, event check-in capability and event/team assignment authorization, staff registration actor checks, required idempotency keys, transport assignment checks and closeout review capability;\n- typed calendar scope integrity, branch-scoped announcement management, content-manager checks on public content creation and update, and typed external document links.

Latest verified CI run: [43461336276](https://github.com/Elgit4/PCG_Missions/actions/runs/43461336276) — **46 Python/SQLite tests passed and Worker/Better Auth TypeScript type-check passed.** This proves the SQL is accepted by the CI runner's SQLite engine and the Worker code type-checks against the pinned package. It does not replace a real D1 preview test, runtime Better Auth schema validation, a deployed Worker test or domain authorization tests.

## Authentication and authorization progress

- Better Auth `1.7.22` is pinned; D1-backed auth is initialized per request and mounted under `/api/auth/*`.
- Email/password sign-in for provisioned identities is enabled; public self-registration is disabled.
- Exact-origin checks, secure HttpOnly session cookies, no cookie cache, seven-day server-side sessions, Cloudflare client-IP detection and D1-persistent rate-limit counters are configured.
- `GET /api/v1/me` resolves the session to an active staff profile and branch-valid roles/capability metadata; caller-supplied branch IDs are validated against active assignments.
- The endpoint is context discovery, not a substitute for server-side authorization.
- Branch-scoped staff directory, paginated governance audit, deactivate/suspend/reactivate routes and account audit are implemented.
- Invitation issuance/list/revocation/acceptance routes are implemented. A 256-bit one-time token is hashed before storage, expires after 72 hours, and is consumed during account provisioning. The invitee sets their own password; public Better Auth sign-up remains disabled outside the private acceptance path. D1 enforces actor capability, branch membership, self-change denial and last-Admin/Pastor protection; deactivation/suspension immediately revoke sessions.
- Admin/Pastor revocation now has its own request/list/approve/reject workflow. The requester and reviewer must be distinct; the assignment update must reference the approved request, and the existing last-Admin/Pastor guard remains in force. No ministry contact/follow-up business routes are enabled yet.

## Not implemented yet

- Staff invitation/create-account workflow and real email delivery for invitation/password reset.
- Session revocation is enforced by D1 triggers on deactivation/suspension and loss of the final active branch role. The staff account lifecycle endpoints are implemented, but invitation issuance/acceptance and real email delivery remain outstanding.
- Staff directory/account lifecycle, audit-read and dual-control role revocation routes still need Worker-level integration tests against local D1.
- Better Auth schema compatibility validation against the exact pinned package in local D1 and Worker runtime.
- First contact handlers are implemented for scoped list/create/read/update, interactions, visibility-filtered notes and audited branch-scoped assignment/reassignment. Contact creation is idempotent and auto-assigns the contact to the capturing staff member. Phone/email visibility and private demographic/language field writes are separately gated. Contact note, reassignment and first follow-up task list/create/update/reassignment APIs are implemented with scope predicates, idempotency and append-only events. Follow-up lists, task reassignment, notifications and the remaining ministry handlers remain outstanding.
- Trusted Worker handlers for prayer/care creation, assignment, update and audited narrative reads. No API route may return prayer/care narrative until each read is authorized and logged in the same D1 batch.
- Reports, analytics, and trusted Worker handlers for calendar, announcements and public content. Event schema is migrated, but trusted Worker routes for event management, registration, transport, check-in and closeout are not yet implemented.
- Data export/import tooling and reconciliation reports.
- Cloudflare Pages preview binding or frontend API cutover.

## Events, registration, transport and attendance

- Event schema and core constraints are now present in D1. Event creation and check-in are protected by database actor/capability triggers. Staff registration requires an authenticated actor and idempotency key. Transport assignment and closeout review have explicit branch/capability boundaries.
- Public registration is deliberately excluded. Capacity enforcement, request-digest verification, transactional replay handling, event lifecycle routes and reporting are Worker responsibilities and remain disabled until implemented and tested.
- Event walk-in identity is currently represented by a name snapshot; deduplication across walk-in names is not claimed.

## Restricted prayer and pastoral care

- Prayer Intercessor remains isolated from the visitor CRM; only the `prayer.request.read` and `prayer.request.respond` capabilities are baseline grants, both with explicit-share scope.
- Prayer requests can be created by Admin/Pastor and Coordinator, but narrative reads are not granted by those roles. Assignment requires an active Admin/Pastor share capability and an active Prayer Intercessor role in the same branch.
- Pastoral-care record creation and sharing are Admin/Pastor-controlled. Care assignment is branch-bound; actual narrative reads must still be authorized through the separate care access ledger.
- Prayer and care read ledgers are append-only. Worker read handlers must append the access event in the same D1 batch before returning narrative fields.
- No public prayer intake, public care intake, SMS, export, generic search, report or offline access is enabled.

## Required next steps

1. Validate Better Auth's generated schema against the identity tables using a pinned release.
2. Add authorization middleware and staff-session resolution before adding protected routes.
3. Port the remaining domain schema in isolated migrations and add negative permission tests.
4. Create the D1 development database with `--jurisdiction=eu` in the Cloudflare account, replace the placeholder UUID, and run migrations only against that non-production database.
5. Exercise the Worker on a Cloudflare preview URL before considering any production cutover.
