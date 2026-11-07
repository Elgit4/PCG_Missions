# ChurchConnect — Implementation Roadmap

**Version:** 1.0  
**Date:** 7 November 2026  
**Status:** Proposed delivery plan for review  
**Repository:** `Elgit4/PCG_Missions`

## 1. Purpose

This roadmap turns the approved SRS, logical database design, ERD, use-case models and tested PostgreSQL package into a staged implementation plan.

It is a planning document, not evidence that the hosted database, application screens, SMS integration or production deployment already exist.

## 2. Current project baseline

| Area | Current state |
|---|---|
| Project scope | One church; approximately 20–50 new visitors monthly as a planning estimate |
| System roles | Exactly Church Administrator and Mission Member |
| Requirements | SRS v1.0 committed; draft pending church stakeholder approval |
| Logical database design | v1.1 committed and aligned with current schema package |
| ERD | Editable Crow’s Foot ERD v1.1 committed |
| Use cases and activities | v1.0 committed |
| PostgreSQL implementation | Three migrations, 34 application tables and RLS policies committed |
| Automated database tests | GitHub Actions run 42390055203 passed; 36 pgTAP tests, zero failures |
| Hosted ChurchConnect database | Not deployed; a dedicated Supabase project is still required |
| Application frontend | Not yet implemented as part of this delivery plan |
| SMS provider | Not selected |
| Production data | No live church visitor data should be entered before the security and privacy gates are met |

The successful CI run verifies migration application and database tests in a clean local Supabase environment. It does not prove deployment to a hosted ChurchConnect project.

## 3. Delivery principles

1. **Repository-first:** source code, migrations, test suites, diagrams and project documents are committed to this repository.
2. **No cross-project database changes:** ChurchConnect migrations must never be applied to SkillSprint or another unrelated Supabase project.
3. **Security before convenience:** backend authorization and RLS must be correct before role-specific screens are treated as complete.
4. **Mobile-first:** common workflows must be designed and tested at phone widths before desktop refinement.
5. **Small, reviewable increments:** implement and verify one end-to-end capability slice at a time.
6. **No real visitor data during development:** use synthetic records until the pilot-readiness gates are approved.
7. **Human accountability:** automation may schedule and alert, but it must not infer personal engagement or make pastoral decisions.
8. **Costs are explicit:** hosting, database plan, email delivery and SMS credits must be reviewed before paid services are enabled.

## 4. Phase plan

### Phase 0 — Stakeholder decisions and scope sign-off

**Objective:** close the decisions that materially affect authentication, permissions, workflows and privacy.

| Decision | Required output | Priority |
|---|---|---|
| Church identity and branding | Official church name, logo, contact details and approved naming | Before interface design |
| Login identifier and onboarding | Approved login identifier, invitation method, password-reset and first-login flow | Before authentication implementation |
| Mission Member permissions | Named capability matrix for registration, attendance, directory search, SMS, integration and sensitive records | Before access-control UI |
| Follow-up cadence | Approved timing, channels, quiet hours, stop rules and escalation thresholds | Before workflow automation |
| SMS provider | Provider selection, sender identity requirements, API/webhook support, pricing and credit owner | Before live SMS |
| Consent and privacy notice | Approved wording, purposes, channels, withdrawal and opt-out process | Before live visitor data |
| Data retention | Retention, correction, export, archive and deletion procedure | Before pilot |
| Integration criteria | Stage names, programme definitions and completion rules | Before integration reporting |
| Deployment approach | Dedicated Supabase project, hosting, domain, backup and recovery targets | Before staging |

Maintain decisions in [STAKEHOLDER_DECISIONS.md](STAKEHOLDER_DECISIONS.md). No open item should silently become a hard-coded product rule.

**Exit criteria:** login approach, capability model and privacy/consent direction are approved; the remaining decisions have an owner and target date.

### Phase 1 — Product architecture and mobile-first UX blueprint

**Objective:** establish exactly what users will see and how they will move through the system before building screens.

#### 1.1 Application architecture

- Confirm frontend application structure, routing, session handling and data-access boundaries.
- Define typed contracts for visitor, attendance, assignment, task, interaction, SMS and integration data.
- Define which actions use direct RLS-protected database access and which must go through trusted server-side operations.
- Define loading, empty, error, permission-denied and offline/network-loss states.
- Establish environment separation for local development, staging and production.

#### 1.2 Screen inventory

