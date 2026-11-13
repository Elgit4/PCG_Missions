# PCG Missions — Cloudflare non-production migration

This is an isolated Cloudflare Workers + D1 implementation track. It is not connected to the live frontend and does not replace the production Supabase backend yet.

## Current non-production environment

- D1 database: `pcg-missions-dev`
- Database ID: `376a6782-d059-41f9-9e09-f93718fef2bb`
- Jurisdiction: EU (`eu`), primary region `EEUR`
- Schema version: 15
- Migration ledger: 15 applied migrations
- Application tables: 69
- Full API Worker: not deployed yet
- Diagnostic Worker: `pcg-missions-d1-smoke` deployed with read-only `GET /health` and the EU D1 binding
- Diagnostic URL: https://pcg-missions-d1-smoke.pcg-missions-nonprod.workers.dev/health
- Production Supabase, Vercel, DNS and live data: unchanged

The database was created with an EU jurisdiction. This setting is fixed at creation time. EU D1 placement does not, by itself, guarantee EU-only processing for Worker execution, logs, email delivery, analytics or third-party providers; those require separate data-location review.

## Implemented backend foundations

- Six fixed roles with least-privilege, branch-scoped capability grants.
- Better Auth `1.7.22` integration code, D1-backed sessions and database-backed rate limiting.
- Invitation-only staff onboarding; the invitee establishes their own password.
- Audited staff deactivation, suspension and reactivation, with immediate session revocation.
- Two-person Admin/Pastor elevation and revocation, including last-Admin protection.
- Branch/team/assignment-scoped contact and follow-up handlers.
- Explicit-share prayer workflows: metadata-only Admin/Pastor queue, assigned intercessor narrative reads, reasoned share revocation and transactionally paired audit records.
- Append-only access, role, account, contact-assignment and follow-up event ledgers.

The prayer/care, events/attendance/transport and calendar/announcement/content schemas are present in D1. Not all of those domains have Worker handlers yet.

## Worker endpoints implemented in source

- `GET /health` and `GET /api/v1/health` — non-production database readiness.
- `/api/auth/*` — Better Auth endpoints for provisioned accounts.
- `GET /api/v1/me` — verified staff context, branch assignments and capability metadata.
- `GET /api/v1/staff` and `GET /api/v1/staff/audit` — scoped staff directory and governance audit.
- `POST/GET /api/v1/staff/invitations`, `POST /api/v1/staff/invitations/{id}/revoke`, `POST /api/v1/staff/invitations/accept` — invitation lifecycle.
- `POST /api/v1/staff/{profileId}/deactivate|suspend|reactivate` — audited account lifecycle.
- `POST/DELETE /api/v1/staff/roles` — standard role assignment and revocation.
- `GET/POST /api/v1/staff/role-elevations` and `POST /api/v1/staff/role-elevations/{id}/approve|reject` — two-person elevation.
- `GET/POST /api/v1/staff/role-revocations` and `POST /api/v1/staff/role-revocations/{id}/approve|reject` — two-person revocation.
- `GET/POST /api/v1/contacts`, `GET/PATCH /api/v1/contacts/{id}`, and contact notes, interactions and assignment routes.
- `GET/POST /api/v1/followup/tasks`, `PATCH /api/v1/followup/tasks/{id}` and task assignment routes.
- `GET /api/v1/pastoral/prayer/queue` — metadata-only assignment queue.
- `GET /api/v1/pastoral/prayer/assigned` — narrative reads only for an actively assigned intercessor with a matching explicit share.
- `POST /api/v1/pastoral/prayer/requests/{id}/shares` and `POST /api/v1/pastoral/prayer/requests/{id}/shares/{shareId}/revoke` — explicit share grant/revocation.
- `PATCH /api/v1/pastoral/prayer/requests/{id}` — assigned intercessor status update.

These are source-code routes, not a live service yet: the full Cloudflare API Worker has not been deployed. The separate diagnostic Worker exposes only a read-only health check and does not serve these API routes.

## Not enabled yet

- Pastoral-care narrative read/write endpoints; the care domain remains restricted pending explicit care-reader capability approval.
- Event lifecycle APIs, capacity enforcement, registrations, transport reservations, check-in and closeout.
- Calendar and announcement management APIs.
- Public-content editing and read projections.
- Reporting, analytics and full Supabase export/import reconciliation.
- Public registration, public prayer intake, offline access, SMS and email notifications.
- Invitation/password-reset email delivery. Invitation tokens are currently returned once for authorized manual delivery; password reset fails closed until a provider is configured.

## Local development

From the repository root:

```bash
cd cloudflare
npm install
npx wrangler d1 migrations apply pcg-missions-dev --local
npm run typecheck
npx wrangler dev --local
```

Local D1 is isolated from the remote EU database. Do not add `--remote` for routine local development.

For local Better Auth testing, create an untracked `.dev.vars` file:

```dotenv
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=http://localhost:8787
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:5173
```

Use a generated secret and never commit `.dev.vars`. For a Cloudflare preview, set secrets and origins only on the non-production Worker.

## Verification

The latest GitHub Actions run, [43469371911](https://github.com/Elgit4/PCG_Missions/actions/runs/43469371911), passed:

- 56 Python/SQLite migration and authorization tests.
- Worker and Better Auth TypeScript type-check.

The remote EU D1 database reports schema version 15, all 15 migration records, 69 application tables and no foreign-key violations. A separate diagnostic Worker has been uploaded with the D1 binding and its `workers.dev` route enabled. Its public HTTP response and the full API runtime still require verification; this is not a substitute for Better Auth runtime compatibility testing.

## Safety boundary

- No production D1 database is configured.
- No production route or DNS is configured.
- No Supabase or Vercel production setting is changed.
- No production records or credentials are copied.
- No frontend cutover or production deployment has occurred.
