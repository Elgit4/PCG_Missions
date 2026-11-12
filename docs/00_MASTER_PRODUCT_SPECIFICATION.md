# CMI Follow-up — Master Product Specification

**Product:** Church on Missions International (CMI) Follow-up  
**Repository:** `Elgit4/PCG_Missions`  
**Specification version:** 2.1  
**Baseline date:** 7 November 2026  
**Status:** Consolidated requirements baseline for stakeholder validation  
**Supersedes:** Conflicting ChurchConnect-era role, registration, assignment and messaging assumptions. SMS requirements for CMI are defined exclusively by this specification.

## 1. Product definition

CMI Follow-up is a church ministry operations and follow-up application supporting field capture, contact management, follow-up assignments, prayer and care, events, attendance, calendar activities, announcements, visitor-facing content, ministry reports and team administration.

The product has two connected experiences:
- **Staff workspace:** authenticated, role- and assignment-scoped operational tools.
- **Public visitor site:** unauthenticated visitor-facing church information, active events, registration, published content and contact links.

The application supports one configured church instance and its branch context. It is not a multi-church network administration platform.

## 2. Authoritative requirements and precedence

The supplied **CMI Follow-up App Guide** is the functional source for this baseline. This master specification organizes those requirements into an implementation-ready product definition. Supporting documents add detail but must not contradict it.

Where earlier ChurchConnect documents conflict with this baseline, this specification takes precedence. The earlier two-role model, staff-only registration, manual-only event intake and mandatory primary-assignee assumptions are superseded. This CMI baseline explicitly includes manual, bulk and rule-triggered SMS; legacy SMS descriptions do not define the current implementation.

A guide description is a target capability description, not proof that a feature is implemented. The implementation status of each capability must be verified independently.

## 3. Product boundaries

### Included
- Staff authentication using Supabase Auth **email and password**, short-lived temporary-password onboarding and mandatory first-login replacement.
- Six operational roles, with users permitted to hold more than one role.
- Permission- and scope-controlled staff workspace.
- Contact directory, field capture, notes, history, duplicate review/merge and assignment.
- Follow-up lists and items with due dates, priorities, notes, completion and overdue visibility.
- Offline capture is a future capability and is disabled for the initial production release until device-local security and sync recovery controls pass.
- Restricted prayer requests and pastoral care records, including assignment and expiry.
- Care contacts, groups, care summaries and call/visit outcome recording.
- Events, public registration when enabled, optional capacity, transport reservations, check-in, event assignments and closeout.
- Church/event calendar and scheduling for follow-up and prayer activities.
- Role-scoped announcements and permitted contact communication.
- SMS communications: staff-composed individual messages, permission-scoped bulk campaigns and configurable automated SMS triggers, with consent controls, delivery tracking and audit.
- Sermon and daily-word drafting, administration publishing and public display.
- Public church visitor site, profile, active events, welcome messages, digital tracts, social links and contact links.
- Daily evangelism, event evangelism and weekly ministry reports, including review/approval/return where authorized.
- Team administration, role assignment, area coverage, activation/deactivation and event-specific team assignments.
- Church profile, service areas and visitor-content settings.

### Explicitly not included as complete services
- WhatsApp automation (unless separately approved); SMS is included in manual, bulk and automated forms.
- Discipleship lesson paths.
- Disengagement or retention alerts.
- Territory coverage maps or response maps.
- Testimonies/milestones feeds.
- Printed-tract inventory.
- Seeker-facing AI tools, interactive gospel journey, anonymous Q&A or feedback surveys.
- Multi-church network administration.
- Full offline application operation.
- PDF hosting; an optional tract PDF link may point to an existing public HTTPS file.

Do not advertise or promise excluded capabilities as available.

## 4. Roles and authorization model

The application has six operational roles:

1. **Admin / Pastor** — church-wide administration and account governance, with only explicitly granted operational permissions. Restricted pastoral oversight is a separate reason-coded, audited capability; exports remain disabled until a dedicated export workflow is implemented and authorized.
2. **Coordinator** — event coordination, church contact access, follow-up, reports, announcements, prayer management and permitted team communication.
3. **Team leader** — team-scoped contacts and reports, event management, follow-up and team communication.
4. **Field worker** — field capture and own contact/report access.
5. **Follow-up volunteer** — assigned/own contact follow-up and reports.
6. **Prayer intercessor** — read-only access to prayer-request text actively assigned to them. No general contact identity, unassigned prayer discovery, request creation or assignment management by default.

