# CMI Follow-up — Data & Database Architecture

**Version:** 2.0 | **Status:** Conceptual target model; not an applied schema | **Parent:** [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md)

## 1. Purpose and migration warning
This document defines the data domains needed by CMI Follow-up. It is a conceptual target model, not a claim that the repository's existing SQL implements it. The committed ChurchConnect migrations and ERDs were designed for an earlier two-role system and must be treated as legacy/provisional until reconciled.

Do not apply legacy migrations to a production CMI database or assume their RLS policies satisfy the six-role, event, public-content and offline-capture requirements.

## 2. Data domains and functional grouping

### A. Identity and access
- **auth identities** — managed by Supabase Auth or the selected secure identity provider.
- **staff profiles** — display name, email, contact details, active state and profile metadata.
- **role definitions / staff role assignments** — the six operational roles; a staff member may hold multiple active roles.
- **capability grants** — explicit action-level privileges where role descriptions are insufficient.
- **team memberships / area coverage** — staff-to-team and staff-to-area relationships.
- **event team assignments** — staff membership and event-specific role/scope.
- **session/security events** — revocation, credential reissue and authentication audit metadata; never store plaintext PINs.

### B. Contacts and field capture
- **contacts** — canonical person/contact record, normalized phone/email where available, age range and configured profile fields.
- **contact capture metadata** — source, area, capture channel, event/service linkage and actor.
- **contact notes** — non-sensitive follow-up notes with explicit visibility/scope.
- **contact merge history** — source record, surviving record, actor, timestamp and preserved references.
- **contact assignments** — current assignment and assignment history; model team/individual scope without assuming the old ChurchConnect primary-assignee rule.
- **contact interaction history** — calls, visits and other actual interactions, outcomes and next steps.

### C. Follow-up
- **follow-up lists** — named work collections, creator, scope and status.
- **follow-up list items/tasks** — contact, assignee, scheduled date, priority, notes and state.
- **task history** — completion, overdue handling, reassignment and status transitions.
- **follow-up outcomes** — outcome, summary, next action and actual contact timestamp.

### D. Prayer and care
- **prayer requests** — linked contact where appropriate, request details, creator, assignment, expiry, answered/removal state and restricted visibility.
- **prayer assignment/history** — intercessor and permitted reviewer access history.
- **care contacts/groups** — care directory and grouping.
- **care status/outcomes** — call/visit outcome and current care status.
Sensitive pastoral records must be separated logically and protected by stricter policies than ordinary contacts.

### E. Events and attendance
- **events** — title, date/time, location, capacity, registration state, public visibility and lifecycle.
- **event registration** — public or staff-created registration, attendee/contact linkage, consent and registration timestamp.
- **transport reservation** — optional reservation associated with an event registration, with configured fields/capacity.
- **event attendance/check-in** — event, attendee/contact, check-in timestamp, recorder and source.
- **event team assignments** — staff, event, event role and scope.
- **event follow-up/closeout** — follow-up tasks, attendance summary and closeout data.

### F. Calendar and communication
- **calendar entries** — service/event/follow-up/prayer schedule entries with team/assignment scope.
- **announcements** — content, audience type, target reference, publication/scheduling state and author.
- **announcement delivery records** — channel-specific delivery metadata for configured channels.
- **SMS campaigns, outbox/messages, templates, automation rules and delivery events** — manual, bulk and rule-triggered SMS, with consent/suppression, idempotency, provider references and auditable status history.
- **contact communication preferences** — permitted channels, SMS consent evidence, opt-out and suppression state.

### G. Public visitor content
- **church profile/settings** — public description, contact details, WhatsApp/social links, service areas and visitor settings.
- **sermons** — title, body, applicable date, draft/published/hidden state and publisher.
- **daily words** — title/content/date and publication state.
- **welcome messages** — public visitor-facing content.
- **digital tracts** — title, body/content, public slug, publication state and QR/share URL.
- **external PDF references** — optional HTTPS URL to externally hosted PDF; the app is not the PDF host.

