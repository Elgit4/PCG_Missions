# PCG Missions — Client Stakeholder Approval & Handover Pack

**Project:** PCG Missions / Church Missions & Follow-up Information System  
**Repository:** `Elgit4/PCG_Missions`  
**Baseline:** CMI Follow-up v2.1  
**Prepared:** 10 November 2026  
**Document status:** Product-owner implementation defaults selected; church stakeholder review and sign-off remain available  
**Release status:** NOT approved for production deployment

---

## 1. Purpose and decision boundary

This pack converts the outstanding CMI stakeholder questions into a concrete, reviewable least-privilege baseline. It is intended for a decision meeting with the church's authorised representative(s), pastoral lead, ministry coordinator and technical owner.

The product owner has directed the engineering team to implement the conservative defaults in [document 31](31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md) now. This does not claim church-board or pastoral-lead sign-off. The client may select **Accept**, **Amend** or **Reject** during handover; any later change will be handled through change control. The system remains fail-closed for capabilities that are not implemented and enabled.

The system uses the owner-directed least-privilege baseline and continues to fail closed for any capability not explicitly implemented and enabled. The first administrator bootstrap is the sole exception and receives only the minimum branch-scoped account-control permissions documented in section 4.

## 2. Non-negotiable system rules

1. Preserve exactly the six approved roles. Do not create a Super Admin, Supervisor, or wildcard role.
2. Authentication, active account, active role assignment, branch, scope, capability and record state must all be checked server-side.
3. A UI-hidden action is not an authorization control.
4. Multiple roles may add capabilities but must never widen a record's team, event, assignment or sensitive-data scope.
5. Prayer and care narratives are restricted data. Ordinary contact, team, coordinator or event access never implies pastoral narrative access.
6. Service-role Edge Functions must independently authorize the caller; service-role RLS bypass is not business authorization.
7. Anonymous visitors can only read explicitly published public content and submit narrow validated registration forms. They cannot search staff, contacts, prayer, care, attendance or private records.
8. SMS dispatch, exports, offline access and bulk operations remain disabled until their separate controls are implemented, configured and tested.
9. No passwords, PINs, tokens, provider keys or recovery links may be exposed in browser-readable records, audit metadata or logs.
10. All privileged access, account changes, role changes, sensitive reads and approved exports must produce append-only audit evidence.

## 3. Six-role operating model

| Role code | Client-facing role | Intended operating boundary |
|---|---|---|
| `admin_pastor` | Admin / Pastor | Church/branch administration and approved oversight; no automatic pastoral bypass |
| `coordinator` | Coordinator | Branch operational coordination; restricted prayer workflow metadata only unless separately approved |
| `team_leader` | Team Leader | Own active team and explicitly assigned events |
| `field_worker` | Field Worker | Own/assigned contacts and field capture within authorised scope |
| `follow_up_volunteer` | Follow-up Volunteer | Assigned follow-up work and minimum contact fields |
| `prayer_intercessor` | Prayer Intercessor | Prayer requests actively assigned to that intercessor; no general contact directory |

The database role catalogue constrains role codes to these six values. The owner-directed visitor-management baseline seeds 52 branch/team/assigned-scoped role-capability grants across the six roles after removing default phone/email identity grants from Coordinator, Team Leader, Field Worker and Follow-up Volunteer. Admin/Pastor retains explicit branch-scoped identity capabilities; lower roles receive minimized projections. These are the limited visitor/follow-up permissions recorded in the current product-owner implementation baseline. Pastoral narrative, SMS, exports and offline capabilities remain ungranted/disabled pending their specific technical and compliance gates.

## 4. Implemented first-administrator baseline

The bootstrap assigns the first administrator the existing `admin_pastor` role in the configured branch. The four capabilities below are the limited staff-control-plane permissions needed for account administration. They are not the administrator's complete capability list: the Admin/Pastor role also receives the 18 branch-scoped visitor/follow-up MVP capabilities seeded by the separate visitor authorization migration. Bootstrap does not create extra business grants or bypass the role catalogue.

| Capability | Why it is needed |
|---|---|
| `staff.directory.read` | Read the minimum staff directory projection required to administer accounts and role assignments |
| `staff.account.manage` | Manage existing provisioned staff account status and administer approved recovery workflow |
| `access.role.assign` | Assign and revoke only the six defined staff roles |
| `staff.password_reset.manage` | Review reset requests and issue a one-time temporary password |

