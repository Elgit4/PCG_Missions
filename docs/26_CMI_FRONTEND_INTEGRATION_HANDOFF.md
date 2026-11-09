# PCG Missions — Frontend Integration Handoff

**Product baseline:** CMI Follow-up v2.1  
**Backend workspace:** `supabase-cmi/`  
**Purpose:** A precise contract for starting the staff PWA and public visitor frontend without coupling it to draft tables, guessing permissions or assuming that source code is deployed.

## 1. Current integration truth

The backend source provides these API families:

| Surface | Function | Current source capability | Availability boundary |
|---|---|---|---|
| Public visitor reads | `public-content` | Published church profile, sermons, daily words, tracts, welcome messages, public announcements and public events | Read-only; function is source-only and not deployed |
| Staff session | `staff-session` | Validates Auth token and returns active staff, branches, roles and capability projection | Source-only; email+PIN sign-in/activation is not implemented |
| Contacts and follow-up | `staff-operations` | Scoped contact list/detail/capture/update and task list/detail/create/update/reassign | Source-only; no role grants are seeded |
| Pastoral record reads | `pastoral-operations` | Individual audited prayer/care record reads | Approval-gated; R-01/R-10/R-11/D-07 pending; no grants |
| Staff access administration | `staff-access-operations` | Assign/revoke roles; deactivate/reactivate accounts | New source in PR #21; no grants and not deployed |
| Event authoring | `event-operations` | Private draft list/detail/create/edit | Source-only; no publication, registration or capacity |
| Announcements | `announcement-operations` | Private draft list/detail/create/edit | Source-only; no publication or delivery |
| Visitor content authoring | `content-operations` | Sermon and welcome-message private drafts | Source-only; no publication, Daily Word or tract authoring |
| Calendar | `calendar-operations` | Branch-scoped calendar list/detail/create/update | Source-only; branch scope only |

**Important:** all current Edge Functions are source-controlled, not deployed. The CMI permanent migration currently contains only the identity/authorization foundation. Domain SQL is validated from `schema-drafts/` using temporary local CI migrations; it has not been promoted into permanent migration history or applied to a hosted project. The `role_capability` table has no grants. A valid session with an empty capability list means the user has no business-operation permissions; it must not be treated as an Admin default.

The frontend can begin with app shell, routing, design system, public pages, auth-state shell, capability-aware navigation and typed API integration. Do not represent gated workflows as operational until their backend, approvals, grants and deployment are complete.

## 2. Environment and client security

Browser build-time configuration may contain only:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or the project's approved anon-key equivalent)

Never include:
- `SUPABASE_SERVICE_ROLE_KEY`
- SMS provider API ID/secret
- HMAC/idempotency keys
- database passwords
- webhook verification secrets
- any private credential or admin token

Use Supabase Auth client sessions only after the approved email+PIN lifecycle has been implemented. The current backend expects a valid Supabase Auth access token; do not invent a PIN-to-session bridge in the browser.

Protected Edge Function request headers:
```http
Authorization: Bearer <supabase-access-token>
apikey: <supabase-publishable-key>
Content-Type: application/json
```

Base URL:
```text
{VITE_SUPABASE_URL}/functions/v1
```

All staff operations require bearer authentication. The backend derives actor, profile, roles, capabilities and scope from verified server-side state. Do not send actor IDs, role labels or capability claims as authority.

## 3. Current endpoint map

### Public visitor API

`GET /public-content?resource=...`

Supported resources:
- `church-profile`
- `sermons`
- `daily-words`
- `tracts`
- `welcome-messages`
- `announcements`
- `events`

Use only the resource and query parameters documented by the function. No public contact directory or direct database access exists. Public event registration is not enabled.

### Staff session

`GET /staff-session`

Use on app boot and after session refresh. It returns:
- authenticated user projection;
- staff profile and account status;
- active branches;
- current role assignments;
- explicitly granted capabilities and scope modes.

Treat an empty branch/capability result as an empty authorization context. Do not derive privileges from role names.

### Contacts

- `GET /staff-operations/contacts?branch_id={uuid}&limit={n}&offset={n}&search={text}`
- `GET /staff-operations/contacts/{contactId}?branch_id={uuid}`
- `POST /staff-operations/contacts`
- `PATCH /staff-operations/contacts/{contactId}?branch_id={uuid}`

Capture uses a UUID `client_request_id` for idempotency. The server derives actor and provenance. Phone/email are separate restricted fields and must remain masked/hidden unless the exact identity capability is present. Status, merge, branch and creator fields are not writable through ordinary PATCH.

### Follow-up

- `GET /staff-operations/followup/tasks?branch_id={uuid}&limit={n}&offset={n}&status={status}`
- `GET /staff-operations/followup/tasks/{taskId}?branch_id={uuid}`
- `POST /staff-operations/followup/tasks`
- `PATCH /staff-operations/followup/tasks/{taskId}?branch_id={uuid}`
- `POST /staff-operations/followup/tasks/{taskId}/reassign?branch_id={uuid}`

Exactly one primary assignment target is accepted: staff member or team. Task updates and lifecycle events are transactional. Reassignment is a separate operation. Do not put prayer/care narrative into task notes.

