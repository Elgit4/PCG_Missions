# PCG Missions

**Product:** Church on Missions International (CMI) follow-up and missions operations  
**Repository:** [Elgit4/PCG_Missions](https://github.com/Elgit4/PCG_Missions)  
**Product specification:** [Master Product Specification](docs/00_MASTER_PRODUCT_SPECIFICATION.md)

PCG Missions helps church staff capture visitors, coordinate follow-up, manage ministry teams and events, prepare reports, and maintain approved visitor-facing information. The initial release is designed for one church with branch-scoped authorization and a six-role staff model.

## Production status — 22 November 2026

**Production infrastructure:** deployed

- **Web application:** [https://pcg-missions.pages.dev](https://pcg-missions.pages.dev) — Cloudflare Pages.
- **Application API:** `pcg-missions-api-production` — Cloudflare Worker using Better Auth and D1.
- **Production database:** `pcg-missions-production` — Cloudflare D1, EU jurisdiction, schema version **45**.
- **Authentication:** Better Auth sessions stored in D1. Staff accounts are provisioned by authorized administrators; public self-registration is disabled.
- **Remaining Supabase use:** private event-flyer object storage only. Supabase is not the staff authentication or operational database.
- **Communications:** SMS dispatch, campaigns and automation remain disabled by decision. No SMS capability grants are provisioned.

The production hardening release and the scheduled read-only availability monitor are in place. The monitor's first successful scheduled execution still needs to be observed and recorded. A D1 Time Travel bookmark is captured during releases, but an independent export/import restoration rehearsal remains outstanding.

### Production data

At the last verified database inspection, production contained three staff profiles and their Better Auth user/credential records. Operational tables for visitors, follow-up tasks, events, ministry reports and announcements were empty. Do not create fake church records to make the application appear populated.

### Staff roles

The six approved roles are:

1. Admin/Pastor (`admin_pastor`)
2. Coordinator (`coordinator`)
3. Team Leader (`team_leader`)
4. Field Worker (`field_worker`)
5. Follow-up Volunteer (`follow_up_volunteer`)
6. Prayer Intercessor (`prayer_intercessor`)

Permissions are capability-based and branch-scoped. Sensitive prayer and pastoral records remain restricted; an assigned Prayer Intercessor must not gain general contact-directory access.

## Feature implementation status

| Area | Current implementation state |
|---|---|
| Staff sign-in and sessions | Better Auth and D1-backed sessions deployed; live acceptance by all staff roles remains outstanding |
| Staff provisioning and password lifecycle | Worker routes and account controls implemented; complete role-management acceptance remains outstanding |
| Contacts and interaction history | Branch-scoped Worker routes and restricted projections implemented; duplicate merge and full live acceptance remain outstanding |
| Follow-up | Task creation, assignment, reassignment and status routes implemented; complete live acceptance remains outstanding |
| Teams and service areas | Worker administration routes and capability checks implemented |
| Events and event assignments | Staff-only operations implemented; public registration and Transport remain disabled |
| Calendar | Branch-scoped draft and update operations implemented |
| Announcements | Private draft operations only; publication and delivery are not enabled |
| Visitor content | Public published-content projection exists; private sermon and welcome-message draft authoring is being completed on [PR #112](https://github.com/Elgit4/PCG_Missions/pull/112) |
| Ministry reports | Typed Worker workflows implemented; complete end-to-end review acceptance remains outstanding |
| Prayer and pastoral care | Restricted, audited read paths; full care-management lifecycle is not enabled |
| Notifications | Inbox and read-state operations implemented; trigger-to-recipient acceptance remains outstanding |
| SMS and offline operation | Disabled |

A screen or route being present is not, by itself, proof that the workflow is complete. See the [repository audit report](docs/REPOSITORY_AUDIT_REPORT.md) and [remaining delivery plan](docs/32_REMAINING_PRODUCT_WORK_AND_DELIVERY_PLAN.md) for acceptance gaps.

## Release and safety boundaries

- Cloudflare Pages, the production Worker and production D1 are the live application infrastructure.
- Production changes must be forward-only, reviewed and verified against the intended production D1 target.
- Do not apply historical PostgreSQL/Supabase migrations to the Cloudflare D1 database.
- Keep the private event-flyer storage integration server-side; do not expose storage credentials in browser code.
- Keep SMS disabled unless a separately reviewed change authorizes the provider, consent/suppression, sender and dispatch controls.
- Public registration, Transport, offline storage, exports and unrestricted pastoral access remain disabled.
- Use synthetic records in tests. Do not commit passwords, session cookies, tokens, provider credentials or real congregant data.
- Do not claim full production readiness until role-specific authenticated acceptance, monitoring evidence, restore rehearsal, privacy/retention procedures and operational ownership are complete.

## Documentation

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

## Safety and rollout boundaries

The historical top-level `supabase/` and `supabase-cmi/` PostgreSQL trees are retained as migration/reference artifacts; do not apply their SQL to Cloudflare D1. The live operational schema is maintained in `cloudflare/migrations/`, and protected business operations must pass through the Cloudflare Worker. Supabase remains only for private event-flyer object storage.

The product-owner default decisions are recorded in [document 31](docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md). A capability shown in the database catalogue is not automatically granted. SMS dispatch, offline access, public registration, event capacity/transport/check-in, pastoral mutations and exports remain disabled until their dedicated controls, permissions, tests and release gates pass.

## Repository governance

- Keep this repository as the project source of truth.
- Update the master specification and affected functional/security/data/architecture documents when requirements change.
- Record stakeholder approvals before implementation where the documents identify an open decision.
- Use synthetic data for development and testing.
- Never commit PINs, passwords, service-role keys, provider secrets or private visitor/prayer data.

## Backend implementation status

The live backend is maintained in `cloudflare/`: Worker source, Better Auth integration, D1 migrations and route tests. See [`cloudflare/MIGRATION_STATUS.md`](cloudflare/MIGRATION_STATUS.md) and [`cloudflare/README.md`](cloudflare/README.md) for the operational architecture. Historical PostgreSQL artifacts remain for migration traceability only. Never put secrets, passwords or private congregant data in source control or chat.