The bootstrap explicitly does **not** grant:
- `access.capability.manage` (prevents an administrator from silently rewriting the permission policy);
- unrestricted contact identity, contact export or report export;
- prayer or care narrative oversight;
- SMS provider configuration, campaign approval, campaign sending or automation;
- any unapproved business-domain permission.

The bootstrap-specific database assertions verify that the first administrator receives the four staff-control-plane capabilities and does not receive capability-policy editing, pastoral narrative oversight, SMS or export permissions. The role's separate visitor/follow-up grants and minimized contact identity defaults are verified by pgTAP. This technical baseline remains amendable through stakeholder change control.

## 5. Recommended role permission baseline for client approval

The following is the proposed operational baseline. Every entry is a recommendation until the client signs the relevant R/D decision. Scope words are literal constraints, not convenience labels.

| Capability area | Admin / Pastor | Coordinator | Team Leader | Field Worker | Follow-up Volunteer | Prayer Intercessor |
|---|---|---|---|---|---|---|
| Staff account lifecycle | Branch control-plane | None | None | None | None | None |
| Role assignment | Branch control-plane, six roles only | None | None | None | None | None |
| Capability policy editing | None through normal UI | None | None | None | None | None |
| Staff directory | Approved minimum fields | Branch-scoped | Team-scoped | None | None | None |
| Contact capture | Branch-scoped | Branch-scoped | Own team | Own/assigned work | Off unless approved | None |
| Ordinary contact read/update | Branch-scoped, minimized | Branch operational fields | Own team | Assigned contacts | Assigned contacts | None |
| Phone/email identity | Separate restricted capability; not inherited from ordinary contact access | Separate approval | Separate approval | Off pending approval | Off pending approval | Only minimum linked identity if approved |
| Contact merge/export | Separate audited approval; default off until approved | Off by default | Off | Off | Off | Off |
| Ordinary contact notes/interactions | Branch-scoped | Branch-scoped | Team-scoped | Assigned contacts | Assigned contacts | None |
| Follow-up task work | Branch-scoped | Branch coordination | Team-scoped | Assigned/self | Assigned/self | None |
| Prayer request creation | Allowed only if approved | Allowed only if approved | Conditional | Conditional | Conditional | Allowed only if approved |
| Prayer narrative read/update | No blanket access; separate audited oversight | Workflow metadata only by default | No | No | No | Assigned request only |
| Prayer workflow coordination | Separate explicit capability | Metadata/assignment only | No | No | No | Assigned request only |
| Care records | Separate audited oversight | No by default | Assigned care only if separately approved | No | No | No |
| Events/registration/check-in | Branch-scoped | Branch-scoped | Assigned events/team | Assigned event tasks | Conditional assigned event tasks | None |
| Calendar/announcements | Branch administration | Branch-scoped | Team/event-scoped | Read only if needed | Read only if needed | Read only if needed |
| Individual SMS | Disabled until approved | Disabled until approved | Disabled until approved | Disabled | Disabled | Disabled |
| Bulk SMS | Create/approve/send only under dual-control policy | Draft/approve only as approved | Draft for own team/event only | None | None | None |
| SMS automation/provider | Provider/global settings only after approval | No global control | None | None | None | None |
| Reports | Branch review | Branch/team review | Own team review | Submit own | Submit own | None unless approved |
| Audit logs | Privileged metadata only | None | None | None | None | None |
| Public content | Publish authority after approval | Draft only unless approved | Draft only if delegated | None | None | None |

### Exact interpretation rules

- **Branch-scoped** means the record belongs to the configured church/branch. It does not mean cross-church access.
- **Team-scoped** means current active team membership plus an operation-specific capability. A leader does not automatically see every contact or ministry record in the church.
- **Assigned** means an active assignment is checked at request time. A historical or revoked assignment is not enough.
- **Prayer intercessor** access is limited to requests actively assigned to that intercessor. A separate linked-contact projection must be minimal and approved.
- **Admin/Pastor oversight** is a separate explicit capability. It must be reason-coded, audited and reviewed; the role name alone is not a bypass.
- **Contact phone/email** are separate restricted fields. Permission to see a contact's name does not imply permission to see or export their phone number.
- **SMS creation, approval and dispatch** are separate operations. A campaign's content, audience and cost estimate must be frozen by approval; any material change invalidates that approval.
- **Creator/approver separation** is required where a second authorised person exists. A single-person emergency exception must have an approved lower cap and a recorded reason.