### Pastoral reads

- `POST /pastoral-operations/prayer/requests/{requestId}/read`
- `POST /pastoral-operations/care/records/{recordId}/read`

These are approval-gated individual-record reads. Do not build active list/create/update/assignment controls. Do not expose these routes through role-label checks.

### Staff access administration

- `POST /staff-access-operations/roles/assign`
- `POST /staff-access-operations/roles/{assignmentId}/revoke`
- `POST /staff-access-operations/accounts/{staffProfileId}/deactivate`
- `POST /staff-access-operations/accounts/{staffProfileId}/reactivate`

These are PR #21 source additions. They require explicit capabilities and branch scope; no capability grants exist yet. They do not create staff identities or issue credentials.

### Event, announcement, content and calendar authoring

- `event-operations`: private event draft list/detail/create/edit.
- `announcement-operations`: private announcement draft list/detail/create/edit.
- `content-operations`: private sermon/welcome-message draft list/detail/create/edit.
- `calendar-operations`: branch-scoped calendar list/detail/create/update.

See API contracts 20–23 for exact query/body schemas. Publication, scheduling, public registration, capacity, transport, check-in, event closeout and SMS delivery are not available through these draft endpoints.

## 4. Response and error handling

All staff functions use:
- `Cache-Control: no-store`;
- a `request_id` correlation field and `X-Request-Id` header;
- JSON error envelope:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "The operation is not permitted."
  },
  "request_id": "uuid"
}
```

Handle at least:
- `401`: missing/expired/invalid session; refresh once where supported, then require sign-in.
- `403`: authenticated but not authorized; do not retry or infer a fallback role.
- `404`: unknown or out-of-scope record; do not reveal whether it exists elsewhere.
- `409`: idempotency conflict or resource state conflict; show a safe resolution path.
- `413`: request too large.
- `422`: validation failure.
- `503`: server integration/configuration not ready.
- `500`: generic failure with request ID; never show internal SQL/provider detail.

Provide loading, empty, offline, validation, conflict, success and retry states. Do not optimistically show a protected operation as successful before the server confirms it.

## 5. Capability-driven UI contract

The staff session is the source of UI capability hints, not a replacement for server authorization.

- Build navigation from exact capability codes and scope entries.
- Keep role names as context labels only.
- If capability is absent, hide/disable the action and let the server remain authoritative.
- Branch selection must use active branches returned by the session, not a hard-coded branch ID.
- Team/event/contact scope is record-specific; a generic branch selection must not imply access to every record.
- Redact phone/email when identity-read capability is absent.
- Do not cache pastoral narratives or provider message bodies in broad client state, browser storage, analytics or logs.
- Never expose access tokens, service-role keys or SMS secrets in telemetry.

## 6. Frontend-ready now versus backend-gated

### Safe to build against current source contracts
- Public visitor site and public-content data adapter.
- Responsive staff app shell and navigation framework.
- Session-loading/expired/unauthorized states (not production PIN login).
- Contacts and follow-up screens with capability-aware empty/denied states.
- Event, announcement, sermon/welcome draft interfaces.
- Branch calendar UI.
- Staff directory read-only UI.
- Error handling, request correlation, accessibility and responsive behavior.

### Must remain disabled/placeholder until backend/policy completion
- Email+PIN sign-in, invitation, activation, PIN setup/reset/recovery.
- Active role/capability administration until approved grants are provisioned.
- Prayer/care lists, creation, assignment and updates.
- Contact merge/reversal.
- Public event registration, capacity, transport, check-in and closeout.
- Announcement publication, scheduled delivery and SMS.
- SMS compose, campaigns, approval, dispatch, automation and delivery logs.
- Reports and exports.
- Offline device enrollment and sync.

## 7. Required frontend acceptance checks

1. Public routes never import staff services or require staff tokens.
2. Staff routes never use service-role credentials or direct protected-table access.
3. Expired session returns to sign-in without leaking cached private content.
4. Empty capability set shows a safe no-access state; no role-based default.
5. Missing identity capability redacts phone/email in UI and local state.
6. Scope changes reload data and clear stale records from the prior branch.
7. A 403 never triggers a fallback query with broader scope.
8. Duplicate submit reuses the same idempotency key for the same logical operation.
9. A 409 is shown as a conflict, not retried with a new key automatically.
10. No unimplemented/policy-gated feature is shown as operational.
11. Mobile forms support accessible labels, keyboard/focus, readable validation and clear submit state.
12. All user-visible error states include a request ID when one is returned.

## 8. Source documents

- [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md)
- [Functional Requirements and Workflows](01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md)
- [Roles, Permissions and Security](02_ROLES_PERMISSIONS_AND_SECURITY.md)
- [Application Architecture and UI/UX](04_APPLICATION_ARCHITECTURE_AND_UI_UX.md)
- [Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md)
- [Staff API Contract](19_CMI_STAFF_API_CONTRACT.md)
- [Requirements-Driven Engineering Baseline](25_CMI_REQUIREMENTS_DRIVEN_ENGINEERING_BASELINE.md)

This handoff is a contract for frontend development; it does not claim that the APIs are deployed or that pending approvals have been granted.
