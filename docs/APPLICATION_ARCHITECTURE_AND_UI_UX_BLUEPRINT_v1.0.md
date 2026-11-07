# ChurchConnect — Application Architecture & UI/UX Blueprint

**Version:** 1.0  
**Date:** 7 November 2026  
**Status:** Proposed application design for technical and church stakeholder review  
**Repository:** Elgit4/PCG_Missions  
**Related baseline:** SRS v1.0, Database Design v1.1, ERD v1.1, Use Cases and Activity Models v1.0, Implementation Roadmap v1.0

---

## 1. Purpose and design status

This blueprint converts the approved requirements and current database design into an implementable application plan. It defines the application boundary, frontend structure, role-specific navigation, screen inventory, interaction patterns, permission enforcement, trusted backend operations, deployment environments, verification strategy and delivery sequence.

It is a design specification, not evidence that the frontend, Edge Functions, hosted database, SMS integration or production service have already been implemented.

### 1.1 Product objective

ChurchConnect is a single-church New Members Follow-up & Retention Management System for the Missions Team. Its operating principle is:

> Make every visitor visible, every follow-up accountable, and every next step clear.

The application should help church personnel provide consistent, human-led care. It must not replace personal judgement, infer spiritual commitment, assign spiritual value scores or label a visitor as abandoned solely because time has passed.

### 1.2 Baseline decisions carried into this design

| Area | Design baseline |
|---|---|
| Church scope | One church only; no multi-tenant support |
| Expected intake | Approximately 20–50 new visitors per month as a planning estimate, not a capacity limit |
| Platform | Mobile-first responsive Progressive Web Application |
| Frontend | React, TypeScript and Vite |
| UI foundation | Tailwind CSS, shadcn/ui and Lucide icons |
| Backend | Supabase Auth, PostgreSQL, Row Level Security and Edge Functions |
| Hosting | Vercel proposed; final deployment arrangement remains subject to approval |
| Roles | Exactly Church Administrator and Mission Member |
| Registration | Staff-only, performed by specifically authorized users |
| Assignment | Administrator assigns one primary Mission Member; optional collaborators |
| Follow-up | Phone calls, SMS and personal visits |
| SMS | Manual and approved scheduled sending; Ghana-capable provider not yet selected |
| Connectivity | Internet required for normal operation; no offline-first visitor-data workflow in the initial release |
| Data | Synthetic data during development and testing; no live visitor information before pilot approval |

### 1.3 Explicit non-goals

The first release will not include multiple churches, public visitor self-registration, QR self-check-in, accounting, giving/tithes, payroll, GPS tracking, WhatsApp integration, inbound SMS reply processing, predictive visitor scoring or automated pastoral decisions.

---

## 2. Architecture overview

### 2.1 Logical architecture

The system is divided into four logical layers:

1. **Presentation layer — React PWA:** renders the Administrator and Mission Member experiences, handles forms and local interaction state, and presents clear loading, empty, validation, network and permission states.
2. **Application/service layer — typed frontend services and Supabase Edge Functions:** coordinates use cases, validates request shape, handles trusted operations and isolates provider-specific integrations.
3. **Data and identity layer — Supabase Auth and PostgreSQL:** authenticates users, stores operational records, enforces relational integrity and applies RLS to every exposed application table.
4. **External services layer:** SMS gateway, approved email delivery where required, hosting, monitoring and backup facilities.

The browser is an untrusted client. A route guard, disabled button or hidden menu item is not a security boundary. Every sensitive read or write must also be denied by RLS or a trusted server-side authorization check.

### 2.2 Component responsibilities

| Component | Responsibility | Must not do |
|---|---|---|
| React application shell | Bootstrap session, resolve profile and capabilities, render role-appropriate navigation | Treat a locally stored role or editable user metadata as proof of authorization |
| Route and capability guards | Prevent confusing navigation to unavailable screens | Replace database or server-side authorization |
| Feature modules | Own screen composition and user interaction for a business area | Place raw provider credentials or privileged logic in the browser |
| Typed data-access services | Encapsulate Supabase queries, typed records, pagination and normalized errors | Bypass RLS or silently widen a user's data scope |
| Supabase Auth | Authenticate identities, maintain sessions and support secure password recovery/invitation | Store permanent passwords in application tables |
| PostgreSQL + RLS | Enforce row-level access and relational constraints | Depend on frontend filtering for access control |
| Edge Functions | Perform privileged or externally connected use cases after authenticating and authorizing the caller | Accept a browser claim as authority or expose service-role credentials |
| Scheduler/worker | Identify due workflow actions and process them idempotently | Send without rechecking consent and suppression at execution time |
| SMS adapter | Translate the internal message contract to a selected provider API | Leak provider-specific details into domain screens |
| Provider webhook endpoint | Authenticate callbacks, deduplicate events and update delivery state | Trust arbitrary public callback payloads |
| Audit and monitoring | Record safe operational events and failures | Copy passwords, secrets, full pastoral narratives or unnecessary personal data into logs |

### 2.3 Suggested application structure

Keep the code organized by business capability rather than creating one oversized dashboard or one generic components folder.

| Area | Suggested responsibility |
|---|---|
| app | Application bootstrap, providers, router, authenticated layout and error boundary |
| features/auth | Sign-in, invitation acceptance, first-login password setup and password recovery |
| features/dashboard | Role-specific summaries and task entry points |
| features/visitors | Registration, duplicate review, directory, profile and contact preferences |
| features/attendance | Service types, visit history and attendance recording |
| features/assignments | Unassigned queue, primary ownership, collaborators and handover |
| features/follow-up | Workflows, tasks, actual interactions, outcomes and notes |
| features/messaging | Templates, manual composition, message history and delivery status |
| features/integration | Stages, programmes, enrolment and programme attendance |
| features/team | Team directory, invitations, accounts, role and capability administration |
| features/reports | Operational metrics, report filters and authorized exports |
| features/notifications | In-app alerts, read state and notification preferences |
| features/settings | Church configuration, workflow settings, consent wording and operational limits |
| components | Reusable controls and visual primitives without business authorization logic |
| lib | Supabase client, generated database types, validation utilities and shared formatting |
| services | Typed query functions and use-case orchestration |
| types | Shared domain contracts and discriminated result/error types |
| test | Unit, integration, accessibility and end-to-end test support |

