# Staff roles and authorization policy

**Track:** Cloudflare/D1 non-production. **Catalogue:** exactly six fixed roles. **Default:** deny unless an active role assignment grants the capability and the record satisfies its scope predicate.

## Authorization decision

Every protected operation requires all of the following:
1. A verified, non-revoked authentication session.
2. An active staff profile; invited, inactive and suspended accounts are denied.
3. An active role assignment for the selected branch and current time.
4. An active capability grant attached to that role.
5. A matching scope predicate: branch, team, assigned, event, self or explicit share.
6. Any field-level sensitivity and record-sharing restrictions.

Multiple roles are additive only for the verified actor in the selected branch. They never widen the branch boundary. A role in one branch cannot authorize access in another. The active branch must be resolved and validated server-side.

## Six-role privilege matrix

| Role | Allowed work | Explicit exclusions |
|---|---|---|
| **Admin/Pastor** | Branch-wide contacts, follow-up, teams/service areas, events, calendar, announcements, content and aggregate reports; staff account lifecycle, fixed six-role assignment and access-audit review. | No default prayer-request or pastoral-case narrative access; no unrestricted export or SMS dispatch. |
| **Coordinator** | Branch-wide operational contacts/follow-up; team and area directory; event/calendar management; announcements/content; aggregate reports; limited staff directory. | Cannot create/deactivate staff accounts, assign roles, read staff-security audit, access prayer/pastoral narratives, export unrestricted records or dispatch SMS. |
| **Team Leader** | Team-scoped contacts and follow-up; team directory; assigned event check-in; read-only calendar, announcements and content. | No branch-wide search, staff administration, team/area administration, private contact fields, cross-team records, prayer or pastoral records. |
| **Field Worker** | Create contacts in the active branch; read/update contacts assigned to the worker; record field interactions and ordinary notes; update assigned follow-up tasks; check in only at assigned events. | No contact reassignment, branch-wide contact browsing, private contact fields, staff/team administration, prayer or pastoral records. |
| **Follow-up Volunteer** | Read/update assigned follow-up tasks; record task-related interactions; see only the minimum contact projection required for the task. | No general contact browsing, private fields, general contact notes, contact creation/reassignment, staff/team administration, prayer or pastoral records. |
| **Prayer Intercessor** | Read and update prayer workflow only for requests explicitly assigned/shared with the intercessor. | No visitor/contact CRM, follow-up tasks, staff directory, event operations, general branch records or pastoral-care cases by default. |

## Sensitive data boundaries

- contacts.private_fields.read is separate from contacts.read. Field Worker and Follow-up Volunteer do not receive it.
- Follow-up task APIs must return a minimized contact projection, never the full contact row.
- Prayer request content is highly restricted; Prayer Intercessors see only explicitly assigned/shared requests. Reads and changes must be audited.
- No baseline role receives pastoral.case.read or pastoral.case.update. A separately reviewed, time-bounded explicit share is required. Reads and changes must be audited.
- No role receives bulk export, mass messaging or SMS dispatch in this seed. Each requires separate risk review, purpose limitation, rate limits and auditable approval.

## Staff account and role administration

- Admin/Pastor alone receives staff.account.manage and staff.role.assign in the baseline catalogue.
- Multiple roles per staff member are supported. Duplicate overlapping assignments for the same staff + role + branch are rejected.
- Assignments are branch-specific and time-bounded; revocation preserves history.
- The fixed six-role catalogue cannot be expanded through ordinary staff-management endpoints.
- Admin/Pastor may assign standard roles only in a branch where the actor has an active staff.role.assign grant. Granting the high-privilege Admin/Pastor role requires a separate request and approval by a second, distinct active Admin/Pastor in that same branch; the requester cannot approve their own request. The ordinary role-assignment capability does not grant Admin/Pastor elevation. The last active Admin/Pastor in a branch cannot be deactivated or have that role revoked. Initial administrator bootstrap must use a one-time owner-controlled process.
- An administrator must never set or learn a user's permanent password. Invitation/reset links are one-time and expire; the user chooses their own password. Deactivation must revoke sessions.
- Every account lifecycle or role-assignment change records actor, target, branch, action, reason, timestamp and safe metadata in the append-only audit ledger.

## Worker enforcement requirements

The current Worker must remain closed to business routes until these controls are implemented. Resolve actor identity from the verified session only. Never trust actor ID, role, branch, scope, assignee or capability supplied in request JSON.

- Enforce record scope in the same SQL statement that reads or mutates the record; do not fetch broad data and filter only in JavaScript.
- Branch scope requires exact active branch match.
- Team scope requires active membership in the record's team and matching branch.
- Assigned scope requires an active assignment to the exact record/task.
- Explicit-share scope requires an active, unexpired share to the exact record and purpose.
- Audit sensitive reads and all authorization administration. Never put prayer/pastoral narrative text, passwords, tokens or full contact details in audit metadata.
- Use a generic 404 for inaccessible record IDs where existence disclosure is a risk; use 403 for known capability denial without record enumeration.
- Missing or ambiguous authorization inputs fail closed.

## Not granted by default

Delete, merge, export, publish, SMS send, bulk import, cross-branch administration, prayer/pastoral narratives and capability-catalogue editing are deliberately absent. Add them only as separately reviewed capabilities with negative tests.

## Verification gate

This migration seeds the catalogue and grant matrix; it does not yet implement runtime authorization. Do not expose protected Worker routes until session resolution, scope-aware SQL helpers, audit writes and negative authorization tests are implemented and pass against D1.
