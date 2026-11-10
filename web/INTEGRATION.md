# PCG Missions frontend integration notes

## Current implementation boundary

The existing React workspace is retained as a **local design preview**. It contains synthetic records and in-memory interactions. It is not an authenticated production workspace.

The preview is enabled only when all of the following are true:
- Vite is running in development mode.
- `VITE_CMI_PREVIEW_MODE=true` is set in the local environment.

Production builds render the PCG Missions staff sign-in screen instead of exposing demo people, demo prayer requests, simulated roles or preview mutations as real church records.

## Staff sign-in screen

`src/components/StaffLogin.tsx` provides the production-facing sign-in interface with an email address and password, password visibility control, password-recovery guidance, responsive layout and accessible status messaging. The page is a presentation layer only: the current backend does not yet provide the approved staff authentication and account recovery lifecycle.

Until that lifecycle is implemented and reviewed, submitting the form displays a clear availability message. The component does not transmit, store or log credentials. The password-recovery control likewise explains that recovery is not connected and directs staff to their church administrator. Do not remove this boundary until the approved Auth client, invitation/activation process and recovery flow are connected and tested.

## Browser configuration

Copy `.env.example` to `.env.local` for local work. Only browser-safe values may use the `VITE_` prefix:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never put service-role keys, database passwords, Hubtel credentials, HMAC keys or other server secrets in a Vite environment variable.

## API adapter

`src/lib/cmi-api.ts` is the typed browser adapter for the source-controlled CMI Edge Function contracts. It:
- calls `/functions/v1/{function-name}`;
- sends the publishable key and a Supabase Auth bearer token for staff operations;
- uses `Cache-Control: no-store`;
- parses the backend error envelope and preserves the request ID;
- does not connect to Postgres or call provider APIs directly;
- requires callers to supply stable `client_request_id` values for idempotent create operations.

The adapter accepts an `AccessTokenProvider`. Connect that provider to the approved Supabase Auth client only after the church has approved and implemented the staff sign-in, invitation and activation lifecycle. Do not create a browser-side PIN verifier or a PIN-to-session bridge.

Example:

```ts
const api = createConfiguredCmiApiClient(async () => {
  // Return the current access token from the approved Supabase Auth session.
  // Return null when no authenticated session exists.
  return approvedAuthSession.getAccessToken();
});

const session = await api.getStaffSession();
```

The `approvedAuthSession` above is an integration point, not an existing project module. Do not copy the placeholder as executable code.

## Authorization and navigation

`src/lib/capabilities.ts` provides UI capability helpers. It uses only the capability codes and branch scopes returned by `staff-session`; role labels never grant access. Backend authorization remains authoritative for every request.

The current source backend has no role-capability grants. Therefore, an authenticated staff session can legitimately have an empty capability array. The frontend must not infer Admin privileges or show protected modules based on role names.

## Features intentionally not presented as live

- Staff sign-in, invitation, PIN setup and recovery are not implemented by the current backend. The sign-in screen is not yet connected to an authentication provider.
- Prayer/care APIs support audited individual reads only; there is no approved prayer/care list or editing API.
- Reports and exports have no approved backend contract.
- Event APIs support private drafts, not publication, registration, capacity, check-in or closeout.
- Announcement APIs create private drafts; they do not publish or send messages.
- Hubtel has a server-side provider adapter only. There is no outbox dispatcher or live SMS endpoint.
- Staff access operations do not create identities or issue credentials.

Do not convert any of these into optimistic local-only production workflows.

## Backend deployment

The backend handoff currently describes the Edge Functions as source-only and the domain SQL as schema drafts. Before enabling the live staff application, the approved database migration path, hosted project configuration, Edge Function deployment, CORS origins, Auth lifecycle and capability grants must be verified independently.
