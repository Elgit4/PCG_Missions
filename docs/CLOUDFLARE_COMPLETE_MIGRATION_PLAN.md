# PCG Missions — Complete Cloudflare Migration Plan

**Status:** Audit and planning baseline; no production migration has started  
**Audit date:** 2026-11-13  
**Repository baseline:** `main` at `05b2fee07e4e9438b2e68bd3b0b576f60dfd01eb`  
**Current production providers:** Vercel (web hosting) + Supabase (Auth, PostgreSQL, Edge Functions)  
**Target:** Cloudflare Pages/Workers + D1 + Cloudflare-managed background services, with Supabase retired only after verified cutover

---

## 1. Executive recommendation

Migrate in stages to a Cloudflare-native application platform:

| Responsibility | Target service | Notes |
| --- | --- | --- |
| React/Vite frontend | Cloudflare Pages | Keep the existing static SPA build initially. |
| Application API and authorization | Cloudflare Workers | One trusted API boundary; browser never receives database credentials or direct D1 access. |
| Relational data | Cloudflare D1 | SQLite-compatible SQL; this is a real PostgreSQL-to-SQLite redesign, not a connection-string swap. |
| Identity and sessions | Better Auth on D1, subject to a compatibility proof-of-concept | Better Auth documents a community Cloudflare D1/Kysely dialect. Verify invitations, forced password change, reset, revocation and account deactivation before adopting it. |
| File/object storage | R2 only if required | The audited Supabase project currently has no Storage buckets or stored objects; do not create an unnecessary storage migration. |
| Asynchronous work | Queues + a separate consumer Worker | Use for future outbox dispatch and retry-safe background work. Pages Functions can produce queue messages, but a separate Worker must consume them. |
| Scheduled work | Workers Cron Triggers | Use for scheduled publication, reminders and retention jobs where required. |
| Transactional email | Resend initially | Current staff-auth code uses Resend. This remains an external delivery provider unless a separately tested replacement is approved. |
| SMS | Hubtel, later | Keep live dispatch disabled until the church completes provider onboarding, sender approval, consent/suppression policy and credentials. |

Do not use Cloudflare Access as a substitute for the app's staff identity and capability system. Normal staff accounts, branch scope, record permissions and administrative lifecycle remain application responsibilities.

### Why D1 needs a deliberate redesign

D1 is backed by SQLite, not PostgreSQL. The current database uses PostgreSQL features including `tstzrange` exclusion constraints, PL/pgSQL functions, `SECURITY DEFINER`/ `SECURITY INVOKER`, JSONB, UUID defaults, triggers and PostgreSQL-specific transaction logic. D1 supports SQLite SQL, foreign keys, triggers and JSON functions, but it does not execute the current PostgreSQL schema or stored procedures unchanged.

The target must translate those invariants and prove equivalent behaviour before any production data is copied.

---

## 2. Audited current state

### Repository and deployment

- The repository is a React 19 / TypeScript / Vite application under `web/`.
- The browser does not depend on `@supabase/supabase-js`; it uses custom clients in `web/src/lib/auth.ts` and `web/src/lib/cmi-api.ts`.
- The browser currently stores Supabase access and refresh tokens in `sessionStorage`, calls the same-origin `/api/auth` proxy, and calls Supabase Edge Function routes for business operations. Local development can call Supabase directly.
- PR #54, “Prepare PCG Missions for Cloudflare Pages”, is merged into `main` at the baseline SHA above. It adds Pages routing/configuration and an auth proxy, but the proxy still forwards to Supabase. It is hosting readiness only, not a Supabase replacement.
- `web/wrangler.toml` currently declares a Pages build output and compatibility date; it has no D1, R2 or Queue bindings.
- `web/CLOUDFLARE_PAGES.md` explicitly documents keeping Supabase as the backend.
- No Cloudflare project, D1 database, Worker API, R2 bucket, Queue or production DNS cutover was created or changed during this audit.

### Supabase project

Read-only inspection of the connected project named **PCG Missions** found:

