# PCG Missions — End-to-End Feature Wiring Audit

**Audit date:** 23 November 2026  
**Repository:** `Elgit4/PCG_Missions`  
**Audited source branch:** `migration/cloudflare-auth-consolidation`  
**Source baseline inspected:** `c1acfc3d98f2352ee03259c9df8804f5620d4647`  
**Current migration head after accepted fixes:** `e296ab24eb81a5f97f02bcda5b871b459c8ee3ec`  
**Primary integration PR:** [#102](https://github.com/Elgit4/PCG_Missions/pull/102)  
**Audit type:** Source-to-runtime feature wiring review; not production acceptance or security certification.

## 1. Executive assessment

PCG Missions has a substantial Cloudflare implementation: Better Auth, D1-backed staff identity and authorization, branch-scoped Worker APIs, a React staff workspace, contact and follow-up workflows, event operations, typed reports, team/service-area administration, restricted pastoral reads and an in-app notification centre.

The audit does **not** support a claim that every visible feature is fully wired. Several user-facing controls or workflows still call missing Worker routes, and some backend capabilities have no corresponding browser workflow. The most important remaining gaps are:

1. Private sermon and welcome-message draft operations are now wired through the Worker, API adapter and UI by merged [PR #121](https://github.com/Elgit4/PCG_Missions/pull/121). Cloudflare D1 Foundation and CMI web CI passed; production remains unchanged.
2. The unsupported announcement archive/delete action and stale API method were removed by PR #121. Publishing and delivery remain disabled.
3. Calendar cancellation was completed by merged [PR #119](https://github.com/Elgit4/PCG_Missions/pull/119), including authorization, reason, concurrency and audit handling. Cloudflare D1 Foundation and CMI web CI passed; production remains unchanged.
4. Contact assignment is implemented in the Worker but is not exposed by the browser API client or workspace. New contacts are automatically assigned to the capturing staff member, so the approved Missions Leader/Admin manual-assignment workflow is not available end to end.
5. Follow-up task creation in the workspace is self-assignment only. Team/staff assignment targets and reassignment controls are not exposed in the UI, despite backend reassignment support.
6. Staff role administration is not complete in the audited branch's UI. [PR #114](https://github.com/Elgit4/PCG_Missions/pull/114) contains the role-management interface and client wiring but remains a draft.
7. The production environment is not ready for unrestricted operational use: production is on D1 schema 45, preview is on schema 46, and only one production staff profile has an effective role assignment.

**Overall verdict: substantial implementation; several feature-wiring gaps remain; not ready for final product sign-off.**

## 2. Audit method and evidence boundary

The review traced representative operations through:
- React workspace and interaction handlers;
- typed API client methods and the `workerApiPath` adapter;
- Cloudflare Worker route dispatch and handler functions;
- authorization/capability and branch-scope checks;
- D1 writes, concurrency predicates and audit triggers;
- regression tests and current pull-request/CI evidence.

A passing type-check or unit suite is not treated as proof that a browser action reaches a valid Worker route. Source tests and isolated D1 lifecycle tests are not treated as authenticated browser acceptance.

No production records, staff credentials, secrets, or real visitor/pastoral data were changed during this audit. No production migration or deployment was performed.

## 3. Feature-by-feature assessment

| Feature | Source assessment | End-to-end status |
|---|---|---|
| Better Auth sign-in/session | Better Auth uses D1-backed sessions and HttpOnly cookies. Staff context checks active profile, active role assignment, branch access and first-password-change expiry. | Implemented in source; authenticated acceptance for all intended staff roles remains open. |
| Account provisioning | Authorized staff provisioning creates Better Auth identity/credential records and staff profile/role assignment; temporary credentials require manual private handoff and first-login password change. | Implemented in source; sender/email delivery is not verified and manual handoff remains the operational path. |
| Password reset | Staff request and Admin/Pastor approval/reset paths exist; password change revokes existing sessions. | Implemented in source; live account-recovery acceptance remains open. |
| Six-role authorization | Six fixed roles, capability catalogue, scoped grants, active assignment windows, branch checks, team-leader membership checks, assigned-contact/task checks and explicit pastoral-share checks exist. | Strong server-side foundation; role-specific authenticated acceptance remains open. |
| Staff role administration | Worker role assignment/elevation/revocation operations exist. The audited browser workspace does not yet expose the complete multi-role workflow. | Partially wired. PR #114 adds the UI/client work and is still draft. |
| Contacts — capture | Contact creation validates input, uses an idempotency receipt and creates a capture record plus an initial assignment in a D1 batch. | Implemented, but initial assignment is automatic to the capturing staff member. |
| Contacts — list/search | Branch-scoped list and restricted projections are implemented. The audited branch search only matches first/last name. | Search gap fixed in source by merged PR #113, including privacy-gated email and normalized Ghanaian phone search; not yet a production deployment. |
| Contacts — detail/history | Contact detail, ordinary notes and interaction history have Worker/API/UI paths with scoped reads and writes. | Implemented in source; authenticated role acceptance remains open. |
| Contacts — assignment | Worker `POST /api/v1/contacts/{id}/assign` exists and applies assignment authorization/audit logic. The browser API adapter and workspace have no matching assignment method/control. | Backend-only; manual Missions Leader/Admin assignment is not end-to-end. |
| Contact duplicates/merge | Safe duplicate merge is explicitly not implemented. Restricted prayer/care relationships make a casual merge unsafe. | Intentionally deferred; PR #115 documents the safety boundary, not an enabled feature. |
| Follow-up — list/create/update | Branch/assigned/team scopes, idempotent creation, status transitions, due dates, task notes and assignment-aware reads exist. | Implemented in source for the exposed self-assignment workflow; authenticated role acceptance remains open. |
| Follow-up — assignment/handoff | Worker reassignment and API-client reassignment operations exist, but the workspace exposes only self-assignment and has no staff/team assignment picker or reassignment action. | Partially wired; shared assignment and handoff requirements are not complete in the UI. |
| Prayer requests | Assigned intercessor inbox and audited restricted reads are present. The workspace is explicitly read-only. | Implemented within the approved read-only boundary; request creation/assignment and pastoral mutations remain disabled. |
| Pastoral care | Restricted audited read path exists with reason-coded access. | Read-only and intentionally restricted; full care-management lifecycle is not enabled. |
| Events | Private event drafts, flyer operations, staff/team assignments, staff registration/capacity, check-in and closeout/review routes are present. | Substantial implementation. PR #117 covers the registration actor-schema regression; PR #118 restores canonical report/event capabilities. Browser acceptance remains open. |
| Calendar — create/list/update | Branch-scoped create/list/update operations and optimistic update checks exist. | Implemented in source. |
| Calendar — cancellation | UI calls `cancelCalendarEntry`; the Worker now has the POST cancellation route, capability/reason checks, concurrency guard and audit-trigger coverage. | Implemented in the current migration branch by merged PR #119; not yet deployed to production. |
| Announcements | Private draft list/detail/create/edit operations exist; publishing and delivery are disabled. | Draft operations are present; unsupported archive/delete action removed by merged PR #121. Publishing/delivery remain disabled. |
| Sermons/welcome messages | UI, API client and Worker now expose private draft list/create/detail/edit routes with branch/capability checks and creator-only access. | Implemented in the current migration branch by merged PR #121; not yet deployed to production. |
| Teams/service areas | Branch-scoped team and service-area administration routes and workspace components exist. | Implemented in source; role-specific authenticated acceptance remains open. |
| Ministry reports | Typed report submission, list/detail, review/return and resubmission routes exist. Report/event capabilities were realigned in PR #118. | Implemented in source with D1 lifecycle regression coverage; authenticated browser acceptance remains open. |
| Notifications | Private inbox/read-state routes and assignment/review notification producers exist. PR #116 adds/repairs report and event recipient triggers. | Implemented in source; trigger-to-recipient acceptance in authenticated browser sessions remains open. |
| Public visitor site | Public-content projection is read-only and separates published content from private staff drafts. | Implemented within current scope. Public registration and public prayer intake remain disabled. |
| Event flyer storage | Private event-flyer storage remains server-mediated; Supabase is retained only for this object-storage path. | Implemented in source; Supabase Auth/Postgres are not the operational identity/database plane. |
| SMS/communications | SMS dispatch, campaigns and automation are disabled; no SMS role grants are provisioned. | Intentionally disabled. Do not enable as part of this audit. |
| Offline workflows | Staff business data/offline capture and sync remain disabled. | Intentionally disabled pending encryption, device-binding, expiry and conflict-recovery controls. |
| Exports/publication | Publishing, broad exports and other high-risk delivery paths remain approval-gated. | Intentionally disabled until separate authorization and acceptance gates pass. |

## 4. Confirmed defects and corrective work

### Closed in migration branch — Visitor content draft routes

**Evidence on the source baseline:** `OperationsWorkspace` called the sermon and welcome-message draft methods, but the API adapter and Worker dispatcher did not map/serve those requests.

**Impact:** Draft listing/creation/editing failed before reaching a supported Worker route.

**Correction:** Merged PR #121 adds `/api/v1/content/sermons` and `/api/v1/content/welcome-messages`, Better Auth cookie routing, branch-scoped `content.manage.draft` checks, creator-only draft reads/edits, bounded validation and regression tests. Cloudflare D1 Foundation and CMI web CI passed. The current migration branch is corrected; production has not been deployed.

### Closed in migration branch — Unsupported announcement archival

**Evidence on the source baseline:** The Operations workspace called `archiveAnnouncementDraft`, but the Worker only implemented draft list/detail/create/edit. The approved announcement contract excludes archival/deletion.

**Impact:** The archive action could not complete and advertised a lifecycle operation the backend intentionally does not support.

**Correction:** Merged PR #121 removed the archive/delete control and stale API method. Do not add archival without a separately approved lifecycle contract.

### Closed in migration branch — Calendar cancellation

**Evidence on the source baseline:** The UI called `api.cancelCalendarEntry`, but the API adapter did not map the `/entries/{id}/cancel` suffix and the Worker had no POST cancellation route, despite D1 migration 0024 defining cancellation state and append-only audit triggers.

**Impact:** Authorized staff could not cancel calendar entries from the workspace.

**Correction:** Merged PR #119 added a branch-scoped, capability-checked POST cancellation endpoint, required reason, optimistic state transition, cancelled-entry filtering and Worker/API/SQLite regression tests. The initial SQLite fixture omission was corrected; D1 Foundation run [45251797673](https://github.com/Elgit4/PCG_Missions/actions/runs/45251797673) and CMI web CI run [45251797679](https://github.com/Elgit4/PCG_Missions/actions/runs/45251797679) passed. The migration branch is corrected; production has not been deployed.

### P1 — Contact assignment UI missing

**Evidence:** The Worker implements `POST /api/v1/contacts/{id}/assign`, but `CmiApiClient` and the contact workspace do not expose it. Contact creation currently inserts an assignment to the capturing staff member in the same D1 batch.

**Impact:** Missions Leader/Admin cannot manually allocate a newly registered visitor to the appropriate follow-up worker from the UI.

**Correction:** Add a typed client method and a capability-gated assignment control to the contact profile/workspace. Preserve the Worker-derived actor/branch, require a reason, show assignment history and prevent cross-branch targets. Confirm whether auto-assignment to the capturer should remain as a temporary holding assignment or be replaced by an explicit unassigned/triage state; do not silently change this product rule.

### P1 — Follow-up assignment and handoff UI incomplete

**Evidence:** `StaffWorkspace.createTask` sets `assignee_user_id` to the current user and explicitly comments that only self-assignment can be constructed safely. The Worker and API client have reassignment operations, but the UI does not expose a staff/team target picker or reassignment action.

**Impact:** Team leaders/coordinators cannot use the full shared-responsibility and handoff workflow from the workspace. Team-scoped task creation is not completed by the current UI.

**Correction:** Build an authorized staff/team assignment picker using current branch memberships, add a reasoned reassignment flow, show assignment history, and test that assigned-scope roles cannot assign outside their allowed records. Do not accept arbitrary profile/team IDs as authorization evidence.

### P1 — Staff role administration UI incomplete

**Evidence:** Worker role assignment and dual-control Admin/Pastor elevation/revocation endpoints exist, but the audited Staff workspace does not expose the complete role lifecycle.

**Correction:** Complete review of PR #114, which adds role assignment and dual-control elevation/revocation UI. Before merge, fix its staff-directory role-history projection: the draft subquery aggregates assignments without a current-branch predicate and the UI does not distinguish revoked/expired assignments from active ones. Ensure only current-branch assignment history is returned and expose revocation/expiry state so stale assignments cannot be presented as active removable roles. Keep Admin/Pastor elevation under distinct approval; do not make it an ordinary role dropdown action.

### P2 — Contact search enhancement

**Evidence:** The audited baseline searched first and last names only.

**Correction:** PR #113 was merged into the migration branch at `c1acfc3d98f2352ee03259c9df8804f5620d4647`. It adds preferred-name, privacy-gated email and normalized phone search, including local Ghanaian 0-prefixed and E.164 +233 representations. This closes the source-branch search gap but does not by itself prove the production deployment is updated.

## 5. Security and data-integrity observations

Positive source controls observed:
- Better Auth session cookies are HttpOnly and the browser API client does not send Supabase bearer tokens or service-role credentials.
- Staff operations derive actor identity from the authenticated session; caller-supplied actor IDs are not trusted.
- Branch context is checked against active branch assignments and capability grants.
- Assigned/team scopes are evaluated server-side against current contact/task assignments and team membership.
- Sensitive prayer/care reads use explicit restricted access and reason-coded audit paths; ordinary contact projections do not expose pastoral narratives.
- Contact and follow-up creation use idempotency keys/receipts.
- Calendar, report, event and role lifecycle paths use optimistic predicates or transactional batches where required.
- Append-only audit tables/triggers exist for sensitive or important state changes.

Remaining verification:
- Run authenticated positive and negative browser acceptance for all six roles, including branch switching, assignment expiry/revocation and session expiry.
- Verify every visible button against its API route and every route against its Worker handler and D1 transaction.
- Confirm notification recipients for task/contact/event/report operations with synthetic multi-role staff fixtures.
- Test rate limits, malformed payloads, duplicate request replay, optimistic conflicts and branch mismatch at the Worker boundary.
- Reconcile production staff identities before importing real contacts or pastoral data.

## 6. Deployment and production readiness

The Cloudflare production baseline is live, but preview and production are not at the same schema version.

| Item | Preview | Production |
|---|---:|---:|
| D1 schema | 46 | 45 |
| Active capability definitions | 89 | 89 |
| Role-capability grants | 140 | 128 |
| Staff profiles / Better Auth users / credential accounts | 3 / 3 / 3 | 3 / 3 / 3 |
| Effective active role assignments | Test/preview fixtures | 1 |

Production has one active staff profile with an effective Admin/Pastor assignment. A separate active profile has no effective role assignment and an expired first-login setup window; a Team Leader assignment belongs to an inactive profile. The production business tables checked for contacts, follow-up tasks, events, reports and announcements were empty at the last documented inspection.

The isolated EU D1 schema-46 Time Travel rehearsal passed. That is not a production-data restoration rehearsal. Production currently has a Time Travel bookmark, but recovery of actual production records has not been rehearsed.

Production Pages automatic deployments remain disabled and production remains on the existing schema-45 Worker/database baseline. Do not apply schema 46, deploy the migration branch or import real congregant data until all acceptance, privacy, staff-account and recovery gates are approved.

## 7. Pull-request and verification ledger

| PR | Status at audit | Audit relevance |
|---|---|---|
| [#102](https://github.com/Elgit4/PCG_Missions/pull/102) | Open, Draft | Main Cloudflare migration integration; source branch under review. |
| [#112](https://github.com/Elgit4/PCG_Missions/pull/112) | Closed; superseded | Replaced by current-head PR #121. |
| [#113](https://github.com/Elgit4/PCG_Missions/pull/113) | Merged into migration branch | Contact search by preferred name, email and phone. |
| [#114](https://github.com/Elgit4/PCG_Missions/pull/114) | Open, Draft | Staff role administration UI and dual-control flows. |
| [#115](https://github.com/Elgit4/PCG_Missions/pull/115) | Open, Draft | Documents safe contact duplicate-merge boundary; does not implement merge. |
| [#116](https://github.com/Elgit4/PCG_Missions/pull/116) | Merged | Reports/events/notification producer improvements. |
| [#117](https://github.com/Elgit4/PCG_Missions/pull/117) | Merged | Event registration actor-schema regression coverage. |
| [#118](https://github.com/Elgit4/PCG_Missions/pull/118) | Merged | Restores canonical report/event capability alignment. |
| [#119](https://github.com/Elgit4/PCG_Missions/pull/119) | Merged | Calendar cancellation end-to-end correction; D1 Foundation and web CI passed after fixture correction. |
| [#120](https://github.com/Elgit4/PCG_Missions/pull/120) | Open | This audit report. |
| [#121](https://github.com/Elgit4/PCG_Missions/pull/121) | Merged | Private content draft Worker/API wiring and removal of unsupported announcement archival; D1 Foundation and web CI passed. |

PR #119's first SQLite Foundation run failed because the focused authorization fixture had not replayed migration 0024. The fixture was corrected; the rerun passed and PR #119 was merged. PR #121's Cloudflare D1 Foundation and CMI web CI checks also passed. Its Vercel preview status failed because of a build-rate-limit/plan restriction; this is separate from the passing repository test workflows.

## 8. Required closure sequence

1. Complete review and acceptance of PR #114; fix branch-scoped role-history projection and distinguish active, expired and revoked assignments before merging.
2. Implement contact assignment UI and confirm the product rule for initial capture assignment.
3. Implement follow-up staff/team assignment and reassignment UI with scope-aware options and audit history.
4. Run full authenticated browser acceptance with synthetic accounts for all six roles across contacts, follow-up, teams, events, calendar, announcements, content, reports, prayer reads and notifications.
5. Rehearse production-data recovery, reconcile staff identities, approve privacy/retention/incident procedures, then separately authorize schema-46 production migration and cutover.
6. Keep SMS, public registration, Transport, offline workflows, publishing and unapproved exports disabled until their dedicated gates pass.

---

## 12. Superseding implementation and release-status update — 23 November 2026, 20:37 UTC

This section supersedes earlier statements in this audit where later merged pull requests completed the cited workflow. It does not convert source-level completion into production acceptance.

### Completed after the original audit snapshot

- **Staff role administration — PR #123 merged.** The staff role management UI/client implementation is integrated, including active role history and audited role assignment/revocation. Admin/Pastor elevation retains its dual-control safeguard.
- **Contact assignment and follow-up responsibility — PR #124 merged.** The browser API client and Staff Workspace now expose scoped contact assignment to staff or teams, follow-up task creation for self/staff/team targets, and reason-required reassignment/handoff. The client validates target cardinality; the Worker remains the authority for current membership, active status, branch scope and capability checks.
- **Better Auth D1 adapter — PR #128 merged.** Better Auth now receives a Drizzle D1 database through its supported SQLite adapter rather than the raw D1 binding. The adapter schema maps the existing `user`, `session`, `account`, `verification` and `rateLimit` tables. Dependency pin was aligned to Drizzle ORM 0.45.4, matching Better Auth 1.7.22 peer requirements.
- **CI evidence for PR #128:** Cloudflare Worker type-check and SQLite foundation tests passed; CMI web CI passed after merge.

### Current live environment evidence

| Area | Observed state | Acceptance |
|---|---|---|
| Non-production D1 | Schema 46; migration ledger includes 0046 | Schema deployed |
| Production D1 | Schema 45; migration ledger ends at 0045 | Migration 0046 pending |
| Production staff authorization | Two staff profiles currently have effective role assignments | Not sufficient evidence of all intended staff accounts being provisioned |
| Preview Worker | Latest deployment is the Better Auth adapter build; health endpoint reports non-production schema 46 and auth configuration ready | Health passes |
| Preview anonymous API boundary | `/api/v1/me` returns HTTP 401 with `UNAUTHENTICATED` | Pass |
| Preview Better Auth session endpoint | `/api/auth/get-session` reaches Better Auth, but its rate-limit insert fails because the Cloudflare account has exceeded the D1 Free-tier daily row-write allowance | Blocked by account quota; live session acceptance not yet passed |
| Production Worker | Last observed deployment was 22 November 2026; it is bound to production D1 and has production Better Auth secrets | New adapter version not deployed |
| Production release workflow | Guarded manual workflow exists; it verifies D1 ledger, secrets, bundle, Time Travel bookmark, migrations and post-deploy endpoints | Not executed for schema 46 / new adapter |
| Legacy initial-cutover workflow | Explicitly retired | Must not be rerun |

The preview failure was confirmed directly by Cloudflare D1: a read-only metadata query succeeded, while a harmless isolated preview `rateLimit` insert returned error 7500, explicitly stating that the account exceeded the Free-tier daily row-write limit. The failed Better Auth session request attempted this same rate-limit write. Therefore, the latest smoke-test failure is **not evidence of a remaining Drizzle adapter mismatch**; it is an infrastructure quota block. No production data was changed to investigate it.

### Release decision

**Do not mark PCG Missions production-ready yet.** The following are still required:

1. Re-run preview authenticated-session and login/password lifecycle tests after the D1 row-write quota resets, or after the account moves to a D1 plan with sufficient write capacity. Verify a real test account can sign in, retrieve its session, change its temporary password and complete a password reset.
2. Complete the full role matrix against isolated test accounts: Admin/Pastor, Coordinator, Team Leader, Field Worker, Follow-up Volunteer and Prayer Intercessor. Include negative tests for cross-branch reads, team-boundary violations, pastoral restrictions and unauthorized role elevation.
3. Complete browser-level acceptance for contact capture/assignment, task create/handoff/status, staff-role changes, reports, events, calendar cancellation, announcements/content drafts and notifications. Existing unit/type/SQLite tests do not replace this.
4. Run and retain a successful D1 restore rehearsal. The previous rehearsal was cancelled after earlier account write-quota exhaustion; it is not a passed restore test.
5. Apply migration 0046 to production through the guarded production release workflow, then deploy the reviewed Better Auth Worker and verify the production Pages proxy, session endpoint, CORS and unauthenticated boundaries.
6. Verify the production Pages frontend is using the intended Cloudflare Worker routes and no Supabase Auth/Postgres operational dependencies remain. Supabase object storage is the documented exception for event flyers. SMS remains disabled.
7. Verify production backups/Time Travel recovery evidence, monitoring/alerting, account provisioning and operational support procedures before opening access to the full ministry team.

No production migration, Worker deployment, staff credential change, SMS activation or destructive data operation was performed as part of this audit update.
