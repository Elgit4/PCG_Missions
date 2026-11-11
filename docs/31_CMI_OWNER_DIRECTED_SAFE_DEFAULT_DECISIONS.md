# PCG Missions CMI — Owner-Directed Safe-Default Decision Baseline

**Decision authority:** Product owner / project owner  
**Decision date:** 11 November 2026  
**Scope:** Interim implementation baseline for R-01–R-12 and D-01–D-13  
**Status:** Approved by the product owner for implementation as the current project default; **not represented as church-board, pastoral-lead, legal or regulatory sign-off**.

## 1. Decision rule

The product owner has explicitly instructed the engineering team to implement the most widely accepted, conservative professional defaults for every unresolved decision. These defaults govern the current implementation and release configuration. They may be amended through the normal change-control process if church stakeholders later require a different workflow.

This authorization resolves the engineering ambiguity; it does not waive legal obligations, authorise processing that requires a lawful basis, or turn disabled capabilities into permission to operate them. Where evidence, provider configuration, legal review or a named church policy is required, the feature remains disabled until that gate is satisfied.

The baseline follows:
- Least privilege, deny by default, and authorization on every request (OWASP).
- RLS and explicit grants/policies on every exposed Supabase table; positive and negative database tests.
- Data minimisation, purpose limitation, transparency, security and retention limitation under Ghana's Data Protection Act, 2012 (Act 843), and Data Protection Commission guidance.
- Privacy-aware audit: record security events and accountability evidence without copying passwords, tokens, private narratives or unnecessary personal data into logs.

## 2. Authorization decisions R-01–R-12

| ID | Implemented default | Enforcement rule |
|---|---|---|
| R-01 | Admin/Pastor pastoral oversight is a separate capability, not an automatic role bypass. | Grant only the dedicated Admin/Pastor oversight-read capabilities for prayer and care. Every read must pass the allowlisted reason-code check and append-only access audit in the same transaction. No oversight mutation or broad role bypass. |
| R-02 | Coordinator may coordinate prayer workflow metadata only. | May see permitted assignment/status/queue metadata; no request narrative or care note access. |
| R-03 | Coordinator ordinary contact access is branch-scoped and minimized. | Branch boundary applies; phone/email and restricted notes are excluded from the default projection unless separately granted. |
| R-04 | Team Leader administration is limited to active own-team membership and explicitly assigned events. | No cross-team membership edits, branch-wide reassignment, bulk export or access based solely on role title. |
| R-05 | Field Worker and Follow-up Volunteer receive minimum assigned-work fields. | Phone/email visibility and editing are separate capabilities; do not grant by default. Any exception is an explicit, auditable grant. |
| R-06 | Individual SMS for Field Worker/Volunteer is disabled. | No send capability or dispatch route until lawful basis/consent, scope, cap, sender and approval gates are satisfied. |
| R-07 | Team Leader may prepare team/event-scoped campaign drafts only. | No approve/send permission. A separate approver is required for dispatch. |
| R-08 | Campaign creator and approver must be different active users. | Database/service operation rejects self-approval. No single-user emergency bypass is enabled by default. |
| R-09 | Coordinator global SMS automation/provider configuration is disabled. | Automation rules and provider dispatch are disabled by default; only an explicitly allowlisted, reviewed rule can later be activated. |
| R-10 | Care access is assignment-based, with separate Admin/Pastor oversight. | No assigned-care worker role exists among the six roles, so assigned care read/update remains ungranted. Admin/Pastor receives only the separate reason-coded, audited care oversight-read capability; no care mutation grant. |
| R-11 | Intercessor may create a request only through the approved intake flow and read only actively assigned request text. | Grant only `prayer.request.read.assigned` at `assigned` scope; no request creation, assignment management, unassigned discovery or linked contact identity. |
| R-12 | Exports are disabled except for a dedicated Admin/Pastor export capability. | Export requires scope-filtered fields, masking, explicit confirmation, reason, audit and limits. No broad export grant is seeded. |

## 3. Logical data/workflow decisions D-01–D-13

