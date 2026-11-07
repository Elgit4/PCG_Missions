# PCG Missions — ChurchConnect

ChurchConnect is a **single-church New Members Follow-up & Retention Management System** for the Missions Team. Its purpose is to make every visitor visible, every follow-up accountable and every next step clear.

## Approved project direction

- **Scope:** one church only; no multi-church tenancy or cross-church data sharing in the initial release.
- **Platform:** mobile-first, responsive Progressive Web Application (PWA).
- **Stack:** React + TypeScript + Vite; Tailwind CSS and shadcn/ui; Supabase Authentication, PostgreSQL, Row Level Security (RLS) and Edge Functions; Vercel is the proposed host.
- **System roles:** exactly two — **Church Administrator** and **Mission Member**. Welcome Team, registration and other ministry duties are capabilities assigned to Mission Members, not separate roles.
- **Registration:** staff-only by authorized personnel. Public visitor self-registration and QR self-check-in are out of scope for the initial release.
- **Assignment:** the Administrator manually assigns one primary Mission Member; optional collaborators may support that assignment.
- **Follow-up:** configurable tasks, phone calls, SMS, in-person visits, outcomes, reminders and escalation.
- **SMS:** both manual and scheduled automated messages, approved templates, consent/opt-out checks, server-side credentials, delivery tracking and usage/cost reporting.
- **Collaboration:** internal notes, supporting collaborators, controlled handovers and preserved history.
- **Integration:** attendance history and church-defined orientation, discipleship and integration progress.
- **Security:** RLS and trusted server-side authorization; sensitive pastoral information requires narrower access.

The expected intake of approximately **20–50 new visitors per month** is a planning estimate, not a system capacity limit.

## Project documentation

| Deliverable | Repository file | Status |
|---|---|---|
| Software Requirements Specification v1.0 | [SRS](docs/ChurchConnect_SRS_v1.0.md) | Draft for church stakeholder review |
| Logical database design v1.1 | [Database design](docs/DATABASE_DESIGN_v1.1.md) | Aligned with current schema package |
| Crow’s Foot ERD v1.1 | [Editable draw.io ERD](docs/database/ChurchConnect_ERD_v1.1.drawio) | Four subject-area pages |
| Use-case and activity models v1.0 | [Use cases and activity models](docs/USE_CASES_AND_ACTIVITY_MODELS_v1.0.md) | Draft for design review |
| Stakeholder decisions register | [Open decisions](docs/STAKEHOLDER_DECISIONS.md) | 12 items awaiting confirmation |
| Supabase database implementation guide | [Database implementation](docs/SUPABASE_DATABASE_IMPLEMENTATION_v1.0.md) | Setup, bootstrap and deployment instructions |

## Database implementation package

The current PostgreSQL/Supabase implementation is committed under `supabase/`:

| File | Purpose |
|---|---|
| [Core schema migration](supabase/migrations/20261107001200_churchconnect_core_schema.sql) | Tables, constraints, indexes and two-role/capability seeds |
| [RLS and audit migration](supabase/migrations/20261107001300_churchconnect_rls_and_audit.sql) | Row-level access, authorization helpers and audit/task-history triggers |
| [Sensitive-access and history migration](supabase/migrations/20261107170000_churchconnect_sensitive_access_and_history.sql) | Restricted capability grants, revocable access history and integration-stage transitions |
| [pgTAP tests](supabase/tests/churchconnect_rls.test.sql) | 34 schema, integrity and authorization assertions |
| [GitHub Actions database tests](.github/workflows/churchconnect-db-tests.yml) | Starts local Supabase and runs the pgTAP suite on database changes |

**Database verification is not yet confirmed.** The package is committed, but the migrations have not been applied to a hosted ChurchConnect project. Check the GitHub Actions workflow run for the first automated migration/test result. Do not link these migrations to SkillSprint or another unrelated Supabase project.

## Next project deliverables

1. Review the database CI result and resolve any failed migration or test.
2. Create a dedicated ChurchConnect Supabase project and apply the migrations to a clean staging environment.
3. Implement trusted server-side operations for account provisioning, assignments/handovers, workflow scheduling, notifications and SMS.
4. Build application screens and wire them to the tested schema and RLS.
5. Run end-to-end role/access tests and a pilot using synthetic data before entering live visitor information.

## Key safeguards

- Never store plaintext passwords or expose Supabase service-role/secret or SMS provider keys in frontend code.
- Hiding UI controls is not authorization; enforce access in RLS and trusted server-side operations.
- `VISITOR_REGISTER` and `ATTENDANCE_RECORD` do not grant full visitor-directory search; `VISITOR_DIRECTORY_VIEW` is separate.
- Sensitive pastoral access requires both an explicit capability and a record-specific grant.
- SMS delivery is not evidence that a person read, understood or responded to a message.
- Preserve attendance, consent, assignment, interaction, task and handover history.
- Do not infer that a visitor is inactive or integrated solely from elapsed time.
- Do not introduce a third system role.
