# PCG Missions — Branch Calendar Operations API Contract

**Baseline:** CMI Follow-up v2.1  
**Status:** Implemented on feature branch; role grants remain approval-gated  
**Backend workspace:** `supabase-cmi/`  
**Related contracts:** [Staff API](19_CMI_STAFF_API_CONTRACT.md), [Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md), [Data Dictionary](14_PASTORAL_EVENTS_PUBLIC_CONTENT_DATA_DICTIONARY.md)

## 1. Scope

This API implements the branch-level calendar slice only:
- List and read branch calendar entries.
- Create branch calendar entries.
- Update branch calendar entries with optimistic concurrency checks.

It does not expose team-, event- or owner-scoped calendar entries, nor create/delete operations for those scopes.

For this first implementation, accepted entry types are `service`, `event` and `other`. The schema's `followup` and `prayer_schedule` entry types are not exposed through this API until their operational and privacy boundaries are explicitly resolved. Follow-up tasks remain managed through the separate task API. Prayer/care narratives are never copied into calendar entries.

## 2. Security boundary

- Function: `calendar-operations`.
- Base URL: `{SUPABASE_URL}/functions/v1`.
- Every request requires a Supabase Auth bearer token and public publishable/anon key.
- The Edge Function validates the user token and resolves an active staff profile.
- Branch and capability are derived from active role assignments and capability grants.
- Reads require `calendar.read.scoped` with explicit `branch` scope.
- Create/update require `calendar.manage.scoped` with explicit `branch` scope.
- New entries are created with server-forced `scope_type='branch'`; team, event and owner references are null and `created_by` comes from the validated Auth user.
- No user-supplied actor, scope, team, event or owner identifiers are accepted.
- Responses are `Cache-Control: no-store`; browser origins use the exact `CMI_ALLOWED_ORIGINS` allowlist.
- JSON request bodies are limited to 32 KiB.

No `role_capability` grants are seeded. Operations remain denied until the applicable role/scope decisions are approved and corresponding grants are provisioned.

## 3. Endpoints

### `GET /calendar-operations/entries?branch_id={uuid}&limit={n}&offset={n}`

Requires `calendar.read.scoped` with branch scope.

- Branch ID is required and must identify an active assigned branch.
- Limit is an integer 1–100, default 25.
- Offset is an integer 0–10,000, default 0.
- Unknown and duplicate parameters are rejected.
- Only `scope_type='branch'` rows for the branch are returned, ordered by `starts_at` ascending.

### `GET /calendar-operations/entries/{entryId}?branch_id={uuid}`

Requires the same read capability and branch scope. Only branch-scoped rows in the requested branch are returned. Team/event/own rows are not disclosed by this route.

### `POST /calendar-operations/entries`

Requires `calendar.manage.scoped` with branch scope.

Allowed JSON fields:

```json
{
  "branch_id": "uuid",
  "entry_type": "service",
  "title": "Sunday Service",
  "starts_at": "2026-11-15T09:00:00+00:00",
  "ends_at": "2026-11-15T12:00:00+00:00"
}
```

- Title is 2–220 characters.
- Timestamps require an explicit UTC marker or numeric offset and are normalized to UTC.
- End is optional; when supplied it must be later than the start.
- Entry type must be `service`, `event` or `other`.
- Unknown keys are rejected.
- The server sets `scope_type='branch'`, null team/event/owner fields and `created_by` from the authenticated user.

### `PATCH /calendar-operations/entries/{entryId}?branch_id={uuid}`

Requires `calendar.manage.scoped` with branch scope.

Only `entry_type`, `title`, `starts_at` and `ends_at` may be changed. Branch, creator and scope are not editable.

The handler reads the current time range, validates the proposed combined range, then updates only while the row's `updated_at` still matches the version read. If another editor changed the entry first, the endpoint returns 409 and asks the client to reload rather than silently overwriting a concurrent change.

There is no delete endpoint in this first slice.

## 4. Error behaviour

| Status | Meaning |
|---|---|
| 400 | Invalid JSON, query or calendar fields |
| 401 | Missing or invalid session |
| 403 | Inactive staff or missing branch capability/scope |
| 404 | Unknown or out-of-branch calendar entry |
| 409 | Concurrent update conflict |
| 413 | Request body exceeds 32 KiB |
| 500 | Generic server failure with request correlation ID |
| 503 | Required server environment is not configured |

## 5. Deferred scope types

The table schema supports `branch`, `team`, `event` and `own` calendar scopes. This API deliberately implements only `branch`. Do not infer team or event visibility from a branch grant. Separate future endpoints must validate active team membership, current event assignment or authenticated owner identity before exposing those entries.

## 6. Verification

The feature branch adds Deno validation tests for branch UUID/pagination, explicit-offset timestamps, increasing date ranges, allowed entry types, rejection of caller-controlled scope/identity fields, patch allowlists and time-range checks against unchanged values.

CI type-checks the Edge Function and runs these tests with the existing CMI Deno suites and isolated local database tests. No SQL migration or hosted Supabase change is included.
