# PCG Missions Cloudflare production-readiness plan

**Official frontend:** https://pcg-missions.pages.dev/  
**Target application backend:** Cloudflare Workers  
**Target application database:** Cloudflare D1, EU jurisdiction  
**Identity provider:** Existing Supabase Auth  
**Status:** In progress; production cutover is blocked.

This document is an execution checklist, not a claim that the listed work is complete.

## Non-negotiable architecture

- Keep the existing Cloudflare Pages project `pcg-missions` as the only official frontend.
- Use Cloudflare Workers for application APIs and D1 for application data.
- Retain the existing Supabase Auth project and all existing Auth user identities.
- Remove Better Auth from the target architecture. Do not create a second credential/session system.
- Store no password hashes, access tokens, refresh tokens or browser sessions in D1.
- Preserve all six roles: `admin_pastor`, `coordinator`, `team_leader`, `field_worker`, `follow_up_volunteer`, `prayer_intercessor`.
- Do not enable SMS/Arkesel as part of this migration.
- Do not switch production Pages variables or production API routing until acceptance gates pass.

## Current verified blockers — 21 November 2026

The migration now has a deployed non-production Worker and a Pages preview wired to it. This is a working preview integration, not a production cutover.

1. The preview Worker `pcg-missions-api-preview` is deployed on workers.dev and bound to the isolated EU D1 rehearsal database. Its runtime smoke checks pass for health/schema, anonymous-auth rejection, CORS and the team/service-area route families.
2. The Pages preview branch `feat/cloudflare-d1-migration-foundation` embeds the Worker API origin through `web/wrangler.toml` `[env.preview.vars]`. `[env.production.vars]` explicitly leaves `VITE_CMI_WORKER_API_URL` empty. The official production branch and production backend remain unchanged.
3. Frontend API routing now uses the Worker for staff session context, contact listing, contact-note reads/creation, follow-up task listing, staff directory, notifications, and complete team/service-area CRUD including membership and coverage. Other operations continue to use the existing Supabase Edge Function path; this is an intentional transitional boundary.
4. Full route parity remains incomplete. Reports, pastoral request lifecycle, event flyer storage, and some prayer, event and staff-account workflows still require migration and authenticated acceptance. The active Supabase project does not currently expose all of the legacy Edge Function slugs referenced by the frontend.
5. The preview Worker was uploaded through the connected Cloudflare account because GitHub Actions still injects an empty `CLOUDFLARE_API_TOKEN`. The bundle/build/smoke workflow now runs independently; the credential-based deployment workflow is manual-only. Future automatic GitHub-to-Cloudflare deployments still need the secret scope corrected.
6. The Worker bundle currently has no `SUPABASE_SERVICE_ROLE_KEY` secret. Supabase Auth user administration/invitation provisioning must remain on the existing trusted Supabase path until that Worker-only secret is provisioned and tested.
7. The EU D1 database `pcg-missions-migration-test` remains a rehearsal only: schema version 39, 86 application tables, 63 active capabilities, 73 active role-capability grants, 3 staff profiles, 2 role assignments, 3 Supabase identity references, and 6 staff-access audit rows. `PRAGMA foreign_key_check` returns no violations. This does not establish source-to-destination data parity or production readiness.
8. Deterministic, repeatable import/export and reconciliation, backup/restore rehearsal, six-role authenticated browser acceptance, monitoring, rollback and production D1 provisioning remain incomplete.
9. The official Pages project still uses production branch `feat/cmi-pcg-missions-final-review-v6`. Production Pages configuration, Supabase Auth identities, Supabase data and production routing remain unchanged.

## Latest non-production authorization and Worker verification — 21 November 2026

