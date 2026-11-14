# Cloudflare production deployment readiness

**Status:** preparation in progress; production cutover is not approved or executed.
**Target jurisdiction:** EU (D1 jurisdiction `eu`, primary region `EEUR`).
**Current isolated environment:** `pcg-missions-api-nonprod` + `pcg-missions-dev`.
**Production boundary:** Supabase production, Vercel production, DNS, live authentication and live records remain unchanged until every gate below is signed off.

## 1. Current verified baseline

- EU non-production D1 exists and is on schema version 28 (81 application tables).
- The full API Worker exists in the isolated non-production environment.
- Local SQLite migration/security tests, Worker type-check, bundle build and local Better Auth/D1 integration tests pass on the current migration head.
- Existing Supabase accounts use GoTrue bcrypt hashes. The current branch configures Better Auth bcrypt verification and includes legacy-hash sign-in integration coverage.
- The migration track is a partial port, not a complete replacement of all live Supabase schemas, tables, policies, storage and integrations.
- Existing source staff records map to `Main Branch`; non-production currently contains a seeded `Victory Congregation` branch. This mapping must not be assumed equivalent.

## 2. Release gates — non-production

- [ ] Deploy the exact current migration commit with the Better Auth bcrypt compatibility change.
- [ ] Confirm deployed Worker health reports `environment=non-production` and `schema_version=28`.
- [ ] Confirm unauthenticated staff-context requests return 401; allowed frontend CORS succeeds and disallowed origins are rejected.
- [ ] Run authenticated sign-in/session/sign-out against the deployed Worker using an approved test identity.
- [ ] Import real staff identities only after branch, church, role and assignment mapping is reviewed and approved. Preserve source user/profile/assignment IDs where compatible; never copy plaintext credentials.
- [ ] Verify existing-password login, staff context, branch scope, role capabilities, session revocation and password change.
- [ ] Complete browser end-to-end acceptance for all enabled application domains.
- [ ] Verify email delivery configuration before enabling password reset or invitations. SMS remains disabled until its provider and credentials are separately approved.
- [ ] Reconcile data counts, relationships, uniqueness, foreign keys and sensitive-access audit records. Keep a source-to-target reconciliation report with no secrets or password hashes.

## 3. Production parity work still required

- Inventory every production Supabase schema, table, view, function, trigger, RLS policy, auth feature, storage bucket/policy, scheduled job, webhook and external integration.
- Complete and review the source-to-target mapping for all live data. The current 28 migrations are only a first application slice.
- Port and test all required production policies and operational features; prove least-privilege access for all six roles and cross-branch/team boundaries.
- Plan object/file migration and verify checksums, metadata, access controls and retention.
- Complete historical audit and identity reconciliation without exporting ephemeral reset tokens or plaintext secrets.
- Verify backups, D1 recovery procedure, retention, restore drills, monitoring, alerting, incident response and rollback.
- Confirm EU data residency for every production service and subprocesser, not just D1.
- Complete privacy/security review, load/concurrency tests, accessibility/browser acceptance and operational sign-off.

## 4. Production cutover sequence (approval required)

1. Freeze schema changes and record the approved release commit.
2. Take verified backups of Supabase data, auth metadata and storage; test restoration.
3. Create a separate production D1 database in EU jurisdiction and apply reviewed migrations. Never point production at `pcg-missions-dev`.
4. Deploy a production-named Worker with separate production secrets, origins, rate limits, email sender, monitoring and cron configuration.
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
| Worker | `pcg-missions-api-nonprod` | Not provisioned |
| D1 | `pcg-missions-dev` (EU) | Not provisioned |
| Frontend | Migration preview | Existing Vercel production remains active |
| Auth/data | Isolated; no real staff import yet | Supabase remains source of truth |
| DNS | Worker dev hostname | Unchanged |

**Decision:** this repository is being prepared for a controlled production release. A green build or successful non-production deployment alone does not authorize production cutover.