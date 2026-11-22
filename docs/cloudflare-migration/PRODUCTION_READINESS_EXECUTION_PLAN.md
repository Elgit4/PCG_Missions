# PCG Missions Cloudflare production-readiness plan

**Status:** Non-production implementation and synthetic verification are substantially complete. Production cutover remains blocked by restore, full data-integrity, authenticated acceptance, and rollback gates.

## Architecture and safety rules

- Official frontend: Cloudflare Pages project `pcg-missions`.
- Target application API: Cloudflare Workers.
- Target application database: Cloudflare D1 in EU jurisdiction.
- Identity provider: existing Supabase Auth project `cgwffpxlwgbnlinzwfoj`.
- Preserve all six roles: `admin_pastor`, `coordinator`, `team_leader`, `field_worker`, `follow_up_volunteer`, and `prayer_intercessor`.
- Do not introduce a second credential/session system or store password hashes, tokens, refresh tokens, or browser sessions in D1.
- SMS/Arkesel remains disabled and must not be enabled as part of this migration.
- Do not change official Pages production routing, import production data, or activate a production Worker until all release gates pass.

## Current verified state — 22 November 2026

### Non-production deployment

- Preview Worker: `pcg-missions-api-preview`.
- Active preview version: **27**, ID `51ad049f-c48d-4cc9-8718-910c39ea0393`, with 100% of preview traffic.
- Preview environment marker: `APP_ENV=non-production`.
- D1 binding: `pcg-missions-migration-test`, ID `74074d53-1edc-4ad7-83e6-bb3333a6ab4f`, EU jurisdiction, schema version 43.
- The existing Supabase URL and publishable key bindings are present. `SUPABASE_SERVICE_ROLE_KEY` is a Worker-only `secret_text` binding; its value is not in source or browser code.
- Event flyer files use the private Supabase Storage bucket `pcg-missions-event-media`; do not introduce R2 for this approved design.
- The production-named D1 `pcg-missions-production` is still marked `environment=non-production`. It is not a production runtime database.
- No `pcg-missions-api-production` Worker is serving application traffic.

### Worker-backed application workflows

The migration branch contains Worker routes and frontend adapters for:

- Supabase Auth token verification and branch-scoped staff/role/capability context.
- Contacts, contact notes, interactions, and follow-up task workflows.
- Team and service-area directory and administration.
- Staff directory and Admin/Pastor staff account administration.
- Internal notifications and recipient read state.
- Typed ministry reports, review, and resubmission.
- Event lifecycle, registration, cancellation, check-in, closeout, and private flyer operations.
- Event staff/team assignment, assignment validation, and revocation.
- Assigned prayer inbox and sensitive pastoral/prayer read handlers.
- Calendar and announcement draft operations.
- Staff password-reset requests, Admin/Pastor approval/denial, one-time temporary-password handoff, 24-hour expiry, and forced password-change lifecycle.

Sensitive pastoral reads require an allowed reason code for oversight, enforce active assignment for assigned reads, write metadata-only append-only access audits, and fail closed when the audit write fails. Narrative content is not copied into audit metadata.

### Automated verification

At test commit `b1b156528ef56c2656b78fba054c736c81515c97`:

- Cloudflare D1 Foundation passed, including **73 Python migration/security tests** and Worker typecheck.
- CMI web CI passed frontend typecheck, lint, tests, and production build.
- Preview Worker bundle and live route-boundary probes passed, including password recovery, event assignment, and sensitive pastoral read boundaries.
- Worker route, Auth, password workflow, event assignment, and sensitive-read test suites passed.
- Synthetic tests use controlled fixtures and mocked Auth/D1 adapters; no real staff account passwords or live account state are mutated.

The current PR head may contain documentation-only commits after this test commit. Re-run the full CI suite for any subsequent application-code changes.

These checks are not a substitute for authenticated browser acceptance using controlled staff sessions.

## Data and authorization reconciliation

Read-only comparison against Supabase covered 53 shared tables. **49 of 53 table counts match** across Supabase, migration-test D1, and production-named D1. Four tables differ:

| Table | Supabase | Migration-test D1 | Production-named D1 |
|---|---:|---:|---:|
| `public.capability` | 61 | 89 | 107 |
| `public.role_capability` | 65 | 128 | 128 |
| `public.calendar_entry` | 0 | 1 | 0 |
| `public.staff_access_audit` | 5 | 6 | 5 |

Authorization differences have been semantically decomposed:

