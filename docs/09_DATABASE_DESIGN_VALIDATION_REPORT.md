# CMI Follow-up — Database Design Validation Report

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Branch:** `design/cmi-logical-data-model`  
**Status:** Documentation review completed; stakeholder approval and technical validation remain open  
**Scope:** Logical model, role/capability matrix, physical PostgreSQL schema proposal and master product specification

## 1. Executive result

The logical model, authorization matrix and physical schema proposal are directionally consistent with the CMI v2.1 product scope. The review identified several implementation-level gaps that would create security, integrity or requirements-drift risk if left implicit. The physical schema proposal has been amended to make those safeguards explicit.

**This is not database implementation approval.** No SQL migrations, hosted Supabase changes, live RLS policies or application code were created or changed. No PostgreSQL parser, database instance, Supabase security advisor or automated RLS test suite was run.

## 2. Validation findings and disposition

| ID | Finding | Risk if unresolved | Disposition |
|---|---|---|---|
| VAL-01 | PIN guidance could be read as replacing the stated email + PIN login with a password-based flow. | Requirements drift and an unapproved authentication design. | Updated physical proposal: preserve email + PIN as the product baseline; recommend one-time activation followed by a private user-established PIN, subject to explicit security approval of the Supabase integration. |
| VAL-02 | RLS SELECT policies do not automatically create an audit record for every permitted read. | A claim of audited prayer/care narrative access could be false while direct table reads remain possible. | Updated physical proposal: if every narrative read must be audited, route reads through a narrow trusted server-side function/Edge Function that authorizes, writes the audit event and returns minimal fields; block alternate direct read paths. |
| VAL-03 | Branch IDs on both parent and child records did not explicitly guarantee that their branch values match. | Cross-branch relational inconsistencies even when each row independently passes RLS. | Added composite unique/FK guidance for branch-consistent relationships. |
| VAL-04 | The logical model includes visitor-facing welcome messages, but the physical table inventory did not name a corresponding table. | Feature omission or ad hoc storage during implementation. | Added `welcome_message` to the physical inventory. |
| VAL-05 | Opt-out/suppression was modelled, but inbound provider STOP/opt-out callbacks had no explicit event receipt path. | Duplicate or unauthenticated opt-out processing and delayed suppression. | Added optional `sms_inbound_event` for providers supporting inbound keyword/callback flows; callback signature verification and idempotent suppression remain mandatory. |
| VAL-06 | Field-level restrictions were described alongside RLS without explicitly stating that RLS is row-level. | Developers may assume RLS alone hides selected contact columns. | Added explicit requirement for column grants, invoker-safe views or server-side DTOs/endpoints. |
| VAL-07 | Active team/role assignment uniqueness could be misread as a simple permanent unique key despite historical assignments. | Prevents legitimate history or permits overlapping active assignments. | Clarified use of partial unique indexes for active-row conventions or exclusion constraints where interval overlap must be prevented. |
| VAL-08 | Case-insensitive email uses `citext`, but the extension requirement was not explicit. | Clean migration failure or inconsistent email normalization. | Added explicit extension/normalization choice to PostgreSQL conventions and migration foundation. |
| VAL-09 | Staff capability overrides could be interpreted as a way to override mandatory denies or sensitive-data restrictions. | Privilege escalation around protected records. | Added a rule that overrides cannot bypass non-overridable capability restrictions or mandatory scope/sensitivity checks. |

## 3. Cross-document consistency checks

| Domain | Product baseline | Design consistency |
|---|---|---|
| Church boundary | One configured church instance; not a multi-church network | Church and branch context are represented without a tenant/network administration layer. |
| Roles | Six roles; users may hold multiple roles | Six-role catalogue and additive capabilities retain independent scope and sensitive-record checks. |
| Prayer/care | Restricted pastoral records; intercessors see assigned requests; oversight is controlled | Separate prayer/care tables, assignments and explicit oversight/audit capability are retained. |
| Contacts/follow-up | Capture, duplicate review/merge, assignment, tasks and history | Corresponding entities, provenance, merge audit and scoped assignments are present. |
| Events | Public registration when enabled, capacity, optional transport, check-in and closeout | Separate event, registration, transport, check-in and closeout records are present. |
| Public content | Profile, welcome content, sermons/daily words, tracts and external PDF links | Physical inventory includes public profile, welcome messages, sermons, daily words, tracts and external links; no PDF hosting is introduced. |
| SMS | Manual, bulk and automated SMS | Outbox send modes, campaign recipients, automation executions, preference/suppression, delivery callbacks and audit are modelled. |
| Offline | Limited capture queue, cached pickers and previously opened event check-in data | Design remains bounded; no full offline mode or queued prayer/care narrative is proposed. |
| Excluded scope | No WhatsApp automation, AI features or full offline operation | These remain outside the proposed schema. |

## 4. Approval items still open

Two separate decision sets must not be conflated:

### 4.1 Authorization decisions R-01 to R-12

