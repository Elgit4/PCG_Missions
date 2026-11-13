# PCG Missions — Cloudflare non-production migration

This is an isolated Cloudflare Workers + D1 implementation track. It is not connected to the live frontend and does not replace the production Supabase backend yet.

## Current non-production environment

- D1 database: `pcg-missions-dev`
- Database ID: `376a6782-d059-41f9-9e09-f93718fef2bb`
- Jurisdiction: EU (`eu`), primary region `EEUR`
- Remote EU D1 schema version: 24
- Remote migration ledger: 24 applied migrations
- Remote application tables: 77 (excluding Wrangler's migration ledger)
- Source branch includes migration 0025 (schema version 25); it is not yet applied remotely
- Full API Worker: not deployed
- Diagnostic Worker: `pcg-missions-d1-smoke`, read-only `GET /health` with the EU D1 binding; public HTTP response still needs independent verification
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

The prayer/care, events/attendance/transport and calendar/announcement/content schemas are present in the migration track. Worker source includes explicit-share pastoral-care case metadata, assignment, restricted interactions, status updates and reasoned revocation; event lifecycle and operations; calendar; announcements and recipient inbox; public content; and typed ministry reports. Migration 0025 adds stricter pastoral-care share and assignment guards but is pending application to remote EU D1. The full API Worker is not deployed or runtime-tested. Scheduled announcement publication is implemented as a five-minute Worker cron; due announcements publish only while the scheduling staff member retains active branch-level announcement authority.

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
- `GET/POST /api/v1/announcements`, `GET/PATCH /api/v1/announcements/{id}`, `POST /api/v1/announcements/{id}/publish` and `/archive` — audience-scoped announcement lifecycle.
- `GET /api/v1/announcements/inbox` — recipient-only in-app inbox with delivery and read status.
- `POST /api/v1/announcements/{id}/read` — idempotent read receipt for an announcement delivered to the authenticated staff member.
- `GET /api/v1/content`, `POST /api/v1/content/{kind}`, `PATCH /api/v1/content/{kind}/{id}`, `POST /api/v1/content/{kind}/{id}/publish|archive` — draft and publication lifecycle for welcome messages, sermons, daily words and digital tracts.
- `GET/PATCH /api/v1/content/profile`, `POST /api/v1/content/links`, `GET /api/v1/content/audit` — church profile management, immutable HTTPS document links and scoped content audit.
- `GET /api/public/content?branch_id={id}` — anonymous published-only public projection for church profile, welcome messages, sermons, daily words, tracts, public announcements, public events and approved HTTPS links.

These are source-code routes, not a live service yet: the Cloudflare Worker has not been deployed or runtime-tested.

## Not enabled yet

- Pastoral-care handlers are implemented in source under migration 0025's explicit-share model; real Worker/D1 integration tests and remote migration application remain outstanding.
- Public event registration remains disabled. Staff registration, capacity enforcement, transport reservations, check-in and closeout handlers are implemented in source but not deployed or runtime-tested; event visibility remains staff-only by default.
- Advanced report comparisons, privacy-controlled report exports, and secure Supabase export/import reconciliation.
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

The last recorded GitHub Actions run, [43469371911](https://github.com/Elgit4/PCG_Missions/actions/runs/43469371911), passed 56 Python/SQLite migration and authorization tests and the Worker/Better Auth TypeScript type-check for the earlier schema slice. PR #61 adds API contract and event-audit regression tests; a passing run for those new tests has not yet been observed.

The remote EU D1 database last verified at schema version 24, 24 migration records and 77 application tables (excluding the Wrangler migration ledger), with no foreign-key violations. Migration 0025 is present in the source branch but remains unapplied remotely. This is not a substitute for deployed Worker request tests or Better Auth runtime compatibility testing.

The Worker passes TypeScript checking and `wrangler deploy --dry-run` bundling. GitHub Actions is configured to deploy only `pcg-missions-api-nonprod` from `migration/cloudflare-nonprod-completion`; the deploy step currently skips because the repository secret `CLOUDFLARE_API_TOKEN` is not configured. Add it under **Settings → Secrets and variables → Actions** with scoped Workers Scripts edit permission. Do not paste the token into source control or chat. After deployment, set the persistent `BETTER_AUTH_SECRET` Worker secret and add the actual frontend origin to `BETTER_AUTH_TRUSTED_ORIGINS` before browser sign-in testing.

## Safety boundary

- No production D1 database is configured.
- No production route or DNS is configured.
- No Supabase or Vercel production setting is changed.
- No production records or credentials are copied.
- No frontend cutover or production deployment has occurred.
