# PCG Missions — Approved Role Capability Expansion

**Approval:** Product owner, 14 November 2026  
**Target branch:** `feat/supabase-outstanding-features`  
**Status:** Approved authorization design; implementation is gated by server workflows and tests  
**Production status:** Not applied to production

## 1. Decision

The product owner approved extending the six-role capability model for event operations, announcement publishing, assigned pastoral updates and privileged audit access. This is an additive amendment to the owner-directed baseline in `docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md`.

The six existing roles remain unchanged:
`admin_pastor`, `coordinator`, `team_leader`, `field_worker`,
`follow_up_volunteer`, and `prayer_intercessor`.

A role name never authorizes an operation by itself. Every request must verify an active staff profile, active branch assignment, active role/capability grant, and the record's required branch/team/assigned scope. The browser UI is not an authorization boundary.

## 2. Approved target matrix

| Role | Approved operational authority | Explicit exclusions |
|---|---|---|
| Admin/Pastor | Branch event operations; event closeout review; branch announcement publishing; privileged audit metadata; reason-coded, audited prayer and care oversight reads | No SMS provider setup, campaign dispatch, or un-audited pastoral narrative access |
| Coordinator | Branch event registration and check-in; branch announcement publishing; event closeout review within branch authority | No privileged audit, pastoral narrative oversight, pastoral mutation, SMS provider setup or dispatch |
| Team Leader | Registration/check-in and closeout submission only for assigned/team events | No branch-wide event administration, announcement publishing, privileged audit or pastoral oversight |
| Field Worker | Check-in for assigned events; update only care records explicitly assigned to that worker | No branch-wide event operations, unassigned care access, prayer oversight or privileged audit |
| Follow-up Volunteer | Check-in for explicitly assigned events; assigned follow-up work under existing contact/task capabilities | No announcement publishing, pastoral oversight, care narrative access unless explicitly assigned and separately granted, or privileged audit |
| Prayer Intercessor | Read and update only actively assigned prayer requests, with permitted fields and audit evidence | No unassigned request discovery, prayer assignment management, broad oversight, contact identity access or privileged audit |

## 3. Capability-to-scope mapping

The implementation should use these capability codes already present in the capability catalogue, with the following scope limits:

| Capability | Roles | Scope |
|---|---|---|
| `event.registration.manage.scoped` | Admin/Pastor, Coordinator | `branch`; Team Leader | `team` |
| `event.checkin.scoped` | Admin/Pastor, Coordinator | `branch`; Team Leader | `team`; Field Worker and Follow-up Volunteer | `assigned` |
| `event.closeout.submit` | Admin/Pastor, Coordinator | `branch`; Team Leader, Field Worker | `team` or `assigned` only where the event assignment is verified |
| `event.closeout.review` | Admin/Pastor, Coordinator | `branch` |
| `announcement.publish.scoped` | Admin/Pastor, Coordinator | `branch` |
| `audit.read.privileged` | Admin/Pastor only | `branch` |
| `care.record.update.assigned` | Field Worker only | `assigned` |
| `prayer.request.update.assigned` | Prayer Intercessor only | `assigned` |

The existing `prayer.oversight.read` and `care.oversight.read` grants remain Admin/Pastor-only with the existing `oversight` scope, allowlisted reason codes and transactional append-only access audit.

## 4. Implementation and release gates

Approval of this matrix is not evidence that all workflows are already implemented. Do not seed a grant until its server-side route enforces the exact scope and its positive and negative tests pass.

Required work before enabling each capability:

1. **Events:** implement registration, check-in and closeout operations using strict request validation, branch/event assignment checks, idempotency protection and audit events. Public registration remains disabled until the privacy and abuse-control gates in D-05 pass.
2. **Announcements:** implement a publish transition that validates audience scope, publication state, actor authority and immutable publication history. Draft creation/editing remains separate from publication.
3. **Care and prayer updates:** implement allowlisted update fields, assignment verification, reason/context requirements where appropriate, append-only audit records and tests proving that unassigned records and restricted narratives remain inaccessible.
4. **Privileged audit:** expose only minimized audit metadata, filter by authorized branch, exclude credentials/tokens/private narrative, and test read denial for every non-Admin/Pastor role.
5. **Database:** create forward-only migrations with the Supabase CLI. Add pgTAP assertions for every positive grant, forbidden grant, scope, and unchanged browser table privileges. Do not edit previously applied migrations.
6. **Frontend:** expose actions only when the server-issued capability and matching branch are present. UI gating supplements, never replaces, server authorization.
7. **Verification:** run isolated local Supabase migrations and pgTAP, Edge Function tests, frontend type-check/lint/unit tests and production build. Do not apply migrations or deploy functions to production as part of this branch work.

## 5. Explicitly unchanged

- SMS provider configuration, SMS sends, campaigns and automation remain deferred and ungranted.
- Offline operation remains disabled.
- Public event registration remains disabled until the privacy, lawful-purpose, rate-limit and abuse-control gates pass.
- Browser direct database access remains closed.
- The six-role catalogue and existing branch model remain unchanged.
- Production migration, production Edge Function deployment, merge to `main` and production release require separate approval.

## 6. Change control

This document records the product owner's authorization design for implementation on the feature branch. It does not claim that the corresponding endpoints, migrations, tests or production release are complete. Each capability remains unavailable until its implementation gates above pass.
