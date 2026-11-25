# PCG Missions — Current Runtime Reconciliation Audit

**Date:** 25 November 2026  
**Base:** `main`  
**Scope:** Reconcile release checkpoint claims with the current checked-in runtime entrypoint, scheduled reminder implementation, Cron configuration and regression tests. This is source evidence, not production deployment or authenticated acceptance.

## Confirmed source facts

- `cloudflare/src/worker.ts` exports both `fetch` and `scheduled`. The scheduled handler queues `processDueFollowupReminders` with `context.waitUntil`, logs aggregate completion counts and avoids logging task/recipient identifiers or SQL details on failure.
- `cloudflare/src/scheduled-followup-reminders.ts` queries open/in-progress tasks with due timestamps, requires active staff and an effective role assignment in the task's branch, and excludes an existing idempotency key.
- Reminder creation is recipient-scoped in-app notification only. It uses generic notification copy rather than visitor/contact details.
- The scheduled processor is bounded to 50 tasks per invocation. Notifications are inserted with `INSERT OR IGNORE`, a task/due-time/assignee idempotency key, and a revalidation predicate in the insert statement.
- `cloudflare/wrangler.toml` defines a production Cron schedule of `*/15 * * * *`. The source therefore includes scheduled execution wiring. This alone does **not** prove that the currently deployed production Worker version has the schedule or that production Cron execution is functioning.
- Tests exist for empty task sets, generic recipient-scoped reminder inserts, invalid timestamps, the 50-task limit and scheduled entrypoint behavior/failure reporting.

## Reconciliation of conflicting checkpoint language

The 24 November cutover checkpoint incorrectly states that there is no Worker `scheduled()` handler and no production Cron Trigger. Current source on `main` contains both the handler and the production Cron configuration described above. That checkpoint statement should not be used as current source truth without verifying the exact commit it refers to and comparing it with the deployed Worker.

The production deployment state still requires read-only Cloudflare inspection. Production D1 schema 45 and Worker version 20 were reported in the 24 November checkpoint; this audit does not independently verify or change that live state.

## Remaining scheduler acceptance risks

1. **Deployment-state verification:** confirm the Cron schedule is attached to the live production Worker, not merely configured in source.
2. **Operational observation:** confirm at least one real scheduled invocation from safe, aggregate observability without exposing contact or pastoral data.
3. **Quota-aware test strategy:** do not rerun write-heavy remote rehearsals while the account-level D1 daily row-write limit is exhausted. Prefer local/isolated unit and migration tests and use a quota-aware remote gate.
4. **Retry/backlog behavior:** batch is capped at 50. Successful notifications naturally remove tasks from the candidate set through the idempotency exclusion; failures may retry the same eligible set on the next invocation. Validate behavior with controlled fixtures and no production visitor data.
5. **Eligibility semantics:** tasks with active profiles and effective branch role assignments are eligible; verify the intended task assignee/role policy against the product specification and acceptance tests.
6. **No external messaging:** the processor only creates generic in-app notifications. SMS/email/push delivery must not be inferred or enabled by this feature.

## Release blockers unaffected by this audit

- The full isolated production-schema and authenticated acceptance rehearsal is incomplete due to D1 daily write quota exhaustion.
- The production-data clone/recovery rehearsal is incomplete.
- Migrations 46–49 have not been verified as applied in production.
- Production Worker/Pages candidate promotion remains unverified.
- Church-approved privacy, retention, pastoral access governance and real staff acceptance are not replaceable by source tests.

## Verification boundary

This reconciliation was performed by reading the repository source and test files. No production data, Worker, Pages deployment, secret, Cron configuration or staff account was mutated. No test execution is claimed in this document.
