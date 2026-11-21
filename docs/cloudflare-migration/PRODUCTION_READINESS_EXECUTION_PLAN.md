# PCG Missions Cloudflare production-readiness plan

**Official frontend:** https://pcg-missions.pages.dev/  
**Target application backend:** Cloudflare Workers  
**Target application database:** Cloudflare D1, EU jurisdiction  
**Identity provider:** Existing Supabase Auth  
**Status:** In progress; production cutover is blocked.

This document is an execution checklist, not a claim that the listed work is complete.

## Non-negotiable architecture

- Keep the existing Cloudflare Pages project `pcg-missions` as the only official frontend.
- Use Cloudflare Workers for application APIs and D1 for application data.
- Retain the existing Supabase Auth project and all existing Auth user identities.
- Remove Better Auth from the target architecture. Do not create a second credential/session system.
- Store no password hashes, access tokens, refresh tokens or browser sessions in D1.
- Preserve all six roles: `admin_pastor`, `coordinator`, `team_leader`, `field_worker`, `follow_up_volunteer`, `prayer_intercessor`.
- Do not enable SMS/Arkesel as part of this migration.
- Do not switch production Pages variables or production API routing until acceptance gates pass.

## Current verified blockers — 21 November 2026

The previous Better Auth blockers above have been superseded by the Supabase Auth implementation on `feat/cloudflare-d1-migration-foundation`. The current source uses Supabase Auth token verification and an Auth Admin adapter; `cloudflare/package.json` no longer has a Better Auth dependency. This is source-level progress, not a deployed or accepted production system.

