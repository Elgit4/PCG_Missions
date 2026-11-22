# PCG Missions — Cloudflare migration status

**Current branch:** `migration/cloudflare-auth-consolidation`  
**Pull request:** [#102](https://github.com/Elgit4/PCG_Missions/pull/102)  
**Current tested head:** `5e4ca434ea2d143d3aa400c01a92f7da24753e09`  
**Release track:** isolated non-production preview only. Production has not been switched.

## Target architecture

- Cloudflare Pages serves the PWA.
- Cloudflare Pages Functions forwards same-origin `/api/*` requests to the Cloudflare Worker.
- Cloudflare Worker owns Better Auth, session cookies, authorization and application API routes.
- Cloudflare D1 is the primary application database.
- Supabase is retained only for private event-flyer object storage.
- SMS is intentionally disabled.

The legacy Supabase Pages auth proxy and Vercel auth handler have been removed from the migration branch. Public visitor content now uses a read-only D1 projection through `GET /api/v1/public-content`; it no longer calls the Supabase public-content Edge Function.

## Verified implementation and CI

- Frontend typecheck, lint, tests and production build passed: [GitHub Actions run 45048494120](https://github.com/Elgit4/PCG_Missions/actions/runs/45048494120).
- Worker typecheck, Worker tests and SQLite migration/security tests passed: [GitHub Actions run 45048494087](https://github.com/Elgit4/PCG_Missions/actions/runs/45048494087).
- The Better Auth Worker bundle built successfully and was uploaded as a GitHub Actions artifact in [preview release run 45048490628](https://github.com/Elgit4/PCG_Missions/actions/runs/45048490628).
- The Pages preview build for the earlier tested frontend commit succeeded. The latest Pages preview deployment is queued/being processed; this does not change production.

## Isolated EU D1 preview

Database: `pcg-missions-migration-test`  
UUID: `74074d53-1edc-4ad7-83e6-bb3333a6ab4f`  
Schema: **44**  
Environment marker: **non-production**  
Table count: **91**  
Primary region: **EEUR**

Migration `0044_restore_better_auth_identity.sql` was applied and recorded in the D1 migration ledger. Verification confirms:

- Three existing staff identities are present in Better Auth's `user` table.
- Three matching credential accounts were imported from the linked Supabase staff identities by the secret-protected migration job.
- All three imported password hashes retain the expected bcrypt format; hashes were not written to logs.
- Credential rows link to all three Better Auth user records.
- `PRAGMA foreign_key_check` returns zero violations.

The credential importer validates source and target identity IDs and emails and compares the stored hashes without printing them. The import step passed in preview release run 45048490628.

## Source-to-D1 reconciliation

A count comparison was performed for all 50 public application tables in the Supabase source and the isolated D1 preview. Forty-six table counts match.

Four differences require explicit treatment:

| Table | Supabase source | D1 preview | Interpretation |
| --- | ---: | ---: | --- |
| `capability` | 61 | 89 | Expanded Cloudflare capability catalogue |
| `role_capability` | 65 | 128 | Expanded six-role capability grants |
| `calendar_entry` | 0 | 1 | Extra non-source preview record; classify before production migration |
| `staff_access_audit` | 5 | 6 | Additional migration/preview audit record |

The operational business tables for contacts, follow-up tasks, events, event registrations, prayer requests, care records, reports, teams, service areas, public content and their dependent records currently have zero rows in the source and preview. This count comparison is not a substitute for a full row-level reconciliation and production data sign-off.

## Restore and production resources

- `pcg-missions-restore-rehearsal` (`833043cd-896e-4833-b5ae-17d520feba0f`) remains at schema 43 with a non-production marker.
- `pcg-missions-production` (`2bbfb04f-9182-427d-b269-d050b8a9403f`) also remains at schema 43 with a non-production marker. Its name does not make it an approved production database.
- The deployed Worker list contains `pcg-missions-api-nonprod`, `pcg-missions-api-preview` and the D1 smoke Worker. There is no `pcg-missions-api-production` Worker yet.
- The Pages project's configured production branch is `feat/cmi-pcg-missions-final-review-v6`. PR #102 currently targets that branch. Do not merge it or change the production Pages branch until the production Worker, production D1, acceptance checks and rollback plan are ready.

## Remaining release blockers

### 1. Cloudflare Worker deployment permission

The GitHub Actions token can authenticate and access D1, but the Worker version-upload preflight fails with **“No access to the specified service”** for `pcg-missions-api-preview`. The token needs the Cloudflare account permission **Workers Scripts: Edit** (Worker script write access), in addition to the D1 permission already used by the workflow. Update the token behind the GitHub Actions secret `CLOUDFLARE_API_TOKEN`; never put the token in source control or chat.

The workflow deliberately runs the schema and credential-import steps before this preflight, so the verified credential transfer is not lost when Worker script write access is missing.

### 2. Preview Worker acceptance

After script write access is available, deploy the exact tested bundle to the preview Worker and verify:

- Worker health and schema version 44.
- Better Auth sign-in using each existing staff account, session restoration, sign-out and password change.
- Anonymous access is denied on all protected business routes.
- All six roles, branch scoping, team/service-area access and sensitive prayer/care boundaries.
- Staff account provisioning, deactivation/reactivation, password-reset review, reports, events, calendar, announcements, notifications and public visitor content.
- Event-flyer upload and retrieval still use the approved private storage exception.

### 3. Production preparation and cutover

Before any production switch:

1. Complete row-level source-to-D1 reconciliation, classify the extra preview calendar/audit rows, and rehearse restore from the verified backup.
2. Prepare a distinct production D1 database with a production environment marker and a separately deployed production Worker with production-only secrets and bindings.
3. Run the complete authenticated acceptance suite against the production candidate and verify monitoring, backup/restore and rollback.
4. Change Pages production configuration only after the production Worker and database are proven healthy.
5. Keep the existing Supabase services available until the Cloudflare production cutover and rollback window are complete. Then retire Supabase Auth, Postgres and Edge Functions; retain only private event-flyer storage.

**No production traffic has been switched by this migration work. SMS remains disabled.**

## Live verification update — 22 November 2026, 17:30 UTC

The repository and Cloudflare resources were rechecked after the latest consolidation commit.

- Current branch head: `75d508ad1921e6f5939c30bb6a5fe890ec2a7ba6`.
- Pages preview build for commit `558b3c869f364522bc75d65d680469b33010711e` completed successfully. Its branch alias is `https://migration-cloudflare-auth-co.pcg-missions.pages.dev`, and its `PCG_MISSIONS_API_ORIGIN` points to the preview Worker.
- The actual Pages branch alias was shorter than the full Git branch name. `cloudflare/wrangler.toml` was corrected to use the exact alias; commit `75d508a`.
- The preview Worker configuration was repaired directly: `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` are now present, with the current Pages alias trusted. Version 30 is deployed to 100% of preview traffic, preserving its existing D1 and secret bindings.
- Important limitation: versions 28–30 were created by secret changes and therefore retain the prior Worker code. The latest Better Auth bundle has **not** been uploaded. Do not treat the preview Worker as running the current branch source until the next release gate passes.

Latest release workflow: [45049626852](https://github.com/Elgit4/PCG_Missions/actions/runs/45049626852).

Passed:
- SQLite migration/security validation.
- Worker typecheck and all Worker tests.
- Preview bundle build and artifact upload.
- D1 schema 44 check (no pending migrations).
- Idempotent source credential import and verification of all three bcrypt hashes.

Failed:
- The `wrangler versions upload` preflight returned `No access to the specified service` for `pcg-missions-api-preview`.
- The GitHub Actions token can apply D1 migrations and run the credential importer, but lacks Cloudflare account permission **Workers Scripts Write** (Cloudflare dashboard label: **Workers Scripts: Edit**). The latest Worker bundle was consequently not deployed and the live preview smoke-test step was skipped.
- The token value is not in source control or logs. The required permission must be added to the token behind GitHub Actions secret `CLOUDFLARE_API_TOKEN`; do not paste the token into chat or commit it.

Current database reconciliation observations:
- Preview D1 has 92 user tables and schema 44.
- The preview has one non-source calendar rehearsal row and one additional `role_assigned` audit event with ID `admin-bootstrap-4309d189-455e-4ab6-a66b-1909ee7bd1d4`. The latter refers to the same Admin/Pastor assignment already represented by a source audit row. Both are retained; do not delete audit history or treat preview-only records as production source data.
- Source and preview core identity counts remain aligned: one church, one branch, three staff profiles, two active role assignments, three Better Auth users, and three credential accounts.
- The production-named D1 remains schema 43 with `environment=non-production`; its three legacy identity rows are still in `supabase_auth_identity`. The restore-rehearsal D1 also remains schema 43. A schema-44 restore rehearsal is still outstanding.

Production remains unchanged:
- Pages production branch is `feat/cmi-pcg-missions-final-review-v6`; production Pages variables still contain only the legacy Supabase URL and publishable key.
- No `pcg-missions-api-production` Worker exists.
- Production Pages does not yet have `PCG_MISSIONS_API_ORIGIN`.
- PR #102 remains draft and targets the production Pages branch. Do not merge it or change production routing until the production Worker, D1 schema/data, secret bindings, authenticated acceptance, restore and rollback gates pass.

The only Supabase runtime exception remains private event-flyer storage. SMS remains disabled.
