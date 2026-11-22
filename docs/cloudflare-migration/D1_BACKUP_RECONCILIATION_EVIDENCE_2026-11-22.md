# PCG Missions D1 backup and reconciliation evidence

**Captured:** 2026-11-22  
**Branch:** `feat/cloudflare-d1-migration-foundation`  
**Purpose:** Record read-only source/D1 reconciliation and completed exports before any production cutover.

## D1 exports and restore points

Cloudflare D1 exports completed successfully in D1-compatible SQL format:

| Database | UUID | Export status | Export bookmark |
|---|---|---|---|
| `pcg-missions-production` (production-named; still non-production) | `2bbfb04f-9182-427d-b269-d050b8a9403f` | Complete | `0000000e-00000000-0000512b-b1c7ca8def2e3ff28e3aa5ff53c8698f` |
| `pcg-missions-migration-test` | `74074d53-1edc-4ad7-83e6-bb3333a6ab4f` | Complete; re-exported 11:50 UTC | `0000005a-00000000-0000512b-ea9d6a12943a7b3dc9c41b9ce52ccfc2` |

Cloudflare Time Travel bookmark reads previously returned the corresponding database bookmarks. Export completion is **not** a restore test.

### Restore rehearsal attempt

- Created a disposable EU-jurisdiction D1 database named `pcg-missions-restore-rehearsal-20261122`.
- Generated a fresh SQL export from `pcg-missions-migration-test`.
- The signed R2 export URL could not be fetched from the available execution environment: outbound requests to the Cloudflare R2 SQL-export host are blocked. The D1 import API requires the SQL file to be uploaded; it does not accept the export bookmark or an inline URL as an import source.
- The empty disposable D1 was deleted after the transfer limitation was confirmed. No import was started and no source/preview database was modified.

**Restore status: BLOCKED — file transfer to/from the signed R2 URL is unavailable in this execution environment.** A restore rehearsal still requires an approved runner with access to the signed R2 URL and Cloudflare D1 import API.

## Environment guard

Both existing D1 databases report:

- `app_meta.schema_version = 43`
- `app_meta.environment = 'non-production'`

The database named `pcg-missions-production` is therefore **not approved as a production runtime database**. Do not change its environment marker or bind it to a production Worker until data, security, and recovery gates are complete.

## Source-to-D1 row-count reconciliation

Read-only comparison against Supabase project `cgwffpxlwgbnlinzwfoj` covered 53 shared tables. **49 of 53 table counts match** across Supabase, migration-test D1, and production-named D1. Four tables require explicit explanation:

| Table | Supabase | Migration-test D1 | Production-named D1 | Assessment |
|---|---:|---:|---:|---|
| `public.capability` | 61 | 89 | 107 | D1 compatibility catalogue additions; production-named D1 also retains 18 inactive legacy rows |
| `public.role_capability` | 65 | 128 | 128 | 65 canonical grants + 55 explicit Worker alias grants + 8 approved team/area directory grants |
| `public.calendar_entry` | 0 | 1 | 0 | One non-production rehearsal calendar entry; preserve until its owner and purpose are confirmed |
| `public.staff_access_audit` | 5 | 6 | 5 | One additional migration-test audit event; preserve append-only audit history |

### Capability and role-grant semantic review

The migration SQL and live D1 contents were compared by exact `role_code + capability_code + scope_mode` tuples:

- All 61 Supabase capability codes exist in migration-test D1; no source capability code is missing.
- The 65 canonical role/capability/scope grants exactly match the canonical grant set in migration `0041`.
- The 55 Worker compatibility grants exactly match the explicit allowlist in migration `0042`; no unlisted role or wider scope was found.
- Eight additional directory grants are present and explicitly constrained: Admin/Pastor has branch-scoped team/area read and management; Coordinator has branch-scoped team/area read; Team Leader has team-scoped team/area read; all other roles have none.
- The 18 extra capability rows in the production-named D1 are inactive and have no role grants. They are retained rather than destructively removed.
- No role has an `sms.*` grant. Legacy broad `prayer.request.read` and `prayer.request.share` compatibility capabilities have no role grants.

The additional active Worker compatibility codes are deliberate compatibility entries, not 28 extra source permissions. The 18 inactive legacy rows on the production-named D1 are not present in migration-test D1 and require a separate cleanup decision; they are not active grants.

### Identity and audit records

- Church, branch, staff-profile, password-reset-request, and password-reset-audit IDs/counts were checked against the source.
- Staff-role assignments were compared semantically by assignment ID, staff Auth identity, role code, branch, and revocation state.
- Preserve the additional migration-test staff-access audit event and calendar rehearsal entry; do not delete either merely to force row-count parity.

Full row-by-row reconciliation of every business table, foreign-key verification, and all reference relationships is **not yet complete**. The D1 foreign-key check via the Cloudflare API previously returned `SQLITE_AUTH`; it remains unverified.

## Remaining recovery and release requirements

- Complete an actual D1 SQL import into a disposable EU D1 database and verify schema/data restore using a runner that can reach the signed R2 transfer URLs.
- Produce an independently retained Supabase source backup and verify its restore path.
- Complete full row-content/reference reconciliation and a successful foreign-key integrity check.
- Run authenticated six-role acceptance and production Worker integration tests.
- Verify production Worker secrets/bindings, origin allowlist, monitoring, alerting, and rollback.
- Keep production Pages routing unchanged until all release gates pass.

This record does not authorize production cutover, destructive reconciliation, or SMS activation.
