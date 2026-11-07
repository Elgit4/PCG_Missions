# ChurchConnect — Software Requirements Specification

**Version:** 1.0  
**Date:** 7 November 2026  
**Status:** Draft for stakeholder review  
**System:** Single-church New Members Follow-up & Retention Management System

## Document control

| Item | Decision |
|---|---|
| Church coverage | One church only |
| Expected intake | Approximately 20–50 new visitors monthly (planning estimate) |
| System roles | Church Administrator and Mission Member |
| Registration | By authorized church personnel; no public self-registration in the initial release |
| Assignment | Manual assignment by the Church Administrator |
| Follow-up channels | Phone calls, SMS and personal visits |
| SMS operation | Manual and scheduled automated messages |
| Proposed platform | Responsive Progressive Web Application (PWA) |
| Proposed stack | React, TypeScript, Supabase, PostgreSQL and Vercel |

## 1. Introduction

ChurchConnect is a web-based application intended to help one church register first-time visitors, assign Mission Members to conduct follow-up, coordinate communication through calls, SMS and personal visits, record attendance and feedback, and monitor progress towards integration into church life.

This specification defines the initial requirements baseline and guides database design, system modelling, interface design, implementation and testing.

### 1.1 Problem statement

The church lacks a centralized, dependable way to monitor newly received visitors and coordinate follow-up. Visitor details and follow-up information may be kept in paper forms, personal phones, spreadsheets or informal conversations. This can lead to missed contacts, unclear responsibility, duplicate records, unassigned visitors, forgotten follow-up dates and limited accountability.

ChurchConnect will provide a controlled source of information and a traceable workflow from visitor registration through follow-up, repeat attendance and integration activities. Technology must support personal ministry, not replace human care or make unsupported judgments about a person's faith or commitment.

### 1.2 Objectives

1. Digitize first-time visitor registration.
2. Ensure each visitor requiring follow-up has a clearly identified primary assignee.
3. Schedule, record and monitor follow-up tasks and outcomes.
4. Support calls, SMS and personal visits.
5. Support both manually initiated SMS and approved scheduled SMS automation.
6. Record repeat attendance and visitor feedback against one visitor profile.
7. Identify overdue tasks, failed communications and visitors requiring human attention.
8. Support collaboration through shared responsibility, internal notes and controlled handovers.
9. Provide accurate operational reports on registration, assignments, follow-up, attendance and integration.

## 2. Scope

### 2.1 Included

- One church only; no multi-church or tenant management.
- Exactly two system roles: **Church Administrator** and **Mission Member**.
- Administrator-managed account creation, temporary credentials, access assignment, password reset, activation and deactivation.
- Visitor registration by authorized church personnel. Welcome Team duties are assigned to Mission Members; they are not a separate system role.
- Visitor profiles, duplicate checks, attendance history and communication preferences.
- Manual assignment of one primary Mission Member, with optional collaborators.
- Follow-up task scheduling, interaction history, outcomes, internal notes and handovers.
- Phone call, SMS and in-person visit tracking.
- Manual SMS and approved scheduled automated SMS, including logs and provider delivery status where supported.
- Notifications, overdue alerts, escalation, dashboards and reports.
- Church-defined integration stages and programme participation tracking.
- Audit trail and privacy controls.

### 2.2 Excluded from the initial release

- Multiple independent churches, SaaS subscriptions or cross-church data sharing.
- Public self-registration or QR self-check-in.
- Accounting, payroll, giving/tithes or full church management.
- Predictive AI scoring or automated judgments about a person's likelihood of leaving.
- WhatsApp Business and inbound SMS reply processing (possible future enhancements).
- GPS tracking of Mission Members.
- Automatic visitor assignment; assignment is manual in the approved baseline.

## 3. Stakeholders and roles

| Role | Responsibilities |
|---|---|
| **Church Administrator** | Full system administration; creates accounts and controls access; manages visitor records, assignments, follow-up workflows, SMS templates and automation, settings and reports. |
| **Mission Member** | Views assigned or explicitly shared visitors; registers visitors/attendance when authorized; completes tasks; sends permitted SMS; records calls, visits, outcomes and permitted notes. |

