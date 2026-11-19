# PCG Missions — Remaining Product Work and Delivery Plan

**Date:** 19 November 2026  
**Baseline:** main at b83d1feb44fe5cca1e2ddc7d8026a7126a10d385  
**Implementation branch:** feat/pcg-missions-complete-workflows

## Product-owner direction

Complete the product workflows defined by the CMI v2.1 requirements except transport. Add an in-app internal notification centre and event flyer upload. SMS/Arkesel remains deferred. Do not change the existing screen loader. Do not restart the Cloudflare migration.

## Verified repository findings

This is a source audit, not a browser or deployment certification.

| Area | Current source evidence | Assessment |
|---|---|---|
| Staff authentication | Supabase Auth email/password, temporary-password gate, reset workflow | Present in source; hosted email delivery and end-to-end auth still require operational verification |
| Contacts | Capture, scoped listing, details, notes/interactions, follow-up task creation | Partially complete; contact search is first-name-oriented and task creation relies on currently loaded contacts |
| Follow-up | Task listing, status filtering, start/complete actions, pagination | Partially complete; overdue/today quick views, server-backed contact picker, per-action pending state and contact-context task creation need completion |
| Events | Private draft create/list/update only | Incomplete; no flyer upload; registration, attendance/check-in, assignment and closeout are not in the staff workspace |
| Calendar | Branch-scoped create/list/update | Present for the approved private branch workflow |
| Announcements | Private draft create/list/update | Present; publication/delivery remain separately gated |
| Visitor content | Sermon and welcome-message private drafts | Present; publication and public-site administration need their authorised workflows |
| Teams and service areas | Team/area administration components and Edge Function | Implemented in source; verify all permission and edge cases |
| Reports | Typed ministry reports and review workspace/API | Present in source; verify role/scope coverage and report-type completeness |
| Prayer and care | Restricted read operations only | Intentionally incomplete under the current six-role grant baseline; mutation/assignment cannot be exposed without the matching grants and audited server workflows |
| Internal notifications | No notification centre or notification API in the current web source tree | Missing |
| Event flyers | No flyer metadata or upload flow in current event draft API/UI | Missing |
| Transport | Existing schema contains transport tables and event transport fields | Explicitly out of scope for this delivery; do not build UI or workflows |
| Error messages | Three separate error formatters expose inconsistent copy; network errors include low-level diagnostic details | Shared formatter added on this branch; further screen-by-screen audit remains |
| PWA | Manifest has only an SVG icon; no service worker in web source tree | Incomplete; offline data must remain disabled |
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
- Public registration, attendance/check-in, event assignment/closeout, publication, and restricted pastoral mutations remain separate implementation tracks with their documented security gates.


## 19 November implementation update

- Added migration `20261119160000_cmi_internal_notifications_event_flyers.sql` for private staff notifications, event flyer metadata, a private Storage bucket, and idempotent assignment/review notification triggers. The report-review trigger is installed conditionally because typed report tables are not present in every hosted environment.
- Added `staff-notifications` Edge Function source for authenticated inbox reads, unread count, individual read and mark-all-read, always filtered by authenticated recipient and currently assigned branch.
- Added `event-flyers` Edge Function source for role/scope-checked private upload, signed preview and removal. MIME signatures and size are validated server-side; objects use random branch/event-scoped paths.
- Added Staff Workspace notification centre with unread badge, minute polling while visible, read states and capability-safe navigation.
- Added event form flyer selection, image preview, replacement and removal.
- Transport assignment notifications are excluded. SMS/Arkesel, Cloudflare migration and existing screen loader remain untouched.
- Source changes only: no hosted migration or function deployment, no production release.
- Remaining: event assignment/registration/check-in/closeout workflows, report schema reconciliation, PWA icon assets, focused tests, current-head CI and browser/role acceptance.


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
- Remaining release gates: complete non-transport event registration/check-in/closeout workflows, reconcile typed ministry report migration history, add Edge Function authorization integration tests, confirm current-head migration replay and perform authenticated role-based browser acceptance.

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

