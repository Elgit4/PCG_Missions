# PCG Missions — Staff Access Operations API Contract

**Source requirements:** Master Product Specification (document 00), Roles & Security (02), Role/Capability Matrix Proposal (07), Physical Schema Proposal (08), Stakeholder Decision Register (11), and RLS & Security Test Plan (12).
**Status:** Source-only implementation. No grants are seeded; operations remain denied until approved capabilities are provisioned. Not deployed.

## Security model

The six roles remain the only role catalogue. Multiple roles contribute only explicitly granted capabilities; branch, team, event, contact-assignment and sensitive-record predicates remain mandatory. This API accepts no actor IDs, caller role claims, capability claims or authoritative account status values. It derives the actor from a Supabase Auth-verified bearer token and delegates final authorization and writes to service-role-only SECURITY INVOKER database transactions.

## Endpoints

- POST /staff-access-operations/roles/assign — body: branch_id, staff_profile_id, role_code, starts_at, optional ends_at, and a 10–500 character administrative reason. Requires access.role.assign with branch scope. Only the six defined role codes are accepted. Creating an Admin/Pastor assignment additionally requires the actor already to hold an active Admin/Pastor assignment in that branch. Overlapping active assignments are rejected.
- POST /staff-access-operations/roles/{assignmentId}/revoke — body: branch_id and reason. Requires access.role.assign with branch scope. Revocation preserves assignment history.
- POST /staff-access-operations/accounts/{staffProfileId}/deactivate — body: branch_id and reason. Requires staff.account.manage with branch scope. Sets the staff profile inactive and then applies a Supabase Auth ban as an additional session barrier.
- POST /staff-access-operations/accounts/{staffProfileId}/reactivate — body: branch_id and reason. Requires the same capability. Reactivates the profile and clears the Auth ban. If the Auth operation fails, the API returns a retryable error; repeating the request does not duplicate the audit entry.

All operations require an authenticated active staff account. Branch and role state are rechecked inside the database transaction. Responses are no-store and errors are generic with request correlation IDs.

## Database and audit

staff_access_audit is an append-only branch-scoped audit ledger. It records actor, target, action, reason, safe metadata and timestamp. Browser roles receive no access. Role assignment/revocation, account status mutation and their audit inserts occur in one SQL transaction. The RPCs use a fixed search_path, SECURITY INVOKER and execute privileges limited to service_role.

## Explicit exclusions and approval gates

This implementation does not create staff accounts, send invitation emails, establish or verify PINs, reset credentials, or determine PIN length/expiry/recovery/throttling. The master specification and decision register explicitly leave the email+PIN lifecycle and its security parameters pending; the backend baseline prohibits a PIN verifier or credential endpoint until those are approved and security-reviewed. It also does not seed role-capability grants. R-01–R-12 and D-01 remain pending; this API cannot be used until the church approves the capability matrix and grants the relevant management capabilities.

No production migrations, Auth configuration, hosted Supabase changes or deployment are included.
