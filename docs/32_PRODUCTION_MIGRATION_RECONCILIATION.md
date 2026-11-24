# PCG Missions — Production Migration Reconciliation Runbook

**Status:** Read-only production inspection completed; repository history alignment prepared on PR #82 only.  
**Production changes:** None. No migrations, SQL writes, Edge Function deployments, Storage changes, Auth-setting changes or SMS actions were performed.  
**Supabase project:** `cgwffpxlwgbnlinzwfoj` (EU West, `eu-west-1`).

## 1. Verified hosted migration ledger

The production ledger contains 17 migrations and ends at `20261112220204_admin_pastor_branch_draft_module_grants`.

Three source filenames had versions that differed from the hosted ledger despite matching migration names and observed schema effects:

| Hosted version/name | Previous repository version/name | Evidence and treatment |
|---|---|---|
| `20261110134538_cmi_identity_authorization_foundation` | `20261108010000_cmi_identity_authorization_foundation` | Hosted identity, role, capability, staff, branch and domain tables exist. Repository migration filename is aligned to the hosted version. A byte-for-byte comparison of the original applied SQL is unavailable from the hosted migration ledger; retain a schema-diff check before release. |
| `20261110134606_cmi_foundation_fk_indexes` | `20261110140000_cmi_foundation_fk_indexes` | All seven indexes declared by the repository migration are present in the hosted catalog. Repository filename is aligned to the hosted version. |
| `20261112220204_admin_pastor_branch_draft_module_grants` | `20261112193000_admin_pastor_branch_draft_module_grants` | All seven expected branch-scoped Admin/Pastor capability grants are present in production. Repository filename is aligned to the hosted version. |

One hosted migration was missing from source control:

- `20261112192147_grant_service_role_staff_password_expiry_update`
- The live catalog shows `service_role` has SELECT on `staff_profile` and UPDATE only on `password_setup_expires_at`.
- The repository now contains a migration at the exact hosted version that reproduces that narrow column-level grant. The original SQL body is not recoverable from the migration ledger, so this file is a reconstructed, idempotent equivalent—not a claim that the original bytes were recovered.

The three version alignments and restored migration are committed on this PR branch. They do not execute against production merely by being committed.

## 2. Pending migrations, in order

After aligning the three historical versions and restoring the hosted-only grant, the branch contains 29 migration files: the 17 hosted versions plus 12 genuinely pending migrations.

| Order | Migration | Purpose / production gap |
|---|---|---|
| 1 | `20261113010000_team_area_administration` | Adds team/service-area administration audit and trusted management RPC. The base `team` and `service_area` tables already exist. |
| 2 | `20261113090000_cmi_typed_ministry_reports` | Adds `ministry_report` and `report_review_event`; both are absent in production. |
| 3 | `20261113100000_cmi_ministry_report_workflow` | Adds report capabilities, role grants and atomic review RPC. |
| 4 | `20261113110000_cmi_ministry_report_resubmission` | Adds safe correction/resubmission RPC. |
| 5 | `20261119160000_cmi_internal_notifications_event_flyers` | Adds `staff_notification`, notification triggers and private event-flyer bucket/policies. The table and bucket are absent in production. |
| 6 | `20261119170000_cmi_event_assignment_notification_timing` | Refines event/team assignment notification timing. |
| 7 | `20261119180000_cmi_assigned_prayer_inbox` | Adds assigned-only prayer inbox RPC. |
| 8 | `20261119200000_cmi_staff_event_registration` | Adds staff registration RPC and idempotency/capacity handling. The registration tables already exist; the RPC is absent. |
| 9 | `20261119210000_cmi_staff_event_registration_cancellation` | Adds cancellation RPC. |
| 10 | `20261119220000_cmi_staff_event_checkin` | Adds check-in RPC. The check-in table already exists. |
| 11 | `20261119230000_cmi_event_closeout_workflow` | Adds submit/review closeout RPCs. Closeout tables already exist. |
| 12 | `20261120100000_cmi_enable_bootstrap_lease_rls` | Enables RLS on the private first-admin bootstrap lease and adds the narrowly scoped server-role grants required by Edge Function query paths. |

Do not skip migrations 1–4 simply because some underlying team and branch tables already exist. Their missing audit/report objects and RPCs were checked separately.

## 3. Live schema facts confirmed

Present in production:
- Core church, branch, staff, six-role authorization and capability tables.
- Contact, follow-up, care and prayer domain tables.
- Team and service-area base tables.
- Event, event staff/team assignments, registration, check-in and closeout tables.
- Public-content tables.
- The seven foundation foreign-key indexes listed above.

Absent in production:
- `public.team_management_audit`
- `public.ministry_report`
- `public.report_review_event`
- `public.staff_notification`
- Storage bucket `event-flyers`
- The 16 team/report/prayer/notification/event RPCs introduced by the pending migrations.

The hosted project has no direct `anon` or `authenticated` table access under the intended Edge-Function-only model. The new server-role grants in the pending migration are deliberately narrow; every Edge Function must continue to enforce caller session, active staff status, branch scope and capability checks before using service-role access.