| ID | Selected default | Implementation consequence |
|---|---|---|
| D-01 | Use the least-privilege capability matrix in section 2; no wildcard/admin bypass. | Seed only explicit capabilities. Sensitive, SMS and export grants remain absent until a controlled grant workflow and tests exist. |
| D-02 | One configured church and one operational branch context for this release. | Every operational record has a branch FK and branch consistency is enforced. Do not implement multi-church tenancy or cross-branch administration. |
| D-03 | Phone/email are not unique person identifiers; household model deferred. | Keep duplicate suggestions and a privileged, audited merge workflow. Never auto-merge based only on a shared phone/email. |
| D-04 | One primary task assignee: either one staff member or one team. | Enforce exactly one target at a time; history is retained when reassigned. |
| D-05 | Public registration collects only minimum necessary fields. | Anonymous intake writes to a narrow registration/intake boundary only after a privacy notice, lawful purpose/basis, data-minimised fields, rate limits and abuse controls are approved and implemented. It cannot read the staff contact directory. Canonical contact creation/linking happens only through a trusted, reviewable staff flow with duplicate review. Public registration remains disabled until those gates pass. |
| D-06 | Registration capacity is transactional; no waitlist in the initial release. | Capacity reservation and cancellation are atomic/idempotent. Transport seats are a separate optional reservation with their own capacity. Attendance/check-in is separate from registration. |
| D-07 | Prayer and care are separate restricted domains. | Assignment-scoped access, explicit audited oversight, archival instead of casual hard-delete. No automatic narrative purge until a data-class retention schedule is approved. |
| D-08 | Offline mode is disabled for the initial production release. | Do not cache contacts, prayer/care or event attendance offline. Re-enable only after encrypted local storage, device/session binding, expiry, sign-out and conflict-recovery tests pass. |
| D-09 | SMS dispatch is disabled until Ghana-specific provider/sender and data-protection prerequisites are verified. | No live provider sends, secrets or scheduled dispatch. Require documented lawful basis, consent/opt-out where applicable, sender approval, quiet hours, cost controls and provider agreement. |
| D-10 | Automated SMS trigger catalogue starts empty and all rules are disabled. | No automatic messages. Each future trigger requires approved audience, purpose, template, timing, idempotency and explicit enablement. |
| D-11 | Campaign creator/approver/sender separation; strict budget and segment caps. | Separate capabilities and actors; freeze audience/content at approval; any material change invalidates approval. No emergency self-approval by default. |
| D-12 | Reports use typed fields and workflow-specific review. | No arbitrary unvalidated JSON for core report facts. Scope reviewers to branch/team/assigned work; exports remain disabled by default. |
| D-13 | No arbitrary retention periods are invented in code. | Minimise collection now; support archival and controlled deletion/anonymisation, but do not automatically purge until a documented schedule is approved by the controller with legal/pastoral input. Review backups and audit separately. |

## 4. Cross-cutting operational defaults

- **Authentication:** Supabase Auth email/password. Random short-lived temporary password for onboarding/reset; mandatory first-login replacement; generic/rate-limited recovery; administrator reviews reset requests but never sees or chooses a permanent password. Deactivation blocks server-side operations and revokes sessions.
- **Branch model:** One configured branch, not multi-tenant. A branch FK and consistent scope check remain mandatory.
- **Public surface:** Only explicitly published content and narrow event registration are public. Rate-limit and validate all anonymous writes. No contact search or directory endpoints.
- **Audit:** Append-only security/business audit for role/account changes, sensitive narrative reads, merges, exports, approvals, publication and dispatch attempts. Do not log passwords, tokens, message contents, pastoral narrative or unnecessary phone/email.
- **Field-level privacy:** Use server-side DTO/projection allowlists. UI hiding is not security. Do not return fields a role cannot read.
- **Delete policy:** Prefer status transitions and archival. Hard deletion is restricted to an approved, auditable retention/deletion workflow.
- **Data protection:** Before real personal data is loaded, the church as controller must verify DPC registration obligations, privacy notice, lawful purpose/basis, data-subject process, processor contracts and designated data-protection supervision.

## 5. Release gates that remain mandatory (not policy choices)

These are not blockers to implementing the safe-default code, but they are blockers to enabling the affected production functionality:
1. Ghana Data Protection Commission/controller compliance and privacy notice.
2. Provider selection, sender-ID/route approval and legal/provider confirmation before SMS.
3. Production email provider, domain authentication and end-to-end onboarding/recovery test.
4. Staging deployment, restore rehearsal, monitoring and UAT.
5. Stakeholder walkthrough and change request if church operating practice differs.
6. Written retention schedule before automated deletion/purge.
7. Independent security review of pastoral oversight before any oversight grant is activated.

## 6. External standards and sources

- OWASP Authorization Cheat Sheet — least privilege, deny by default, validate authorization on every request: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- Supabase Row Level Security guide — enable RLS, align grants, write per-operation policies and test allow/deny cases: https://supabase.com/docs/guides/database/postgres/row-level-security
- Ghana Data Protection Commission — Data Protection Act 2012 (Act 843), registration and controller/processor obligations: https://dpc.gov.gh/compliance/ and https://dpc.gov.gh/for-organisations/
- Ghana Data Protection Act, 2012 (Act 843) — purpose limitation, data-subject awareness, retention limitation and security safeguards: https://ghalii.org/akn/gh/act/2012/843/eng@2012-05-18
- OWASP Logging Cheat Sheet — audit security events while excluding/masking credentials and sensitive personal data: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## 7. Change control

This is the product owner's current engineering baseline. Stakeholders may request amendments at any time. Each amendment must record the requested change, rationale, approver, date, impact on roles/data/security, migration plan, tests and rollback. A later stakeholder change does not retroactively make the present least-privilege baseline unsafe or invalid.

**Important:** This document records product-owner authority to implement standard defaults. It does not falsely claim that the church board, pastoral lead, Ghana DPC or SMS provider has approved matters reserved to them.
