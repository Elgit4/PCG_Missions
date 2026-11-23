# PCG Missions — Production-readiness continuation audit

**Evidence date:** 23 November 2026, approximately 22:45 UTC  
**Repository:** \`Elgit4/PCG_Missions\`  
**Candidate branch:** \`migration/cloudflare-auth-consolidation\`  
**Candidate head at this audit:** \`f3021de6245a7030bb1374850c956681ac54638a\`

This document continues the earlier end-to-end feature-wiring and Cloudflare release-readiness audits. It distinguishes source-level implementation, automated verification, live infrastructure state, and authenticated user acceptance. Passing one category does not close the others.

## 1. Current repository and CI state

The migration candidate contains the staff-directory correction merged from PR [#150](https://github.com/Elgit4/PCG_Missions/pull/150).

The exact candidate head \`f3021de6245a7030bb1374850c956681ac54638a\` has these successful runs:

| Check | Run | Result |
|---|---:|---|
| CMI web CI | [45282207476](https://github.com/Elgit4/PCG_Missions/actions/runs/45282207476) | Passed |
| Cloudflare D1 Foundation | [45282207471](https://github.com/Elgit4/PCG_Missions/actions/runs/45282207471) | Passed |
| Cloudflare Auth Preview Release | [45282196295](https://github.com/Elgit4/PCG_Missions/actions/runs/45282196295) | Passed |
| Push-triggered Cloudflare D1 Foundation | [45282196292](https://github.com/Elgit4/PCG_Missions/actions/runs/45282196292) | Passed |

The preview workflow completed its schema, Worker deployment, health, Better Auth session endpoint, and anonymous-boundary checks. These are preview checks; they do not authenticate a real production staff member.

### Pull-request sequencing

- [PR #82](https://github.com/Elgit4/PCG_Missions/pull/82) remains open and draft, targeting \`main\`.
- [PR #102](https://github.com/Elgit4/PCG_Missions/pull/102) remains open and draft, targeting the PR #82 feature branch.
- PR #102 is therefore a stacked migration candidate, not a direct merge to \`main\`.

The integration sequence must be preserved or deliberately retargeted after the base feature PR is merged. Neither draft PR should be described as a production release.

## 2. Live Cloudflare state

The Cloudflare account was inspected using read-only API calls. No production D1 rows, Worker code, Pages deployment, secrets, or account settings were changed during this audit.

### Databases and role foundation

| Item | Production | Preview |
|---|---:|---:|
| D1 schema version | 45 | 46 |
| Migration ledger rows | 45 | 46 |
| Active capability definitions | 89 | 89 |
| Role-capability grants | 128 | 140 |
| Standard role definitions | 6 | 6 |

Production migration 0046 is still pending. Preview has the schema-46 report/event capability repair and the additional role-capability grants. The production D1 database remains on schema 45 with 128 grants.

Production currently has 107 capability catalogue rows in total, of which 89 are active. The six role definitions are present.

### Worker and Pages

- Production Better Auth Worker is deployed and bound to \`pcg-missions-production\`.
- Preview Better Auth Worker is deployed and bound to \`pcg-missions-migration-test\`.
- The production Worker secret inventory includes \`BETTER_AUTH_SECRET\` and \`SUPABASE_SERVICE_ROLE_KEY\`; secret values were not read.
- The preview Worker has the same required secret names.
- Pages production is configured for \`main\`, with automatic production deployments disabled.
- The currently serving production Pages hostname is \`pcg-missions.pages.dev\`; no custom domain is attached.
- Production Pages configuration points to the production Worker. Preview configuration points to the preview Worker.
- The guarded production workflow contains a non-production Pages upload preflight, followed by the reviewed production Worker deployment, Pages deployment, and same-origin smoke checks. It is not an automatic Git push deployment.

Production Worker observability currently reports query-string redaction disabled, while preview has it enabled. The checked-in Wrangler configuration sets \`redact_query_string = true\`; the next guarded production Worker deployment should apply that setting. Treat this as an outstanding security-hardening item until the deployed production setting is re-read and confirmed.

### Production application data

The checked production tables currently contain:

| Table | Rows |
|---|---:|
| Contacts | 0 |
| Follow-up tasks | 0 |
| Events | 0 |
| Ministry reports | 0 |
| Announcements | 0 |
| Staff notifications | 0 |

This means the operational visitor/ministry dataset is still empty. It is not evidence that the application features are working, and it is not a substitute for acceptance testing.

## 3. Exact production staff-roster preflight

The same read-only SQL used by the guarded production workflow was executed against production D1.

| Gate metric | Observed | Required |
|---|---:|---:|
| Configured standard roles | 6 | 6 |
| Active staff profiles | 2 | At least 6 |
| Better Auth users | 3 | — |
| Password credential users | 3 | — |
| Active staff without credentials | 0 | 0 |
| Credential-ready active Admin/Pastor | 1 | At least 1 |
| Distinct effectively assigned role codes | 1 | 6 |
| Active profiles without an effective role | 1 | 0 |
| Effective assignments on inactive profiles | 1 | 0 |
| Active staff with invalid/expired first-login setup | 1 | 0 |

The Admin/Pastor bootstrap requirement is currently satisfied. The complete six-role roster requirement is not.

**Production release is blocked.** The release workflow correctly refuses to proceed until the roster contains at least six active profiles, all six effective role codes are represented, every active profile has a valid credential and role, inactive accounts have no effective assignments, and no active first-login setup has expired.

The repository owner must confirm the actual six-person roster and intended role allocation. Do not invent staff identities or assign pastoral/operational roles to the wrong people merely to make the gate green.

## 4. Feature-wiring findings

The current migration branch contains working source paths for the following areas:

| Feature | Source wiring observed | Acceptance still required |
|---|---|---|
| Contact capture and search | Worker routes, capability checks, branch scoping, frontend API client and forms | Real authenticated browser flow |
| Contact assignment | Staff/team assignment UI, reason validation, Worker authorization and audit path | Browser test for each permitted scope |
| Follow-up tasks | Create, status transitions, filters, pagination and assignment | Browser test with real staff sessions |
| Follow-up handoff | Reassignment UI with target validation and mandatory reason; Worker revalidates scope and records the transfer | Browser test and recipient notification verification |
| Staff accounts | Provisioning, password-reset request/review, activation status and account audit | Real first-login and admin-reset walkthrough |
| Staff role management | Standard role assignment/revocation and Admin/Pastor elevation/review UI and Worker routes | Full role lifecycle and dual-control acceptance |
| Teams and service areas | Team/member and coverage operations, scoped reads and audit records | Browser acceptance for branch and team scopes |
| Events and attendance | Event assignment, registration, check-in and closeout submit/review handlers | Full return/resubmit and browser lifecycle |
| Ministry reports | Submit, self-review denial, return, resubmit and review handlers | Full return/resubmit acceptance |
| Notifications | Recipient-scoped inbox, read and read-all operations, assignment/review notifications | Verify each notification type and recipient in browser |
| Announcements/content | Draft create/list/update handlers and frontend paths | Publication permissions and browser acceptance |
| Calendar | Create, update, list and reason-coded cancellation | Browser acceptance and timezone edge cases |
| Prayer/pastoral workflows | Restricted assigned-prayer read path and sensitive access controls exist in source | Assigned-only positive test and cross-role denial test |

The earlier audit's statements that contact assignment, follow-up handoff, and standard role-management UI were absent are no longer accurate for this candidate branch. Those source paths are present. Their existence does not mean the live production Pages deployment has received them or that authenticated browser acceptance is complete.

### Staff-directory defect fixed

Production contained an active staff profile with a branch-specific \`staff_access_audit\` account-creation record but no role-assignment row. The original staff-directory query selected only profiles with a role-assignment record, so the unassigned profile was invisible to Admin/Pastor role management.

PR [#150](https://github.com/Elgit4/PCG_Missions/pull/150) changed the directory predicate to include a profile when either:
- it has a role-assignment history in the active branch; or
- it has a staff access-audit record in the active branch.

The role projection remains limited to currently effective role assignments. The branch ID is applied to both selection paths. A regression test verifies that an unassigned branch-linked profile appears with an empty role list and that the audit lookup remains branch-scoped.

PR #150 was merged into the migration candidate as \`f3021de6245a7030bb1374850c956681ac54638a\`. D1 Foundation passed on the PR head, and the migration branch's D1 Foundation, web CI, and preview release passed on the merged candidate head.

## 5. Authenticated acceptance gaps

The current \`cloudflare/scripts/run_authenticated_acceptance.mjs\` is a synthetic API-level acceptance harness. It provisions test identities and records in a temporary D1 database, exercises the Worker endpoints, and is designed to run before the temporary database is restored/deleted.

It already exercises substantial workflows, including:
- Better Auth sessions and sign-out;
- forced first-login password change;
- admin password reset and old-session revocation;
- six-role capability contexts;
- contact and follow-up operations;
- event registration/check-in and closeout approval;
- report submission, self-review denial and approval;
- recipient-scoped notifications;
- team/service-area administration;
- announcement and content drafts;
- calendar create/update/cancel.

The current harness does **not** yet close these acceptance gaps:

1. Ministry report returned → author resubmits → reviewer approves. The Worker supports this lifecycle, but the harness currently tests only submission, self-review denial and direct approval.
2. Event closeout returned → author resubmits → reviewer approves. The Worker supports this lifecycle, but the harness currently tests only submit and direct approval.
3. Explicit cross-branch positive/negative reads and mutations across the main business resources.
4. Authenticated role assignment/revocation and Admin/Pastor elevation dual-control lifecycle.
5. Assigned-prayer positive access for Prayer Intercessor and denial of unassigned/sensitive pastoral content to other roles.
6. Explicit session-refresh behavior after the session-refresh implementation changes.
7. Browser-level authenticated acceptance through the production Pages same-origin proxy, using real staff accounts. The synthetic harness calls the Worker API directly and cannot prove the browser login experience, cookie propagation, UI wiring, or real-device behavior.

These should be added to the temporary-D1 acceptance harness and then exercised in the preview environment. Do not seed synthetic visitors, prayer requests, reports or events into production to satisfy acceptance.

## 6. Backup, quota and operational safety

- The isolated EU schema-46 D1 Time Travel restore rehearsal previously passed. It proves the scratch-database restore procedure, not recovery of production ministry data.
- A production Time Travel bookmark exists, but an independently retained production backup and a production-data clone restore have not been demonstrated.
- Production D1 is currently schema 45. No production migration 0046, restore, or candidate Worker/Pages deployment has occurred.
- The account's daily D1 row-write quota has been a constraint during recent migration rehearsals. The preview workflow is designed to wait for the UTC quota reset when Cloudflare returns the free-tier row-write-limit error. Avoid repeated write-heavy rehearsals before the reset or move to a paid D1 plan if the release window requires it.
- Keep SMS disabled. Keep Supabase only for the private event-flyer Storage path until a verified replacement exists.

## 7. Release decision and next work

**Decision: NOT READY FOR PRODUCTION CUTOVER.** The application has a deployed Cloudflare foundation and a candidate branch with passing CI and preview smoke checks, but the production roster and authenticated acceptance gates are not complete.

Recommended order:

1. Confirm and provision the real six-person staff roster, correct role assignments, account activation state, and first-login credentials. Use the repaired staff directory to manage branch-linked profiles with no current role.
2. Extend the synthetic acceptance harness for report return/resubmit, event closeout return/resubmit, branch isolation, role lifecycle/dual control, assigned prayer access, and session refresh.
3. Run the complete isolated EU restore rehearsal and authenticated acceptance on the current reviewed source. Retain the run artifacts and restore evidence.
4. Complete a production-data backup/clone restore exercise before the church begins entering irreplaceable records.
5. Confirm the deployed production Worker has query-string redaction enabled and verify production Pages/Worker same-origin behavior.
6. Resolve the stacked PR sequence: merge or deliberately retarget PR #82, then review and merge PR #102 into \`main\`.
7. Only after all gates pass, manually dispatch \`cloudflare-production-worker-deploy.yml\` from the reviewed migration branch with the exact \`DEPLOY-PRODUCTION\` confirmation. Verify schema 46, Worker health, Pages health, Better Auth session endpoint, anonymous boundaries, CORS, and real authenticated staff workflows after deployment.

Do not report the application as production-ready until the production roster gate, isolated authenticated acceptance, backup/restore evidence, and real staff sign-in walkthrough all pass.
