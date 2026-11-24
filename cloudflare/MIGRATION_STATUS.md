# PCG Missions — Cloudflare migration status

> **Historical snapshot — 22 November 2026.** This file is retained for migration history and is not the current release status. As of 24 November, the main branch contains the schema-49 release candidate and the scheduled follow-up reminder processor; preview deployment of that candidate is in progress. Production remains on D1 schema 45 and Worker version 20. The latest guarded release rehearsal passed roster preflight but stopped at D1 error 7500 before production mutation. Use [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) and [PRODUCTION_CUTOVER_READINESS_2026-11-24.md](../docs/PRODUCTION_CUTOVER_READINESS_2026-11-24.md) for current controls and blockers.


**Verified:** 22 November 2026 (UTC)  
**Branch:** `migration/cloudflare-auth-consolidation`  
**Status:** Cloudflare production baseline remains live. Preview target is schema 47 with the current Worker. Production schema and Worker have not received the schema 47 release.

## Target architecture

- Cloudflare Pages serves the PWA.
- Cloudflare Pages Functions forwards same-origin `/api/*` requests to the Cloudflare Worker.
- Cloudflare Worker owns Better Auth, session cookies, authorization and application API routes.
- Cloudflare D1 is the primary application and identity database.
- Supabase is retained only for private event-flyer object storage.
- SMS/Arkesel remains disabled.

The browser auth client uses Better Auth through same-origin `/api/auth`. Pages environment configuration contains only the API-origin variable; it does not contain Supabase Auth keys. The Worker uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only for the private event-flyer storage path.

## Merged work and current preview release

The following PRs are merged into the migration branch:

