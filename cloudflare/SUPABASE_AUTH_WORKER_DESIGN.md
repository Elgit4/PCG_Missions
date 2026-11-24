# Supabase Auth integration for the Cloudflare Worker

**Status:** Supabase Auth verifier and Admin adapter implemented in source; CI tests added; not deployed.  
**Applies to:** `feat/cloudflare-d1-migration-foundation`  
**Production frontend:** `https://pcg-missions.pages.dev/`  
**Supabase project:** `cgwffpxlwgbnlinzwfoj`

## Decision

Supabase Auth remains the sole identity and credential authority during the D1 migration. Better Auth must not be used in the target Worker. D1 stores the application-side identity reference (`supabase_auth_identity`), staff profiles, role assignments, capability grants and application workflow state. It does not store passwords, password hashes, refresh tokens, access tokens or browser sessions.

The browser's existing `PcgAuthClient` remains responsible for sign-in, refresh, recovery and sign-out through the existing same-origin Pages auth proxy (`/api/auth`). That proxy continues to forward only the explicitly allowlisted Auth operations to the existing Supabase Auth project. It must not forward arbitrary paths or arbitrary request headers.

## Token verification in Workers

The Worker now uses a request-scoped Supabase Auth verifier in `src/auth.ts` and `src/staff-context.ts`. The verifier calls Supabase `GET /auth/v1/user`; it does not decode JWT claims locally.

1. Require an `Authorization: Bearer <access-token>` header on every protected API route.
2. Call `GET {SUPABASE_URL}/auth/v1/user` with the configured Supabase publishable key in `apikey` and the caller's bearer token in `Authorization`.
3. Accept the identity only when Supabase Auth returns a successful response containing a valid user UUID.
4. Treat 401/403 as unauthenticated. Treat timeout, 5xx, malformed JSON or upstream unavailability as an authentication-service failure and fail closed (503); never fall back to an unverified JWT decode.
5. Use the verified Supabase user ID to resolve `staff_profile.auth_user_id` in D1. Then verify active account status, current role assignment, branch membership and capability using the existing authorization layer.
6. Do not trust caller-supplied user IDs, profile IDs, roles, capability names, branch scope or ownership.
7. Do not persist bearer tokens or log Authorization headers.

This remote verification strategy avoids assumptions about the project's current JWT signing algorithm. Before considering local JWT verification, inspect the actual Supabase Auth signing-key configuration. Only use local verification if the active signing algorithm, issuer, audience, key rotation/JWKS behaviour and token expiry can all be validated. Do not accept unsigned or merely decoded tokens.

## Environment bindings

The non-production Worker may use:

- `SUPABASE_URL`: the existing project's HTTPS URL.
- `SUPABASE_PUBLISHABLE_KEY`: the public project key (not a secret, but keep environment configuration explicit).
- `SUPABASE_SERVICE_ROLE_KEY`: only if an approved Worker route must perform an Auth Admin operation. Store as a Worker secret; never expose it to Pages/browser code or logs.
- `DB`: the non-production D1 binding.
- `APP_ENV`: explicit environment marker.

Production bindings must be separate and must not be added until production resource and cutover approval. The Worker must reject missing or malformed configuration rather than silently using development defaults.

## Auth Admin operations

Invitation acceptance now uses `createSupabaseAuthUser` against Supabase Auth Admin API, with the service-role key read only from Worker environment secrets. If D1 provisioning fails, the code attempts a compensating Auth Admin delete for the newly created identity. Compensation retry/reconciliation and failure-injection acceptance remain open.

The existing Supabase staff provisioning contract and password lifecycle remain mandatory:

- Staff accounts remain administrator-provisioned; no public self-sign-up.
- Preserve the three existing Auth identities; do not recreate or reset them.
- Invitation tokens remain one-time, hashed, expiring and branch-scoped.
- The invite acceptance transaction must not leave an orphaned Auth user if the D1 profile/assignment transaction fails. Because Auth and D1 do not share a transaction, implement an idempotent saga with a compensating Auth Admin delete only for a newly created identity, and record/retry incomplete compensation safely.
- Preserve first-login password-change and 24-hour temporary-password expiry semantics.
- Password reset requests remain administrator-assisted. Do not invent email delivery or send messages without an approved provider.
- Password changes must be performed through Supabase Auth's supported user update flow or Admin API as appropriate, with the existing audit and expiry state updated safely in D1.
- Never return a service-role credential, temporary password or admin API response containing secrets to the browser.

Unit tests cover bearer-token verification, invalid tokens, Auth upstream 5xx/network failure, malformed identity responses, Admin user creation/deletion and missing service-role configuration. Invitation-level tests for duplicate email, expired/concurrent acceptance, D1 failure and compensation failure remain required.

## Routes and frontend boundary

The existing Pages route `/api/auth` remains the sign-in/session proxy to Supabase Auth. Do not move login to a new Better Auth endpoint.

The Cloudflare API Worker handles business operations and accepts the Supabase bearer token. Its Better Auth `/api/auth/*` handler has been removed; sign-in, refresh, recovery and logout remain on the existing Pages-to-Supabase Auth proxy.

The frontend business API adapter currently derives its base URL as `${SUPABASE_URL}/functions/v1`. It must later be changed to use an environment-configured Cloudflare Worker API base URL, with distinct preview and production values. That frontend switch is a separate cutover step and must not occur until the Worker route inventory is complete and authenticated acceptance tests pass.

The Pages auth proxy currently forwards `staff-session`, `complete-password-change` and `request-password-reset` to Supabase Edge Functions. These operations must be mapped individually. Do not remove a route until its Cloudflare replacement is implemented and verified, or until the operation is deliberately retained as an Auth-only compatibility service with an explicit owner and retirement plan.

## CORS and origin policy

- Production browser origin: `https://pcg-missions.pages.dev`.
- Preview origins must be explicitly configured only in the preview environment.
- Do not reintroduce the deleted `pcg-missions-nonprod.pages.dev` origin.
- Reject untrusted origins; do not use wildcard credentialed CORS.
- Allow only required methods and headers, including Authorization and the selected branch header.
- Keep cookies and bearer-token handling consistent with the existing browser Auth client; do not enable credentialed cross-origin cookies unless required and explicitly tested.

## Required implementation tests

1. Valid Supabase access token resolves the expected Auth user and active staff profile.
2. Expired, revoked, malformed, wrong-project and invalid tokens are rejected.
3. Missing staff profile and inactive/suspended profile are denied.
4. Missing/unauthorized branch and expired/revoked role assignment are denied.
5. Every protected route enforces its capability and record-level scope in the data statement.
6. Supabase Auth timeout/outage fails closed and does not allow cached or decoded-token access.
7. No Auth token, password or service-role secret appears in logs or error responses.
8. Existing login, refresh, recovery and logout continue through the Pages auth proxy.
9. Invitation acceptance and password lifecycle pass the failure-injection cases above.
10. Six-role authorization tests match the reconciled production capability/grant catalogue.

## Remaining blockers after the source implementation

- The Worker changes have not been deployed and no Worker secrets have been configured by this implementation.
- The frontend business API adapter still targets Supabase Edge Functions; do not switch it until Worker route parity is complete.
- Invitation saga failure-injection and duplicate/concurrent acceptance tests remain outstanding.
- Existing Pages auth proxy operations for staff session and password lifecycle still forward to current Supabase Edge Functions; map and test them before retiring compatibility operations.
- No isolated preview Worker is deployed against the migration rehearsal D1 database.

The source-level change removes Better Auth from `cloudflare/src` and `cloudflare/package.json`. No production configuration or live Supabase Auth identities were changed.
