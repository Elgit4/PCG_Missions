# PCG Missions — End-to-End Feature Wiring and Production Readiness Audit

**Audit date:** 23 November 2026  
**Repository:** `Elgit4/PCG_Missions`  
**Integration branch:** `migration/cloudflare-auth-consolidation`  
**Source baseline inspected:** `7ca4243a18ae2aef878ceae6cddbc61c71e6a1b1`  
**Primary migration PR:** [#102](https://github.com/Elgit4/PCG_Missions/pull/102)  
**Audit type:** Source-to-runtime feature wiring review, production configuration inspection and release-gate verification. This is not a claim of completed production acceptance.

## 1. Executive assessment

The main feature-wiring defects identified in the earlier audit have been corrected in the Cloudflare migration branch:

- Staff role administration and audited role assignment/revocation are merged.
- Contact assignment to an authorized staff member or team is merged.
- Follow-up creation and handoff support self, staff-profile and team targets, with server-side scope enforcement and reasoned reassignment.
- Calendar cancellation, private content drafts, announcement action cleanup, contact search, event/report capability alignment and notification producer fixes are merged.
- Better Auth now uses the supported Drizzle D1 adapter rather than passing the raw D1 binding as its database.
- Production credential rows currently match the production Better Auth user rows.

**The source-level wiring gaps are closed. Production is not yet signed off.** Two infrastructure-dependent runtime rehearsals remain blocked by the Cloudflare account's daily D1 row-write quota, and production is still on schema 45 while the reviewed migration branch is on schema 46. The guarded production release workflow is being completed so that one controlled release updates both the Worker and Pages frontend.

No production migration, production Worker deployment, production Pages deployment, production staff-account creation or SMS activation has been performed as part of this audit.

## 2. Verified corrective work

| PR | Status | Result |
|---|---|---|
| [#113](https://github.com/Elgit4/PCG_Missions/pull/113) | Merged | Contact search supports preferred names, privacy-gated email and normalized Ghanaian phone numbers. |
| [#116](https://github.com/Elgit4/PCG_Missions/pull/116) | Merged | Report/event notification producers and recipient selection improved. |
| [#119](https://github.com/Elgit4/PCG_Missions/pull/119) | Merged | Calendar cancellation route, reason, authorization, concurrency and audit behavior completed. |
| [#121](https://github.com/Elgit4/PCG_Missions/pull/121) | Merged | Sermon/welcome-message private draft routes connected; unsupported announcement archive action removed. |
| [#123](https://github.com/Elgit4/PCG_Missions/pull/123) | Merged | Branch-scoped staff directory and audited role assignment/elevation/revocation UI completed. |
| [#124](https://github.com/Elgit4/PCG_Missions/pull/124) | Merged | Contact assignment plus team/staff follow-up creation and handoff UI completed. |
| [#126](https://github.com/Elgit4/PCG_Missions/pull/126) | Merged | Credential-import verification checks existing credential hashes without exposing credential material. |
| [#128](https://github.com/Elgit4/PCG_Missions/pull/128) | Merged | Better Auth uses a Drizzle adapter for Cloudflare D1 and an explicit schema for the existing auth tables. |
| [#130](https://github.com/Elgit4/PCG_Missions/pull/130) | Open | Guarded production release now builds and preflights Pages, applies schema 46, deploys Worker and Pages, then verifies both. |

The relevant D1 Foundation and CMI web CI checks passed for the merged feature corrections. PR #128's type-check and Worker/SQLite tests passed. The runtime session smoke test is still being investigated under the confirmed D1 quota restriction; passing source tests are not being represented as proof of a working live login.

## 3. Feature-by-feature status

| Feature | Current implementation status | Runtime/operational qualification |
|---|---|---|
| Better Auth login/session | D1 Drizzle adapter, credential accounts, session hooks and HttpOnly cookie handling are implemented. | Preview Worker health passes. Anonymous `/api/auth/get-session` currently fails at a D1 `rateLimit` insert while the account-wide daily row-write quota is exhausted. Re-run after quota reset before sign-off. |
| Account provisioning | Better Auth user/credential creation, staff profile creation, first-login password change and manual private credential handoff are implemented. | Production has 3 users and 3 credential accounts. Email delivery is not configured; manual handoff remains the documented path. |
| Password recovery | Staff reset request and Admin/Pastor approval/reset paths are implemented; password change revokes sessions. | Authenticated production recovery acceptance remains pending. |
| Six-role authorization | Six fixed roles, capability catalogue, scoped grants, assignment windows, branch checks, team membership checks and restricted pastoral access are implemented. | Production has only 2 effective role assignments across 2 active staff profiles. Do not create fictitious identities or infer that all six roles are staffed. |
| Staff role administration | Branch-scoped directory, role assignment, dual-control Admin/Pastor elevation and audited revocation are implemented. | Source tests pass. Role-by-role authenticated acceptance remains pending. |
| Contact capture | Validated, idempotent contact creation with capture history and initial assignment is implemented. | The current initial assignment-to-capturer behavior is retained. Manual reassignment is now available to authorized staff. |
| Contact assignment | Typed client, contact UI, staff/team targets, reason and server-side scope enforcement are implemented. | Merged PR #124; authenticated browser acceptance remains pending. |
| Contact search/detail/history | Search, privacy-gated projections, notes and activity history are wired. | Merged PR #113; role-specific acceptance remains pending. |
| Contact duplicate merge | Not implemented. | Intentionally disabled: merging can affect restricted prayer/pastoral relationships and requires a separately approved lifecycle contract. |
| Follow-up task creation | Self, staff-profile and team targets are exposed according to capability and scope. | Merged PR #124; Worker revalidates target and contact/team scope. |
| Follow-up reassignment/handoff | Staff/team target picker, mandatory reason and server-side reassignment authorization are implemented. | Merged PR #124; authenticated handoff and audit-history acceptance remains pending. |
| Prayer requests | Assigned intercessor reads are restricted and audited. | Read-only boundary is intentional; creation/assignment and broad pastoral mutations remain disabled. |
| Pastoral care | Reason-coded restricted read path exists. | Read-only and intentionally restricted. |
| Events and attendance | Drafts, assignments, capacity, registration, check-in and closeout/review routes exist. | Source and D1 lifecycle coverage exist; authenticated browser acceptance remains pending. |
| Calendar | Create/list/update and cancellation paths are wired with optimistic concurrency and audit history. | Merged PR #119; production deployment pending. |
| Announcements | Private draft list/detail/create/edit paths exist. | Publishing, delivery and archival remain disabled; unsupported archive action was removed. |
| Sermons and welcome messages | Private draft list/create/detail/edit paths are wired through UI, API and Worker. | Merged PR #121; production deployment pending. |
| Teams and service areas | Branch/team-scoped administration routes and workspace are implemented. | Role-specific acceptance remains pending. |
| Ministry reports | Typed submission, review, return and resubmission routes are implemented. | Capability alignment fixed; authenticated review lifecycle acceptance remains pending. |
| Notifications | Inbox/read-state routes and contact/task/event/report producers are implemented. | Trigger-to-recipient acceptance across real authenticated roles remains pending. |
| Event flyer storage | Server-mediated event flyer storage remains on Supabase Storage. | This is the only retained Supabase application data path. Supabase Auth/Postgres are not the operational identity/database plane. |
| SMS | Dispatch and automation are disabled. | Intentionally disabled; do not enable during release. |
| Offline workflows | Business-data offline capture/sync is disabled. | Intentionally disabled pending device binding, encryption, expiry and conflict recovery. |
| Public registration, publishing and broad exports | Not enabled. | Intentionally disabled pending separate authorization and privacy gates. |

## 4. Current infrastructure evidence

### Production D1 and identity

| Measure | Preview | Production |
|---|---:|---:|
| D1 schema version | 46 | 45 |
| Better Auth users | 3 | 3 |
| Credential accounts | 3 | 3 |
| Active staff profiles | Test fixtures | 2 |
| Effective active role assignments | Test fixtures | 2 |
| Role catalogue | 6 roles | 6 roles |

Production has 3 Better Auth user rows and 3 credential account rows. Two staff profiles are active and two role assignments are currently effective. The effective assignments observed are Admin/Pastor and Team Leader. The other four roles are not currently represented by effective production staff assignments.

The production business tables inspected for contacts, follow-up tasks, events, reports and notifications were empty at the time of inspection. No real visitor or pastoral records were modified.

### Better Auth runtime issue

The raw-D1 database adapter defect was corrected in PR #128. The preview Worker health endpoint now reports ready on schema 46. The remaining anonymous session smoke test reaches Better Auth's D1-backed rate-limit insert and fails while Cloudflare reports the account-wide free-tier daily row-write limit has been exceeded.

The preview database contains the expected `user`, `session`, `account`, `verification` and `rateLimit` tables. The session smoke test must be repeated after the daily quota reset. If it still fails after quota reset, inspect the underlying D1 adapter error before any production release.

### D1 restore and authenticated API rehearsal

The restore workflow previously failed because Cloudflare returned D1 error 7500 (account daily row-write quota exceeded) while applying the isolated rehearsal migration chain. The workflow's quota detection was corrected to recognize both the numeric code and the quota message and wait until 00:05 UTC before retrying. The latest rehearsal is queued; no successful restore rehearsal is claimed yet.

### Production deployment

- Production D1 remains schema 45; preview is schema 46.
- The production Worker has not yet received the reviewed schema-46 migration and latest migration-branch Worker bundle.
- Migration-branch Pages deployments are previews. The production Pages deployment remains on the existing production release.
- Production Pages automatic Git deployments are disabled. PR #130 adds a guarded Direct Upload release path so the reviewed Pages frontend and Functions are deployed after the Worker.
- PR #130 does not trigger a production release merely by merging. Production requires the exact confirmation or the separate release marker after rehearsals pass.

## 5. Security and operational boundaries

Controls retained in the reviewed source:
- Actor identity is derived from Better Auth sessions, not caller-supplied actor IDs.
- Branch and team scopes are revalidated in the Worker.
- Staff assignment targets are checked against active staff/role projections; team targets are checked against current authorized team scope.
- Pastoral/prayer reads remain restricted and reason-coded.
- Contact and task creation are idempotent.
- Sensitive role, assignment, calendar, event and report changes retain audit history and concurrency protections.
- Browser code does not receive Supabase service-role credentials.
- Supabase remains for event-flyer object storage only.
- SMS, public registration, offline sync, publishing and broad exports remain disabled.

## 6. Required release sequence

1. Let the isolated D1 restore/authenticated API rehearsal retry after the UTC quota reset; require it to pass.
2. Re-run the preview Better Auth session smoke test after quota reset; require HTTP 200 from `/api/auth/get-session` and preserve the anonymous `/api/v1/me` 401 boundary.
3. Merge PR #130 only after Cloudflare D1 Foundation and CMI web CI pass.
4. Trigger the guarded production release only after the rehearsals pass. The workflow must:
   - verify the exact production D1 target and existing Worker secrets;
   - build and test the Pages frontend before production mutation;
   - verify Pages upload permission using a preview-only deployment;
   - capture a production D1 Time Travel bookmark;
   - apply only pending forward-only migrations and require schema/ledger 46;
   - deploy the Worker, then Pages assets and Functions;
   - require schema 46 from both direct Worker and same-origin Pages health checks, plus session and CORS smoke tests.
5. After cutover, complete authenticated browser acceptance with actual authorized staff accounts for all six roles, including branch switching, role expiry/revocation, contact assignment, follow-up handoff, events, reports, notifications and restricted pastoral reads.
6. Reconcile staff profiles and effective role assignments before importing real visitor or pastoral data. Do not create placeholder users or grant roles merely to make a test matrix look complete.

## 7. Final verdict

**Feature wiring:** The previously identified contact assignment, follow-up assignment/handoff and staff role administration gaps are corrected in the migration branch. Calendar and content route gaps are also corrected.

**Production readiness:** Not yet signed off. The remaining gates are infrastructure/runtime verification (D1 quota reset, authenticated restore rehearsal and session smoke test), merging the guarded Worker+Pages release workflow, schema-46 production cutover, and final authenticated acceptance with the real staff roster.

No production migration or deployment should be inferred from the successful preview builds or CI checks.