Feature folders may contain components, schemas, hooks, service functions and tests. Keep the Supabase client in one place and use generated database types from the committed schema. Pin package versions and commit the lockfile when the application repository is initialized.

---

## 3. Identity, roles and authorization

### 3.1 Authentication lifecycle

1. A team member receives an invitation or administrator-controlled temporary credential.
2. The user follows the configured secure Auth flow.
3. Where temporary credentials are used, the first-login journey requires the user to set a private password before normal access.
4. The application verifies the authenticated Supabase identity and loads the matching application profile.
5. It resolves the system role, active account state and explicit capability grants from trusted application records.
6. The application opens the appropriate workspace.
7. On sign-out, account deactivation or session expiry, private screens and cached in-memory records are cleared.

Public team-member signup remains disabled. The Church Administrator provisions Mission Member accounts. No permanent password is visible to the Administrator or stored in plaintext.

The final login identifier and invitation/reset delivery approach are still stakeholder decisions in the decisions register. The interface must not hard-code an unapproved email-only or phone-only assumption.

### 3.2 System roles

There are exactly two application roles:

- **Church Administrator (ADMIN):** manages team accounts, capabilities, operational records, assignments, workflow configuration, communication settings, reporting and administrative controls.
- **Mission Member (MISSION_MEMBER):** performs assigned or explicitly shared follow-up work and uses additional functions only when the Administrator grants the relevant capability.

Welcome Team, Missions Leader, Pastor and registration duty-holder are ministry responsibilities, not extra system roles.

### 3.3 Capability model

The interface should resolve capabilities centrally and use them to determine available actions. The database and trusted operations must independently recheck them.

| Capability | Enables | Does not automatically enable |
|---|---|---|
| VISITOR_REGISTER | Register a new visitor | Browse the entire visitor directory |
| ATTENDANCE_RECORD | Record attendance for a visitor the user can access | Search every visitor |
| VISITOR_DIRECTORY_VIEW | Search the broad visitor directory within the approved policy | Read restricted pastoral records |
| SMS_SEND | Initiate permitted outbound SMS for an accessible visitor | Send to opted-out or suppressed recipients |
| CONSENT_MANAGE | Manage consent records within the user's authorized scope | Ignore consent history or legal requirements |
| INTEGRATION_RECORD | Record permitted integration-stage or programme activity | Read unrelated pastoral details |
| PASTORAL_VIEW | Qualify for access to restricted pastoral records | Read every restricted record without a record-specific grant |
| PASTORAL_RECORD | Create permitted restricted pastoral records | Grant other users access |
| REPORT_EXPORT | Export reports permitted by the user's scope | Export every row or restricted narrative |

### 3.4 Permission enforcement layers

| Layer | Control |
|---|---|
| Navigation | Hide or disable unavailable modules to reduce confusion |
| Route | Redirect users who cannot use a page |
| Feature/action | Explain why an action is unavailable; validate form permissions |
| Edge Function | Verify JWT/session, account status, role, capability and record scope |
| Database | Enforce RLS, grants, constraints and permitted write scope |
| Audit | Record privileged actions and access-management changes using safe metadata |

A successful screen load is not evidence that later operations will be permitted. Authorization must be checked at the time of each operation.

### 3.5 Sensitive pastoral data

Prayer requests and faith-commitment details must be displayed in a separate restricted area, not mixed into ordinary notes, dashboard previews, SMS content or broad reports. Access requires the relevant capability and an active record-specific grant. A user who lacks either must not receive the record body through a query, notification, export or error payload.

---

## 4. Information architecture and navigation

Navigation should reflect the work each role performs, not expose every database entity as a menu item.

### 4.1 Mission Member navigation

**Primary mobile navigation**

1. **Today** — personal summary, due tasks, overdue tasks and quick actions.
2. **Visitors** — assigned and explicitly shared visitor list.
3. **Tasks** — follow-up work grouped by due state.
4. **More** — notifications, notes/activity, profile and sign-out; authorized registration and attendance actions appear here or as contextual actions.

On wider screens, use a compact left navigation rail/sidebar with the same information hierarchy. The current user's name and account status should remain accessible without dominating the workspace.

### 4.2 Church Administrator navigation

**Primary navigation groups**

- **Overview:** operational dashboard and urgent exceptions.
- **Visitors:** directory, unassigned visitors, visitor profile and registration.
- **Assignments:** current ownership, collaborators, handovers and assignment history.
- **Follow-up:** tasks, workflows, workflow instances and escalation rules.
- **Communication:** SMS templates, outbox/message history, delivery failures and provider configuration.
- **Team:** Mission Member accounts, access capabilities and account status.
- **Integration:** stages, programmes, enrolments and programme attendance.
- **Reports:** operational metrics and authorized exports.
- **Administration:** notifications, audit activity, privacy-related configuration and general settings.

The navigation must not use a third role or ministry-duty-specific portal. Capability differences belong within the two-role model.

### 4.3 Contextual navigation

A visitor profile should expose only the sections relevant to that visitor and the current user's access. Use contextual tabs or sections such as Overview, Attendance, Follow-up, Communication, Integration and Notes. Restricted pastoral information must be a separately authorized destination and not merely another ordinary tab shown to all users.

---

## 5. Screen inventory

The inventory below is the planned application scope. It is not a claim that these screens already exist.

### 5.1 Shared authentication and account screens

