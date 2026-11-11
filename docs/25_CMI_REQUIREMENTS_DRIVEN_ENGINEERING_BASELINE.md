# CMI Follow-up — Requirements-Driven Engineering Baseline

**Baseline:** CMI Follow-up v2.1  
**Source of truth:** `docs/00_MASTER_PRODUCT_SPECIFICATION.md`  
**Supporting requirements:** `docs/01_FUNCTIONAL_REQUIREMENTS_AND_WORKFLOWS.md`, `docs/02_ROLES_PERMISSIONS_AND_SECURITY.md`, `docs/07_ROLE_CAPABILITY_AND_SCOPE_MATRIX_PROPOSAL.md`, `docs/08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md`, `docs/11_CMI_STAKEHOLDER_DECISION_REGISTER.md`, `docs/12_RLS_POLICY_AND_SECURITY_TEST_PLAN.md`, `docs/16_CMI_SCHEMA_RECONCILIATION_AND_DECISION_CROSSWALK.md`.

**Status:** Updated 11 November 2026. The product owner authorized implementation of the conservative defaults for R-01–R-12 and D-01–D-13; document 31 is authoritative. This is not church-board/pastoral/legal sign-off. Stakeholders may request later amendments through change control.

## 1. Governing rules

1. The v2.1 CMI requirements supersede conflicting ChurchConnect-era requirements and schemas.
2. Requirements describe target behaviour; source code, tests and deployment state must independently prove implementation.
3. Implement unambiguous technical requirements directly.
4. Implement the product-owner-selected safe defaults now. Keep only unsupported, sensitive or compliance-dependent capabilities disabled; do not infer a broader permission from a role title.
5. Do not invent legal basis, retention periods, consent wording, provider pricing, sender IDs, quiet hours or statutory requirements. Use the selected technical defaults in document 31 and leave legally/provider-dependent features disabled until verified.
6. Every implemented behaviour must trace to a requirement, have positive and negative tests, and be reflected in implementation-status documentation.
7. No hosted Supabase mutation, production migration, deployment, live SMS or use of real congregant data is included in this baseline.

## 2. Selected engineering options

These are the recommended technical options for implementation. Items marked approval-gated remain disabled until the required decision is recorded.

| Area | Selected engineering baseline | Source / gate |
|---|---|---|
| Product boundary | One configured church instance; preserve branch ownership and relational branch consistency. Do not introduce multi-church tenancy. | Spec §§1–3; D-02 |
| Staff identity | Supabase Auth remains the identity/session authority; staff profile references Auth identity. Deactivate/revoke first; do not cascade-delete operational history. | Spec §5; DD-04; D-13 |
| Staff sign-in | Use Supabase Auth email/password. Admin/Pastor provisions staff with a cryptographically random, short-lived temporary password; first sign-in is gated until the user sets a private permanent password. Administrators never see or set that permanent password. | Product-owner confirmation 10 Nov 2026; docs 31 |
| Password lifecycle | Supabase Auth is the only password store and session authority. Enforce generic forgot-password responses, rate-limited admin-reviewed reset requests, one-time temporary passwords, expiry, forced replacement, session revocation and append-only audit. Never store plaintext credentials or expose service-role keys to the browser. | Staff-auth lifecycle SQL/Edge Function; docs 28 and 31 |
| Authorization | Database-backed, server-authoritative capabilities. Active staff + capability + branch + applicable team/event/contact/assignment scope + field visibility + valid state transition must all pass. Deny by default. | Security §1–4; RLS plan §2 |
| Multiple roles | Union only explicitly granted capabilities. Scope predicates, mandatory denies and sensitive-record assignment rules remain conjunctive. | Security §3; Matrix §1 |
| Role grants | The owner-directed baseline seeds 58 explicit grants across the six roles: ordinary visitor/follow-up grants with lower-role phone/email redaction, one assigned prayer-read grant for Prayer Intercessor, and two reason-coded/audited pastoral oversight-read grants for Admin/Pastor. No pastoral mutation, exports, SMS, capability-policy editing, offline or incomplete module grants are seeded. See docs 07 and 31. Never infer grants from role names. | Product-owner baseline in docs 31; Decision Register A/B remains pending for additional domains |
| Pastoral data | Separate prayer and care data from ordinary contact notes. Deny direct browser narrative reads. Prayer Intercessor may read only actively assigned prayer text; Admin/Pastor may read prayer/care through explicit oversight capabilities with allowlisted reason codes and transactional append-only audit. No pastoral mutation/list capability is granted. | Functional §5; Security §5; DD-09; D-07 |
| Contact fields | Enforce field minimization in server DTOs/column privileges or invoker-safe projections; do not assume RLS hides columns. Keep phone/email non-unique as person identifiers. | Security §9; DD-07; D-03/R-05 |
| Contact duplicates | Suggest possible duplicates; perform only an authorized, audited merge that preserves relevant history. Do not globally equate people by phone/email. | Functional §2; D-03 |
| Follow-up | One primary assignment target per task (staff OR team) until dual assignment is explicitly required. Preserve task lifecycle history. | Functional §4; D-04/DD-06 |
| Events | Narrow public registration endpoint; transactional capacity reservation; stable idempotency; separate registration, transport and attendance. No waitlist until approved. | Functional §7; D-05/D-06; DD-10–12 |
| Public content | Anonymous access only through explicit published/public projections. No base-table access to contacts, staff, attendance, pastoral records or drafts. | Security §6; RLS plan §5.4 |
| SMS | Provider-neutral server-side adapter and canonical outbox/campaign lifecycle. Keep provider secrets server-side. Separate individual send, campaign create, approve, dispatch, automation configure/pause and delivery-read capabilities. | Spec §8; Functional §9; Matrix §3/§6 |
| SMS consent/suppression | Persist consent evidence and suppression state; recheck recipient eligibility at dispatch time. Opt-out suppresses future non-essential messages before the next dispatch. Never send sensitive pastoral content or credentials. | Functional §9.4; Security §10; D-09 |
| SMS campaigns | Campaign creation is draft-only. Approval applies to exact content, audience and estimate; material changes invalidate approval. Require a distinct approver from creator as the default. Dispatch is a separate capability and rechecks scope, suppression and budgets. | Functional §9.2; Matrix §6; R-07/R-08/D-11 |
| Automated SMS | Explicit allowlist of trigger types and recipient classes; disabled by default; approved template, timing and eligibility per rule; idempotent execution; bounded retry; administrator pause control. | Functional §9.3; R-09/D-10 |
| SMS cost controls | Atomic campaign and church-wide budget reservation/reconciliation. Use provider-reported currency, segment count, rate and taxes. Never assume GH₵ price or invent caps. Keep dispatch disabled until budget values and provider contract are approved. | DD-20/DD-25; D-09/D-11 |
| Provider callbacks | Provider-specific signature verification, timestamp/replay protection and idempotent delivery-event handling. Implement only after provider capabilities and webhook contract are confirmed. | Security §10; DD-21; D-09 |
| Offline | Disabled for the initial production release. Re-enable only after encrypted local storage, device/session binding, expiry, sign-out recovery, server-side reauthorization and conflict handling are implemented and tested. | Functional §3; Security §8; DD-24 |
| Reports | Typed report definitions and scoped query paths; author/team/event visibility; separate review events; exports use the same scope and explicit export capability. Exact fields/review authority remain gated by D-12/R-12. | Functional §12; DD-22 |
| Retention | Deactivation/archival before deletion; preserve operational history. Do not encode arbitrary retention durations. Apply a data-class schedule only after D-13 approval. | Security §9; DD-04/DD-23; D-13 |
| Audit | Append-only, restricted read access; actor/action/target/time/request correlation; no secrets or sensitive narrative in generic metadata. Retention requires D-13. | Security §9; DD-23; D-13 |

