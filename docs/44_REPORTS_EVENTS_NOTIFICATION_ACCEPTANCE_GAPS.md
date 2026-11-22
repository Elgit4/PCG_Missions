# Reports, Events and Notification Acceptance Gap Review

**Review base:** `migration/cloudflare-auth-consolidation`  
**Review scope:** Cloudflare Worker source and D1 migrations  
**Status:** Source-level review only; no authenticated remote D1 or browser acceptance was performed.

## Ministry reports

The Worker exposes collection list/create, item detail, review and resubmission routes. The D1 migration `0022_typed_ministry_reports.sql` defines:
- branch/team/own-report capability checks and report scope constraints;
- submitted/returned/approved lifecycle rules;
- a database trigger that appends `report_review_event` whenever `last_action_id` changes;
- immutability guards on review history.

The Worker review and resubmission handlers update the report's `last_action_*` fields. The database trigger, not an additional Worker insert, is responsible for the history row. This is an important distinction: an integration test must apply the real migration and verify the trigger-generated event, actor, decision, comment and timestamp.

Existing `worker-routes.test.mjs` coverage confirms anonymous report reads/submissions are rejected before D1 access. It does not provide positive authenticated list/create/detail/review/resubmit lifecycle coverage against migrated D1. A mock that only returns a successful UPDATE is insufficient to validate the history trigger.

Required acceptance:
1. Author submits each supported report type within own branch/team/event scope.
2. Own-report, team-review and branch-review projections enforce their respective scopes; cross-branch and self-review are denied.
3. Reviewer returns a submitted report with a required comment; report status and exactly one immutable history event are persisted.
4. Author resubmits a returned report; status returns to submitted and a second immutable `resubmitted` history event is persisted.
5. Reviewer approves; status and third history event persist; repeated review is rejected.
6. Unique-period conflicts, invalid aggregate values, event/team scope mismatch and failed writes do not create partial history.
7. `PRAGMA foreign_key_check` returns zero violations after the test lifecycle.

## Event registration, check-in and closeout

The Worker contains staff-scoped registration, cancellation, check-in, closeout submission and closeout review operations. The D1 schema uses idempotency receipts and database guards for registration state, capacity, event scope and closeout history.

Existing `worker-routes.test.mjs` covers anonymous denial for registration, check-in and closeout. It has positive tests for event staff/team assignment, but not a full positive registration → check-in → closeout submit → review/return → resubmit lifecycle against real migrated D1.

Required acceptance:
1. Authorized event assignee registers an attendee while registration is open and capacity remains.
2. Replaying the same idempotency key and payload returns the original registration; reusing the key with a different payload is rejected.
3. Closed registration, full capacity, wrong branch and unauthorized assignee are rejected without partial writes.
4. Check-in marks the registration attended and records one check-in; replay is idempotent and duplicate check-in is rejected.
5. Closeout counts are derived from persisted check-ins, active registrations and transport reservations, not client input.
6. Submit creates one closeout and append-only history event; review is limited to the review capability; return requires a reason; resubmission and final approval are validated.
7. Cancellation/completed-state conflicts and all transaction failure paths leave no partial receipts or records.
8. `PRAGMA foreign_key_check` returns zero violations.

## Internal notifications

The Worker has recipient-scoped notification list, unread count, single-read and read-all endpoints. The D1 table enforces a unique idempotency key and references the recipient's staff identity.

Source review of `cloudflare/src/index.ts` found a producer for Admin/Pastor notifications on password-reset requests. It did not find notification inserts in the follow-up assignment/reassignment, event assignment, or report review/resubmission handlers. Therefore the inbox read API is present, but the broader operational trigger-to-recipient lifecycle is not proven and appears incomplete for those workflows.

Required acceptance and implementation:
1. Define the exact notification event contract and recipient selection for follow-up assignment/reassignment, event assignment/revocation and report review/return/approval.
2. Insert notification rows in the same atomic D1 batch as the originating state change where practical; derive recipients server-side from active assignments and branch/team scope.
3. Use deterministic idempotency keys per domain event and recipient; do not include pastoral narratives, private notes or unnecessary phone/email data in notification text.
4. Ensure recipients can list/read only their own notifications in the correct branch; another staff member cannot mark a notification read.
5. Verify unread counts, read-all, repeat delivery, recipient revocation and branch changes against real D1.
6. Keep SMS, email and push dispatch disabled; these requirements concern the in-app inbox only.

## Release decision

Do not describe report lifecycle, complete event attendance/closeout, or operational notification delivery as end-to-end accepted until the positive D1 integration tests above pass. No capability grants, schema changes, production writes, deployments, SMS activation or notification dispatch are included in this review.