- All 61 Supabase capability codes are present in migration-test D1.
- All 65 canonical role/capability/scope grants match the canonical grant list in migration `0041`.
- All 55 Worker compatibility grants match the explicit allowlist in migration `0042`; no extra role or broader scope was found.
- Eight additional directory grants are explicit and least-privilege: Admin/Pastor receives branch-scoped team/area read and management; Coordinator receives branch-scoped team/area read; Team Leader receives team-scoped team/area read; other roles receive none.
- The production-named D1 has 18 additional inactive capability rows with no role grants. Retain them until a separately reviewed cleanup decision; do not treat them as active permissions.
- No role has an `sms.*` grant. Legacy broad `prayer.request.read` and `prayer.request.share` capabilities have no role grants.
- The migration-test D1 has one additional rehearsal calendar entry and one additional staff-access audit event. Preserve both; do not delete them to force count parity.

Church, branch, staff-profile, password-reset-request, and password-reset-audit identities/counts were checked. Staff-role assignments were compared semantically by assignment ID, Auth identity, role code, branch, and revocation state.

**Still incomplete:** full row-by-row business-data/reference reconciliation and a successful foreign-key integrity check. The Cloudflare API foreign-key check previously returned `SQLITE_AUTH`; it remains unverified.

Detailed evidence: `D1_BACKUP_RECONCILIATION_EVIDENCE_2026-11-22.md`.

## Backup and restore status

- D1 SQL exports completed for both existing D1 databases; Time Travel bookmarks were captured.
- A fresh migration-test export was generated for a restore rehearsal.
- The signed R2 export URL could not be fetched because outbound requests to the R2 export host are blocked in the current execution environment. D1 import requires uploading the SQL file.
- A disposable EU D1 was created for the rehearsal and deleted after the transfer limitation was confirmed. No import was started; neither existing D1 database was modified.
- Export completion is not a restore test.
- An independently retained Supabase source backup and verified restore path are also outstanding. Available Supabase project tools do not expose a backup-download/restore workflow.

A runner with access to the signed R2 URL and Cloudflare D1 import API is required to complete the restore rehearsal.

## Release gates

### Gate 1 — Non-production build and route safety

<badge color="success">Passed at test commit b1b1565</badge>

- D1 migration chain replays to schema 43.
- Worker typecheck and route/auth/security tests pass.
- Frontend typecheck, lint, unit tests, and production build pass.
- Preview route-boundary probes pass.

### Gate 2 — Data and recovery

<badge color="warning">In progress</badge>

- Complete row-by-row reconciliation and foreign-key verification.
- Import the D1 SQL export into a disposable EU D1 and verify schema, data, constraints, and key references.
- Produce an independently retained Supabase backup and verify its restore path.
- Preserve and explain the extra rehearsal calendar and audit rows; no blind cleanup.

### Gate 3 — Authenticated role acceptance

<badge color="warning">Synthetic tests passed; browser acceptance outstanding</badge>

- Run controlled authenticated browser workflows for all six roles.
- Verify branch/team/assigned record boundaries, account lifecycle, reports, event assignments, notifications, and sensitive pastoral reads.
- Do not use live staff credentials for synthetic tests or change existing staff passwords as part of preview acceptance.

### Gate 4 — Production provisioning

<badge color="warning">Not started</badge>

- Provision a separate production Worker and verify production-only D1, secret bindings, allowed origins, logging, monitoring, and alerting.
- Verify the production D1 has the approved schema and data before it is bound to production.
- Keep the production-named D1's `non-production` marker unchanged until its use is explicitly approved.

### Gate 5 — Cutover and rollback

<badge color="warning">Not started</badge>

- Complete and rehearse a rollback using verified backups.
- Take a final source backup and perform controlled data synchronization.
- Obtain explicit release approval before changing official Pages production configuration/routing.
- Keep Supabase Auth as the identity provider and preserve the original source data for the agreed rollback period.

## Production safety boundary

- Official Pages production remains on `feat/cmi-pcg-missions-final-review-v6`.
- No production Worker is serving application traffic.
- The production-named D1 remains marked `environment=non-production`.
- No production Pages routing change, production data import, destructive reconciliation, or SMS send has been performed.

Production readiness means the official Pages frontend uses a separately configured production Worker and EU D1, all required workflows and six-role authorization tests pass, data reconciliation and backup/restore are verified, monitoring is active, and rollback has been rehearsed. A successful schema replay or preview deployment alone is not production readiness.
