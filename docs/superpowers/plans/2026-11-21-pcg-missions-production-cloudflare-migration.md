
# PCG Missions Production Cloudflare Migration Plan

> For agentic workers: use the superpowers executing-plans workflow to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Migrate PCG Missions from Supabase-backed business data operations to Cloudflare Workers and EU-jurisdiction D1 without interrupting the live app or weakening the six-role permission model.

**Architecture:** Keep Cloudflare Pages as the frontend host and retain Supabase Auth as the identity provider. Move business reads/writes to a production Worker backed by a dedicated EU D1 database; retain the current Supabase production project as the rollback/source-of-truth until route parity, data reconciliation and authenticated acceptance pass. Cut over Pages API routing only after a rehearsed, reversible release.

**Tech Stack:** Cloudflare Pages, Workers, D1 (EU jurisdiction), R2 for private event media, Supabase Auth, TypeScript, SQLite/D1 migrations, GitHub Actions.

**Spec:** docs/cloudflare-migration/PRODUCTION_READINESS_EXECUTION_PLAN.md, docs/cloudflare-migration/EXECUTION_STATUS.md, cloudflare/MIGRATION_STATUS.md, and the six-role policy in supabase-cmi/supabase/migrations/.

## Global Constraints

- Preserve all six roles: admin_pastor, coordinator, team_leader, field_worker, follow_up_volunteer, prayer_intercessor.
- Supabase Auth remains the identity provider during this migration; never copy passwords, password hashes, refresh tokens or session tokens into D1.
- Create the production D1 with jurisdiction = eu; jurisdiction cannot be added after creation.
- Production Worker must use APP_ENV=production, a D1 app_meta.environment=production marker, exact production CORS origins and server-only secrets.
- Do not route production Pages or staff traffic to an empty/rehearsal database.
- Keep SMS/Arkesel disabled.
- Never widen a role capability to make a route pass. Repeat branch/record/scope predicates in data queries.
- Keep the existing Supabase project and production Pages deployment available as the rollback target until after the agreed observation window.

## Review Focus

- Production app_meta cannot accept a production marker until migration 0040 safely broadens its CHECK constraint; verify both environment values and reject any other value.
- A D1 database created with the wrong jurisdiction cannot be repaired in place; assert eu before any production migration is applied.
- Role IDs, capability IDs and staff-profile IDs are foreign-key anchors; import them deterministically and reconcile every relationship.
- Auth user IDs remain external Supabase UUIDs; only the non-secret identity reference belongs in D1.
- Private event flyers require private R2 storage and strict object authorization; do not publish a bucket or copy signed URLs.
- Preview shares the live Supabase Auth tenant; avoid password reset/change flows and avoid test mutations against live staff records.

---

### Task 1: Make the D1 schema production-compatible

**Files:**
- Create cloudflare/migrations/0040_production_environment_marker.sql
- Modify cloudflare/tests/test_cmi_role_capability_migrations.py

**Interfaces:**
- Migration 0040 preserves the existing app_meta row and schema data, widens the environment CHECK to non-production or production, and advances schema version to 40.
- The migration must not itself mark the rehearsal database as production.

- [ ] Add a failing test that replays the complete chain and expects schema version 40 while retaining the non-production marker.
- [ ] Add a failing test proving the marker can be changed to production and rejects unsupported environment strings.
- [ ] Run the SQLite contract tests and confirm the new expectations fail before the migration is added.
- [ ] Add migration 0040 using a table rebuild that preserves the existing marker.
- [ ] Run the full SQLite contract suite and confirm it passes.

### Task 2: Provision isolated production infrastructure

**Resources/config:**
- Create EU D1 database pcg-missions-production.
- Create production Worker pcg-missions-api.
- Modify cloudflare/wrangler.toml.

- [ ] Create the production D1 with EU jurisdiction; verify Cloudflare reports jurisdiction=eu.
- [ ] Add a production Wrangler environment whose D1 binding points only to that production database and whose APP_ENV is production.
- [ ] Apply the complete ordered D1 migration chain through schema version 40 while the environment marker is still non-production.
- [ ] Initialize the environment marker to production only after migrations have completed; verify /health fails closed for mismatched environment values.
- [ ] Configure production CORS origins and observability; keep Auth Admin, R2 and other sensitive bindings absent until their secret/resource setup is independently verified.
- [ ] Keep the production Worker on an isolated workers.dev hostname until Pages acceptance passes.