- D1 rehearsal migrations 0038 and 0039 are now applied; the active schema version is 39. The Admin/Pastor role has branch-level team/service-area management, Coordinator has branch-level directory-read access, and Team Leader has team-scoped directory-read access. The three other roles receive no team/service-area directory grants.
- Worker directory queries now enforce those read scopes in SQL. Team Leaders see only their own active team and areas with active coverage associated with members of that team. Staff names remain separately protected by `staff.directory.read`.
- Preview Worker v5 (`c7eff623-511d-446b-a427-7e4589813f49`) is deployed to the non-production Worker and points only to the EU rehearsal D1 database. The post-deployment smoke run [44946876309](https://github.com/Elgit4/PCG_Missions/actions/runs/44946876309) passed health/schema 39, unauthenticated route and mutation rejection, CORS and Pages bundle checks.
- CI evidence: [D1 Foundation 44946503388](https://github.com/Elgit4/PCG_Missions/actions/runs/44946503388) passed; [CMI web CI 44946503429](https://github.com/Elgit4/PCG_Missions/actions/runs/44946503429) passed frontend type-check, lint, tests and build.
- This does not satisfy the authenticated six-role acceptance gate. It also does not resolve the source-to-D1 audit-row reconciliation, missing Worker service-role secret, incomplete API parity, repeatable import/restore/rollback rehearsal or production cutover gates.

## Workstream A — Identity and session security

- Implemented request-scoped Supabase access-token verification in the Worker using Supabase's authenticated user endpoint; do not replace this with local JWT decoding.
- Implemented resolution from the verified Auth UUID to a D1 staff profile and branch/role/capability context.
- Enforce active profile, active branch assignment, current role, capability, resource scope and record ownership on protected Worker routes.
- Invalid/missing tokens and Auth upstream failures fail closed. Deployed preview smoke verifies anonymous staff-context and team/area route rejection.
- Removed Better Auth from the current Worker runtime and package dependencies. Historical migration artifacts are retained only as migration history.
- Implemented the Supabase Auth Admin create/compensation adapter in source. The preview Worker still needs the server-only `SUPABASE_SERVICE_ROLE_KEY` secret before Worker-side invitation provisioning can be enabled.
- Preserve administrator-provisioned accounts, no public self-signup, first-login password change, 24-hour temporary-password expiry and administrator-assisted reset semantics.
- Keep service-role credentials exclusively in Worker secrets. Never return or log them.
- Extend authenticated integration coverage for expired/revoked tokens, inactive staff, missing profile, branch mismatch, revoked/expired role assignments, Auth outage, duplicate invitation acceptance and compensation failures.

## Workstream B — Database and data correctness

- Reconcile every source migration and the existing D1 migration ledger; do not equate migration counts with feature parity.
- Map all 29 Supabase source migrations, including the 12 outstanding features, to ordered SQLite-compatible D1 migrations.
- Verify constraints, indexes, triggers, foreign keys, unique keys, timestamps, JSON semantics and transaction boundaries.
- Reconcile the production capability catalogue and role grants by exact capability/role/scope, not totals alone.
- Build a repeatable export/import process with deterministic IDs and audit behavior.
- Compare source and destination counts, key relationships and representative records.
- Run `PRAGMA foreign_key_check`, migration replay from empty state, upgrade replay from the staged baseline, and restore/re-import tests.
- Keep the Supabase source unchanged until a separate production migration approval.

## Workstream C — Complete backend parity

Port and verify every required operation currently provided by Supabase Edge Functions and PostgreSQL RPCs. Maintain a route-to-handler-to-capability matrix.

Required modules and current state:
- staff authentication lifecycle and account administration — Supabase Auth remains active; Worker-side Auth Admin invitation provisioning is blocked on the Worker-only service-role secret;
- contacts, notes, interactions and follow-up tasks — Worker preview supports contact listing, contact-note list/create and follow-up task reads; contact writes/interactions and task writes remain on the existing Supabase path;
- pastoral care and assigned prayer inbox — partial Worker route handlers exist, but the frontend adapter and full lifecycle parity are outstanding;
- teams and service areas — branch-scoped Worker preview supports list/create/update, team membership role/add/revoke and service-area coverage add/revoke; authenticated write acceptance remains outstanding;
- typed ministry reports, review and resubmission — not yet ported to Worker;
- internal notifications and recipient-scoped read state — Worker preview route mapping is implemented;
- public content, announcements and content operations — existing Pages/Supabase routes remain in use pending Worker parity;
- calendar and event management — existing Pages/Supabase routes remain in use pending Worker parity;
- event staff assignment, registration, cancellation, check-in and closeout — Worker parity outstanding;
- event flyer upload, metadata and private delivery — R2 integration and Worker handlers outstanding;
- audit logging and first-admin bootstrap — D1 audit foundations exist; complete production acceptance remains outstanding.

Do not expose a route until its authorization, validation, rate limiting, idempotency, error handling and tests are in place.

## Workstream D — Frontend integration

- Inventory every frontend call to Supabase Edge Functions and database APIs.
- Introduce an environment-configured API base URL with distinct preview and production values.
- Keep the existing Pages `/api/auth` proxy for the supported Supabase Auth flows until each route has a verified replacement or an explicitly approved retained Auth-only responsibility.
- Connect preview frontend only to the non-production Worker and D1 database.
- Preserve current UI behavior, role-specific navigation, loading/error states and responsive layouts.
- Verify no production build contains non-production endpoints, secrets or test data.

## Workstream E — Cloudflare infrastructure and operations

- Keep existing non-production resources intact while testing.
- Provision production D1 with EU jurisdiction only after approval and documented schema compatibility.
- Configure production Worker bindings and secrets separately from preview.
- Use R2 for private event flyers only after the account feature and access policies are approved and configured.
- Configure rate limits, request size limits, security headers, origin allowlists, structured redacted logs and health checks.
- Add monitoring for Worker exceptions, D1 failures, Auth upstream failures and latency.
- Evaluate Workers Paid using measured CPU and request requirements; do not upgrade without an approved cost estimate.
- Document D1 export, restore and rollback procedures.

## Workstream F — Required release gates

### Gate 1: Non-production build
- Clean install, lint, typecheck, unit tests and Worker tests pass.
- All D1 migrations replay successfully from an empty database.
- All Worker routes have automated authorization and validation tests.

### Gate 2: Data rehearsal
- Backup/export is verified.
- Import is repeatable and produces deterministic counts.
- Foreign-key and integrity checks pass.
- All six roles and branch/resource boundaries are tested.

### Gate 3: Frontend acceptance
- Preview Pages is connected only to preview Worker/D1.
- Sign-in, refresh, logout, password change and administrator reset request flows work.
- Desktop and mobile workflows pass for all six roles.
- No production data is written by preview.

### Gate 4: Production authorization
Requires separate explicit approval for:
- creating paid resources or upgrading plans;
- creating production D1/Worker/R2 resources;
- importing production data;
- changing official Pages production variables or API routing;
- retiring any Supabase business-data services.

### Gate 5: Cutover and rollback
- Take and verify final source backup.
- Perform final controlled data synchronization.
- Switch official Pages to the production Worker only after all previous gates pass.
- Verify critical workflows and monitor errors.
- Keep the original Supabase application data available for the agreed rollback period.
- Do not delete Supabase Auth; it remains the identity provider.

## Definition of production ready

The application is production ready on Cloudflare only when the official Pages frontend uses the production Worker, the Worker uses the production EU D1 database, Supabase Auth remains the sole identity authority, all required business operations and six-role authorization tests pass, private files are correctly protected, data reconciliation and backup/restore are verified, monitoring is active, and a tested rollback procedure exists.

A successful D1 schema replay alone is not production readiness.
