# Visitor-management MVP authentication and authorization baseline

**Status:** Engineering baseline implemented as a least-privilege default at the product owner's direction. It is not a representation that a church board has signed a separate governance resolution.

## Product scope

The initial release is a staff-only visitor information and follow-up application. It records visitor identity and contact details, ordinary follow-up notes/interactions, assignments and tasks. It is not a banking, payment, clinical-record, or public staff-directory system.

The MVP deliberately excludes live SMS dispatch, bulk exports, prayer/care narrative workflows, offline sensitive data, and self-service capability-policy editing. Those modules must not be enabled merely because they appear in older proposals or navigation drafts.

## Authentication

- Supabase Auth remains the identity and session authority.
- Staff sign in with their registered email and private credential; browser code never receives a service-role key.
- The first administrator uses a random one-time bootstrap credential and must replace it before entering the workspace.
- Staff accounts are individually provisioned; shared accounts are prohibited.
- Inactive, suspended, unprovisioned, or setup-incomplete accounts are denied.
- Recovery must use a verified, single-use recovery flow. Administrators may initiate/review recovery but must never learn or choose a staff member's permanent secret.
- Rate limiting, generic authentication failures, secure email delivery, session revocation and audit events are release requirements.
- The current repository's sign-in UI is email/password, not the previously specified email + private PIN. This migration does not claim to implement PIN authentication. A PIN design must be separately completed and security-tested before representing the app as PIN-enabled.

## Authorization model

Every business request is authorized server-side by a trusted Edge Function using the verified Supabase Auth user, active staff profile, active role assignment, requested branch and the exact capability/scope. UI navigation is only a convenience and never an authorization boundary.

| Role | Visitor access | Scope | Staff administration |
|---|---|---|---|
| Admin / Pastor | Create, read, update, identity fields, notes, interactions, assignments and follow-up tasks | Branch | Four bootstrap control-plane capabilities |
| Coordinator | Same visitor/follow-up operations | Branch | None |
| Team Leader | Same visitor/follow-up operations | Team membership |
| Field Worker | Capture and manage assigned visitor records and follow-up | Assigned | None |
| Follow-up Volunteer | Read and update assigned visitor follow-up, notes and interactions | Assigned | None |
| Prayer Intercessor | No visitor CRM access in this MVP | None | None |

Phone/email are treated as restricted identity data and require separate capabilities. Role grants do not permit exports, SMS, prayer/care narrative access, capability policy editing, or cross-branch access.

## Deployment boundaries

The migration seeds only role/capability metadata and grants. It does not create staff users, church/branch records, visitor records, or credentials. It does not grant browser access to public tables. Operational contact/follow-up schema migrations, Edge Function deployment, activation/recovery completion, environment secrets, staging tests and UAT remain required before production release.