## 4. Edge Function release order

After schema migration validation, deploy these five currently missing functions from the reviewed PR source:

1. `team-operations`
2. `report-operations`
3. `pastoral-operations`
4. `staff-notifications`
5. `event-flyers`

Then deploy reviewed updates to the existing hosted functions:

- `event-operations`
- `public-content`
- `staff-auth`
- `staff-operations`

Do not deploy functions before their RPCs, tables, Storage bucket and required secrets are verified. Keep SMS/Arkesel out of this release.

## 5. Required preflight and acceptance gates

1. Run the exact-head frontend, web and backend CI; backend CI must replay all 29 ordered migrations on a clean isolated Supabase stack and pass every pgTAP suite.
2. Compare the three aligned historical migrations against the hosted catalog and constraints. The two index and capability-grant effects are confirmed; identity foundation requires a full schema/constraint diff because the hosted ledger does not retain the original SQL body.
3. Restore the missing hosted-only column grant in the clean local replay and confirm it grants UPDATE only on `password_setup_expires_at`.
4. Run a production-to-source schema diff for all pending tables, functions, triggers, policies, grants, indexes and Storage metadata. Do not use `IF NOT EXISTS` as a substitute for checking object definitions.
5. Verify service-role grants and ensure `anon` / `authenticated` remain denied for private tables and internal notification/flyer data.
6. Test Edge Function HTTP authorization failures: wrong recipient, wrong branch, missing capability, inactive staff, stale update, expired signed preview, spoofed upload, failed storage cleanup and simultaneous event-capacity contention.
7. Use owner-authorised non-production test identities for all six roles. Do not create or assign production staff accounts for testing.
8. Confirm server-side event idempotency secret and production email configuration without exposing values. No SMS secrets are required for this release.
9. Verify backup/restore readiness, monitoring, Auth leaked-password protection, public-site approved content and canonical-domain anonymous access.
10. Obtain a separate explicit production-release approval before applying any hosted migration, deploying a function, changing Auth settings, or promoting frontend code.

## 6. Security warning requiring deliberate review

The Supabase security advisor reports `private.first_admin_bootstrap_lease` has RLS disabled. A direct privilege check found that `anon` and `authenticated` have no USAGE on schema `private` and no SELECT privilege on this table; `service_role` also has no direct table privileges. The lease is intended to be accessed only through its SECURITY DEFINER RPCs. This means the advisor's generic exposure warning is not evidence of direct API-role access in the current grants, but RLS remains an important defense-in-depth control. The pending PR migration enables RLS and is covered by isolated database tests. Do not bypass this by applying an improvised SQL fix outside the reviewed migration. Include this migration in the ordered, approved release.

Supabase Auth leaked-password protection is also reported disabled. This is a separate Auth configuration task and must be deliberately enabled/reviewed before production acceptance.

## 7. Explicit non-actions

This reconciliation does not authorize or perform production migration application, Edge Function deployment, Storage mutation, Auth configuration, user creation, role assignment, data cleanup, Vercel promotion or SMS setup.

## 8. Read-only identity foundation catalog comparison (21 Nov 2026)

A direct read-only comparison was run against production project `cgwffpxlwgbnlinzwfoj` for the 11 identity-foundation tables. It checked column names/types/nullability/defaults, table constraints, indexes, triggers, RLS flags and effective role privileges.

Confirmed:
- All 11 expected tables and their declared columns are present.
- The production catalog matches the foundation's primary keys, expected foreign keys, check constraints and exclusion constraints in the inspected tables.
- The five timestamp-maintenance triggers from the source migration are present on `church`, `branch`, `staff_profile`, `team` and `service_area`.
- RLS is enabled on all 11 tables; no policies were returned for these tables in the inspected foundation slice.
- `anon` and `authenticated` have no USAGE on `public` and no SELECT on these tables. `service_role` has schema USAGE and SELECT on all 11, matching the source migration's server-only access model.
- The additional `must_change_password`, `password_setup_expires_at` and `password_changed_at` columns on `staff_profile` are later lifecycle additions, not columns expected from the identity foundation migration itself.

One catalog delta was found:
- The checked-in identity foundation SQL declares a redundant table-level `UNIQUE (id)` on `public.church` in addition to its primary key.
- The production catalog has the primary key and the `church_single_configured_instance_uq` index, but no separate `UNIQUE (id)` constraint/index.

This is a redundant uniqueness declaration and does not change valid row semantics because the primary key already guarantees unique `id` values. It does mean the checked-in historical SQL is not structurally identical to the hosted result. The original hosted migration body is unavailable, so byte-for-byte historical equivalence remains unprovable. Do not silently rewrite an applied historical migration. Resolve the redundant-index difference in a separately reviewed normalization migration or document acceptance of this harmless difference before any production release.

This comparison is read-only. No production SQL writes, grants, policies, migrations or data were changed.