A user may hold multiple roles. Effective capabilities are combined, but this does not remove record, church, team, event or assignment scope restrictions. Role labels alone must not grant unrestricted access. The exact capability matrix and administrator exceptions must be explicit, testable and enforced by trusted backend/database authorization, not merely by hiding UI controls.

Prayer requests and care notes are sensitive pastoral information. Access must be narrower than ordinary contact access. An intercessor sees only prayer requests assigned to them, subject to permitted administrator oversight. Unassigned prayer requests are visible only to roles authorized to review them.

## 5. Authentication and account lifecycle

- Staff sign in using email and password through Supabase Auth. Administrators issue only random, short-lived temporary passwords; users set and retain their own permanent passwords.
- Passwords are private credentials and must never be shared or exposed in support requests.
- Administrators provision and manage staff access according to their authority.
- Sign-out is required on shared devices; device locking is recommended.
- Use Supabase Auth for password hashing and sessions; never store or log plaintext passwords or temporary credentials. Apply generic rate-limited recovery, forced first-login password replacement, session revocation and audit events.
- A password must not be treated as a role or authorization claim.
- Public visitor pages and event registration do not require staff sign-in.

The temporary-password expiry, email delivery, forced replacement and administrator-reviewed recovery lifecycle are specified in the current authentication runbook and must pass staging tests before production.

## 6. Functional modules

| Module | Core capability |
|---|---|
| Authentication | Staff email/password sign-in, sign-out and account access lifecycle |
| Contacts | Contact records, capture, notes, history, duplicate merge and assignment |
| Follow-up | Lists, assigned work, due dates, priorities, outcomes and overdue tracking |
| Prayer | Restricted prayer requests, assignment, expiry, update and answered status |
| Care | Care directory/groups, summaries, calls/visits and status updates |
| Events | Event setup, public registration, transport reservations, check-in, assignments and closeout |
| Calendar | Services, events, follow-up and prayer scheduling |
| Announcements & SMS | Announcements plus manual one-to-one SMS, bulk SMS campaigns and configurable automated SMS workflows |
| Sermons & daily words | Draft, administer, publish/hide and public display |
| Public visitor site | Church profile, active events, registration, welcome content, tracts and contact/social links |
| Reports | Daily, event and weekly ministry reporting, review and scoped reporting |
| Team | Member directory, roles, area coverage, access, activation and event assignments |
| Church settings | Church profile, service areas and visitor-facing configuration |

Detailed functional flows and acceptance criteria are in [01 — Functional Requirements & Workflows](01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md).

## 7. Core operating workflows

### 7.1 Field capture and contact lifecycle
A permitted staff member captures a contact from Contacts or an event workspace. Required fields remain minimal for field speed. Capture pickers provide configured source, area, age range and other options. A duplicate is reviewed and merged through the record actions when appropriate. Contacts retain notes, assignments and follow-up history.

### 7.2 Offline field capture
Offline mode is disabled for the initial production release. Do not store contact, pastoral or attendance records on devices. Re-enable only after encrypted local storage, device/session binding, expiry, sign-out recovery, reauthorization at sync and conflict handling are verified.

### 7.3 Follow-up
Contacts are organized into follow-up lists. Lists/items are assigned to team members according to permissions. Items can include scheduled date, priority and notes. Assignees see work in their assigned workspace. Completion is recorded after contact is made; overdue items remain visible until cleared, completed or reassigned under authorized rules.

### 7.4 Prayer and care
The target product supports prayer-request intake, assignment, expiry and status management. Under the current owner-directed grant baseline, only assigned prayer reads and separate audited Admin/Pastor oversight reads are enabled; creation, assignment, update, answered-status and deletion operations remain unavailable until their trusted workflows and grants are implemented. Care reads are limited to the same separate audited oversight path; assigned-care access and care mutation are not granted because no care-worker role is defined.

### 7.5 Events
Authorized staff create events with date, location and capacity. Registration and transport reservations may be enabled. Public event pages allow visitor registration when enabled. Staff use event check-in to record attendance, then event workspaces for assigned follow-up, event team access and closeout. Public links and QR codes are shared as generated by the application.

