# PCG Missions frontend integration and release boundary

## Live frontend implementation

The production entry point now renders an authenticated staff workspace rather than the old design-preview dashboard. It uses live staff-session, contacts and follow-up endpoints only. The workspace does not use sample people, seeded role names or simulated record mutations.

The current live frontend includes Supabase Auth email + private-PIN sign-in; tab-scoped session storage, access-token refresh and sign-out; server-verified staff-session bootstrap; explicit active-branch selection; capability-derived contacts and follow-up navigation; contact list and creation with identity fields gated by their separate capture capability; follow-up task list, self-assigned task creation where the access scope can be safely resolved, and task completion.

The Auth client uses Supabase Auth's password grant with the staff PIN passed as the credential. Supabase Auth validates the credential and issues the JWT; the browser contains no custom PIN verifier, hashing scheme or service-role credential. Access and refresh tokens are stored only in sessionStorage for the current tab, refreshed before protected requests when necessary, and cleared locally on sign-out.

## Authentication limitations

The frontend cannot create staff identities, send invitations, activate accounts, establish a new PIN, reset a PIN or complete account recovery. Those operations are not present in the current staff-access backend. Only accounts already provisioned in Supabase Auth and linked to an active staff_profile can enter the workspace.

The stakeholder decision register still marks PIN lifecycle controls and their security parameters as pending approval. Before production use, church leadership and the security reviewer must approve PIN requirements, activation/reissue, recovery, rate limits, session lifetime and shared-device policy. This frontend implementation does not substitute for those decisions.

## Browser configuration

Copy .env.example to .env.local for local development. Only browser-safe project values may use the VITE_ prefix:

- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Never put a service-role key, secret key, database password, Hubtel credentials, HMAC key or webhook secret in a Vite environment variable. The frontend validates HTTPS outside local development.

## API adapter and authorization

src/lib/cmi-api.ts is the typed browser adapter for CMI Edge Function contracts. It calls /functions/v1/{function-name}; sends the publishable key and current Supabase Auth bearer token; uses Cache-Control: no-store for staff data; preserves backend error codes and request correlation IDs; never connects directly to Postgres; validates exactly one task assignment target; and models contact_status in the returned contact projection.

src/lib/capabilities.ts requires an explicit branch ID present in the current session before a branch-scoped capability can expose a page or field. Role names never grant access. UI checks are convenience only; the Edge Function and database remain the authorization authority.

The backend has no role-capability grants at the current source baseline. An empty capability list is a valid authenticated state. The frontend displays the overview and permission explanations but does not create synthetic permissions or infer Admin access.

## Features not enabled as operational screens

- Prayer/care endpoints provide audited individual reads only; they do not provide an approved list or mutation API.
- Reports and exports have no approved API contract.
- Event, announcement, visitor-content and calendar APIs are draft-only and approval-gated. They do not support publication, registration, capacity, check-in, closeout or message delivery.
- Staff directory and role-management APIs do not provision Auth users or issue credentials.
- Hubtel has a provider adapter only; there is no live outbox dispatcher or send API.
- Offline data storage is intentionally not enabled.

The frontend does not present these as working business modules.

## CI

.github/workflows/cmi-frontend-ci.yml runs locked dependency installation followed by TypeScript typecheck, ESLint, Vitest and the Vite production build for frontend changes and pull requests into main.

## Production release gates

The frontend source is not equivalent to a deployable production system. The repository handoff records that CMI Edge Functions are source-only, domain SQL is still held in schema drafts, and the production Supabase project has not received the corresponding CMI deployment. Before a production launch, complete and verify all of the following:

1. Obtain pending stakeholder approvals and security review for the PIN lifecycle, capability matrix, data policies and branch model.
2. Implement and security-test staff provisioning, activation, PIN setup/reissue and account recovery using Supabase Auth; test first-login and recovery journeys.
3. Promote only approved domain schema drafts into reviewed permanent migrations and apply them through the agreed deployment process.
4. Deploy required Edge Functions with production secrets, exact CORS origin allowlists and request/rate limits.
5. Provision the initial church, active branch, staff profiles and approved capability grants through a trusted administrative process.
6. Configure the production Vite environment with the Supabase URL and publishable key; never deploy browser secrets.
7. Run frontend and backend CI against the release commit, then execute end-to-end tests against a staging Supabase project with approved test identities and grants.
8. Verify security, accessibility, mobile/responsive behaviour, session revocation, backup/restore and operational monitoring before production cutover.

Until those external backend and policy gates are complete, the frontend can be built and tested but must not be represented as ready for live church operations.
