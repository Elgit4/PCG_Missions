# PCG Missions backup and restore rehearsal — 2026-11-22

**Status: PARTIALLY VERIFIED — production recovery is not yet proven.**  
**Scope:** Cloudflare D1 recovery and Supabase source-backup readiness. No production cutover was performed.

## 1. Environment observed

### Cloudflare D1

All listed databases use EU jurisdiction.

| Database | Schema version | Tables | Observed state |
|---|---:|---:|---|
| `pcg-missions-production` | 43 | 87 | Database resource exists. Its Worker binding and production traffic usage were not verified in this rehearsal. |
| `pcg-missions-migration-test` | 43 | 87 | Used as the non-production export and Time Travel rehearsal source. |
| `pcg-missions-dev` | 28 | 82 | Older development database. |
| `pcg-missions-restore-rehearsal` | — | 0 application tables | Newly created isolated EU scratch database. It contains only Cloudflare's internal `_cf_KV` table; no application schema or data was imported. |

The production-named database's existence supersedes older readiness notes saying that no production D1 resource had been provisioned. Existence alone does not prove that a production Worker is bound to it or that it is serving live traffic.

### Supabase source

- Project: `PCG Missions` (`cgwffpxlwgbnlinzwfoj`)
- Region: `eu-west-1`
- Project status: `ACTIVE_HEALTHY`
- Recorded migrations: 17
- Current observed public records: 1 church, 1 branch, 3 staff profiles, 6 roles, 61 capabilities, 65 role-capability grants, 2 staff-role assignments and 5 staff-access audit rows.
- Auth metadata: 3 users and 3 identities.
- Storage metadata: 1 bucket and 0 objects.

These are live read-only metadata/count observations, not a database backup or a complete source-to-target reconciliation. Do not interpret empty domain tables as evidence that no records exist in other schemas or external storage.

## 2. D1 export result

- Source: `pcg-missions-migration-test`
- Export format: D1-compatible SQL (`compatibility: d1`)
- Export task: completed successfully
- Source schema: 87 tables; latest migration row: 43
- The export API returned a short-lived signed download URL. The execution environment rejected the download with HTTP 403 and the explicit message that requests to the Cloudflare R2 host are not allowed.
- Consequently, no durable SQL artifact, independently verified checksum, or completed SQL import was produced by this run. This is an execution-environment egress restriction, not evidence that the D1 export itself failed.

The export task completing is a positive backup-generation check, but it is not sufficient evidence of a usable off-database backup. Repeat the export using Wrangler from a trusted operator environment, preserve the SQL file in approved encrypted backup storage, and record its SHA-256 checksum and byte size.

Suggested operator workflow (use the configured non-production database binding):

```sh
npx wrangler d1 export pcg-missions-migration-test --remote --output=./pcg-missions-migration-test.sql
npx wrangler d1 execute pcg-missions-restore-rehearsal --remote --file=./pcg-missions-migration-test.sql
```

The target must be the isolated rehearsal database, never `pcg-missions-production`. Confirm the database binding/name in Wrangler configuration before running the commands. After import, compare table names, migration versions, critical row counts, foreign-key/integrity checks and application smoke tests.

## 3. D1 Time Travel restore result

A current bookmark was retrieved for `pcg-missions-migration-test`. The database was restored to that same current bookmark through the D1 Time Travel API.

**Result: successful same-bookmark restore.**

Post-restore verification returned:

- Table count: 87
- Latest migration ID: 43
- Query executed successfully on the EU primary
- No rows were written by the verification query

This confirms that the D1 restore operation is reachable and that the database remained queryable with the expected schema after a same-state restore. It does **not** prove recovery to an earlier incident point, restoration of a deleted table/record, or successful recovery of the production-named database. A separate non-production test with a deliberately created disposable fixture and a pre-change bookmark is still required before claiming full disaster-recovery acceptance.

D1 Time Travel is continuously available for supported D1 databases; its recovery window depends on the Cloudflare plan. Restoring is destructive and overwrites the selected database in place. Never rehearse by rewinding a production database.

## 4. Supabase backup and restore result

The Supabase connector confirmed that the source project is healthy and its schema/migration metadata is readable. It does not expose a safe operation to download a physical backup artifact or restore the source into an isolated clone.

Supabase documents daily project backups and optional Point-in-Time Recovery. The existence, timestamp, retention and recoverability of a backup for this specific project have **not** been verified in the Supabase Dashboard.

Do not call a restore operation against the source project as a test: that would overwrite the source database. The safe rehearsal path is **Database Backups → Restore to a New Project**, where available, after confirming plan eligibility, physical-backup availability, data-region placement and any quoted cost. Supabase documents this as a database-only clone; Storage objects/settings, Edge Functions, Auth settings/API keys, Realtime settings, extensions and other configuration require separate handling and verification.

Before treating Supabase recovery as complete:
1. Confirm the latest successful backup timestamp and retention in the source project's Dashboard.
2. Confirm whether PITR is enabled and its recoverable time window.
3. Review any cost shown for a restore-to-new-project operation.
4. Restore into a separate project in the same region, only after the owner approves any non-zero cost.
5. Verify schema, row counts, Auth users/identities, RLS, extensions, Storage buckets/objects and Edge Function/configuration inventory.
6. Record the restore project ID, backup timestamp, validation results and cleanup/retention decision.

