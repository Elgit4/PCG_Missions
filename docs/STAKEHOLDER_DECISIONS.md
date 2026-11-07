# ChurchConnect — Stakeholder Decisions Register

**Project:** New Members Follow-up & Retention Management System  
**Scope:** One church  
**SRS baseline:** Version 1.0 — draft for stakeholder review  
**Status:** Open items; not approval evidence

This register tracks decisions that must be confirmed by church stakeholders before the affected feature is finalized or the system enters a production pilot.

| ID | Decision required | Proposed owner | Target stage | Status |
|---|---|---|---|---|
| TBD-01 | Official church name, branding, address and contact details. | Church Administrator / leadership | UI/UX design | Open |
| TBD-02 | Primary login identifier: email, username or another approved method. | Church Administrator / technical lead | Authentication design | Open |
| TBD-03 | SMS provider, sender ID, API capability, cost, credit and billing process. | Church Administrator | Integration design | Open |
| TBD-04 | First-week and first-month follow-up schedule, channels, quiet hours and approved message templates. | Church leadership / Missions Team | Workflow configuration | Open |
| TBD-05 | Definitions of successful contact, returning visitor, new convert and integrated member. | Church leadership / Missions Team | Requirements sign-off | Open |
| TBD-06 | Escalation timing for unassigned visitors, overdue tasks and repeated unsuccessful contact attempts. | Church Administrator | Workflow configuration | Open |
| TBD-07 | Mission Member capability grants: who may register visitors, record attendance, search the full visitor directory, send SMS, collaborate and view restricted pastoral information. | Church Administrator | Access-control design | Open |
| TBD-08 | Visitor-data retention, correction, archival and deletion policy. | Church leadership / privacy adviser | Before pilot | Open |
| TBD-09 | Privacy notice and evidence of consent for SMS and other follow-up channels, including opt-out handling. | Church leadership / privacy adviser | Before pilot | Open |
| TBD-10 | Official integration stages and programme-completion criteria. | Church leadership | Workflow design | Open |
| TBD-11 | Hosting plan, domain, backup schedule, recovery targets and administrator succession/recovery procedure. | Technical lead / Administrator | Deployment planning | Open |
| TBD-12 | Whether email or push notifications are needed beyond in-app alerts. | Church Administrator | MVP review | Open |

## Decisions already established in the SRS baseline

- One church only; no multi-tenant or cross-church data sharing in the initial release.
- Exactly two system roles: Church Administrator and Mission Member.
- Welcome/registration is a duty or capability assigned to a Mission Member, not a separate role.
- Visitor registration is staff-only; public self-registration and QR self-check-in are out of scope for the initial release.
- The Church Administrator manually assigns one primary Mission Member to a visitor; optional collaborators may support the assignment.
- Follow-up channels include phone calls, SMS and personal visits.
- SMS supports both manual sending and scheduled automation, with approved templates, consent/opt-out checks, delivery tracking and cost monitoring.
- Access must be enforced through database RLS and trusted server-side authorization, not UI-only restrictions.
- Sensitive prayer requests and pastoral notes require stricter access than ordinary visitor follow-up records.
- Assignment, attendance, interaction and handover history must be preserved.
- SMS delivery does not prove a message was read or that a visitor responded.
- Visitor lifecycle, engagement and task status must remain distinct.

## Review process

1. The relevant stakeholder reviews each open item.
2. Record the decision, approval date and any evidence or policy reference in this file or the approved change record.
3. Update the SRS and affected designs when a decision changes a requirement.
4. Do not treat an open item as approved by assumption.