### 7.6 Public content
Authorized staff maintain church profile and visitor-facing information. Sermons and daily words remain private drafts until published through administration. Published items and digital tracts appear on public pages. Tract PDF references may link to an existing public HTTPS file; the application does not host PDF files as a service.

### 7.7 Reporting and team administration
Staff submit daily evangelism, event evangelism and weekly ministry reports. Authorized reviewers may review, approve or return reports. Team administrators manage active/inactive members, roles, area coverage, access and event-specific assignments.

## 8. Communications and SMS policy

SMS is a planned product capability in three modes, but all live dispatch modes are disabled until the provider, lawful basis/consent, sender, suppression, campaign controls and authorization gates are satisfied:
1. **Manual SMS:** an authorized staff member composes and sends an individual message from a permitted contact record.
2. **Bulk SMS:** an authorized user selects an allowed audience (for example, a team, event registrants or contacts within their scope), reviews recipient count and message, and explicitly confirms the campaign.
3. **Automated SMS:** approved system events can enqueue configured messages, such as event registration confirmation, event updates/reminders, or follow-up task reminders. Each trigger must be explicitly enabled, configurable and auditable; no unapproved trigger may send.

SMS requirements:
- Use a server-side SMS provider integration; provider credentials must never reach the browser.
- Maintain a normalized phone number, communication preference and evidence of consent or other church-approved lawful basis where applicable. Record the source and timestamp. Enforce suppression/opt-out and never send non-essential messages to opted-out or invalid recipients.
- Use approved templates, sender identity and message-length/segment estimates; show expected recipient count and estimated cost where provider data permits before bulk confirmation.
- Store message intent, sender/trigger, template/version, recipient reference, provider message ID, queued/submitted/delivered/failed/undeliverable status, timestamps and failure code. Do not treat provider acceptance as delivery.
- Use an outbox/queue, idempotency keys, bounded retries and rate limits to avoid duplicate sends. Failed messages must be visible to authorized operators.
- Enforce role, team, event and contact scope at send time, not just when selecting recipients.
- Never include prayer-request details, confidential pastoral notes, sensitive care narratives, PINs or other secrets in SMS. Use neutral wording for sensitive workflows.
- Bulk campaigns require a final review/confirmation step and audit record. Restrict campaign creation, audience selection and sending separately if the capability matrix requires it.
- Automated messages must be opt-in/configurable by trigger and template, respect an approved quiet-hours policy; do not enable automated sending until that policy is configured, and be cancellable/pausable by authorized administrators.
- Record and respect applicable consent, opt-out and Ghanaian telecommunications/provider requirements. Provider, sender-ID registration, pricing, throughput and regulatory setup must be validated before production.
- SMS is not WhatsApp. WhatsApp links remain user-initiated and are not represented as automated messaging.

Announcements may be delivered through in-app and SMS channels only where configured and authorized. Verify actual provider configuration before describing SMS as live.

## 9. Privacy, safety and data governance

- Collect only information needed for ministry follow-up.
- Respect consent and communication preferences.
- Keep prayer requests and pastoral notes private and scope them to authorized roles/assignments.
- Do not export or share attendee lists or sensitive details through public channels.
- Use role-, team-, event- and assignment-scoped access.
- Sign out on shared devices; never share passwords.
- Do not include passwords, temporary credentials or private visitor data in support requests.
- Church-approved retention, correction, deletion and data-subject request processes govern records.
- Audit sensitive access, account changes, role/capability changes, merges, exports, publication and other privileged actions.
- RLS and trusted server-side authorization must enforce access. Frontend route guards are not security controls.

## 10. Non-functional and quality requirements

- Mobile-first responsive PWA; core field workflows must be usable on small phones.
- Accessible forms, labels, keyboard operation, focus states, readable typography and sufficient contrast.
- Clear loading, empty, validation, error and success states; offline/sync states are required only if offline mode is later enabled.
- Reliable duplicate handling and safe contact merging with preserved history.
- If offline mode is later enabled, require idempotent sync and conflict handling; do not silently discard captures.
- Pagination and indexed search for growing contact/event/report records.
- Secure sessions and credential handling; no plaintext password or temporary-credential storage/logging.
- Automated tests for role combinations, scope boundaries, prayer privacy, event permissions, offline sync and public/staff separation.
- Use synthetic data during development and testing; production data requires church authorization and privacy controls.

## 11. Acceptance gates

