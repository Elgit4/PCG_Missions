# PCG Missions — Cloudflare non-production migration

This is an isolated Cloudflare Workers + D1 implementation track. It is not connected to the live frontend and does not replace the production Supabase backend yet.

## Current non-production environment

- D1 database: `pcg-missions-dev`
- Database ID: `376a6782-d059-41f9-9e09-f93718fef2bb`
- Jurisdiction: EU (`eu`), primary region `EEUR`
- Remote EU D1 schema version: 28
- Migration branch target schema: 31 (event flyer metadata + team/service-area integrity guards; not yet applied remotely)
- Event-media storage: private EU-jurisdiction R2 bucket `pcg-missions-event-media-nonprod` is configured in Worker bindings; Cloudflare account-level R2 activation and R2 Edit token scope are still required before the deployment preflight can create it
- Remote migration ledger: 28 applied migrations
- Remote application tables: 81 (excluding Wrangler's migration ledger)
- EU non-production D1 verification: schema 28, 28 ledger entries, 81 application tables, zero foreign-key violations; primary query region `EEUR`
- Full API Worker: `pcg-missions-api-nonprod` deployed on 2026-11-13 from the migration branch; deployment workflow confirmed health response and unauthenticated API gate
- Diagnostic Worker: `pcg-missions-d1-smoke`, retained as a separate read-only diagnostic service
- Diagnostic URL: https://pcg-missions-d1-smoke.pcg-missions-nonprod.workers.dev/health
- Production Supabase, Vercel, DNS and live data: unchanged

The database was created with an EU jurisdiction. This setting is fixed at creation time. EU D1 placement does not, by itself, guarantee EU-only processing for Worker execution, logs, email delivery, analytics or third-party providers; those require separate data-location review.

## Implemented backend foundations

- Six fixed roles with least-privilege, branch-scoped capability grants.
- Branch-scoped Teams & Service Areas administration with append-only audit, active-staff validation, Team Leader role checks and protected coverage lifecycle.
- Better Auth `1.7.22` integration code, D1-backed sessions and database-backed rate limiting.
- Invitation-only staff onboarding; the invitee establishes their own password.
- Audited staff deactivation, suspension and reactivation, with immediate session revocation.
- Two-person Admin/Pastor elevation and revocation, including last-Admin protection.
- Branch/team/assignment-scoped contact and follow-up handlers.
- Explicit-share prayer workflows: metadata-only Admin/Pastor queue, assigned intercessor narrative reads, reasoned share revocation and transactionally paired audit records.
- Append-only access, role, account, contact-assignment and follow-up event ledgers.

The prayer/care, events/attendance/transport and calendar/announcement/content schemas are present in the migration track. Worker source includes explicit-share pastoral-care case metadata, assignment, restricted interactions, status updates and reasoned revocation; event lifecycle and operations; calendar; announcements and recipient inbox; public content; and typed ministry reports. Migration 0025 adds stricter pastoral-care share and assignment guards and is applied to remote EU D1. The full API Worker is deployed to the isolated non-production environment. The deployment pipeline verified `/health` against schema 28 and confirmed the unauthenticated staff-context endpoint returns HTTP 401; authenticated business-domain acceptance remains in progress. Scheduled announcement publication is implemented as a five-minute Worker cron; due announcements publish only while the scheduling staff member retains active branch-level announcement authority.

## Worker endpoints implemented in source

- `GET /health` and `GET /api/v1/health` — non-production database readiness.
- `/api/auth/*` — Better Auth endpoints for provisioned accounts.
- `GET /api/v1/me` — verified staff context, branch assignments and capability metadata.
- `GET /api/v1/pastoral/care`, `POST /api/v1/pastoral/care`, `GET/PATCH /api/v1/pastoral/care/{id}`, `POST /api/v1/pastoral/care/{id}/assignments`, `POST /api/v1/pastoral/care/{id}/assignments/{assignmentId}/revoke` and `POST /api/v1/pastoral/care/{id}/interactions` — branch-limited case metadata and explicit-share-only restricted case access, with separate audit ledger.
- `GET /api/v1/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` — aggregate-only branch KPIs; report access requires the `reports.read` capability and excludes personal identifiers and prayer narratives.
- `GET /api/v1/staff` and `GET /api/v1/staff/audit` — scoped staff directory and governance audit.
- `POST/GET /api/v1/staff/invitations`, `POST /api/v1/staff/invitations/{id}/revoke`, `POST /api/v1/staff/invitations/accept` — invitation lifecycle.
- `POST /api/v1/staff/{profileId}/deactivate|suspend|reactivate` — audited account lifecycle.
- `POST/DELETE /api/v1/staff/roles` — standard role assignment and revocation.
- `GET/POST /api/v1/staff/role-elevations` and `POST /api/v1/staff/role-elevations/{id}/approve|reject` — two-person elevation.
- `GET/POST /api/v1/staff/role-revocations` and `POST /api/v1/staff/role-revocations/{id}/approve|reject` — two-person revocation.
- `GET/POST /api/v1/contacts`, `GET/PATCH /api/v1/contacts/{id}`, `GET/POST /api/v1/contacts/{id}/notes`, `GET/POST /api/v1/contacts/{id}/interactions` and `POST /api/v1/contacts/{id}/assign`.
- `GET/POST /api/v1/followup/tasks`, `PATCH /api/v1/followup/tasks/{id}` and task assignment routes.
- `GET/POST /api/v1/events`, `GET/PATCH /api/v1/events/{id}`, `GET /api/v1/events/{id}/audit`, `POST /api/v1/events/{id}/publish` and `/cancel` — scoped event listing, draft creation/editing, branch-manager audit and staff-only lifecycle.
- `POST /api/v1/events/{id}/registration/open|close` — branch-manager control of registration state.
- `GET/POST /api/v1/events/{id}/registrations` and `POST /api/v1/events/{id}/registrations/{registrationId}/cancel` — staff registration, capacity checks and replay-safe cancellation.
- `GET/POST /api/v1/events/{id}/checkins` — scoped attendance recording and history.
- `GET/POST /api/v1/events/{id}/transport-options`, `PATCH /api/v1/events/{id}/transport-options/{optionId}`, `GET/POST /api/v1/events/{id}/transport-reservations` and `POST /api/v1/events/{id}/transport-reservations/{reservationId}/cancel` — transport capacity and reservation lifecycle.
- `GET/POST /api/v1/events/{id}/closeout`, `POST /api/v1/events/{id}/closeout/resubmit` and `/review` — closeout submission, resubmission and separate review capability.
- `GET/POST /api/v1/calendar`, `GET/PATCH /api/v1/calendar/{id}` — branch/team/own/event-scoped calendar entries.
- `POST /api/v1/calendar/series` and `POST /api/v1/calendar/series/{id}/cancel` — timezone-aware daily/weekly/monthly series with bounded occurrence generation, series-level audit and reasoned future-occurrence cancellation.
- `GET/POST /api/v1/announcements`, `GET/PATCH /api/v1/announcements/{id}`, `POST /api/v1/announcements/{id}/publish` and `/archive` — audience-scoped announcement lifecycle.
- `GET /api/v1/announcements/inbox` — recipient-only in-app inbox with delivery and read status.
- `POST /api/v1/announcements/{id}/read` — idempotent read receipt for an announcement delivered to the authenticated staff member.
- `GET /api/v1/content`, `POST /api/v1/content/{kind}`, `PATCH /api/v1/content/{kind}/{id}`, `POST /api/v1/content/{kind}/{id}/publish|archive` — draft and publication lifecycle for welcome messages, sermons, daily words and digital tracts.
- `GET/PATCH /api/v1/content/profile`, `POST /api/v1/content/links`, `GET /api/v1/content/audit` — church profile management, immutable HTTPS document links and scoped content audit.
- `GET /api/public/content?branch_id={id}` — anonymous published-only public projection for church profile, welcome messages, sermons, daily words, tracts, public announcements, public events and approved HTTPS links.

These routes are deployed on the non-production Worker. Initial remote smoke verification covers Worker health, the EU D1 schema marker and the unauthenticated staff-context gate; it does not yet constitute full authenticated acceptance of every business route.

## Not enabled yet

- Pastoral-care handlers are deployed under migration 0025's explicit-share model; authenticated cross-branch, assignment-expiry and audit-failure acceptance tests remain outstanding.
- Public event registration remains disabled. Staff registration, capacity enforcement, transport reservations, check-in and closeout handlers are deployed but still require authenticated remote acceptance; event visibility remains staff-only by default.
- Secure Supabase export/import reconciliation and Worker runtime verification of the aggregate CSV export.
- Public registration, public prayer intake, offline access, SMS and email notifications.
- Invitation email delivery and invitation acceptance UI. Password-reset email delivery is implemented through the Resend adapter but requires `RESEND_API_KEY` and a verified `EMAIL_FROM` sender.

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

Current-head Cloudflare validation run [43526171588](https://github.com/Elgit4/PCG_Missions/actions/runs/43526171588) passed: SQLite/security tests, Worker and Better Auth type-check, Wrangler dry-run build, local Worker/D1 integration, required deployment-secret checks, remote D1 migration reconciliation, Worker deployment and post-deploy health/API-gate verification. The PR validation run is [43526176723](https://github.com/Elgit4/PCG_Missions/actions/runs/43526176723).

The remote EU D1 database is verified at schema version 28, 28 migration records and 81 application tables (excluding the Wrangler migration ledger), with no foreign-key violations. Migrations 0025–0028 are applied. The deployed Worker returned the expected non-production health payload and HTTP 401 for an unauthenticated staff-context request. This is not a substitute for authenticated acceptance across every domain or independent Better Auth account lifecycle tests.

The Worker passes TypeScript checking, Wrangler dry-run bundling and local D1 integration. GitHub Actions deployed `pcg-missions-api-nonprod` from `migration/cloudflare-nonprod-completion`; both `CLOUDFLARE_API_TOKEN` and `BETTER_AUTH_SECRET` passed the workflow's presence/length gate and the Better Auth secret was provisioned as a Worker secret. The workflow now fails closed if either required secret is absent, applies pending migrations, deploys only the non-production Worker and verifies D1 schema 28 plus the unauthenticated API gate. Never paste secrets into source control or chat. The stable Vercel preview origin is already in the Worker allow-list; any additional preview origin must be added as an exact origin before browser sign-in testing.

## Safety boundary

- No production D1 database is configured.
- No production route or DNS is configured.
- No Supabase or Vercel production setting is changed.
- No production records or credentials are copied.
- No frontend cutover or production deployment has occurred.
