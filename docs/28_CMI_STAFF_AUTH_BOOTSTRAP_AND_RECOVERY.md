# PCG Missions — staff authentication, bootstrap and recovery runbook

**Current product decision:** Supabase email + password authentication.  
**Implementation source:** `supabase-cmi/supabase/functions/staff-auth/` and the permanent CMI staff-auth lifecycle migrations.  
**Status:** Current engineering runbook; production deployment remains blocked until staging, provider setup, stakeholder release approvals and UAT are complete.

> The former email + PIN proposal is superseded. Do not implement or deploy a PIN verifier, custom password store or custom JWT issuer for this product. See [the current authentication and authorization baseline](31_VISITOR_MVP_AUTHENTICATION_AUTHORIZATION_BASELINE.md), [the stakeholder handover pack](29_CLIENT_STAKEHOLDER_APPROVAL_AND_HANDOVER_PACK.md), and [the PIN proposal retained as historical context](30_CMI_PIN_AUTHENTICATION_ARCHITECTURE_PROPOSAL.md).

## 1. Security and lifecycle rules

- Supabase Auth is the sole identity, password-hashing and session authority.
- Staff sign in using their registered email address and password.
- Admin/Pastor provisions staff accounts and assigns one of the six existing roles and an approved branch scope.
- The server generates a cryptographically random temporary password and emails it to the verified account address.
- The temporary password expires after 24 hours and the account is gated by `must_change_password`; normal workspace operations remain unavailable until the user chooses a private password.
- Administrators never see, choose or store a staff member's permanent password.
- Password-reset requests are reviewed by an authorized Admin/Pastor. Approval issues a temporary password to the staff member's registered address; it does not reveal the user's permanent password.
- Passwords, temporary credentials, reset tokens, service-role keys and provider secrets must never be written to logs, audit metadata, browser bundles or repository files.
- Every account creation, deactivation/reactivation, role change and reset-review operation must be authorized server-side and audited.

## 2. First Admin/Pastor bootstrap

### Preconditions

The deployment operator must confirm all of the following before calling the protected bootstrap route:

1. The target Supabase project is the intended **staging** project.
2. The project has the approved CMI migrations applied and the required role/capability catalogue.
3. Supabase Auth contains no unrelated users; the bootstrap procedure refuses a non-empty or ambiguous Auth state.
4. CMI staff, church and branch identity tables are unprovisioned.
5. The first Admin/Pastor mailbox is verified and controlled by the church.
6. The application URL and exact allowed browser origins are configured.
7. Transactional email has been tested using a non-production recipient.
8. The bootstrap bearer token is high entropy (at least 32 characters), kept only in a secure operator secret store and sent in the Authorization bearer header over HTTPS.

### Required server-side configuration

| Secret | Purpose |
|---|---|
| `CMI_BOOTSTRAP_TOKEN` | High-entropy operator authorization for the protected bootstrap endpoint. |
| `CMI_BOOTSTRAP_ADMIN_EMAIL` | Verified first Admin/Pastor email address. |
| `CMI_BOOTSTRAP_ADMIN_NAME` | Initial administrator display name. |
| `CMI_BOOTSTRAP_CHURCH_NAME` | Configured church name. |
| `CMI_BOOTSTRAP_BRANCH_NAME` | Initial branch name. |
| `CMI_AUTH_ADMIN_EMAILS` | One or more additional, verified administrative notification addresses; must include an address other than the first administrator address. |
| `CMI_ALLOWED_ORIGINS` | Exact comma-separated HTTPS frontend origins; do not use wildcard origins. |
| `CMI_APP_URL` | Canonical HTTPS application URL. |
| `CMI_AUTH_HMAC_KEY` | Server-only HMAC key, minimum 32 characters, for privacy-preserving reset request fingerprints. |
| `CMI_AUTH_EMAIL_FROM` | Sender identity on a verified email domain. |
| `RESEND_API_KEY` | Server-side Resend API key. |

