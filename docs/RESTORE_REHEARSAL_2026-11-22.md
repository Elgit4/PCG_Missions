# PCG Missions — Task 7 Recovery Rehearsal

**Verification date:** 22 November 2026  
**Branch:** `migration/cloudflare-nonprod-completion`  
**Status:** BLOCKED — export generated; D1 import and Supabase restore not yet demonstrated.

## Scope and safety

This rehearsal uses the Cloudflare D1 migration-test database as the export source and the isolated EU database `pcg-missions-restore-rehearsal` as the restore target. The D1 database named `pcg-missions-production` and the hosted Supabase project were not modified. Read-only queries were used for inventory and reconciliation. No SMS operations were invoked.

## Verified live inventory

| System | Public/application tables | Capabilities | Role-capability rows | Staff access audit | Roles | Staff profiles |
|---|---:|---:|---:|---:|---:|---:|
| Supabase project `cgwffpxlwgbnlinzwfoj` | 50 public tables | 61 | 65 | 5 | 6 | 3 |
| D1 `pcg-missions-migration-test` | 87 tables incl. D1 internal table | 89 | 128 | 6 | 6 | 3 |
| D1 `pcg-missions-production` | 87 tables incl. D1 internal table | 107 | 128 | 5 | 6 | 3 |
| D1 `pcg-missions-restore-rehearsal` | 0 application tables (only D1 internal table) | — | — | — | — | — |

Supabase currently reports 17 applied migrations. The D1 production and migration-test schemas both expose 87 tables including D1's internal `_cf_KV` table. The Cloudflare list-databases metadata endpoint reported `num_tables: 0`, so the table counts above were taken from read-only queries against `sqlite_master`, not that metadata field.

The earlier conversation's stated D1/Supabase count differences were not reliable. The figures in this report come from fresh read-only queries on 22 November 2026. These systems are not yet reconciled: their schemas and catalogue/grant row counts differ materially. Do not copy capability or grant rows between systems to force matching counts; reconcile against the approved migration history and role-capability policy first.

## D1 export evidence

A Cloudflare D1 export was successfully generated from `pcg-missions-migration-test` using the D1 export API with `compatibility: d1`. Cloudflare returned a completed export status and a signed R2 download URL for the SQL artifact.

The connected execution environment blocks requests to the Cloudflare R2 host (HTTP 403: requests to the R2 host are not allowed). Therefore the SQL bytes could not be retrieved by this session, and no import was performed. The isolated restore database remains empty. An export job completing is not equivalent to a verified restore.

Cloudflare's documented CLI path is:

```sh
npx wrangler d1 export pcg-missions-migration-test --remote --output=./pcg-missions-d1-backup.sql
npx wrangler d1 execute pcg-missions-restore-rehearsal --remote --file=./pcg-missions-d1-backup.sql
```

Run these from a trusted workstation or CI runner authenticated to the correct Cloudflare account. Confirm the database names and EU jurisdiction before running. Do not substitute `pcg-missions-production` as the import target. After import, verify the table inventory, migration ledger, row counts, foreign-key checks, and application smoke tests against the source snapshot. D1 export/import guidance: https://developers.cloudflare.com/d1/best-practices/import-export-data/

## Supabase backup/restore evidence

The connected Supabase project is healthy and has 17 applied migrations. This tool session can run SQL and inspect metadata, but it does not expose a database-password retrieval action or a binary `pg_dump`/Supabase CLI execution environment. No logical backup file or independent Supabase restore was created.

Supabase's current documentation says Free-plan projects do not receive automatic daily database backups; it recommends manual logical exports using the Supabase CLI. Daily automatic backups and Restore to a New Project are paid-plan features. See:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/kb/faqs/platform/free-plan-backups
- https://supabase.com/docs/guides/platform/clone-project

A project owner/operator must run a manual logical backup from a trusted workstation using a database connection string kept in a local environment variable (never committed or pasted into chat), then restore that dump to a separate PostgreSQL instance/project. Storage objects and Auth/provider configuration require separate backup/verification; a Postgres dump alone is not a complete Supabase project recovery.

## Remaining acceptance criteria

- [ ] Retrieve the completed D1 export in a trusted workstation/CI environment.
- [ ] Import it into `pcg-missions-restore-rehearsal`.
- [ ] Verify schema, migration ledger, key row counts, foreign keys, and Worker smoke tests.
- [ ] Create a manual Supabase logical backup from a trusted operator environment.
- [ ] Restore the Supabase backup into a separate, non-production target.
- [ ] Reconcile data and schema differences using approved migration/authorization rules.
- [ ] Record measured recovery time and recovery-point age; obtain operator sign-off.

## Release decision

**Task 7 is not complete. Production cutover and real congregant-data onboarding remain blocked.** This report deliberately does not claim a successful D1 import or Supabase restore. No production database writes, migrations, deletes, or restore operations were performed during this rehearsal.
