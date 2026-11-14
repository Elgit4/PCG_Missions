# PCG Missions — safe Cloudflare deployment and production cutover runbook

**Status:** preparation only; this document does not authorize production changes.  
**Target data jurisdiction:** EU D1.  
**Current boundary:** production Supabase, Vercel, DNS and live authentication remain unchanged.

## 1. Recommended deployment architecture

Use a staged, split deployment rather than moving the frontend, API and database in one release:

1. API: Cloudflare Workers, with separate non-production and production Worker names.
2. Operational database: Cloudflare D1, with separate EU non-production and EU production databases. Never point a non-production Worker at production D1.
3. Object storage: Cloudflare R2 only after the Supabase Storage inventory, object-key mapping, access controls and checksum migration are complete. Do not assume D1 migration moves files.
4. Frontend: keep the current Vercel production frontend unchanged during backend validation. Connect a preview frontend to the non-production Worker first. Cloudflare Pages preview deployments are an alternative for a later frontend-hosting move, but that move should be a separate release.
5. Secrets: use Cloudflare Worker secret bindings for Better Auth and provider credentials. Use different secrets per environment; never commit secrets or place them in ordinary Wrangler vars.

This minimizes simultaneous change and gives the team a stable production frontend while the replacement backend is proven.

## 2. Release pipeline

### Gate A — build and test

A release candidate must pass all of the following on the exact commit being deployed:

- Python/SQLite migration and security tests.
- TypeScript type-check.
- Wrangler dry-run bundle.
- Local Worker/D1 integration tests, including Better Auth sign-in, session refresh, sign-out, invitation acceptance, protected route authorization, CORS and security headers.
- Route-level positive and negative tests for all six roles.
- Cross-branch, cross-team, assignment expiry/revocation and record-level access tests.
- Announcement audience fan-out, idempotent delivery, read receipts, schedule timing and scheduler revocation tests.
- Ministry report submit, review, reject/return, correction, resubmit and self-review denial tests.
- Audit event persistence and failure-path tests.
- D1 foreign-key, trigger, index and migration-ledger checks.

A green type-check or schema test alone is not application acceptance.

### Gate B — isolated non-production deployment

- Apply pending migrations to the EU non-production D1 database only.
- Record a D1 Time Travel bookmark before every schema migration.
- Deploy the exact CI-tested Worker artifact to the non-production Worker.
- Set the non-production Better Auth secret and any required email-provider secrets through Cloudflare secret bindings.
- Verify the deployed health endpoints, then run authenticated smoke tests against the deployed Worker and real EU D1.
- Connect a preview frontend to the non-production API and test the full user journey on desktop and mobile.
- Verify announcement cron execution, delivery ledger, read receipts, invitation/password-reset delivery and R2 access if R2 is enabled.
- Keep the production frontend and Supabase configuration untouched.

### Gate C — data rehearsal

- Take a verified Supabase backup/export and record its timestamp.
- Inventory all source schemas, tables, Auth identities, Storage buckets/objects, Edge Functions, scheduled jobs, webhooks and provider dependencies.
- Reconcile source and target schema differences before moving rows.
- Create a deterministic, ordered export with explicit transforms for identity references, timestamps, JSON, enums and nullable fields.
- Never copy Supabase password hashes or active sessions into Better Auth. Use a controlled account activation/password reset process.
- Import into a disposable or dedicated EU staging D1 database first.
- Compare per-table counts and canonical SHA-256 digests; separately verify foreign keys, unique constraints, critical relationships and sensitive audit histories.
- Rehearse a delta-sync/freeze window. A one-time snapshot is insufficient if source writes continue after the snapshot.
- Resolve every mismatch. Do not waive mismatches for highly restricted records or authorization data.

### Gate D — production readiness

Production is blocked until:

- The full application feature inventory is mapped to implemented and accepted Cloudflare routes.
- All six roles pass both allowed and denied access tests.
- Cross-branch, cross-team, record assignment, expired grant, revoked share and privilege-escalation tests pass.
- Email delivery and account recovery are verified with the selected provider.
- Storage objects and access rules are migrated and checked, or the product is confirmed not to depend on them.
- D1 capacity, indexes, query plans, rate limits, Worker limits and error handling are reviewed.
- Backups and a restore rehearsal are verified.
- Observability, alerting, incident ownership and secret rotation are documented.
- The exact production bundle, migrations, data manifest and rollback plan are approved.