| Screen | Primary user | Main content and actions |
|---|---|---|
| Sign in | Both | Approved login identifier, password, visibility toggle, validation and recovery link |
| Invitation acceptance | Invited Mission Member | Secure invitation validation, profile confirmation and credential setup |
| First-login setup | Temporary-credential user | Set private password and confirm completion |
| Forgot password | Both | Request a secure reset using the approved identifier |
| Reset password | Both | Validate reset link/token and set a new password |
| Session expired | Both | Explain expiry and return to sign-in without exposing prior private content |
| Access denied | Both | Explain that the account lacks permission and direct the user to contact the Administrator |
| Account disabled | Both | Clear access explanation and support contact path |

### 5.2 Mission Member screens

| Screen | Main content and actions |
|---|---|
| Today dashboard | Due today, overdue, upcoming, recent activity and permitted quick actions |
| My visitors | Assigned visitors, collaborator-shared visitors, status filters and search within permitted scope |
| Visitor detail | Core contact details, preferences, assignment summary and relevant visit/follow-up history |
| Register visitor | Short mobile-first form, consent capture, duplicate review and save confirmation; shown only with VISITOR_REGISTER |
| Record attendance | Select accessible visitor, service/date and attendance details; shown only with ATTENDANCE_RECORD |
| Task list | Due, upcoming, overdue, in-progress and completed work |
| Task detail | Visitor context, action instructions, due time, assignment and task history |
| Record call or visit | Outcome, summary, visitor response, next action and next follow-up date |
| Compose SMS | Recipient and content preview, approved template selection, consent/suppression check and explicit send confirmation; shown only with SMS_SEND |
| Visitor activity | Authorized calls, visits, tasks, attendance and communication history |
| Internal note | Add a team-only note within the user's assignment scope |
| Notifications | Assigned task alerts, handover updates and relevant operational messages |
| Profile and security | Personal profile, password/security actions and sign-out |

### 5.3 Church Administrator screens

| Screen | Main content and actions |
|---|---|
| Administrator overview | New visitors, unassigned queue, overdue work, team workload, follow-up outcomes and communication exceptions |
| Visitor directory | Authorized organization-wide search, filters and visitor creation entry point |
| Unassigned queue | Visitors requiring an owner, intake age, assignment action and queue filters |
| Visitor detail | Complete operational profile, attendance, assignment history, tasks, interactions, consent and integration |
| Register visitor | Administrator registration form and duplicate-resolution flow |
| Assignment workspace | Current primary owners, unassigned visitors, workload and active collaborators |
| Assign visitor | Select active Mission Member, add optional collaborators and select applicable workflow |
| Handover | Choose new primary owner, review open tasks, decide transfer/retention/cancellation and record reason |
| Team directory | Active/inactive members, account state, capability summary and account detail |
| Create/invite member | Create a Mission Member identity through trusted provisioning; no permanent password display |
| Member access detail | Activate/deactivate, initiate reset, manage allowed capability grants and view access history |
| Follow-up tasks | Organization-wide task search, overdue filters, reassignment and exception review |
| Workflow definitions | Configure active workflow, ordered steps, channel and timing |
| Workflow detail | Step configuration, approval state, eligibility and active instances |
| SMS templates | Draft, edit, approve, activate and retire reusable templates |
| SMS outbox | Manual/automated messages, submission state, provider reference and failure reason |
| SMS operations | Provider status, usage/cost summary, low-credit warnings and test configuration |
| Integration stages | Stage definitions, order and completion criteria |
| Programmes | Programme definitions, enrolments, sessions and attendance |
| Reports | Date-filtered operational metrics, team workload and permitted CSV export |
| Notifications and alerts | Unassigned, overdue, repeated unsuccessful contact, SMS failure and support alerts |
| Audit activity | Privileged actions and security-relevant event history |
| Settings | Approved church details, time zone, follow-up rules, notification preferences and operational safeguards |

### 5.4 Screen states required for every applicable feature

Do not design only the successful-data state. Each data-backed screen must define:

- initial loading and skeleton state;
- first-use empty state with a useful next action;
- no search/filter matches;
- inline validation and field-level error;
- recoverable network or provider failure;
- permission denied or record no longer accessible;
- stale data or concurrent update conflict;
- success confirmation and resulting next step;
- destructive-action confirmation where relevant.

A failed request must not leave a spinner running indefinitely or imply that a write succeeded.

---

## 6. Core user journeys

### 6.1 Journey A — Visitor registration to assignment

**Actors:** authorized Mission Member, then Church Administrator.

1. Member opens Register Visitor from Today or the Visitors workspace.
2. The form collects minimum required contact and visit details and the appropriate consent/preference information.
3. Phone input is normalized where possible to Ghana international format; it remains a matching signal, not a unique-person key.
4. A duplicate review presents likely matches with enough non-sensitive context for the user to decide.
5. The user selects an existing person only after review, or confirms creation of a new visitor profile.
6. The application saves the visitor and initial attendance event in a controlled operation so the records cannot become inconsistent.
7. The Administrator sees the visitor in the unassigned queue.
8. The Administrator opens Assign Visitor, selects one active Mission Member and optional collaborators, reviews the workflow and confirms.
9. The system creates the assignment/history and workflow tasks idempotently and notifies the relevant users.
10. The Mission Member sees the visitor and first follow-up action in Today.

**Acceptance checks:** no silent merge; repeated visits append attendance; one active primary assignment; registration permission does not grant directory-wide search; the assigned member gains only the intended record scope.

### 6.2 Journey B — Follow-up task to next action

**Actor:** Mission Member.

1. Member opens a due task from Today.
2. Task detail shows the permitted visitor context, contact preferences, assignment and previous follow-up activity.
3. Member performs a call or visit, or chooses SMS where permitted.
4. For calls/visits, the member records the actual attempt after it occurs. For SMS, the member previews the recipient and exact message and explicitly confirms.
5. The system stores an actual interaction separately from the planned task.
6. Member records an outcome, visitor response, summary and next action.
7. The current task is completed, rescheduled or otherwise updated as appropriate.
8. The next task is created only when the workflow/business rule requires it, with an idempotency key.
9. The visitor timeline and responsible user's task list refresh.

