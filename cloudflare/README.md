# PCG Missions — Cloudflare Runtime

> **Current deployment reference — 23 November 2026.** This file replaces the original bootstrap-era status below, which described schema 15 and an undeployed Worker. Those statements are obsolete.

The production application is hosted on Cloudflare Pages, with the authenticated API and staff operations on a Cloudflare Worker backed by Cloudflare D1. The current migration candidate is maintained on \`migration/cloudflare-auth-consolidation\`.

## Live environment snapshot

| Component | Production | Preview |
|---|---|---|
| Pages | \`pcg-missions.pages.dev\` | Migration-branch preview deployment |
| Pages production branch | \`main\` | Candidate branch |
| Automatic Pages production deployments | Disabled; guarded manual release | Preview workflow |
| API Worker | \`pcg-missions-api-production\` | \`pcg-missions-api-preview\` |
| Authentication | Better Auth on the production Worker | Better Auth on the preview Worker |
| Database | \`pcg-missions-production\` | \`pcg-missions-migration-test\` |
| D1 jurisdiction | EU | EU |
| D1 schema | **45** | **47** |
| Applied migration ledger | 45 migrations | 47 migrations |

Production and preview are separate environments. The production Worker is bound to the production D1 database; the preview Worker is bound to the isolated preview D1 database. The Pages production configuration points to the production Worker, while preview points to the preview Worker.

The production Pages hostname is currently the Cloudflare \`pages.dev\` hostname; no custom domain is attached. Automatic production deployments remain disabled deliberately. The guarded production workflow performs the reviewed Worker and Pages deployment in sequence.

## Runtime architecture

- **Cloudflare Pages** serves the responsive web application and same-origin API/auth proxy.
- **Cloudflare Worker** owns Better Auth staff authentication, session validation, capability checks, and the application API.
- **Cloudflare D1** is the primary operational database for church, branch, staff identity, role/capability, contacts, follow-up, events, reports, announcements, notifications, audit, and other application records.
- **Cloudflare Workers KV** stores private event-flyer media in the EU namespace `pcg-missions-event-media`, accessed only through the Worker `EVENT_MEDIA` binding and 15-minute HMAC-signed URLs. No Supabase runtime credentials or endpoints are required.
- **SMS/Arkesel** remains intentionally disabled. Routine deployment, testing, and acceptance must not send SMS.
- Staff accounts are provisioned by authorised administrators. Public self-registration is not part of the staff authentication flow.

The six standard staff roles are:

1. Admin/Pastor
2. Coordinator
3. Team Leader
4. Field Worker
5. Follow-up Volunteer
6. Prayer Intercessor

Authorisation is capability-based and branch/team scoped. Sensitive pastoral access is separately restricted and audited.

## Current production release gate

The production D1 database currently has schema 45, while preview has schema 49. Migrations 46–49 remain pending in production and are applied only through the guarded, forward-only release workflow.

The guarded release workflow requires all of the following before any production mutation:

- Six configured role definitions and at least one credential-ready, active Admin/Pastor owner.
- Every active staff profile has an effective role and a valid Better Auth credential.
- No active role assignment is attached to an inactive staff profile.
- No active profile has an expired or missing first-login password setup window.

The production cutover does **not** require six production users or all six role codes to be assigned. Additional staff are provisioned after release through the authenticated Staff workspace; each staff member establishes or changes their own password through the first-login onboarding flow. The six-role API and authorization boundaries are exercised in the isolated acceptance rehearsal, not by fabricating production identities.

**Do not run the production release workflow until the owner gate and the isolated authenticated acceptance and restore rehearsal have succeeded.** A green CI result or healthy Worker endpoint is not a substitute for those checks.

## Development and verification

From the repository root:

\`\`\`bash
python -m unittest discover -s cloudflare/tests -p "test_*.py" -v
\`\`\`

From \`cloudflare/\`:

\`\`\`bash
npm install --no-package-lock --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
\`\`\`

The frontend checks are run from \`web/\`:

\`\`\`bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
\`\`\`

Do not use a production database for synthetic fixtures. Authenticated acceptance and restore tests must use the isolated temporary D1 database created by the restore-rehearsal workflow.

## Release workflows

| Workflow | Purpose |
|---|---|
| \`.github/workflows/cloudflare-d1-foundation.yml\` | SQLite/D1 security invariants, Worker type-check, Better Auth integration tests, and acceptance-harness syntax |
| \`.github/workflows/cmi-web-ci.yml\` | Frontend type-check, lint, tests, and production build |
| \`.github/workflows/cloudflare-preview-deploy.yml\` | Forward-only preview migration, preview Worker deployment, and health/session/anonymous-boundary smoke checks |
| \`.github/workflows/cloudflare-d1-restore-rehearsal.yml\` | Isolated D1 Time Travel restore rehearsal and synthetic authenticated API acceptance |
| \`.github/workflows/cloudflare-production-worker-deploy.yml\` | Guarded production roster preflight, current-source checks, restore/acceptance dependency, forward-only production migration, Worker and Pages deployment, and production smoke tests |

The production workflow is manually dispatched from \`migration/cloudflare-auth-consolidation\` and requires the exact confirmation string \`DEPLOY-PRODUCTION\`. It uses the GitHub \`production\` environment and the \`CLOUDFLARE_API_TOKEN\` secret. Never put credentials in source files, workflow arguments, or logs.

## Operational rules

- Keep production D1 migrations forward-only. Never run a restore against the live production database as part of routine deployment.
- Preserve the current production D1 Time Travel bookmark and retain independent backups before storing irreplaceable ministry records.
- Keep \`BETTER_AUTH_SECRET\` as a Worker secret only. Event media uses the private \`EVENT_MEDIA\` KV binding, not a Supabase service key.
- Keep query-string redaction enabled in Worker observability configuration.
- Keep SMS disabled until the provider, consent, template, opt-out, retry, and delivery-audit workflows have been explicitly accepted.
- Keep the private EU event-media KV namespace private; do not expose public object URLs or move media outside the Worker-signed delivery path.
- Treat the six-role roster, real staff sign-in, password-change, session-refresh, sign-out, branch isolation, and feature-level acceptance as release gates.

## Operational references

- [Production readiness evidence](./PRODUCTION_READINESS.md)
- [Operations runbook](./OPERATIONS_RUNBOOK.md)
- [Cloudflare migration plan](../docs/29_CMI_CLOUDFLARE_MIGRATION_PLAN.md)
- [Current release-readiness continuation audit](../docs/47_PRODUCTION_READINESS_CONTINUATION_2026-11-23.md)
