# PCG Missions frontend integration and release boundary

## Current application state

The frontend includes Supabase Auth sign-in, forced first-login credential replacement, a privacy-preserving Forgot password request, an Admin/Pastor reset-review queue, and an Admin/Pastor staff-account creation screen. The account creation and temporary-credential delivery path is in the open authorization PR and remains source-only until its migrations, Edge Functions and secrets are deployed in the approved order.

The live staff workspace is implemented in `src/components/StaffWorkspace.tsx` and connects to the typed `CmiApiClient`. It is mounted only after Supabase Auth succeeds and the server-issued staff session confirms an active profile and branch. The workspace is not available to accounts with a pending temporary-password or approved-recovery change.

The workspace implementation includes:
- server-provided staff session and branch context;
- capability-gated contacts and follow-up screens;
- contact listing/search/pagination and capture with separate identity-capture gating;
- follow-up task list/pagination, self-assignment only where the grant scope safely permits it, and task completion;
- explicit branch switching with prior-branch data cleared;
- session-expiry handling that clears in-memory staff data and returns to the access screen;
- create idempotency keys reused for retries of the same logical payload;
- safe API error messages and request-correlation IDs.

## Authentication boundary

Authentication uses Supabase Auth email/password credentials. The application does not implement a custom PIN verifier, browser-side token issuer, PIN-as-password shortcut, or administrator-known permanent password.

The first administrator is created only by a one-time server-only bootstrap route when the Auth project and CMI church/branch/profile tables are empty. It generates a random temporary password at runtime, emails it to the configured administrator mailbox, and records a 24-hour password-setup deadline. The temporary password is not committed to source, returned by the endpoint, or stored in Postgres. The first successful sign-in is restricted to password replacement before workspace access.

Staff recovery is administrator-approved. A staff member submits an email address; the API responds identically whether or not the account exists. A matching active staff account creates a private, throttled and audited request and notifies the branch Admin/Pastor recipients by email. An authorised administrator records a review reason and approves or denies the request. Approval generates a cryptographically random temporary password, replaces the Supabase Auth password, and emails the temporary credential to the staff member. The account is gated as soon as the administrator claims the request; a successful first sign-in must replace the temporary password before workspace access. The administrator never sees or chooses the staff member's permanent password. Failed credential/email operations remain gated and retryable after the processing lease expires.

The staff workspace is mounted only after a valid session is verified through `GET /staff-session`; a missing staff profile, inactive account, pending password change, empty branch context or missing capability must never be treated as Admin access.

## Browser configuration

Copy `.env.example` to `.env.local` for local development. Only browser-safe project values may use the `VITE_` prefix:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never put a service-role key, secret key, database password, Hubtel credentials, HMAC key or webhook secret in a Vite environment variable. The API adapter validates HTTPS outside local development.

## API adapter and authorization

`src/lib/cmi-api.ts` is the typed browser adapter for CMI Edge Function contracts. It:
- calls `/functions/v1/{function-name}`;
- sends the publishable key and a Supabase Auth bearer token supplied by the approved future session provider;
- uses `Cache-Control: no-store` for staff data;
- preserves backend error codes and request correlation IDs;
- never connects directly to Postgres;
- validates exactly one task assignment target at runtime and in TypeScript;
- models `contact_status` in the contact projection.

`src/lib/capabilities.ts` requires an explicit branch ID present in the current session before a branch-scoped capability can expose a page or field. Role names never grant access. UI checks are convenience only; Edge Functions and the database remain the authorization authority.

The backend has no role-capability grants at the current source baseline. An empty capability list is a valid authenticated state. The frontend does not create synthetic permissions or infer Admin access.

## Features not enabled as operational screens

- Prayer/care endpoints provide audited individual reads only; they do not provide an approved list or mutation API.
- Reports and exports have no approved API contract.
- Event, announcement, visitor-content and calendar APIs are draft-only and approval-gated. They do not support publication, registration, capacity, check-in, closeout or message delivery.
- Admin/Pastor staff provisioning creates the Supabase Auth identity, staff profile and branch role assignment, then emails a one-time temporary credential. The permanent credential is never returned to the administrator or stored in application tables.
- Hubtel has a provider adapter only; there is no live outbox dispatcher or send API.
- Offline data storage is intentionally not enabled.

The frontend does not present these as working business modules.

## CI

`.github/workflows/cmi-frontend-ci.yml` runs locked dependency installation followed by TypeScript typecheck, ESLint, Vitest and the Vite production build for frontend changes and pull requests into `main`.

## Production release gates

The frontend source is not equivalent to a deployable production system. The repository handoff records that CMI Edge Functions are source-controlled but not deployed, domain SQL remains in schema drafts, and the production Supabase project has not received the corresponding CMI deployment. Before a production launch, complete and verify all of the following:

1. Apply the product-owner-directed safe-default baseline; obtain church stakeholder review and change requests through controlled change management.
2. Complete email-provider configuration and verify staff invitation, temporary-password delivery, forced replacement and administrator-reviewed recovery in staging.
3. Promote only approved domain schema drafts into reviewed permanent migrations and apply them through the agreed deployment process.
4. Deploy required Edge Functions with production secrets, exact CORS origin allowlists and request/rate limits.
5. Provision the initial church, active branch, staff profiles and approved capability grants through a trusted administrative process.
6. Configure the production Vite environment with the Supabase URL and publishable key; never deploy browser secrets.
7. Run frontend and backend CI against the release commit, then execute end-to-end tests against a staging Supabase project with approved test identities and grants.
8. Verify security, accessibility, mobile/responsive behaviour, session revocation, backup/restore and operational monitoring before production cutover.

Until those external backend and policy gates are complete, the staff workspace remains intentionally inaccessible. The current source must not be represented as ready for live church operations.