1. The full Worker is not deployed. The preview deployment workflow currently receives an empty `CLOUDFLARE_API_TOKEN`; run [44938335612](https://github.com/Elgit4/PCG_Missions/actions/runs/44938335612) failed at the credential guard before Wrangler ran. Cloudflare currently has only `pcg-missions-api-nonprod` and `pcg-missions-d1-smoke`; `pcg-missions-api-preview` is absent.
2. The frontend business API adapter in `web/src/lib/cmi-api.ts` still targets Supabase Edge Functions. `CMI_WORKER_API_URL` is defined but not consumed. Do not switch it until every operation has a compatible, tested Worker route.
3. Worker route coverage is partial. Existing routes cover core staff context/lifecycle, invitations, contacts, follow-up, selected prayer workflows and notifications. Teams/service areas, typed reports, calendar, announcements/content, event registration/assignment/check-in/closeout, flyer storage and several staff password-reset operations are not yet at frontend API parity.
4. Supabase Auth verifier and Admin adapter are unit-tested, but the deployed Worker needs its environment configuration and server-only `SUPABASE_SERVICE_ROLE_KEY` for Auth Admin invitation provisioning. That secret must be configured as a Worker secret, never a Pages variable or source-code value.
5. The EU D1 database `pcg-missions-migration-test` is a rehearsal only: schema version 37, 86 application tables, 61 capabilities, 65 role-capability grants, 3 staff profiles, 2 role assignments, 3 Supabase identity references, and 6 staff-access audit rows. `PRAGMA foreign_key_check` currently returns no violations. This does not establish source-to-destination data parity or production readiness.
6. The rehearsal still needs deterministic, repeatable import/export and reconciliation, including explanation of the additional D1-generated staff-access audit row.
7. Private R2 flyer storage, six-role desktop/mobile authenticated acceptance, backup/restore rehearsal, monitoring and rollback testing remain incomplete.
8. The official Pages project still uses production branch `feat/cmi-pcg-missions-final-review-v6`. Production Pages configuration, Supabase Auth identities and production data remain unchanged.

## Workstream A — Identity and session security

- Implement request-scoped Supabase access-token verification in the Worker. Prefer Supabase's authenticated user endpoint initially; do not merely decode JWTs.
- Resolve the verified Auth UUID to exactly one D1 staff profile.
- Enforce active profile, active branch assignment, current role, capability, resource scope and record ownership for every protected route.
- Fail closed on invalid tokens and Auth upstream outages.
- Remove Better Auth routes and dependencies only after equivalent routes are mapped and tested.
- Replace invitation acceptance with a Supabase Auth Admin adapter. Use a failure-safe, idempotent saga for the non-transactional Auth + D1 operations.
- Preserve administrator-provisioned accounts, no public self-signup, first-login password change, 24-hour temporary-password expiry and administrator-assisted reset semantics.
- Keep service-role credentials exclusively in Worker secrets. Never return or log them.
- Test invalid/expired/revoked tokens, inactive staff, missing profile, branch mismatch, revoked/expired role assignments, Auth outage, duplicate invitation acceptance and compensation failures.

## Workstream B — Database and data correctness

- Reconcile every source migration and the existing D1 migration ledger; do not equate migration counts with feature parity.
- Map all 29 Supabase source migrations, including the 12 outstanding features, to ordered SQLite-compatible D1 migrations.
- Verify constraints, indexes, triggers, foreign keys, unique keys, timestamps, JSON semantics and transaction boundaries.
- Reconcile the production capability catalogue and role grants by exact capability/role/scope, not totals alone.
- Build a repeatable export/import process with deterministic IDs and audit behavior.
- Compare source and destination counts, key relationships and representative records.
- Run `PRAGMA foreign_key_check`, migration replay from empty state, upgrade replay from the staged baseline, and restore/re-import tests.
- Keep the Supabase source unchanged until a separate production migration approval.

## Workstream C — Complete backend parity

Port and verify every required operation currently provided by Supabase Edge Functions and PostgreSQL RPCs. Maintain a route-to-handler-to-capability matrix.

Required modules include:
- staff authentication lifecycle and account administration;
- contacts, notes, interactions and follow-up tasks;
- pastoral care and assigned prayer inbox;
- teams and service areas;
- typed ministry reports, review and resubmission;
- internal notifications and recipient-scoped read state;
- public content, announcements and content operations;
- calendar and event management;
- event staff assignment, registration, cancellation, check-in and closeout;
- event flyer upload, metadata and private delivery;
- audit logging and first-admin bootstrap.

Do not expose a route until its authorization, validation, rate limiting, idempotency, error handling and tests are in place.

## Workstream D — Frontend integration

- Inventory every frontend call to Supabase Edge Functions and database APIs.
- Introduce an environment-configured API base URL with distinct preview and production values.
- Keep the existing Pages `/api/auth` proxy for the supported Supabase Auth flows until each route has a verified replacement or an explicitly approved retained Auth-only responsibility.
- Connect preview frontend only to the non-production Worker and D1 database.
- Preserve current UI behavior, role-specific navigation, loading/error states and responsive layouts.
- Verify no production build contains non-production endpoints, secrets or test data.

## Workstream E — Cloudflare infrastructure and operations

- Keep existing non-production resources intact while testing.
- Provision production D1 with EU jurisdiction only after approval and documented schema compatibility.
- Configure production Worker bindings and secrets separately from preview.
- Use R2 for private event flyers only after the account feature and access policies are approved and configured.
- Configure rate limits, request size limits, security headers, origin allowlists, structured redacted logs and health checks.
- Add monitoring for Worker exceptions, D1 failures, Auth upstream failures and latency.
- Evaluate Workers Paid using measured CPU and request requirements; do not upgrade without an approved cost estimate.
- Document D1 export, restore and rollback procedures.

## Workstream F — Required release gates

### Gate 1: Non-production build
- Clean install, lint, typecheck, unit tests and Worker tests pass.
- All D1 migrations replay successfully from an empty database.
- All Worker routes have automated authorization and validation tests.

### Gate 2: Data rehearsal
- Backup/export is verified.
- Import is repeatable and produces deterministic counts.
- Foreign-key and integrity checks pass.
- All six roles and branch/resource boundaries are tested.

### Gate 3: Frontend acceptance
- Preview Pages is connected only to preview Worker/D1.
- Sign-in, refresh, logout, password change and administrator reset request flows work.
- Desktop and mobile workflows pass for all six roles.
- No production data is written by preview.

### Gate 4: Production authorization
Requires separate explicit approval for:
- creating paid resources or upgrading plans;
- creating production D1/Worker/R2 resources;
- importing production data;
- changing official Pages production variables or API routing;
- retiring any Supabase business-data services.

### Gate 5: Cutover and rollback
- Take and verify final source backup.
- Perform final controlled data synchronization.
- Switch official Pages to the production Worker only after all previous gates pass.
- Verify critical workflows and monitor errors.
- Keep the original Supabase application data available for the agreed rollback period.
- Do not delete Supabase Auth; it remains the identity provider.

## Definition of production ready

The application is production ready on Cloudflare only when the official Pages frontend uses the production Worker, the Worker uses the production EU D1 database, Supabase Auth remains the sole identity authority, all required business operations and six-role authorization tests pass, private files are correctly protected, data reconciliation and backup/restore are verified, monitoring is active, and a tested rollback procedure exists.

A successful D1 schema replay alone is not production readiness.