**Acceptance checks:** an attempted call is not silently treated as successful contact; SMS submission/delivery is not classified as a human conversation; actual interactions and task history remain attributable.

### 6.3 Journey C — Assignment handover

**Actor:** Church Administrator.

1. Administrator opens the current assignment.
2. System shows the previous primary owner, collaborators, open tasks and recent operational context the Administrator is allowed to see.
3. Administrator chooses a new active Mission Member and records a handover reason.
4. For every open task, the Administrator chooses transfer, retain under a supported historical access rule, reschedule or cancel.
5. Administrator reviews the summary and confirms the handover.
6. A single trusted operation updates the assignment, appends history, applies task decisions and creates notifications.
7. Previous ownership and completed activity remain in history.

**Acceptance checks:** no interval with two active primary owners; handover is atomic; historical interactions are not rewritten; retained-task access is limited to the specific task and ends when completed/cancelled.

### 6.4 Journey D — Mission Member account provisioning

**Actor:** Church Administrator.

1. Administrator selects Create/Invite Member.
2. Administrator enters the approved identity details and chooses allowed capability grants.
3. The application calls a trusted provisioning function.
4. The function verifies that the caller is an active Administrator, creates/invites the Auth identity, creates the application profile and records the access event.
5. The invited user completes the secure setup process and establishes a private password.
6. The member signs in and sees only the Mission Member workspace and explicitly granted capabilities.

**Acceptance checks:** public signup cannot create team accounts; the browser never receives an Auth service secret; Administrator cannot view a permanent password; partial provisioning is handled safely and can be reconciled.

### 6.5 Journey E — Automated SMS

**Actors:** scheduler, trusted server-side operation and provider.

1. Scheduler selects due workflow actions.
2. A trusted operation claims the item using a unique idempotency key or equivalent concurrency-safe mechanism.
3. Immediately before sending, it checks active workflow/assignment state, contactability, latest consent, opt-out/suppression, valid destination and template approval.
4. It creates a message snapshot and submits through the provider adapter.
5. It records the provider reference and submission result.
6. Authenticated provider callbacks append delivery events and update normalized message state idempotently.
7. Failures/suppressions are made visible to the responsible user or Administrator.
8. Retry occurs only under bounded rules for eligible transient errors.

**Acceptance checks:** duplicate scheduler execution does not send duplicate messages; an opt-out after scheduling but before sending suppresses the send; callback replay does not duplicate events; delivered is never labelled read or replied.

---

## 7. Frontend interaction and visual design direction

### 7.1 Product experience principles

- **Trustworthy and calm:** the interface should feel like an operational ministry tool, not a marketing landing page or a generic analytics template.
- **Task-first:** make the next action clear, especially on the Mission Member's phone.
- **Progressive disclosure:** show essential information first; place detail, history and advanced controls behind clear sections.
- **Respectful language:** use human language such as “Needs follow-up” or “Awaiting response,” never judgemental labels or automated spiritual assessments.
- **Consistent hierarchy:** use disciplined spacing, readable typography, predictable alignment and clear page titles.
- **Meaningful density:** show the information needed to act without turning every screen into a wall of cards.
- **Mobile-first forms:** keep registration and follow-up entry in short logical sections, use appropriate input types and preserve entered values after recoverable errors.
- **Accessible by default:** keyboard operation, visible focus, proper labels, meaningful validation, sufficient contrast and touch-friendly controls.

### 7.2 Layout behaviour

**Phone**
- One-column content layout.
- Compact persistent bottom navigation for the role's primary destinations.
- Full-width primary actions with secondary actions visually quieter.
- Forms arranged in short sections; avoid multi-column forms.
- Use full-screen or near-full-screen sheets for focused registration, attendance and follow-up tasks when this preserves context.
- Avoid cramped tables; use structured list rows and detail screens.

**Tablet**
- Expand content width while retaining a clear reading column.
- Use a collapsible navigation rail or sidebar.
- Convert dense lists to tables only when the additional columns remain readable.

**Desktop**
- Use a stable sidebar and a restrained top utility area.
- Place page title, context and primary action in a consistent header region.
- Use tables for administrative queues and reports where comparison is genuinely useful.
- Keep detail panels and modals within a controlled maximum width rather than stretching forms across the entire screen.

### 7.3 Visual system to establish during UI design

The UI design phase should define and document:

- semantic colour tokens for page background, surface, text, border, primary action, success, warning and destructive states;
- typography scale, font weights, line heights and numeric/text conventions;
- spacing scale and responsive breakpoints;
- button, input, select, checkbox, dialog, drawer, tabs, badge, alert and table patterns;
- status labels and status-to-semantic-colour mapping;
- icon usage rules using Lucide;
- focus, hover, pressed, disabled and loading states.

Do not invent or finalize official church branding, logo usage or brand colours without the church's approved assets. Do not rely on colour alone to communicate consent, task status, failure or access restrictions.

### 7.4 Interaction rules

- Every primary action has a visible, unambiguous result.
- Confirm before sending an SMS, completing a handover, deactivating an account or performing another consequential action.
- Do not ask for confirmation on ordinary reversible navigation.
- Use inline validation close to the field and preserve user-entered values on failure.
- For a potentially duplicate visitor, explain why a match was suggested and require human review.
- Use optimistic updates only for low-risk changes that can be rolled back safely; use explicit pending/success/failure states for consequential operations.
- Never show a success toast before the server confirms the write.
- Use pagination or incremental loading for large directories; do not download all visitors to the browser for client-side filtering.
- Avoid exposing private visitor details in notification previews, browser titles or URLs.

### 7.5 Accessibility acceptance target

