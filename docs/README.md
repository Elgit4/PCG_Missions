# CMI Follow-up — Documentation Index

**Current baseline:** CMI Follow-up v2.0  
**Repository:** `Elgit4/PCG_Missions`  
**Source of truth:** [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md)

This directory is organized by function. Read the documents in the order below. The master specification governs conflicts; supporting documents provide detailed requirements and implementation guidance.

## Authoritative compiled documentation

| Order | Document | Use it for |
|---|---|---|
| 00 | [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md) | Product scope, modules, roles, policies, constraints and acceptance gates |
| 01 | [Functional Requirements & Workflows](01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md) | What each module must do and end-to-end user journeys |
| 02 | [Roles, Permissions & Security](02_ROLES_PERMISSIONS_AND_SECURITY.md) | Six roles, multi-role access, record scope, prayer privacy and PIN security |
| 03 | [Data & Database Architecture](03_DATA_AND_DATABASE_ARCHITECTURE.md) | Target data domains, relationships, integrity and future ERD/schema work |
| 04 | [Application Architecture & UI/UX](04_APPLICATION_ARCHITECTURE_AND_UI_UX.md) | Staff/public surfaces, navigation, frontend/backend boundaries and UX |
| 05 | [Implementation & Deployment Plan](05_IMPLEMENTATION_AND_DEPLOYMENT_PLAN.md) | Phases, tests, release gates, environments and change control |
| 06 | [CMI Follow-up Internal User Guide](CMI_FOLLOW_UP_APP_GUIDE.md) | Operational instructions for authorized team members |

## Reading order

1. Start with document 00.
2. Use document 01 to understand module behaviour.
3. Use document 02 before designing routes, APIs, database policies or admin tools.
4. Use document 03 before changing the database or generating an ERD.
5. Use document 04 for frontend and backend implementation.
6. Use document 05 to plan and verify delivery.
7. Use document 06 for staff operating instructions.

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

The old ERDs, SQL migrations and pgTAP suite represent the earlier two-role schema. They are not evidence of CMI six-role, event registration, transport, public-content or offline-queue implementation. The target CMI schema and ERD must be designed and tested from document 03 before any production migration is applied.

## Baseline rules

- The CMI guide and master specification supersede conflicting earlier ChurchConnect requirements.
- Six operational roles are defined; users may hold multiple roles, subject to record scope.
- Staff sign in with administrator-issued email and PIN.
- Public visitor pages are separate from staff pages.
- Offline support is limited to queued field capture, cached pickers and previously opened event check-in data.
- Automated SMS/WhatsApp messaging and reminders are not available.
- Multi-church administration and the listed future/held features are out of scope.
- A documented capability is not proof that the feature has shipped. Verify implementation separately.
