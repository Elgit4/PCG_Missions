# PCG Missions — Production operations runbook

**Applies to:** Cloudflare production  
**Last verified:** 24 November 2026 (UTC). Production cutover remains gated; this runbook records the current release controls and must not be read as evidence that the current release candidate is live.

## 1. Production endpoints and resources

- Public PWA: `https://pcg-missions.pages.dev`
- Worker: `https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev`
- Production D1 name: `pcg-missions-production`
- Production D1 ID: `2bbfb04f-9182-427d-b269-d050b8a9403f`
- Cloudflare account ID: `1697f36d4227453d2e25cfb49b347e5f`
- Pages project: `pcg-missions`
- Pages production branch: `main`
- Automatic Pages production deployments: disabled until the explicit production cutover is approved

Never put API tokens, database credentials, user passwords, Better Auth secrets, storage keys or private visitor/pastoral data in Git, issues, workflow output or chat.

## 2. Current system architecture

Pages serves the web application. The Pages Function route `web/functions/api/[[path]].ts` forwards same-origin `/api/*` calls to the production Worker and preserves HttpOnly `Set-Cookie` headers. The Worker verifies the trusted origin, resolves Better Auth sessions, checks staff status, validates the active branch and enforces capabilities in server-side data handlers. D1 stores application data and Better Auth identity/session records.

Supabase is retained only for the private event media bucket `pcg-missions-event-media`. The Worker uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for that bucket. Never move the service-role key into Pages variables or browser build variables.

## 3. Daily read-only health checks

Run these checks before diagnosing a user-reported outage:

```bash
curl -fsS https://pcg-missions.pages.dev/
curl -fsS https://pcg-missions.pages.dev/api/v1/health
curl -fsS https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev/health
curl -i https://pcg-missions.pages.dev/api/auth/get-session
curl -i https://pcg-missions.pages.dev/api/v1/me
```

Expected when signed out:
- Pages responds HTTP 200.
- API health responds HTTP 200 with `ok: true`, `environment: "production"` and the current schema version.
- Better Auth `get-session` responds HTTP 200 with an empty session.
- Staff context `/api/v1/me` responds HTTP 401 with `UNAUTHENTICATED`.

A 401 from the unauthenticated staff-context check is expected. It is not evidence of an outage.

## 4. Guarded production release workflow

Production releases must use `.github/workflows/cloudflare-production-worker-deploy.yml` (workflow name: **Cloudflare Production Worker Deploy**). The older `cloudflare-production-release.yml` and `cloudflare-production-release-trigger.yml` files are retired audit artifacts and intentionally fail if invoked; do not use them.

The active workflow has two authorized entry paths: (a) manual `workflow_dispatch` from `migration/cloudflare-auth-consolidation` or `main`, with the exact `DEPLOY-PRODUCTION` confirmation; or (b) a push to `main` that changes only `.github/production/DEPLOY-PRODUCTION` and whose contents are exactly `DEPLOY-PRODUCTION`. Do not create that marker commit until every prerequisite is green and the owner explicitly authorizes the production release. A marker push starts the full guarded pipeline; it is not a harmless preview trigger.

The pipeline orders its gates as follows:
1. Read-only production roster preflight (six-role catalogue, credential-ready active Admin/Pastor owner, active staff credentials, and narrowly owner-authorized cleanup candidates).
2. Full isolated D1 restore and six-role authenticated acceptance rehearsal.
3. Full production-data export into an ephemeral runner and import into an isolated EU D1 clone, manifest/foreign-key comparison, Time Travel restore probe, and cleanup.
4. Current-source CI/preview acceptance and production-target/environment checks.
5. Production D1 bookmark, forward-only migrations, schema/ledger verification and controlled write-budget probe.
6. Production Worker deployment, explicit Pages build/deploy, and direct plus same-origin health/session/CORS smoke tests.

The workflow is deliberately serial and protected by the GitHub `production` environment. Keep required reviewers and branch restrictions enabled. Do not bypass a failed job, manually apply migrations, or deploy Worker/Pages separately to get around a failed gate. The Pages Git integration's automatic production deployment remains disabled; the guarded workflow performs the explicit Pages deployment after all gates pass.

The workflow does not import credentials from Supabase. The one-time staff credential bridge was part of the earlier migration. Do not add `SUPABASE_SOURCE_DB_URL` back to routine Worker deployment requirements.

## 5. Pages deployment

Cloudflare Pages is Git-integrated. The configured production branch is `main`; automatic production deployments are currently **disabled**. The migration branch is a preview branch. The current canonical production Pages deployment remains unchanged. Do not re-enable automatic production deployments or create a production Pages deployment until the production cutover has explicit approval and the Worker/D1 release gates have passed. Root directory is `web`; build command is `npm run build`; output directory is `dist`; Node.js is 22. Production `PCG_MISSIONS_API_ORIGIN` must remain exactly:

`https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev`

Verify the latest Pages deployment commit and successful build/deploy stages in Cloudflare before declaring a UI release complete. Frontend-only changes must not require a Worker deployment.

## 6. Database migration rules

- D1 migrations are forward-only and live under `cloudflare/migrations/`.
- Never edit or reorder a migration already applied in production.
- Test the complete ordered migration chain against isolated SQLite and preview D1 before production.
- Keep schema changes backwards-compatible with the Worker version currently receiving traffic.
- The production Worker release workflow records the current Time Travel bookmark before applying migrations. Wrangler documents that `d1 migrations apply` captures a backup after applying; do not assume this removes the need for an independent recovery plan.
- Verify `app_meta.environment = 'production'`, schema version and migration ledger after every migration.
- Never perform Time Travel restore against production as a routine deployment action. Restore is destructive and requires an incident owner, a verified target bookmark, a written impact decision and an independently captured current-state bookmark.