The system exposes only these two roles. Welcome Team, Missions Leader and other ministry responsibilities are operational duties or task-specific permissions assigned to Mission Members.

### 3.1 Access principles

- Administrator has full administrative access.
- Mission Members access assigned or explicitly shared visitor records only.
- Mission Members cannot create accounts, assign roles, change global settings or browse all visitors by default.
- Registration and attendance permissions can be granted explicitly.
- Prayer requests and pastoral-care notes require stricter access than ordinary follow-up notes.
- UI hiding is not authorization: access must be enforced by database policies and trusted server-side checks.

## 4. Assumptions and constraints

- One church is served by the initial deployment.
- 20–50 new visitors monthly is a planning estimate, not a system capacity limit.
- Users have a supported browser and internet access for normal operations.
- SMS depends on an external gateway, sender ID approval where applicable, sufficient credit and provider/network availability.
- SMS provider, local pricing, sender ID, delivery receipts and API capabilities must be confirmed before implementation.
- Automated messages must use approved templates and schedules and respect consent and communication preferences.
- Supabase Auth manages credentials; plaintext passwords are never stored.
- The church defines follow-up cadence, integration stages, escalation thresholds and retention rules.

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Administrator can create Mission Member accounts using an invitation or temporary-password process. |
| FR-02 | A user issued a temporary password must establish a private password before normal application use. |
| FR-03 | Administrator can edit profiles, reset credentials, activate/deactivate accounts and revoke access. |
| FR-04 | The system supports exactly ADMIN and MISSION_MEMBER roles; Administrator may grant approved task-specific permissions. |
| FR-05 | Secure sign-in, sign-out, password reset and session handling are provided. |
| FR-06 | Authorized users can register visitor details, first-visit date, service, registration source and consent/preferences. |
| FR-07 | The system warns about possible duplicate profiles using normalized phone numbers and other matching fields. |
| FR-08 | Each person has one principal visitor profile linked to attendance, assignments, tasks and interactions. |
| FR-09 | Authorized users can record each attendance event with date, service and recorder. |
| FR-10 | Administrator manually assigns one primary Mission Member and may add collaborators. |
| FR-11 | Assignment and handover history is preserved, including dates, actors and previous assignees. |
| FR-12 | Follow-up tasks can be created manually or generated from Administrator-configured workflows. |
| FR-13 | Tasks include visitor, responsible user, channel, due date/time, status and optional instructions. |
| FR-14 | Completed interactions record actual date/time, channel, outcome and summary. |
| FR-15 | Follow-up channels include phone call, SMS and personal visit. |
| FR-16 | Visitor feedback outcomes include interested in returning, requested information/support, unreachable, not interested at present and requested no further contact. |
| FR-17 | Authorized users can add timestamped internal notes that are not sent to visitors. |
| FR-18 | Administrator can add/remove collaborators and transfer outstanding responsibilities without losing history. |
| FR-19 | Authorized users can compose/select a template, review recipient/content and explicitly confirm manual SMS sends. |
| FR-20 | Scheduled SMS is sent only from active, Administrator-approved workflows after eligibility and consent checks. |
| FR-21 | SMS logs store provider IDs and delivery events where supported, distinguishing queued, submitted, delivered, failed and unknown. |
| FR-22 | Failed SMS is surfaced to responsible users; eligible retries are controlled and duplicate sends prevented. |
| FR-23 | Administrator manages reusable SMS templates, categories, approval and activation. |
| FR-24 | Administrator can monitor SMS volume and costs where provider data is available. |
| FR-25 | Consent and channel preferences are recorded; optional messages are suppressed when disallowed. |
| FR-26 | Responsible users receive upcoming and overdue task reminders. |
| FR-27 | Overdue or unresolved tasks can be escalated to Administrator according to configurable rules. |
| FR-28 | Alerts identify unassigned visitors, repeated unsuccessful attempts, failed SMS and requests requiring authorized pastoral attention. |
| FR-29 | Administrator configures church-specific integration stages and definitions. |
| FR-30 | Programme participation in orientation, discipleship, Bible study or other configured activities is recorded. |
| FR-31 | Administrator sees organization-wide dashboards; Mission Members see assigned work and personal task summaries. |
| FR-32 | Authorized users can generate date-filtered operational reports and export permitted data. |
| FR-33 | Significant account, permission, visitor, assignment, SMS configuration and data-management events are audited. |
| FR-34 | Authorized users can correct inaccurate records while retaining appropriate change history. |
| FR-35 | Search and filtering respect each user's access scope. |

