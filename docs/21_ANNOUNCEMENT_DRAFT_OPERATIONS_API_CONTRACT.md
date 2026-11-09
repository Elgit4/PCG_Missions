# PCG Missions — Announcement Draft Operations API Contract

**Baseline:** CMI Follow-up v2.1  
**Status:** Implemented on feature branch; role grants remain approval-gated  
**Backend workspace:** `supabase-cmi/`  
**Related contracts:** [Staff API](19_CMI_STAFF_API_CONTRACT.md), [Event Transaction API](17_EVENT_TRANSACTION_API_CONTRACT.md)

## 1. Scope

This API provides a controlled staff workflow for drafting branch announcements. It does not publish content or initiate communication.

Supported operations:
- List draft announcements within an authorized branch.
- Read a draft announcement within an authorized branch.
- Create a branch announcement as a private draft.
- Edit a draft only when the authenticated staff member created it.

Explicitly excluded:
- Publication, scheduling, archival and deletion.
- Public visibility or publication flags.
- Team/event audience assignment.
- SMS, email, WhatsApp, push delivery or provider callbacks.
- Campaign approval, send-time authorization or communication automation.

## 2. Security boundary

- Function: `announcement-operations`.
- Base URL: `{SUPABASE_URL}/functions/v1`.
- Every request requires a Supabase Auth bearer token and public publishable/anon key.
- The Edge Function validates the bearer token with Supabase Auth and resolves an active staff profile.
- Actor ID, role assignments, branch access and capability grants are resolved server-side.
- The function uses a server-side service-role client only after authentication and capability/scope checks. The service-role key is never returned to or included in a browser bundle.
- Exact browser origins are configured in the server-only `CMI_ALLOWED_ORIGINS` allowlist. CORS is not authorization.
- Responses use `Cache-Control: no-store` and include a request correlation ID.
- Request bodies are limited to 32 KiB.

The API accepts only explicit `branch` scope for announcement operations. Team, event, self and other scope modes do not imply branch-wide announcement authority.

## 3. Capabilities

| Operation | Required capability | Required scope |
|---|---|---|
| List/detail draft announcements | `announcement.read.scoped` | `branch` |
| Create a draft | `announcement.create.scoped` | `branch` |
| Edit own draft | `announcement.create.scoped` | `branch` plus creator match |

No `role_capability` grants are seeded. These endpoints remain fail-closed until the church approves D-01 and applicable R-01–R-12 decisions and approved grants are provisioned.

## 4. Endpoints

### `GET /announcement-operations/announcements?branch_id={uuid}&limit={n}&offset={n}`

Requires `announcement.read.scoped` with branch scope.

- `branch_id` is required and must identify an active branch.
- `limit` is an integer 1–50, default 25.
- `offset` is an integer 0–5000, default 0.
- Unknown and duplicate query parameters are rejected.
- Returns only rows with `status='draft'`, ordered by `updated_at` descending.

### `GET /announcement-operations/announcements/{announcementId}?branch_id={uuid}`

Requires `announcement.read.scoped` with branch scope. Only a draft in the requested branch is returned. Unknown, non-draft and out-of-branch IDs return 404.

### `POST /announcement-operations/announcements`

Requires `announcement.create.scoped` with branch scope.

Allowed JSON fields:

```json
{
  "branch_id": "uuid",
  "title": "Sunday Service Notice",
  "body": "The service begins at 8:00 AM."
}
```

- Title is 2–220 characters.
- Body is 1–20,000 characters.
- Unknown properties are rejected.
- The server sets `created_by` from the authenticated user.
- The server forces `status='draft'`, `is_public=false`, `publish_at=null` and `published_at=null`.
- No team/event audience link is created.
- No delivery or notification job is queued.

Returns 201 with the created draft projection.

### `PATCH /announcement-operations/announcements/{announcementId}?branch_id={uuid}`

Requires `announcement.create.scoped` with branch scope.

Only `title` and `body` can be updated. The announcement must:
- belong to the requested branch;
- still have `status='draft'`; and
- have `created_by` equal to the authenticated actor.

The update repeats the creator, branch and draft-state predicates in the database request. A race that changes the row out of draft state returns 409. Other authors' drafts return 404; this endpoint does not implement administrator override.

## 5. Error behaviour

| Status | Meaning |
|---|---|
| 400 | Invalid JSON, query or announcement fields |
| 401 | Missing or invalid session |
| 403 | Inactive staff or missing capability/scope |
| 404 | Unknown, non-draft or out-of-branch announcement |
| 409 | Draft changed and is no longer editable |
| 413 | Request body exceeds 32 KiB |
| 500 | Generic server failure; logs contain only a request ID and internal error code |
| 503 | Required server environment is not configured |

## 6. Content handling and limits

The API stores announcement body as text. The frontend must render it as text or through an explicit safe Markdown renderer; it must not inject the stored body as raw HTML.

The draft workflow does not create an idempotency receipt. A client retry after an ambiguous network timeout can create another draft; the frontend should disable repeat submission while a create request is pending. A later approved change can add a dedicated receipt if operational requirements justify it.

## 7. Publication and communication approval gate

Publication and delivery remain separate future operations. This API does not accept `is_public`, `status`, `publish_at`, `published_at`, team/event audience IDs or delivery instructions.

No announcement message is sent and no SMS provider is called. D-09, D-10 and D-11 remain pending; live dispatch, consent/suppression handling, trigger configuration, campaign separation, spend caps and provider callbacks remain disabled.

## 8. Verification

The feature branch adds Deno tests for:
- branch UUID, title and body validation;
- rejection of status, visibility, publication, actor and audience fields;
- create/update allowlists;
- bounded pagination and rejection of duplicate/unknown query parameters.

CI type-checks the function and runs the validation suite alongside the existing CMI Deno checks and isolated local database tests. No SQL migration or hosted Supabase change is included.
