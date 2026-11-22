# Contact Duplicate Merge — Safety Review

Status: implementation blocked pending a complete, tested merge transaction. This document is a safety boundary, not an enabled feature.

## Confirmed D1 relationships

The Cloudflare schema establishes branch-composite foreign keys from ordinary records to `contact(id, branch_id)`:

- `contact_capture`
- `contact_assignment`
- `contact_note`
- `contact_interaction`
- `followup_task`
- `contact_assignment_audit` (introduced by the contact-assignment audit migration)
- `event_registration`
- `event_checkin`

The contact row itself has a same-branch self-reference through `merged_into_contact_id`. The `contact_merge` history table records source, survivor, actor, timestamp, reason, and reversal metadata. Its partial unique index permits only one active merge per source.

Restricted pastoral tables also reference contacts:

- `prayer_request`
- `care_record`

These records must never be joined into ordinary contact merge responses or have their narrative fields read by a merge workflow.

## Required authorization boundary

- Introduce `contact.merge` as a `restricted` capability only when the complete Worker operation and tests are ready.
- Do not grant it to any role by default. No role-capability rows are authorized by this review.
- Enforce authenticated staff identity, active branch membership, branch-scoped authorization, and a mandatory reason (10–500 characters).
- Derive actor and branch from the authenticated request context; never trust client-supplied actor or branch IDs.
- Keep the UI hidden/disabled until an explicit, approved role grant policy exists.

## Required transaction semantics

A future merge must be a single D1 `batch` transaction with all-or-nothing behavior. It must:

1. Require two distinct, existing, active contacts in the same active branch.
2. Reject a source or survivor that is already merged, and reject cycles or chains. The survivor must remain canonical.
3. Reject either contact if it has a linked `prayer_request` or `care_record`. This conservative rule avoids silently changing the identity association of restricted records. The operation must not select or return restricted narrative data.
4. Preserve original contact IDs in an append-only merge-history row and retain the source contact as a tombstone with `contact_status='merged'` and `merged_into_contact_id=survivor`.
5. Repoint eligible ordinary references only: captures, assignments, ordinary notes, interactions, follow-up tasks, assignment audit, event registrations, and event check-ins. Preserve original event attendee snapshots and all source timestamps/provenance.
6. Abort on assignment-overlap trigger failures, uniqueness conflicts, unexpected row counts, or any foreign-key violation. Do not silently drop or deduplicate records.
7. Write a branch-scoped staff audit entry and `contact_merge` history row in the same batch as the updates.
8. Return only the canonical contact ID and merge operation ID; never return note bodies, pastoral records, prayer narratives, or other unnecessary contact fields.
9. Make retries safe: an already-merged source must return a conflict, not perform a second merge.
10. Define and test a separately authorized reversal workflow before claiming merge reversibility. The presence of reversal columns alone does not implement safe reversal.

## Required tests before enabling

- Missing authentication and missing `contact.merge` capability are denied.
- Inactive staff, inactive branch, and cross-branch contacts are denied.
- Same-contact, missing-contact, archived-contact, already-merged, and cycle attempts are rejected.
- Any linked prayer request or care record blocks the operation without reading narrative fields.
- Ordinary references are preserved and repointed atomically.
- Assignment overlap, unique-index conflict, and FK failure roll back every mutation and audit row.
- Merge history and audit actor/reason/branch are correct and immutable.
- Retry behavior is deterministic and does not duplicate history.
- A real D1 integration test validates `batch` rollback semantics and `PRAGMA foreign_key_check` after success and failure.

## Release decision

No merge endpoint, UI action, role grant, migration, or production data change is authorized by this review. The feature remains unavailable until the transaction, tests, permission policy, and reversal contract are implemented and reviewed together.
