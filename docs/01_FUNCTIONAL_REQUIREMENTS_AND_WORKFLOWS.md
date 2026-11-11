# CMI Follow-up — Functional Requirements & Workflows

**Version:** 2.1 | **Status:** Consolidated functional baseline | **Parent:** [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md)

This document groups requirements by the work users perform. It defines expected behaviour, not implementation status.

## 1. Staff access and workspace
- Staff sign in using their registered email address and password through Supabase Auth. Initial onboarding/reset uses a random, short-lived temporary password; first login requires the staff member to set a private permanent password.
- Staff see only modules, actions and records authorized for their effective roles and assignments.
- A user may hold multiple roles; permissions combine without widening record scope beyond church, team, event or assignment boundaries.
- Shared-device sign-out and password confidentiality are mandatory operating practices.

## 2. Contacts and field capture
- Create a contact from Contacts or an event workspace.
- Keep mandatory fields minimal for fast field capture; allow details to be completed later.
- Capture source, area, age range and other configured values using controlled pickers.
- Support contact notes, assignment and chronological follow-up history.
- Detect possible duplicates and allow authorized merging from the record actions menu.
- A merge must preserve the surviving contact's relevant history and record the merge action for audit/recovery.

**Acceptance:** A permitted worker can capture a contact on a phone, save it online or queue it offline, find it later within scope, and review its history.

## 3. Offline field capture
Offline capture is specified as a future capability but is **disabled for the initial production release** until encrypted local storage, device/session binding, expiry, sign-out recovery and conflict handling pass security tests. When enabled, scope is intentionally narrow:
- queued field capture form;
- cached capture pickers;
- previously opened event check-in data.

When enabled, queued captures sync when connection returns. Provide visible pending/syncing/synced/failed states. Use stable local identifiers and idempotent server writes to prevent duplicate contacts during retry. Do not provide offline access to the full application, general contact directory, prayer/care records, reports or public content. Offline mode remains unavailable until the approved security gate passes.

**Acceptance:** A queued record survives app restart and intermittent connectivity, syncs once when possible, and surfaces a recoverable error when it cannot sync.

## 4. Follow-up lists and items
- Create lists from Contacts or Follow-up.
- Assign lists/items to permitted team members; assignees see them under their work.
- Items may have scheduled date, priority and notes.
- Complete items after contact has been made.
- Keep overdue items visible until completed, cleared or reassigned by an authorized user.
- Preserve ownership and completion history.

**Acceptance:** Assignees can identify due/overdue work, record completion and see the updated status without creating duplicate records.

## 5. Prayer and pastoral care
- Create a prayer request from Prayer or a linked contact.
- Allow an optional expiry date.
- Assign a request to a prayer intercessor; the intercessor sees only requests assigned to them.
- Unassigned requests are visible only to authorized review roles.
- Authorized users can update, mark answered or remove a request.
- Treat prayer details and care notes as sensitive pastoral data.

**Acceptance:** A user without the appropriate prayer scope cannot discover or retrieve another intercessor's request through UI, API, search, export or direct record identifiers.

## 6. Care workspace
- Maintain care contacts and groups.
- Provide summaries for people requiring attention within the user's permissions.
- Support permitted follow-up calls and visits.
- Record outcome and update the existing contact/care status rather than creating duplicate contacts.

## 7. Events, public registration and transport
- Authorized staff create events with date, location and capacity.
- Registration may be enabled or disabled per event.
- Transport reservations may optionally be enabled as part of registration.
- Visitors register through the public event page only when registration is enabled.
- Staff record attendance through event check-in.
- Event workspaces support assigned follow-up, event-specific team assignments and event closeout.
- Public event links and QR codes are shareable.
- Event-scoped staff access must not expose unrelated event records.

**Acceptance:** Registration-disabled events do not accept public registrations; registration-enabled events respect configured capacity and transport options; check-in records are associated with the correct event and attendee.

## 8. Calendar
- Display church services, events, scheduled follow-up and prayer follow-ups.
- Authorized users can create/update service calendar entries with service and location details.
- Calendar scheduling respects team and assignment scope.

## 9. Announcements and SMS communications

### Announcements
- Authorized staff can create announcements for church, team or event audiences within their permitted scope.
- Audience membership, publication and delivery actions are permission-controlled and revalidated when the announcement is sent or published.
- Display delivery state only for channels that are actually configured; announcement creation is not proof of delivery.
- Contact communication actions must respect the recipient's preferences and the sender's access scope.

### 9.1 Manual one-to-one SMS
- Authorized staff may compose an individual SMS only after the provider, lawful basis/consent, opt-out, sender identity, role capability and cost controls are approved and enabled. The feature is disabled by default.
- Show the destination number, message preview and any available segment/cost estimate before send.
- Respect contact scope, consent, opt-out/suppression status and configured sending limits.
- Record the sender, recipient reference, timestamp, message status and provider reference.

