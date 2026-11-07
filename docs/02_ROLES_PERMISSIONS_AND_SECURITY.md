# CMI Follow-up — Roles, Permissions & Security

**Version:** 2.1 | **Status:** Security and authorization baseline | **Parent:** [Master Product Specification](00_MASTER_PRODUCT_SPECIFICATION.md)

## 1. Authorization principles
- Six operational roles are defined by the CMI guide.
- A user may hold more than one role; effective capabilities are combined.
- Role membership does not by itself remove church, team, event, assignment or record-level restrictions.
- Apply least privilege and deny by default.
- UI visibility is not authorization. Enforce every read/write in trusted server-side logic and database RLS.
- Sensitive prayer/care information has stricter rules than ordinary contact data.
- Public visitor access is a separate anonymous surface limited to explicitly published/public records and enabled public event registration.

## 2. Role catalogue

| Role | Primary responsibility | Default scope described by the guide |
|---|---|---|
| Admin / Pastor | Church-wide oversight and administration | Church-wide administration, team/settings, exports, oversight and privileged care workflows |
| Coordinator | Coordinate church and event ministry operations | Event coordination, church contact access, follow-up, reports, announcements, prayer management and permitted team communication |
| Team leader | Lead a ministry team | Team-scoped contacts/reports, event management, follow-up and team communication |
| Field worker | Capture people and field activity | Field capture and own contact/report access |
| Follow-up volunteer | Conduct assigned follow-up | Assigned/own contact follow-up and reports |
| Prayer intercessor | Handle assigned prayer requests | Private messages and prayer requests specifically assigned to them |

The descriptions are role intent, not a complete grant list. Do not infer unspecified privileges. Admin / Pastor is one combined role in this six-role baseline; splitting it into separate roles requires an approved change.

## 3. Multi-role behaviour
- A person may have multiple active role assignments.
- Effective capability set is the union of explicitly granted capabilities for active roles, subject to mandatory scope predicates.
- Deny rules for sensitive records and explicit assignment constraints must not be bypassed by role union.
- Removing/deactivating one role must recalculate effective permissions.
- Audit every role/capability change with actor, target, before/after values and timestamp.

## 4. Required authorization dimensions
Every protected operation must evaluate:
1. authenticated staff identity and active account state;
2. effective role/capability;
3. church instance/branch boundary;
4. team membership/leadership scope where relevant;
5. event assignment/role where relevant;
6. contact ownership/assignment or explicit sharing where relevant;
7. specific prayer/care assignment and permitted oversight;
8. publication state for public content.

A role must never be used as a substitute for the remaining scope checks.

## 5. Sensitive pastoral records
- Prayer request details and care notes are restricted.
- A prayer intercessor can access only requests assigned to them.
- Unassigned requests are visible only to roles permitted to review them.
- Admin/Pastor privileged workflows require explicit authorization and must be audited.
- Avoid exposing sensitive content in notifications, logs, exports, search snippets or support diagnostics.
- Record expiry, answered status and removal actions without leaking the underlying request to unauthorized users.

## 6. Public/staff boundary
Anonymous visitors may see:
- configured public church profile and visitor description;
- active public events and public registration pages when enabled;
- published sermons and daily words;
- published digital tracts and welcome messages;
- configured social, WhatsApp and church contact links.

Anonymous visitors must not see:
- staff directory or private member details;
- contact records, follow-up lists, assignments or reports;
- prayer requests, care notes or pastoral records;
- unpublished/draft visitor content;
- private event team assignments or staff-only check-in data.

Public registration endpoints must validate event state, allowed fields, capacity and abuse controls without granting public access to the staff contact directory.

## 7. Authentication and PIN security
Staff sign in using email and administrator-issued PIN. PINs are secrets:
- never store plaintext PINs;
- never place PINs in logs, analytics, URLs or client-readable profile metadata;
- validate through a trusted server-side authentication flow;
- rate-limit attempts and apply progressive throttling/lockout controls;
- provide a secure administrator reissue/reset and recovery process;
- rotate/revoke sessions after credential reset or account deactivation;
- use TLS and secure session storage;
- do not treat the PIN or client-provided role as authorization evidence.

The PIN format, expiry, recovery verification and lockout thresholds require explicit security design and approval before production.

## 8. Offline data protection
- Queue only the approved capture payload and required picker metadata.
- Minimize personal data stored on the device.
- Protect local data using platform-appropriate storage controls; do not cache prayer/care details in the field queue.
- Bind queued records to the authenticated user/device context and validate again on sync.
- Clear or protect queued data on sign-out according to an approved recovery policy; do not silently delete unsynced work.
- Use idempotency keys and audit successful synchronization.
- Previously opened event check-in data must have an explicit expiry and access boundary.