Supabase supplies `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the publishable/anon key to the Edge Function environment. Never expose the service-role key to the browser or put it in a `VITE_` variable.

### Bootstrap operation

1. Deploy the reviewed `staff-auth` Edge Function to staging only.
2. Configure the secrets above through the Supabase project secret manager.
3. Call `POST /functions/v1/staff-auth/bootstrap-admin` with the operator bearer token. The route is not a public signup endpoint.
4. The function validates the operator token, configuration, exact Auth-user state and the configured administrator email.
5. It generates a random temporary password, creates the Auth identity and invokes `cmi_bootstrap_first_admin` to provision the church, branch, active staff profile and minimum branch-scoped account-control capabilities.
6. It sends the temporary password only to the configured administrator mailbox. The API response reports delivery submission status but never returns the credential.
7. The administrator signs in with the emailed temporary password and completes the mandatory password-change flow before accessing the staff workspace.
8. Verify that the permanent password is private to the administrator, the temporary password no longer works, the first-login gate is cleared, and the audit/role assignments are correct.

The bootstrap database function uses a transaction-scoped advisory lock and independently verifies that the Auth and CMI identity state is still empty. Do not delete an Auth user or reset the database to work around a failed bootstrap.

### Email delivery failure and retry

Email provider acceptance is not proof that a message reached the recipient's inbox. If the bootstrap endpoint reports an error or delivery is uncertain:

The current recovery implementation also serializes bootstrap/retry operations across Edge Function instances using a private three-minute database lease. A concurrent authorized request receives a conflict response instead of rotating the password while another request is delivering it. The lease is released on completion/failure and can be taken over after expiry if the Edge Function runtime terminates unexpectedly. The lease table and RPCs are not accessible to browser roles.

- Do not create another administrator, delete the existing Auth identity, or rerun a database reset.
- Keep the account gated; do not grant normal workspace access.
- An operator may retry the protected bootstrap route only while exactly one Auth user exists, its email exactly matches the configured bootstrap email, and its active staff profile email also matches that configured address, with `must_change_password = true` and `password_changed_at IS NULL`.
- On this narrow recovery path, the function rotates the temporary Supabase Auth password before retrying email and refreshes the 24-hour setup expiry. A previously generated temporary password is therefore invalidated.
- If the administrator has completed password setup, the bootstrap is consumed and retries return a conflict. Use the ordinary administrator-reviewed password-reset workflow instead.
- If the Auth identity exists but the CMI staff profile does not, the function supports only the narrow Auth-created/profile-missing recovery. The database bootstrap RPC independently verifies that the church, branch and staff identity tables remain unprovisioned.
- If the account state is ambiguous, inactive, already set up, or there are other Auth users, stop and use the documented operator incident/reconciliation process. Do not broaden the recovery predicate.

The bootstrap bearer token must be protected and short-lived operationally. Retain it only while first-admin setup or a delivery retry is genuinely pending. After the administrator has successfully changed the temporary password, remove `CMI_BOOTSTRAP_TOKEN` from the deployed function secrets and record the removal in the release log. Do not remove the only recovery authorization before delivery is confirmed and first-admin setup is complete.

## 3. Staff account creation and activation

1. An authorized Admin/Pastor selects the staff member's verified email, display name, role and permitted branch.
2. The trusted `staff-auth` operation creates the Supabase Auth identity and invokes the transactional staff-account database operation.
3. The server sends the generated temporary password to the staff member's registered email address.
4. The staff member signs in and must change the temporary password before using any business operation.
5. The account, role assignment and branch scope are checked server-side on every request.
6. Admin/Pastor may deactivate or reactivate an account with a required reason. Self-deactivation and deactivation of the last active Admin/Pastor in a branch are blocked by database safeguards.

The browser response and administrative activity feed must not include the generated temporary password.

## 4. Forgot password and administrator-assisted reset

1. The staff member submits the registered email address through the Forgot Password flow.
2. The public response is deliberately generic and does not reveal whether the address belongs to an active staff account.
3. The backend applies account/IP rate limits, records privacy-preserving fingerprints and creates a pending request when appropriate.
4. The configured authorized administrators receive a notification. The request remains auditable if notification delivery fails.
5. An authorized Admin/Pastor reviews and approves or denies the request with a reason. Self-approval is not permitted.
6. Approval rotates the Auth password to a generated temporary credential, sets the mandatory password-change gate and sends the credential only to the staff member's verified email.
7. The staff member signs in with the temporary password and sets a new private password. The workspace remains gated until completion.
8. Expiry, delivery failure, repeated attempts, approval/denial, completion and session revocation are recorded without storing credentials.

If notification or credential email fails, do not tell the user that the reset succeeded. Retry must preserve the generic public response and must not expose the credential to the administrator.

## 5. Required release verification

Before enabling this flow in production, demonstrate in staging:

- Empty-project first-admin bootstrap succeeds once.
- A second unrelated Auth user or ambiguous state blocks bootstrap.
- Partial Auth-created/profile-missing recovery is safe and idempotent.
- Email-delivery failure leaves the account gated and retryable.
- Retry rotates the temporary credential; the old credential is rejected.
- Retry after completed password setup is rejected.
- Temporary password expiry is enforced.
- Staff creation assigns only the approved role and branch.
- Inactive accounts and users with expired temporary credentials cannot access workspace operations.
- Forgot Password returns generic responses for known, unknown, inactive and throttled addresses.
- Reset review is authorized, audited and cannot be self-approved.
- Password completion clears the gate only after Supabase Auth credential update succeeds.
- Session revocation behavior is tested and recorded.
- Secrets are absent from frontend build output, logs, database rows and audit metadata.

Run the full CMI backend workflow, isolated migration replay, all pgTAP suites, Edge Function lint/type checks and frontend tests. Retain the exact CI run IDs and tested commit SHAs in the release record.

## 6. Production release boundary

This runbook does not authorize production deployment. Production remains blocked until:

- Church approval decisions R-01–R-12 and D-01–D-13 are recorded where they affect roles, sensitive data, retention and workflows.
- The approved permanent migrations have been reviewed, replayed in staging and approved for production.
- The production Supabase project, exact origins, Auth redirect settings, verified email sender and required secrets are configured by an authorized operator.
- The frontend is deployed to the approved hosting provider with browser-safe Supabase values only.
- Staging UAT, backup/restore checks, monitoring and incident procedures are accepted.
- A separate production change approval authorizes migrations, Edge Function deployment and first-admin provisioning.

Never claim production readiness from a successful local CI run alone.