## 6. Authorization decisions R-01 to R-12

The product owner has selected the defaults in document 31 for the current implementation. The client may confirm or request changes at handover. Production enablement remains subject to the release gates recorded in document 31.

| ID | Decision | Recommended client default | Risk if left unresolved | Client decision |
|---|---|---|---|---|
| R-01 | Admin/Pastor access to prayer and care narratives | Separate reason-coded privileged oversight; audit every read; no blanket bypass | Confidential pastoral narratives exposed too broadly | Pending |
| R-02 | Coordinator prayer management | Assignment, status and workflow metadata only; no narrative read | Coordinator receives more sensitive data than required | Pending |
| R-03 | Coordinator ordinary contacts | Branch operational workspace with field minimisation; no restricted care/prayer fields | Over-broad directory visibility | Pending |
| R-04 | Team leader administration | Own team and explicitly assigned events only; no cross-team membership changes or exports | Cross-team data exposure and unauthorised staff changes | Pending |
| R-05 | Field worker/volunteer contact fields | Minimum assigned-contact fields; phone/email separately approved | Personal contact details unnecessarily exposed | Pending |
| R-06 | Individual SMS by field workers/volunteers | Disabled at launch | Uncontrolled messages, cost and consent risk | Pending |
| R-07 | Team leader bulk SMS | Team/event-scoped draft only; no approval or dispatch | Unapproved bulk messaging | Owner-directed default selected; SMS remains disabled |
| R-08 | Campaign creator/approver separation | Different active users; logged exception only when operationally unavoidable | Self-approved campaigns and uncontrolled spend | Pending |
| R-09 | Coordinator automated SMS configuration | Disabled; empty trigger catalogue; no provider/global enablement | Unintended automated messages and spend | Owner-directed default selected; SMS remains disabled |
| R-10 | Care record read/update | Assigned care workers only; Admin/Pastor oversight separate and audited | Unauthorised access to sensitive care details | Pending |
| R-11 | Intercessor creation and linked identity | Approved intake only; assigned request text; no linked phone/email projection | Unnecessary disclosure of requester's identity/contact | Owner-directed default selected; implementation pending |
| R-12 | Contact/report exports | Disabled until dedicated capability, masking, limits and audit are implemented | Bulk extraction of personal or pastoral information | Owner-directed default selected; export remains disabled |

## 7. Logical data and workflow decisions D-01 to D-13

| ID | Decision | Recommended default | Client decision |
|---|---|---|---|
| D-01 | Final capability-by-role matrix and oversight exceptions | Approve section 5 only after R-01–R-12; no wildcard grants | Pending |
| D-02 | Branch model | One configured church and one initial branch context; add multi-branch administration only after explicit requirement | Pending |
| D-03 | Contact identity, duplicates and households | Phone/email are not global unique person IDs; duplicate suggestions plus privileged audited merge; no household model unless needed | Pending |
| D-04 | Follow-up task target | Exactly one primary target: staff member or team; no dual assignment initially | Pending |
| D-05 | Public registration and contact linking | Minimum attendee fields; separate public intake; trusted staff review before linking to canonical contact | Pending |
| D-06 | Capacity, cancellation, waitlist and transport | Transactional capacity enforcement; no waitlist at launch; registration, attendance and transport are separate records | Pending |
| D-07 | Prayer/care data lifecycle | Separate restricted tables, assignment-based access, audited oversight, approved retention and controlled archival/deletion | Pending |
| D-08 | Offline device and queue policy | Offline mode disabled at initial launch; later allow only encrypted, short-lived, non-pastoral data with server reauthorization on sync | Pending |
| D-09 | SMS provider, consent, opt-out, quiet hours, sender and templates | No live SMS until provider, sender registration, consent/lawful basis, opt-out, quiet hours and budget are approved | Pending |
| D-10 | Automated SMS triggers | Explicit allowlist; each rule disabled by default and separately approved | Pending |
| D-11 | Campaign approval, caps and spend | Separate creator/approver; enforce per-campaign and global segment/spend caps before dispatch | Pending |
| D-12 | Report payload and review authority | Typed fields for core reporting; reviewer limited to branch/team/event authority | Pending |
| D-13 | Retention by data class | Client-approved schedule after pastoral/privacy/legal review; no arbitrary developer-selected retention periods | Pending |

