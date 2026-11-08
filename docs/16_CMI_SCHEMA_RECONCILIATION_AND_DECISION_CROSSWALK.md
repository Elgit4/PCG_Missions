# CMI Follow-up — Schema Reconciliation & Backend Build Gate

**Baseline:** CMI Follow-up v2.1  
**Status:** Engineering reconciliation proposal; stakeholder decisions remain pending  
**Scope:** DD-01–DD-25 across documents 06–15  
**Backend workspace:** `supabase-cmi/`  
**Safety:** No hosted database changes; no production migration has been applied.

## 1. Executive result

The typed dictionaries identify 25 design findings that must be reconciled before domain migrations are added. The principal issues are polymorphic references, event assignment ambiguity, identity/offboarding lifecycle, field-level visibility, pastoral narrative auditing, public registration identity, SMS recipient/body/cost semantics, reporting scope, audit retention and offline device trust.

The first CMI backend foundation migration is intentionally limited to identity, role catalogue, capability catalogue, branch/team/area structures. It seeds the six role names but **does not seed role-capability grants**, create authenticated/anonymous policies, or expose foundation tables through the Data API. This is a deny-by-default starting point, not a complete authorization implementation.

The identity foundation's physical profile uses an internal `staff_profile.id` key plus unique `staff_profile.auth_user_id` linked to `auth.users(id)`. Role/team joins reference the profile key; operational actor/assignee references in the contacts/follow-up draft reference the Auth UUID. This is an explicit refinement over the dictionary's shorthand `staff_profile.user_id` naming and must remain consistent in later schema slices.

## 2. DD-01–DD-25 reconciliation crosswalk

| Finding | Source | Affected model | Engineering disposition | Approval dependency | Status |
|---|---|---|---|---|---|
| DD-01 | 13 | Follow-up list scope | Replace `scope_type/scope_id` with typed nullable team/event FKs plus an exactly-one/approved-scope CHECK; composite branch FKs. | D-04; confirm list visibility | Proposed |
| DD-02 | 13, 14 | Event staff assignment | Model a single assignment target per row using separate typed team and staff assignment tables, or one typed target supertype; do not keep ambiguous polymorphic target. | R-04; event workflow | Proposed |
| DD-03 | 13 | Capability overrides | Remove polymorphic scope IDs. Prefer explicit branch/team/event override relations or a normalized capability-scope grant table with typed FKs. | D-01, R-04 | Proposed |
| DD-04 | 13 | Staff/Auth lifecycle | Retain Auth identity through deactivation-first offboarding; prefer FK RESTRICT and controlled account deletion after retention approval. Never cascade-delete operational history. | D-13; authentication lifecycle approval | Proposed |
| DD-05 | 13 | Branch model | Keep branch_id on operational records and composite branch-consistency FKs. Single configured church; branch count remains a stakeholder choice. | D-02 | Proposed |
| DD-06 | 13 | Follow-up task assignment | Enforce one primary target (staff OR team) initially; add dual assignment only after workflow approval. | D-04 | Proposed |
| DD-07 | 13 | Contact notes and fields | Separate ordinary notes from pastoral narratives; implement field-level projections/DTOs and explicit note visibility; never assume RLS hides columns. | R-03, R-05 | Blocked |
| DD-08 | 14 | Prayer request intake | Start staff-created requests only; add anonymous/public intake only through a dedicated abuse-protected endpoint and approved consent/retention flow. | R-11, D-07 | Proposed |
| DD-09 | 14 | Prayer/care narrative read auditing | Deny direct client SELECT. Use a trusted server-mediated read that authenticates, authorizes, writes audit event and returns a minimal DTO transactionally. | R-01, R-02, R-10, D-07 | Blocked |
| DD-10 | 14 | Event walk-in check-in | Require stable idempotency key and event-scoped duplicate policy. Do not use name-only matching as identity proof. | D-06 | Proposed |
| DD-11 | 14 | Registration snapshots | Minimize attendee snapshots, separate public registration from canonical contact linking, define expiry/retention and consent linkage. | D-05, D-13 | Blocked |
| DD-12 | 14 | Waitlist | Remove waitlist_only from initial enum/check constraints; no waitlist until explicitly approved. | D-06 | Proposed |
| DD-13 | 14 | Calendar, announcement, document references | Replace polymorphic content/audience IDs with typed join tables or shared typed parent entities; external links get typed parent FKs. | D-12; content audience approval | Proposed |
| DD-14 | 14 | Announcement delivery | Use one canonical delivery/outbox lifecycle; announcement deliveries reference message/outbox records, not a second SMS provider state machine. | D-09, D-10 | Proposed |
| DD-15 | 14 | Event assignments | Resolve consistently with DD-02; avoid competing event team/user target representations across ERD and dictionary. | R-04 | Proposed |
| DD-16 | 14 | Care/prayer linked contact fields | Separate request/care narrative access from linked contact identity/phone projection. Apply explicit minimal DTOs. | R-10, R-11 | Blocked |
| DD-17 | 15 | SMS recipient identity | Add CHECK enforcing exactly one contact or staff identity consistent with recipient_class; validate snapshot format and uniqueness. | R-06, R-07 | Proposed |
| DD-18 | 15 | SMS content snapshot | Reference immutable approved template version; any per-campaign body snapshot requires explicit governance and encrypted storage. | D-09, D-11 | Proposed |
| DD-19 | 15 | SMS encryption and retention | Do not store real message bodies until encryption/key rotation, access, backup and retention design is approved. | D-09, D-13 | Blocked |
| DD-20 | 15 | SMS billing/cost | Provider adapter supplies currency, segment count, rate and taxes; cost reservation uses exact provider contract values, never assumed GH₵ pricing. | D-09, D-11 | Blocked |
| DD-21 | 15 | STOP/opt-out callback | Implement provider-specific verified signature, timestamp/replay protection and idempotent suppression updates only after provider capabilities are confirmed. | D-09 | Blocked |
| DD-22 | 15 | Reports | Replace generic JSON/scope polymorphism with typed report definitions/sections and scoped query functions; define exact report fields. | D-12, R-12 | Blocked |
| DD-23 | 15 | Audit retention/access | Append-only event design, restricted read access, no narrative/secrets in metadata; retention and reviewer authority must be approved. | D-13, R-12 | Blocked |
| DD-24 | 15 | Offline device trust | Device key is a revocable device registration, not identity. Require authenticated enrollment, expiry, revocation, encryption and reauthorization at sync. | D-08 | Blocked |
| DD-25 | 15 | SMS global cost ceiling | Add atomic church-wide budget ledger/reservations in addition to campaign/rule caps; lock/reserve spend before dispatch and reconcile provider actuals. | D-09, D-11 | Proposed |

