# Supabase-to-Cloudflare reconciliation checkpoint

Source project: PCG Missions (cgwffpxlwgbnlinzwfoj)
Source region: EU West 1
Target: isolated EU D1 database pcg-missions-dev
Checkpoint: 13 November 2026
Data movement: none. This is a read-only schema and metadata inventory; no source rows or credentials were exported or copied.

## Source inventory

The Supabase metadata inventory returned 53 tables: 50 in public and 3 in private. All 50 public tables have RLS enabled. The three private tables are staff password-reset request/audit and the first-admin bootstrap lease; the lease table currently has RLS disabled and must remain inaccessible through exposed APIs by schema/grant controls.

The project has 17 recorded applied migrations. The repository's supabase-cmi/supabase/migrations directory contains later forward migrations for team/area administration and typed ministry reports that are not present in the hosted migration ledger at this checkpoint. Treat the live database as the source-of-truth for production data and reconcile repository migration history before any future write/cutover.

The source metadata reports:
- 1 church and 1 branch.
- 2 staff profiles, linked to Supabase Auth identities.
- 6 role records, 61 capability records and 65 role-capability grants.
- No business rows in contacts, contact captures, assignments, notes, interactions, follow-up lists/tasks, prayer requests, care records, events, event registrations, transport reservations, check-ins, event closeouts or announcement audiences.
- One calendar entry, one announcement, one welcome message and one staff-access audit row.
- No ministry-report tables in the hosted source schema at this checkpoint.

These are table metadata row counts, not a verified backup or row-by-row reconciliation. Do not infer that a zero count proves the absence of related objects in Auth, Storage, Edge Functions or other schemas.

## Domain mapping

| Source domain | Source tables | Cloudflare target | Migration notes |
|---|---|---|---|
| Church/branch tenancy | church, branch | church, branch | Preserve UUIDs and timezone; verify configured-instance invariant. |
| Identity/access | staff_profile, role, capability, role_capability, staff_role_assignment, team, staff_team_membership, service_area, staff_area_coverage, staff_access_audit | Same domain tables plus Better Auth user/session/account/verification/rateLimit, invitation and access-governance ledgers | Map Supabase Auth UUID to Better Auth user ID only through a controlled identity migration. Never copy password hashes or sessions without a separately reviewed credential strategy. |
| Contacts/follow-up | contact, contact_capture, contact_assignment, contact_note, contact_interaction, contact_merge, followup_list, followup_task, followup_task_event | Corresponding D1 contact/follow-up tables | Preserve contact IDs, actor IDs, assignment intervals, capture idempotency and immutable event history. Transform digest/key version fields only after verifying compatible algorithms. |
| Pastoral | prayer_request, prayer_assignment, prayer_access_audit, care_group, care_group_membership, care_record, care_assignment, care_interaction, care_access_audit | Corresponding D1 restricted pastoral tables | Highly restricted. Do not export narrative content into general snapshots or logs. Preserve explicit shares, assignment windows and access audit history. |
| Events | event, event_staff_assignment, event_team_assignment, event_registration, transport_option, transport_reservation, event_checkin, event_closeout, event_closeout_event, event_idempotency_receipt | Corresponding D1 event/transport/check-in/closeout tables | Preserve attendee snapshots and consent references only under approved retention rules; reconcile capacity and cancellation semantics. |
| Calendar/announcements | calendar_entry, announcement, announcement_team_audience, announcement_event_audience | D1 calendar and announcement tables plus delivery/read receipts and calendar audit | Source announcement audience fields and calendar timezone fields differ from the target model; use an explicit transform/default map, not a blind copy. |
| Public content | church_public_profile, welcome_message, sermon, daily_word, digital_tract, external_document_link | Corresponding D1 public-content tables and content audit | Preserve slugs and publication state; validate HTTPS links and public-only projection. |
| Private recovery | private.staff_password_reset_request, private.staff_password_reset_audit, private.first_admin_bootstrap_lease | D1 staff onboarding/recovery governance tables | Do not migrate active reset tokens, one-time invitation secrets or bootstrap leases. Migrate only approved non-secret audit history after mapping. |

## Known schema drift to resolve before data import

1. The hosted announcement table does not expose the audience_type field used by the newer D1 audience model. Map existing public/private state to a conservative audience type; never widen visibility during transformation.
2. The hosted calendar table does not expose the D1 timezone field. Derive the value from the owning branch's configured timezone and record that it was defaulted; do not assume UTC.
3. The hosted calendar schema has no D1 cancellation status/audit/read-receipt columns. Existing entries should import as active; new D1-only lifecycle fields must start empty.
4. The hosted migration ledger does not include all repository migrations for team-area administration and ministry-report workflows. Review whether those source migrations are intentionally pending before any import or code cutover.
5. The D1 schema includes ministry reports and announcement/calendar audit additions that are not in the current hosted source tables. These are target-only capabilities and must not be backfilled with fabricated source data.
6. The D1 auth model is Better Auth. Supabase Auth user IDs can be preserved as external identity references only after a deliberate identity mapping. Password reset, invitation tokens, refresh tokens, and sessions must not be copied as if they were portable.

## Required reconciliation procedure

1. Freeze the exact source migration/schema checkpoint and capture a metadata-only schema manifest.
2. Export each approved table in deterministic primary-key order using a secure operator-controlled path. Keep pastoral narrative, phone/email and attendee snapshots in separately encrypted export partitions with strict access controls.
3. Build a per-table transform manifest that records source table, target table, column mapping, null/default conversion, enum conversion, foreign-key dependencies, row count and canonical SHA-256 digest.
4. Load into an isolated D1 clone or disposable database first; never import directly into the only non-production validation database.
5. Verify row counts, primary-key uniqueness, foreign-key checks, status/enum distributions, per-table canonical hashes and cross-branch invariants. Report intentionally excluded secret/session records separately.
6. Run endpoint-level authorization tests against the imported fixture set, including cross-branch, team, assignment, expired-share and deactivated-user denials.
7. Obtain owner approval for a production freeze window, backup/restore rehearsal, rollback point and cutover checklist before any production data export/import or Supabase retirement.

## Current status

- Schema inventory and high-level mapping: completed.
- Source/target drift identified: completed.
- Automated secure export/import and canonical row-hash reconciliation utility: not yet implemented.
- Production data export/import: not started and not authorized by this checkpoint.
- Production frontend/DNS cutover and Supabase shutdown: not started.
