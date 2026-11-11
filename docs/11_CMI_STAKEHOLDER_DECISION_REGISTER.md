# CMI Follow-up — Stakeholder Decision Register

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Status:** Product-owner implementation defaults selected on 11 November 2026; church-policy sign-off remains separate  
**Purpose:** One review sheet for the authorization decisions (R-01–R-12) and logical data decisions (D-01–D-13).

## How to use this register

1. Review the proposed safe default and the impact of each decision.
2. Record the approved option or a written alternative in the decision column.
3. Record approver, date and any conditions.
4. Update the role matrix, ERD, physical schema and validation report before generating executable migrations.

The product owner has explicitly authorized implementation of the standard conservative defaults for all R-01–R-12 and D-01–D-13 decisions. Those selected defaults are now the engineering baseline in [document 31 — Owner-Directed Safe-Default Decision Baseline](31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md). This is product-owner authority to implement the current default, not a claim that the church board, pastoral lead, legal adviser or regulator has approved its policy implications. Stakeholders may request amendments later through change control.

## A. Authorization and role-scope decisions

| ID | Decision to approve | Recommended safe default pending approval | Current product-owner baseline |
|---|---|---|---|
| R-01 | Admin/Pastor access to prayer and care narratives | Explicit privileged oversight capability; every narrative read mediated and audited. No blanket role bypass. | Owner-directed default selected; implementation/release status tracked in document 31 |
| R-02 | Coordinator prayer management scope | Workflow/assignment/status metadata only; no narrative read until explicitly granted. | Pending |
| R-03 | Coordinator access to ordinary contacts | Operational church/branch workspace with minimized fields; no restricted pastoral fields. | Pending |
| R-04 | Team leader team administration | Own team and explicitly assigned event only; no cross-team membership changes or exports by default. | Pending |
| R-05 | Field worker and follow-up volunteer contact fields | Minimum assigned-contact fields needed for follow-up; phone/email visibility and edits separately approved. | Pending |
| R-06 | Individual SMS by field workers/volunteers | Disabled until purpose, scope, recipient eligibility, cap and approval are defined. | Pending |
| R-07 | Team leader bulk SMS permissions | May prepare team/event-scoped draft only; dispatch requires separate authorized approval. | Pending |
| R-08 | Campaign creator/approver separation | Creator and approver must be different active users; any emergency exception is explicit and audited. | Pending |
| R-09 | Coordinator automated SMS configuration | No global provider/rule enablement; allow only approved trigger catalogue and templates after explicit capability grant. | Pending |
| R-10 | Care record read/update roles | Assigned care workers only; Admin/Pastor oversight as a separate audited capability. | Pending |
| R-11 | Intercessor creation and linked contact identity | Intercessor may create a request if authorized and see assigned request text; linked contact identity/phone minimized and separately approved. | Pending |
| R-12 | Contact/report exports and masking | Admin/Pastor only by default; export-specific capability, scoped fields, audit and masking. | Pending |

## B. Logical data and workflow decisions

