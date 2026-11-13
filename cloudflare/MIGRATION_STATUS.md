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

These migrations are a first porting slice from the live schema. They are not a complete replacement for the live 50 public tables and three private application tables.

## Remote non-production D1 verification\n\n- Database UUID: `376a6782-d059-41f9-9e09-f93718fef2bb`.\n- Migrations `0001` through `0011` applied successfully; schema version reports `11` and environment marker is `non-production`.\n- Database contains 39 application tables and all six expected role records.\n- `PRAGMA foreign_key_check` returned no violations.\n- Wrangler migration ledger `d1_migrations` was initialized with the 11 applied migration filenames after applying the SQL through the Cloudflare D1 API.\n- This is a direct remote D1 schema test; Better Auth login, Worker request lifecycle and domain endpoints have not yet been exercised against a deployed Worker.\n\n## Current test coverage

The GitHub Actions workflow `Cloudflare D1 Foundation` runs the SQL migrations against an in-memory SQLite database and checks:
- migration application and non-production marker;
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
- follow-up task completion and target invariants.

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
- Ministry-sensitive prayer/care domain tables and runtime access-audit enforcement (the immutable audit ledger is now defined).
- Events, registrations, check-in, transport, calendar, announcements, public content and reports.
- Data export/import tooling and reconciliation reports.
- Cloudflare Pages preview binding or frontend API cutover.

## Required next steps

1. Validate Better Auth's generated schema against the identity tables using a pinned release.
2. Add authorization middleware and staff-session resolution before adding protected routes.
3. Port the remaining domain schema in isolated migrations and add negative permission tests.
4. Create the D1 development database with `--jurisdiction=eu` in the Cloudflare account, replace the placeholder UUID, and run migrations only against that non-production database.
5. Exercise the Worker on a Cloudflare preview URL before considering any production cutover.
