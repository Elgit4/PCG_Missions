# CMI Edge Functions

All functions in this directory are server-side application boundaries. Never place Supabase service-role keys, provider credentials or signing secrets in the PWA.

## public-content

Read-only public projection for published content. Supported query examples:

- `?resource=church-profile`
- `?resource=sermons&limit=20&offset=0`
- `?resource=sermons&slug=hope-in-christ`
- `?resource=daily-words`
- `?resource=tracts`
- `?resource=welcome-messages`
- `?resource=announcements`
- `?resource=events`

The function selects explicit public columns, applies publication/visibility filters on the server, bounds pagination, rejects unknown resources and query parameters, permits GET/OPTIONS only, and returns generic errors. Welcome messages are limited to church-wide rows (`branch_id IS NULL`) until a branch-public identity/routing decision exists. Public event responses omit capacity. It never accepts arbitrary table names, column lists, filters, sort expressions, IDs for private records or write operations.

### Required server environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side secret only; never expose to the browser.
- `PUBLIC_CONTENT_ALLOWED_ORIGINS` — comma-separated exact HTTPS origins for the deployed public PWA. Do not use wildcard origins in production.

The function fails closed if server credentials are absent. Supabase service-role access bypasses RLS; therefore this function is intentionally a narrow, fixed-query projection. Changes to selected columns, tables or filters require security review and tests. Do not reuse this client or helper for staff APIs.

### Deployment gates

- Set exact production PWA origins before enabling browser access.
- Configure platform-level rate limiting / abuse protection and caching. CORS is not an authorization or rate-limit mechanism.
- Review public fields for consent and privacy before publication.
- Deploy only after the database schema has been promoted through its approved migration path.
- Do not deploy against the hosted CMI project until explicit deployment approval is given.


## staff-session

`GET /staff-session` validates a Supabase Auth access token, resolves the active staff profile and returns the current active branch, role and capability projection. The capability projection is empty while `role_capability` has no approved grants. This function requires a JWT at the Supabase gateway and validates the bearer token again with Auth.

### Shared staff-function environment

Both staff functions require:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only
- `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`) for Auth token validation
- `CMI_ALLOWED_ORIGINS` — exact comma-separated browser origins

## staff-operations

Initial authenticated staff endpoints:

- `GET /staff-operations/contacts`
- `GET /staff-operations/contacts/{contactId}?branch_id={uuid}`
- `POST /staff-operations/contacts`
- `PATCH /staff-operations/contacts/{contactId}?branch_id={uuid}`
- `GET /staff-operations/followup/tasks?branch_id={uuid}`
- `GET /staff-operations/followup/tasks/{taskId}?branch_id={uuid}`
- `POST /staff-operations/followup/tasks`
- `PATCH /staff-operations/followup/tasks/{taskId}?branch_id={uuid}`
- `POST /staff-operations/followup/tasks/{taskId}/reassign?branch_id={uuid}`

Additional server-only environment:

- `CMI_CONTACT_IDEMPOTENCY_HMAC_KEY` — at least 32 random UTF-8 bytes; never commit it or expose it to clients.
- `CMI_CONTACT_IDEMPOTENCY_KEY_VERSION` — positive integer version for the HMAC key; default `1`.
- `CMI_FOLLOWUP_IDEMPOTENCY_HMAC_KEY` — separate server-only key, at least 32 random UTF-8 bytes, used for task creation idempotency; never commit or expose it to clients.
- `CMI_FOLLOWUP_IDEMPOTENCY_KEY_VERSION` — positive integer task HMAC key version; default `1`.

Each request resolves the Auth user and active staff profile, then checks the exact capability and branch/record scope. Contact identity values are redacted unless `contact.identity.read.scoped` applies. Phone/email capture and updates require their own capabilities. Contact creation calls the atomic `cmi_create_contact` database function, which revalidates actor and scope, records capture provenance, applies a branch-scoped idempotency key and creates the required assignment in the same transaction. The RPC is executable by `service_role` only and uses `SECURITY INVOKER` with a fixed `search_path`; it runs with the calling server role's privileges rather than elevating to the migration owner.

Follow-up task routes use `followup.task.read.scoped`, `followup.task.create` and `followup.task.update.scoped` with branch/team/assigned/self filtering. Creation additionally checks assignment scope, requires exactly one staff or team target, HMACs a branch-scoped request key, and appends the `created` event atomically. Updates accept only task note, priority, due date and status; state changes and lifecycle history are committed together. The task RPCs are service-role-only `SECURITY INVOKER` functions. A separate `POST .../{taskId}/reassign` route requires the branch-level `followup.task.assign.scoped` capability and validates an active same-branch staff member or team; only open/in-progress tasks can be moved, and the old/new target UUIDs are written to append-only history. Reassigning to the current target is a no-op. General assignment fields remain unavailable through PATCH. Task notes must never contain prayer/care narratives or other sensitive text. New tasks may reference only active (not archived or merged) contacts. Due timestamps require an explicit UTC marker or numeric offset. The task create, replay, update and reassignment RPC responses return allowlisted task fields only; internal request IDs and HMAC digest metadata are not returned.

The capability definitions are seeded as metadata only; no role grants are created. Since stakeholder decisions R-01–R-12 and D-01 remain pending, the API is expected to deny business operations until approved grants are introduced. See [Staff API Contract](../../../docs/19_CMI_STAFF_API_CONTRACT.md).