## 6. Business rules

1. Each visitor has a unique internal identifier and belongs to this church's dataset.
2. Subsequent attendance is appended to the existing visitor profile; a new profile is not created for each visit.
3. Every visitor requiring follow-up has one current primary assignee or is explicitly marked unassigned.
4. Only Administrator can assign or reassign the primary Mission Member.
5. Collaborators support the primary assignee but do not replace them unless a formal handover occurs.
6. Reassignment preserves previous assignment and task history.
7. Completed follow-ups record channel, date/time and outcome.
8. SMS delivery is not proof that a message was read or answered.
9. SMS is not sent where applicable consent or preferences disallow it.
10. Automated SMS requires an active approved workflow and must be suppressible when circumstances change.
11. Duplicate detection is advisory; an authorized user confirms whether records represent the same person.
12. Visitor lifecycle, engagement indicator and task status are separate concepts.
13. Deactivating a user revokes access but does not delete historical records authored by that user.
14. Sensitive prayer/pastoral records are restricted to authorized users.
15. Reports distinguish contact attempts, successful contact, delivery and visitor response.

## 7. Core workflows

### 7.1 Registration and assignment

1. Authorized Welcome Team duty-holder/Mission Member opens registration.
2. User enters visitor details, first-visit information and consent/preferences.
3. System validates required fields and checks for likely duplicates.
4. User reviews a possible match or creates a new profile.
5. New visitor appears in Administrator's unassigned queue.
6. Administrator assigns a primary Mission Member and optional collaborators.
7. System records assignment history and generates follow-up tasks from the active workflow.

### 7.2 Follow-up and feedback

1. Mission Member opens assigned visitor/task list.
2. Member reviews due task, visitor history and communication preferences.
3. Member chooses call, SMS or personal visit.
4. For SMS, member reviews recipient and message before confirming; calls/visits are recorded after they occur.
5. System records interaction and provider delivery event if available.
6. Member records visitor response/outcome and next action.
7. System completes task and schedules the next task when required.

### 7.3 Automated SMS

1. Administrator configures approved workflow, template, timing and eligibility.
2. Scheduler identifies due messages.
3. System checks consent, opt-out, valid number, visitor status, workflow state and duplicate-send key.
4. Eligible message is submitted through secure server-side integration.
5. Provider reference and initial state are stored.
6. Provider webhook updates delivery state where supported.
7. Failures and suppressions are logged and surfaced; submission is never falsely represented as delivery.

### 7.4 Handover

1. Administrator selects visitor/assignment and new primary assignee.
2. System displays outstanding tasks and relevant notes.
3. Administrator confirms handover and records reason/instruction.
4. System updates responsibility, preserves history and notifies relevant users.
5. Previous notes and interactions remain attributed to their original authors.

## 8. Logical data requirements

The following entity inventory will guide the ERD; it is not yet the final physical schema.