### 6.1 D1 restore rehearsal

The `Cloudflare D1 Restore Rehearsal` workflow creates a temporary EU D1 database, applies the complete current migration chain, captures a Time Travel bookmark, writes a synthetic probe, restores to the bookmark, verifies the probe is gone and schema/migration metadata remain intact, then deletes the temporary database. The schema 46 rehearsal passed on 22 November 2026.

This rehearsal validates the D1 Time Travel mechanism against an isolated schema-only database. It does not constitute a production-data restore test. Production currently has a Time Travel bookmark available; do not restore production as a routine operation.

## 7. Secret management

Production Worker secrets are set in Cloudflare Workers & Pages → `pcg-missions-api-production` → Settings → Variables and Secrets. Secret values must never be displayed, copied to logs or committed.

Required production secrets:
- `BETTER_AUTH_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` — only for the private event media bucket.

Required non-secret Worker configuration values include:
- `APP_ENV=production`
- `APP_ALLOWED_ORIGINS=https://pcg-missions.pages.dev`
- `BETTER_AUTH_URL=https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev`
- `BETTER_AUTH_TRUSTED_ORIGINS=https://pcg-missions.pages.dev,https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev`
- `SUPABASE_URL` for private event media only.

Do not create a secret in Pages. Never expose a secret through any `VITE_*` variable. Do not delete or rotate an authentication/storage secret without a coordinated migration and verified rollback plan.

## 8. User access and recovery

- Staff accounts are provisioned by authorized administrators; public self-sign-up remains disabled.
- Staff must change temporary passwords during first use.
- The 22 November 2026 production audit found one active profile with no effective role assignment and an expired first-login setup window. Do not extend the expired password window while retaining the old temporary password.
- For that profile, the staff member should use **Forgot password?** on the sign-in screen. An Admin/Pastor reviews and approves the resulting request in **Access requests**, then privately hands over the one-time temporary credential shown by the application. The staff member must complete the forced password change before being assigned an operational role.
- The Team Leader role assignment currently belongs to an inactive profile. Keep that profile inactive unless the church explicitly authorizes reactivation; its assignment does not give the inactive account access.
- Password-reset requests must be reviewed by an authorized administrator.
- Use an approved email provider only after delivery tests and sender/domain verification pass. Until then, use the application's guarded one-time manual handoff and deliver credentials privately.
- Verify the staff member completes the forced password change. Confirm that old sessions are revoked when the reset flow requires it.
- Never ask staff to send their password or session cookie to support.

## 9. Privacy and operational safeguards

- Use synthetic people and contact details in preview/testing.
- Do not load real visitor, prayer or care records before the church's privacy notice, lawful purposes, retention/deletion rules, data-controller contact and pastoral-access policy are approved.
- Prayer and care narratives are sensitive records. Do not use broad exports or screenshots for debugging; use request IDs and safe metadata.
- Keep SMS/Arkesel disabled. No scheduled workflow may dispatch messages.
- The current Worker source has a `fetch` handler only; it has no `scheduled()` handler, and the production Worker has no Cron Trigger. Scheduled follow-up/reminder processing and scheduled publishing are therefore not operational. Do not attach a Cron Trigger or claim these automations are live until an idempotent, observable scheduled handler and its D1 integration tests are implemented and accepted.
- Keep Transport, public self-registration and offline staff data disabled until their separate security and operational acceptance gates pass.

## 10. Incident response

1. Record the time, affected user action, browser, request ID and exact error code. Never collect a password, session cookie or private narrative.
2. Check Pages deployment status, direct Worker `/health`, same-origin `/api/v1/health`, and Worker error telemetry.
3. Distinguish expected authorization responses (401/403/409) from gateway failures (502), unavailable dependencies (503) and input validation (400).
4. Use request ID/Ray ID and route/method to correlate logs. Do not print cookie/header values or submitted contact/prayer content.
5. Avoid retrying a mutating action blindly. Check idempotency outcome first to prevent duplicate records.
6. For a suspected data incident, stop the affected workflow, preserve logs and audit records, and escalate to the church's designated data-controller/incident contact.
7. For a database restore, follow the destructive-restore approval requirements in section 6. Do not improvise a bookmark.

## 11. Release checklist

- [ ] Preview Worker, D1 migrations, route tests and frontend CI pass on the exact release commit.
- [ ] Authenticated tests cover login, forced password replacement, reset, session expiry and sign-out.
- [ ] Six-role authorization, branch isolation and sensitive-record negative tests pass.
- [ ] Production environment protection and required reviewers are enabled.
- [ ] Production D1 bookmark captured and retained.
- [ ] Production migration is forward-only and backwards-compatible.
- [ ] Required production Worker secret names are present (values never printed).
- [ ] Worker deployment and direct health/auth/CORS checks pass.
- [ ] Pages deployment is on the reviewed commit; same-origin health/session checks pass.
- [ ] Email sender tested or manual handoff procedure confirmed.
- [ ] Privacy and retention approval recorded before real ministry data is entered.
- [ ] Scheduled processing has an implemented `scheduled()` handler, Cron configuration, idempotency/retry controls and authenticated-domain integration tests; until then, automated follow-up/reminders and scheduled publishing are explicitly marked unavailable.
- [ ] SMS remains disabled.