## 3. Authentication implementation contract

The selected authentication model is Supabase Auth email/password. The earlier email + private PIN proposal is superseded by the product-owner decision recorded on 10 November 2026.

1. Supabase Auth is the sole password hashing, verification and session authority.
2. An authorized Admin/Pastor provisions a staff identity through a trusted server-side operation.
3. The system generates a cryptographically random, short-lived temporary password and emails it only to the verified account address.
4. The first authenticated action is mandatory permanent-password replacement. Workspace APIs remain gated until replacement succeeds.
5. Admin/Pastor reviews recovery requests but never sees, chooses or stores the user's permanent password.
6. Recovery responses are generic and rate-limited. Approved reset rotates the temporary password, gates the account and revokes existing sessions.
7. First-admin delivery recovery is narrowly allowed only while the initial password-change gate remains incomplete; the operation is serialized across Edge Function instances and rotates the temporary password before retrying email delivery.
8. Deactivation blocks protected requests even if an old access token remains valid; revoke/ban Auth sessions as an additional control.
9. Never store plaintext passwords, temporary credentials, password hashes or recovery secrets in application tables, user metadata, logs, analytics or URLs.
10. Test generic responses, rate limits, temporary-password expiry, forced replacement, delivery failure, stale sessions, deactivation and recovery concurrency.

**Build/release gate:** configure the transactional email provider and verify onboarding/recovery end-to-end in staging before production. Do not implement a custom PIN verifier, parallel password store or custom JWT issuer.

## 4. Authorization implementation contract

- The six role codes are exactly Admin/Pastor, Coordinator, Team Leader, Field Worker, Follow-up Volunteer and Prayer Intercessor.
- Role descriptions are not grants. Use stable capability codes and explicit scope values.
- Every operation derives actor identity from a verified session; caller-supplied actor IDs, role labels, capabilities, branch/team scope and user-editable metadata are not authorization evidence.
- Check active staff state and current database-backed assignments on sensitive operations.
- Role union adds eligible capabilities only; it never bypasses record assignment, field restrictions or pastoral privacy.
- Keep browser access to identity/authorization tables closed. No direct client mutation of role assignments, grants, audit ledgers or restricted pastoral narratives.
- Privileged database functions must be narrowly scoped, fixed-search-path, least-privilege, and explicitly granted; test PUBLIC/anon/authenticated execution denial. Prefer invoker rights. Any exception needs a documented security justification and negative tests.
- Seed only the 58 explicit grants in the current owner-directed baseline. Unsupported modules remain fail-closed; do not infer access from role names. Church stakeholders may amend the baseline through change control.

