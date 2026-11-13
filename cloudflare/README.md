# PCG Missions — Cloudflare non-production foundation

This is an isolated Cloudflare Worker + D1 implementation track. It does not replace or proxy the current production API and is not wired into the live frontend.

## Data jurisdiction

Create the development database with an EU jurisdiction. This is a creation-time setting and cannot be changed later:

```bash
npx wrangler@latest d1 create pcg-missions-dev --jurisdiction=eu
```

Copy the returned database UUID into `cloudflare/wrangler.toml` under `[[d1_databases]].database_id`. Never use a production database ID in this file. Do not omit `--jurisdiction=eu`.

Cloudflare documents that the jurisdiction restriction applies to where the D1 database runs and persists. It does not automatically guarantee EU-only processing for Worker execution, logs, email delivery, analytics, or other Cloudflare products/providers. Those need a separate data-location review.

## Local development

From the repository root:

```bash
cd cloudflare
npx wrangler@latest d1 migrations apply pcg-missions-dev --local
npx wrangler@latest dev --local
```

Local D1 persistence is isolated from remote databases. Do not add `--remote` during this foundation phase.

The Worker exposes:
- `GET /health`
- `GET /api/v1/health`

The readiness endpoint returns success only when the non-production D1 migration has been applied. All other routes return 404 intentionally; business routes must not be exposed until authentication and authorization are implemented and tested.

## Current schema scope

Migration `0001_platform_core.sql` ports the first reviewed slice:
- Better Auth core identity/session/account/verification tables (to be checked against the pinned library schema before enabling sign-in).
- Church and branch tenancy.
- Roles, capabilities and role-capability scopes.
- Staff profiles, scoped role assignments and append-only staff access audit.
- Teams, service areas, membership and coverage with overlap-prevention triggers.

It is not yet the complete 50-table ministry schema. Contacts, follow-up, prayer/care, events, calendar, announcements, content and reports will be migrated as separately reviewed domain slices.

## Staff roles and authorization\n\nMigration 0003 seeds exactly six fixed roles and operation-specific capabilities with least-privilege scopes. Review STAFF_AUTHORIZATION_POLICY.md for the complete matrix and exclusions. Prayer access is explicit-share only; no baseline role receives pastoral-case access, export, or SMS-dispatch capability. A separate append-only sensitive-record access ledger records access purpose without storing narratives. This is policy data only: the Worker still needs to enforce session, branch, team, assignment and explicit-share predicates before any protected route is enabled.\n\n## Authentication gate

Better Auth is the selected candidate because current documentation supports a D1 database binding directly. Before enabling it, pin the package version and verify its generated schema against migration 0001. Validate email/password, secure sessions, reset and invitation delivery, account deactivation, session revocation, first-admin bootstrap, rate limiting and CSRF/origin protections. Do not migrate Supabase password hashes or sessions.

The application must not expose a generic SQL API. D1 is accessed only by trusted Worker code. Every domain operation must resolve the actor from the verified session and check capability, branch and record scope before reading or mutating protected data.

## Safety

- No production D1 database is configured here.
- No production route or DNS is configured.
- No Supabase or Vercel setting is changed.
- No production records or credentials are copied.
- SMS sending is not implemented and remains disabled.
