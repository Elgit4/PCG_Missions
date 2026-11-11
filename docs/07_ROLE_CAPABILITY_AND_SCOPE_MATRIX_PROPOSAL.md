# CMI Follow-up — Role, Capability & Scope Matrix (Proposal)

**Version:** 0.2 | **Baseline:** CMI Follow-up v2.1 | **Status:** Product-owner safe-default baseline selected for implementation; church policy may amend through change control
**Branch:** design/cmi-logical-data-model

> This matrix translates the v2.1 role descriptions into testable authorization rules. The product owner has authorized implementation of the conservative defaults in document 31. Conditional or sensitive capabilities remain ungranted until their technical and compliance gates are met.

## 1. Authorization model

A protected operation is allowed only when all applicable conditions pass:

1. Authenticated staff identity and active account.
2. Required capability granted through at least one active role assignment.
3. Record belongs to the configured church/branch context.
4. Relevant team, event, contact-assignment or explicit-sharing predicate passes.
5. Sensitive prayer/care policy passes independently of ordinary role union.
6. Requested state transition is valid.
7. Required approval exists; campaign approval should be separate from dispatch where feasible.

Multiple active roles add eligible capabilities but never widen record scope. A user who is both a field worker and prayer intercessor still cannot read another intercessor's prayer request. Event assignment does not grant church-wide contact access. Hiding a UI control is not authorization.

## 2. Scope vocabulary

| Scope | Meaning | Server-side condition |
|---|---|---|
| Church/branch | The one configured church instance and active branch context | Record branch matches configured branch; no cross-church tenancy |
| Assigned contact | Contact currently assigned or explicitly shared with requester | Active assignment/share checked at request time |
| Team | Team the requester actively belongs to; leadership actions require active leader membership | Active membership and required membership role |
| Event | Event requester is assigned to or explicitly authorized to coordinate | Active event assignment plus event capability |
| Own | Work created/submitted by requester where self-access is permitted | Actor/author matches authenticated staff profile |
| Assigned prayer | Request actively assigned to requester | Active prayer-assignment row |
| Public published | Explicitly published content or enabled public event projection | Published/active state and narrow public projection |
| Privileged oversight | Explicitly authorized Admin/Pastor review of restricted pastoral data | Separate capability, active account and immutable audit event |

Team membership does not automatically grant access to every contact in the church. Coordinator church-contact access is not permission to read confidential care data or every restricted field.

## 3. Proposed capability catalogue

Capabilities are stable action codes, not UI routes. Do not introduce an implicit wildcard grant.

