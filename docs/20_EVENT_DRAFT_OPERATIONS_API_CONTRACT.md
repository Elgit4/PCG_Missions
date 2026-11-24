# PCG Missions — Event Draft Operations API Contract

**Baseline:** CMI Follow-up v2.1  
**Status:** Merged to main in PR #15 on 2026-11-09; role grants remain approval-gated  
**Backend workspace:** `supabase-cmi/`  
**Related contracts:** [Event Transaction API](17_EVENT_TRANSACTION_API_CONTRACT.md), [Staff API](19_CMI_STAFF_API_CONTRACT.md)

**Merge commit:** `a6a3a8948932039d1a85666b7f49f9f7e4ed9e1c`  
**Exact-head CI:** run [42611211003](https://github.com/Elgit4/PCG_Missions/actions/runs/42611211003) passed formatting, lint, all Deno type-check/unit-test steps and the isolated CMI database suites.

## 1. Scope

This API implements the narrow event-authoring operations that do not require attendee registration, capacity reservation, transport allocation, attendance check-in or closeout policy decisions.

It supports:
- Reading events in an authorized branch or directly assigned event scope.
- Creating private draft events.
- Editing private draft events while registration remains closed.

It deliberately does not support public publication, registration enablement, capacity changes, event staff/team assignment, registration records, transport, check-in, closeout, deletion or offline synchronization. Those operations remain governed by document 17 and the pending decisions recorded in document 11.

## 2. Security boundary

- Function: `event-operations`.
- Base URL: `{SUPABASE_URL}/functions/v1`.
- Every request requires a Supabase Auth bearer token and the public publishable/anon key.
- The Edge Function validates the bearer token with Supabase Auth and resolves an active `staff_profile`.
- The actor ID comes only from the validated Auth user.
- Branch, role and capability scope are resolved from current database records; caller-supplied role, actor or capability values are never accepted.
- Browser clients receive no direct event-table write grants. The service-role key remains server-side.
- Responses use `Cache-Control: no-store`, a request ID and generic failure messages.
- Exact browser origins are configured through `CMI_ALLOWED_ORIGINS`; CORS is not authorization.

### Capabilities

- `event.read.scoped` — required for list/detail.
- `event.manage.scoped` — required for create/edit.

Mutations require an explicit `branch` scope for the requested active branch. Reads support either `branch` scope or direct active staff event assignment (`event` scope). Other scope modes do not imply event access. Team-derived event visibility is not enabled by this first slice.

No `role_capability` grants are seeded. Until church-approved grants are provisioned, these routes deny business access. The API code does not make the proposed role matrix effective by itself.

## 3. Endpoints

### `GET /event-operations/events?branch_id={uuid}&limit={n}&offset={n}`

Requires `event.read.scoped`.

- `branch_id` is required and must identify an active branch with an applicable grant.
- `limit` is optional, integer 1–50, default 25.
- `offset` is optional, integer 0–5000, default 0.
- Unknown and duplicate query parameters are rejected.
- Branch scope returns events in that branch.
- Event scope returns only events with a current, non-revoked staff assignment for the authenticated actor.
- Results are ordered by `starts_at` ascending.

### `GET /event-operations/events/{eventId}?branch_id={uuid}`

Requires `event.read.scoped` and the same branch or direct event-assignment check as the collection endpoint. Unknown and out-of-scope IDs return 404.

### `POST /event-operations/events`

Requires `event.manage.scoped` with `branch` scope.

Allowed JSON fields:

```json
{
  "branch_id": "uuid",
  "title": "Sunday Outreach",
  "description": "Optional event description",
  "starts_at": "2026-11-15T08:00:00Z",
  "ends_at": "2026-11-15T12:00:00Z",
  "timezone": "Africa/Accra",
  "location": "Tema"
}
```

- Timestamps require an explicit UTC marker or numeric offset and are normalized to UTC.
- The IANA timezone is validated; omitted timezone defaults to `Africa/Accra`.
- The end must be later than the start.
- Title is 2–220 characters; description is at most 12,000 characters; location is at most 250 characters.
- Unknown fields are rejected.
- The server sets `created_by` from the authenticated user.
- The server forces `status='draft'`, `visibility='private'` and `registration_state='closed'`.
- Capacity is not accepted and remains unset. Registration cannot be opened through this API.

Returns 201 with the created event projection.

### `PATCH /event-operations/events/{eventId}?branch_id={uuid}`

Requires `event.manage.scoped` with `branch` scope.

Only `title`, `description`, `starts_at`, `ends_at`, `timezone` and `location` can be updated. The branch, creator, status, visibility, registration state and capacity cannot be changed.

An update is accepted only while the event remains a private draft with registration closed. The SQL update repeats these state predicates to prevent a stale read from changing an event that has moved out of the editable state.

## 4. Error behaviour

| Status | Meaning |
|---|---|
| 400 | Invalid JSON, query or event fields |
| 401 | Missing or invalid session |
| 403 | Missing capability, branch scope or active staff access |
| 404 | Unknown/out-of-scope event |
| 409 | Event is no longer an editable private draft |
| 413 | Request body exceeds 32 KiB |
| 500 | Generic server failure; internal telemetry contains only a correlation ID and error code |
| 503 | Required server environment is not configured |

## 5. Deferred event operations

The following remain unimplemented and must not be exposed in frontend navigation as available:
- Public and staff registration create/update/cancel.
- Transactional capacity reservation and cancellation.
- Transport seat reservation and cancellation.
- Event check-in and offline reconciliation.
- Event staff/team assignment administration.
- Event closeout submission and review.
- Public event publication through this management API.

These remain blocked by the policy/security requirements in [document 11](11_CMI_STAKEHOLDER_DECISION_REGISTER.md) and the acceptance gate in [document 17](17_EVENT_TRANSACTION_API_CONTRACT.md).

## 6. Verification

The feature branch adds Deno request-validation tests for:
- UUID and branch validation.
- Strict field allowlists and caller-controlled lifecycle-field rejection.
- ISO timestamps with explicit timezone and end-after-start checks.
- IANA timezone validation.
- Patch allowlists and empty update rejection.
- Bounded pagination, duplicate and unknown query parameters.

The CI workflow type-checks the Edge Function and runs its validation tests before the isolated local CMI database suites. The event API adds no migration and does not modify any hosted Supabase project.