Target WCAG 2.2 AA as the design and test reference. Verify semantic heading structure, keyboard focus order, focus visibility, form labels, error announcements, contrast, touch target usability, reduced-motion behaviour and screen-reader names. Accessibility testing must include actual keyboard and assistive-technology checks, not only an automated scanner.

---

## 8. Data access and application contracts

### 8.1 Data access principle

Use direct Supabase client queries only where the current user can perform the operation safely under RLS and the operation does not require privileged multi-step orchestration. Use a trusted server-side operation for administrative provisioning, ownership changes, external communication, scheduling and other sensitive transactional use cases.

The frontend must never use a service-role or secret key. Only the publishable key belongs in browser configuration. Authorization attributes must come from trusted application profile/grant records and backend checks, not editable user metadata.

### 8.2 Direct RLS-protected operations

Suitable candidates, subject to the committed table policies and tests:

- reading the current user's permitted profile and capability grants;
- reading assigned/shared visitor summaries within RLS scope;
- reading permitted visitor attendance and ordinary follow-up history;
- creating a permitted internal note in the current assignment scope;
- marking the current user's notification as read;
- recording authorized attendance or other simple records where the database policy safely enforces the full operation.

The application should use narrow selects, server-side pagination, typed filters and explicit ordering. Do not fetch sensitive columns when they are not needed.

### 8.3 Trusted server-side operations

The following operations are proposed contracts. Names are logical identifiers, not existing deployed function names.

| Proposed operation | Caller and authorization | Expected transactional responsibility |
|---|---|---|
| admin-provision-member | Active ADMIN | Create/invite Auth identity, profile and initial capability grants; record audit event; handle partial-failure recovery |
| admin-update-member-access | Active ADMIN | Activate/deactivate member, update permitted capability grants and record grant/revocation history |
| admin-initiate-password-reset | Active ADMIN for target account | Trigger secure Auth recovery/invitation process without revealing credentials |
| visitor-register | Authenticated user with VISITOR_REGISTER or ADMIN | Validate fields, run duplicate review support, create profile and initial visit consistently |
| attendance-record | Authenticated user with ATTENDANCE_RECORD or ADMIN and visitor access | Validate visitor scope and record attendance |
| visitor-assign | Active ADMIN | Validate active MISSION_MEMBER, create one primary assignment, history, workflow instance/tasks and notifications |
| visitor-handover | Active ADMIN | Serialize assignment change, end old assignment, create new assignment/history and process task decisions atomically |
| workflow-start-or-generate | Trusted system action or ADMIN | Start eligible workflow and generate tasks using idempotency keys; prevent duplicate active starts |
| follow-up-complete | Authenticated assigned/shared user | Validate task/visitor scope, record interaction, update task and generate any required next task consistently |
| sms-send | ADMIN or permitted Mission Member with SMS_SEND | Recheck consent/suppression and record-level access, snapshot recipient/content and submit using server-only provider credentials |
| sms-provider-webhook | Provider callback | Authenticate provider, validate payload, deduplicate event and append normalized delivery event |
| scheduler-dispatch-due-work | Trusted scheduler identity | Claim due workflow actions safely and invoke eligibility checks before each external effect |
| notification-dispatch | Trusted system event | Create notifications for authorized recipients without exposing sensitive content |
| report-export | ADMIN or user with REPORT_EXPORT plus row scope | Apply filters and permissions server-side, create auditable export and avoid restricted fields |

### 8.4 Standard operation contract

Each operation should have a documented request schema, response schema, authorization rule, idempotency behaviour and error catalogue before implementation. Common conventions:

- Use a request correlation identifier for tracing.
- Return a stable machine-readable error code and a safe user-facing message.
- Distinguish unauthenticated, forbidden, not found, validation failure, conflict, rate limit, provider failure and unexpected failure.
- Do not reveal whether a restricted visitor record exists when the caller is not allowed to know.
- Validate and normalize input on the server even when the browser has already validated it.
- Use idempotency keys for operations that may be retried or invoked by a scheduler/webhook.
- Keep transaction boundaries around multi-record business operations.
- Never return secrets, full restricted notes or provider raw credentials.

Example stable error categories: UNAUTHENTICATED, ACCOUNT_DISABLED, FORBIDDEN, VALIDATION_ERROR, DUPLICATE_REVIEW_REQUIRED, NOT_FOUND_OR_NOT_ACCESSIBLE, CONFLICT, IDEMPOTENCY_CONFLICT, CONSENT_REQUIRED, RECIPIENT_SUPPRESSED, PROVIDER_UNAVAILABLE, RATE_LIMITED and INTERNAL_ERROR.

### 8.5 Database and RLS requirements

- Keep RLS enabled on every exposed application table.
- Policies must be table-specific and reflect assigned/shared record scope, explicit capabilities and restricted record grants.
- Mission Member registration/attendance permission must not imply directory-wide access.
- UPDATE policies require correct SELECT visibility and both USING and WITH CHECK protection.
- Views that must preserve caller access should use security-invoker semantics where supported; do not assume a view automatically preserves RLS.
- Avoid SECURITY DEFINER as a shortcut around an access error. Any genuinely required privileged function must be isolated, explicitly authorized, narrowly granted and security-reviewed.
- Authorization helper functions must not depend on user-editable metadata.
- Do not grant broad client DELETE rights for historical business data. Prefer explicit state transitions, revocation and archival.
- Every access-control change requires regression tests for both allowed and denied cases.

The committed database implementation and its 36-test local CI result remain the current foundation. Any mismatch found between this blueprint and the actual migrations/tests must be resolved by reviewing the schema and versioning an approved change—not by assuming the blueprint silently changes the database.

---

## 9. Backend workflows and integrations

### 9.1 Assignment transaction

