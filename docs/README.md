# CMI Follow-up — Documentation Index

**Current baseline:** CMI Follow-up v2.1  
**Repository:** `Elgit4/PCG_Missions`  
**Source of truth:** [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md)

This directory is organized by function. Read the documents in the order below. The master specification governs conflicts; supporting documents provide detailed requirements and implementation guidance.

## Authoritative compiled documentation

| Order | Document | Use it for |
|---|---|---|
| 00 | [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md) | Product scope, modules, roles, policies, constraints and acceptance gates |
| 01 | [Functional Requirements & Workflows](01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md) | What each module must do and end-to-end user journeys |
| 02 | [Roles, Permissions & Security](02_ROLES_PERMISSIONS_AND_SECURITY.md) | Six roles, multi-role access, record scope, prayer privacy, PIN security and SMS permissions |
| 03 | [Data & Database Architecture](03_DATA_AND_DATABASE_ARCHITECTURE.md) | Target data domains, relationships, integrity and future ERD/schema work |
| 04 | [Application Architecture & UI/UX](04_APPLICATION_ARCHITECTURE_AND_UI_UX.md) | Staff/public surfaces, navigation, frontend/backend boundaries and UX |
| 05 | [Implementation & Deployment Plan](05_IMPLEMENTATION_AND_DEPLOYMENT_PLAN.md) | Phases, tests, release gates, environments and change control |
| 06 | [CMI Follow-up Internal User Guide](CMI_FOLLOW_UP_APP_GUIDE.md) | Operational instructions for authorized team members |

## Proposed database design artifacts

These artifacts are on the database-design feature branch and are **proposals for review**, not approved production schema:

