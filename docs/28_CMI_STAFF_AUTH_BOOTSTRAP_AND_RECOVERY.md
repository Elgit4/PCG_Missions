# CMI staff authentication — bootstrap and recovery runbook

**Status:** PR #26 is merged, but the authentication implementation is **on hold and must not be deployed**. The current source implements Supabase email/password authentication. The confirmed product requirement is email + private PIN with one-time staff activation. The current source is therefore non-conformant.
**Scope:** First administrator bootstrap, first-login credential replacement, staff activation and administrator-reviewed recovery.

## Mandatory conformance hold

Do not deploy `staff-auth`, configure its production secrets, create the first administrator or represent Forgot Password as complete until the email + private PIN design has been implemented and reviewed.

The current first-admin bootstrap generates a cryptographically random temporary password and sends it to the configured administrator mailbox. It does **not** create a static/shared password and does not store the temporary password in source control. This temporary credential is only a bootstrap mechanism; the first-login destination must be private PIN setup, not permanent password setup.

A short PIN must not simply be sent to Supabase Auth as though it were a strong password. The application must use a reviewed server-side PIN verification boundary while retaining supported Supabase Auth session issuance. Do not mint custom JWTs or invent a Supabase session format.

## Proposed security model

See [CMI email + private PIN authentication architecture proposal](30_CMI_PIN_AUTHENTICATION_ARCHITECTURE_PROPOSAL.md).

The proposed design:
- Keeps Supabase Auth as the identity and session authority.
- Accepts email + private PIN through a server-side Edge Function.
- Uses a per-user random salt, reviewed memory-hard KDF and separately managed server-only pepper to derive an opaque internal Supabase Auth credential.
- Never sends or stores a plaintext PIN, and never returns internal credential material to the browser.
- Applies atomic per-account and per-IP throttling, progressive delay/lockout, generic responses and privacy-safe audit events.
- Requires explicit decisions on PIN format/length, KDF parameters, lockout thresholds, session lifetime and recovery proof before implementation.

## First administrator bootstrap requirement

1. Configure a one-time high-entropy bootstrap bearer token and verified administrator identity as Edge Function secrets.
2. Verify that Supabase Auth and CMI identity tables are in the explicitly approved empty state. Existing users or records must stop bootstrap; they must never be deleted or overwritten automatically.
3. Create the first Auth identity with a cryptographically random, single-use temporary credential and provision the matching first-admin profile/branch transactionally.
4. Send the temporary credential only to the verified administrator mailbox. Never return it from the API, log it or commit it.
5. Permit the first administrator to use it only to enter the first-login credential setup flow.
6. Replace the temporary credential with the administrator's private PIN using the reviewed PIN verifier.
7. Invalidate the temporary credential and current bootstrap session, remove the bootstrap bearer secret from the deployed Edge Function configuration, and require a fresh email + PIN sign-in.
8. Reject subsequent bootstrap attempts. Any partial-bootstrap recovery must be narrowly scoped, idempotent and audited.

A fixed, shared or source-controlled administrator password is prohibited. The one-time random temporary credential is the safer implementation of the requested initial-access mechanism.

## Staff activation and Forgot PIN

- An authorised administrator provisions the staff profile and sends a one-time activation invitation to the verified staff email.
- The invitation is single-use, time-limited and stored only as a hash.
- The staff member establishes their own private PIN; administrators never see, choose or set it.
- Forgot PIN requests return the same public response for known, unknown, inactive and throttled email addresses.
- The request is rate-limited, fingerprinted and audited; the authorised branch administrator is notified.
- Self-approval is prohibited. Review decisions require an audit reason.
- Approval sends a single-use recovery link/token to the staff member's verified email. The administrator does not receive or set the replacement PIN.
- Recovery permits only PIN replacement, not normal workspace access.
- Successful replacement consumes the recovery token, rotates the internal credential, clears the forced-change gate and revokes other sessions where supported.
- Denial, expiry, delivery failure, retries and completion are audited.

## Existing source configuration (draft only)

The current draft expects these values as Edge Function secrets. They are not to be configured in production while the authentication conformance hold remains:

| Secret | Purpose |
| --- | --- |
| `CMI_BOOTSTRAP_TOKEN` | One-time high-entropy bootstrap bearer token; minimum 32 characters. Remove after successful bootstrap. |
| `CMI_BOOTSTRAP_ADMIN_EMAIL` | Verified first administrator mailbox. |
| `CMI_BOOTSTRAP_ADMIN_NAME` | First administrator display name. |
| `CMI_BOOTSTRAP_CHURCH_NAME` | Initial church name. |
| `CMI_BOOTSTRAP_BRANCH_NAME` | Initial branch name. |
| `CMI_ALLOWED_ORIGINS` | Exact comma-separated allowed origins. |
| `CMI_APP_URL` | Canonical HTTPS frontend origin. |
| `CMI_AUTH_HMAC_KEY` | Server-only HMAC key for privacy-preserving request fingerprints. |
| `CMI_AUTH_ADMIN_EMAILS` | Optional emergency notification recipients. |
| `CMI_AUTH_EMAIL_FROM` | Sender address on a verified domain. |
| `RESEND_API_KEY` | Server-side Resend API key. |

Supabase provides `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and a publishable/legacy anon key to Edge Functions. The service-role key must never be exposed to the browser.

## Deployment sequence after approval

1. Obtain stakeholder approval for the role/branch model, staff identity and recovery-review authority.
2. Resolve the outstanding authentication decisions in document 30.
3. Review and revise the password-specific lifecycle SQL draft; do not apply it unchanged.
4. Implement the PIN verification, activation and recovery flows with pinned dependencies and tests.
5. Apply reviewed migrations in an isolated local CMI stack, run the complete pgTAP suite, and run Supabase advisors.
6. Deploy to a separate staging Supabase project; configure Auth URLs and secrets only there.
7. Verify the complete first-admin flow, staff activation, PIN sign-in, account throttling, Forgot PIN request, admin notification/review, recovery, session revocation and audit trail.
8. Confirm the staging Auth project is empty before one-time bootstrap. Do not delete or reset existing production Auth users.
9. Record migration versions, Edge Function versions, CI results and security test evidence.
10. Only after stakeholder approval and staging sign-off may a separately approved production rollout be planned.

## Authorization boundary

The first Admin/Pastor bootstrap source currently proposes exactly four branch-scoped control-plane capabilities:
- `staff.directory.read`
- `staff.account.manage`
- `access.role.assign`
- `staff.password_reset.manage`

These do not grant pastoral oversight, contact/export, SMS or business-module permissions. No role-capability grants are active in the hosted database. Stakeholder decisions R-01–R-12 and D-01–D-13 remain pending.

## Current hosted release boundary — verified 10 November 2026

- Hosted Supabase project `cgwffpxlwgbnlinzwfoj` has 11 public identity/authorization foundation tables and three recorded migrations.
- All 11 tables have RLS enabled. Anonymous and authenticated roles cannot SELECT staff profiles. The six approved roles are seeded; `role_capability` remains empty.
- There are zero deployed CMI Edge Functions and no provisioned administrator, church, branch or staff records.
- The current password-based authentication source and password-specific lifecycle SQL are drafts only and are not deployed.
- Domain migrations, business grants, staff provisioning and production launch remain blocked pending stakeholder approval and staging verification.
- The 11 informational RLS-enabled/no-policy advisor findings are intentional fail-closed behavior, not an authorization grant.


## Bootstrap email-delivery failure — operator recovery boundary

The one-time bootstrap endpoint is deliberately not a credential re-issuance endpoint. If the Auth identity and CMI first-admin profile have been provisioned but the temporary-credential email fails or its delivery is uncertain:

1. Stop. Do not call `bootstrap-admin` again and do not delete the Auth user, staff profile, church or branch to make bootstrap appear unused.
2. Treat the bootstrap as **consumed** once the first-admin profile exists, even if the email provider reports a failure. A provider timeout is not proof that the message was not delivered.
3. Preserve the request/correlation ID and the email-provider delivery/error evidence in the restricted operational incident record. Do not record the temporary credential, bootstrap token, service-role key or recovery link.
4. An authorised deployment operator must verify the configured administrator identity out-of-band against the approved stakeholder record and inspect the existing Auth user/profile linkage and initial branch scope. If any identity or provisioning state is ambiguous, stop and escalate; do not guess or overwrite.
5. The current implementation has **no automated or self-service recovery route** for this partial-delivery state. Before any future deployment, implement and security-test a separate operator-controlled recovery process that issues a fresh single-use credential/recovery challenge to the already-verified mailbox, records an audit event, and cannot change the account identity, branch scope or permissions. The operator must not disclose or choose the administrator's permanent PIN.
6. Until that separate recovery process exists and has been tested, this failure state is a release blocker. Do not deploy the current password-based draft or claim bootstrap delivery recovery is supported.

The operator must not re-run bootstrap merely to obtain another email. The Edge Function cannot remove its own deployed secret; after a successful, verified first-admin credential setup, the deployment operator must remove `CMI_BOOTSTRAP_TOKEN` from the deployed function configuration and verify that it is no longer configured. The PIN authentication flow is not implemented, so this runbook does not authorise a production bootstrap today.