References:
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
- [Cloudflare D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

## 5. Acceptance checklist

- [x] Identify the current Cloudflare D1 databases and EU jurisdiction.
- [x] Generate a D1-compatible SQL export from the non-production migration-test database.
- [x] Execute a non-production same-bookmark D1 Time Travel restore.
- [x] Verify the restored D1 database is queryable and retains 87 tables/schema version 43.
- [ ] Download and retain a durable D1 SQL backup; verify its checksum.
- [ ] Import that backup into the isolated scratch database and validate it.
- [ ] Verify an actual earlier-point D1 recovery on disposable non-production data.
- [ ] Verify the Supabase source project's latest backup and retention in the Dashboard.
- [ ] Complete a Supabase restore-to-new-project rehearsal, subject to plan eligibility and explicit cost approval.
- [ ] Reconcile the restored Supabase and D1 datasets, including Auth, Storage and non-database configuration.
- [ ] Obtain owner sign-off on the recovery runbook.

## 6. Release decision

**Task 7 remains open. Production deployment and Pages production routing must remain blocked.** The D1 same-bookmark restore passed, but the D1 SQL import and Supabase restore rehearsal are incomplete. Do not mark this task complete until every unchecked recovery gate is evidenced.


## 7. Follow-up verification — 2026-11-22

A second read-only pass was performed after the initial rehearsal report. No writes were made to either D1 database or the Supabase source project.

### D1 database inventory and data checks

- Re-queried `sqlite_master` on `pcg-missions-migration-test`: **86 application tables plus Cloudflare's internal `_cf_KV` table** (87 total); `d1_migrations` latest ID is **43**.
- Re-queried the isolated `pcg-missions-restore-rehearsal`: it still contains only `_cf_KV`; no application tables or rows have been imported.
- Cloudflare's D1 database-list metadata returned `num_tables: 0` for every database, including the populated migration-test database. This field is inconsistent with direct SQL inspection and must not be used as evidence of an empty database; `sqlite_master` is the authoritative check used here.
- All D1 reads were served by the EU primary (`EEUR`).

### Source-to-target sample reconciliation

These counts were read independently from the live Supabase source and the D1 migration-test database:

| Table | Supabase source | D1 migration-test | Difference |
|---|---:|---:|---:|
| church | 1 | 1 | 0 |
| branch | 1 | 1 | 0 |
| role | 6 | 6 | 0 |
| capability | 61 | 89 | +28 |
| role_capability | 65 | 128 | +63 |
| staff_profile | 3 | 3 | 0 |
| staff_role_assignment | 2 | 2 | 0 |
| staff_access_audit | 5 | 6 | +1 |

**Reconciliation result: FAILED / unexplained differences remain.** Matching counts for selected identity tables do not prove matching identifiers, row contents, foreign-key relationships or authorization semantics. The capability and role-capability differences are material and must be resolved by comparing canonical keys and grant contents before any production import. The extra D1 audit row also needs explanation; do not delete it merely to force counts to match.

### Supabase backup eligibility and restore constraints

- The connected Supabase organization `El_Tech` is on the **Free** plan.
- Current Supabase documentation says automatic daily backups are provided for Pro, Team and Enterprise projects; Free projects should regularly create off-site logical exports using `supabase db dump`.
- Supabase's documented **Restore to a New Project** clone flow is restricted to paid plans and requires physical backups. It is therefore not available under the currently observed Free plan.
- A new blank project quote returned $0/month, but creating an empty project would not constitute a backup clone and would not recover source data. No empty project was created.
- The connected Supabase tools expose project/schema/SQL inspection but do not expose the source project's backup listing, physical backup download, or restore-to-new-project operation. The latest backup timestamp and restore-point availability remain unverified.
- No restore was attempted against the live source project. No source schema, rows, Auth users, Storage objects or settings were changed.

Official references (checked 2026-11-22):
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups) — Free projects require operator-managed logical exports; automatic daily backups are for paid plans.
- [Supabase restore to a new project](https://supabase.com/docs/guides/platform/clone-project) — paid-plan and physical-backup prerequisites; database-only clone with additional configuration to reapply.
- [Supabase CLI v3 breaking change](https://supabase.com/changelog?types=breaking-change) — CLI v3 defaults database commands to the local stack; use the documented remote-target option deliberately and verify the target before any hosted operation.

### Updated release decision

Task 7 remains **OPEN / BLOCKED**. The blockers are now more specific:

1. D1 SQL export download is still blocked from this execution environment by the Cloudflare R2 egress restriction; the scratch D1 remains empty.
2. The current migration-test dataset does not reconcile with Supabase on capabilities, role-capability grants and audit rows.
3. Supabase's organization is Free, which does not meet the documented eligibility for restore-to-new-project cloning; no automatic daily backup should be assumed.
4. A manual logical export, or an approved paid-plan restore-to-new-project workflow, is still needed to prove source recovery.

**Do not cut over or mark Task 7 complete.** Next safe actions require a trusted operator environment with Wrangler and an approved Supabase backup path. Preserve both source datasets unchanged until the data differences are explained and reconciled.