| Domain | Capability code | Action |
|---|---|---|
| Staff | staff.directory.read | Read permitted staff directory fields |
| Staff | staff.account.manage | Manage existing staff account status and initiate approved credential reset/reissue |
| Authorization | access.role.assign | Assign/remove role assignments |
| Authorization | access.capability.manage | Maintain capability grants and policy configuration |
| Teams | team.manage | Manage teams and memberships |
| Areas | area.manage | Configure service areas and staff coverage |
| Contacts | contact.capture.create | Create a field/public-intake capture through approved path |
| Contacts | contact.read.scoped | Read ordinary contact fields within scope |
| Contacts | contact.update.scoped | Update ordinary contact fields within scope |
| Contacts | contact.merge | Merge duplicate contacts with audited workflow |
| Contacts | contact.export.scoped | Export authorized, minimized contact fields |
| Contact history | contact.note.create | Add ordinary non-sensitive note |
| Contact history | contact.note.read.scoped | Read ordinary notes within visibility scope |
| Contact history | contact.interaction.record | Record calls, visits and outcomes |
| Assignment | contact.assign.scoped | Assign/reassign contacts within scope |
| Follow-up | followup.task.create | Create follow-up task for in-scope contact |
| Follow-up | followup.task.read.scoped | Read tasks in permitted assignment/team scope |
| Follow-up | followup.task.update.scoped | Update permitted task fields/status |
| Follow-up | followup.task.assign.scoped | Assign/reassign task within scope |
| Prayer | prayer.request.create | Create prayer request |
| Prayer | prayer.request.read.assigned | Read requests actively assigned to requester |
| Prayer | prayer.request.update.assigned | Update permitted fields/status on assigned request |
| Prayer | prayer.manage.scoped | Coordinate assignment/expiry/workflow without implied unrestricted narrative access |
| Prayer | prayer.oversight.read | Privileged oversight read of restricted prayer content |
| Prayer | prayer.oversight.manage | Privileged reassignment/answer/removal workflow |
| Care | care.directory.read.scoped | Read care group/directory within approved scope |
| Care | care.record.read.assigned | Read assigned care records |
| Care | care.record.update.assigned | Update assigned care status/interactions |
| Care | care.oversight.read | Privileged oversight read of restricted care records |
| Care | care.oversight.manage | Privileged care reassignment/management |
| Events | event.read.scoped | Read event within branch/event scope |
| Events | event.manage.scoped | Create/update event within authorized scope |
| Events | event.registration.manage.scoped | Manage registrations |
| Events | event.checkin.scoped | Record attendance/check-in |
| Events | event.closeout.submit | Submit event closeout |
| Events | event.closeout.review | Review event closeout |
| Calendar | calendar.manage.scoped | Manage permitted calendar entries |
| Announcements | announcement.create.scoped | Draft announcement for authorized audience |
| Announcements | announcement.publish.scoped | Publish announcement to authorized audience |
| SMS | sms.individual.send.scoped | Send manual message to in-scope recipient |
| SMS | sms.campaign.create.scoped | Create and preview bulk campaign |
| SMS | sms.campaign.approve | Approve campaign for dispatch |
| SMS | sms.campaign.send.scoped | Initiate approved campaign within scope/caps |
| SMS | sms.automation.configure | Configure approved triggers, recipients and templates |
| SMS | sms.automation.pause | Pause/disable automation rule |
| SMS | sms.delivery.read.scoped | Read permitted delivery metadata |
| SMS | sms.provider.configure | Configure provider/sender settings server-side |
| Content | content.manage.draft | Create/edit unpublished visitor content |
| Content | content.publish | Publish/hide visitor-facing content |
| Reports | report.submit.scoped | Submit permitted ministry report |
| Reports | report.read.scoped | Read reports within author/team/event scope |
| Reports | report.review.scoped | Review/approve/return reports within authority |
| Reports | report.export.scoped | Export authorized report data |
| Audit | audit.read.privileged | Read privileged audit records |
| Settings | church.settings.manage | Maintain church profile and operational settings |

Every capability must still be combined with scope predicates and field restrictions.

## 4. Proposed role-to-capability grant matrix

Legend: **G** proposed default grant; **S** scoped grant; **P** privileged Admin/Pastor grant; **C** conditional pending approval; **—** no grant proposed.