The application must treat assignment as a business transaction rather than a sequence of independent browser writes. Validate the visitor and active Mission Member, ensure there is no conflicting active primary assignment, create the assignment and history, start the approved workflow where appropriate, generate tasks idempotently and create notifications. On failure, do not leave a half-assigned visitor or duplicate task set.

### 9.2 Follow-up task lifecycle

A task describes planned work; a follow-up record describes an actual attempt or interaction. A task may have multiple attempts. Status changes, rescheduling, cancellation and reassignment must append task history.

Overdue should be derived from an open task's due time and the church's configured time zone, rather than treated as a separate visitor lifecycle state. The application should distinguish task due state from visitor engagement and integration stage.

### 9.3 Scheduled workflow execution

Use a scheduler abstraction so the business rules are not coupled to a particular cron implementation. The selected scheduling mechanism must support concurrency-safe claiming, retries, monitoring and idempotent execution. The precise Supabase scheduler mechanism and configuration are to be selected and verified during implementation; do not assume that a schedule is active merely because a workflow definition exists.

Every scheduled action must re-evaluate eligibility at send/execute time. Paused workflows, changed assignments, changed consent, suppression, invalid phone numbers, cancelled tasks and duplicate keys must be handled safely.

### 9.4 SMS provider adapter

Provider selection is still open. Evaluate Ghana coverage, sender ID approval, API documentation, delivery callbacks, message segmentation, support, pricing, billing/credit monitoring and data-processing terms before selecting a provider. Hubtel and Arkesel may be evaluated; neither is approved by this blueprint.

Define an internal provider-neutral interface with operations equivalent to:

- submit an outbound message;
- verify and normalize provider callbacks;
- query status where supported;
- normalize provider errors and delivery states;
- report cost/segment data where available.

The provider-specific implementation must live server-side. Manual and automated sends must use the same consent, suppression, snapshot, audit and idempotency safeguards. Inbound SMS replies remain out of scope.

### 9.5 Notification strategy

The first release should prioritize in-app notifications for due tasks, assignment/handover changes, unassigned visitors, overdue work, SMS failure and administrator review. Email or push notifications remain open decisions. Any later push notification must avoid including private visitor or pastoral details in the notification body.

### 9.6 Search, duplicate review and phone handling

Normalize telephone numbers to a consistent international representation where possible, including Ghana country code +233. Do not assume a phone number uniquely identifies a person; relatives may share a telephone. Duplicate detection should produce a reviewable suggestion based on appropriate matching signals. The system must not merge records automatically or expose restricted data through match suggestions.

---

## 10. Progressive Web App and connectivity behaviour

### 10.1 Installability

The PWA should provide a valid web app manifest, product name, approved application icons, theme/background settings and a service worker for the application shell. Install prompts must be presented only where the browser supports installation; do not show an inert install control on unsupported platforms.

### 10.2 Offline boundary

The initial release is online-required for visitor and operational data. Cache only versioned static assets and the minimal application shell. Do not use service-worker runtime caching for authenticated API responses, visitor profiles, pastoral records, SMS content, exported reports or other personal data.

When connectivity is lost:

- show a clear connection banner or blocked state;
- disable actions that cannot be confirmed by the server;
- preserve unsent form input only in current in-memory state where safe;
- do not claim that an attendance, assignment, follow-up or SMS action was saved;
- retry only when the user can see and understand the retry state.

Offline data synchronization and durable offline form queues are out of scope until a separate threat model and conflict-resolution design are approved.

---

## 11. Environments, hosting and release process

### 11.1 Environment separation

| Environment | Purpose | Data |
|---|---|---|
| Local | Developer work, local Supabase stack and automated tests | Synthetic fixtures only |
| Staging | Hosted integration, Auth redirects, Edge Function tests, RLS testing and acceptance review | Synthetic or explicitly approved test data |
| Production | Approved operational service | Minimum necessary live church data after pilot approval |

Each hosted environment must have its own Supabase project and credentials. ChurchConnect must never be linked to SkillSprint. The currently available SkillSprint Supabase project is unrelated and must not be changed.

### 11.2 Proposed deployment arrangement

- Frontend: Vercel deployment from the GitHub repository after the application project is established.
- Database/Auth/Edge Functions: dedicated Supabase project for ChurchConnect.
- Source control: GitHub as the canonical source for application code, migrations, tests, documentation and workflow definitions.
- SMS: selected Ghana-capable provider behind a server-side adapter.
- Domain: church-approved domain or subdomain; decision pending.

### 11.3 Environment variables and secrets

The browser may receive only the Supabase project URL and publishable key through the appropriate Vite environment configuration. Any variable exposed to the browser build must be considered public.

The following remain server-only: Auth service-role/secret keys, SMS credentials, webhook secrets, signing keys and other privileged tokens. Store them in the hosting/function secret manager, not in source files, client environment variables, README examples or Git history. Rotate compromised secrets and document the owner/rotation procedure.

### 11.4 Branching and release discipline

- Keep main deployable and protected by review/testing appropriate to the repository.
- Use small feature branches or pull requests for implementation slices.
- Run type checks, lint, unit tests, integration tests and relevant database tests before merge.
- Apply migrations in timestamp order and review migration diffs.
- Use a staging deployment before production for authentication, RLS, functions, webhooks and responsive flows.
- Do not use production visitor data in previews or automated test fixtures.
- Maintain a release note and rollback/recovery approach for each production release.

### 11.5 Observability and operations

Monitor application errors, failed sign-ins, disabled-account access attempts, Edge Function errors, database failures, scheduler backlog, SMS submission failures, webhook verification failures and unusual permission-denied patterns.

Logs should include correlation IDs, operation names, safe error codes and timestamps. Do not log passwords, tokens, full pastoral narratives, unnecessary phone numbers or raw SMS content unless a narrowly defined operational requirement and approved retention policy justify it.

Backups, restore testing, administrator succession, incident response and recovery targets must be approved before live use.

---

## 12. Privacy, security and Ghana context