### Task 3: Bring Cloudflare API parity to the production frontend contract

**Files:**
- Modify cloudflare/src/index.ts, focused route/domain modules, cloudflare/tests/worker-routes.test.mjs.
- Modify web/src/lib/api/ and domain adapters as needed.

- [ ] Inventory every frontend request and map it to a Worker route or an intentionally retained Supabase Auth/public-content route.
- [ ] Implement and test missing contact assignment/edit/history, follow-up writes/reassignment, typed ministry-report submit/review/resubmission/aggregate export, calendar, announcements/read receipts, event lifecycle/assignments/registration/cancellation/check-in/closeout, pastoral/prayer access, staff/password-reset governance and media operations.
- [ ] Keep public published content separate from private staff API routes.
- [ ] Require capability + branch/record scope before reads and writes; deny before D1 query/mutation when access is absent.
- [ ] Verify all five non-admin roles cannot reach administrative routes; verify assigned-only and explicit-share privacy boundaries.
- [ ] Implement private R2 event-flyer upload, preview, replacement and removal with strict content validation, size limits and signed URL expiry; keep bucket private.
- [ ] Preserve preview fail-closed behavior for any route not yet migrated.

### Task 4: Rehearse and execute deterministic data transfer

**Files:**
- Create cloudflare/scripts/ export/import/reconciliation tools and tests.
- Modify cloudflare/MIGRATION_STATUS.md.

- [ ] Capture a timestamped, read-only export of required Supabase business rows and record source counts/checksums.
- [ ] Exclude Supabase Auth credentials, password hashes, refresh tokens and sessions; preserve only auth_user_id identity references required to resolve verified Auth users.
- [ ] Define explicit Postgres-to-SQLite transformations for booleans, timestamps, JSON, enums, UUIDs and nullable values.
- [ ] Import with stable primary keys and dependency order; do not recreate or regenerate business IDs.
- [ ] Reconcile row counts, primary-key sets, foreign-key references, capability grants, role assignments, assignment windows and append-only audit history.
- [ ] Resolve the known staff-access audit discrepancy by tracing each row; never fabricate or silently discard an audit row.
- [ ] Repeat import into a clean rehearsal database and prove it is idempotent or fails safely on changed source data.
- [ ] Create and verify a D1 backup before any final production import and verify a restore into a separate test database.

### Task 5: Authenticated acceptance and operational readiness

**Files:**
- Modify .github/workflows/cloudflare-preview-bundle.yml, D1/Worker tests and migration runbooks.

- [ ] Run real Supabase-authenticated browser/API workflows for all six roles against isolated D1 fixtures; avoid password mutations against the shared production Auth tenant.
- [ ] Test unauthorized, cross-branch, out-of-scope, expired assignment, revoked assignment and disabled-team/staff cases.
- [ ] Verify production secrets are server-only; no service-role key or private R2 credentials enter Pages variables or browser bundles.
- [ ] Verify rate limits, request body limits, CORS, security headers, no-store behavior, audit trails, logs and alerts.
- [ ] Define a production backup, restore, rollback and incident procedure with named operational owners.
- [ ] Keep the Supabase API route available behind the frontend API adapter as the immediate rollback target until the observation window is accepted.

### Task 6: Controlled production cutover

- [ ] Promote the fully verified Worker production version at 0% or via a separate hostname for smoke acceptance before routing real traffic.
- [ ] Run read-only production smoke tests and authenticated role checks against the production D1 data set.
- [ ] Change production Pages VITE_CMI_WORKER_API_URL to the production Worker only after all earlier tasks are signed off.
- [ ] Verify the canonical production URL, sign-in, all six role workspaces and critical CRUD journeys.
- [ ] Monitor errors, authorization denials, latency and reconciliation counters through the observation window.
- [ ] Keep production Supabase data and routing unchanged as the fallback until the owner accepts final cutover.
- [ ] After acceptance, schedule a separate decision on decommissioning legacy business writes; do not delete Supabase data as part of the initial cutover.