These are recorded in [07 — Role Capability & Scope Matrix Proposal](07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md). They determine who may access or act on records and whether conditional grants can become effective.

- R-01: Admin/Pastor prayer/care oversight.
- R-02: Coordinator prayer workflow versus narrative access.
- R-03: Coordinator ordinary contact scope.
- R-04: Team leader cross-team administration, assignment and export.
- R-05: Field worker/volunteer contact fields.
- R-06: Field worker/volunteer individual SMS.
- R-07: Team leader bulk campaign permissions.
- R-08: Campaign creator/approver separation.
- R-09: Coordinator automation configuration.
- R-10: Care record access.
- R-11: Intercessor linked contact identity visibility.
- R-12: Contact/report export roles and masking.

### 4.2 Logical data decisions D-01 to D-13

These are recorded in [06 — Logical Data Model Proposal](06_CMI_LOGICAL_DATA_MODEL_PROPOSAL.md). They settle data shape and workflow semantics, not just role grants:

- D-01: Approve capability/scope matrix and oversight exceptions.
- D-02: Branch boundary semantics.
- D-03: Contact identity, duplicate and household policy.
- D-04: Whether a task may be assigned to both a person and a team.
- D-05: Public registration fields, anonymous-to-contact linking and duplicate review.
- D-06: Capacity, cancellation, waitlist and transport rules.
- D-07: Prayer/care oversight, retention and deletion.
- D-08: Offline device identity, local expiry, sign-out and conflict recovery.
- D-09: SMS provider, consent/lawful basis, opt-out, quiet hours, sender ID and templates.
- D-10: Automated SMS trigger catalogue and recipient classes.
- D-11: Campaign separation of duties, caps and spend limits.
- D-12: Report payload fields and review authority.
- D-13: Retention periods across contacts, pastoral records, messages, delivery events and audit.

Approval of R-01 to R-12 does not automatically approve D-01 to D-13. Both sets require recorded decisions. The PIN lifecycle and provider-specific integration also require explicit security review.

## 5. Recommended safe defaults pending approval

1. No broad prayer/care narrative access. Intercessors see only active assignments; Admin/Pastor oversight requires an explicit audited capability.
2. Coordinator prayer access is limited to workflow/assignment metadata until narrative access is approved.
3. Field worker and volunteer contact fields are minimized to the operational minimum; phone/email access is separately granted.
4. Conditional individual SMS and automated SMS configuration remain disabled until approved.
5. Campaign creator and approver are different active users; approval is required before dispatch.
6. Exports are Admin/Pastor-only by default, scoped, minimized and audited.
7. Public registration uses a narrow trusted endpoint and cannot enumerate the contact directory.
8. Branch consistency is enforced by relational constraints as well as RLS.
9. Sensitive narrative reads are mediated and audited if per-read audit is a requirement.
10. No full offline access; no prayer/care narrative in local queues.
11. No production grants are inferred from role labels or client-supplied metadata.
12. No migration is applied to a hosted Supabase project without explicit project identification and user approval.

The entity-by-entity mapping from the current seven-page ERD to the physical table proposal is recorded in [10 — ERD-to-Physical Schema Traceability](10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md). The consolidated approval worksheet is [11 — Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md). The typed first-slice data dictionary is [13 — Foundation, Contacts & Follow-up Data Dictionary](13_FOUNDATION_CONTACT_FOLLOWUP_DATA_DICTIONARY.md); it records additional physical refinements DD-01–DD-07 that must be resolved before migrations.

## 6. Next engineering gate

Before executable migrations:
1. Record approvals for R-01 through R-12 and D-01 through D-13.
2. Approve the ERD revision and reconcile every logical entity to its physical table and key.
3. Finalize field-level contact requirements, retention, public registration fields and event capacity state machine.
4. Approve email + PIN activation, private PIN establishment, reset/reissue and Supabase Auth integration threat model.
5. Select SMS provider and settle Ghana-specific sender identity, lawful basis/consent, opt-out, quiet hours, price/caps and callback protocol.
6. Produce a traceable physical data dictionary and executable migration drafts.
7. Build automated tests for RLS, cross-branch integrity, sensitive read auditing, public registration, SMS idempotency and negative role combinations.
8. Run migrations and tests against a local disposable Supabase/PostgreSQL environment before any hosted change.

## 7. Verification record

- [x] Compared product specification, logical model, role matrix and physical schema proposal.
- [x] Updated physical proposal for the findings above.
- [x] Added this validation report and repository cross-links.
- [ ] Stakeholder approval of R-01–R-12.
- [ ] Stakeholder approval of D-01–D-13.
- [ ] ERD-to-physical data dictionary sign-off.
- [ ] Executable SQL syntax validation.
- [ ] Local PostgreSQL/Supabase migration test.
- [ ] Automated RLS and negative authorization tests.
- [ ] Hosted Supabase approval and deployment.

**Conclusion:** The design is suitable for stakeholder review and the next schema-refinement stage. It is not yet suitable for generating or applying production migrations.
