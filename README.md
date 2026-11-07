# PCG Missions — ChurchConnect

ChurchConnect is a **single-church New Members Follow-up & Retention Management System** for the Missions Team. The goal is to make every visitor visible, every follow-up accountable and every next step clear.

## Approved project direction

- **Scope:** one church only; no multi-church tenancy or cross-church data sharing in the initial release.
- **Platform:** mobile-first, responsive Progressive Web Application (PWA).
- **Stack:** React + TypeScript + Vite; Tailwind CSS and shadcn/ui; Supabase Authentication, PostgreSQL, Row Level Security (RLS) and Edge Functions; Vercel is the proposed host.
- **System roles:** exactly two — **Church Administrator** and **Mission Member**. Welcome Team, registration and other ministry duties are granted as capabilities to Mission Members, not separate roles.
- **Registration:** staff-only, by authorized church personnel. Public visitor self-registration and QR self-check-in are out of scope for the initial release.
- **Assignment:** the Church Administrator manually assigns one primary Mission Member; optional collaborators can support the assignment.
- **Follow-up:** tasks and configurable schedules, phone calls, SMS, in-person visits, outcomes, reminders and escalation.
- **SMS:** both manual and scheduled automated SMS, approved templates, consent and opt-out checks, server-side provider credentials, delivery tracking and usage/cost reporting.
- **Collaboration:** internal notes, supporting collaborators, controlled handovers and preserved history.
- **Integration:** attendance history and church-defined orientation, discipleship and integration progress.
- **Security:** database RLS and trusted server-side authorization; sensitive pastoral information requires narrower access.

The expected intake of approximately **20–50 new visitors per month** is a planning estimate, not a system capacity limit.

## Repository documentation

| Document | Purpose |
|---|---|
| [ChurchConnect SRS v1.0 (Markdown)](docs/ChurchConnect_SRS_v1.0.md) | Requirements baseline and implementation direction |
| [Stakeholder decisions to confirm](docs/STAKEHOLDER_DECISIONS.md) | Decisions required before affected features are finalized or production pilot begins |

The SRS is a **draft for church stakeholder review and approval**. It is not confirmation that the church has approved follow-up schedules, legal arrangements, SMS provider selection or integration criteria.

A formatted Word copy is supplied in the project conversation. The Markdown specification in this repository is the version-controlled reference currently committed here.

## Next project deliverables

1. Review and approve the SRS and resolve any requirement changes through version control.
2. Produce the logical database design and Crow’s Foot ERD.
3. Produce use-case and activity models.
4. Design the mobile-first experience and permission flows.
5. Implement, test and pilot the system using non-production sample data before entering live visitor information.

## Key safeguards

- Never store plaintext passwords or expose Supabase service-role or SMS provider secrets in frontend code.
- Hiding UI controls is not access control; enforce permissions in RLS and trusted server-side operations.
- SMS delivery is not evidence that a person read, understood or responded to a message.
- Preserve attendance, assignment, interaction and handover history.
- Do not infer that a visitor is inactive or integrated solely from elapsed time.
