# PCG Missions — CMI Follow-up

**Product:** Church on Missions International (CMI) Follow-up  
**Repository status:** Requirements and architecture documentation consolidated to CMI Follow-up v2.1  
**Source of truth:** [Master Product Specification](docs/00_MASTER_PRODUCT_SPECIFICATION.md)

CMI Follow-up supports church field capture, contacts, follow-up, prayer and care, events, attendance, calendar, announcements, visitor-facing content, ministry reports and team administration.

## Current product baseline

- **Staff access:** Supabase Auth email/password, short-lived temporary onboarding credentials and mandatory first-login password replacement.
- **Roles:** Admin/Pastor, Coordinator, Team leader, Field worker, Follow-up volunteer and Prayer intercessor. Users may hold multiple roles, with effective permissions constrained by record, team, event and assignment scope.
- **Experiences:** authenticated staff workspace plus separate public visitor site.
- **Contacts:** online field capture, duplicate review/merge, notes, history and scoped follow-up assignment. Offline capture is disabled for the initial release.
- **Events:** event draft authoring and schema foundations are present; public registration, transactional capacity, transport, check-in and closeout endpoints remain incomplete.
- **Prayer and care:** restricted pastoral information and assigned intercessor access.
- **Public content:** church profile, active events, welcome content, published sermons/daily words and digital tracts.
- **Offline:** disabled for the initial production release until encrypted local storage, device binding, expiry and conflict-recovery tests pass.
- **Communications:** Hubtel server-side adapter is present; live SMS dispatch, campaigns and automation remain disabled until consent, sender, provider, cost and authorization controls are complete.
- **Out of scope:** multi-church network administration and the future/held capabilities listed in the master specification.

## Proposed database design (committed review artifacts)

The current database-design proposal is committed on `main`:

- [Logical Data Model](docs/06_CMI_LOGICAL_DATA_MODEL_PROPOSAL.md)
- [Editable Crow's Foot ERD](docs/database/CMI_Follow_Up_Logical_ERD_v0.1.drawio)
- [Role/Capability Matrix](docs/07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md)
- [Owner-Directed Safe-Default Decision Baseline](docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md)
- [Physical PostgreSQL Schema Proposal](docs/08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md)
- [Database Design Validation Report](docs/09_DATABASE_DESIGN_VALIDATION_REPORT.md)
- [ERD-to-Physical Schema Traceability](docs/10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md)
- [Stakeholder Decision Register](docs/11_CMI_STAKEHOLDER_DECISION_REGISTER.md)
- [Client Stakeholder Approval & Handover Pack](docs/29_CLIENT_STAKEHOLDER_APPROVAL_AND_HANDOVER_PACK.md)

These are review artifacts, not approved migrations or a production schema.

## Documentation — read in this order

| Order | Document | Purpose |
|---|---|---|
| 00 | [Master Product Specification](docs/00_MASTER_PRODUCT_SPECIFICATION.md) | Authoritative scope and product requirements |
| 01 | [Functional Requirements & Workflows](docs/01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md) | Modules and user journeys |
| 02 | [Roles, Permissions & Security](docs/02_ROLES_PERMISSIONS_AND_SECURITY.md) | Roles, multi-role rules, access and privacy |
| 03 | [Data & Database Architecture](docs/03_DATA_AND_DATABASE_ARCHITECTURE.md) | Target data model and schema planning |
| 04 | [Application Architecture & UI/UX](docs/04_APPLICATION_ARCHITECTURE_AND_UI_UX.md) | Staff/public app structure and UX |
| 05 | [Implementation & Deployment Plan](docs/05_IMPLEMENTATION_AND_DEPLOYMENT_PLAN.md) | Delivery phases and release gates |
| 06 | [CMI Follow-up Internal User Guide](docs/CMI_FOLLOW_UP_APP_GUIDE.md) | Staff operating guide |
| — | [Full documentation index](docs/README.md) | Reading order and legacy artifact register |
| — | [Repository audit report](docs/REPOSITORY_AUDIT_REPORT.md) | Consistency findings, verification limits and remaining release gates |

## Implementation status and critical warning

The retained ChurchConnect ERDs and historical materials describe an earlier two-role database model. Any associated legacy migrations, RLS policies or tests are **legacy/provisional** and are not evidence that the current CMI requirements have been implemented. The target CMI data model, ERD, migrations and RLS test suite must be redesigned and reviewed before deployment.

The documents describe the intended product; they do not establish that every feature is already implemented in a running application. Verify code, hosted services and test results separately.

Do not apply the old ChurchConnect migrations to a live CMI project. Do not connect this project to SkillSprint's Supabase instance. SMS remains unavailable until a provider, sender identity, consent/opt-out process and production configuration are validated. Do not represent WhatsApp automation, full offline operation, multi-church network or other future/held features as available.

## Repository governance

- Keep this repository as the project source of truth.
- Update the master specification and affected functional/security/data/architecture documents when requirements change.
- Record stakeholder approvals before implementation where the documents identify an open decision.
- Use synthetic data for development and testing.
- Never commit PINs, passwords, service-role keys, provider secrets or private visitor/prayer data.

## Backend implementation status

The CMI backend is maintained in the dedicated `supabase-cmi/` workspace, separate from the historical top-level `supabase/` ChurchConnect tree. Production reconciliation on 11 November 2026: the connected Supabase project has 15 ordered migrations, 50 public tables with RLS enabled, 58 explicit role-capability grants and nine active Edge Functions. No Auth users, staff profiles, church records or branch records exist yet, so the first administrator is not provisioned and staff sign-in is not yet usable. The Vercel frontend is deployed at https://pcg-missions.vercel.app; the source changes are being consolidated into `main`. Staff authentication uses Supabase email/password with a one-time temporary password and mandatory first-login replacement. First-admin bootstrap uses transactional email only; SMS is not called and live SMS dispatch remains disabled. Offline mode, public registration, exports and incomplete event/report workflows also remain disabled. The pastoral audited-read path remains held pending independent security review before use with real pastoral records. See the [backend implementation status](supabase-cmi/IMPLEMENTATION_STATUS.md), [client approval and handover pack](docs/29_CLIENT_STAKEHOLDER_APPROVAL_AND_HANDOVER_PACK.md), [safe-default decision baseline](docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md) and [CMI workspace guide](supabase-cmi/README.md). Never run the legacy top-level `supabase/` migrations for CMI.
