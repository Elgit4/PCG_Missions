# Cloudflare migration status

**Track:** non-production only  
**Database jurisdiction:** EU (`eu`) — remote non-production database `pcg-missions-dev` created on 2026-11-13 (primary region `EEUR`, replication disabled)  
**Worker:** source type-checks and bundles; deployment is skipped until the repository secret CLOUDFLARE_API_TOKEN is configured; D1 schema applied directly to the isolated non-production database  
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
| `0025_pastoral_care_explicit_share.sql` | 0 new tables | Restricts care metadata to Admin/Pastor branch scope; restricted reads, updates and interactions require explicit shares and active assignments; adds reasoned assignment revocation and immutable care audit; schema version 25 (source only; remote apply pending) |

These migrations are a first porting slice from the live schema. They are not a complete replacement for the live 50 public tables and three private application tables.

## Remote non-production D1 verification

- Database UUID: `376a6782-d059-41f9-9e09-f93718fef2bb`.
- Migrations `0001` through `0024` applied successfully to the EU non-production D1 database; schema version is `24` and environment marker is `non-production`.
- Database contains 77 application tables and all six expected role records.
- `PRAGMA foreign_key_check` returned no violations.
- Wrangler migration ledger `d1_migrations` contains 24 applied migration filenames. Migrations `0018`–`0024` were applied to the EU non-production database and verified through the Cloudflare D1 API; expected event actor-authorization triggers, cancellation-key indexes, announcement delivery/read-receipt triggers, typed report tables, D-12 role grants, prayer idempotency ledger, calendar cancellation state, append-only calendar audit and immutable calendar read receipts are present.
- This is a direct remote D1 schema test. The new local Worker/D1 integration suite is now part of CI and exercises Better Auth, protected route gates, security headers and CORS against the built Worker; non-production remote Worker deployment remains blocked by the missing GitHub Actions token.

## Current test coverage

The GitHub Actions workflow `Cloudflare D1 Foundation` runs the SQL migrations against an in-memory SQLite database and checks:
- migration application through schema version 24 and non-production marker;
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

Latest previously verified CI run: [43504468309](https://github.com/Elgit4/PCG_Missions/actions/runs/43504468309) — 89 Python/SQLite tests passed; Worker/Better Auth TypeScript type-check and Wrangler dry-run bundle passed for an earlier head. The latest branch adds the Worker integration harness and pastoral-care handlers; a green CI result for the current head has not yet been observed. Non-production deployment is skipped because `CLOUDFLARE_API_TOKEN` is not configured. Remote EU D1 is still schema version 24; migration 0025 is source-only and must be applied after migration validation.

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
- Pastoral-care metadata and explicit-share narrative handlers are now implemented in Worker source. The model grants branch metadata to Admin/Pastor only; narrative read/update/interact require an active explicit share and care assignment. Runtime integration tests and remote migration 0025 application remain outstanding.
- Worker-level integration tests for the new event registration, capacity, cancellation replay, transport, check-in and closeout endpoints; the handlers and D1 guards are implemented but not runtime-tested.
- Calendar and announcement CRUD/lifecycle, in-app delivery fan-out, recipient-scoped announcement inbox/read receipts, public content CRUD/publishing, church profile management, HTTPS external links and the published-only public read projection are in Worker source. They still require current-head CI and deployed Worker integration testing.
- Ministry report submission, branch/team review, correction/resubmission, aggregate overview and append-only history are implemented in Worker source and D1. Remaining reporting work is ministry-specific time-series comparisons and privacy-controlled exports; migration export/import and source-to-D1 reconciliation also remain.
- Cloudflare Pages preview binding and frontend API integration.
- Email provider integration for invitations and password resets. SMS remains intentionally unconfigured.

## Events, registration, transport and attendance

- Event schema and core constraints are present in D1. Staff can list events within branch/team/event assignment scope, create private drafts, update drafts, publish staff-only events and cancel events. The event actor is server-derived; D1 enforces active event-manager capability on updates and records append-only before/after audit events.
- Staff registration/list/cancel, open/close registration, check-in, transport option/reservation and closeout submit/resubmit/review routes are implemented in Worker source. D1 migrations 0018–0020 enforce registration and transport capacity, actor authorization, cancellation idempotency keys and role-specific assignment permissions.
- Public registration remains deliberately excluded. Events are published staff-only with registration closed by default; opening registration is a separate branch-manager action. These new routes still require full Worker/D1 integration testing and deployment to the non-production Worker.
- Event walk-in identity is currently represented by a name snapshot; deduplication across walk-in names is not claimed.

## Restricted prayer and pastoral care

- Prayer Intercessor remains isolated from the visitor CRM; only the `prayer.request.read` and `prayer.request.respond` capabilities are baseline grants, both with explicit-share scope.
- Prayer requests can be created by Admin/Pastor and Coordinator, but narrative reads are not granted by those roles. Assignment requires an active Admin/Pastor share capability and an active Prayer Intercessor role in the same branch.
- Pastoral-care record creation and sharing are Admin/Pastor-controlled. Care assignment is branch-bound; actual narrative reads must still be authorized through the separate care access ledger.
- Prayer and care read ledgers are append-only. Prayer narrative reads now write both prayer-specific and sensitive-record access audit rows in the same D1 batch before returning narrative fields. Care narrative reads remain disabled.
- No public prayer intake, public care intake, SMS, export, generic search, report or offline access is enabled.

## Required next steps

1. Add the repository secret `CLOUDFLARE_API_TOKEN` with scoped Workers Scripts edit permission, deploy the full Worker to non-production and set the persistent `BETTER_AUTH_SECRET` Worker secret.
2. Add the real frontend origin to `BETTER_AUTH_TRUSTED_ORIGINS`, then exercise Better Auth sign-in, session refresh, sign-out, invitation acceptance/revocation and all API domains against EU D1.
3. Add Worker-level integration tests for staff, contacts, follow-up, prayer, events, calendar, announcements and content, including cross-branch, wrong-team, wrong-assignment, duplicate-key and capacity-race cases.
4. Apply and verify migration 0025 on the isolated EU D1 database after the migration test suite passes; rerun foreign-key and authorization checks.
5. Complete privacy-controlled report exports and scheduled-announcement Worker runtime verification.
6. Validate Better Auth's generated schema against the pinned release and complete the controlled source-to-D1 export/import and row/count/hash reconciliation for the remaining live schema.
7. Integrate the frontend with the non-production API and verify end-to-end user workflows. Configure a verified email provider for invitations/password resets. Production cutover remains a separate approval gate.
