# Authentication and staff-session foundation

**Status:** non-production implementation slice; not a production-ready identity lifecycle.

## Runtime design

- Better Auth is pinned to `1.7.22` in `package.json`.
- The auth instance is created inside the Worker request lifecycle so it receives the request's D1 binding; no process-global binding or `process.env` is used.
- Better Auth is mounted only at `/api/auth/*`.
- Email/password sign-in is enabled for provisioned accounts; public self-registration is disabled.
- Sessions are stored in D1, last seven days, are not served from the optional cookie cache, and use HttpOnly cookies with Secure enabled for HTTPS deployments and SameSite=Lax.
- Cloudflare's `cf-connecting-ip` header is the trusted IP source for Better Auth rate limiting. Rate-limit counters use the D1 `rateLimit` table rather than per-isolate memory, so throttling is shared across Worker isolates.
- Origin allow-listing is exact-match only. Configure the canonical Worker origin in `BETTER_AUTH_URL` and any additional first-party origins in `BETTER_AUTH_TRUSTED_ORIGINS` as comma-separated origins. Do not include paths or wildcard hosts.
- `GET /api/v1/me` resolves the Better Auth session, active staff profile, active branch assignments, role codes and capability scopes. An optional `X-Branch-Id` is accepted only if it matches an active, time-valid role assignment.

## Configuration (non-production only)

From `cloudflare/`:

1. Install the pinned dependencies with `npm install`.
2. Create a local `.dev.vars` file (never commit it):
   ```dotenv
   BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
   BETTER_AUTH_URL=http://localhost:8787
   BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:5173
   ```
3. Generate a strong secret, for example `openssl rand -base64 48`, and replace the example value.
4. Apply migrations locally and run `npm run typecheck` before starting Wrangler.
5. For a Cloudflare preview Worker, set the non-production secret with `npx wrangler secret put BETTER_AUTH_SECRET`; set `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` to the exact preview origins through the non-production Worker environment only.

Never set production secrets or bind this Worker to production DNS during this phase.

## Current endpoint behavior

| Endpoint | Behavior |
|---|---|
| `/api/auth/sign-in/email` | Better Auth email/password sign-in for provisioned identities |
| `/api/auth/sign-out` | Ends the current Better Auth session |
| `/api/auth/get-session` | Returns the current Better Auth session |
| `/api/v1/me` | Returns verified staff context and branch-scoped role/capability metadata |
| `GET /api/v1/staff` | Returns a limited branch-scoped staff directory to authorized roles |
| `GET /api/v1/staff/audit` | Reads a branch-scoped, paginated governance audit across role, account and high-privilege change events |
| `POST /api/v1/staff/{profileId}/deactivate|suspend|reactivate` | Changes staff account status with reason, branch authorization, audit event and immediate session revocation |
| `GET/POST /api/v1/staff/role-revocations` | Lists pending dual-control Admin/Pastor revocations or requests one |
| `POST /api/v1/staff/role-revocations/{id}/approve|reject` | Applies/rejects a high-privilege revocation through a distinct Admin/Pastor reviewer |
| `/health` | Read-only non-production D1 readiness |

All other business routes remain unavailable.


## Staff role administration endpoints

These routes are available only to an authenticated Admin/Pastor with the active branch's `staff.role.assign` capability.

| Method and path | Purpose |
|---|---|
| `POST /api/v1/staff/roles` | Assign one of the five standard roles to a staff profile in the selected branch |
| `DELETE /api/v1/staff/roles/{assignmentId}` | Revoke a standard role assignment while preserving its history |

Both routes require `X-Branch-Id` to select an active branch already assigned to the caller. Assignment requests accept only `target_profile_id`, `role_code`, optional ISO-8601 `starts_at` / `ends_at`, and a mandatory reason. The target must be an invited or active staff profile; self-assignment is rejected. Role grants and their audit rows are written in one D1 batch. Duplicate overlapping assignments fail with a conflict response.

Admin/Pastor elevation and revocation are intentionally excluded from these standard routes. Elevation requires the separate two-person approval workflow; Admin/Pastor revocation remains blocked until its dual-control workflow is implemented. The endpoint never allows a caller to select a different branch in the request body.


## Two-person Admin/Pastor elevation

The separate dual-control workflow is now exposed:

| Method and path | Purpose |
|---|---|
| `GET /api/v1/staff/role-elevations` | List pending Admin/Pastor elevation requests in the selected branch |
| `POST /api/v1/staff/role-elevations` | Request Admin/Pastor elevation for another active staff member |
| `POST /api/v1/staff/role-elevations/{requestId}/approve` | Approve and apply a pending request as a distinct Admin/Pastor |
| `POST /api/v1/staff/role-elevations/{requestId}/reject` | Reject a pending request as a distinct Admin/Pastor |

Request creation requires `staff.role.assign`; listing and review require `staff.role.approve`. The database triggers independently verify the actor's active branch assignment, capability, target status, distinct requester/reviewer, pending request state and approved assignment. Approval and role creation execute in one D1 batch; the database audit triggers record request, review, assignment and application events. A requestor cannot approve their own request. The initial two owner-controlled bootstrap slots remain a separate bootstrap-only operation, not an ordinary API grant.

Admin/Pastor revocation is blocked in the standard-role endpoint and is available only through the distinct-requester/reviewer workflow. The database requires the approved request reference on the assignment update and preserves the last-Admin/Pastor safeguard.

## Deliberately incomplete

- Public Better Auth sign-up remains disabled. The only creation path is the server-validated invitation acceptance route; its request-local Better Auth instance permits sign-up only after a 256-bit invitation token is verified.
- Password-reset delivery is intentionally not simulated. The callback fails closed until a real email provider is configured and tested.
- The Better Auth session-create hook blocks identities without an active staff profile. A D1 trigger deletes all existing sessions immediately when a staff profile changes from active to inactive/suspended. The complete administrative lifecycle (invitation expiry, audited deactivation/reactivation endpoints and session-revocation UX) is not yet wired to Worker routes.
- Contact routes use the same server-side capability and record-scope checks; their final SELECT/UPDATE/INSERT statements repeat branch and assignment/team predicates. Contact creation requires an `Idempotency-Key`, stores a SHA-256 request digest, records capture provenance and initially assigns the contact to the capturing staff member. Phone/email visibility is separate from highly restricted age-range/language fields.
- The staff-context endpoint reports capabilities for UI composition only. It is not an authorization grant by itself. Every future business handler must call the server-side authorization layer and include the branch/record predicate in the same SQL statement that reads or mutates the record.
- The manually authored Better Auth core tables still require validation against the exact pinned library using its schema-check tooling and an actual local D1 runtime. CI type-checking alone does not prove schema compatibility.
- Invitation delivery is not connected to an email provider: the invitation token is returned once to the authorized administrator for manual secure delivery. Email delivery, password-reset delivery, MFA policy, abuse monitoring and account recovery need a separate implementation and test pass.

## Security constraints

- Never accept actor user ID, staff profile ID, role, capability or active branch from request JSON.
- Do not trust the branch header until it is checked against active server-side assignments.
- Do not treat a role or capability returned to the frontend as proof of authorization.
- Do not expose staff profile records for inactive or unprovisioned users.
- Do not log passwords, session tokens, reset tokens, prayer narratives or pastoral-care narratives.
- Keep all non-production routes isolated from the live Vercel/Supabase application.