| ID | Decision to approve | Recommended safe default pending approval | Approval / alternative |
|---|---|---|---|
| D-01 | Capability-by-role matrix and Admin/Pastor oversight exceptions | Approve the matrix only after R-01–R-12 are decided; no conditional grants become effective beforehand. | Pending |
| D-02 | Whether branch is an operational boundary or one fixed configuration record | Retain one configured branch context and enforce branch consistency; do not add multi-church/tenant administration. Confirm whether additional branches are a real requirement. | Pending |
| D-03 | Contact identity, duplicate and household policy | Do not make phone/email globally unique person identifiers; use duplicate suggestions plus privileged audited merge. Model household relationships only if required. | Pending |
| D-04 | Whether a follow-up task can be assigned to both a staff member and a team | Permit one primary target (person or team) initially; add dual assignment only if the operational workflow requires it. | Pending |
| D-05 | Public registration fields, anonymous-to-contact linking and duplicate review | Collect the minimum attendee fields; keep public intake separate from staff contact access; link/create canonical contacts only through a trusted reviewable server flow. | Pending |
| D-06 | Capacity, cancellation, waitlist and transport seat rules | Enforce capacity transactionally; no waitlist until explicitly required; separate registration from transport reservation and attendance. | Pending |
| D-07 | Prayer/care oversight, retention and deletion | Separate restricted tables, assignment-based access, explicit audited oversight, documented retention and controlled archival/deletion. | Pending |
| D-08 | Offline device identity, local expiry, sign-out and conflict recovery | Keep offline scope limited; encrypt local data, expire queues, reauthorize on sync, and never queue prayer/care narratives. | Pending |
| D-09 | SMS provider, consent/lawful basis, opt-out, quiet hours, sender ID and templates | No live dispatch until provider and Ghana-specific sender/regulatory requirements, recipient eligibility, opt-out, quiet hours and budget are approved. | Pending |
| D-10 | Automated SMS trigger catalogue and recipient class per trigger | Start with an explicit allowlist of low-risk operational triggers; each rule disabled by default and approved before activation. | Pending |
| D-11 | Campaign creator/approver/sender separation, caps and spend limits | Separate creator and approver; enforce per-campaign and global spend/segment caps before dispatch. | Pending |
| D-12 | Report payload fields and review authority | Define typed fields for required reports; only use validated structured JSON for genuinely variable report sections. Reviewers are scope-limited. | Pending |
| D-13 | Retention periods for contacts, pastoral records, messages, delivery events and audit | Do not choose arbitrary periods in code; approve a retention schedule by data class, with legal/pastoral review and documented deletion/anonymization. | Pending |

## C. Additional security and operational approvals

These are implementation gates alongside R/D decisions:

| Area | Decision required | Recommended safe default | Status |
|---|---|---|---|
| Staff authentication | Email/password sign-in, one-time temporary-password onboarding, mandatory first-login password replacement, administrator-reviewed reset and session revocation | Supabase Auth manages passwords and sessions; temporary passwords are random, short-lived and emailed only to the verified account address. Administrators never see or set a user's permanent password. | Confirmed by product owner — 10 Nov 2026 |
| Branch model | Confirm branch count and whether branch scope applies to all operational records | One configured branch context unless church leadership confirms additional branches. | Pending |
| Public site | Exact public fields, publication authority, abuse/rate limits and contact-form retention | Published content only; no anonymous directory access. | Pending |
| SMS content | Sender identity, template approval, opt-out language, service-message classification and inbound keyword handling | No dispatch until provider capabilities and lawful handling are confirmed. | Pending |
| Offline security | Device encryption, device/session revocation, local queue expiry and shared-device sign-out | Minimal encrypted queue with short approved retention and server-side reauthorization. | Pending |
| Audit | Events that require audit, retention, access to audit logs and tamper protection | Append-only audit with least-privilege read access; no secrets or sensitive narrative copied into generic metadata. | Pending |

## D. Approval record

| Field | Record |
|---|---|
| Church/stakeholder representative | Pending |
| Technical reviewer | Pending |
| Approval meeting/date | Pending |
| Approved R-01–R-12 | Product-owner implementation baseline selected; church sign-off pending |
| Approved D-01–D-13 | Product-owner implementation baseline selected; church sign-off pending |
| Approved authentication decision | Supabase email/password confirmed by product owner — 10 Nov 2026 |
| Approved SMS/provider decision | None yet |
| Conditions or exceptions | Pending |
| Approved ERD revision | Pending |
| Approved physical schema revision | Pending |

## E. Change-control rule

When a decision is approved:
- record the exact approved option, approver and date in this register;
- update the role matrix and/or logical model;
- update the physical schema and ERD where affected;
- add or revise authorization and database tests;
- preserve a short change rationale in the relevant design document.

Do not create production grants, executable migrations or hosted database changes from an unapproved recommendation.