## 8. Authentication and account recovery decision

**Product-owner decision (10 November 2026):** Staff sign in using **email + password** through Supabase Auth. This supersedes the earlier email + private PIN proposal in documents 11 and 30. The current password-based implementation is the selected direction for PCG Missions; do not build a custom PIN verifier or custom password store.

### Required password lifecycle

- Admin/Pastor provisions the first administrator and subsequent staff accounts through protected server-side operations.
- The system generates a cryptographically random, short-lived temporary password and emails it only to the verified account address.
- The user signs in with the temporary password and must set a new private password before accessing the workspace.
- Administrators may create accounts, deactivate/reactivate accounts, assign approved roles/scopes and review reset requests. They must never see or choose a user's permanent password.
- Forgot password creates a generic-response, rate-limited request and notifies the authorised Admin/Pastor. The administrator approves or denies with a reason; approval issues a fresh temporary password by email and forces password replacement.
- Temporary passwords must never be stored in plaintext, returned to the admin UI, written to logs or included in audit metadata. Supabase Auth manages password hashing and sessions.
- Credential reset/deactivation must revoke other active sessions. Failed email delivery must leave access gated and provide a safe, audited retry path.
- The one-time first-admin bootstrap must never be used to create a second identity. PR #33 adds a narrowly bounded, serialized recovery path for an undelivered first-admin temporary password; it rotates the temporary credential and retries delivery only while the account remains behind the mandatory first-password-change gate. It is unmerged and requires staging verification.

**Production status:** The selected password flow and PR #33 recovery/concurrency implementation passed branch-level backend CI, including 355 pgTAP assertions. PR #33 remains unmerged; production email configuration, staging verification, deployment and UAT remain release gates.
## 9. Client configuration and operational inputs

The client must supply or approve these before staging/production configuration:

| Input | Required from client |
|---|---|
| Authorised church approver and pastoral data owner | Name, role, approval date |
| Canonical church name and initial branch name | Exact display names |
| Initial Admin/Pastor mailbox | Verified email controlled by the client |
| Staff login model | Supabase Auth email + password; temporary-password onboarding and forced first-login replacement |
| Production domain and hosting owner | HTTPS domain and DNS access |
| Verified transactional email sender | Domain/sender approval and delivery owner |
| SMS provider account | Provider account owner, sender ID approval, consent and budget |
| Privacy/retention schedule | Approved retention by data class |
| Public registration fields | Approved required/optional fields and notice text |
| Client acceptance testers | One representative per role where possible |

No secrets should be pasted into GitHub issues, source files or this document. Secrets must be configured through the hosting provider's encrypted environment/secret manager.

## 10. Client acceptance tests

The client review should include at least one synthetic account for each role. Use synthetic records only; do not use real pastoral narratives in acceptance testing.

| Test ID | Test | Expected result |
|---|---|---|
| UAT-01 | Inactive staff signs in or calls an operation | Denied |
| UAT-02 | Staff without a capability opens a protected module | Denied server-side |
| UAT-03 | Team Leader requests another team's contact | Denied |
| UAT-04 | Field Worker requests an unrelated contact by UUID | Denied |
| UAT-05 | Follow-up Volunteer requests an unassigned task | Denied |
| UAT-06 | Prayer Intercessor reads their active assigned request | Allowed only if approved; minimal fields |
| UAT-07 | Prayer Intercessor reads another intercessor's request | Denied |
| UAT-08 | Coordinator with workflow metadata grant reads prayer narrative | Denied |
| UAT-09 | Admin/Pastor performs approved oversight | Requires separate capability, reason and audit entry |
| UAT-10 | Staff attempts to change a row into another branch/team | Denied |
| UAT-11 | Public visitor queries a contact or staff directory | Denied |
| UAT-12 | Public visitor reads unpublished content | Denied |
| UAT-13 | Campaign creator attempts self-approval | Denied where dual control is required |
| UAT-14 | Campaign audience includes an opted-out recipient | Recipient excluded before dispatch |
| UAT-15 | Deactivated staff reuses an existing session | Sensitive operations denied |
| UAT-16 | Admin initiates staff account reset | Staff receives one-time recovery path; admin never sees private credential |
| UAT-17 | Audit record is updated/deleted by application roles | Denied |
| UAT-18 | Offline client attempts to queue prayer/care narrative | Not available |

