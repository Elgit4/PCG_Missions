# PCG Missions authentication, authorization and product-scope baseline

**Status:** Product-owner direction recorded for implementation. This is not a claim of separate church-board approval.

## Product scope

PCG Missions is the church's operational missions and follow-up platform. Do not reduce it to a visitor-only CRM. Preserve the established modules and workflows already represented in the repository: visitor/contact management, follow-up tasks and interactions, staff/team/role administration, prayer and care workflows, events and attendance, calendar, announcements/public content, reporting, audit, offline field-capture design, and SMS messaging (manual, campaign and approved automation). Do not delete or hide these modules merely to simplify the first release.

A module may remain unavailable in a given environment until its backend, role scope, provider configuration, consent controls and tests are complete. In particular, SMS must remain in the product and codebase. Live sending stays disabled until the church owner configures and approves a provider/sender, consent and suppression rules, campaign approval, spending limits and test recipients. The existing server-side Hubtel adapter and status polling are retained; provider credentials are configured later by the owner.

## Authentication — email and password (not PIN)

Supabase Auth remains the identity and session authority. Staff sign in with their registered email address and password. The browser must never receive a service-role key.

### First administrator

1. A deployment operator provisions the first Admin/Pastor through a protected, one-time bootstrap operation.
2. The system generates a temporary password and emails the administrator their account email and temporary password.
3. The temporary credential is short-lived, single-use in purpose, and forces a password change at first login before the workspace is accessible.
4. The administrator chooses and confirms a new private password. The temporary credential is invalidated, and the bootstrap operation cannot be reused.
5. Do not commit a predictable default password to source control, documentation, SQL, frontend bundles or logs. The requested simple initial access is implemented as a generated temporary password, not a permanent shared password.

### Staff account creation

1. Admin/Pastor creates a staff account, enters the staff member's name and email, assigns one of the existing six roles and the appropriate branch/team scope, and activates the invitation.
2. The server creates the Supabase Auth identity and generates a temporary password.
3. The system emails the staff member their account email and temporary password. Never expose the password in the browser response, admin activity feed, audit log or database plaintext.
4. On first sign-in, the staff member must choose and confirm a new private password before accessing any business module.
5. The administrator can deactivate/reactivate accounts, change role/scope assignments where authorized, and initiate a new temporary credential when needed.

### Forgot-password and administrator-assisted reset

1. A staff member selects **Forgot password** and submits their registered email address.
2. The application creates a pending reset request and notifies the authorized Admin/Pastor. The public response must not reveal whether an email/account exists.
3. Admin/Pastor reviews the request and chooses approve or deny. Every action is audited.
4. On approval, the server invalidates/replaces the existing credential with a cryptographically random, short-lived temporary password and emails it to the staff member's registered address. The administrator must not choose or see the permanent password.
5. The staff member signs in with the temporary password and is forced to set a new private password before returning to the application.
6. If email delivery fails, the request remains safely retryable and the user is not told that a reset succeeded. Rate limits, generic errors, expiry, session revocation and notification/audit events are required.

Passwords must be hashed and managed by Supabase Auth. Temporary passwords must be generated server-side, have a short expiry, never be logged or returned to the admin UI, and be invalidated after use/change. Do not implement a custom password store or custom JWT issuer.

## Six existing roles

Do not add or rename roles. The existing roles remain:
- Admin / Pastor (`admin_pastor`)
- Coordinator (`coordinator`)
- Team Leader (`team_leader`)
- Field Worker (`field_worker`)
- Follow-up Volunteer (`follow_up_volunteer`)
- Prayer Intercessor (`prayer_intercessor`)

Admin/Pastor oversees the system's operational activity and manages staff accounts, reset requests, role assignments and authorized administration. Other roles receive the appropriate least-privilege access for their ministry duties. All access remains capability- and scope-based; branch/team/event/assigned restrictions are enforced server-side on every request. Sensitive prayer/care records, contact identity data, exports, SMS campaign approval/dispatch, provider configuration and audit access retain their separate controls.

## Authorization and security

Every protected business operation must validate the Supabase Auth session, active staff profile, role assignment, capability, branch/team/event/assigned scope and record state in a trusted Edge Function/database transaction. UI visibility is not an authorization boundary. Keep RLS enabled and browser direct table access closed unless a reviewed endpoint explicitly requires otherwise. Never trust user-editable JWT metadata for authorization.

SMS must retain recipient consent/opt-out enforcement, suppression, send-time checks, idempotency, budgets, campaign approval and delivery-status reconciliation. Keep provider secrets server-side. Do not send live SMS until provider onboarding and explicit production activation are complete.

## Release and deployment gates

Do not claim production readiness until permanent migrations are reviewed and applied in the correct order; all database and Edge Function tests pass; frontend and backend contracts are integrated; all six roles and scope boundaries are tested; email delivery, invitation, first-login password change, admin-assisted reset and session revocation are tested; SMS is verified in provider test mode; staging/UAT and mobile/desktop browser checks pass; and production secrets, domain/origins, backups and monitoring are configured.

This document records the user's product-owner direction. It does not imply that any provider account has been registered, any provider credentials have been supplied, live SMS has been enabled, or production deployment has occurred.