- [Logical Data Model Proposal](06_CMI_LOGICAL_DATA_MODEL_PROPOSAL.md) — entity inventory, relationships, candidate constraints, RLS design notes and data decisions.
- [CMI Logical Crow's Foot ERD](database/CMI_Follow_Up_Logical_ERD_v0.1.drawio) — editable diagrams.net file with separate domain pages.
- [Role, Capability & Scope Matrix Proposal](07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md) — proposed capability catalogue, role grants, scope rules, sensitive-data restrictions, SMS separation of duties and authorization tests.
- [Physical PostgreSQL Schema Proposal](08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md) — proposed table inventory, constraints, indexes, RLS architecture, SMS lifecycle and migration sequence; not executable SQL.
- [Database Design Validation Report](09_DATABASE_DESIGN_VALIDATION_REPORT.md) — cross-document consistency review, design risks, corrections and outstanding approval gates.
- [ERD-to-Physical Schema Traceability](10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md) — maps all 53 ERD entities to proposed physical tables and lists remaining reconciliation work.
- [Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md) — consolidated approval worksheet for R-01–R-12, D-01–D-13 and authentication/SMS/offline governance decisions.
- [RLS Policy & Security Test Plan](12_RLS_POLICY_AND_SECURITY_TEST_PLAN.md) — table/domain policy expectations, threat scenarios and positive/negative security test catalogue; not executed.
- [Foundation, Contacts & Follow-up Data Dictionary](13_FOUNDATION_CONTACT_FOLLOWUP_DATA_DICTIONARY.md) — typed column definitions, nullability, keys, branch-consistent foreign keys and unresolved physical-design refinements for the first schema slice.
- [Restricted Pastoral, Events & Public Content Data Dictionary](14_PASTORAL_EVENTS_PUBLIC_CONTENT_DATA_DICTIONARY.md) — typed definitions for prayer/care, event registration, transport, attendance, announcements and public content.
- [SMS, Reporting, Audit & Offline Data Dictionary](15_SMS_REPORTING_AUDIT_OFFLINE_DATA_DICTIONARY.md) — typed definitions for SMS consent/suppression, campaigns, automation, outbox, callbacks, reports, audit and limited sync receipts.

## Backend implementation

The CMI-only backend is developed in `../supabase-cmi/`, isolated from the historical ChurchConnect workspace. The identity/authorization foundation migration is committed for isolated local review. Contacts/follow-up and restricted-pastoral SQL/pgTAP drafts remain under `schema-drafts/` and must not be promoted to permanent migrations until the relevant physical-design and stakeholder decisions are approved.

- [16 — Schema Reconciliation & Decision Crosswalk](16_CMI_SCHEMA_RECONCILIATION_AND_DECISION_CROSSWALK.md) — tracks DD-01–DD-25, their proposed dispositions and approval dependencies.
- [Isolated CMI Supabase workspace](../supabase-cmi/README.md) — separate CLI configuration, migration history and test workspace.
- [Backend Implementation Status](../supabase-cmi/IMPLEMENTATION_STATUS.md) — implemented foundation, validated draft domains, deferred services and verification limits.
- [Legacy ChurchConnect artifacts](legacy/churchconnect/README.md) — preserved historical SQL, tests and workflow; not part of the active CMI backend.
- [Event Transaction API Contract](17_EVENT_TRANSACTION_API_CONTRACT.md) — server-side transaction semantics, capacity serialization, idempotency, transport, check-in, closeout and test gates. This is a proposal, not an active API.

## Audit and verification records

- [Repository Consistency & Accuracy Audit](REPOSITORY_AUDIT_REPORT.md) — v2.1 cross-document review, corrected defects, unresolved implementation gaps and verification limitations.

## Reading order

1. Start with document 00.
2. Use document 01 to understand module behaviour.
3. Use document 02 before designing routes, APIs, database policies or admin tools.
4. Use document 03 before changing the database or generating an ERD.
5. Review the proposed logical model and ERD after understanding documents 00–03.
6. Review the physical schema, validation report, traceability crosswalk and stakeholder decision register.
7. Resolve approval gates before creating executable domain migrations or enabling production access.
8. Use document 04 for frontend and backend implementation.
9. Use document 05 to plan and verify delivery.
10. Use document 06 for staff operating instructions.

## Legacy / superseded artifacts

The following files were created for the earlier ChurchConnect two-role requirements baseline. They are retained for traceability only and are **not authoritative for CMI Follow-up**:

- `ChurchConnect_SRS_v1.0.md`
- `DATABASE_DESIGN_v1.0.md`
- `DATABASE_DESIGN_v1.1.md`
- `USE_CASES_AND_ACTIVITY_MODELS_v1.0.md`
- `APPLICATION_ARCHITECTURE_AND_UI_UX_BLUEPRINT_v1.0.md`
- `IMPLEMENTATION_ROADMAP_v1.0.md`
- `SUPABASE_DATABASE_IMPLEMENTATION_v1.0.md`
- `STAKEHOLDER_DECISIONS.md`
- `database/ChurchConnect_ERD_v1.0.drawio`
- `database/ChurchConnect_ERD_v1.1.drawio`

The old ERDs, SQL migrations and pgTAP suite represent the earlier two-role schema and are not the target CMI database. They are not evidence of CMI six-role, event registration, transport, public-content or offline-queue implementation. The target CMI schema and ERD must be designed and tested from document 03 before any production migration is applied.

## Baseline rules

- The CMI guide and master specification supersede conflicting earlier ChurchConnect requirements.
- Six operational roles are defined; users may hold multiple roles, subject to record scope.
- Staff sign in with administrator-issued email and PIN.
- Public visitor pages are separate from staff pages.
- Offline support is limited to queued field capture, cached pickers and previously opened event check-in data.
- Manual, bulk and automated SMS are in scope; WhatsApp automation is not included. SMS must remain disabled until provider, sender-ID, consent/opt-out and budget controls are configured and tested.
- Multi-church administration and the listed future/held features are out of scope.
- A documented capability is not proof that the feature has shipped. Verify implementation separately.