- 50 public tables; all 50 have RLS enabled.
- Three application-private tables: `staff_password_reset_request`, `first_admin_bootstrap_lease` and `staff_password_reset_audit`.
- 33 public-schema triggers.
- Two Auth users, both with email identities; one Auth session existed at audit time.
- Two staff profiles, one church, one branch, six roles, 61 capabilities, 65 role-capability links, two staff-role assignments and one staff-access audit row.
- Most ministry/business-domain tables currently report zero rows. Preserve the schema and all rows regardless; low current volume does not reduce the sensitivity of pastoral records.
- No Supabase Storage buckets and no Storage objects were found.
- The live migration history does not match the repository migration directory exactly. In particular, the current repository contains later team-area and ministry-report migrations that are not present in the live migration history. Some live migration versions also differ from checked-in filenames. Do not replay the directory blindly; first reconcile the live schema, migration history and source files.
- The live database security advisor reports 52 tables with RLS enabled and no policies, plus a warning that leaked-password protection is disabled. The current design relies on trusted server-side Edge Functions using the service-role credential and explicit application-level capability/branch checks. The D1 design must keep the database inaccessible to browsers and centralize equivalent authorization checks in Workers.
- The performance advisor reports missing foreign-key covering indexes and many unused indexes. Re-evaluate indexes against actual D1 query plans rather than copying PostgreSQL indexes mechanically.

### Deployed Edge Functions versus source control

The current client calls these operation families: staff session, staff operations, pastoral operations, staff access operations, event operations, calendar operations, announcement operations, content operations, team operations, report operations and public content.

The live Supabase project lists 10 active functions. The following source-controlled functions are not in that live list:

- `team-operations`
- `report-operations`
- `pastoral-operations`

The live project also lists `pcg-first-admin-once`, for which no corresponding source directory was found in the tracked `supabase-cmi/supabase/functions` tree. This is a source/deployment drift item that must be resolved and documented before migration.

The existing `.github/workflows/cmi-edge-functions.yml` checks `supabase/functions/**` (the small historical/health-check workspace), not the actual CMI function tree at `supabase-cmi/supabase/functions/**`. CI coverage must be corrected so the real production function sources, tests and shared modules are checked.

### Authentication and messaging dependencies

- Existing authentication is Supabase email/password with refresh-token rotation, logout, staff-session loading, password recovery, one-time bootstrap and administrative staff-account operations.
- The staff-auth Edge Function uses Resend for transactional email and relies on server-side secrets such as the Resend API key, app URL and HMAC/bootstrap values.
- Supabase password hashes are not available as reusable plaintext credentials. Do not promise a transparent password migration. Preserve account identity/profile mapping, invalidate old sessions at cutover, and require a controlled password reset or first-login password setup for existing users.
- Hubtel's adapter and tests are source-controlled, but the runbook explicitly says there is no active SMS endpoint, outbox dispatcher, live credentials, approved sender ID or hosted SMS configuration. Live dispatch is disabled. Do not activate SMS as a side effect of this platform migration.
- The current project has no Storage buckets or objects. R2 is therefore optional until a real file-upload requirement is confirmed.

---

## 3. Target architecture and security boundaries

### Request path

1. Cloudflare Pages serves the static React application.
2. The browser calls a same-origin Cloudflare Worker API.
3. The Worker validates the session and resolves the staff identity.
4. A shared authorization layer checks account status, capability, branch scope, team/area scope and record-level permissions.
5. Domain services execute D1 reads/writes using parameterized SQL and explicit transactions.
6. Sensitive reads/writes append required audit records in the same transaction where possible.
7. Background work is placed on a Queue only after the corresponding database/outbox transaction commits.
8. A separate consumer Worker performs provider calls and records outcomes. Scheduled tasks use Cron Triggers.

The D1 binding must exist only in trusted Worker code. Do not expose D1 through a browser-callable generic SQL endpoint or grant the browser an unrestricted database API.

### Identity and sessions

Run a proof-of-concept for Better Auth with the Cloudflare D1 dialect before locking the identity implementation. The proof-of-concept must demonstrate:

- Email/password sign-in and secure session cookies.
- Session rotation, expiry and revocation.
- Password-reset request and completion through Resend.
- Administrator-issued invitation or one-time setup link; administrators must never know a staff member's permanent password.
- First-login forced password setup, account deactivation/reactivation and password reset by an authorized administrator.
- Safe first-admin bootstrap with a one-time, expiring bootstrap lease.
- Rate limiting, abuse protection, CSRF protection for cookie-authenticated mutations, origin checks and secure cookie attributes.
- Correct client IP extraction on Workers using `CF-Connecting-IP` where the auth library requires it.

