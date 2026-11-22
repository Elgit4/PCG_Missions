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
