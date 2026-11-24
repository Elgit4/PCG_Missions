# PCG Missions — Production cutover readiness checkpoint

**Checkpoint:** 24 November 2026 (UTC)  
**Release decision:** HOLD — do not deploy or mutate production until all gates below pass.

This document records verified repository/workflow evidence for the current release candidate. It is not a claim that production cutover has completed.

## Verified state

| Area | Evidence at this checkpoint | Decision |
|---|---|---|
| Main source | Commit `62974ba64cc275e17cd672e49070a76f24377351` includes PR #172 reassignment SQL correction | Merged |
| D1 Foundation CI | Passed for current release source | Green |
| Cloudflare Preview Release | Passed; preview Worker version 164 and preview D1 schema 49 | Green |
| Production D1 | Schema 45; migrations 46–49 not applied | Pending |
| Production roster preflight | Passed on the latest guarded release attempt | Green |
| Isolated schema/authenticated rehearsal | First D1 API request for the schema-49 migration command failed with error 7500 (account-wide daily free-tier row-write quota exhausted); no migration ran and the scratch DB was cleaned up | Not passed |
| Production-data clone/restore rehearsal | Skipped because the preceding rehearsal failed | Not passed |
| Production Worker | Still version 20 | Not deployed |
| Production Pages | Previous production deployment remains in service; automatic Pages production deployment is disabled | Not deployed |
| Scheduled automation | No Worker `scheduled()` handler and no production Cron Trigger | Not implemented |
| SMS | Must remain disabled | Intentionally deferred |

The failed rehearsal occurred before production mutation. The isolated rehearsal database was cleaned up. No production D1 records were changed by that attempt.

## Release gates still outstanding

### A. Repeat the full isolated schema and authenticated acceptance rehearsal

After the D1 quota reset, rerun the guarded workflow against the exact current source. It must complete, not merely pass migration application.

Acceptance must cover:
- Better Auth login, forced first-password change, password reset approval/handoff, session expiry and sign-out.
- All six roles and their capability boundaries.
- Branch isolation and denial of cross-branch access.
- Contact registration, follow-up creation, assignment, reassignment and handoff.
- Recipient-scoped in-app notification creation, listing, read state and idempotency.
- Ministry report submit, return, resubmit and approve lifecycle, including immutable history.
- Event registration, idempotency, check-in, closeout submission and review, plus Worker-mediated private flyer upload, signed URL readback and deletion through the retained Supabase Storage bucket.
- Restricted prayer/care access and audit trails.
- Foreign-key integrity and rollback behavior on failed writes.

A source-level test or mock-only success is not a substitute for authenticated integration against the actual migrated D1 schema.

### B. Repeat the production-data recovery rehearsal

The workflow must export the production database only to ephemeral runner storage, clone it to a temporary EU D1 database, compare schema/migration markers and ministry row-count manifests, run foreign-key checks, verify Time Travel restore, and delete the clone and temporary export. Do not upload the SQL export as an artifact or restore production as part of a routine release.

### C. Complete the guarded production release

Only after A and B pass:
1. Reconfirm production roster preflight and current-source Foundation, web CI and preview release evidence.
2. Capture and retain the production D1 Time Travel bookmark.
3. Apply only the reviewed forward-only migrations 46–49.
4. Verify production schema version 49, migration ledger, role catalogue, identity records and key domain tables.
5. Apply only the narrowly owner-authorized staff reconciliation already encoded in the reviewed release workflow.
6. Deploy the Worker and Pages from the same reviewed commit through the guarded workflow.
7. Verify direct Worker health, same-origin Pages API health, Better Auth session boundary, unauthenticated staff boundary, CORS, and authenticated production smoke tests.

Do not enable automatic Pages production deployment or bypass a failed job.

### D. Implement scheduled processing before claiming automation is available

The Worker currently exports only a `fetch` handler. There is no `scheduled()` handler and no production Cron Trigger. The existing follow-up task `due_at` field supports due-date tracking, but that alone does not execute reminders or follow-up processing.

Before enabling a Cron Trigger, define and implement:
- Exact scheduled actions and eligible task states.
- Whether reminders are staff-only in-app notifications; SMS, email and push remain disabled.
- Deterministic idempotency keys per task, reminder window and recipient.
- Bounded batch processing and cursor/watermark behavior.
- Atomic D1 writes for deduplication and notification creation.
- Retry policy, poison-record handling, observability and safe failure reporting.
- Time-zone semantics (store/compare UTC instants; display in the configured church locale).
- Tests for duplicate invocations, overlapping invocations, late execution, rescheduled/completed/cancelled tasks, reassignment, revoked staff and branch isolation.

Do not infer that a follow-up task should automatically notify a visitor. The first release of scheduled reminders should be explicitly scoped and approved as internal staff notifications only, unless a separate consent/delivery design is accepted.

### E. Finish Supabase dependency retirement audit

The current runtime boundary test asserts that the browser has no Supabase Auth/client dependency and that Worker Supabase credentials are confined to the private event-flyer Storage adapter. Preserve Supabase Storage for `pcg-missions-event-media`. Before retiring any other Supabase service, inspect all production frontend, Pages Functions, Worker, CI, migration/import scripts and environment configuration references. Supabase Auth, PostgREST, Edge Functions and Realtime are not used by the PCG Missions runtime. However, Supabase Storage stores bucket/object metadata and authorization state in the project Postgres database, so Postgres cannot be stopped while the event-media bucket remains in use. Full Supabase project retirement requires migrating the bucket and existing objects to Cloudflare R2 or another object store, verifying the Worker upload/read/delete lifecycle there, then removing the Supabase URL and service-role secret.

### F. Approve operational privacy and data-governance controls before real ministry data

The operations runbook currently requires approval of the church's privacy notice, lawful purposes, retention/deletion rules, data-controller contact and pastoral-access policy before real visitor, prayer or care records are entered. These are launch controls, not merely technical deployment checks. Record the church's approval and operational owner before opening registration to real visitors. Preview acceptance must continue to use synthetic people and contact details.

## Non-production resource cleanup note

A separate D1 database named `pcg-missions-restore-rehearsal` remains in the Cloudflare account. Read-only inspection found schema version 43, one branch, three staff profiles, and no contacts, follow-up tasks, ministry reports or events. It is not bound to any of the currently listed application Worker scripts and is not referenced by the current per-run rehearsal workflow. Its staff-profile records have not been classified as synthetic, so it has deliberately **not** been deleted. Treat this as a post-cutover cleanup item: confirm data provenance and retention with the owner, then remove the database only if it is confirmed disposable and unreferenced.

## Staff identity retention policy

The legacy manually triggered PII-bound test-login reset workflow and its hardcoded preflight/anonymization SQL have been retired. The guarded production release uses only the non-destructive owner-audited reconciliation, preserving staff profile/user IDs, credentials and ministry history while deactivating eligible orphan accounts and revoking the specifically audited stale role. The original email addresses remain reserved on those retained identity records. Any future anonymization, credential deletion or email release requires a separate explicit owner decision and review.

## Guardrails

- No production D1 writes while the release rehearsal is blocked by quota.
- No billing-plan upgrade without explicit owner authorization.
- No direct production migration or deployment outside the guarded workflow.
- No automatic Pages deployment enablement.
- No SMS activation or outbound SMS dispatch.
- No production-data export retained in workflow artifacts or chat.
- Keep real visitor, prayer and care data out of preview acceptance.