### H. Reports and governance
- **ministry reports** — report type (daily evangelism, event evangelism, weekly ministry), period, author, scope, status and review metadata.
- **report review history** — reviewer, decision, comments and timestamps.
- **audit events** — actor, action, target, timestamp and minimal safe metadata.
- **retention/deletion requests** — governed by church-approved policy.

### SMS communication domain
- **communication consent/preferences** — recipient, consent state, source/time, opt-out and suppression.
- **SMS templates** — approved, versioned content and message category.
- **SMS campaigns** — creator, scoped audience criteria, approval, schedule and campaign status.
- **SMS outbox/messages** — one recipient per message, idempotency key, trigger, provider message ID, segment count and lifecycle status.
- **SMS delivery events** — verified provider callbacks and append-only status history.
- **SMS automation rules** — enabled trigger, template, timing and eligibility configuration.

Keep provider secrets server-side. Minimize stored message content and phone snapshots; restrict access and define retention. Never put prayer details or confidential care narratives in SMS.

## 3. Relationships and integrity rules
- A contact can have many capture records, interactions, attendance records, tasks, notes and merge-history references.
- A contact may participate in many events through registrations/attendance.
- An event may have many registrations, transport reservations, attendance records and team assignments.
- A staff profile may have multiple role assignments, team memberships and event assignments.
- A follow-up list contains many tasks; each task is scoped to an authorized contact and assignee.
- Prayer requests may link to a contact but must not inherit broad contact-directory visibility.
- Public content is visible anonymously only when explicitly published and public.
- Transport reservation exists only in relation to an event registration and enabled event transport option.
- Merging contacts must preserve or re-link related records transactionally and record a reversible/auditable merge event where feasible.

## 4. Data constraints
- Use stable UUID identifiers for primary entities.
- Enforce foreign keys, not-null/check constraints and unique constraints for business keys.
- Normalize Ghanaian phone numbers to E.164 where possible, while preserving user-entered display form only when needed.
- Store timestamps in UTC and render in the configured church timezone.
- Use explicit status enums or constrained values with documented transitions.
- Keep draft/published state separate from content visibility.
- Keep event registration, attendance and contact identity as distinct concepts.
- Do not infer spiritual status or retention from elapsed time.
- Never store plaintext PINs, passwords, service-role keys or provider secrets.
- Avoid unnecessary copies of pastoral narrative in logs, notifications or reports.

## 5. Offline queue model
A local queued capture needs:
- stable client-generated idempotency identifier;
- minimal contact/capture fields and picker version;
- creator/session context;
- created-at timestamp and sync state;
- server acknowledgement or structured error/conflict result.

The sync API must re-authenticate, re-authorize and validate current pickers and field rules. Retry must not create duplicates. Define device-local encryption, expiry, sign-out handling and recovery policy before release. Do not queue prayer requests or care narratives in the general field-capture queue.

## 6. Reporting data principles
Reports must distinguish:
- contact captured;
- follow-up item created/completed;
- contact attempt recorded;
- successful conversation/contact as explicitly recorded;
- event registration;
- attendance/check-in;
- report submitted/reviewed/approved/returned.

Do not conflate registration with attendance, attempted contact with successful contact, or announcement creation with delivery.

## 7. Target ERD work packages
Create a new CMI ERD in functional subject areas:
1. Identity, roles, teams and event assignments.
2. Contacts, capture, merge, assignment and follow-up.
3. Prayer and care with restrictive access relationships.
4. Events, registration, transport, attendance and closeout.
5. Calendar, announcements and public visitor content.
6. Reports, audit and offline sync metadata.

The ERD must be regenerated from the approved target schema and show actual FK relationships. The older ChurchConnect v1.0/v1.1 draw.io diagrams are historical references, not current CMI diagrams.

## 8. Schema implementation gates
Before writing migrations:
1. approve the role/capability/scope matrix;
2. approve event registration and transport data requirements;
3. approve prayer/care data separation and policy rules;
4. approve offline queue lifecycle and sync conflicts;
5. approve public content publication and anonymous access;
6. map every table to RLS tests;
7. generate migrations from the reviewed target schema and verify from a clean local Supabase environment.