The system will process personal contact information, attendance and potentially sensitive pastoral information. Privacy and security are launch requirements, not later enhancements.

Design and operation must be reviewed against the Ghana Data Protection Act, 2012 (Act 843), applicable Data Protection Commission guidance and the church's actual processing obligations. Obtain appropriate legal/privacy advice to confirm registration, notice, lawful basis, consent, retention, data-subject handling and vendor arrangements. This blueprint does not constitute a legal compliance determination.

### 12.1 Required safeguards

- Publish a church-approved privacy notice explaining purpose, information collected, use, retention, sharing and contact route.
- Record communication consent and withdrawal/opt-out history as events.
- Collect only fields needed for the stated ministry and operational purpose.
- Keep ordinary team notes separate from restricted prayer/pastoral records.
- Require capability plus record-specific grant for sensitive pastoral access.
- Use least-privilege RLS and trusted server-side operations.
- Keep privileged credentials server-side and rotate them under an assigned owner.
- Rate-limit sensitive operations and account recovery/provisioning endpoints.
- Validate webhook authenticity and deduplicate provider callbacks.
- Audit administrator access changes, handovers, exports and other defined privileged events.
- Define correction, retention, archival and deletion processes before pilot.
- Deactivate users without erasing the historical attribution of their work.
- Train team users on confidentiality, device security and appropriate note-taking.

### 12.2 Security test cases

At minimum, test that:

1. Anonymous users cannot read or write application records.
2. Mission Member A cannot read or alter Mission Member B's unrelated visitors, tasks or notes.
3. A collaborator can access only the scope granted by the active assignment.
4. A former assignee cannot retain general visitor access after handover; any explicitly retained task access is narrow and temporary.
5. VISITOR_REGISTER alone cannot list every visitor.
6. ATTENDANCE_RECORD alone cannot search the full directory.
7. An accessible visitor does not imply access to a restricted pastoral record.
8. PASTORAL_VIEW without a record-specific grant is denied.
9. A Mission Member cannot create accounts or change capability grants.
10. A deactivated account is denied by backend/database controls even with an already-open screen.
11. A forged or replayed webhook cannot change delivery state incorrectly.
12. A repeated scheduler invocation cannot send duplicate messages.
13. SMS is blocked after opt-out or consent withdrawal.
14. A user cannot export rows outside their authorized scope.
15. Restricted narratives do not leak into dashboard summaries, notification previews, logs or ordinary reports.

---

## 13. Reporting and metric definitions

Reports must use explicit definitions and date windows. Keep operational measures separate from spiritual or personal judgements.

| Metric | Proposed definition | Important qualification |
|---|---|---|
| New visitors | Distinct visitor profiles first recorded in the selected period | Do not count each attendance as a new person |
| Return visits | Recorded repeat attendance events after the first visit | Attendance does not by itself prove integration |
| Assignment rate | Visitors eligible for follow-up with an active primary assignment divided by visitors eligible for follow-up | Exclude records explicitly marked not requiring follow-up, using an approved rule |
| Follow-up completion | Due tasks completed within the selected period divided by tasks due in that period | State treatment of cancelled/rescheduled tasks |
| Successful contact | Follow-up records with a defined human-contact outcome divided by eligible contact attempts | SMS submission/delivery alone is not successful human contact |
| Overdue tasks | Open tasks whose due time has passed in the configured church time zone | Derive from task state and due time |
| Team workload | Open tasks and active primary assignments by Mission Member | Show workload as operational support, not performance ranking |
| SMS delivery | Provider-reported delivered messages divided by submitted messages with known final delivery state | Delivery does not mean read, understood or answered |
| SMS cost | Provider-reported or estimated message cost in the selected period | Label estimates and unavailable provider values clearly |
| Integration participation | Visitors recorded in a configured stage/programme under approved definitions | Do not infer integration from elapsed time |

Export must enforce the same access scope as in-app reporting, record the export event and exclude pastoral narrative fields unless explicitly approved for a narrowly authorized report.

---

## 14. Quality attributes and verification plan

### 14.1 Functional quality

- Form validation is consistent between client and server.
- Writes return clear success/failure states.
- Multi-step operations are transactional or safely recoverable.
- Duplicate-sensitive operations use idempotency keys.
- Statuses remain separate: visitor lifecycle, assignment, task, SMS and integration each have their own meaning.

### 14.2 Responsive and browser quality

Test at minimum:
- narrow phone widths around 360 CSS pixels;
- common Android phone widths around 390 CSS pixels;
- iPhone Safari and Android Chrome;
- tablet portrait and landscape;
- laptop and desktop browser widths;
- supported current versions of Chrome, Edge, Firefox and Safari as agreed for the pilot.

Test actual device keyboard behaviour, safe areas, browser autofill, input zoom, date/time entry, PWA installation capability and session restoration.

### 14.3 Test layers

| Layer | Coverage |
|---|---|
| Static checks | TypeScript, lint, dependency and build checks |
| Unit tests | Validation, formatting, status mapping, capability logic and report calculations |
| Component tests | Form behaviour, empty/error/loading states, dialogs and accessibility semantics |
| Service tests | Query contracts, error normalization and idempotency handling |
| Database tests | Migrations, integrity, RLS positive and negative cases through pgTAP |
| Edge Function tests | Caller authorization, request validation, transaction failures and secret isolation |
| Integration tests | Auth, assignment, handover, workflow generation, SMS adapter and webhooks |
| End-to-end tests | Complete Administrator and Mission Member journeys on mobile and desktop |
| Accessibility tests | Keyboard, screen reader, focus, contrast and reduced motion |
| Operational tests | Backup/restore rehearsal, scheduler recovery, provider outage and incident response |

The existing database CI result is a useful baseline, not a substitute for application, Edge Function, hosted staging or end-to-end testing.

### 14.4 Definition of Done for a feature