## 3. Cross-document invariants for all future migrations

1. **Branch integrity:** every branch-owned child references a composite candidate key on its parent so a child cannot point across branches.
2. **Auth lifecycle:** Auth is the credential authority. Staff profile references Auth user; deactivation/revocation precedes deletion. Operational history is retained.
3. **Multi-role access:** capabilities may combine, but branch/team/event/assignment predicates and mandatory sensitive-record denies remain conjunctive.
4. **Field visibility:** RLS is row-level. Use column grants or server-side DTOs for field minimization.
5. **Sensitive pastoral access:** prayer/care narrative is never in general contact notes, dashboards, notifications, reports or offline queues. Direct browser table reads are denied when per-read audit is required.
6. **Public boundary:** anonymous callers receive only published public projections and narrow event-registration endpoints; no base contact, staff, attendance or pastoral table access.
7. **SMS dispatch:** current eligibility, consent/lawful basis, suppression, approval, quiet hours, scope, idempotency and budget are checked immediately before dispatch.
8. **Offline boundary:** queued capture and previously opened event check-in only; local data expires, sync reauthorizes and sensitive pastoral content is never cached.
9. **Deletion:** history is RESTRICT/archived; retention/deletion follows approved schedules and audited workflows.
10. **Secrets:** provider and privileged Supabase keys stay server-side; no credentials in tables, client bundles, logs or fixtures.

## 4. First backend slice committed

See `supabase-cmi/README.md` and `supabase-cmi/IMPLEMENTATION_STATUS.md`.

The isolated CMI workspace contains:
- a distinct Supabase CLI config, ports and project ID;
- a foundation migration for church/branch, Auth-linked staff profiles, six roles, capability catalogue, role assignments, teams and service areas;
- RLS enabled with no browser grants or policies;
- no role-capability grants seeded;
- structural pgTAP tests.

The historical `supabase/` directory is intentionally untouched. Its migrations are ChurchConnect artifacts and must not be used as the CMI migration history. The contacts/follow-up SQL is currently in `supabase-cmi/schema-drafts/`, not `migrations/`; it must be promoted through `supabase migration new` once the CLI is available, then parsed and tested locally.

## 5. Contacts and follow-up domain progress

A draft SQL slice now defines `contact`, `contact_capture`, `contact_assignment`, `contact_note`, `contact_interaction`, `contact_merge`, `followup_list`, `followup_task` and `followup_task_event`. It includes same-branch composite foreign keys, E.164 phone checks, non-unique phone/email duplicate-review indexes, capture idempotency, allowlisted capture metadata, exact-one staff/team assignment, task completion consistency, and append-only task history intent. RLS is enabled and browser grants are withheld in the draft.

Event references in contact capture and list scope are deferred until the event-domain migration. Contact merge remains a data-integrity structure only; the trusted transactional merge/reversal operation is not implemented yet. R-03/R-05, D-03/D-04 and field-level visibility remain approval gates. Draft files are not yet in the executable migration/test folders.

## 6. Decisions that remain release/build gates

R-01–R-12 and D-01–D-13 remain pending in document 11. This reconciliation recommends conservative technical defaults but does not approve church policy.

Before the next domain migrations, approve:
- role/capability matrix and scope semantics;
- branch count/context;
- Auth invitation/activation/PIN/reset lifecycle;
- contact field visibility and assignment semantics;
- pastoral oversight and audited-read workflow;
- event registration, capacity, transport and walk-in identity;
- data retention/deletion by data class;
- SMS provider, lawful basis/consent, STOP handling, sender identity, currency, quiet hours and budgets;
- report fields, review authority and export permissions;
- offline device enrollment, expiry and recovery.

## 7. Verification record

- Repository source reviewed on `design/cmi-logical-data-model`, including documents 06–15 and the existing legacy SQL.
- Legacy migrations inspected and confirmed to encode the former two-role ChurchConnect model.
- CMI workspace and first migration/test committed separately under `supabase-cmi/`.
- No SQL parser, local Supabase runtime, PostgreSQL instance or pgTAP execution was available in this session; tests are authored but unexecuted.
- No hosted Supabase project was linked, queried, migrated or modified.
- No real visitor/prayer data or live SMS provider was used.

**Status:** Backend foundation started; domain implementation proceeds only after schema reconciliation and security review.