1. Complete the event lifecycle. The PR branch now contains branch-scoped staff/team assignment listing, creation and revocation, including role allowlists, active-membership checks, event-window bounds, history retention and notification timing. Registration administration, check-in/duplicate-safe attendance, closeout and attendance reconciliation remain incomplete. The assignment work is source-only until current-head CI, authenticated integration tests and deployment gates pass.
2. Add server-side negative integration tests for notifications and flyers: cross-branch access, non-recipient notification reads/updates, assignment changes, duplicate suppression, invalid/mismatched image signatures, replacement rollback, removal cleanup and signed URL expiry.
3. Reconcile typed ministry report migrations against the authoritative migration history and verify report author/reviewer authorization end to end.
4. The PR branch now contains an assigned-only Prayer Intercessor inbox API, an audited database listing function, bounded pagination and a read-only UI that omits contact/creator identity. Verify its current-head migration replay, pgTAP suite, API validation and authenticated role behavior; do not treat it as live because the migration and Edge Function are not deployed.
5. Reconcile remaining master-spec modules (announcements publication/receipts, public content, team/service-area administration and staff access) against current hosted schema and actual capabilities.
6. Add raster 192px/512px PWA icons and verify installation surfaces.
7. Obtain provisioned, owner-authorised test identities for all six roles and complete authenticated desktop/mobile acceptance. Do not fabricate staff identities or bypass the first-admin bootstrap.
8. Only after the above pass, apply the reviewed migration to the intended environment, deploy the two new functions, verify the live API, and request a separate production release approval.

The production app, hosted database, deployed Edge Functions, current screen loader, SMS/Arkesel configuration and existing Supabase/Vercel architecture remain unchanged. Transport remains excluded; Cloudflare migration remains cancelled.


## Hosted event/prayer schema inspection — 19 November 2026

A read-only inspection of the linked hosted Supabase schema confirms that foundational tables already exist for:
- Events, staff/team event assignments, registrations, check-ins and closeout.
- Prayer requests, prayer assignments and prayer access audit.

The hosted schema also contains an identity-consistency trigger for event check-ins and a protected prayer read RPC. This means the next implementation phase should reuse and verify these existing structures rather than creating parallel tables.

However, the currently deployed `event-operations` Edge Function is version 14 and its source in the proposed PR only implements private-draft event list/create/update. It does not yet expose staff/team assignment management, registration administration, check-in or closeout endpoints. The prayer read RPC exists, but no complete Prayer Intercessor workspace/API workflow has been verified. Existing tables alone do not mean these workflows are available to staff.

Do not add duplicate event/prayer tables. Build the missing server operations and UI against the existing schema after inspecting its constraints, policies, grants and audit triggers. Keep transport-related columns and historical data intact, but do not expose or implement transport features.


## PR #82 implementation continuation — 19 November 2026

The current PR branch adds the following source implementations against the existing schema:

- Event staff and team assignment list/create/revoke operations. Assignment dates are constrained to the event window; staff membership must cover the full assignment window; transport assignment roles are rejected. Revocation retains history, and notification triggers only consider currently eligible assignments.
- Staff-only event registration with finite capacity, an Admin/Pastor branch-scoped capability, an atomic event-row lock, HMAC-backed idempotency receipt, same-payload replay, changed-payload conflict and capacity enforcement. No public self-registration or automatic contact creation is enabled.
- Staff registration cancellation with an atomic receipt, duplicate-safe replay, a check-in guard and capacity release. A checked-in attendee cannot be cancelled.
- Admin/Pastor branch-scoped check-in of active registrations. The RPC rechecks the capability, locks the event and registration, writes a single staff check-in and HMAC receipt atomically, and rejects a second independent check-in. The registration list now displays check-in state and exposes a check-in action. Offline mode remains disabled.
- An assigned-only Prayer Intercessor inbox. The Edge Function validates the staff session and bounded pagination; the database function re-checks the active branch capability and active prayer assignment, returns an allowlisted narrative projection without contact identity, and inserts audit rows for disclosed narratives. The UI is read-only and only appears when the assigned-read capability is present.

These changes are committed to the PR branch only. They have not been applied to hosted Supabase or deployed to Vercel. Current-head CI, isolated migration/pgTAP replay and full authenticated acceptance must pass before considering the workflows release-ready. Public self-registration, Transport, SMS/Arkesel and Cloudflare remain out of scope or deferred under the owner-directed decisions.
