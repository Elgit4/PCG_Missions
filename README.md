# PCG Missions — ChurchConnect

ChurchConnect is a **single-church New Members Follow-up & Retention Management System** for the Missions Team. The goal is to make every visitor visible, every follow-up accountable and every next step clear.

## Approved project direction

- **Scope:** one church only; no multi-church tenancy or cross-church data sharing in the initial release.
- **Platform:** mobile-first, responsive Progressive Web Application (PWA).
- **Stack:** React + TypeScript + Vite; Tailwind CSS and shadcn/ui; Supabase Authentication, PostgreSQL, Row Level Security (RLS) and Edge Functions; Vercel is the proposed host.
- **System roles:** exactly two — **Church Administrator** and **Mission Member**. Welcome Team, registration and other ministry duties are granted as capabilities to Mission Members, not separate roles.
- **Registration:** staff-only, by authorized church personnel. Public visitor self-registration and QR self-check-in are out of scope for the initial release.
- **Assignment:** the Church Administrator manually assigns one primary Mission Member; optional collaborators can support the assignment.
- **Follow-up:** configurable task schedules, phone calls, SMS, in-person visits, outcomes, reminders and escalation.
- **SMS:** both manual and scheduled automated SMS, approved templates, consent and opt-out checks, server-side provider credentials, delivery tracking and usage/cost reporting.
- **Collaboration:** internal notes, supporting collaborators, controlled handovers and preserved history.
- **Integration:** attendance history and church-defined orientation, discipleship and integration progress.
- **Security:** database RLS and trusted server-side authorization; sensitive pastoral information requires narrower access.

The expected intake of approximately **20–50 new visitors per month** is a planning estimate, not a system capacity limit.

## Project documentation

| Deliverable | File | Status |
|---|---|---|
| Software Requirements Specification v1.0 | [SRS (Markdown)](docs/ChurchConnect_SRS_v1.0.md) | Draft for church stakeholder review |
| Logical database design v1.0 | [Database design](docs/DATABASE_DESIGN_v1.0.md) | Draft for technical review |
| Crow’s Foot ERD v1.0 | [Editable draw.io diagram](docs/database/ChurchConnect_ERD_v1.0.drawio) | Draft; four subject-area pages |
| Use-case and activity models v1.0 | [Use cases and activities](docs/USE_CASES_AND_ACTIVITY_MODELS_v1.0.md) | Draft for design review |
| Stakeholder decisions register | [Open decisions](docs/STAKEHOLDER_DECISIONS.md) | 12 items awaiting confirmation |

The Markdown SRS is the version-controlled reference. A formatted Word copy is available in the project deliverables, but the repository's current SRS source is the Markdown file.

## Modelling sequence

1. Review the requirements and logical database design.
2. Review the ERD relationships, optionality, access controls and data history requirements.
3. Review the use-case and activity models against the SRS.
4. Confirm implementation-level data types, constraints, indexes, migrations and RLS policies.
5. Design the mobile-first experience and permission flows.
6. Implement, test and pilot with non-production sample data before entering live visitor information.

## Key safeguards

- Never store plaintext passwords or expose Supabase service-role or SMS provider secrets in frontend code.
- Hiding UI controls is not access control; enforce permissions in RLS and trusted server-side operations.
- SMS delivery is not evidence that a person read, understood or responded to a message.
- Preserve attendance, assignment, interaction, consent and handover history.
- Do not infer that a visitor is inactive or integrated solely from elapsed time.
- Do not introduce a third system role. Welcome/registration and other duties are capability grants on Mission Member accounts.
