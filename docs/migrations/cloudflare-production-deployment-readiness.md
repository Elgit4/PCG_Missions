# Cloudflare production deployment readiness

**Status:** preparation in progress; production cutover is not approved or executed.
**Target jurisdiction:** EU (D1 jurisdiction `eu`, primary region `EEUR`).
**Current isolated environment:** `pcg-missions-api-nonprod`, `pcg-missions-dev` and `pcg-missions-migration-test`.
**Production boundary:** Supabase production, Vercel production, DNS, live authentication and live records remain unchanged until every gate below is signed off.
**Important inventory correction (2026-11-22):** a D1 database named `pcg-missions-production` exists in EU jurisdiction at schema version 43 (87 tables). Its production Worker binding and live traffic use have not been verified. Do not treat the resource name as proof of a live production cutover.

## 1. Current verified baseline

- `pcg-missions-dev` is at schema version 28 (82 tables). `pcg-missions-migration-test` and the production-named `pcg-missions-production` resource are at schema version 43 (87 tables).
- The isolated non-production API Worker exists. Its deployed configuration must be checked against the intended D1 database before release.
- Local SQLite migration/security tests, Worker type-check, bundle build and local Better Auth/D1 integration tests have been reported passing on the migration branch; deployed release gates below still require current-run evidence.
- Supabase project `PCG Missions` is healthy in `eu-west-1` and has 17 recorded migrations at the time of the 2026-11-22 audit.
- The migration track is a partial port, not a complete replacement of all live Supabase schemas, tables, policies, storage and integrations.
- Existing source staff records map to `Main Branch`; non-production contains a seeded `Victory Congregation` branch. This mapping must not be assumed equivalent.

## 2. Release gates — non-production

- [ ] Deploy the exact current migration commit with the Better Auth bcrypt compatibility change.
- [ ] Confirm deployed Worker health reports the expected non-production environment and schema version 43.
- [ ] Confirm unauthenticated staff-context requests return 401; allowed frontend CORS succeeds and disallowed origins are rejected.
- [ ] Run authenticated sign-in/session/sign-out against the deployed Worker using an approved test identity.
- [ ] Import real staff identities only after branch, church, role and assignment mapping is reviewed and approved. Preserve source user/profile/assignment IDs where compatible; never copy plaintext credentials.
- [ ] Verify existing-password login, staff context, branch scope, role capabilities, session revocation and password change.
- [ ] Complete browser end-to-end acceptance for all enabled application domains.
- [ ] Verify email delivery configuration before enabling password reset or invitations. SMS remains disabled until its provider and credentials are separately approved.
- [ ] Reconcile data counts, relationships, uniqueness, foreign keys and sensitive-access audit records. Keep a source-to-target reconciliation report with no secrets or password hashes.

## 3. Production parity work still required

- Inventory every production Supabase schema, table, view, function, trigger, RLS policy, auth feature, storage bucket/policy, scheduled job, webhook and external integration.
- Complete and review the source-to-target mapping for all live data. The D1 schema version alone does not prove that source data has been migrated.
- Port and test all required production policies and operational features; prove least-privilege access for all six roles and cross-branch/team boundaries.
- Plan object/file migration and verify checksums, metadata, access controls and retention.
- Complete historical audit and identity reconciliation without exporting ephemeral reset tokens or plaintext secrets.
- Verify backups, D1 recovery procedure, retention, restore drills, monitoring, alerting, incident response and rollback. See [the 2026-11-22 backup/restore rehearsal report](backup-restore-rehearsal-2026-11-22.md).
- Confirm EU data residency for every production service and subprocesser, not just D1.
- Complete privacy/security review, load/concurrency tests, accessibility/browser acceptance and operational sign-off.

## 4. Production cutover sequence (approval required)

