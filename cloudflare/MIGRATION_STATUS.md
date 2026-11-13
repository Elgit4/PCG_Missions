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
| `0003_staff_authorization_policy.sql` | 0 new domain tables | Seeds six fixed roles, operation-level capabilities, least-privilege role grants, and an append-only sensitive-record access audit ledger |

These migrations are a first porting slice from the live schema. They are not a complete replacement for the live 50 public tables and three private application tables.

## Current test coverage

The GitHub Actions workflow `Cloudflare D1 Foundation` runs the SQL migrations against an in-memory SQLite database and checks:
- migration application and non-production marker;
- identity foreign keys;
- temporal overlap rejection for staff role assignments, team membership, area coverage and contact assignments;
- adjacent assignment periods;
- append-only staff-access and follow-up-task event records;
- contact normalization, capture idempotency and metadata allowlists;
- follow-up task completion and target invariants.

A successful CI result proves the SQL is accepted by the CI runner's SQLite engine. It does not replace a D1 preview test, a Better Auth schema compatibility check, a Worker runtime test or a domain authorization test.

## Not implemented yet

- Better Auth runtime configuration and actual sign-in/session endpoints.
- Resend invitation and password-reset delivery.
- Capability and branch authorization middleware (policy catalogue seeded; runtime enforcement still pending).
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