## 11. Release gates and evidence

The client handover is complete only when the following evidence is attached:

- [ ] R-01–R-12 signed by authorised church representative.
- [ ] D-01–D-13 signed by authorised church representative.
- [ ] Authentication model selected and implemented consistently in frontend, Edge Functions and database.
- [ ] Final role/capability matrix versioned and approved.
- [ ] All schema migrations applied to a dedicated staging project in dependency order.
- [ ] Database pgTAP suite passes on the complete staging migration set.
- [ ] Frontend unit/build tests pass on the same commit SHA as the release candidate.
- [ ] All required Edge Functions deployed to staging and tested with valid and invalid sessions.
- [ ] Security, performance and health advisors reviewed with no unresolved critical findings.
- [ ] Synthetic role-based UAT completed with evidence.
- [ ] Email sender, reset flow and domain verification tested.
- [ ] SMS sandbox tests completed; live dispatch remains disabled until approvals.
- [ ] Backup/restore and incident response responsibilities recorded.
- [ ] Client signs the final acceptance and go-live record.

## 12. Current engineering evidence (10 November 2026)

- PR #24, PR #25 and PR #26 are merged into `main`.
- The integrated frontend is in `web/`; backend and Edge Function source is in `supabase-cmi/`.
- The RLS-helper privilege-remediation migration is present in the hosted migration history.
- Hosted Supabase now contains 11 identity/authorization foundation tables and three recorded migrations; zero CMI Edge Functions are deployed. All 11 tables have RLS enabled, exactly six approved roles are seeded, and `role_capability` remains empty.
- The RLS helper is not directly executable by `anon`, `authenticated` or `service_role`.
- The latest backend CI run passed at current main commit `2528205046b48d1cca7b4c59f800780ce442a2cf` in [GitHub Actions run 42827620899](https://github.com/Elgit4/PCG_Missions/actions/runs/42827620899). The preceding run for the index migration was cancelled because the newer main-branch run superseded it. CI success validates repository workflows; it does not imply Edge Function deployment or application readiness.
- A dedicated frontend CI workflow passed on commit `7b5b497278209e3b56f8b13761462f2aad57fa66` in [GitHub Actions run 42825681902](https://github.com/Elgit4/PCG_Missions/actions/runs/42825681902), covering locked dependency installation, TypeScript type-check, ESLint, Vitest and Vite production build.
- The hosted migration history is `20261110130847` (RLS-helper privilege remediation), `20261110134538` (identity/authorization foundation) and `20261110134606` (supporting foreign-key indexes). Seven supporting FK indexes are present; no unindexed-FK advisor findings remain. The security advisor's 11 informational `rls_enabled_no_policy` notices are intentional because client policies remain withheld pending approval.
- No production staff accounts, church/branch/team records, business role grants or Edge Functions have been provisioned/deployed. The 11 foundation tables contain no operational data; only the six-row role catalogue is seeded.

**Decision:** Production release remains **NO-GO** until all approval and technical release gates above are complete.

## 13. Formal client approval record

| Approval field | Client record |
|---|---|
| Church / organisation | Pending |
| Authorised approver name and role | Pending |
| Pastoral/privacy data owner | Pending |
| Technical owner | Pending |
| Meeting date | Pending |
| Approved R-01–R-12 | Pending |
| Approved D-01–D-13 | Pending |
| Authentication model | Supabase Auth email + password; product-owner decision confirmed 10 Nov 2026 |
| Approved role matrix revision | Pending |
| Approved retention schedule | Pending |
| Exceptions and conditions | Pending |
| Client acceptance result | Pending |
| Signature / written approval reference | Pending |

---

**Change control:** After approval, record the exact selected option, approver, date and conditions in `docs/11_CMI_STAKEHOLDER_DECISION_REGISTER.md`. Update the role matrix, ERD, physical schema, migration, Edge Function authorization and positive/negative tests as one versioned change. Do not silently turn a proposed permission into an effective production grant.