A feature is complete only when:
- the requirement and acceptance criteria are documented;
- screen states and responsive behaviour are implemented;
- TypeScript and validation contracts are complete;
- server/database authorization is enforced and negative-tested;
- loading, empty, failure and success states are handled;
- audit/history requirements are met;
- accessibility and mobile usability are reviewed;
- automated tests pass;
- no secrets or live visitor data are committed;
- documentation and README index are updated where the feature changes project behaviour.

---

## 15. Implementation sequence

This sequence refines, rather than replaces, the committed Implementation Roadmap.

| Sequence | Work package | Dependencies | Exit condition |
|---|---|---|---|
| 0 | Stakeholder decision closure | SRS and decisions register | Login/onboarding, capabilities, privacy and consent direction approved; remaining decisions have owners |
| 1 | UX information architecture and prototype | This blueprint and use cases | Mobile registration → assignment → follow-up prototype reviewed |
| 2 | Dedicated hosted Supabase staging | Organization/project approval and cost review | Separate ChurchConnect staging project, migrations applied, RLS and test suite verified |
| 3 | Frontend foundation and authentication | Approved UI system, staging Auth and environment configuration | Provisioned Administrator and Mission Member sign in with correct scope |
| 4 | Team administration and capabilities | Auth and trusted provisioning | Administrator can provision, deactivate and manage capabilities securely |
| 5 | Visitor registration, profile and attendance | Auth, RLS and screen designs | Synthetic visitor registered, duplicate review completed and attendance recorded |
| 6 | Assignment and handover | Visitor records and transaction design | One primary owner; collaborators and safe handover verified |
| 7 | Follow-up tasks and interaction history | Assignment and workflow model | Complete synthetic follow-up journey with task history and outcomes |
| 8 | Dashboards and in-app alerts | Stable operational event data | Role-specific Today and Administrator exception queues work accurately |
| 9 | Manual SMS and provider selection | Provider, sender identity, pricing, consent and legal review | Controlled test message, delivery callback and suppression tests pass |
| 10 | Workflow automation and advanced reporting | Reliable task events and scheduler decision | Idempotent scheduled work and approved metrics verified |
| 11 | Pilot readiness | All previous packages | Security/privacy/accessibility review, training and recovery gates approved |
| 12 | Production launch | Formal church authorization | Production checks pass and ongoing owners are named |

### 15.1 Recommended first implementation slice

Do not build every dashboard, report and SMS feature at once. The first end-to-end slice should be:

**Administrator provisions a Mission Member → member signs in → authorized member registers a synthetic visitor → Administrator assigns the visitor → member sees the task → member records a call/visit outcome → the visitor timeline and task history update.**

This slice validates identity, roles, capability grants, visitor access, registration, assignment, RLS, task creation, interaction recording and the essential mobile experience before external SMS cost is introduced.

---

## 16. Open decisions and design dependencies

The following remain open and must be resolved by the named stakeholders in the current decisions register. This blueprint does not silently decide them.

| Decision | Why it matters to implementation | Current status |
|---|---|---|
| Login identifier and onboarding method | Defines sign-in fields, invitation and reset flow | Open |
| Church identity, approved logo and colours | Defines final visual identity and product assets | Open |
| Mission Member capability allocation | Determines route/action visibility and server authorization | Open |
| Follow-up cadence and quiet hours | Determines workflow step schedules | Open |
| Escalation thresholds | Determines alerts and Administrator queues | Open |
| SMS provider, sender identity and billing owner | Determines API adapter, webhook and cost controls | Open |
| Privacy notice and consent wording | Required before real visitor contact data and messaging | Open |
| Retention, correction and deletion policy | Determines operational lifecycle and legal response | Open |
| Integration stages and completion criteria | Determines stage UI and report definitions | Open |
| Hosting, domain, backup and recovery targets | Determines staging/production infrastructure | Open |
| Email or push notification requirement | Determines notification channel scope | Open |

---

## 17. Immediate next actions

1. Review this blueprint alongside the SRS, database design and implementation roadmap; record corrections rather than treating this proposal as automatic stakeholder approval.
2. Resolve the authentication identifier/onboarding method and approve a named Mission Member capability matrix.
3. Produce mobile-first wireframes and a clickable prototype for registration, duplicate review, assignment, handover and follow-up completion.
4. Confirm official church branding assets and the design direction before finalizing colour, typography and icon tokens.
5. Review the dedicated ChurchConnect Supabase staging proposal and any quoted cost before project creation. The existing SkillSprint Supabase project must remain untouched.
6. Evaluate Ghana-capable SMS providers and their pricing/approval requirements, without enabling live sends.
7. After decisions and UX review, implement the first end-to-end synthetic-data slice in the order defined in Section 15.1.

---

## 18. References and relationship to existing repository artifacts

- [Software Requirements Specification v1.0](ChurchConnect_SRS_v1.0.md)
- [Logical Database Design v1.1](DATABASE_DESIGN_v1.1.md)
- [Editable Crow’s Foot ERD v1.1](database/ChurchConnect_ERD_v1.1.drawio)
- [Use Cases and Activity Models v1.0](USE_CASES_AND_ACTIVITY_MODELS_v1.0.md)
- [Stakeholder Decisions Register](STAKEHOLDER_DECISIONS.md)
- [Supabase Database Implementation Guide v1.0](SUPABASE_DATABASE_IMPLEMENTATION_v1.0.md)
- [Implementation Roadmap v1.0](IMPLEMENTATION_ROADMAP_v1.0.md)

**Implementation status note:** the repository currently contains the SRS, logical/physical database design, ERD, use-case models, three Supabase migrations, RLS policies, pgTAP tests and a GitHub Actions database-test workflow. The latest recorded CI verification passed 36 database tests in a clean local Supabase environment. This is not a hosted ChurchConnect deployment. The frontend, hosted ChurchConnect staging project, trusted application Edge Functions and SMS provider integration remain future implementation work.
