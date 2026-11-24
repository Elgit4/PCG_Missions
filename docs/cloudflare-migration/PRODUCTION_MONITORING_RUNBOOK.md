# PCG Missions monitoring and release-check runbook

Last verified: 2026-11-22

## Monitoring now configured

### Cloudflare Pages deployment alerts
- Policy: `PCG Missions Pages deployment failures`
- Policy ID: `b25d693bf68f4c72ba868783cff8efba`
- Scope: Pages project `pcg-missions`, preview and production environments, deployment-failed events only.
- Delivery: Cloudflare account owner email.
- Cloudflare accepted a test notification request successfully on 2026-11-22. This confirms policy/test dispatch acceptance, not mailbox receipt.

### Worker observability
The non-production Worker `pcg-missions-api-preview` already has Cloudflare Workers Observability enabled:
- invocation logs enabled and persisted;
- log sampling rate: 100%;
- traces enabled and persisted;
- trace sampling rate: 10%;
- query-string redaction enabled.

Do not copy request authorization headers, passwords, temporary credentials, or sensitive pastoral/prayer content into logs.

### Synthetic availability monitor
Workflow: `.github/workflows/pcg-missions-availability-monitor.yml`

Checks:
1. Current public Pages production URL responds HTTP 200 and serves the PCG Missions page.
2. Preview Worker health reports `ok=true`, `environment=non-production`, and schema version 43.
3. Anonymous `/api/v1/me` requests remain rejected with HTTP 401 and `UNAUTHENTICATED`.

The workflow runs every 15 minutes once present on the repository default branch, can be manually dispatched, and is also wired to a push on the migration branch. On a failure it opens one deduplicated GitHub issue and comments on that issue for subsequent failures. GitHub issue notifications depend on repository notification settings.

The monitor is deliberately read-only. It does not mutate D1/Supabase, change production routing, or send SMS.

## Current release facts and boundaries

- Cloudflare Pages production branch remains `feat/cmi-pcg-missions-final-review-v6`.
- The last known canonical production Pages deployment completed successfully on 2026-11-21. A fresh browser/runtime HTTP check has not yet been confirmed by this runbook.
- Latest migration-branch Pages deployments for docs/workflow-only commits are skipped by the project's `web/*` path filter. This is expected and is not a frontend build failure.
- Preview Worker is configured for `APP_ENV=non-production` and the migration-test D1 database, schema 43.
- No production application Worker is provisioned. Do not treat preview Worker health as production Worker health.
- The production-named D1 database remains marked `non-production`; do not change that marker to make deployment appear production-ready.
- No production cutover or production data mutation is authorized by these monitoring checks.

## Final release checks still required before cutover

- Deploy and verify a separate production Worker with production-only D1 binding, production secrets, and production origin allowlist.
- Add production Worker-specific health, error-rate, latency, and alert checks after the production Worker exists.
- Run authenticated end-to-end acceptance against isolated test identities and fixtures.
- Complete backup/restore and data reconciliation gates.
- Verify rollback procedure and the exact known-good Pages/Worker/D1 versions.
- Obtain explicit production cutover approval before changing the Pages production branch, environment variables, DNS, or Worker routing.

## Incident response

1. Open the failed GitHub Actions run or Cloudflare Pages deployment details.
2. For Pages failures, inspect build and deploy stage logs before retrying.
3. For Worker failures, inspect Cloudflare Workers Observability logs/traces and correlate by request ID and timestamp.
4. Confirm whether the failure affects only preview or the currently served Pages production app.
5. Do not switch production routing to the migration preview Worker or migration-test D1 as a workaround.
6. Record the incident, mitigation, and verified recovery in the migration PR.
