# CMI staff authentication — bootstrap and recovery runbook

**Status:** PR #26 is merged, but this implementation is **on hold and must not be deployed**. It currently implements Supabase email/password authentication, while the confirmed product requirement is email + private PIN with one-time staff activation; the staff member establishes and alone knows the private PIN. The merged password lifecycle is therefore not production-conformant.
**Scope:** First administrator bootstrap, first-login password replacement, and administrator-approved staff password recovery.

## Mandatory conformance hold\n\nThe current source uses Supabase passwords, temporary passwords and password-recovery links. This does not satisfy the confirmed email + private PIN requirement. Do not deploy `staff-auth`, configure bootstrap secrets, create the first administrator or represent Forgot Password as complete until the authentication design is replaced with a reviewed PIN-verification and supported session-issuance flow. A short PIN must not simply be passed to Supabase `signInWithPassword` as if it were a strong password. The reset/forgot-PIN workflow must be explicitly approved, rate-limited, audited and designed without an administrator learning the staff member's private PIN.\n\n## Security model

- Supabase Auth remains the credential authority. Staff accounts use email and password.
- The first administrator receives a cryptographically random, one-time temporary password by email. No fixed password exists in source control.
- The temporary password has a 24-hour setup window. The staff session cannot access workspace APIs until a new password is saved.
- Staff recovery requests do not disclose whether an email belongs to an account.
- Requests are fingerprinted, rate-limited, stored in the unexposed `private` schema and audited.
- Only the branch Admin/Pastor capability `staff.password_reset.manage` can review requests. Self-approval is rejected.
- Approval sends a single-use Supabase recovery link. Administrators never see or set the staff member's new password.
- An approved recovery gates the account until the staff member changes the password.
- Other refresh-token sessions are revoked after a successful password replacement where Supabase Auth accepts the sign-out request.

## Required deployment configuration

Configure these as Supabase Edge Function secrets only. Never add them to Vite variables, frontend source, GitHub-tracked `.env` files or SQL migrations.

| Secret | Purpose |
| --- | --- |
| `CMI_BOOTSTRAP_TOKEN` | One-time high-entropy bootstrap bearer token; minimum 32 characters. Remove immediately after bootstrap succeeds. |
| `CMI_BOOTSTRAP_ADMIN_EMAIL` | The first administrator's verified mailbox. |
| `CMI_BOOTSTRAP_ADMIN_NAME` | Display name for the first administrator. |
| `CMI_BOOTSTRAP_CHURCH_NAME` | Initial church name. |
| `CMI_BOOTSTRAP_BRANCH_NAME` | Initial branch name. |
| `CMI_ALLOWED_ORIGINS` | Exact comma-separated production origins; no wildcard. |
| `CMI_APP_URL` | Canonical HTTPS frontend origin, without a trailing slash. |
| `CMI_AUTH_HMAC_KEY` | Random HMAC key, minimum 32 characters, used for email/IP request fingerprints. |
| `CMI_AUTH_ADMIN_EMAILS` | Optional emergency notification recipients. Normal recipients are resolved from active branch grants. |
| `CMI_AUTH_EMAIL_FROM` | Sender address on a domain verified by Resend. |
| `RESEND_API_KEY` | Server-side Resend API key. |

Supabase provides `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and a publishable/legacy anon key to Edge Functions. The function must not be deployed without these platform values.

## Deployment order

Do not deploy this authentication slice alone. Its migration depends on the CMI foundation, capability catalogue and staff access lifecycle.

1. Obtain church approval for the role/branch model, account identity and reset-review authority in `docs/11_CMI_STAKEHOLDER_DECISION_REGISTER.md`.
2. Confirm the hosted Supabase platform-owner default-ACL remediation documented in `docs/27_CMI_HOSTED_DATABASE_PRIVILEGE_REMEDIATION.md`.
3. Review and apply the CMI migrations in dependency order in a staging project first. Never point the isolated CMI CLI workspace at the historical ChurchConnect `/supabase` migration set.
4. Verify the full pgTAP suite and Supabase Security Advisors in staging.
5. Configure Auth Site URL and allowlist the production recovery redirect (the app root with `auth=recovery`). Use HTTPS only.
6. Configure the server secrets in the table above.
7. Deploy the `staff-auth` Edge Function. Its `verify_jwt = false` setting is intentional because it has public reset-request and one-time bootstrap routes. The function itself validates the dedicated bootstrap token and calls Supabase Auth `getUser` for all staff/admin routes. Never remove those in-handler checks.
8. Configure the frontend's browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then deploy the frontend.
9. Run the one-time bootstrap only after verifying the Auth project has no users and the CMI church, branch and staff-profile tables are empty.
10. Verify the admin email arrives, sign in with the one-time password, replace it immediately, confirm workspace access, then remove `CMI_BOOTSTRAP_TOKEN` from Edge Function secrets.
11. Test a separate staff account's Forgot password flow end-to-end: request, admin email notification, branch-scoped review, denial, approval, recovery link, password change, audit entries and rejection of the old password.
12. Record deployment timestamps, migration versions, Edge Function version and test evidence. Do not mark production ready until all checks pass.

## Bootstrap restrictions

The bootstrap endpoint refuses to run unless the Auth project contains exactly one confirmed user (the configured first administrator) and the CMI church, branch and staff-profile tables are empty. It cannot be used to overwrite an existing administrator or silently delete legacy accounts.

If Auth users already exist, stop. Reconcile them explicitly with the church and technical owners; do not delete accounts or bypass the bootstrap guard.

The bootstrap endpoint does not return the temporary password in its response. It sends it only to the configured mailbox. The temporary credential is never stored in Postgres or logs.

## Operational notes

- Configure Resend with a verified sender domain and disable click tracking/link rewriting for authentication messages.
- Monitor Edge Function logs by request ID; never log bearer tokens, passwords, recovery links, HMAC input or provider response bodies.
- Reset requests expire after 24 hours. A processing claim can be retried after its ten-minute lease if the function crashes.
- Email delivery failures are audited. A failed recovery email leaves the request available for a later review/retry.
- The public response to Forgot password remains the same for known, unknown, inactive and throttled addresses.
- The first Admin/Pastor bootstrap receives only four branch-scoped control-plane capabilities: `staff.directory.read`, `staff.account.manage`, `access.role.assign` and `staff.password_reset.manage`. It deliberately does not receive `access.capability.manage`, contact/export, prayer/care oversight, SMS, or report permissions. All other business-domain grants remain blocked pending client approval of the role matrix.

## Current release boundary

This runbook and code are merged into `main` (PR #26), but remain undeployed. The hosted project currently records only the RLS-helper privilege-remediation migration; it has zero CMI public application tables and zero deployed CMI Edge Functions. No production Auth configuration, Edge Function secret, administrator user, church, branch or CMI production record has been created by the authentication implementation. The separate RLS-helper remediation is documented in `docs/27_CMI_HOSTED_DATABASE_PRIVILEGE_REMEDIATION.md` and the production audit.
