# PCG Missions — Staff Access Operations API Contract

**Source requirements:** Master Product Specification (document 00), Roles & Security (02), Role/Capability Matrix Proposal (07), Physical Schema Proposal (08), Stakeholder Decision Register (11), and RLS & Security Test Plan (12).
**Status:** Source-only implementation. No grants are seeded; operations remain denied until approved capabilities are provisioned. Not deployed.

## Security model

The six roles remain the only role catalogue. Multiple roles contribute only explicitly granted capabilities; branch, team, event, contact-assignment and sensitive-record predicates remain mandatory. This API accepts no actor IDs, caller role claims, capability claims or authoritative account status values. It derives the actor from a Supabase Auth-verified bearer token and delegates final authorization and writes to service-role-only SECURITY DEFINER database transactions.

## Endpoints

- POST /staff-access-operations/roles/assign — body: branch_id, staff_profile_id, role_code, starts_at, optional ends_at, and a 10–500 character administrative reason. Requires access.role.assign with branch scope. Only the six defined role codes are accepted. Creating an Admin/Pastor assignment additionally requires the actor already to hold an active Admin/Pastor assignment in that branch. Overlapping active assignments are rejected.
- POST /staff-access-operations/roles/{assignmentId}/revoke — body: branch_id and reason. Requires access.role.assign with branch scope. Revocation preserves assignment history.
- POST /staff-access-operations/accounts/{staffProfileId}/deactivate — body: branch_id and reason. Requires staff.account.manage with branch scope. Sets the staff profile inactive and then applies a Supabase Auth ban as an additional session barrier. The Auth user ID is returned only to the trusted function and stripped from the public response.
- POST /staff-access-operations/accounts/{staffProfileId}/reactivate — body: branch_id and reason. Requires the same capability. Reactivates the profile and clears the Auth ban. If the Auth operation fails, the API returns a retryable error; repeating the request does not duplicate the audit entry.

All operations require an authenticated active staff account. Branch and role state are rechecked inside the database transaction. Responses are no-store and errors are generic with request correlation IDs.

## Database and audit

staff_access_audit is an append-only branch-scoped audit ledger. It records actor, target, action, reason, safe metadata and timestamp. Browser roles receive no access. Role assignment/revocation, account status mutation and their audit inserts occur in one SQL transaction. The RPCs use a fixed search_path, SECURITY DEFINER and execute privileges limited to service_role.

## Explicit exclusions and approval gates

The staff-access-operations function continues to handle role assignment/revocation and account activation state. Staff account creation is implemented separately through `POST /staff-auth/admin/staff`: the Edge Function creates the Supabase Auth identity, then calls the service-role-only `cmi_create_staff_account` transaction to validate Admin/Pastor capabilities, create the staff profile, assign one of the six approved roles and write the access audit. A cryptographically random temporary credential is emailed to the new staff member and must be replaced at first login. The current credential flow uses Supabase email/password; the product owner's reference to email + PIN must be resolved before this draft is treated as the final authentication contract or deployed.

No production migrations, Auth configuration, hosted Supabase changes or deployment are included.