| Capability group | Admin / Pastor | Coordinator | Team leader | Field worker | Follow-up volunteer | Prayer intercessor |
|---|---:|---:|---:|---:|---:|---:|
| Staff directory read | G | S | S | — | — | — |
| Staff account provision/activation | P | — | — | — | — | — |
| Role assignment | P | — | — | — | — | — |
| Capability/policy administration | P | — | — | — | — | — |
| Team management | P | C | C | — | — | — |
| Service area configuration/coverage | P | C | C | — | — | — |
| Contact capture create | G | G | S | S | C | — |
| Ordinary contact read | G | S | S | S | S | — |
| Ordinary contact update | G | S | S | S | S | — |
| Contact merge | P | C | — | — | — | — |
| Contact export | P | C | C | — | — | — |
| Ordinary notes read/create | G | S | S | S | S | — |
| Contact interactions record | G | S | S | S | S | — |
| Contact assignment/reassignment | P | S | S | C | C | — |
| Follow-up task create/read/update | G | S | S | S | S | — |
| Follow-up task assign/reassign | P | S | S | C | C | — |
| Prayer request create | G | G | C | C | C | G |
| Assigned prayer read/update | P* | C* | C* | — | — | S |
| Prayer workflow coordination | P | C | — | — | — | — |
| Prayer privileged oversight | P | — | — | — | — | — |
| Care directory/groups | P | C | C | — | — | — |
| Assigned care record read/update | P* | C* | C* | — | — | — |
| Care privileged oversight | P | — | — | — | — | — |
| Event read/manage | G | G | S | S | C | — |
| Registration management | G | G | S | S | C | — |
| Event check-in | G | G | S | S | C | — |
| Event closeout submit | G | S | S | C | — | — |
| Event closeout review | P | S | C | — | — | — |
| Calendar management | G | S | S | C | C | C |
| Announcement create/publish | G | S | S | — | — | — |
| Manual individual SMS | P | S | S | C | C | — |
| Bulk campaign create | P | S | S | — | — | — |
| Bulk campaign approve | P | C | — | — | — | — |
| Bulk campaign send | P | S | S | — | — | — |
| SMS automation configure/pause | P | C | — | — | — | — |
| SMS delivery metadata read | P | S | S | C | C | — |
| Provider/sender configuration | P | — | — | — | — | — |
| Public content draft management | G | S | C | — | — | — |
| Public content publish | P | C | — | — | — | — |
| Report submit | G | G | S | S | S | C |
| Report read | G | S | S | S | S | C |
| Report review | P | S | C | — | — | — |
| Report export | P | C | C | — | — | — |
| Privileged audit read | P | — | — | — | — | — |
| Church-wide settings | P | — | — | — | — | — |

* Admin/Pastor oversight is a separate explicit capability, not an unconditional bypass of assignment/privacy rules. The P notation here means the role may be granted that separate oversight capability subject to audit and approved policy.

### Role interpretation

**Admin / Pastor**
- Proposed church-wide operational administration, team/settings, approved exports and privileged pastoral oversight.
- Prayer/care access must remain a separate, auditable capability.
- Account administration uses temporary credentials or secure reset/reissue. Administrators must not know or set a user's permanent secret.

**Coordinator**
- Proposed church/event operations, scoped contacts and follow-up, reports, announcements and permitted team communication.
- The guide says “prayer management” but does not define whether that means request text, assignment, status or workflow metadata. Until approved, grant workflow/assignment metadata only; no broad narrative read.
- Church contact access means an operational workspace with field restrictions, not unrestricted pastoral data access.

**Team leader**
- Team-scoped contact/report access, event management within assigned scope, follow-up coordination and team communication.
- Cannot access another team's records without explicit sharing or event assignment.
- Team membership and team-leader authority are separate.

**Field worker**
- Create field captures and access own/assigned contacts and reports.
- No unrestricted directory, merge, export, prayer or care access.
- Manual SMS is conditional and must target an in-scope contact.

**Follow-up volunteer**
- Read/update assigned follow-up work, permitted contact fields, record interactions and submit own reports.
- No reassignment, bulk export, bulk campaign or prayer/care access by default.
- Individual SMS remains conditional.

**Prayer intercessor**
- Read/update only prayer requests actively assigned to them.
- No general contact directory access. Any linked contact projection is minimized to fields needed for the assignment.
- No care records, contact exports or SMS campaign privileges by default.

## 5. Cross-domain and field-level restrictions

| Data | Default restriction |
|---|---|
| Contact identity | Return only fields needed for permitted workflow; phone/email may need separate field permission |
| Ordinary contact notes | Apply visibility and team/assignment scope; never store confidential pastoral content here |
| Prayer request text | Assigned intercessor and separately authorized, audited oversight only |
| Care summaries/interactions | Assigned care workers and separately authorized, audited oversight; exact roles require approval |
| SMS body and recipient number | Authorized message operators only; mask numbers in broad delivery views |
| SMS consent/suppression evidence | Restricted communication administration; dispatch reads only eligibility fields it needs |
| Password/credential metadata | Never client-readable; never store plaintext passwords or temporary credentials |
| Audit metadata | Privileged readers; no secrets or sensitive narrative |
| Public content | Anonymous read only when explicitly published/active |
| Public registration | Narrow create workflow; no public contact-directory lookup |