**Shared authentication**
- Sign in.
- Invitation/first-time account setup.
- Password change where temporary credentials are used.
- Forgot/reset password.
- Session expiry and access-denied handling.

**Mission Member workspace**
- Personal dashboard and today's tasks.
- Assigned visitors and explicitly shared visitors.
- Visitor profile with permitted attendance and contact history.
- Visitor registration when the registration capability is granted.
- Attendance recording when authorized.
- Follow-up task details and completion.
- Call/visit outcome recording.
- Manual SMS composition and confirmation when permitted.
- Internal notes and collaboration activity.
- Notifications and handover requests.

**Church Administrator workspace**
- Operational dashboard.
- New/unassigned visitor queue.
- Visitor directory and complete visitor profile.
- Primary assignment and collaborator management.
- Mission Member accounts and capability grants.
- Follow-up workflow and escalation configuration.
- SMS templates, message history, usage and provider settings.
- Integration stages and programme management.
- Team workload, reports and exports.
- Audit activity, privacy-related controls and system settings.

#### 1.3 UX deliverables

- Mobile-first information architecture and navigation map.
- Screen-by-screen wireframes for the highest-frequency workflows.
- Responsive high-fidelity screen designs for phone, tablet and desktop.
- Form validation, confirmation, error and empty-state specifications.
- Shared component and visual-token specification.
- Accessibility review for contrast, keyboard focus, labels and touch targets.
- Clickable prototype for visitor registration, assignment and follow-up.

**Exit criteria:** the Administrator and Mission Member journeys are reviewed; core mobile screens and permission-dependent states are approved before frontend implementation.

### Phase 2 — Dedicated Supabase staging foundation

**Objective:** create an isolated hosted environment and deploy the tested schema without touching unrelated projects.

1. Confirm the El_Tech organization is the intended owner and review the actual project plan/cost before creating a hosted project.
2. Create a dedicated ChurchConnect Supabase project; do not reuse SkillSprint.
3. Configure approved Auth providers, redirect URLs, email templates and authentication limits.
4. Configure separate local/staging/production environment variables.
5. Apply the committed migrations to staging in timestamp order.
6. Run the database test suite and security/performance advisors on staging.
7. Bootstrap the first Church Administrator through a controlled process.
8. Verify RLS using separate Administrator and Mission Member test identities.
9. Confirm backups, restore approach, database region and access to operational logs.

**Security rules**
- Never put a service-role or secret API key in React, browser variables or the repository.
- All privileged account provisioning, handovers, scheduled automation and SMS submissions execute through trusted server-side operations.
- The first Administrator must be provisioned deliberately; public team self-registration remains disabled.
- Keep Supabase project references and secrets in environment configuration, not source code.

**Exit criteria:** staging schema is deployed, migrations are recorded, tests/advisors are reviewed, and the first Administrator can sign in securely.

### Phase 3 — Application foundation and account management

**Objective:** implement the application shell and secure access model.

Deliver:
- React + TypeScript + Vite application structure.
- Tailwind CSS and shadcn/ui component foundations.
- Responsive layouts, navigation and route protection.
- Supabase client using a publishable key only.
- Session restoration, sign-in, sign-out and password reset.
- Administrator-only Mission Member provisioning via a trusted server-side function.
- First-login setup for temporary credentials, where that onboarding method is selected.
- Account activation/deactivation and capability management.
- Role-aware, capability-aware navigation with server/database enforcement.

**Verification**
- Only provisioned accounts can use the application.
- Exactly two application roles are accepted.
- Mission Members cannot provision accounts or change role/capability grants.
- A deactivated user is denied by RLS/backend checks, even if a stale UI remains open.
- Direct API requests cannot bypass screen-level permissions.

**Exit criteria:** two test users can sign in and see only the correct navigation and data access for their role/capabilities.

### Phase 4 — Core visitor operations

**Objective:** deliver the first useful ministry workflow without external SMS dependency.

Implement in this order:
1. Visitor registration with consent capture and duplicate review.
2. Visitor directory search limited by explicit permissions.
3. Visitor profile and editable contact details with audit history.
4. Attendance event recording against the existing visitor profile.
5. Administrator unassigned queue.
6. Manual primary assignment and optional collaborators.
7. Assignment handover with preservation of previous ownership and open-task decisions.

**Verification**
- Repeated visits append to one visitor profile.
- Shared telephone numbers do not automatically merge family members.
- Registration capability does not implicitly grant directory-wide search.
- Only one active primary assignment is permitted.
- A handover never deletes attendance or interaction history.