## 5. SMS implementation contract

### 5.1 Message modes
- Manual individual SMS.
- Bulk campaign SMS.
- Configurable automated SMS.

These are separate flows over one canonical message/outbox state machine; announcement delivery must not create a second provider lifecycle.

### 5.2 Required server-side dispatch sequence
1. Authenticate the sender or trusted automation execution.
2. Verify active account, exact capability and current branch/team/event/contact scope.
3. Resolve the intended recipient class and eligible audience from trusted records.
4. Recheck current consent/lawful-basis evidence, valid phone, suppression and opt-out state.
5. Validate approved template/content version and prohibit secrets or pastoral narratives.
6. Enforce quiet-hours configuration, rate limits, segment limits, campaign caps and church-wide budget reservation.
7. Verify campaign approval is for the exact content/audience/cost snapshot and the approver is distinct from creator where required.
8. Persist an idempotent outbox item and audit event atomically.
9. Submit through a provider adapter from trusted server code.
10. Record provider acceptance separately from delivered/failed/undeliverable callback outcomes.
11. Verify callback signatures and replay protection; deduplicate provider events.
12. Expose only scope-authorized, masked delivery metadata to staff.

### 5.3 Safe initial rollout
- Provider not configured: no dispatch.
- Sender identity not verified: no dispatch.
- Consent/suppression policy not configured: no dispatch.
- Quiet-hours policy not configured: no automated dispatch.
- Budget/caps not configured: no bulk or automated dispatch.
- Template not approved: no dispatch.
- Automation rule not explicitly enabled: no queueing.
- All initial testing uses a provider mock and dry-run mode; no live SMS.

### 5.4 Provider selection
Do not hard-code a provider or quote price until a provider contract is verified against Ghana availability, sender-ID registration, callback authentication, delivery receipts, throughput, currency/taxes, data processing terms and pricing. Keep the adapter interface provider-neutral so a selected provider can be integrated without changing campaign policy or the canonical outbox.

## 6. Delivery sequence and release gates

### Phase A — source-of-truth and security foundation
- Reconcile docs, schemas, migrations and API contracts against v2.1.
- Complete the six-role capability catalogue and scope vocabulary without granting roles.
- Add auth lifecycle state machine and testable session revocation boundaries after the Supabase integration review.
- Keep staff access endpoints fail-closed without grants.
- Add security regression tests for multi-role scope, stale sessions and direct browser access.

### Phase B — unblocked domain workflows
- Complete contact capture, scoped reads/updates, duplicate suggestions and audited merge transaction.
- Complete follow-up list/task lifecycle and history.
- Complete public-content draft and publication workflow only with approved publication capabilities.
- Complete calendar, event draft and branch-scoped operational reads.
- Add typed reports and offline receipts only after their field and retention boundaries are approved.

### Phase C — policy-gated domains
- Pastoral read/write/assignment lifecycle only after R-01/R-02/R-10/R-11/D-07 approvals.
- Event registration, capacity, transport and check-in transactions only after D-05/D-06/D-13 decisions.
- SMS schema, campaigns, consent, provider adapter and dispatch only after D-09/D-10/D-11 and R-06–R-09 approvals.
- Full role grants only after D-01 and R-01–R-12 approvals.
- Offline device enrollment and local retention only after D-08 approval.
- Report review/export authority and retention only after D-12/R-12/D-13 approvals.

### Phase D — release assurance
- Clean local Supabase reset and complete migration replay.
- pgTAP positive and negative authorization tests for every role and scope.
- Deno formatting, lint, type checks and unit tests.
- Supabase security advisors and manual review of function grants/search paths/RLS.
- Public/staff boundary, idempotency, concurrency, stale-session and provider-callback tests.
- Backup/restore rehearsal, monitoring, incident response and approved retention procedures.
- No production release until stakeholder approvals and security sign-off are recorded.

## 7. Traceability and change control

Any code change implementing this baseline must include:
- source requirement section and decision ID in the PR description or code/test context;
- API contract updates where request/response behaviour changes;
- SQL constraints and server-side authorization for data mutations;
- positive and negative tests;
- implementation-status update that distinguishes implemented, locally tested, approval-gated, deployed and production-verified;
- explicit statement that no hosted resources or live SMS were changed unless separately authorized.

If the requirements conflict or omit a necessary policy value, keep the feature disabled and record the exact missing decision. Do not fill the gap with an assumption.

## 8. Approval status

This document records the selected engineering recommendations requested for the implementation direction. It does **not** change the approval state in document 11.

- R-01–R-12: pending church/stakeholder approval.
- D-01–D-13: pending church/stakeholder approval.
- Email + PIN lifecycle/security integration: pending technical threat model and product/security approval.
- SMS provider, lawful basis/consent, sender ID, quiet hours, templates, budgets and trigger catalogue: pending.
- Hosted Supabase deployment and production release: not authorized by this document.