1. Freeze schema changes and record the approved release commit.
2. Take verified backups of Supabase data, auth metadata and storage; test restoration to an isolated project.
3. Inspect `pcg-missions-production` and its bindings. Reuse it only if its schema, ownership, data state and access controls pass the production database audit; otherwise create a separately named EU production database. Never point production at `pcg-missions-dev` or `pcg-missions-migration-test`.
4. Deploy a production-named Worker with separate production secrets, origins, rate limits, email sender, monitoring and cron configuration. Verify its D1 binding explicitly.
5. Import data in a rehearsed, idempotent batch; reconcile counts, checksums, relationships, roles and branch mappings.
6. Run authenticated smoke tests with designated accounts and least-privilege role test identities.
7. Place the source application into a controlled write freeze; perform final delta sync and reconciliation.
8. Switch frontend/API routing and custom domains only after explicit owner approval and successful acceptance.
9. Monitor errors, auth, latency, D1 limits, scheduled jobs and audit events; retain the documented rollback path.
10. Keep Supabase available read-only through the agreed rollback window. Do not delete or shut down the source as part of the cutover.

## 5. Rollback requirements

- Preserve the previous frontend and API deployment identifiers.
- Keep Supabase data and auth intact until the rollback window expires.
- Record a reversible routing change and the exact operator/approval for it.
- Define how writes made after cutover are reconciled if rollback is invoked; do not silently discard them.
- Rehearse restore and rollback before the production maintenance window.

## 6. Stop conditions

Do not cut over if any of these apply:
- a required production table, policy, storage object or integration has no tested target;
- staff account, branch, church or role mapping is ambiguous;
- authenticated sign-in or role-scoped browser acceptance fails;
- reconciliation has unexplained differences or foreign-key violations;
- backups or rollback have not been tested;
- production secrets, domains, EU residency or monitoring are not verified;
- explicit owner approval for the production change window is absent.

## 7. Current environment separation

| Concern | Non-production | Production |
|---|---|---|
| Worker | `pcg-missions-api-nonprod` | Production Worker binding/traffic not verified |
| D1 | `pcg-missions-dev` (EU), `pcg-missions-migration-test` (EU), scratch restore DB (EU) | `pcg-missions-production` (EU) exists; binding/traffic not verified |
| Frontend | Migration preview | Existing Vercel production remains active |
| Auth/data | Supabase source is still authoritative; no production cutover approved | Supabase remains source of truth |
| DNS | Worker dev hostname | Unchanged |

**Decision:** this repository is being prepared for a controlled production release. A green build or successful non-production deployment alone does not authorize production cutover. Task 7 (backup and restore rehearsal) remains open until D1 SQL import and Supabase restore-to-new-project validation are completed.


## 8. Follow-up recovery blocker — 2026-11-22

A read-only reconciliation pass found that the D1 migration-test database does not yet match the Supabase source on key authorization data: `capability` is 89 in D1 vs 61 in Supabase; `role_capability` is 128 vs 65; `staff_access_audit` is 6 vs 5. Church, branch, role, staff-profile and staff-role-assignment sample counts match, but row-level key/content reconciliation has not been completed. These differences are unexplained and block production data import.

The Supabase organization is currently on the Free plan. Supabase's documented restore-to-new-project feature requires a paid plan and physical backups; automatic daily backups are documented for Pro, Team and Enterprise. Do not assume a recoverable hosted backup exists. The current connector does not expose backup listing/download or clone restore operations. No restore was attempted against the live source project.

The D1 migration-test database has 86 application tables plus the internal `_cf_KV` table and latest migration ID 43. The isolated restore-rehearsal database still has no application tables. The D1 export artifact could not be downloaded because the connected execution environment blocks the signed Cloudflare R2 URL.

**Release remains blocked.** Complete the D1 SQL import, explain and reconcile the row-count differences, and establish a supported Supabase logical-backup or paid-plan restore path before production cutover. See [the detailed backup/restore rehearsal report](backup-restore-rehearsal-2026-11-22.md).
