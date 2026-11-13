# Cloudflare migration status

**Track:** non-production only  
**Database jurisdiction:** EU (`eu`) selected; no remote D1 resource created from this session  
**Worker:** read-only readiness endpoint only  
**Production:** unchanged

## Implemented D1 schema slices

| Migration | Tables | Main invariants |
| --- | --- | --- |
| `0001_platform_core.sql` | 17 | Better Auth core identity table shape, church/branch tenancy, roles/capabilities, staff profiles and scoped assignments, append-only access audit, teams and service areas |
| `0002_contacts_followup.sql` | 9 | Contacts, capture provenance/idempotency, assignment history, visibility-scoped notes, interactions, merge history, follow-up lists/tasks and append-only task events |
| `0003_staff_authorization_policy.sql` | 5 security tables | Seeds six fixed roles and scoped grants; adds explicit shares, sensitive-access audit, two-person Admin/Pastor elevation requests, elevation audit and two-slot owner bootstrap state |
| `0004_staff_session_revocation.sql` | 0 new tables | Revokes all Better Auth sessions immediately when a staff account is deactivated or suspended; schema version 4 |

These migrations are a first porting slice from the live schema. They are not a complete replacement for the live 50 public tables and three private application tables.

## Current test coverage

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
- two-slot owner bootstrap, independent Admin/Pastor elevation approval, applied-request audit and last-active-admin protection;
- contact normalization, capture idempotency and metadata allowlists;
- follow-up task completion and target invariants.

A successful CI result proves the SQL is accepted by the CI runner's SQLite engine. It does not replace a D1 preview test, a Better Auth schema compatibility check, a Worker runtime test or a domain authorization test.

## Authentication and authorization progress

- Better Auth `1.7.22` is pinned; D1-backed auth is initialized per request and mounted under `/api/auth/*`.
- Email/password sign-in for provisioned identities is enabled; public self-registration is disabled.
- Exact-origin checks, secure HttpOnly session cookies, no cookie cache, seven-day server-side sessions and IP-based rate-limit configuration are in place.
- `GET /api/v1/me` resolves the session to an active staff profile and branch-valid roles/capability metadata; caller-supplied branch IDs are validated against active assignments.
- The endpoint is context discovery, not a substitute for server-side authorization. No ministry business route is enabled yet.

## Not implemented yet

- Staff invitation/create-account workflow and real email delivery for invitation/password reset.
- Session revocation is now enforced by a D1 trigger on deactivation/suspension; administrative deactivation/reactivation endpoints and their audit-backed workflow remain to be implemented.
- Better Auth schema compatibility validation against the exact pinned package in local D1 and Worker runtime.
- Capability/record authorization integration into domain handlers; verified session resolution is now available, but protected business routes remain disabled.
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