## 3. Production cutover sequence

1. Announce a controlled maintenance window and stop source writes.
2. Take the final source backup and export the final delta.
3. Import the delta into production EU D1 and run full reconciliation.
4. Verify the production D1 schema version, foreign keys, row counts, hashes and role/capability grants.
5. Upload the production Worker version without immediately assigning it 100% of traffic.
6. Smoke-test the version using a version override or a protected production test path.
7. Switch the frontend/API configuration during the maintenance window. Keep the old Supabase production system intact and available for rollback.
8. Run staff sign-in, branch selection, contact/follow-up, prayer, pastoral care, events, calendar, announcements, notifications, ministry reports and audit workflows.
9. Release writes only after acceptance checks pass and the cutover owner signs off.
10. Monitor errors, latency, authentication failures, D1 query failures, cron execution and delivery backlog closely.

Do not cut over the frontend, database, authentication and DNS simultaneously unless a tested release plan explicitly requires it.

## 4. Rollback design

A Worker code rollback does not roll back D1 data or schema. A rollback to older code can fail if the database has already changed incompatibly.

- Prefer additive, backward-compatible expand/contract migrations.
- Deploy code that can read both old and new schema shapes before removing old columns or constraints.
- Record a D1 Time Travel bookmark before every production migration and know the restore procedure.
- Test restore against a separate database before relying on it operationally.
- Keep the previous Worker version available and record its version ID.
- Use Cloudflare Workers version deployments/gradual rollout for API code promotion, but account for version skew and do not assume a traffic split provides transaction rollback.
- If production writes have begun on D1, do not simply point the frontend back to Supabase: that would lose or fork writes. Use a rehearsed reverse-delta/reconciliation plan or keep the system in maintenance/read-only mode until the decision is made.
- Keep Supabase production operational until the agreed acceptance and retention period has passed.

## 5. Rollout stages

For the Worker, use versioned deployment and gradual traffic promotion where appropriate: test the uploaded version, then move through small traffic steps (for example 1%, 10%, 25%, 50%, 100%) while monitoring each stage. For an internal church-management product, restrict early production access to a controlled staff cohort and do not expose public registration or sensitive pastoral routes during the pilot.

For the frontend, use a preview deployment first. If moving from Vercel to Pages, validate a Pages preview against the same non-production API before changing any production domain. Keep the existing Vercel deployment and DNS as the immediate frontend fallback until the new path is accepted.

## 6. Current blockers recorded at preparation time

- The non-production D1 database is EU-jurisdiction and currently has migrations 0001–0024 applied; migration 0025 remains pending until the current test/release gate passes.
- The full API Worker has not yet been deployed to the non-production environment.
- The GitHub repository secret CLOUDFLARE_API_TOKEN is not configured, so the workflow deployment/migration steps skip. Configure a narrowly scoped token through repository/environment secrets before using automated deployment.
- BETTER_AUTH_SECRET and transactional email delivery must be configured and verified as non-production secrets before deployed authentication and account recovery can pass acceptance.
- The current branch's CI has passed the SQLite foundation, TypeScript and Wrangler build checks, and the local Worker/D1 integration harness on the prior validation commit. A newer Wrangler pin is being validated.
- Source-to-target data export/import has not been executed. The current reconciliation utility is a metadata manifest/comparison tool, not a complete data-transfer pipeline.
- The live Supabase project has a critical security advisory for private.first_admin_bootstrap_lease with RLS disabled, plus RLS-enabled tables without policies. Do not apply generic policy changes blindly; review the private bootstrap table's intended service-only access and fix the source exposure before the source is retired.
- Storage, provider, webhook, scheduled job and frontend integration inventories remain part of the cutover audit.

## 7. Decision

**Recommended path:** keep the current production frontend on Vercel for now; deploy the replacement API to an isolated Cloudflare Worker and EU D1; connect a preview frontend; complete a rehearsed data migration; then move production traffic in a controlled maintenance window with a verified rollback plan. Consider moving frontend hosting to Cloudflare Pages only after the backend cutover is stable.

No production migration, DNS change, Supabase shutdown or live user-data movement is authorized by this runbook.
