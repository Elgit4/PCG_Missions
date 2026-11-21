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

## Current verified blockers

1. `cloudflare/src/auth.ts` still imports and constructs Better Auth.
2. `cloudflare/src/staff-context.ts` still resolves sessions using Better Auth.
3. `cloudflare/src/index.ts` still uses Better Auth for invitation sign-up and serves its `/api/auth/*` handler.
4. `cloudflare/package.json` still depends on `better-auth`.
5. The frontend business API adapter still targets Supabase Edge Functions.
6. Supabase Edge Function operations have not all been ported to Worker handlers.
7. Staff notification schema exists in D1, but notification producers and recipient-scoped API handlers remain incomplete.
8. Private R2 flyer storage and its signed upload/download flows are not deployed.
9. The staging data rehearsal has one extra D1-generated staff-access audit row; the import must be repeatable and produce an explained, deterministic audit result.
10. Six-role authenticated browser acceptance, backup/restore rehearsal and production cutover have not been completed.

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
