# PCG Missions — CMI Follow-up

**Product:** Church on Missions International (CMI) Follow-up  
**Repository status:** Requirements and architecture documentation consolidated to CMI Follow-up v2.1  
**Source of truth:** [Master Product Specification](docs/00_MASTER_PRODUCT_SPECIFICATION.md)

CMI Follow-up supports church field capture, contacts, follow-up, prayer and care, events, attendance, calendar, announcements, visitor-facing content, ministry reports and team administration.

## Current product baseline

- **Staff access:** email and administrator-issued PIN.
- **Roles:** Admin/Pastor, Coordinator, Team leader, Field worker, Follow-up volunteer and Prayer intercessor. Users may hold multiple roles, with effective permissions constrained by record, team, event and assignment scope.
- **Experiences:** authenticated staff workspace plus separate public visitor site.
- **Contacts:** online and limited queued offline field capture, duplicate merge, notes, history and follow-up assignment.
- **Events:** event setup, public registration when enabled, optional transport reservations, check-in, event-specific assignments and closeout.
- **Prayer and care:** restricted pastoral information and assigned intercessor access.
- **Public content:** church profile, active events, welcome content, published sermons/daily words and digital tracts.
- **Offline:** queued field captures, cached capture pickers and previously opened event check-in data only.
- **Communications:** manual one-to-one SMS, permission-scoped bulk SMS and configurable automated SMS; WhatsApp automation is not included.
- **Out of scope:** multi-church network administration and the future/held capabilities listed in the master specification.

## Proposed database design (review branch)\n\nThe current database-design proposal is available on the `design/cmi-logical-data-model` branch: [Logical Data Model](docs/06_CMI_LOGICAL_DATA_MODEL_PROPOSAL.md) and [editable Crow's Foot ERD](docs/database/CMI_Follow_Up_Logical_ERD_v0.1.drawio). These are review artifacts, not approved migrations or a production schema.\n\n## Documentation — read in this order

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