**Exit criteria:** an authorized user can register a synthetic visitor, the Administrator can assign the person, and the Mission Member can access the permitted profile.

### Phase 5 — Follow-up operations and team collaboration

**Objective:** support daily follow-up work and accountability.

Implement:
- Configurable workflow definitions and ordered steps.
- Visitor workflow instances.
- Manual and workflow-generated follow-up tasks.
- Task status, due dates, reminders and rescheduling.
- Actual call and personal-visit interaction records.
- Structured visitor responses and next actions.
- Internal team notes separated from visitor-facing communication.
- Task reassignment and task-change history.
- Unassigned, overdue and repeated-unsuccessful-contact alerts.
- Administrator workload dashboard and Mission Member task dashboard.

**Verification**
- Task generation is idempotent.
- An actual contact record is distinct from a planned task.
- A visitor cannot be marked successfully contacted merely because an SMS was submitted or delivered.
- Mission Members cannot see another member's unrelated tasks.
- Repeated unsuccessful contact triggers human review rather than automatic abandonment.

**Exit criteria:** the team can complete a synthetic visitor journey from assignment through multiple follow-up attempts and handover.

### Phase 6 — SMS integration

**Objective:** provide controlled manual SMS first, then scheduled automation.

**6.1 Provider selection**
- Compare Ghana delivery coverage, sender-ID approval, API documentation, webhook support, message segmentation, support and cost.
- Confirm how provider credit, billing and low-balance alerts will be handled.
- Confirm permitted message categories and opt-out wording.

**6.2 Manual SMS**
- Approved templates and personalization.
- Recipient/content preview and explicit confirmation.
- Server-side provider adapter.
- Message content and recipient snapshots.
- Provider reference, submission result and error logging.
- Usage/cost reporting where provider data allows.

**6.3 Scheduled SMS**
- Approved workflow step and scheduled message.
- Re-check consent, opt-out, valid phone number, visitor status and idempotency immediately before submission.
- Bounded retry for eligible transient failures.
- Signed/authenticated webhook handling and append-only delivery events.
- Pause, cancel and suppression controls.

**Exit criteria:** test messages are submitted and provider callbacks are verified; opt-outs and duplicate automation events are blocked. Live messaging begins only after provider, sender identity, consent and cost controls are approved.

### Phase 7 — Integration, reporting and operational administration

**Objective:** complete the visitor journey and management visibility.

Implement:
- Church-defined integration stages and stage-history.
- Orientation, discipleship and programme enrolment.
- Programme session attendance and completion.
- Administrator operational reports.
- Mission Member personal workload summaries.
- Visitor registration, return attendance, task completion, contact outcome and SMS metrics.
- CSV export with authorization and audit.
- System settings and approved escalation thresholds.

**Verification**
- Integration is not inferred solely from elapsed time.
- Reports use documented denominators and date windows.
- SMS delivery rate is not labelled a successful-contact rate.
- Exports contain only rows the requesting user is authorized to access.

**Exit criteria:** all agreed operational reports reconcile with synthetic records and metric definitions approved by the church.

### Phase 8 — Quality assurance, security review and pilot

**Objective:** establish that the product is safe and usable before live visitor records are introduced.

Testing scope:
- Database migration and pgTAP regression suite.
- Unit and component tests for validation, status handling and permissions.
- Integration tests for auth, database operations and server-side functions.
- End-to-end tests for Administrator and Mission Member workflows.
- RLS negative tests using direct queries/API calls, not only UI interactions.
- Mobile browser testing on Android and iOS, including 360–390 CSS pixel layouts.
- Tablet and desktop responsive checks.
- Keyboard, screen-reader labels, focus, contrast and error-state checks.
- SMS provider failure, timeout, duplicate callback, opt-out and retry tests.
- Backup/restore rehearsal and account recovery exercise.

**Pilot entry gate**
- SRS and relevant stakeholder decisions approved.
- RLS and server-side authorization tests pass.
- No known critical/high security findings remain unresolved.
- Privacy notice, consent collection, data retention and export/deletion process approved.
- SMS provider/sender ID approved if SMS is enabled in the pilot.
- Staff training and support contact identified.
- Only approved, minimum necessary visitor data is introduced.

Start with a limited group of team users and controlled records. Collect feedback, fix issues and obtain church approval before wider use.

### Phase 9 — Production deployment and ongoing operations