Audit sensitive access without copying sensitive text into audit rows. Record actor, action, target ID, timestamp and safe reason/category where required.

## 6. SMS action separation

- Individual send requires individual-send capability, in-scope recipient, approved purpose, valid phone and send-time consent/lawful-basis/suppression checks.
- Campaign creation only drafts, estimates audience/segments/cost and records recipient inclusion/exclusion; it does not dispatch.
- Approval applies to exact content, audience and cost estimate. Any material change invalidates approval.
- Dispatch requires a separate send capability and revalidates recipient eligibility, scope and budget/caps immediately before sending.
- Automation configuration is limited to approved trigger types, recipient classes, template versions, quiet hours and caps.
- Pause stops future queueing; already submitted provider messages may not be recallable.
- Provider configuration is Admin/Pastor-only and server-side; credentials must never be returned to a browser.
- Default separation: campaign creator and approver must be different active users. No self-approval exception is enabled. A later documented church policy may add a constrained emergency workflow with explicit limits and audit.

## 7. Non-role public access

| Public operation | Anonymous visitor |
|---|---|
| Read published church profile, welcome messages, sermons, daily words and digital tracts | Allow |
| Read active public event listing/details | Allow |
| Submit registration for enabled event | Allow through narrow validated endpoint |
| Read drafts, private event workspace or staff assignments | Deny |
| Query contacts/staff, assignments, reports, prayer/care or attendance | Deny |
| Check whether a phone belongs to a contact | Deny |
| Read transport passenger list/private check-in records | Deny |

## 8. RLS policy shape

Use operation-specific policies, not one broad FOR ALL policy.

- SELECT: active staff + read capability + branch + team/event/assignment predicate + sensitive-domain predicate.
- INSERT: active staff + create capability + branch + valid actor/assignment + allowed initial state.
- UPDATE: USING checks the existing row is in scope; WITH CHECK ensures the new row remains in scope and has valid ownership/state.
- DELETE: deny by default; prefer archival/status transitions. Hard delete requires approved retention/privacy workflow and audit.
- Public access: separate published-content projections and server-side registration endpoint; never grant anonymous access to base contact tables.
- Edge Functions/service-role operations independently authenticate and authorize the caller. Service-role RLS bypass does not waive business authorization.
- Prefer invoker-rights helpers. Any justified definer helper must pin search_path, check auth.uid() internally, revoke default public execution and have negative tests.

## 9. Minimum authorization test catalogue

| ID | Scenario | Expected |
|---|---|---|
| AUTH-001 | Inactive staff accesses staff data | Denied |
| AUTH-002 | User lacks required capability | Denied |
| AUTH-003 | Record is outside configured branch | Denied |
| AUTH-004 | Team leader requests another team's contact | Denied unless explicit share/event scope |
| AUTH-005 | Field worker requests unrelated contact by UUID | Denied |
| AUTH-006 | Follow-up volunteer requests unassigned task | Denied |
| AUTH-007 | Volunteer reassigns task without grant | Denied |
| AUTH-008 | Intercessor reads active request assigned to them | Allowed, minimal fields |
| AUTH-009 | Intercessor reads unassigned/other intercessor request | Denied |
| AUTH-010 | Intercessor uses field-worker role to read unrelated prayer | Denied |
| AUTH-011 | Coordinator has workflow capability but no oversight | No unrestricted prayer narrative read |
| AUTH-012 | Admin/Pastor performs privileged pastoral oversight | Allowed only with explicit capability and audit |
| AUTH-013 | User updates row to move it into another team/branch | Denied by WITH CHECK |
| AUTH-014 | Multi-role user combines grants | Only if every scope predicate passes |
| AUTH-015 | Client forges role metadata | No permission change |
| AUTH-016 | Visitor reads unpublished content/private attendance | Denied |
| AUTH-017 | Public registration attempted for closed/full event | Safely rejected |
| AUTH-018 | Field worker sends SMS to unrelated contact | Denied |
| AUTH-019 | Bulk campaign includes opted-out recipient | Excluded before dispatch |
| AUTH-020 | Campaign body/audience changes after approval | Approval invalidated; send blocked |
| AUTH-021 | Automation paused before trigger execution | No new message queued |
| AUTH-022 | User reads delivery logs outside scope | Denied or redacted |
| AUTH-023 | Deactivated staff attempts export | Denied and audited |
| AUTH-024 | Offline operation replayed | Idempotent; no duplicate mutation |