### 9.2 Bulk SMS campaigns
- Authorized users may create scoped campaign drafts after provider and policy setup. Dispatch remains disabled by default; creator and approver must be different active users.
- Revalidate audience membership and consent at send time; exclude opted-out, invalid and suppressed numbers.
- Show recipient count, message preview, segment estimate and provider cost estimate where available.
- Require explicit final confirmation; record campaign creator, approver (if required), audience criteria, template/content version and send outcome.
- Support queued, scheduled, sending, partially sent, completed, paused, cancelled and failed campaign states. Provide safe retry without duplicate delivery.

### 9.3 Automated SMS
- The automated trigger catalogue starts empty and all rules are disabled. A trigger may be enabled only after its recipient class, lawful purpose, template, timing, caps and idempotency are approved.
- Every automation rule must declare its recipient class (visitor/contact/staff assignee), trigger source, eligibility conditions and timing. A follow-up reminder must identify whether it targets the assigned staff member or the contact; do not infer the recipient.
- Each trigger has an approved template, enable/disable control, timing rule, recipient eligibility check and audit trail.
- Do not enable triggers by default until the church approves the wording, timing, audience and provider configuration.
- Prevent duplicate messages using idempotency keys; retry transient provider failures with bounded backoff.
- Allow authorized administrators to pause automation and inspect failed sends.

### 9.4 Shared requirements
- Integrate with an SMS provider from trusted server-side code; never expose provider credentials in the client.
- Track queued, submitted, delivered, failed and undeliverable statuses separately; provider acceptance is not proof of delivery.
- Store consent source/time and opt-out/suppression state. Process opt-outs and block future non-essential messages.
- Keep SMS content minimal. Never include prayer request details, pastoral notes, confidential care narratives, credentials or other secrets.
- Apply role, contact, team and event scope checks at send time. Audit manual sends, campaigns, automation changes and privileged retries.
- Support sender identity, message segments, rate limits, provider cost visibility and Ghana-specific sender-ID/regulatory setup after verification.
- WhatsApp links remain user-initiated; WhatsApp automation is not included.

**Acceptance:** Unauthorized users cannot send or broaden audiences; opted-out contacts are excluded; campaigns require confirmation; automated triggers send only when enabled; retries do not duplicate messages; delivery outcomes and failures are visible to authorized staff.

## 10. Sermons and daily words
- Create drafts with title, content and applicable date.
- Drafts remain private until an authorized administrator publishes them.
- Authorized staff can publish or hide content from visitor-content administration.
- Published items are visible on the public church site; unpublished drafts are not public.

## 11. Public visitor site and digital tracts
- Public site is separate from staff workspace and requires no staff sign-in.
- Display configured church profile, visitor description, upcoming active events, welcome messages, published sermons/daily words, digital tracts and configured contact/social links.
- Event pages link to registration and configured transport reservation.
- Authorized staff manage visitor-facing profile, WhatsApp contact and social links.
- Digital tracts are mobile-friendly public content with shareable links and QR codes.
- Optional PDF references point to existing public HTTPS files. PDF hosting is not provided.

**Acceptance:** Anonymous visitors can access only published/public content and enabled registration routes; staff drafts, contacts, prayer requests and reports remain private.

## 12. Reports
- Support daily evangelism, event evangelism and weekly ministry reports.
- Depending on permission, users can submit, review, approve or return reports for changes.
- Provide scoped report views and event report/closeout for attendance and operations.
- Exports, where provided, obey the same scope as the report view.

## 13. Team administration and church settings
- Team page lists active and inactive members.
- Authorized administrators add members, assign roles and area coverage, edit access and deactivate accounts.
- Event workspace supports event-specific team assignments and event roles.
- Administrators maintain church profile, service areas, visitor-facing content and other configured settings.

## 14. Explicitly held / unavailable functionality
Do not implement or market as currently available without a separately approved change:
- WhatsApp automation;
- discipleship lesson paths;
- disengagement/retention alerts;
- territory or response maps;
- testimonies/milestones feeds;
- printed-tract inventory;
- seeker-facing AI, interactive gospel journey, anonymous Q&A and feedback surveys;
- multi-church network administration;
- full offline mode.

## 15. Cross-cutting acceptance tests
1. Multi-role user sees combined authorized modules, but not records outside scope.
2. Unauthorized direct API access is denied even if the user knows a record identifier.
3. Prayer assignment isolation is enforced in database/API, not only UI.
4. Event roles are event-scoped.
5. Public visitor routes cannot retrieve staff-only or unpublished content.
6. Offline retries do not duplicate records.
7. Contact merge preserves history and is auditable.
8. SMS manual, bulk and automated flows enforce consent, scope, opt-out, approval, idempotency and delivery tracking; WhatsApp automation is not enabled.
9. Reports and exports apply the same authorization rules.
10. Every workflow has loading, empty, validation, failure and success states.
