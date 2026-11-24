# PCG Missions password workflow implementation — 2026-11-22

## Scope and deployment boundary

This change implements the staff password-reset and forced-password-change lifecycle through the Cloudflare Worker. It is deployed only to the non-production preview Worker `pcg-missions-api-preview`, using the EU migration-test D1 binding. Production Pages routing, the production-named D1, and production Worker traffic were not changed. SMS remains disabled.

## Worker routes

| Method | Route | Access |
|---|---|---|
| POST | `/api/v1/auth/password-reset-requests` | Public; generic response to avoid account enumeration |
| GET | `/api/v1/admin/password-reset-requests` | Active Admin/Pastor with `staff.password_reset.manage` in the active branch |
| POST | `/api/v1/admin/password-reset-requests/:id/approve` | Same Admin/Pastor authorization; branch-bound and reason required |
| POST | `/api/v1/admin/password-reset-requests/:id/deny` | Same Admin/Pastor authorization; branch-bound and reason required |
| POST | `/api/v1/auth/password/change` | Authenticated active staff account |

## Workflow behavior

1. A staff member submits their email address from Forgot password. The response does not disclose whether the address belongs to an account. A matching active staff account creates a pending, branch-scoped request and an internal notification for active Admin/Pastor recipients.
2. An Admin/Pastor reviews the request with a reason. Approval updates the password through the server-side Supabase Auth Admin API, sets the D1 forced-change gate, writes an append-only audit event, and returns the temporary password once for manual handoff. The temporary password expires after 24 hours. It is not emailed or persisted in D1.
3. Denial records the reviewer, reason, and append-only audit event.
4. The staff member signs in with the temporary password and changes it. The Worker verifies the Supabase access token and active staff profile, enforces password strength and the temporary-password expiry, updates Auth server-side, clears the D1 forced-change gate, and records completion against the approved request.

The Worker does not log or store plaintext passwords, access tokens, refresh tokens, or recovery tokens. Request fingerprints use a server-held secret as a pepper. Internal notifications do not use SMS.

## Verification

- Cloudflare Worker TypeScript check: passed.
- Worker authentication and route tests: passed, including anonymous rejection for password-change and Admin reset operations.
- D1 foundation/schema checks: passed.
- Web typecheck, lint, unit tests, and production asset build: passed.
- Live preview smoke checks: passed for the generic public reset response, anonymous rejection of password-change and Admin list/approval routes, existing Worker health/auth boundaries, and Pages preview Worker-origin configuration.
- Preview Worker deployed from source commit `498650f36e029925acf62978c58d0bb1133fe842`; version `f3cd09c7-8be9-48ac-9b1d-9ec950f78966` receives 100% of preview Worker traffic. Existing D1, Supabase Auth, and secret bindings were preserved.

## Remaining acceptance gate

The automated checks prove route availability, public-response behavior, and anonymous access denial. They do not prove the complete authenticated lifecycle in a browser with controlled staff identities. Before Step 2 is marked fully accepted, run an authorized non-production test with a controlled staff identity and Admin/Pastor identity: request, notification, approval, one-time handoff, first sign-in, forced change, successful session refresh, and audit verification. Do not use a live staff member's account as a test identity.