The product is not ready for release until:
1. All six roles and multi-role combinations have an approved capability/scope matrix.
2. Supabase email/password authentication, temporary-password onboarding, first-login replacement, administrator-reviewed recovery and session revocation pass staging security tests.
3. Contact capture, duplicate merge and follow-up history work on mobile.
4. Offline mode remains disabled unless the encrypted device queue and sync recovery have passed security and reliability tests.
5. Prayer isolation is verified with positive and negative authorization tests.
6. Public registration, transport reservation and event check-in work when enabled.
7. Event-specific assignments do not leak data across events.
8. Draft/publication boundaries for sermons, daily words and tracts are enforced.
9. Reports and exports respect authorization scope.
10. Public pages do not expose staff-only records or private content.
11. Manual, bulk and automated SMS pass consent, scope, queue, delivery-status, opt-out, cost-control and security tests; WhatsApp automation and all other listed future/held features remain absent or clearly disabled.
12. User guide, release notes and support procedures match the deployed application.

## 12. Current owner-directed implementation baseline and remaining gates

On 11 November 2026, the product owner authorized implementation of conservative standard defaults for all outstanding R-01–R-12 and D-01–D-13 decisions. The selected engineering baseline is recorded in [31 — Owner-Directed Safe-Default Decision Baseline](31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md) and summarized in the [decision register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md). These defaults may be amended later through documented change control; they are not represented as church-board, pastoral, legal or regulatory sign-off.

The current implementation defaults are:
- One church and one configured operational branch; no multi-tenant administration.
- Least-privilege role/capability grants, scope checks on every request, minimized contact projections and separate reason-coded/audited pastoral reads.
- Supabase email/password with short-lived temporary onboarding credentials and mandatory first-login replacement.
- No public registration until privacy notice, lawful purpose/basis, minimal fields, rate limits, abuse controls and trusted intake/review are ready.
- Transactional event capacity, separate transport reservations and attendance, no waitlist.
- Offline mode disabled for the initial release.
- SMS provider dispatch, automation and campaigns disabled until Ghana-specific provider/sender, consent/suppression, quiet-hours, budget and security controls are verified.
- No exports, automated deletion or retention purge until their dedicated capability/workflow and approved schedule exist.
- Typed report fields and scope-limited review; no arbitrary JSON for core facts.

Remaining release gates are operational rather than unresolved engineering defaults: data-protection/controller compliance and privacy notice before real personal-data processing; provider and sender approvals before SMS; production email configuration; staging, backup/restore rehearsal, monitoring, independent security review of pastoral access, and user acceptance. Do not treat a target module description as proof that the module is live.

Track implementation and deployment status in [02 — Roles, Permissions & Security](02_ROLES_PERMISSIONS_AND_SECURITY.md), [05 — Implementation & Deployment Plan](05_IMPLEMENTATION_AND_DEPLOYMENT_PLAN.md) and [31 — Owner-Directed Safe-Default Decision Baseline](31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md).

## 13. Documentation map

- [01 — Functional Requirements & Workflows](01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md)
- [02 — Roles, Permissions & Security](02_ROLES_PERMISSIONS_AND_SECURITY.md)
- [03 — Data & Database Architecture](03_DATA_AND_DATABASE_ARCHITECTURE.md)
- [04 — Application Architecture & UI/UX](04_APPLICATION_ARCHITECTURE_AND_UI_UX.md)
- [05 — Implementation & Deployment Plan](05_IMPLEMENTATION_AND_DEPLOYMENT_PLAN.md)
- [09 — Database Design Validation Report](09_DATABASE_DESIGN_VALIDATION_REPORT.md)
- [10 — ERD-to-Physical Schema Traceability](10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md)
- [11 — Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md)
- [12 — RLS Policy & Security Test Plan](12_RLS_POLICY_AND_SECURITY_TEST_PLAN.md)
- [06 — Internal User Guide](CMI_FOLLOW_UP_APP_GUIDE.md)
- [Documentation index](README.md)

## 14. Implementation truth statement

This specification describes the target product. The retained ChurchConnect ERD artifacts, and any associated legacy SQL migrations or tests, belong to an earlier two-role model and must be treated as **legacy/provisional**, not as proof that this CMI model is implemented. They must be reconciled through a reviewed schema redesign and new migrations before deployment. Do not apply old migrations to a live project on the assumption that they implement this specification.
