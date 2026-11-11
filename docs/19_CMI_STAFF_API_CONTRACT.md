# PCG Missions — CMI Staff API Contract

**Baseline:** CMI Follow-up v2.1  
**Status:** Staff session, contacts, follow-up task APIs, audited pastoral record reads, event drafts, announcement drafts, visitor-content drafts, branch calendar operations and the staff directory are merged to `main`. These Edge Functions and SQL transaction drafts are source-controlled but not deployed; business access remains fail-closed pending approved grants.  
**Backend workspace:** `supabase-cmi/`  
**Security rule:** Browser clients use a user access token and publishable/anon key only. A service-role key is never shipped to the browser.

This document defines the API boundary between the staff PWA and the CMI backend. It is intentionally separate from the historical ChurchConnect SQL tree.

## 1. Common request rules

- Base URL: `{SUPABASE_URL}/functions/v1`.
- Protected requests send `Authorization: Bearer <user-access-token>` and the public `apikey` header.
- The Edge Function validates the token with Supabase Auth and resolves the linked active `staff_profile`.
- The actor, profile ID, role assignments, capability grants and branch access are derived from trusted records. Callers must not submit actor IDs, role names, capability claims, or authoritative status fields.
- Browser origins are an exact allowlist in the server-only `CMI_ALLOWED_ORIGINS` environment variable. CORS is not authorization. Keep platform-level rate limits enabled before production.
- All staff responses use `Cache-Control: no-store` and include a request correlation ID.
- Error envelope:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "The operation is not permitted."
  },
  "request_id": "uuid"
}
```

Never log access tokens, PINs, raw request bodies, contact identity values or pastoral narratives.

## 2. Staff session

### `GET /staff-session`

Returns the authenticated user's application profile, active branches, active roles and the capabilities granted to those roles.

Success shape:

```json
{
  "data": {
    "user": { "id": "uuid", "email": "staff@example.org" },
    "staff": {
      "id": "uuid",
      "auth_user_id": "uuid",
      "full_name": "Staff member",
      "email": "staff@example.org",
      "account_status": "active"
    },
    "branches": [
      { "id": "uuid", "name": "Main Branch", "timezone": "Africa/Accra" }
    ],
    "roles": [
      { "code": "field_worker", "name": "Field Worker", "branch_id": "uuid" }
    ],
    "capabilities": [
      { "code": "contact.read.scoped", "scope_mode": "assigned", "branch_id": "uuid" }
    ]
  },
  "request_id": "uuid"
}
```

A profile that is missing, invited, inactive or suspended cannot enter the staff workspace. The capability catalogue can be populated while the role-grant table remains empty; in that state the session correctly returns no capabilities. This is deliberate fail-closed behaviour pending approval of R-01–R-12 and D-01.

## 3. Contacts

### `GET /staff-operations/contacts`

Query parameters:
- `branch_id` — required UUID; must be an active branch assigned to the staff member.
- `limit` — optional integer 1–50; default 25.
- `offset` — optional integer 0–5000; default 0.
- `search` — optional first-name search, maximum 80 characters.

Requires `contact.read.scoped`. Results are constrained by the granted scope:
- `branch`: active contacts within the authorized branch;
- `team`: contacts with an active assignment to a team the requester actively belongs to;
- `assigned`: contacts currently assigned to the requester;
- `self`: contacts created by the requester.

Other scope modes do not imply contact-directory access.

### `GET /staff-operations/contacts/{contactId}?branch_id={uuid}`

Requires `contact.read.scoped` and the same record-scope checks as the list operation. Records outside the caller's scope return 404 to avoid identifier enumeration.

### `POST /staff-operations/contacts`

Creates a contact and capture provenance in one database transaction. Requires `contact.capture.create`.

Allowed request fields:

```json
{
  "branch_id": "uuid",
  "client_request_id": "uuid",
  "first_name": "Ama",
  "last_name": "Mensah",
  "preferred_name": null,
  "phone_e164": null,
  "phone_display": null,
  "email_normalized": null,
  "age_range": null,
  "preferred_language": "en",
  "service_area_id": null,
  "team_id": null,
  "source_metadata": { "device_type": "mobile" }
}
```

The server fixes `created_by`, `captured_by` and `capture_source`; these cannot be supplied by the caller. `client_request_id` is the idempotency key scoped to the branch. The Edge Function HMACs the canonical normalized payload with a server-only key (`CMI_CONTACT_IDEMPOTENCY_HMAC_KEY`) and stores only the 32-byte digest and key version. A retry returns the original contact only when actor, key version and digest all match; reuse by another actor or with a changed payload returns 409. Set `CMI_CONTACT_IDEMPOTENCY_KEY_VERSION` to a positive integer (default `1`). Key rotation must retain old keys until the corresponding receipts expire; the current implementation uses one active version and must not rotate it while receipts remain live.

If the only create scope is `assigned`, the new contact is assigned to the capturing staff member within the same transaction. If the scope is `team`, the caller must select an active team they belong to. A branch-scoped capture does not create a team assignment unless an approved team-scoped grant and team ID are supplied.

Phone and email fields require the separate `contact.identity.capture` capability. Contact list/detail responses redact phone and email unless `contact.identity.read.scoped` applies to that specific record. Phone/email updates require `contact.identity.update.scoped`; ordinary contact update does not confer identity-field access.

### `PATCH /staff-operations/contacts/{contactId}?branch_id={uuid}`

Requires `contact.update.scoped` and record-scope checks. Only ordinary contact fields are accepted. Identity-field changes additionally require `contact.identity.update.scoped`. Status, branch, creator, merge and other lifecycle controls are not writable through this route.

## 4. Follow-up tasks

### `GET /staff-operations/followup/tasks`

Query parameters:
- `branch_id` — required active branch UUID.
- `limit` — optional integer 1–50; default 25.
- `offset` — optional integer 0–5000; default 0.
- `status` — optional `open`, `in_progress`, `completed` or `cancelled`.

Requires `followup.task.read.scoped`. The server returns only tasks matching the effective branch, team, assigned or self scope. Unsupported scope modes do not imply task access. List responses include task fields and the contact UUID only; they do not join or expose contact identity values.

### `GET /staff-operations/followup/tasks/{taskId}?branch_id={uuid}`

Requires `followup.task.read.scoped` and a matching task scope. Out-of-scope or unknown records return 404. The response includes the task plus append-only lifecycle metadata (`created`, status transitions and safe changed-field names); event details do not contain task-note text.

### `POST /staff-operations/followup/tasks`

Creates the task and its initial lifecycle event in one database transaction. Requires `followup.task.create`.

Allowed request shape:

```json
{
  "branch_id": "uuid",
  "contact_id": "uuid",
  "client_request_id": "uuid",
  "list_id": null,
  "assignee_user_id": "uuid",
  "team_id": null,
  "priority": 3,
  "due_at": "2026-11-10T10:30:00Z",
  "task_note": "Call after service"
}
```

Exactly one of `assignee_user_id` or `team_id` must be supplied. The contact and optional list must be active and belong to the requested branch. An assigned-scope creator can create a task only for themselves. A team-scope creator can create a team task only for a team they actively belong to. Assigning another active staff member or a team through branch-wide scope additionally requires branch-wide `followup.task.assign.scoped` and a valid active target in the same branch.

`client_request_id` is a branch-scoped idempotency key. The Edge Function computes a versioned HMAC of the canonical normalized request using the server-only `CMI_FOLLOWUP_IDEMPOTENCY_HMAC_KEY`; only the 32-byte digest and key version are stored. An identical retry by the same actor returns the original task. Reuse with a changed digest or another actor returns 409. Set `CMI_FOLLOWUP_IDEMPOTENCY_KEY_VERSION` to a positive integer (default `1`); do not rotate the key version while matching task receipts remain in use.

The schema preserves the pending-D-04 safe default: a task has exactly one primary target, either one staff member or one team. Creation starts in `open` status and appends a `created` event in the same transaction.

Task `due_at` values must be ISO timestamps with an explicit UTC marker or numeric offset. Transaction responses include only the allowlisted task fields; the internal client request key, digest key version and HMAC request digest are never returned to staff clients.

### `PATCH /staff-operations/followup/tasks/{taskId}?branch_id={uuid}`

Requires `followup.task.update.scoped` and task-level branch, assigned, team or self scope. Only `task_note`, `priority`, `due_at` and `status` are writable. The server enforces the priority range and status transitions, updates `completed_at` consistently, and appends a lifecycle event in the same transaction. A completed task may be reopened to `open` or `in_progress`; a cancelled task is terminal. Assignment fields, creator, branch, contact and task ID are not patchable; use the separate audited reassignment route above.

### `POST /staff-operations/followup/tasks/{taskId}/reassign?branch_id={uuid}`

Requires `followup.task.assign.scoped` with an explicit `branch` scope. The request body must contain exactly one target:

```json
{ "assignee_user_id": "uuid" }
```

or

```json
{ "team_id": "uuid" }
```

The target staff account must be active and hold an active role assignment in the same branch; the target team must be active in the same branch. Only `open` and `in_progress` tasks can be reassigned. Completed and cancelled tasks are not assignable. A request selecting the existing target is a no-op and does not add duplicate history.

The reassignment transaction locks the task, validates the actor and branch-level assignment capability, updates exactly one primary target and appends a `reassigned` event containing the old/new target UUIDs in the same transaction. It uses a service-role-only `SECURITY INVOKER` RPC and does not expose general assignment fields through the ordinary PATCH route.

Task notes are ordinary operational follow-up text only. Prayer/care narratives, contact identity values, credentials and unrelated sensitive information must never be stored in `task_note` or event metadata.

The database RPCs are `SECURITY INVOKER`, pin `search_path` to `pg_catalog` and grant `EXECUTE` only to `service_role`. Browser roles have no direct table or RPC access. No role-capability grants are seeded; these routes remain denied until the pending authorization decisions are approved.

## 5. Capability catalogue and authorization

The proposed action-code catalogue is seeded as metadata only. No role-capability rows are seeded. A capability grant is effective only when:
1. The Auth user has an active staff profile.
2. An active role assignment exists for the requested branch and time.
3. That role is active.
4. The role has the exact capability and scope mode.
5. The record satisfies the scope and any additional field/sensitivity restriction.

The presence of a role label is not authorization. Frontend navigation visibility is only a usability aid; every request is authorized server-side.

## 6. Audited prayer and pastoral-care reads (read-only; owner-directed safe-default grants)

These endpoints are read-only. They do not create requests or records, change status, assign/reassign workers, archive, or delete pastoral data. The product owner selected the conservative access defaults in document 31; PR #37 seeds only assigned prayer reads for Prayer Intercessor and reason-coded/audited prayer/care oversight reads for Admin/Pastor. The source remains unmerged and undeployed.

### `POST /pastoral-operations/prayer/requests/{requestId}/read`

### `POST /pastoral-operations/care/records/{recordId}/read`

Both endpoints require a Supabase Auth bearer token. The Edge Function independently validates it with Supabase Auth, resolves the authenticated actor from the validated user ID, and calls a fixed service-role-only database transaction. The caller cannot provide an actor ID, capability, role, scope or audit actor.

Request body for an assigned read:

```json
{
  "branch_id": "uuid",
  "access_mode": "assigned"
}
```

Request body for an oversight read:

```json
{
  "branch_id": "uuid",
  "access_mode": "oversight",
  "reason_code": "continuity_of_care"
}
```

Allowed oversight `reason_code` values are `pastoral_review`, `continuity_of_care`, `safeguarding_concern`, `complaint_review` and `administrative_review`. Free-text reasons are not accepted, reducing the risk of writing sensitive narrative into an audit ledger. Assigned reads reject a reason code.

Authorization is checked in the database transaction:
- Prayer assigned read: active staff profile, active branch and role assignment, exact `prayer.request.read.assigned` capability with `assigned` scope, and a current non-revoked assignment of that request to the actor.
- Care assigned read: the same checks with `care.record.read.assigned` and a current care assignment.
- Prayer oversight read: separate `prayer.oversight.read` capability with `oversight` scope and an allowlisted reason code. An assigned capability does not imply oversight.
- Care oversight read: separate `care.oversight.read` capability with `oversight` scope and an allowlisted reason code.

The returned prayer projection contains the request narrative and workflow fields but omits linked contact identifiers and identity. The care projection contains care-record workflow fields and at most the latest 100 restricted interactions; it omits the linked contact identifier and identity. Every successful read inserts an audit event in the same database transaction before returning content. Audit rows reject UPDATE, DELETE and TRUNCATE. Audit metadata contains the access mode and, for care reads, interaction count; it does not copy pastoral narrative.

Unknown or out-of-assignment records return 404. Missing capability or branch authorization returns 403. Invalid request fields or reason codes return 422. Both database functions use `SECURITY INVOKER`, pin `search_path` to `pg_catalog`, revoke execution from `PUBLIC`, `anon` and `authenticated`, and grant execution only to `service_role`. Direct browser table access remains revoked.

**Current source grants:** `prayer.request.read.assigned` is granted only to Prayer Intercessor at `assigned` scope. `prayer.oversight.read` and `care.oversight.read` are granted only to Admin/Pastor at `oversight` scope. Every oversight read requires an allowlisted reason code and appends an audit event in the same transaction. Care assigned-read, all pastoral mutation/list workflows and Coordinator prayer metadata remain ungranted because their operational workflows are not implemented. Church stakeholders may amend the product-owner defaults through change control. These grants are source-only until PR #37 is reviewed, merged and deployed.

## 7. Public visitor API


The existing `GET /public-content` function remains a read-only, allowlisted projection for published church profile, welcome messages, sermons, daily words, tracts, public announcements and public events. It does not expose staff tables or direct anonymous database grants.

Public registration is not enabled. The selected defaults require a narrow server transaction, a versioned privacy notice, lawful-purpose/basis review, rate limits and abuse controls before personal data can be collected.

## 7A. Event draft management (merged to main in PR #15)

The separate `event-operations` function implements a limited authoring API for private event drafts:
- `GET /event-operations/events` and `GET /event-operations/events/{eventId}` require `event.read.scoped`.
- `POST /event-operations/events` and `PATCH /event-operations/events/{eventId}` require `event.manage.scoped` with branch scope.
- New events are forced to `draft`, `private` and `registration_state='closed'`.
- Capacity, public publication, assignments and all attendee/transport/check-in/closeout operations are excluded.

The exact request fields, validation and error contract are in [document 20 — Event Draft Operations API Contract](20_EVENT_DRAFT_OPERATIONS_API_CONTRACT.md). No event read/manage grants are seeded in the current owner-directed baseline, so these draft endpoints remain denied. This slice does not implement registration, capacity, transport, check-in or closeout transactions.

## 7B. Announcement draft operations (merged to main in PR #16)

The separate `announcement-operations` function supports:
- `GET /announcement-operations/announcements` and `GET /announcement-operations/announcements/{announcementId}` for branch-scoped draft reads.
- `POST /announcement-operations/announcements` to create a private draft.
- `PATCH /announcement-operations/announcements/{announcementId}` to edit the authenticated creator's own draft.

List/detail requires `announcement.read.scoped` with branch scope. Create/edit requires `announcement.create.scoped` with branch scope. The server forces `status='draft'` and `is_public=false`; callers cannot set publication, audience, scheduling or delivery fields.

The full request and error contract is in [document 21 — Announcement Draft Operations API Contract](21_ANNOUNCEMENT_DRAFT_OPERATIONS_API_CONTRACT.md). No announcement grants are seeded; this feature remains fail-closed until its authoring/publication workflows and grants are implemented. It has not been deployed.

## 7C. Visitor content draft operations (merged to main in PR #16)

The `content-operations` function adds branch-scoped draft list/detail/create/edit for `sermon` and `welcome_message` only. It requires `content.manage.draft` with branch scope. Draft list/detail and mutation are restricted to the authenticated creator's rows; all create/update SQL requests also constrain branch and `status='draft'`.

The API never accepts caller-supplied creator, status or publication fields and forces new rows to draft with null `published_at`. Daily Word, Digital Tracts and church-wide profile editing are excluded until global authoring scope is approved under D-02. Publication, scheduling and delivery are not implemented.

See [document 22 — Visitor Content Draft Operations API Contract](22_VISITOR_CONTENT_DRAFT_OPERATIONS_API_CONTRACT.md). No public-content authoring grants are seeded; this function remains fail-closed until publication authority and workflows are implemented. It has not been deployed.

## 7D. Branch calendar operations (merged to main in PR #16)

The `calendar-operations` function provides branch-only `calendar_entry` list/detail/create/update. Reads require `calendar.read.scoped` with branch scope; mutations require `calendar.manage.scoped` with branch scope. New rows have server-forced `scope_type='branch'`, null team/event/owner fields and an authenticated creator. Updates use an `updated_at` concurrency predicate.

Team/event/own scope, the `followup` and `prayer_schedule` entry types, and deletion are not exposed. The exact endpoints and validation are in [document 23 — Branch Calendar Operations API Contract](23_BRANCH_CALENDAR_OPERATIONS_API_CONTRACT.md). No role grants are seeded; this feature remains fail-closed and undeployed.

## 7E. Branch-scoped staff directory

### `GET /staff-operations/staff?branch_id={uuid}&limit={n}&offset={n}&search={text}`

The directory is a read-only, minimized projection for authenticated staff.

- Requires the exact `staff.directory.read` capability with `branch` scope for an active branch. Other scope modes do not imply permission to enumerate branch staff.
- Returns only active staff profiles that hold at least one current, non-revoked active role assignment in the requested branch.
- Results are ordered by staff full name; pagination is bounded to `limit=1..50`, `offset=0..5000`. Optional name search is limited to 80 characters.
- The response contains only `id`, `full_name` and distinct active role `code/name` pairs. Auth user IDs, email, phone, credential metadata, assignment reasons and other personal fields are not returned.
- The route is GET-only. It does not provision accounts, activate/deactivate staff, issue/reset credentials, assign/revoke roles, or modify team membership.
- No role grants are seeded. The endpoint therefore remains denied until the applicable stakeholder authorization decisions are approved and grants are provisioned.

Example response:

```json
{
  "data": [
    {
      "id": "uuid",
      "full_name": "Ama Mensah",
      "roles": [
        { "code": "coordinator", "name": "Coordinator" }
      ]
    }
  ],
  "total": 1,
  "limit": 25,
  "offset": 0,
  "request_id": "uuid"
}
```

The read-only directory is not account administration. Staff invitation/activation, private PIN establishment/reissue, account deactivation, role assignment and capability administration remain blocked until the corresponding authentication and R-01–R-12/D-01 decisions are approved. Administrators must never receive or set a staff member's permanent PIN.

## 8. Not yet implemented

The following API families remain backend work and must not be represented as available frontend functionality:
- Follow-up list administration, bulk task operations and richer follow-up workflow automation.
- Prayer/care list endpoints, request creation, restricted update/assignment workflows, archival/deletion and retention automation. Individual-record audited reads are implemented in `main`, but remain approval-gated and undeployed.
- Event registration, serialized capacity reservation, transport reservation, check-in, idempotent replay/conflict handling and closeout submission/review.
- Announcement publication, audience expansion, scheduling, delivery and moderation workflows.
- Sermon/welcome-message draft editing is available; Daily Word, Digital Tracts and church-profile administration/publication remain unimplemented pending approved global authoring scope.
- Calendar team/event/own scopes, follow-up/prayer-schedule entry types and deletion.
- Typed ministry reporting, review workflow and scoped exports.
- SMS consent/suppression, campaign approval, transactional outbox/dispatcher, budget reservation, automation rules and delivery-log API. An internal Hubtel Business SMS adapter and status-lookup helper now exist in source, but they are not wired to an endpoint or outbox and cannot send live messages.
- Offline device registration, encrypted queue enrolment and authenticated sync reconciliation.
- Staff invitation/activation, email+PIN establishment/reissue, account deactivation and initial church/branch bootstrap.

The blocked paths remain disabled until the required policy decisions, security review and integration prerequisites are recorded.

## 9. Frontend integration readiness

The first integration surface is now defined:
- Authenticated shell can call `staff-session` after obtaining a Supabase Auth access token.
- Contact list, detail, capture and ordinary-field update screens can integrate with `staff-operations`.
- Follow-up task list, detail, create and ordinary-field/status update screens can integrate with `staff-operations`; assignment changes use the separate branch-scoped reassignment endpoint.
- A branch-scoped, minimized staff directory can integrate with `GET /staff-operations/staff`; it is read-only and does not expose email, phone, account credentials or role-management actions.
- Announcement drafts, sermon/welcome-message drafts and branch calendar entries have limited authoring endpoints, but remain unavailable to users until the corresponding approved capability grants exist.
- The pastoral read routes must remain unavailable in navigation and be denied by the server until the required decisions are approved and specific capability grants are provisioned. Oversight access requires the separate oversight capability and a supported reason code.
- The UI must treat an empty capability list as no business permissions, not as an Admin default.
- Phone/email controls must follow the identity capability flags and stay hidden/redacted when unavailable.
- The public site can read only through `public-content`.

This is an initial integration milestone, not a declaration that the complete CMI backend is finished or deployed.