| Entity | Purpose |
|---|---|
| user_profiles | Profile linked to Supabase Auth identity |
| roles / user_roles | ADMIN and MISSION_MEMBER role definitions and assignment |
| user_permissions | Optional Administrator-granted task permissions |
| visitors | Principal visitor profile and contact details |
| visitor_consents | Purpose, channel, status, source, timestamp and withdrawal |
| visitor_visits | Individual attendance events |
| assignments | Current and historical primary assignments |
| assignment_collaborators | Supporting Mission Members |
| assignment_history | Reassignment and handover events |
| follow_up_workflows | Configured sequences and eligibility rules |
| follow_up_tasks | Planned activities, due dates, assignees and status |
| follow_up_records | Actual interactions, outcomes, summaries and authors |
| team_notes | Internal collaboration notes and visibility |
| sms_templates | Approved reusable message templates |
| sms_messages | Recipient, content snapshot, sender, provider reference and state |
| sms_delivery_events | Provider webhook events and normalized delivery status |
| integration_stages | Church-defined integration stages |
| integration_programmes | Orientation, discipleship and other programmes |
| programme_enrolments | Visitor participation, attendance and completion |
| prayer_requests | Sensitive requests with restricted access |
| notifications | In-app/email notifications |
| audit_logs | Actor, action, target, timestamp and relevant metadata |

Use generated primary keys, explicit foreign keys and database constraints. Normalize Ghanaian numbers to E.164 format where possible (for example, +233…). Do not store credentials, service-role keys or SMS secrets in ordinary application tables.

## 9. External interfaces

### 9.1 User interface

- Responsive mobile, tablet and desktop layouts.
- Administrator dashboard emphasizes unassigned visitors, overdue tasks, workload and system health.
- Mission Member dashboard emphasizes today's tasks, assigned visitors, reminders and recent activity.
- Forms validate inputs and explain errors.
- Sending SMS, changing assignees and deactivating accounts require confirmation.
- Core flows use accessible labels, keyboard navigation, readable typography and sufficient contrast.

### 9.2 SMS gateway

- Select a provider with Ghana coverage, documented API, sender-ID options, delivery receipts/webhooks and transparent pricing.
- Keep credentials exclusively in server-side secrets.
- Verify webhook authenticity and process events idempotently.
- Store provider identifiers and normalized statuses.
- Handle timeouts, rate limits, insufficient credit and invalid recipients.
- Evaluate Ghana-capable options such as Hubtel and Arkesel before selecting a provider.

## 10. Non-functional requirements

| ID | Quality | Requirement |
|---|---|---|
| NFR-01 | Security | Protected records and operations require authenticated, authorized access. |
| NFR-02 | Privacy | Collect only necessary data and provide clear notice and consent controls. |
| NFR-03 | Performance | Common operations should respond promptly under expected load; numeric targets are confirmed during testing. |
| NFR-04 | Availability | Application should be available during normal church operations, subject to providers/network. |
| NFR-05 | Usability | Routine registration and follow-up require minimal training. |
| NFR-06 | Responsiveness | Core workflows work on supported mobile and desktop sizes. |
| NFR-07 | Maintainability | Modular code, documented interfaces, migrations and automated tests. |
| NFR-08 | Scalability | Support stated monthly intake and reasonable growth beyond it. |
| NFR-09 | Integrity | Constraints and transactions prevent inconsistent relationships and duplicate processing. |
| NFR-10 | Accessibility | Target WCAG 2.2 AA practices for core workflows where practicable. |
| NFR-11 | Recoverability | Define and periodically test backup and restoration procedures. |
| NFR-12 | Auditability | Sensitive administrative and communication events are traceable. |
| NFR-13 | Interoperability | Isolate SMS provider integration behind an adapter where practical. |

## 11. Security, privacy and audit

- Use Supabase Auth for identity and password management; never store plaintext passwords.
- Administrator provisions accounts using invitation or temporary credentials. Temporary passwords must be changed at first login; Administrator cannot retrieve permanent passwords.
- Enforce authorization with PostgreSQL Row Level Security (RLS) and trusted server-side checks. UI hiding is insufficient.
- Mission Members access assigned or explicitly shared visitor records only.
- Keep service-role keys and SMS secrets exclusively in trusted server-side configuration.
- Restrict prayer requests and pastoral notes.
- Record consent, purpose, channel preferences and opt-out events.
- Define processes for access, correction, export, retention and deletion requests.
- Establish a retention schedule and obtain appropriate privacy review under Ghana's Data Protection Act, 2012 (Act 843); confirm applicable Data Protection Commission obligations before production.
- Use HTTPS, secure sessions, authentication rate limiting and protection against common web vulnerabilities.
- Audit account creation, permission changes, deactivation, visitor edits, assignment changes, SMS sends and administrative exports.

