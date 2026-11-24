# CMI Follow-up — Application Architecture & UI/UX

**Version:** 2.1 | **Status:** Target architecture for implementation planning | **Parent:** [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md)

## 1. Product surfaces
1. **Staff PWA:** authenticated workspace for contacts, follow-up, prayer, care, events, calendar, announcements, content administration, reports, team and church settings.
2. **Public visitor site:** anonymous church profile, active events, enabled registration, welcome content, published sermons/daily words, digital tracts and contact/social links.

Keep public and staff route groups, data services and authorization boundaries separate.

## 2. Proposed technology direction
The existing project direction proposes React + TypeScript + Vite, Tailwind CSS, shadcn/ui, Lucide icons, Supabase Auth/PostgreSQL/RLS/Edge Functions and Vercel hosting. Treat this as the proposed stack until deployment decisions are approved. Use generated database types, pinned dependencies and committed lockfiles.

## 3. Application structure
Organize by business capability:
- app shell, routing, providers and error boundaries;
- auth and account access;
- contacts and capture;
- follow-up lists/tasks;
- prayer and care;
- events, registration, transport and check-in;
- calendar;
- announcements and SMS communications;
- sermons, daily words and visitor content;
- reports;
- team and settings;
- shared components, typed services, validation and tests.

Avoid one oversized dashboard or a generic catch-all feature folder.

## 4. Navigation and information architecture
Staff navigation should group by the user's work:
- **Overview:** role-aware home, assigned work and exceptions.
- **People:** Contacts, Follow-up, Care and Prayer (Prayer visibility remains specially restricted).
- **Ministry operations:** Events, Check-in, Calendar and Reports.
- **Communication & content:** Announcements, SMS (individual, campaigns, automation and delivery logs), Sermons, Daily words and Visitor content.
- **Administration:** Team, Church settings, service areas and access controls.

Render only authorized navigation entries, but enforce every route/action at the data/API layer. On mobile use a compact navigation pattern with clear active state and quick access to field capture; on desktop use a stable sidebar and content workspace. Do not expose privileged admin navigation to unauthorized users.

Public site navigation is visitor-oriented and must not reuse staff navigation or require staff authentication.

## 5. UX principles
- Mobile-first field entry with minimal required fields, large touch targets and sensible defaults.
- Clear distinction between contacts, event registrations, attendance and follow-up tasks.
- Fast capture from Contacts and event workspace.
- Offline sync status only if the feature is enabled after its device-security gate.
- Explicit duplicate review before merge; confirmation and history preservation.
- Task lists prioritize due/overdue work without implying automated retention judgments.
- Prayer and care screens communicate confidentiality and avoid unnecessary exposure.
- Event setup clearly distinguishes registration enabled/disabled, capacity and optional transport.
- Draft/publication states are unmistakable.
- Reports explain their date range, scope and status.
- All forms include loading, validation, empty, error and success states; offline states are added only if offline mode is enabled.
- Responsive accessibility: semantic headings, keyboard/focus, contrast, labels, reduced motion and readable type.

## 6. Data access and backend boundaries
The browser is untrusted. Route guards improve usability but are not security controls. Every protected read/write must be enforced by RLS and/or trusted server-side authorization. Public registration is a narrowly scoped endpoint, not public access to staff contact tables.

Use server-side operations for:
- Supabase Auth password sign-in, temporary-password setup/replacement and administrator-reviewed credential reset;
- contact merge and other multi-record transactional operations;
- offline capture synchronization and idempotency;
- public event registration/capacity/transport reservation;
- event check-in where offline reconciliation is needed;
- publication transitions for visitor content;
- report review/approval;
- privileged prayer/care access and audit events.

Never expose service-role keys or credential secrets to the browser.

## 7. Offline design
Offline mode is disabled for the initial production release. Re-enable only after encrypted local storage, device/session binding, expiry, sign-out recovery, server-side reauthorization and conflict handling are implemented and tested. Never cache prayer/care narratives.

## 8. Authentication UX
Sign-in uses email and password through Supabase Auth. First-time and reset access use a random temporary password, followed by mandatory private password replacement before workspace access. Keep error messages generic to prevent account enumeration. Rate-limit reset requests, audit administrator approval/denial, expire temporary credentials and revoke other sessions after credential reset or account deactivation.

## 9. Public content lifecycle
Staff drafts are private. Authorized publication changes make sermons, daily words and tracts public. Anonymous endpoints must filter on explicit public/published state and expose only fields intended for visitors. Event registration is available only when enabled for that event.

## 10. SMS integration architecture and UX
- Browser clients call a trusted backend endpoint/Edge Function; only server-side code holds provider credentials and communicates with the SMS gateway.
- Use a transactional outbox and background worker/queue for bulk and automated sends. Manual sends should use the same authorization, consent, idempotency and audit pipeline.
- Verify provider delivery webhooks, reject forged/replayed callbacks and update message status idempotently.
- Provide Communications screens for individual compose/send, campaign audience review/confirmation, automation rules/templates, campaign progress and restricted delivery logs.
- Show recipients, segment count, estimated cost when available, sender identity, consent exclusions and campaign state before confirmation. Include pause/cancel controls for eligible queued work.
- Never make delivery claims from a successful API request alone; distinguish submitted from delivered/failed.
- Keep message previews accessible and mobile friendly. Never display prayer/care details in message templates or broad logs.
- Provider adapter must be replaceable; provider selection, sender-ID registration, throughput and Ghana compliance/pricing are deployment configuration, not hard-coded assumptions.

## 11. Observability and quality
Log operational identifiers and failure codes without PINs, secrets or pastoral narratives. Add tests for role/scope combinations, public isolation, prayer privacy, event access, sync retries, duplicate merge and publication state. Monitor sync failures, failed check-in reconciliation, registration capacity conflicts and authorization denials.

## 12. Proposed implementation sequence
1. Apply the product-owner-directed role/capability safe-default baseline and verify the email/password lifecycle.
2. Approve information architecture and responsive prototypes.
3. Redesign target database/ERD and RLS policies.
4. Establish dedicated staging and CI.
5. Implement auth, roles, teams and scope enforcement.
6. Implement contacts, online capture, duplicate review/merge and scoped follow-up; keep offline queue disabled until its security gate passes.
7. Implement follow-up, prayer and care.
8. Implement events, public registration, transport and check-in.
9. Implement calendar, announcements, SMS provider adapter, consent/suppression, campaigns, automation triggers and delivery webhooks.
10. Implement public content.
11. Implement reports, team administration and church settings.
12. Complete security, accessibility, responsive and recovery testing.
13. Pilot with authorized users and synthetic/test data, then obtain production approval.
