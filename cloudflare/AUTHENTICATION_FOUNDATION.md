# Authentication and staff-session foundation

**Status:** non-production implementation slice; not a production-ready identity lifecycle.

## Runtime design

- Better Auth is pinned to `1.7.22` in `package.json`.
- The auth instance is created inside the Worker request lifecycle so it receives the request's D1 binding; no process-global binding or `process.env` is used.
- Better Auth is mounted only at `/api/auth/*`.
- Email/password sign-in is enabled for provisioned accounts; public self-registration is disabled.
- Sessions are stored in D1, last seven days, are not served from the optional cookie cache, and use HttpOnly cookies with Secure enabled for HTTPS deployments and SameSite=Lax.
- Cloudflare's `cf-connecting-ip` header is the trusted IP source for Better Auth rate limiting.
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
| `/health` | Read-only non-production D1 readiness |

All other business routes remain unavailable.

## Deliberately incomplete

- Public sign-up is disabled. There is not yet a staff invitation/create-account endpoint.
- Password-reset delivery is intentionally not simulated. The callback fails closed until a real email provider is configured and tested.
- The Better Auth session-create hook blocks identities without an active staff profile. A D1 trigger deletes all existing sessions immediately when a staff profile changes from active to inactive/suspended. The complete administrative lifecycle (invitation expiry, audited deactivation/reactivation endpoints and session-revocation UX) is not yet wired to Worker routes.
- The staff-context endpoint reports capabilities for UI composition only. It is not an authorization grant by itself. Every future business handler must call the server-side authorization layer and include the branch/record predicate in the same SQL statement that reads or mutates the record.
- The manually authored Better Auth core tables still require validation against the exact pinned library using its schema-check tooling and an actual local D1 runtime. CI type-checking alone does not prove schema compatibility.
- Email delivery, MFA policy, abuse monitoring and account recovery need a separate implementation and test pass.

## Security constraints

- Never accept actor user ID, staff profile ID, role, capability or active branch from request JSON.
- Do not trust the branch header until it is checked against active server-side assignments.
- Do not treat a role or capability returned to the frontend as proof of authorization.
- Do not expose staff profile records for inactive or unprovisioned users.
- Do not log passwords, session tokens, reset tokens, prayer narratives or pastoral-care narratives.
- Keep all non-production routes isolated from the live Vercel/Supabase application.
