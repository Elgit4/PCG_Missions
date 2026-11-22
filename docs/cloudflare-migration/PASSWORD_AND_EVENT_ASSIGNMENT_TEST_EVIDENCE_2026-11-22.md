# PCG Missions password tests and event assignment migration — 2026-11-22

## Password workflow test coverage

The password workflow is exercised with synthetic Auth users and an in-memory D1 test double. No production account or live staff identity is used.

- Public reset requests return the same user-facing result for known and unknown email addresses.
- Valid requests normalize email, create a branch-scoped pending request, write a request audit event, and notify the branch Admin/Pastor recipients.
- Invalid email and rate-limited requests do not create records.
- Admin/Pastor approval is tested through the Worker route: the Auth Admin API is called server-side, a 24-hour forced-change gate is persisted, the approval audit event is written, and a temporary password is returned only for manual handoff.
- The temporary password is verified not to appear in the D1 writes.
- Admin/Pastor denial records the review reason and does not call the Auth Admin password endpoint.
- Staff password change verifies the synthetic access token, updates Auth, clears the forced-change gate, and marks the approved reset complete with an audit event.
- Expired temporary-password gates block Auth mutation.
- Anonymous reset-management and password-change routes remain rejected before protected D1 operations.
- Frontend client tests verify reset request, password change, Admin review, and Worker route mapping.

## Event staff/team assignment Worker routes

| Method | Route | Purpose |
|---|---|---|
| GET | \`/api/v1/events/:eventId/assignments\` | Assignment workspace, current assignments and eligible staff/team candidates |
| POST | \`/api/v1/events/:eventId/staff-assignments\` | Assign an active branch staff member |
| POST | \`/api/v1/events/:eventId/team-assignments\` | Assign an active branch team |
| POST | \`/api/v1/events/:eventId/staff-assignments/:assignmentId/revoke\` | Revoke a staff assignment |
| POST | \`/api/v1/events/:eventId/team-assignments/:assignmentId/revoke\` | Revoke a team assignment |

Authorization and data-integrity checks:

- Requires the active branch and branch-scoped \`events.manage\` capability.
- Rejects assignment changes for cancelled or completed events.
- Staff targets must be active and hold an active role assignment in the same branch for the assignment window.
- Team targets must be active and belong to the same branch.
- Assignment start/end times must remain within the event's scheduled window.
- Overlapping active assignments for the same target and role are rejected.
- Revocation is branch/event-bound, handles repeat revocation safely, and never hard-deletes assignment history.
- Frontend API routing now sends assignment workspace and write operations to the Cloudflare Worker in preview mode.

## Verification

At source commit \`757eb1a0cd801b7e18b25861a83178b930e18d36\`:

- Cloudflare Worker TypeScript check and Worker authentication/route suite: passed.
- Cloudflare D1 foundation/schema validation: passed.
- Frontend typecheck, lint, unit tests, and production build: passed.
- Preview Worker version \`40f2172b-d9ec-488f-89a6-ddbf41e923f2\` receives 100% preview traffic.
- Existing D1, Supabase Auth, and Worker secret bindings were preserved.
- Live preview smoke probes passed for assignment workspace, staff/team assignment writes, and revocation; all correctly reject anonymous requests.

## Safety boundary

These changes are limited to the non-production preview Worker and migration branch. No production Pages routing, production Worker, production database marker, production data, or SMS behavior was changed.
