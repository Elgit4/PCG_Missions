# PCG Missions — Visitor Content Draft Operations API Contract

**Baseline:** CMI Follow-up v2.1  
**Status:** Cloudflare Worker implementation; existing Admin/Pastor branch grant only  
**Backend workspace:** `cloudflare/src/index.ts`  
**Related contracts:** [Staff API](19_CMI_STAFF_API_CONTRACT.md), [Data Dictionary](14_PASTORAL_EVENTS_PUBLIC_CONTENT_DATA_DICTIONARY.md)

## 1. Scope

This API implements a restricted draft-authoring workflow for two branch-bound visitor-content resources already defined by the schema draft:

- Sermons (`sermon`).
- Welcome messages (`welcome_message`).

It supports draft list/detail, create and creator-only edit through Cloudflare Worker and D1. It does not publish, schedule, archive or delete content.

The API deliberately excludes:
- Daily Word (`daily_word`) and Digital Tracts (`digital_tract`) because their schema is church-wide/global and does not contain a branch scope. Their authoring scope must be explicitly resolved under D-02 before exposing those records.
- Church-wide profile changes (`church_public_profile`), which are administrative public-identity settings, not ordinary branch content drafts.
- External document link management; links should be added only after the parent content and approved URL rules are confirmed.
- Public publication, search-engine indexing, audience targeting, external notification or any delivery integration.

## 2. Security boundary

- Logical client operation: `content-operations`.
- Base URL: same-origin Cloudflare Worker `/api/v1/content`.
- Every staff request uses the Better Auth HttpOnly session cookie; the browser sends no Supabase bearer token or service-role key.
- The Worker resolves the active staff profile, branch, role assignments and capability grants from D1. Callers cannot choose a creator or impersonate another staff member.
- Operations require `content.manage.draft` with `branch` scope. D1 insert/update triggers also require the existing `content.manage` branch grant as defense in depth.
- Draft list/detail queries are filtered to the authenticated creator. A staff member cannot read another author's draft through this API.
- Draft updates repeat the author, branch and `status='draft'` predicates in the update request and use an optimistic `updated_at` check.
- Responses use `Cache-Control: no-store`, correlation IDs and generic internal-error handling.
- JSON request bodies are limited to 32 KiB.

No grants are added by this implementation. The current production D1 grants `content.manage.draft` and the schema-trigger `content.manage` capability with branch scope to Admin/Pastor only. Other roles remain denied.

## 3. Endpoints

### Sermons

#### `GET /api/v1/content/sermons?branch_id={uuid}&limit={n}&offset={n}`

Requires `content.manage.draft` with branch scope.

- Branch ID is required and must identify an active assigned branch.
- Limit is an integer 1–50, default 25.
- Offset is an integer 0–5000, default 0.
- Unknown and duplicate query parameters are rejected.
- Returns only the authenticated creator's rows with `status='draft'`, ordered by `updated_at` descending.

#### `GET /api/v1/content/sermons/{sermonId}?branch_id={uuid}`

Returns a single draft only when it belongs to the active branch and was created by the authenticated user. Other authors' and non-draft rows return 404.

#### `POST /api/v1/content/sermons`

Requires `content.manage.draft` with branch scope.

Allowed JSON fields:

```json
{
  "branch_id": "uuid",
  "title": "Faith and Service",
  "body": "Sermon body or summary.",
  "public_slug": "faith-and-service"
}
```

- Title: 2–180 characters (the D1 table constraint).
- Body: 1–30,000 characters.
- Slug: 1–120 characters, lowercase alphanumeric segments separated by single hyphens.
- Unknown fields are rejected.
- Server sets `created_by`, `status='draft'` and `published_at=null`.
- Duplicate slug conflicts return 409.

#### `PATCH /api/v1/content/sermons/{sermonId}?branch_id={uuid}`

Only `title`, `body` and `public_slug` can change. Branch, author, status and publication timestamp are immutable through this endpoint. A row can be edited only by its creator while still a draft.

### Welcome messages

#### `GET /api/v1/content/welcome-messages?branch_id={uuid}&limit={n}&offset={n}`

Requires the same branch-scoped capability. Returns only the authenticated creator's drafts in the requested branch.

#### `GET /api/v1/content/welcome-messages/{messageId}?branch_id={uuid}`

Returns a single draft only when it belongs to the active branch and was created by the authenticated user.

#### `POST /api/v1/content/welcome-messages`

Allowed JSON fields:

```json
{
  "branch_id": "uuid",
  "title": "Welcome to worship",
  "body": "We are glad you are here.",
  "display_order": 0
}
```

- Title: 2–180 characters (the D1 table constraint).
- Body: 1–12,000 characters.
- Display order: integer 0–10,000; defaults to 0.
- Branch ID is mandatory for this API even though the underlying schema also supports church-wide rows.
- Server sets `created_by`, `status='draft'` and `published_at=null`.

#### `PATCH /api/v1/content/welcome-messages/{messageId}?branch_id={uuid}`

Only `title`, `body` and `display_order` can change. Creator, branch, status and publication timestamp are not caller-editable. Only the creator can edit a draft.

## 4. Error behaviour

| Status | Meaning |
|---|---|
| 400 | Invalid JSON, query or content fields |
| 401 | Missing or invalid session |
| 403 | Inactive staff or missing branch capability/scope |
| 404 | Unknown, non-draft or out-of-scope content |
| 409 | Slug conflict or content is no longer editable |
| 413 | Request body exceeds 32 KiB |
| 500 | Generic server failure with request correlation ID |
| 503 | Required server environment is not configured |

## 5. Publication and rendering safeguards

- No endpoint accepts `status`, `published_at`, `created_by`, `is_public`, `publish_at`, `church_id` or other lifecycle/identity fields.
- No publish capability is used or activated.
- Draft text must be rendered as plain text or through a separately reviewed safe Markdown renderer. Do not inject stored body text as raw HTML.
- The public-content Edge Function remains a separate read-only surface and must continue to return only explicitly published, allowlisted rows.
- Publishing content requires the separately defined `content.publish` capability, an approved authorization matrix and a dedicated audited workflow.

## 6. Verification

The Cloudflare Worker route suite covers anonymous rejection, branch-scoped authorization, creator-only list/create behavior and private draft state. The original Deno validation suite remains historical reference material.
- branch UUID and bounded pagination;
- sermon title/body/slug limits and slug grammar;
- welcome-message title/body/display-order limits;
- rejection of publication, identity and global-scope fields;
- strict patch allowlists and duplicate/unknown query parameters.

CI type-checks the Edge Function and executes the validation tests alongside the existing CMI Deno and isolated local database suites. No SQL migration or hosted Supabase change is included.
