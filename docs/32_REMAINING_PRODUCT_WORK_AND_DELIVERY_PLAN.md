# PCG Missions — Remaining Product Work and Delivery Plan

**Date:** 19 November 2026  
**Baseline:** main at b83d1feb44fe5cca1e2ddc7d8026a7126a10d385  
**Implementation branch:** feat/cmi-pcg-missions-final-review-v6 (PR #82)

## Product-owner direction

Complete the product workflows defined by the CMI v2.1 requirements except transport. Add an in-app internal notification centre and event flyer upload. SMS/Arkesel remains deferred. Do not change the existing screen loader. Do not restart the Cloudflare migration.

## Verified repository findings

This is a source audit, not a browser or deployment certification.

| Area | Current source evidence | Assessment |
|---|---|---|
| Staff authentication | Supabase Auth email/password, temporary-password gate, reset workflow | Present in source; hosted email delivery and end-to-end auth still require operational verification |
| Contacts | Contact capture, scoped listing/details, notes/interactions and follow-up task creation | Implemented in source; first/last-name search, permission-scoped phone search and server-backed task picker are present. Authenticated role acceptance remains pending |
| Follow-up | Assigned work, due dates, overdue/today/upcoming filters, start/complete actions and contact-context task creation | Implemented in source; verify full six-role scope and authenticated desktop/mobile behavior |
| Events | Private drafts/flyers, staff/team assignments, staff-only registration/cancellation, check-in and closeout | Full non-transport event lifecycle is implemented in PR #82 source with capability checks, transactional capacity/idempotency, attendance reconciliation and independent review. Public registration and Transport remain disabled; hosted deployment and authenticated acceptance are pending |
| Calendar | Branch-scoped create/list/update | Present for the approved private branch workflow |
| Announcements | Private draft create/list/update | Present; publication/delivery remain separately gated |
| Visitor content | Sermon and welcome-message private drafts | Present; publication and public-site administration need their authorised workflows |
| Teams and service areas | Team/area administration components and Edge Function | Implemented in source; verify all permission and edge cases |
| Reports | Typed ministry reports and review workspace/API | Present in source; verify role/scope coverage and report-type completeness |
| Prayer and care | Assigned-only Prayer Intercessor read workflow with audited access; restricted pastoral oversight remains separate | Assigned inbox API, database read/audit function and read-only UI are implemented in source. Intercessor request creation/assignment and care mutation remain disabled under the approved six-role defaults; authenticated role acceptance and hosted deployment are pending |
| Internal notifications | Private per-recipient inbox, read/unread operations and assignment/review triggers | Implemented in source with recipient/branch filters and no direct browser table access; hosted migration/function deployment and negative integration tests remain pending |
| Event flyers | Private bucket, scoped upload/preview/removal, signed URLs and image validation | Implemented in source. JPEG/PNG/WebP validation enforces a 5 MiB limit and bounded dimensions; cross-branch, cleanup/rollback and signed-URL-expiry tests remain release gates |
| Transport | Existing schema contains transport tables and event transport fields | Explicitly out of scope for this delivery; do not build UI or workflows |
| Error messages | Three separate error formatters expose inconsistent copy; network errors include low-level diagnostic details | Shared formatter added on this branch; further screen-by-screen audit remains |
| PWA | Static app-shell service worker, offline fallback, manifest metadata and original-crest vector icons | Implemented in source without caching staff data; raster PNG compatibility and installation-surface verification remain pending. Offline workflows remain disabled |
| Accessibility | Existing Radix dialogs, skip link, status/alert semantics | Good foundation; typography/touch-target audit still required |

## Delivery architecture

### 1. Internal notification centre

Use a database-backed, in-app notification inbox. It is independent of SMS, email, WhatsApp and browser push.

- Store one notification per recipient, with branch, category, short title/body, optional typed target reference, created/read timestamps and an idempotency key.
- Resolve recipients on the trusted server from current staff assignments; never accept a recipient user ID from the browser as authorization evidence.
- Keep notification rows inaccessible through direct browser table access. Use a dedicated Edge Function that verifies Supabase Auth, active staff profile, current branch assignment and recipient ownership for list/read operations.
- Support unread count, newest-first list, mark one read, mark all read, and safe navigation to an authorised target.
- Use bounded polling while the workspace is open, with manual refresh. This avoids introducing a new browser SDK dependency and does not expose sensitive row payloads through broad realtime channels. Realtime can be considered later if load measurements justify it.
- Generate notifications only for operational events with a clear recipient: follow-up task assignment/reassignment, contact assignment where permitted, event staff assignment, and report review/return. Do not put prayer/care narrative, contact phone/email, credentials or SMS contents into notification payloads.
- Make notification creation idempotent and non-blocking where possible; a notification failure must not roll back a successfully committed business action unless the workflow explicitly requires atomic notification delivery.
- Enforce retention by archival/read state only; do not invent an automatic purge period.

### 2. Event flyer upload

- Keep event drafts private. Flyers are private objects in a dedicated Supabase Storage bucket, not public URLs.
- Accept raster image formats suitable for event artwork (JPEG, PNG, WebP); reject SVG, HTML, PDF, executables and unknown types.
- Enforce a strict server-side byte limit (initial default: 5 MiB), MIME sniffing, image dimension limits, random object names and branch/event-scoped paths.
- Upload and signed-preview operations must go through a trusted Edge Function after verifying the caller's active staff profile, event.manage.scoped grant and branch scope. Do not expose the service-role key or allow browser-supplied object paths.
- Store only the storage object path and safe display metadata on the event record. Generate short-lived signed URLs for authorised staff previews.
- Replacing a flyer must be safe: upload new object, update event metadata, then remove the old object only after the metadata update succeeds. Never allow one branch to reference another branch's object.
- Add image preview, file name/size, replace/remove actions, keyboard-accessible upload control and actionable validation messages.
- Do not publish flyers publicly until a separately authorised event-publication workflow exists.

### 3. Event and ministry workflows

Build the intended non-transport event workflows as distinct, server-authorised operations:
- Event draft management and flyer attachment.
- Event-specific staff/team assignments.
- Registration controls and registration management.
- Attendance/check-in.
- Event closeout and review.

Do not enable public registration until privacy notice, lawful purpose/basis, minimum intake, abuse/rate limiting and canonical contact-link review are satisfied. Capacity reservation must be transactional and idempotent before any registration-open state is possible. Do not add a waitlist. Keep event publication/public projections separate from private drafts.

### 4. Remaining product modules

Reconcile each module against docs/00_MASTER_PRODUCT_SPECIFICATION.md, docs/01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md, docs/02_ROLES_PERMISSIONS_AND_SECURITY.md, docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md and the API contracts. Implement missing authorised workflows, not merely navigation labels. Prayer/care mutation, exports, SMS and offline remain disabled until their documented security and approval gates are met. Transport remains excluded by explicit owner instruction.

### 5. Cross-cutting quality

- Use one error formatter; never expose SQL, stack traces, proxy internals or provider diagnostics to staff. Show request references for traceable server failures.
- Use clear success confirmations that distinguish saved draft, published item, queued message and delivered message.
- Debounce contact search and support first name, last name and phone search through the server API.
- Replace the contact select with an accessible server-backed searchable combobox.
- Add overdue/today/upcoming task quick filters and stable overdue-first sorting.
- Provide per-row pending states and prevent duplicate task transitions.
- Add create-follow-up action in the contact detail context.
- Establish a readable type scale and 44px minimum touch targets where practical; 16px form input text on iOS.
- Consolidate dead/duplicated CSS only after visual regression coverage exists.
- Add PWA icons, manifest metadata, and a minimal static app-shell service worker. Cache no staff data, API responses, contact records, attendance or pastoral content. Offline workflows remain disabled.
- Update document title/theme metadata from the active theme and maintain semantic heading order.

## Release gates

1. Unit, integration and negative authorization tests for every new endpoint.
2. Migration replay from an empty local Supabase database and pgTAP RLS/role-scope checks.
3. Deno formatting/lint/type checks and frontend typecheck/lint/build/tests.
4. Storage tests for MIME spoofing, oversize files, cross-branch object access, replacement rollback and signed URL expiry.
5. Notification tests for recipient isolation, duplicate suppression, read state and branch changes.
6. Desktop/mobile browser walkthrough using seeded non-production staff accounts for all six roles.
7. Staging deployment and operational verification before production.
8. No hosted database migration, live SMS, Cloudflare migration or production deployment is performed as part of source-code changes unless separately authorised.

## Current branch progress

- Added a shared staff-facing error formatter with safe, consistent messages and request-reference handling.
- Replaced duplicated error formatters in App, Staff Workspace, Operations Workspace, Contact Detail, Team Administration and Ministry Reports.
- Added focused tests for authentication, network, permission, validation, upload and server errors.
- Expanded contact search to first name and last name, plus phone only for branch-wide identity readers; added 250 ms debounce.
- Added Follow-up Overdue / Today / Upcoming / In-progress quick filters, overdue-first ordering, per-task pending state and contact-detail follow-up creation.
- Added a static app-shell service worker and offline fallback. API routes and all staff/ministry data are excluded from caches; offline workflows remain disabled.
- Added manifest id/scope and synchronised browser theme metadata with the selected theme.
- Increased minimum field typography and touch targets in the workspace.
- Internal notification inbox and private event-flyer upload are implemented in source on this branch: database migration, recipient-isolated Edge Function, assignment/review notification triggers, private Storage bucket, signed previews and event-form upload/preview/remove controls. These changes have not been deployed to hosted Supabase.
- Staff event assignment, staff registration/cancellation, online check-in and closeout are implemented in PR #82 source. Public self-registration, Transport, offline check-in, publication outside separately authorised flows, restricted pastoral mutation and SMS remain disabled.


## 19 November implementation update

- Added migration `20261119160000_cmi_internal_notifications_event_flyers.sql` for private staff notifications, event flyer metadata, a private Storage bucket, and idempotent assignment/review notification triggers. The report-review trigger is installed conditionally because typed report tables are not present in every hosted environment.
- Added `staff-notifications` Edge Function source for authenticated inbox reads, unread count, individual read and mark-all-read, always filtered by authenticated recipient and currently assigned branch.
- Added `event-flyers` Edge Function source for role/scope-checked private upload, signed preview and removal. MIME signatures and size are validated server-side; objects use random branch/event-scoped paths.
- Added Staff Workspace notification centre with unread badge, minute polling while visible, read states and capability-safe navigation.
- Added event form flyer selection, image preview, replacement and removal.
- Transport assignment notifications are excluded. SMS/Arkesel, Cloudflare migration and existing screen loader remain untouched.
- Source changes only: no hosted migration or function deployment, no production release.
- Remaining: authenticated negative integration tests for notifications/flyers/event endpoints; typed-report migration reconciliation against hosted history; six-role desktop/mobile acceptance with provisioned non-production identities; raster PWA compatibility checks; and separately authorised staging/release verification.


## 19 November final-review update

- Added the staff notification inbox and private event flyer upload/preview/remove flows, with source-only database migration and authenticated Edge Functions.
- Added event flyer signature/size/dimension validation and Deno tests; backend CI now type-checks both new Edge Functions.
- Replaced the task form's loaded-contact <select> with a debounced server-search combobox (first/last name and only permission-visible phone search). Task creation no longer depends on the first 50 contacts being preloaded.
- Hid connection diagnostics unless ?debug=1 is present or the login is already in an error state; added live password-strength checks.
- Removed raw internal contact UUIDs from the staff contact table.
- Removed unused prototype demo-ribbon, role-preview and mobile-tabbar selectors.
- Consolidated the desktop login, UI refresh, visual-system and login-brand stylesheets into web/production.css, preserving their original cascade order; main.tsx now imports only the base and consolidated stylesheets.
- Added original-crest 192px vector and padded maskable 512px vector PWA icons; the service worker precaches the manifest and both icons. Raster PNG variants remain a separate compatibility follow-up.
- Added a visually-hidden level-two heading to establish the staff workspace heading hierarchy.
- No hosted Supabase migration or Edge Function deployment has been performed. No production deployment or merge.
- Transport remains excluded; Arkesel SMS remains deferred; the screen loader is unchanged; Cloudflare migration remains cancelled.
- Remaining release gates: authenticated negative authorization/integration tests for notifications, flyers and event operations; reconcile typed-report migration history with the intended hosted environment; complete six-role desktop/mobile acceptance; verify raster PWA install assets; and obtain separate staging/production approval. The event lifecycle is implemented in source and remains undeployed.

- The notification centre clears prior-branch rows immediately on workspace changes and ignores stale in-flight responses, preventing notifications from a previously selected branch from appearing in the new workspace.


## Owner clarification — 19 November 2026

The product owner has reaffirmed that all product-specification workflows are in scope except Transport. Therefore, the following are **required**, not optional future scope:

- Event-specific staff and team assignment management, including assignment roles, start/end dates, revocation and assignment-scoped visibility.
- Registration enable/disable and staff registration management; public registration only after its privacy, abuse-prevention, capacity and authorization gates pass.
- Event attendee check-in with event/branch scope enforcement and duplicate-safe check-in.
- Event closeout, attendance reconciliation and authorised event reporting.
- Complete typed ministry report schema reconciliation and review lifecycle.
- Prayer-request workflow for the Prayer Intercessor, limited to individually assigned requests; privileged oversight remains reason-coded and audited. No broad contact/CRM access is implied.
- Complete remaining authorised content, announcement, team, service-area and staff-access workflows against the master specification.

Transport remains explicitly excluded, including transport reservation UI, assignment roles, notifications and API operations. SMS/Arkesel remains deferred. The existing screen loader and current Supabase/Vercel architecture remain unchanged; no Cloudflare migration work is authorised.

## Additional release correction

The notification, flyer and event Edge Functions now always include the canonical production origin `https://pcg-missions.vercel.app` in their CORS allow-list, while preserving explicitly configured preview/development origins. This prevents a configured `CMI_ALLOWED_ORIGINS` value from accidentally excluding the production application.


## Current-head verification update — 19 November 2026

Commit `2a0bb538f0cc0d29dbd937ad33e1445956b03336` has completed all three GitHub Actions workflows successfully:

- CMI backend CI run [44568887402](https://github.com/Elgit4/PCG_Missions/actions/runs/44568887402): passed, including local migration replay and the CMI pgTAP database suite.
- CMI web CI run [44568887547](https://github.com/Elgit4/PCG_Missions/actions/runs/44568887547): passed.
- CMI frontend CI run [44568887511](https://github.com/Elgit4/PCG_Missions/actions/runs/44568887511): passed.

The Vercel check still reports an account-level build-rate-limit failure. A new Vercel preview for this commit is not confirmed.

## Verified hosted-environment blockers

Read-only inspection of the linked production Supabase project confirms:
- Hosted migration history currently ends at `20261112220204`; the new `20261119160000` notification/flyer migration is not applied.
- `public.staff_notification` does not exist.
- The hosted `public.event` table does not yet contain `flyer_object_path`.
- The private `event-flyers` Storage bucket does not exist.
- The new `staff-notifications` and `event-flyers` Edge Functions are not deployed.

Therefore the notification centre and flyer UI in this branch are source implementations only, not live features. Do not enable them in production until the migration, functions, and authenticated authorization tests are complete.

## Remaining implementation and release gates

1. Complete negative server-side integration/authorization tests for notifications, event flyers and event operations: cross-branch access, non-recipient notification reads/updates, capability separation, duplicate suppression, check-in replay, concurrent capacity, flyer signature spoofing, replacement rollback, removal cleanup and signed-URL expiry.
2. Reconcile typed ministry-report migrations and hosted migration history; verify report author/reviewer scope for all permitted roles. The schema, report API and review/resubmission workspace exist in source and pass the isolated local migration/pgTAP suite.
3. Verify the assigned-only Prayer Intercessor workflow against the six-role model using authenticated test identities. The inbox API and UI are read-only; no request creation, assignment management, linked contact identity or broad CRM access is granted to Intercessors.
4. Reconcile remaining master-spec modules (announcements publication/receipts, public content, team/service-area administration and staff access) against the current hosted schema and actual capabilities.
5. Add raster 192px/512px PWA icons if required by the target install surfaces and complete installation checks. Keep offline staff data/workflows disabled.
6. Obtain provisioned, owner-authorised non-production identities for all six roles and complete authenticated desktop/mobile acceptance. Do not fabricate staff identities or bypass first-admin bootstrap.
7. Only after those gates pass, apply reviewed migrations to the intended environment, deploy the approved Edge Functions, verify live APIs and request separate staging/production release approval. No hosted migration, function deployment or production release is authorised by this PR.

The production app, hosted database, deployed Edge Functions, current screen loader, SMS/Arkesel configuration and existing Supabase/Vercel architecture remain unchanged. Transport remains excluded; Cloudflare migration remains cancelled.


## Hosted event/prayer schema inspection — 19 November 2026

A read-only inspection of the linked hosted Supabase schema confirms that foundational tables already exist for:
- Events, staff/team event assignments, registrations, check-ins and closeout.
- Prayer requests, prayer assignments and prayer access audit.

The hosted schema also contains an identity-consistency trigger for event check-ins and a protected prayer read RPC. This means the next implementation phase should reuse and verify these existing structures rather than creating parallel tables.

However, the currently deployed `event-operations` Edge Function is version 14 and its source in the proposed PR only implements private-draft event list/create/update. It does not yet expose staff/team assignment management, registration administration, check-in or closeout endpoints. The prayer read RPC exists, but no complete Prayer Intercessor workspace/API workflow has been verified. Existing tables alone do not mean these workflows are available to staff.

Do not add duplicate event/prayer tables. Build the missing server operations and UI against the existing schema after inspecting its constraints, policies, grants and audit triggers. Keep transport-related columns and historical data intact, but do not expose or implement transport features.




## Current continuation status — 19 November 2026

- Implementation branch: `feat/cmi-pcg-missions-final-review-v6`, PR #82.
- Event staff/team assignments, staff-only registration and cancellation, online check-in, and independent event closeout are implemented in source. Public registration, Transport and offline check-in remain disabled.
- The private notification inbox and private event flyer upload/preview/removal flows are implemented in source. Flyer validation applies signature, file-size and dimension checks to JPEG, PNG and WebP.
- Typed ministry reports/review and the assigned-only Prayer Intercessor read workflow are present in source; the latter remains read-only and discloses no linked contact identity.
- Read GitHub Actions results from the PR's current head before declaring a check passed. A Vercel account-level deployment-rate limit has prevented a fresh preview; no preview is certified.
- All changes remain source-only. No hosted Supabase migrations/functions, production merge or deployment have been performed. SMS/Arkesel is deferred, Cloudflare migration remains cancelled, and the existing screen loader is unchanged.
- Release is still gated on authenticated negative integration tests, intended-environment migration reconciliation, provisioned six-role desktop/mobile acceptance, and separate staging/production approval.

## PR #82 implementation continuation — 19 November 2026

The current PR branch adds the following source implementations against the existing schema:

- Event staff and team assignment list/create/revoke operations. Assignment dates are constrained to the event window; staff membership must cover the full assignment window; transport assignment roles are rejected. Revocation retains history, and notification triggers only consider currently eligible assignments.
- Staff-only event registration with finite capacity, an Admin/Pastor branch-scoped capability, an atomic event-row lock, HMAC-backed idempotency receipt, same-payload replay, changed-payload conflict and capacity enforcement. No public self-registration or automatic contact creation is enabled.
- Staff registration cancellation with an atomic receipt, duplicate-safe replay, a check-in guard and capacity release. A checked-in attendee cannot be cancelled.
- Admin/Pastor branch-scoped check-in of active registrations. The RPC rechecks the capability, locks the event and registration, writes a single staff check-in and HMAC receipt atomically, and rejects a second independent check-in. The registration list now displays check-in state and exposes a check-in action. Offline mode remains disabled.
- Event closeout and reconciliation: ended events snapshot non-cancelled registrations and check-ins, set the event completed, and record an idempotent submission. A different authorised Admin/Pastor must approve or return it; self-review is rejected and submitted/reviewed history is append-only. Transport seat counts remain null.
- Flyer validation now rejects malformed JPEG/PNG/WebP headers and enforces 12,000-pixel per-axis and 40-megapixel limits in addition to the 5 MiB upload limit.
- An assigned-only Prayer Intercessor inbox. The Edge Function validates the staff session and bounded pagination; the database function re-checks the active branch capability and active prayer assignment, returns an allowlisted narrative projection without contact identity, and inserts audit rows for disclosed narratives. The UI is read-only and only appears when the assigned-read capability is present.

These changes are committed to the PR branch only. They have not been applied to hosted Supabase or deployed to Vercel. Current-head CI, isolated migration/pgTAP replay and full authenticated acceptance must pass before considering the workflows release-ready. Public self-registration, Transport, SMS/Arkesel and Cloudflare remain out of scope or deferred under the owner-directed decisions.

## Live login recovery and current status — 19 November 2026, 21:50 UTC

The live login issue was traced to authorization state, not an invalid password or unavailable Supabase Auth service:

- Supabase Auth had accepted the configured first-admin account's password, and the staff-session endpoint had returned HTTP 200. However, the associated active staff profile had no row in `public.staff_role_assignment`. The staff-session projection therefore contained no active branch, and the frontend correctly stopped with `NO_ACTIVE_BRANCH`.
- The role catalogue and Admin/Pastor branch capability grants were present. The database had one configured church and one active branch.
- A narrowly scoped data-only transaction restored the configured first-admin account's `admin_pastor` assignment in the existing active branch and inserted the corresponding `staff_access_audit` row with action `role_assigned`. The transaction verified the matching confirmed Auth identity, active staff profile, configured church, single active branch and globally empty role-assignment table before writing.
- Verification now shows the first-admin profile is active, the branch is active, the assignment is effective, and 27 enabled capabilities are available, including the four staff/role-management controls. No credentials or other staff profile were changed. The second staff profile remains without a role assignment and was deliberately left unchanged.

This supersedes the earlier "no production data changed" statements in this document: one production role-assignment row and its audit row were added as an operational login repair. No schema migration, Edge Function deployment, production frontend deployment or PR merge was performed.

At PR head `b41a82b175cbc07de7ead2dbfedaa01665808f72`, CMI backend CI (isolated migration replay and pgTAP), CMI web CI and CMI frontend CI have all completed successfully. A current-head Vercel preview remains unconfirmed. The PR remains open and Draft; release gates and the separate production-approval requirement are unchanged.

The browser-side acceptance step is to refresh PCG Missions and retry sign-in with the existing account. The password was not reset or changed as part of this repair.


## Verified PR and hosted-environment status — 19 November 2026, 21:56 UTC

This section supersedes earlier same-day notes that the current preview was unconfirmed or that current-head CI was still running.

- **PR:** #82 remains open and Draft on `feat/cmi-pcg-missions-final-review-v6`, head `af40ac88a37ee813d686b0099079e31cdd8ae6f8`. It has no submitted review or inline review threads at the time of this check.
- **CI:** CMI backend CI, CMI web CI and CMI frontend CI all completed successfully on this exact head. The backend workflow applied the isolated CMI migration set and completed the pgTAP test step successfully. This proves the branch's isolated tests pass; it does not prove the hosted project has been migrated or that the live six-role flows have passed acceptance.
- **Preview:** Vercel preview deployment `dpl_8DVnTCoQyyWTQYnSfEjqaWkWbJ2y` is READY for this exact head at https://pcg-missions-oxllfh1ft-eltech.vercel.app. The current production deployment remains READY on `main` at `b83d1feb44fe5cca1e2ddc7d8026a7126a10d385`; PR #82 is not in production. The preview build emits a Vite warning because the main JavaScript chunk is about 506.75 kB (146.52 kB gzip).
- **Hosted Supabase:** the migration ledger contains 17 versions through `20261112220204`. The PR's seven migrations dated 19 November are not applied. The deployed `event-operations` function remains version 14; `staff-notifications` and `event-flyers` are absent from the deployed function list. The PR's notification/flyer/event-operation source is therefore not live.
- **Login:** the product owner confirmed the first Admin/Pastor account now signs in after the guarded role-assignment and audit-row repair. The repair was data-only; it did not deploy the PR or modify the other staff profile.
- **Security review:** Supabase reports leaked-password protection disabled, 52 informational RLS-enabled/no-policy findings, and the private bootstrap-lease table without RLS. The private schema/table privilege check previously confirmed no anon/authenticated schema usage or SELECT on that table. No RLS or Auth setting was altered as part of this review.

### Remaining gates

1. Complete authenticated desktop/mobile acceptance using owner-authorised non-production identities for all six roles; do not fabricate identities or grant the second staff profile a role without the owner's direction.
2. Complete negative hosted/integration authorization checks for cross-branch access, non-recipient notification reads/updates, flyer ownership/signature validation, cleanup/rollback, signed-URL expiry, event capacity/replay/check-in and independent closeout review.
3. Reconcile the report schema and all seven PR migrations against the intended hosted environment before rollout. Deploy the paired Edge Functions only after migration and security review.
4. Verify server-side idempotency secrets for contact/follow-up creation and the production email sender/domain before real intake and invitation/recovery acceptance. Never disclose or store secret values in repository documentation.
5. Review the leaked-password protection and bootstrap-lease RLS advisories. These settings remain unchanged pending a deliberate security decision; do not add broad RLS policies merely to silence informational lints.
6. Finish PWA install-surface checks and decide whether to split the main JavaScript bundle to clear the Vite chunk warning.
7. Complete privacy/controller readiness, backup/restore rehearsal, monitoring and separately authorised staging/production approval before release.

No migration, Edge Function deployment, production merge or production frontend release was performed in this continuation. SMS/Arkesel, Cloudflare migration, Transport and offline staff workflows remain unchanged or excluded; the existing screen loader remains untouched.


## Verified continuation checkpoint — 20 November 2026, 08:10 UTC

This checkpoint supersedes earlier head, preview and pending-CI notes above.

### Current PR verification

- PR #82 remains open and Draft on `feat/cmi-pcg-missions-final-review-v6`, exact head `c46c3a57e3ba411fcbd73897eb6145786ebb1b8c`.
- CMI backend CI run `44700059491`, CMI web CI run `44700059447` and CMI frontend CI run `44700059495` all completed successfully on this commit.
- The backend workflow passed Deno formatting/lint, Edge Function type checks, validation/access tests, isolated Supabase stack startup, migration replay, pgTAP and stack shutdown.
- Vercel preview deployment `dpl_EZmk91DXmEQjNTqV73LVzjtEwidq` is READY for this exact commit at https://pcg-missions-gritteoxo-eltech.vercel.app. It is a preview only; production remains on `main` at `b83d1feb44fe5cca1e2ddc7d8026a7126a10d385`.

### Flyer access and concurrency hardening

- Staff-scoped flyer authorization now accepts only `owner`, `organizer`, `checkin` and `support`.
- Team-scoped flyer authorization now accepts only `organizer`, `ushering` and `support`.
- Transport and unknown role strings are denied by default. The staff and team allowlists are separate so a role valid for one assignment type is not implicitly valid for the other.
- Flyer replacement and removal compare the event's flyer object path with the value read before the operation. If another staff member changes the flyer first, the stale operation returns HTTP 409 rather than overwriting/deleting the newer object.
- Replacement signs the new preview and commits new metadata before cleaning up the previous object. Signing/metadata failure rolls back only the new upload. A stale replacement therefore leaves the currently attached flyer intact.
- Added Deno tests for exact staff/team role allowlists, unknown/Transport denial and stale concurrent replacement rollback. Existing tests cover the 15-minute preview duration, signing/metadata failure rollback and cleanup failures.
- These are CI-verified helper/operation tests. Authenticated endpoint-level tests against the intended hosted service are still required for cross-user/cross-branch reads, signature spoofing, expiry and provider/storage edge cases.

### Remaining delivery gates

1. Add authenticated endpoint-level negative integration tests for notifications, cross-branch event access, capacity concurrency/replay, duplicate check-in, closeout self-review, and flyer upload/signature/spoofing/expiry/cleanup behavior. Do not claim helper tests are equivalent to hosted endpoint acceptance.
2. Reconcile and plan deployment of the three source-controlled Ministry Report migrations and the seven PR #82 migrations against the intended hosted Supabase environment. Do not apply them until reviewed and separately authorised.
3. Complete desktop/mobile authenticated acceptance with owner-authorised non-production identities for all six roles. Do not fabricate identities or alter the second production staff profile.
4. Verify PWA installation surfaces; current manifest uses SVG icons, so raster compatibility remains a target-platform follow-up.
5. Review leaked-password protection and the private bootstrap-lease RLS advisory deliberately; no automatic setting or broad policy changes have been made.
6. Verify server-side idempotency secrets and the production email sender/domain without writing secret values to repository documentation.
7. Complete privacy/controller readiness, backup/restore rehearsal, monitoring, staging acceptance and separately authorised production approval.

### Hosted and production boundary

Hosted Supabase still records 17 migrations through `20261112220204`. It is missing the three Ministry Report migrations (`20261113090000`, `20261113100000`, `20261113110000`) and all seven PR #82 migrations. The hosted `report-operations`, `staff-notifications` and `event-flyers` functions are not deployed; `event-operations` remains version 14.

No PR merge, hosted migration, Edge Function deployment or production frontend release was performed in this continuation. The first-admin role-assignment plus audit-row repair remains the only recorded live production-data change. SMS/Arkesel stays deferred, Cloudflare migration stays cancelled, Transport and offline staff workflows remain excluded, and the existing crest loader remains unchanged.


## 20 November continuation — event workspace consistency

- Added request-version guards to event assignment, registration and closeout panels. Responses from an earlier event/branch context are ignored, and prior workspace data is cleared when the context changes.
- Added a Vitest regression contract covering stale-response rejection, unmount/context invalidation and loading-state ownership for all three panels.
- Hardened notification mark-read and mark-all actions against branch changes while requests are in flight; the active branch scope is synchronized before paint, and stale mutation results cannot alter the new branch inbox.
- Routed 401 responses from event flyer removal and staff-registration open/close actions through the shared session-expiry handler; added a regression test for those mutation paths.
- Removed branch names from staff-facing breadcrumbs, dashboard and workspace descriptions while retaining branch IDs, role grants and server-side branch scoping internally. Added a UI regression test.
- These changes are source-only and require the updated frontend CI run before they can be marked verified.