- Deploy the approved frontend build to the chosen host and configure the production domain.
- Apply only reviewed migrations to the dedicated production Supabase project.
- Verify Auth redirect URLs, CORS, environment variables, RLS, Edge Function secrets and webhook URLs.
- Enable monitoring for failed logins, function failures, database errors, SMS failures and unusual access patterns.
- Confirm backup schedule, recovery contacts, administrator succession and incident-response process.
- Review user access and capability grants periodically.
- Review SMS cost and usage after launch.
- Keep database migrations and application releases version-controlled.

**Exit criteria:** production checks pass, church leadership authorizes launch, and an owner is assigned for ongoing administration and support.

## 5. Recommended MVP boundary

The first pilot should prioritize a complete, secure visitor-care loop rather than attempting every advanced feature at once.

### MVP must include
- Secure sign-in and Administrator-provisioned team accounts.
- Exactly two roles and explicit capability grants.
- Visitor registration, duplicate review, profile and consent history.
- Attendance history.
- Manual assignment, one primary owner and collaborators.
- Follow-up tasks, calls/visits, outcome recording and internal notes.
- Controlled handover and historical records.
- Basic reminders, unassigned queue and overdue escalation.
- Administrator and Mission Member dashboards.
- RLS, audit and security tests.
- Mobile-first PWA shell and installability where supported.

### MVP should include before a live operational pilot
- Manual SMS with the selected provider, approved templates and consent/opt-out enforcement, if church leadership approves SMS for the pilot.
- Basic integration-stage tracking and agreed summary reports.

### Defer until the core loop is stable
- Complex multi-step SMS campaigns and advanced automation scheduling.
- Inbound SMS replies.
- Push notifications.
- Extensive programme-management features.
- Advanced analytics beyond the agreed operational metrics.

Deferring a feature does not remove it from the SRS; it controls delivery order and pilot risk.

## 6. Work packages and sequencing

| Work package | Depends on | Can begin when |
|---|---|---|
| Stakeholder decision review | Existing SRS | Immediately |
| UX information architecture and wireframes | SRS and actor/use-case models | In parallel with decision review |
| Technical application architecture | Database design and use cases | Immediately; refine after UX |
| Supabase staging setup | Organization/cost approval and project isolation | After user confirms dedicated project creation |
| Authentication and account provisioning | Staging Auth configuration and permission model | After Phase 0 and Phase 2 foundation |
| Visitor/attendance implementation | Auth, RLS and UX approval | After Phase 3 |
| Assignment and follow-up | Visitor/attendance and assignment policies | After core visitor operations |
| SMS integration | Provider, sender identity and consent decisions | Provider evaluation can begin early; live integration after decisions |
| Reporting and integration | Agreed definitions and event data | Incrementally after core records |
| Pilot and production | Complete test/security/privacy gates | Only after Phase 8 approval |

## 7. Immediate next actions

1. Review and approve the implementation roadmap.
2. Resolve login identifier and initial account-provisioning method.
3. Approve the Mission Member capability matrix.
4. Start the mobile-first UX blueprint: navigation map, screen inventory and the registration → assignment → follow-up prototype.
5. Confirm whether a separate hosted ChurchConnect Supabase staging project may be created under the El_Tech organization, after checking any quoted cost.
6. Begin SMS provider comparison in parallel, without enabling live sends.

## 8. Project governance

- Keep this roadmap versioned; record approved changes rather than silently rewriting scope.
- Create GitHub issues for work packages and acceptance criteria.
- Use feature branches and pull requests for implementation changes.
- Require database tests and relevant frontend tests before merge.
- Never store production secrets, real visitor records or temporary passwords in Git.
- Record who approves production migrations and live SMS activation.
- Keep the hosted staging project separate from any existing unrelated projects.

## 9. Reference links

- [SRS v1.0](ChurchConnect_SRS_v1.0.md)
- [Logical database design v1.1](DATABASE_DESIGN_v1.1.md)
- [Crow’s Foot ERD v1.1](database/ChurchConnect_ERD_v1.1.drawio)
- [Use-case and activity models v1.0](USE_CASES_AND_ACTIVITY_MODELS_v1.0.md)
- [Stakeholder decisions register](STAKEHOLDER_DECISIONS.md)
- [Supabase implementation guide](SUPABASE_DATABASE_IMPLEMENTATION_v1.0.md)
- [Successful local database CI run](https://github.com/Elgit4/PCG_Missions/actions/runs/42390055203)
