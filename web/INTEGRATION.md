# PCG Missions frontend integration and release boundary

## Current application state

The production entry point renders a secure access-setup screen. It does not collect or transmit email addresses, passwords, PINs or any other sign-in credentials. The approved staff Auth lifecycle (account creation, activation, private-PIN setup, verification and recovery) is not implemented by the current backend, and the stakeholder decision register still marks important authentication parameters as pending approval.

The live staff workspace is implemented in `src/components/StaffWorkspace.tsx` and connects to the typed `CmiApiClient`, but `App.tsx` intentionally does not mount it until the approved authentication lifecycle and the CMI backend deployment are ready. This avoids creating a browser-side credential workaround or presenting source-only endpoints as operational.

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

No custom PIN verifier, browser-side token issuer, direct PIN-as-password shortcut or custom token storage is implemented. The current staff-access backend does not provide invitations, activation, PIN setup/reissue or account recovery. The frontend must not enable credential entry until the approved Supabase Auth integration and full lifecycle have been implemented and verified.

Only after policy approval and backend implementation should the staff workspace be mounted with a supported Supabase Auth client session. A valid session must then be verified through `GET /staff-session`; a missing staff profile, inactive account, empty branch context or empty capability set must never be treated as Admin access.

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
- Staff directory and role-management APIs do not provision Auth users or issue credentials.
- Hubtel has a provider adapter only; there is no live outbox dispatcher or send API.
- Offline data storage is intentionally not enabled.

The frontend does not present these as working business modules.

## CI

`.github/workflows/cmi-frontend-ci.yml` runs locked dependency installation followed by TypeScript typecheck, ESLint, Vitest and the Vite production build for frontend changes and pull requests into `main`.

## Production release gates

The frontend source is not equivalent to a deployable production system. The repository handoff records that CMI Edge Functions are source-controlled but not deployed, domain SQL remains in schema drafts, and the production Supabase project has not received the corresponding CMI deployment. Before a production launch, complete and verify all of the following:

1. Obtain stakeholder approvals and security review for the PIN lifecycle, capability matrix, data policies and branch model.
2. Implement and security-test staff provisioning, activation, PIN setup/reissue and account recovery using the approved Supabase Auth flow; test first-login and recovery journeys.
3. Promote only approved domain schema drafts into reviewed permanent migrations and apply them through the agreed deployment process.
4. Deploy required Edge Functions with production secrets, exact CORS origin allowlists and request/rate limits.
5. Provision the initial church, active branch, staff profiles and approved capability grants through a trusted administrative process.
6. Configure the production Vite environment with the Supabase URL and publishable key; never deploy browser secrets.
7. Run frontend and backend CI against the release commit, then execute end-to-end tests against a staging Supabase project with approved test identities and grants.
8. Verify security, accessibility, mobile/responsive behaviour, session revocation, backup/restore and operational monitoring before production cutover.

Until those external backend and policy gates are complete, the staff workspace remains intentionally inaccessible. The current source must not be represented as ready for live church operations.
