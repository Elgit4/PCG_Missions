# CMI Follow-up — Repository Consistency & Accuracy Audit

**Audit date:** 7 November 2026  
**Repository:** `Elgit4/PCG_Missions`  
**Branch reviewed:** `main`  
**Baseline reviewed:** CMI Follow-up v2.1  
**Scope:** Documentation consistency, functional/security/data/architecture alignment, retained ERDs, implementation claims and available CI evidence.

## 1. Executive result

The authoritative CMI documentation is now aligned to the v2.1 baseline for the six-role model, public visitor experience, limited offline capture and the approved manual, bulk and automated SMS scope. The audit found and corrected documentation defects during the review.

**This is a documentation consistency review, not a production-readiness approval.** The target CMI database schema, CMI ERD, migrations, RLS policies, SMS provider integration and application runtime have not been demonstrated by the reviewed artifacts.

## 2. Corrections made during this audit

1. Aligned the root README and documentation index with specification version 2.1.
2. Advanced the functional, security, data and application architecture documents to version 2.1.
3. Corrected duplicated and skipped section numbering in the functional requirements.
4. Restored explicit announcement requirements alongside the three SMS workflows.
5. Added SMS campaign recipient snapshots, outbox, automation and delivery relationships to the conceptual data model and ERD work packages.
6. Clarified that Admin / Pastor is one combined role in the six-role baseline.
7. Made opted-out recipient exclusion mandatory in the security acceptance matrix.
8. Aligned message lifecycle language around queued, submitted, delivered, failed and undeliverable states.
9. Clarified that each automated SMS trigger must specify its recipient class; follow-up reminders must identify whether they target staff assignees or contacts.
10. Updated the internal guide to version 2.1 and clarified that documented workflows are not proof of deployed functionality.
11. Corrected the superseded stakeholder-decision notice so it no longer describes automated SMS as excluded from the current baseline.
12. Qualified claims about legacy SQL and tests where their exact current repository paths could not be independently verified.

## 3. Cross-document consistency checks

| Area | Result | Notes |
|---|---|---|
| Product scope | Aligned | Master specification is authoritative; supporting docs now reflect SMS v2.1. |
| Six roles | Aligned with open capability detail | Six roles are named consistently. Admin / Pastor is one combined role. The detailed capability matrix remains an approval item. |
| Multi-role authorization | Consistent principle | Union of capabilities remains constrained by team, event, assignment and sensitive-record predicates. |
| Staff authentication | Target only | Email + administrator-issued PIN is documented, but the secure credential-exchange and recovery design remains to be approved and implemented. |
| Contacts and follow-up | Requirements documented | No implementation proof was established in this audit. |
| Prayer and care privacy | Requirements documented | Strict intercessor assignment and privileged oversight are specified; RLS proof is still required. |
| Events and public registration | Requirements documented | Registration, capacity, transport and check-in are described; schema/API proof is still required. |
| Offline support | Scope consistent | Only queued capture, cached pickers and previously opened event check-in data are in scope. |
| Announcements | Requirements clarified | Authorized audience and configured-channel delivery are documented separately from SMS campaigns. |
| SMS | Scope consistent | Manual, bulk and automated SMS are in scope; WhatsApp automation is not. |
| Public content | Requirements documented | Draft/publication separation is specified; implementation remains unverified. |
| Reports and team administration | Requirements documented | Review authority and exact capability grants remain open. |
| Versioning | Aligned | Main specification, supporting documents, guide, README and index identify v2.1. |
| Legacy artifacts | Explicitly non-authoritative | Existing ChurchConnect ERDs are retained as historical references only. |

## 4. Remaining high-priority gaps

### P0 — Must be resolved before production

- **No approved CMI schema/ERD:** the indexed draw.io diagrams are ChurchConnect legacy artifacts. The data architecture is explicitly conceptual and is not an applied schema.
- **No verified CMI migrations or RLS suite:** this audit did not verify a current CMI migration set, policy set or passing role/scope test suite. Do not apply legacy SQL.
- **No verified SMS integration:** no provider adapter, server-side send endpoint, transactional outbox worker, verified webhook handler or provider configuration was demonstrated.
- **No deployment proof:** the audit did not establish a working application build, staging environment or production deployment.
- **Authorization matrix incomplete:** each role still needs explicit capability grants, scope rules and negative tests, including multi-role combinations and privileged pastoral access.
- **Email + PIN authentication design incomplete:** PIN format, credential verification, reset/reissue, recovery, throttling, session revocation and compatibility with the selected identity provider need an approved technical design.
- **SMS consent and Ghana readiness unresolved:** select a provider, verify sender-ID requirements, approve consent/lawful-basis wording, opt-out handling, message retention, quiet hours, templates, campaign caps and budget controls before enabling sends.
- **Automated SMS recipient policy unresolved:** every trigger must define recipient class, event source, timing, eligibility and lawful basis. In particular, follow-up reminders must not ambiguously target either staff or visitors.

### P1 — Must be resolved before pilot

- Confirm branch scoping within the single configured church instance.
- Approve event registration fields, capacity/transport rules, cancellation and attendee deduplication.
- Approve contact, pastoral-record and SMS-message retention/deletion policy.
- Approve offline queue encryption, expiry, sign-out and conflict recovery.
- Define announcement publication, audience membership and delivery-status rules.
- Define report review/approval authority and export permissions.
- Complete public registration abuse prevention and visitor consent wording.

## 5. Repository inspection limits and verification evidence

The GitHub file interface allowed inspection of the authoritative documents, supersession notices and the two retained ChurchConnect draw.io files. The documentation index explicitly labels those ERDs as historical.

The following conventional paths returned 404 during this audit: `package.json`, `supabase/config.toml`, sample paths under `supabase/migrations/`, sample paths under `supabase/tests/`, and common `.github/workflows/` CI filenames. GitHub code search returned no indexed results, and the available repository interface did not expose a recursive tree listing.

**Interpretation:** these results do not prove that no implementation or SQL files exist under non-standard paths. They mean the source tree could not be exhaustively inventoried through the available interface. The precise locations and current contents of any historical migrations/tests must be confirmed from a full repository tree before they are referenced as present or tested.

The latest reviewed commit's combined status response contained no status checks. This is not evidence of passing CI. No application build, unit test, database test, pgTAP test, browser test or live SMS send was run as part of this audit.

No hosted Supabase database, provider account, production configuration or live visitor data was accessed or changed.

## 6. Release recommendation

**Status: Not ready for implementation sign-off or production deployment.**

Proceed with a controlled database-design phase:
1. Approve the role/capability/scope matrix and remaining policy decisions.
2. Produce the CMI Crow's Foot ERD from the approved conceptual model.
3. Generate a clean CMI migration set and RLS policies.
4. Add positive and negative database tests for every role, scope and sensitive record.
5. Design and test the SMS provider adapter, consent/suppression ledger, campaign pipeline, automation scheduler and delivery webhooks using a sandbox provider.
6. Verify from a clean local environment and staging project before any production migration or SMS activation.

Do not treat this audit report or the v2.1 documents as evidence that those implementation steps have already been completed.
