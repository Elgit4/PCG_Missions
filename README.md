# PCG Missions — CMI Follow-up

**Product:** Church on Missions International (CMI) Follow-up  
**Repository status:** Requirements and architecture documentation consolidated to CMI Follow-up v2.1  
**Source of truth:** [Master Product Specification](docs/00_MASTER_PRODUCT_SPECIFICATION.md)

The CMI Follow-up v2.1 target scope covers church field capture, contacts, follow-up, prayer and care, events, attendance, calendar, announcements, visitor-facing content, ministry reports and team administration. The scope below describes intended product capability; see the deployment snapshot before treating a feature as operational.

## Current product baseline

- **Staff access:** Supabase Auth email/password, short-lived temporary onboarding credentials and mandatory first-login password replacement.
- **Roles:** Admin/Pastor, Coordinator, Team leader, Field worker, Follow-up volunteer and Prayer intercessor. Users may hold multiple roles, with effective permissions constrained by record, team, event and assignment scope.
- **Experiences:** authenticated staff workspace is deployed; a separate public visitor site remains to be completed.
- **Contacts:** scoped listing, search, detail, ordinary notes and interaction history are deployed. Contact capture exists but currently fails closed until its server-side idempotency secret is configured; duplicate merge remains unimplemented. Offline capture is disabled.
- **Events:** backend private-draft endpoints are deployed; new Admin/Pastor draft screens and grants are pending CI/review in the current feature branch. Public registration, transactional capacity, transport, check-in and closeout remain incomplete.
- **Prayer and care:** restricted pastoral information and assigned intercessor access.
- **Public content:** church profile, active events, welcome content, published sermons/daily words and digital tracts.
- **Offline:** disabled for the initial production release until encrypted local storage, device binding, expiry and conflict-recovery tests pass.
- **Communications:** Hubtel server-side adapter is present; live SMS dispatch, campaigns and automation remain disabled until consent, sender, provider, cost and authorization controls are complete.
- **Out of scope:** multi-church network administration and the future/held capabilities listed in the master specification.

## Current implementation and deployment snapshot — 12 November 2026

Production is a usable staff-workspace foundation, not the complete CMI Follow-up v2.1 product. The deployed UI currently provides Overview, Contacts, Follow-up, Staff and Access requests. PR #40 added contact profiles, ordinary notes and call/visit/message interaction history; PR #41 improved first-contact guidance and staff-invitation failure handling. The PR #41 merge commit `4a43d87e70da876bc5caa912c7770c8069564768` is deployed to Vercel production and the production site returns HTTP 200.

The hosted Supabase project has **16 ordered migrations**, **50 RLS-enabled public tables**, **61 active capability catalogue entries**, **65 active role-capability grants** across six roles, and ten active Edge Function entries (including the retired bootstrap endpoint that returns HTTP 410). Existing event, calendar, announcement and content Edge Functions support private drafts only; their production Admin/Pastor grants and screens are not yet present.

PR #42 with capability-gated Admin/Pastor draft screens for Events, Calendar, Announcements and visitor content is merged and deployed. The active feature branch `feat/team-area-administration` adds Team and Service Area administration, a secure write RPC and audit ledger, authenticated Edge Function routes, typed browser API methods and regression tests. It proposes two additional Admin/Pastor branch-scoped grants and is pending CI/review and production deployment.

**Known production blockers:**
- Contact capture returns HTTP 503 `IDEMPOTENCY_NOT_CONFIGURED` when `CMI_CONTACT_IDEMPOTENCY_HMAC_KEY` is missing/too short or its version setting is invalid. Follow-up task creation requires the separate `CMI_FOLLOWUP_IDEMPOTENCY_HMAC_KEY`. Both must be generated and configured as Supabase Edge Function secrets; never place them in frontend variables, GitHub source or chat. The connected tool session cannot write Supabase secrets.
- Staff invitation/recovery email uses Resend's test sender domain `onboarding@resend.dev`. A domain controlled by the church/project owner must be verified and `CMI_AUTH_EMAIL_FROM` updated. One staff profile already exists after an invitation-email failure; do not recreate that account.
- Two staff profiles are active; one has completed first-login password setup and one still requires it. There are currently no seeded contact or follow-up business records.

Still incomplete or gated: separate public visitor site, full contact merge lifecycle, Team & Service Area Administration (implementation pending review/deployment), typed ministry reports/review/exports, public event registration and capacity reservation, transport, attendance/check-in and closeout, announcement/content publishing, pastoral mutations, SMS campaigns/dispatch/automation, offline capture/sync and retention automation. The pastoral-operations function remains undeployed pending independent security review. SMS remains disabled until the provider/sender and privacy/consent gates are approved.

Do not load real congregant data until controller privacy obligations, privacy notice/lawful purpose, operational email delivery, staging/UAT, backup-restore rehearsal, monitoring and module-specific release gates are completed.

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

The historical top-level `supabase/` tree belongs to the earlier ChurchConnect product and must not be applied to CMI. Use only `supabase-cmi/` for CMI database work. The current CMI product is protected by server-authorized Edge Functions; browser code must not access protected business tables directly.

The product-owner default decisions are recorded in [document 31](docs/31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md). A capability shown in the database catalogue is not automatically granted. SMS dispatch, offline access, public registration, event capacity/transport/check-in, pastoral mutations and exports remain disabled until their dedicated controls, permissions, tests and release gates pass.

## Repository governance

- Keep this repository as the project source of truth.
- Update the master specification and affected functional/security/data/architecture documents when requirements change.
- Record stakeholder approvals before implementation where the documents identify an open decision.
- Use synthetic data for development and testing.
- Never commit PINs, passwords, service-role keys, provider secrets or private visitor/prayer data.

## Backend implementation status

The CMI backend is maintained in `supabase-cmi/`, separate from the legacy ChurchConnect tree. Production status, known 503 configuration failures, migration/grant counts and gated modules are maintained in [`supabase-cmi/IMPLEMENTATION_STATUS.md`](supabase-cmi/IMPLEMENTATION_STATUS.md). The first Admin/Pastor account has been provisioned and first-login setup is complete for one active profile; another active profile still requires password setup after an invitation delivery failure. SMS remains disabled pending provider approval. Never put secrets, passwords or private congregant data in source control or chat.