If Better Auth cannot satisfy the account-lifecycle and security requirements without unsafe workarounds, implement a narrowly scoped, reviewed Worker auth service rather than weakening the requirements.

### Authorization model

Port the existing capability catalogue and branch-scoped access model. Every protected operation must authorize and access the target record together. Never trust role names, branch IDs, profile IDs or actor IDs supplied by the browser without resolving them from the authenticated session and database.

Keep restricted prayer/care narratives separate from ordinary contact and follow-up access. Preserve append-only audit history and prevent staff from granting themselves capabilities or expanding their own branch scope.

### Domain translation rules

- PostgreSQL UUIDs: preserve existing identifiers as canonical text UUIDs where practical; generate new IDs in the Worker.
- `timestamptz`: store normalized UTC ISO-8601 text or a consistently defined integer epoch representation.
- JSONB: use validated JSON text with SQLite JSON checks/functions, or normalize security-critical structures into relational tables.
- PostgreSQL functions/RPCs: port to explicit Worker domain services and D1 transactions. Do not translate a privileged SQL function into a generic unrestricted Worker endpoint.
- `SECURITY DEFINER` and RLS: replace with a single trusted server boundary, explicit permission checks and narrowly scoped data-access functions.
- `tstzrange` exclusion constraints: replace with transactional overlap checks and/or SQLite triggers. Add concurrency tests for staff assignment, team membership, area coverage and event assignment intervals.
- Triggers: retain only database-enforceable invariants in SQLite triggers; move business orchestration to tested domain services.
- PostgreSQL extensions: inventory actual application usage. Do not attempt to install or emulate unused Supabase/Postgres extensions in D1.
- Idempotency: preserve the current HMAC-backed, branch-scoped idempotency guarantees. Design retries so an uncertain SMS submission is never blindly duplicated.

---

## 4. Migration workstreams

### Workstream A — production/source reconciliation

1. Capture the exact live Supabase migration history, public/private schema, indexes, constraints, triggers, functions, Auth identities, sessions, secrets inventory (names only), deployed Edge Function versions and environment configuration.
2. Compare every live object with the checked-in CMI migrations and function source.
3. Resolve the three source-only operation functions and the deployed-only bootstrap function in a separate reconciliation report. Do not deploy them to the current production project as part of this migration.
4. Fix CI so it tests `supabase-cmi/supabase/functions/**` and migration artifacts.
5. Produce a signed-off data inventory and a deterministic export manifest.

### Workstream B — D1 schema and domain services

1. Create a dedicated D1 development database and versioned D1 migrations. Never point local/test migrations at production.
2. Translate all current live tables, including private-schema records, to explicit D1 tables.
3. Add foreign keys, unique/check constraints, required indexes and immutable audit triggers.
4. Port domain operations one module at a time: identity/authorization, staff/access, contacts/follow-up, pastoral, teams/areas, events/attendance/transport, calendar, announcements, content and reports.
5. Implement the capability/branch/record authorization service before exposing domain routes.
6. Test all cross-branch and unauthorized access cases, including restricted pastoral data.

### Workstream C — authentication and external providers

1. Prove the new identity/session implementation with test accounts.
2. Keep Resend as the initial transactional email provider; move its credential into a Cloudflare Worker secret.
3. Recreate password reset, invite, bootstrap and staff lifecycle flows.
4. Keep Hubtel credentials absent and SMS live dispatch disabled. Later, after provider approval, add a durable outbox, Queue consumer, delivery-status reconciliation and suppression/consent checks.
5. Do not migrate Supabase access tokens or assume Supabase password hashes can be reused.

### Workstream D — data transfer

1. Take and retain a verified Supabase backup/export before any transfer.
2. Export every table in a deterministic order, including private-schema tables and audit rows. Export Auth user identity/profile metadata separately without exposing credentials.
3. Import into an isolated D1 staging database while preserving stable IDs and timestamps.
4. Validate per-table row counts, key uniqueness, foreign keys, check constraints, JSON validity, audit ordering and business invariants.
5. Run read-only comparison reports between the source snapshot and D1. Resolve every discrepancy before acceptance.
6. Keep the original Supabase project intact and available throughout the validation period.

