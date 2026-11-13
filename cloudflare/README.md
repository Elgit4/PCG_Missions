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
- `GET /health` and `GET /api/v1/health` for non-production D1 readiness.
- Better Auth endpoints under `/api/auth/*` for provisioned-account sign-in and session management.
- `GET /api/v1/me` for verified staff context and active branch/capability metadata.
- `GET /api/v1/staff` for a limited branch-scoped staff directory.
- `GET /api/v1/staff/audit` for a paginated, branch-scoped staff governance audit.
- `POST/GET /api/v1/staff/invitations`, `POST /api/v1/staff/invitations/{id}/revoke`, and `POST /api/v1/staff/invitations/accept` for one-time, invitation-only staff account provisioning.
- `GET/POST /api/v1/contacts`, `GET/PATCH /api/v1/contacts/{id}`, and `POST /api/v1/contacts/{id}/interactions` for the first branch/team/assignment-scoped contact workflows.
- `POST /api/v1/staff/{profileId}/deactivate|suspend|reactivate` for audited account lifecycle changes.
- `GET/POST /api/v1/staff/role-revocations` and `POST /api/v1/staff/role-revocations/{id}/approve|reject` for two-person Admin/Pastor revocation.
- `POST /api/v1/staff/roles` and `DELETE /api/v1/staff/roles/{assignmentId}` for audited branch-scoped standard-role assignment and revocation by Admin/Pastor.
- `GET/POST /api/v1/staff/role-elevations` and `POST /api/v1/staff/role-elevations/{requestId}/approve|reject` for distinct-requester/reviewer Admin/Pastor elevation.

Public self-registration remains disabled. Business routes remain unavailable until handler-level authorization and same-query record scoping are implemented. See AUTHENTICATION_FOUNDATION.md for configuration and limitations.

## Current schema scope

Migration `0001_platform_core.sql` ports the first reviewed slice:
- Better Auth core identity/session/account/verification tables (to be checked against the pinned library schema before enabling sign-in).
- Church and branch tenancy.
- Roles, capabilities and role-capability scopes.
- Staff profiles, scoped role assignments and append-only staff access audit.
- Teams, service areas, membership and coverage with overlap-prevention triggers.

It is not yet the complete 50-table ministry schema. Contacts, follow-up, prayer/care, events, calendar, announcements, content and reports will be migrated as separately reviewed domain slices.

## Staff roles and authorization\n\nMigration 0003 seeds exactly six fixed roles and operation-specific capabilities with least-privilege scopes. It also enforces two owner-controlled initial Admin/Pastor bootstrap slots, independent second-admin approval for later elevations, and protection against removing the last active Admin/Pastor in a branch. Review STAFF_AUTHORIZATION_POLICY.md for the complete matrix and exclusions. Prayer access is explicit-share only; no baseline role receives pastoral-case access, export, or SMS-dispatch capability. Time-bounded record shares are immutable except for revocation and automatically write grant/revoke audit events. A separate append-only sensitive-record access ledger records purpose without storing narratives. The authorization helper in src/authorization.ts checks active staff, role, branch and supported record scopes; the current Worker still exposes no protected routes until a verified session resolver and handler-level SQL predicates are connected.\n\n## Authentication implementation

Better Auth `1.7.22` is pinned and mounted inside the Worker request lifecycle using the current D1 binding. Email/password sign-in for pre-provisioned accounts is enabled; public registration is disabled. Secure cookie/session defaults, exact origin allow-listing and rate limits are configured. The verified-session resolver maps an authenticated identity to an active staff profile and active branch role assignments. Staff invitation issuance, revocation and token acceptance are implemented. Invitations return a one-time bearer token for manual delivery because no email provider is configured; password-reset delivery remains fail-closed. See AUTHENTICATION_FOUNDATION.md.

The application must not expose a generic SQL API. D1 is accessed only by trusted Worker code. Every domain operation must resolve the actor from the verified session and check capability, branch and record scope before reading or mutating protected data.

## Safety

- No production D1 database is configured here.
- No production route or DNS is configured.
- No Supabase or Vercel setting is changed.
- No production records or credentials are copied.
- SMS sending is not implemented and remains disabled.
