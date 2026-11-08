# PCG Missions — CMI Staff API Contract

**Baseline:** CMI Follow-up v2.1  
**Status:** Initial server API contract; implementation in review branch  
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

## 4. Capability catalogue and authorization

The proposed action-code catalogue is seeded as metadata only. No role-capability rows are seeded. A capability grant is effective only when:
1. The Auth user has an active staff profile.
2. An active role assignment exists for the requested branch and time.
3. That role is active.
4. The role has the exact capability and scope mode.
5. The record satisfies the scope and any additional field/sensitivity restriction.

The presence of a role label is not authorization. Frontend navigation visibility is only a usability aid; every request is authorized server-side.

## 5. Public visitor API

The existing `GET /public-content` function remains a read-only, allowlisted projection for published church profile, welcome messages, sermons, daily words, tracts, public announcements and public events. It does not expose staff tables or direct anonymous database grants.

Public registration is not enabled by this contract. D-05/D-06/D-13 and consent-evidence/retention requirements must be approved first.

## 6. Not yet implemented

The following API families remain backend work and must not be represented as available frontend functionality:
- Follow-up task/list operations and append-only task lifecycle transactions.
- Audited prayer/care narrative reads and restricted update/assignment operations.
- Event registration, serialized capacity reservation, transport reservation, check-in, idempotent replay/conflict handling and closeout submission/review.
- Calendar and announcement staff management.
- Sermon, daily-word, tract and church-profile administration/publication operations.
- Typed ministry reporting, review workflow and scoped exports.
- SMS consent/suppression, campaign approval, outbox dispatch, provider adapter, signed callbacks, budget controls and automations.
- Offline device registration, encrypted queue enrolment and authenticated sync reconciliation.
- Staff invitation/activation, email+PIN establishment/reissue, account deactivation and initial church/branch bootstrap.

The blocked paths remain disabled until the required policy decisions, security review and integration prerequisites are recorded.

## 7. Frontend integration readiness

The first integration surface is now defined:
- Authenticated shell can call `staff-session` after obtaining a Supabase Auth access token.
- Contact list, detail, capture and ordinary-field update screens can integrate with `staff-operations`.
- The UI must treat an empty capability list as no business permissions, not as an Admin default.
- Phone/email controls must follow the identity capability flags and stay hidden/redacted when unavailable.
- The public site can read only through `public-content`.

This is an initial integration milestone, not a declaration that the complete CMI backend is finished or deployed.
