# PCG Missions — Production readiness baseline

**Verified:** 22 November 2026 (UTC)  
**Status:** Live on Cloudflare; operational hardening and end-user acceptance remain in progress.

## Live infrastructure verified

| Component | Verified production state |
|---|---|
| Application | https://pcg-missions.pages.dev |
| Cloudflare Pages project | `pcg-missions` |
| Pages production branch | `main` (automatic production deployments disabled) |
| Latest verified Pages deployment | existing canonical deployment `70252198-bd66-4cb0-9f54-a0dcb08abf73`; commit `de8d324902d59cfa00ea0f6296a215a98bc9611c`; successful stage; unchanged during schema 46 work |
| Pages API origin | `https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev` |
| API Worker | `pcg-missions-api-production`; latest deployed version receives 100% of Worker traffic |
| Production D1 | `pcg-missions-production`; ID `2bbfb04f-9182-427d-b269-d050b8a9403f` |
| D1 jurisdiction / primary region | EU / EEUR |
| D1 schema | 45; 45 migration ledger entries |
| D1 tables | 90, as reported by Cloudflare |
| Application environment marker | `production` |

The initial Cloudflare production cutover workflow [45058057798](https://github.com/Elgit4/PCG_Missions/actions/runs/45058057798) completed successfully. All 19 operational steps passed, including tests, schema migration and promotion, staff credential import, Better Auth deployment, private media-secret verification, and Pages smoke checks.

The latest frontend checks on commit `6359178` passed. Pages deployment `e1d26a7d` completed successfully from the configured production branch.

## Release-control and preview update — 22 November 2026

- The Pages project now uses `main` as its production branch and has automatic production deployments disabled until the cutover is explicitly approved. Five queued production deployments from migration-branch commits were removed. The currently serving Pages deployment and production Worker were not redeployed.
- The Pages project environment contains only `PCG_MISSIONS_API_ORIGIN`; the browser uses Better Auth through same-origin Cloudflare API routes. Supabase is retained only for private event-flyer storage.
- Preview D1 is at schema 46 in the non-production environment, with six roles, 89 active capabilities and 140 role-capability grants. The preview Worker is deployed and passed the preview health and anonymous-boundary checks.
- The schema 46 preview release includes the canonical report and event capability repair. The positive D1 lifecycle regression covers report submit/review, event registration/check-in and event closeout submit/review.
- The isolated EU D1 Time Travel restore rehearsal passed: all 46 migrations were applied, a bookmark was captured, a post-bookmark probe was written, restore removed the probe while preserving schema 46 and the 46-row migration ledger, and the scratch database was deleted.
- Production remains on D1 schema 45 with 128 role-capability grants. No schema 46 migration, production Worker deployment or production data restore has occurred. A current production Time Travel bookmark is available.

## Identity and authorization baseline

The production database currently contains:
- One church and one active branch.
- Three Better Auth users linked to three staff profiles and three credential accounts.
- One effective role assignment: Admin/Pastor on the only active, role-assigned staff profile.
- One Team Leader assignment remains attached to an inactive staff profile; it is not effective while that profile is inactive.
- A second active staff profile has no active role assignment, still requires its first password change, and its 24-hour setup window has expired.
- A third staff profile is inactive and also has an expired first-login setup window.
- Six approved role definitions and 89 active capability catalogue entries.
- One active Better Auth session at the time of the audit; no expired sessions were found.
- No orphaned staff-to-auth identity links in the checked rows.

The production database has the identity and capability foundation for all six roles. Catalogue entries are not the same as granted role capabilities; the live role-capability mappings remain the authority. Role grants are least-privilege and branch-scoped.

The browser uses same-origin Pages API routes and HttpOnly session cookies. Better Auth, staff identity, authorization and application data are served by the Cloudflare Worker and D1. Anonymous `/api/v1/me` requests are expected to return HTTP 401; the public session endpoint returns HTTP 200 with an empty session when signed out.

These counts do not replace authenticated acceptance by staff members using each role.

## Business data state

The production database currently has one branch and no seeded business records in the following checked tables: contacts, follow-up tasks, events, ministry reports and announcements. This is a clean starting point, not evidence of a failed data import. No artificial visitor or pastoral records were inserted during this audit.

## Runtime boundaries

- Cloudflare Pages serves the PWA.
- Cloudflare Workers owns Better Auth, authorization and the application API.
- Cloudflare D1 is the application and identity database.
- Supabase is retained only for the private event-flyer object-storage bucket. The deployed Worker source uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in that storage path; these credentials must remain Worker-only.
- Supabase Auth, Supabase Postgres and Supabase Edge Functions are not required for the live staff application.
- SMS/Arkesel dispatch remains disabled and must not be enabled by routine deployment.
- Public self-registration, public prayer intake, Transport, offline staff access and unapproved publishing/delivery workflows remain disabled.

## Release-readiness assessment

### Verified

- Production Pages deployment and API routing are live.
- Production Worker is deployed and attached to the production D1 database.
- D1 environment marker, migration ledger, EU jurisdiction and primary region are verified.
- Better Auth production configuration and secret bindings are present on the Worker; the private event-storage key is present as a Worker secret.
- The initial cutover workflow passed production health, anonymous-auth boundary, session endpoint and CORS checks.
- The latest frontend checks and production deployment completed successfully.
- Worker telemetry showed no failed Worker executions during the 30-minute runtime-error query at the time of this audit.

### Still required before declaring the whole product fully production-ready

1. **Staff account reconciliation:** the live audit found only one active staff profile with an effective role assignment (Admin/Pastor). A separate active profile has no active role assignment and has an expired forced-password-change window; the existing Team Leader assignment belongs to an inactive profile. Have the intended staff member request a password reset from the sign-in screen, approve it through the Admin/Pastor Access requests workspace, deliver the one-time credential privately, and confirm the forced password change. Then assign or reinstate only the role that the church has authorized. Do not reactivate the inactive Team Leader profile merely to clear this checklist.
2. **Authenticated acceptance:** complete a real login, password-change and sign-out walkthrough using intended staff accounts, then verify live Contacts, Follow-up and Staff operations. Run acceptance for all six roles using dedicated test accounts and synthetic fixtures in preview; do not create fake records in production.
3. **Email delivery:** invitation delivery and password-reset notifications do not yet have a verified production email sender. The safe fallback is an authorized manual one-time credential handoff. Never tell staff an email was sent unless the provider confirms delivery.
4. **Recovery operations:** run an administrator reset and forced password-change acceptance with an authorized account; verify session revocation and audit history.
5. **Backup/restore:** the isolated EU schema 46 D1 Time Travel restore rehearsal passed and the production database has a current bookmark. A production-data restore has not been rehearsed. Establish an independently retained backup and test the recovery procedure against a safe production clone before relying on the system for irreplaceable ministry records.
6. **Privacy and governance:** approve the church's privacy notice, data-controller contact, lawful purposes, retention/deletion schedule, pastoral-record access policy and incident-response contact before importing real visitor or sensitive pastoral information.
7. **Security review:** complete authenticated negative tests across all six roles, branch isolation, team/assignee scope, sensitive prayer/care access, session expiry and rate limiting. Review MFA requirements and require stronger authentication for high-risk administrative access where supported.
8. **Monitoring:** keep production Pages/Worker health, authentication-boundary checks and release alerts active. Monitor application HTTP errors separately from Worker runtime exceptions.
9. **External service retirement:** retain private event media until its Cloudflare replacement (if required) is implemented and migrated. Retire any remaining Supabase or Vercel dependency only after confirming no live code path uses it.

A green deployment, healthy endpoint or populated capability catalogue alone is not sufficient to close these gates.

## Observed production API responses

The production Worker telemetry query during this audit showed no failed Worker executions. It did show:
- Two HTTP 409 responses for staff account deactivation attempts. The handler intentionally rejects conflicting or unsafe state changes; the precise UI scenario still needs authenticated acceptance.
- Two HTTP 400 responses from the Follow-up list before the latest Pages release. The latest frontend correction removes the unsupported `branch_id` query parameter and sends branch context only in `X-Branch-Id`; recheck this route after the current release.
- One HTTP 401 response from an unauthenticated staff-context request. This is the expected security boundary, not a service outage.

Do not silence these responses in monitoring. Confirm the current UI no longer generates the Follow-up query error and that account-status conflicts are clearly explained to administrators.

## Go-live rule

Keep SMS disabled. Do not run destructive D1 restores, delete audit records, remove storage secrets or retire Supabase media storage as part of a routine release. Production migrations must be forward-only, tested and applied by the guarded production deployment workflow. See [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md).