### Workstream E — verification

The Cloudflare preview must pass all of the following before production cutover:

- Build, type-check, lint and unit tests.
- Login, refresh, logout, recovery, invite, forced password setup, deactivation, reactivation and session revocation.
- Role/capability matrix and branch/record isolation tests, including negative tests for cross-branch access.
- Contact create/edit, notes, interaction history, assignment and duplicate/idempotency behaviour.
- Follow-up create, update, reassign, completion, event history and retry behaviour.
- Prayer/care restricted access, read auditing and append-only audit protection.
- Team/service-area administration and membership/coverage date-overlap behaviour.
- Event creation, registration, check-in, transport reservation, closeout and calendar integration.
- Announcement draft/publish/scheduling and public-content visibility rules.
- Ministry report draft, submit, review, reject/return, resubmit and audit history.
- Public routes, nested SPA refresh, error handling, security headers, rate limiting and CSRF protection.
- D1 backup/restore drill and recovery-time verification.
- Performance checks for representative list, search, dashboard and write operations.

No SMS live-send test is part of this phase. Use mocks until Hubtel onboarding and approval are complete.

---

## 5. Cutover and rollback controls

### Before cutover

- Require a verified source backup and a tested D1 restore.
- Require zero unexplained data-count or integrity differences.
- Require all high-severity security tests to pass and all critical flows to be exercised by authorized test roles.
- Require a named production owner to approve the maintenance window and final cutover.
- Configure Cloudflare production secrets and environment bindings without committing values to Git.
- Test a Cloudflare preview domain end-to-end; do not use the production domain for initial tests.

### Cutover sequence

1. Announce a short maintenance window and temporarily block new writes on the old application.
2. Take the final source snapshot and export the final delta.
3. Import and validate the final delta in D1.
4. Run production smoke tests against the Cloudflare deployment using approved test accounts.
5. Switch the application domain/DNS only after the smoke tests pass.
6. Keep Vercel and Supabase available, unchanged and access-restricted as rollback sources.
7. Reopen writes on Cloudflare only after the production owner accepts the verification report.

### Rollback policy

- Before Cloudflare accepts production writes, rollback means restoring the previous Vercel/Supabase routing.
- After Cloudflare accepts production writes, do not simply switch DNS back: that would strand or lose new D1 writes. First export and reconcile the D1 write delta into the rollback source, or use a separately tested reverse-replay mechanism.
- Keep the old services intact for an agreed observation period. Decommission only after backup retention, data reconciliation, security review and owner approval.

---

## 6. D1 capacity and operational considerations

At audit time the source data volume is small, but the system contains many relational tables and sensitive access-controlled workflows. D1's current published limits include a 500 MB maximum database size on Free and 10 GB on Workers Paid, with a 2 MB maximum row size. D1 is SQLite-based and each individual database processes queries serially; indexes and bounded queries matter. Confirm current plan limits, quotas, backup retention and regional/data-residency requirements before choosing production capacity.

Use D1 migrations committed to Git and apply them through Wrangler only to explicitly selected environments. Use separate local, preview and production database IDs. A deployment must fail closed if a required binding or secret is absent.

---

## 7. Blocking decisions and explicit non-actions

The following are not completed by this audit:

- No Cloudflare account resources were provisioned.
- No D1 database was created.
- No live data was exported or copied.
- No Supabase schema, Auth setting, Edge Function, secret or production record was changed.
- No Vercel setting, custom domain or DNS record was changed.
- No SMS credentials were added and no SMS was sent.
- No Supabase project was paused, deleted or decommissioned.

Before provisioning resources, confirm the Cloudflare account, expected plan/budget and data-location requirements. Before cutover, approve the maintenance window and account password-reset approach.

---

## 8. External references

- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Cloudflare Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Better Auth — Cloudflare guide](https://better-auth.com/docs/guides/cloudflare)
- [Better Auth — database adapters](https://better-auth.com/docs/adapters/other-relational-databases)
- [Better Auth — database schema and migrations](https://better-auth.com/docs/concepts/database)
