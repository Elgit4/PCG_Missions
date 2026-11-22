# PCG Missions D1 backup and reconciliation evidence

**Captured:** 2026-11-22  
**Branch:** `feat/cloudflare-d1-migration-foundation`  
**Purpose:** Record read-only reconciliation and completed Cloudflare D1 exports before any production cutover.

## D1 exports and restore points

Two D1 SQL exports completed successfully through the Cloudflare D1 export API using D1-compatible format:

| Database | UUID | Export status | Export bookmark |
|---|---|---|---|
| `pcg-missions-production` (production-named; still non-production) | `2bbfb04f-9182-427d-b269-d050b8a9403f` | Complete | `0000000e-00000000-0000512b-b1c7ca8def2e3ff28e3aa5ff53c8698f` |
| `pcg-missions-migration-test` | `74074d53-1edc-4ad7-83e6-bb3333a6ab4f` | Complete | `0000004f-00000000-0000512b-98a08c15bb68170cfeb65860f6381bfc` |

Cloudflare Time Travel bookmark reads returned the same bookmarks for both databases. The exports were generated successfully, but a separate import into a disposable D1 database and restore validation have **not** been completed. The temporary signed export URLs are intentionally not stored in Git.

## Environment guard

Both databases currently report:

- `app_meta.schema_version = 43`
- `app_meta.environment = 'non-production'`

The database named `pcg-missions-production` is therefore **not yet approved as a production runtime database**. Do not change its environment marker or bind it to a production Worker until data, security, and recovery gates are complete.

## Source-to-D1 row-count reconciliation

Read-only comparison against Supabase project `cgwffpxlwgbnlinzwfoj` found 53 shared source tables. Row counts matched in 51 of those 53 tables. The two catalogue differences are expected migration compatibility additions and need semantic review rather than blind deletion:

- Active capabilities: Supabase 61; D1 89. Every active Supabase capability code is present in D1; D1 has compatibility alias codes.
- Active role-capability grants: Supabase 65; D1 128. Every active Supabase role/capability/scope tuple is present in D1; D1 has additional compatibility grants.

Additional identity checks:

- Counts and IDs match for church, branch, staff profiles, staff-access audit, password-reset requests, and password-reset audit.
- Staff-role assignment rows match semantically by assignment ID, staff Auth identity, role code, branch, and revocation state.
- The migration-test database has one extra staff-access audit row compared with the source; the production-named D1 does not. Preserve append-only audit history; do not delete the rehearsal row to force count parity.

## Remaining recovery and release requirements

- Import the D1 export into a disposable EU D1 database and verify schema/data restore.
- Produce an independently retained Supabase source backup and verify its restore path.
- Complete full row-content/reference reconciliation, including the capability compatibility mapping.
- Run authenticated six-role acceptance and production Worker integration tests.
- Verify production Worker secrets/bindings, monitoring, alerting, and rollback.
- Keep production Pages routing unchanged until all release gates pass.

This record does not authorize production cutover, destructive reconciliation, or SMS activation.