## 9. Database and API controls
- Enable RLS on every exposed table.
- Use server-side checks for privileged workflows and public registration.
- Keep service-role/secret keys server-side only.
- Avoid security-definer functions unless specifically justified, narrowly scoped, reviewed and tested.
- Protect views against RLS bypass (for supported Postgres versions, use security-invoker views).
- UPDATE policies require both USING and WITH CHECK predicates.
- Test negative access cases for every role and scope.
- Audit privileged access, merges, exports, publication, account changes and permission changes.

## 10. SMS authorization and privacy
- SMS permissions are explicit capabilities, not implicit privileges of every role. Define separate capabilities for individual send, campaign create, campaign approve/send, automation configure/pause and delivery-log access.
- Admin/Pastor owns provider/sender configuration and church-wide oversight. Coordinator may manage church-scoped campaigns and approved automation where granted. Team leaders are limited to their teams/events. Field workers and follow-up volunteers may send individual SMS only where expressly granted. Prayer intercessors do not receive broad messaging privileges from their prayer role.
- Evaluate role, active account, contact/team/event scope, consent and suppression status again at send time. A recipient list cached in the UI is not authorization.
- Provider credentials and signing secrets remain server-side. Use a narrow server endpoint/Edge Function and never permit browser clients to call the provider directly.
- Do not expose message bodies or recipient phone numbers in broad audit views. Restrict content access and mask numbers where practical.
- SMS must never contain prayer details, pastoral notes, confidential care narratives, credentials or authentication codes. Sensitive pastoral workflows may send only neutral, non-revealing wording when explicitly approved.
- Protect webhook callbacks with provider signature verification, replay protection and idempotent status updates. Treat callback payloads as untrusted.
- Enforce rate limits, per-campaign caps, duplicate prevention, retry ceilings and spend controls. Record who approved and initiated each bulk send.
- Maintain consent evidence and a suppression/opt-out ledger. Opt-out must take effect before subsequent sends; define handling for legally required service messages separately with counsel/provider.
- Keep delivery events append-only or auditable; distinguish queued, accepted/submitted, delivered, failed and undeliverable states.

## 11. Security acceptance matrix

| Test | Expected result |
|---|---|
| Field worker requests unrelated contact by ID | Denied |
| Team leader accesses another team's restricted record | Denied unless explicitly shared/authorized |
| Intercessor requests another intercessor's prayer | Denied |
| Intercessor requests unassigned prayer | Denied unless separately permitted |
| Coordinator opens event outside permitted scope | Denied |
| Anonymous visitor requests unpublished sermon | Denied |
| Anonymous visitor requests contact directory | Denied |
| Deactivated staff member reuses old session | Revoked/denied after server-side validation policy |
| Multi-role user accesses a permitted module | Allowed only within scope predicates |
| Client forges role metadata | No privilege change |
| Replayed offline capture sync | No duplicate record |
| Staff member sends SMS outside contact/team scope | Denied and audited |
| Bulk campaign includes opted-out recipient | Recipient is excluded before dispatch; no message is sent to that recipient |
| Client attempts direct provider call or reads provider secret | Impossible / denied |
| Forged or replayed provider delivery webhook | Rejected or idempotently ignored |
| Automated trigger is disabled | No SMS is queued or sent |
| Unauthorized export | Denied and audited where attempted |

## 12. Detailed capability matrix

A proposed action-level catalogue, role grant matrix, scope vocabulary, sensitive-field restrictions, SMS separation-of-duties rules and 24 negative/positive authorization test cases are maintained in [07 — Role, Capability & Scope Matrix Proposal](07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md). It is not yet approved. Resolve its R-01 through R-12 decisions before encoding conditional grants in database policies. The physical PostgreSQL design maps each unresolved decision to a schema and safe-default consequence in [08 — Physical PostgreSQL Database Schema Proposal](08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md).

## 13. Open approval items
- Detailed capability-by-role matrix and privileged Admin/Pastor exceptions.
- PIN length, expiry, reset/reissue, recovery and lockout policy.
- Branch scoping semantics within the single configured church instance.
- Data retention, deletion and subject-request workflow.
- Offline queue encryption, sign-out behaviour and expiry.
- SMS provider selection, credentials custody, sender-ID registration and Ghana regulatory/provider requirements.
- SMS consent or other approved lawful-basis evidence, opt-out keyword and suppression policy, message retention, quiet hours and any permitted service-message exceptions.
- Capability matrix for manual sends, bulk campaign creation/approval, automation configuration and delivery-log visibility; per-campaign caps and spend limits.
- Recipient class and lawful basis for each automated SMS trigger, including whether follow-up reminders target staff assignees or contacts.
- Public registration abuse prevention and consent wording.
