# CMI Follow-up — Implementation & Deployment Plan

**Version:** 2.0 | **Status:** Proposed delivery baseline | **Parent:** [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md)

## 1. Delivery rules
- Build to the CMI master specification, not the superseded two-role ChurchConnect drafts.
- The GitHub repository is the project source of truth.
- Use synthetic data during development; no real visitor/prayer data before formal church authorization.
- No automated SMS/WhatsApp, multi-church network, full offline mode or future/held modules in this release.
- Do not apply legacy ChurchConnect migrations to a CMI production database.
- Each phase exits only after its acceptance tests and documentation are updated.

## 2. Phased implementation

| Phase | Work package | Exit criteria |
|---|---|---|
| 0 | Requirements and governance | Church approves roles, capability matrix, PIN lifecycle, branch scope, privacy, event rules and retention |
| 1 | UX and information architecture | Mobile-first staff/public prototypes reviewed; all role journeys represented |
| 2 | Target data model and security | New CMI ERD/schema reviewed; RLS tests cover roles, multi-role combinations and record scopes |
| 3 | Foundation and authentication | Staff email+PIN sign-in, secure session, reset/reissue, deactivation and audit verified |
| 4 | Team, roles and settings | Multi-role assignment, team/area scope and event-specific team assignment work |
| 5 | Contacts and field capture | Online capture, picker configuration, duplicate review/merge and contact history pass |
| 6 | Limited offline support | Queued capture and previously opened event check-in sync reliably with retry/conflict handling |
| 7 | Follow-up, prayer and care | Lists, tasks, overdue visibility, care outcomes and strict prayer isolation pass |
| 8 | Events and public registration | Event setup, optional registration/transport, public registration, check-in and closeout pass |
| 9 | Calendar and communications | Service/follow-up/prayer calendar and role-scoped announcements work; no automated SMS/WhatsApp |
| 10 | Public visitor content | Profile, events, welcome messages, published sermons/daily words and digital tracts are public only when published |
| 11 | Reports and administration | Daily/event/weekly reports, review states, team management and settings pass scope tests |
| 12 | Hardening and pilot | Security, accessibility, mobile/browser, backup/restore and user-guide review complete |
| 13 | Production release | Church approval, support owner, incident process and deployment checks signed off |

## 3. Required verification
- Unit tests for validation, role combination, status transitions, sync idempotency and report calculations.
- Database tests for foreign keys, uniqueness, RLS and sensitive record isolation.
- API/Edge Function tests for authentication, authorization, public registration, merge, publication and offline sync.
- End-to-end tests for all six roles, including users holding multiple roles.
- Public anonymous tests for event registration and published content.
- Mobile tests on Android Chrome and iOS Safari, plus desktop Chrome/Edge/Firefox/Safari as supported.
- Accessibility tests for keyboard, focus, labels, contrast and reduced motion.
- Operational tests for queue recovery, event check-in reconciliation, backups, restore and account deactivation.

## 4. Release gates
A release is blocked by:
- any cross-team/event/assignment data leak;
- prayer request exposure to an unauthorized user;
- plaintext PIN storage/logging or insecure credential recovery;
- duplicate contact creation on offline retry;
- public exposure of draft/private content;
- registration that bypasses event enablement or capacity;
- reports/exports wider than the user's scope;
- claims that held capabilities are already available;
- unreviewed legacy SQL migrations being treated as the new schema.

## 5. Environments and secrets
Use separate local, staging and production environments. A dedicated CMI Supabase project must be approved before hosted deployment; do not reuse SkillSprint or unrelated projects. Keep service-role and other privileged secrets server-side. Configure backups, access control, monitoring and documented recovery before production.

## 6. Operational readiness
Before pilot, train role representatives, publish the internal user guide, identify an app administrator/support contact, approve privacy/retention processes, test backup restoration and define how failed offline captures are recovered. Do not use live visitor data in screenshots, issue reports or test fixtures.

## 7. Change control
Changes to roles, public registration, communication channels, offline scope, sensitive data access or future features require:
1. a written change request;
2. impact assessment across requirements, UI, database, RLS, tests and user guide;
3. stakeholder approval;
4. updated versioned documentation;
5. implementation and verification before release.
