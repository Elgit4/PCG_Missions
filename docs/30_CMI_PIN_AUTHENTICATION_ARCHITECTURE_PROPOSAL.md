> **SUPERSEDED — 10 November 2026:** The product owner subsequently confirmed Supabase email + password authentication for PCG Missions, with a generated temporary password, mandatory first-login password replacement and administrator-reviewed reset. This PIN proposal is retained only as historical decision context; it is not the current requirement and must not guide implementation. See [the current authentication and authorization baseline](31_VISITOR_MVP_AUTHENTICATION_AUTHORIZATION_BASELINE.md) and [the handover pack](29_CLIENT_STAKEHOLDER_APPROVAL_AND_HANDOVER_PACK.md).

# CMI email + private PIN authentication architecture proposal

**Status:** Technical proposal only — not approved for production implementation or deployment.  
**Date:** 10 November 2026  
**Scope:** Staff sign-in, first administrator bootstrap, first-login credential replacement, and administrator-reviewed recovery.

## 1. Product requirement

Staff authenticate with their registered email address and a private, reusable PIN known only to that staff member.

The first administrator must receive a one-time bootstrap credential, sign in once, and establish a private PIN. The bootstrap credential must then be invalidated. It must not be a hard-coded password, a shared password, or a credential retained in source control.

For subsequent staff onboarding, an authorised administrator creates/invites the account, but the staff member establishes their own PIN through a one-time activation flow. An administrator must never see, choose, or reset a staff member's permanent PIN.

## 2. Proposed session architecture

### 2.1 Supabase Auth remains the session authority

- Continue using Supabase Auth for user identity, access tokens, refresh tokens and session lifecycle.
- Do not mint application JWTs, fabricate Supabase sessions, or expose the service-role key to the browser.
- The browser calls a dedicated staff-auth Edge Function for PIN sign-in.
- The Edge Function validates request shape and origin, applies atomic account/IP throttling, resolves the active staff identity through server-only access, and derives an internal high-entropy credential.
- The Edge Function calls the supported Supabase Auth password sign-in API using that derived credential and returns only the resulting Supabase Auth session payload.
- The PIN itself is not passed to Supabase Auth and is not persisted in application tables or logs.

### 2.2 PIN verifier and internal credential

Proposed approach, subject to security review:
- Generate a cryptographically random per-user salt.
- Use a memory-hard KDF (Argon2id or an equivalently reviewed algorithm) with the PIN, salt and a separately managed server-only pepper.
- Use the KDF output as the opaque internal Supabase Auth password.
- Store only the salt, KDF version/parameters and credential lifecycle metadata in an unexposed private schema. Never store the PIN or a reusable plaintext equivalent.
- Keep the pepper in Edge Function secrets, not in SQL, migrations, browser environment variables, or repository files.
- Pin and review the KDF dependency and benchmark its memory/latency cost on the Edge Function runtime before choosing parameters.
- A database-only disclosure must not enable offline PIN guessing without the separately managed pepper. A pepper compromise remains a security incident requiring credential rotation.

This design preserves supported Supabase Auth session issuance while placing PIN verification behind a server-side boundary. It is not permission to deploy a custom JWT issuer or a home-grown token format.

## 3. First administrator bootstrap

1. A deployment operator configures a one-time high-entropy bootstrap bearer token and the verified first-administrator email/name as server-side secrets.
2. A protected bootstrap endpoint checks that Auth and the CMI identity tables are in the explicitly approved empty state. It must refuse to overwrite, delete, or silently reconcile existing users.
3. The endpoint creates the first Auth identity with a cryptographically random, single-use temporary credential and creates the matching first-admin profile/branch transactionally.
4. The temporary credential is sent only to the verified administrator mailbox. It is never returned in an API response, stored in a log, or checked into source control.
5. The administrator signs in once with the temporary credential. The only permitted next action is setting a private PIN.
6. The server creates the PIN salt/KDF verifier and updates the internal Supabase Auth credential.
7. The bootstrap session and bootstrap bearer token are invalidated; the bootstrap secret is removed from the deployed Edge Function configuration. The administrator returns to the normal email + PIN sign-in screen.
8. A second bootstrap attempt must fail. Recovery from a partial bootstrap state must be explicitly bounded and audited.