## 10. Selected owner-directed defaults and remaining enablement gates

| ID | Approval question | Recommended default for review |
|---|---|---|
| R-01 | Does Admin/Pastor have unrestricted prayer/care narrative read or audited break-glass oversight? | Separate explicit oversight capability; audit each access |
| R-02 | Does Coordinator prayer management include request text, assignment, status or workflow metadata only? | Workflow/assignment metadata only until approved |
| R-03 | Can Coordinator access all ordinary church contacts or only operationally shared contacts? | Church-scoped operational access with field restrictions |
| R-04 | Can Team leaders create contacts, assign across teams, manage membership and export? | Team-scoped create/work; no cross-team actions/export by default |
| R-05 | Which contact fields can Field workers and Follow-up volunteers read/update? | Minimum necessary fields; phone/email access separately considered |
| R-06 | Can Field workers/Follow-up volunteers send individual SMS? | Off by default pending purpose, consent, cap and approval |
| R-07 | Can Team leaders create/approve/send bulk campaigns? | Draft only for own team/event; no approval or dispatch |
| R-08 | Must campaign creator and approver be different? | Yes where second approver exists; logged exception otherwise |
| R-09 | Can Coordinator configure automated SMS? | Disabled; empty trigger catalogue; no provider/global enablement |
| R-10 | Which roles can read/update care records? | Assigned care workers only; Admin/Pastor oversight separately audited |
| R-11 | Can intercessors create requests and see linked contact name/phone? | Create only through approved intake; assigned request text only; no linked phone/email projection |
| R-12 | Which roles may export contact/report data and what masking applies? | Export disabled until dedicated audited capability, masking and release gate are implemented |

No migration should encode conditional grants until these decisions are approved.

## 11. Approval record

For each R-ID, record decision (approved/rejected/changed), exact rule and exceptions, approver/date, affected capabilities/fields/scope, corresponding positive/negative test IDs and migration/policy version.

## 12. Decision crosswalk

R-01–R-12 are cross-referenced with the broader logical-model decisions D-01–D-13 in [11 — Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md). The two decision sets are distinct; neither is approved by this cross-reference. Cross-document validation findings are recorded in [09 — Database Design Validation Report](09_DATABASE_DESIGN_VALIDATION_REPORT.md).

## 13. Next engineering gate

The product owner selected the standard conservative defaults in [document 31](31_CMI_OWNER_DIRECTED_SAFE_DEFAULT_DECISIONS.md). Implementation follows those defaults; provider/legal/stakeholder gates remain before enabling sensitive live operations.

1. Freeze capability codes and role assignments.
2. Finalize contact sharing, care assignments, capability grants and audit-reason entities.
3. Produce physical PostgreSQL schema and RLS design.
4. Implement isolated local Supabase migrations only; never apply to hosted production without explicit approval.
5. Build positive/negative tests for every capability/scope combination, role unions and sensitive pastoral data.
6. Only then integrate and test the SMS provider sandbox.