- [PR #116 — Reports, events and notification improvements](https://github.com/Elgit4/PCG_Missions/pull/116)
- [PR #117 — Event registration actor-schema regression coverage](https://github.com/Elgit4/PCG_Missions/pull/117)
- [PR #118 — Restore canonical ministry report and event capabilities](https://github.com/Elgit4/PCG_Missions/pull/118)

PR #118 corrected a live policy mismatch: the report Worker routes and D1 triggers used permission names that were absent from the active role grants. It restored the original least-privilege report matrix using canonical `report.*.scoped` capabilities, aligned event closeout checks to canonical `event.closeout.*` capabilities, and aligned the event check-in trigger with explicit event staff/team assignments.

### Preview resources

| Component | Verified state |
|---|---|
| Pages preview origin | `https://migration-cloudflare-auth-co.pcg-missions.pages.dev` |
| Preview API Worker | `pcg-missions-api-preview` |
| Preview API origin | `https://pcg-missions-api-preview.pcg-missions-nonprod.workers.dev` |
| Preview D1 | `pcg-missions-migration-test` |
| Preview D1 ID | `74074d53-1edc-4ad7-83e6-bb3333a6ab4f` |
| D1 schema / environment | **46 / non-production** |
| Roles / active capabilities / role grants | **6 / 89 / 140** |
| Staff profiles / Better Auth users / credential accounts | **3 / 3 / 3** |
| Active branches / events / ministry reports | **1 / 0 / 0** |

The preview Worker is deployed at 100% traffic on the current preview version. The release workflow applied schema 46, completed the schema/health checks, imported the three existing staff credential hashes into Better Auth, and deployed the updated Worker. Hash values were not exposed in logs.

### Automated validation

- Cloudflare D1 Foundation: **80 Python tests passed** on the schema 46 repair, including a positive D1 lifecycle regression.
- Worker type-check and Better Auth/Worker suite: **88 tests passed**.
- Frontend typecheck, lint, tests and production build: **passed**.
- Preview release: [run 45085474699](https://github.com/Elgit4/PCG_Missions/actions/runs/45085474699) — successful.
- D1 restore rehearsal: [run 45086089457](https://github.com/Elgit4/PCG_Missions/actions/runs/45086089457) — successful.

The positive D1 lifecycle test covers ministry report submission and approval, event registration and check-in, and event closeout submission and review. It verifies the associated append-only report review and event closeout audit histories. This is database/Worker regression coverage, not a substitute for authenticated browser acceptance with staff accounts.

## D1 backup and restore rehearsal

The restore-rehearsal workflow created a temporary EU D1 database, applied the complete 47-migration chain, verified schema 46 and all 47 migration-ledger entries, captured a Time Travel bookmark, wrote a probe record, restored to the bookmark, and verified that the schema and migration ledger remained while the post-bookmark probe disappeared. The temporary database was deleted after the test.

A current Time Travel bookmark is available on production D1. **A production-data restore has not been rehearsed**; do not treat the isolated scratch rehearsal as proof that recovery of production records has been tested.

## Production resources and release protection

| Component | Current production state |
|---|---|
| Public PWA | `https://pcg-missions.pages.dev` |
| Pages canonical deployment | Existing successful deployment from commit `de8d324902d59cfa00ea0f6296a215a98bc9611c`; unchanged by the schema 46 work |
| Pages production branch | `main` |
| Automatic Pages production deployments | **Disabled until explicit cutover approval** |
| Production API Worker | `pcg-missions-api-production`; existing deployed version unchanged |
| Production D1 | `pcg-missions-production` |
| Production D1 ID | `2bbfb04f-9182-427d-b269-d050b8a9403f` |
| D1 schema / environment | **45 / production** |
| Roles / active capabilities / role grants | **6 / 89 / 128** |
| Staff profiles / Better Auth users / credential accounts | **3 / 3 / 3** |
| Active branches / events / ministry reports | **1 / 0 / 0** |

A Pages configuration audit found that the migration branch had been set as the production branch, causing routine migration commits to queue production deployments. The project is now configured with `main` as its production branch and automatic production deployments disabled. Five queued production deployments were removed. The current canonical Pages deployment and production Worker were not redeployed.

The production D1 schema remains at 45. The schema 46 migration has been tested against the production environment marker in SQLite, and its guard accepts both production and non-production. **No schema 46 migration, Worker deployment, or data restore has been performed on production.**

## Remaining release gates

1. **Authenticated preview acceptance:** complete real sign-in, session restoration, password change and sign-out tests. Verify all six roles, branch isolation, team/assignee scope, sensitive prayer/care boundaries, contacts, follow-up, reports, event registration/check-in/closeout, notifications and staff administration. Use dedicated synthetic QA accounts and fixtures; do not create fake records in production.
2. **Staff account reconciliation:** production still has only one active staff profile with an effective role assignment (Admin/Pastor). An active profile without a role assignment has an expired first-login setup window; the existing Team Leader assignment belongs to an inactive profile. The church must authorize and reconcile these accounts before operational rollout.
3. **Recovery:** retain an independently recoverable production backup and rehearse the production recovery procedure in a safe clone before relying on the system for irreplaceable ministry records.
4. **Privacy and governance:** approve the church privacy notice, data-controller contact, lawful purposes, retention/deletion schedule, pastoral-record access policy and incident-response contact before importing real visitor or sensitive pastoral information.
5. **Security review:** complete authenticated negative tests across all six roles, branch isolation, team/assignee scope, session expiry, rate limiting and administrative access controls.
6. **Production cutover:** only after the above gates pass, explicitly approve the schema 46 production migration, production Worker deployment and Pages production release. Keep the production deployment controls disabled until that approval.

## Non-negotiable safeguards

- Keep SMS/Arkesel dispatch disabled.
- Keep public self-registration and public prayer intake disabled.
- Keep private event-flyer storage credentials Worker-only.
- Do not send passwords, session cookies, service-role keys or private pastoral records through chat, logs or Git.
- Do not declare the product fully production-ready based only on green CI, a healthy endpoint or a populated capability catalogue.