## 12. Reports and acceptance criteria

### 12.1 Reports

- Visitor registrations by date and service.
- Unassigned visitors and assignment coverage.
- Follow-up tasks by status, due date, channel and assignee.
- Completed follow-ups and outcomes.
- Attendance and return-visit trends.
- SMS sent, queued, delivered, failed and estimated cost where available.
- Mission Member workload and overdue tasks.
- Integration-stage and programme participation.

### 12.2 Initial acceptance criteria

1. Administrator can create a Mission Member account and assign MISSION_MEMBER.
2. Newly provisioned user establishes a private password before normal use.
3. Mission Member cannot access unassigned/private visitor records by manipulating URL or API requests.
4. Authorized user can register a visitor and review duplicate warnings.
5. Administrator can assign a primary Mission Member and add a collaborator.
6. Assignment changes preserve prior assignee and handover history.
7. Attendance can be recorded against an existing profile.
8. Mission Member can complete a task with channel, timestamp and outcome.
9. Manual SMS requires explicit confirmation and creates a message record.
10. Automated SMS checks consent, opt-out, workflow state and duplicate-send safeguards.
11. Provider callbacks update message status without treating submission as delivery.
12. Overdue tasks and failed SMS are visible to responsible users and Administrator.
13. Administrator sees operational reports; Mission Members see only permitted task summaries.
14. Sensitive pastoral records are inaccessible to unauthorized users.
15. Core workflows pass mobile and desktop usability tests.

## 13. Risks and decisions still required

| Item | Required decision/action |
|---|---|
| SMS provider | Compare Ghana delivery coverage, API, sender ID, receipts and cost; then select provider. |
| Consent | Approve consent wording, message categories and opt-out process. |
| Follow-up cadence | Missions Team approves timing, channels, quiet hours and stop conditions. |
| Integration criteria | Church defines stage names and what counts as integrated. |
| Data retention | Church leadership approves retention and deletion policy. |
| Task permissions | Administrator identifies which Mission Members may register visitors/attendance or collaborate. |
| Automation safety | Require preview, approval, test mode, idempotency and pause controls. |
| Ownership | Administrator owns workflow and template configuration. |

## 14. Proposed architecture

| Layer | Proposed technology | Responsibility |
|---|---|---|
| Frontend | React, TypeScript, Vite | Responsive Administrator and Mission Member interfaces |
| UI | Tailwind CSS, shadcn/ui, Lucide | Reusable accessible components |
| Identity | Supabase Auth | Login, password reset, sessions and account provisioning |
| Database | Supabase PostgreSQL | Visitor, attendance, assignment, follow-up and reporting data |
| Authorization | PostgreSQL RLS and server-side checks | Role and record-level access |
| Business operations | Supabase Edge Functions / trusted server code | SMS sends, scheduling, webhooks and privileged actions |
| Messaging | Selected Ghana-capable SMS gateway | Outbound SMS and delivery callbacks |
| Hosting | Vercel | Frontend hosting and deployment |
| Source control | GitHub | Version control and documentation |

The initial design uses one church dataset, not multi-tenant tables. Keep modules separate, use explicit foreign keys and preserve audit history.

## Appendix A: Glossary

- **Visitor:** Person attending a church service and recorded for welcome/follow-up.
- **Mission Member:** User responsible for assigned visitor follow-up.
- **Primary assignee:** Mission Member with principal responsibility.
- **Collaborator:** Authorized Mission Member supporting an assignment.
- **Follow-up task:** Planned call, SMS or personal visit.
- **Follow-up record:** Historical record of an interaction that occurred.
- **Delivery receipt:** Provider-reported SMS delivery state; it does not prove reading.
- **Integration stage:** Church-defined point in the visitor's journey towards participation.
- **PWA:** Progressive Web Application designed for responsive browser use and optional installation.