A static, shared or source-controlled administrator password is prohibited.

## 4. Staff activation and recovery

### Staff activation
- An authorised administrator provisions a staff profile and sends a single-use activation invitation to the verified staff email.
- The activation token is time-limited, single-use and stored only as a hash.
- The staff member establishes their own PIN after proving control of the invited mailbox.
- The invitation is invalidated after successful PIN setup.

### Forgot PIN
- The public response is identical for known, unknown, inactive and throttled email addresses.
- The request is rate-limited and recorded with privacy-preserving fingerprints.
- The authorised branch administrator receives a notification and reviews the request with a reason.
- Self-approval is prohibited and every review is audited.
- Approval issues a single-use recovery link/token to the staff member's verified email. The administrator does not set or receive the new PIN.
- The recovery token permits only PIN replacement, not access to normal workspace functions.
- Successful replacement rotates the internal credential, consumes the recovery token, clears the forced-change gate and revokes other sessions where supported.
- Denial, expiry, delivery failure, retries and completion are audited.

## 5. Required abuse controls

- Atomic per-account and per-IP attempt counters in a private schema.
- Progressive delay/temporary lockout, with safe recovery from lockout.
- Generic sign-in and recovery responses; no account enumeration.
- Strict request body size, content type, CORS origin allowlist and no-store headers.
- CAPTCHA/risk controls if abuse testing shows they are required.
- No PIN, KDF output, bootstrap token, recovery token, access token or refresh token in logs.
- Audit events for bootstrap, activation, successful/failed sign-in, throttling, PIN replacement, recovery request/review and session revocation.
- Staff account status and role/scope authorization remain independently checked on every server-side operation. Authentication never implies business authorization.

## 6. Decisions required before coding the credential lifecycle

The following are intentionally not silently chosen:
1. PIN format and length (numeric-only versus alphanumeric, and exact minimum length).
2. KDF implementation, dependency, parameters and benchmark acceptance.
3. Per-account and per-IP retry thresholds, lockout duration and escalation policy.
4. Session lifetime, refresh-token rotation and global-revocation expectations.
5. Activation and recovery proof requirements, including whether email-only proof is acceptable.
6. Whether passkeys should be offered as an additional or preferred sign-in method.

Recommended security posture: prefer passkeys where the user's device supports them; if reusable PIN remains mandatory, use a sufficiently long PIN, a server-side memory-hard KDF plus separately managed pepper, and strict online throttling. A short six-digit PIN should not be treated as a strong standalone account credential.

## 7. Current implementation gaps

- The merged staff-auth draft currently implements email/password sign-in and password recovery. It is not compliant with the email + private PIN requirement.
- The current first-admin bootstrap generates a random temporary password, not a fixed static password. That one-time temporary bootstrap pattern is retained, but its first-login destination must become PIN setup.
- The existing lifecycle SQL draft uses password-specific fields and RPC names. It must be revised as a reviewed migration, not applied unchanged.
- The current frontend login and recovery screens are password-based and must be replaced with PIN-specific states and accessible numeric input behavior.
- No CMI Edge Functions are deployed. No administrator or staff account has been provisioned in production.
- The hosted identity foundation has 11 RLS-enabled public tables; role-capability grants remain empty. Domain migrations and business permissions remain gated by stakeholder approval.

## 8. Acceptance criteria

- No plaintext PIN or internal derived credential appears in browser storage, database rows, email, logs, analytics or error messages.
- Database-only disclosure does not expose a directly testable PIN verifier without the separate pepper.
- All authentication and recovery attempts are rate-limited atomically and produce privacy-safe audit events.
- Invalid, expired, reused and cross-account activation/recovery tokens fail closed.
- First-admin bootstrap can run once only and cannot overwrite existing Auth users or CMI records.
- Successful first PIN setup invalidates the temporary bootstrap credential and bootstrap bearer token.
- Admins cannot read, choose or set permanent staff PINs.
- Supabase Auth issues all sessions; no custom JWT/session issuer exists.
- All six approved roles remain unchanged; business capability grants remain empty until stakeholder approval.
- Unit, integration, pgTAP, Edge Function and browser tests cover abuse, failure, recovery, session revocation and account enumeration.
- Staging verification and stakeholder approval are complete before any production deployment.