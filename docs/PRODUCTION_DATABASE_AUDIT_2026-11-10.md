# CMI Production Database Audit — 10 November 2026

**Repository:** `Elgit4/PCG_Missions`  
**Production Supabase project:** `cgwffpxlwgbnlinzwfoj` (PCG Missions)  
**Audit scope:** Hosted PostgreSQL schema, migration history, Edge Functions and security advisor  
**Authority:** CMI Follow-up Master Product Specification v2.1 and stakeholder decision register  
**Status:** Initial production security remediation verified; CMI application schema is not deployed; release blocked.

## Executive result

The production project is active. The original pre-foundation audit snapshot contained zero application tables; after the approved foundation rollout on 10 November 2026, the hosted `public` schema now contains **11 identity/authorization foundation tables**, with **three recorded migrations** and **zero deployed CMI Edge Functions**. The application/domain schema and authentication lifecycle are still incomplete. This is not a production-ready application.

The six CMI operational roles remain unchanged:
- Admin / Pastor (`admin_pastor`)
- Coordinator (`coordinator`)
- Team Leader (`team_leader`)
- Field Worker (`field_worker`)
- Follow-up Volunteer (`follow_up_volunteer`)
- Prayer Intercessor (`prayer_intercessor`)

No additional roles were introduced.

## Production change performed and verified

The hosted database exposed `public.rls_auto_enable()`, a SECURITY DEFINER event-trigger helper, to `anon` and `authenticated` through the Data API. The security advisor identified both exposures.

A narrowly scoped remediation was applied as migration:

- Version: `20261110130847`
- Name: `revoke_public_rls_auto_enable_execute`
- Repository migration: [20261110130847_revoke_public_rls_auto_enable_execute.sql](../supabase-cmi/supabase/migrations/20261110130847_revoke_public_rls_auto_enable_execute.sql)

Verification query confirmed:
- `anon` cannot execute the helper.
- `authenticated` cannot execute the helper.
- `service_role` cannot execute the helper directly.
- The helper remains a database event-trigger function; this remediation removes direct function execution grants, not the event-trigger registration.

The subsequent Supabase security-advisor query returned no lints. The hosted migration list recorded version `20261110130847`.

## Hosted production snapshot — verified after foundation rollout

The initial remediation-only snapshot above is historical. The following reflects the hosted project after the foundation and supporting-index migrations were applied and verified.

| Control | Observed result |
|---|---|
| Supabase project | Active |
| Hosted `public` foundation tables | 11 |
| Hosted migration history | 3 recorded migrations |
| CMI Edge Functions deployed | 0 |
| RLS enabled | 11/11 tables |
| `anon` / `authenticated` SELECT on `staff_profile` | Denied |
| Six-role catalogue | 6 approved roles seeded |
| `role_capability` grants | 0 rows (fail-closed) |
| Church / branch / staff / team records | 0 provisioned |
| Production authentication workflow | Not deployed |
| Security advisor | 11 informational `rls_enabled_no_policy` findings; intentional fail-closed state |
| Performance advisor | No unindexed foreign-key findings; unused-index notices expected on empty tables |

## Repository and design findings

The repository contains the CMI v2.1 product specification, logical and physical data proposals, role/capability proposal, schema drafts, Edge Function source and pgTAP test suites. These are not equivalent to deployed production functionality.

The permanent CMI migrations in source now include the identity/authorization foundation, hosted RLS-helper privilege remediation and supporting foreign-key indexes. The hosted project records all three. The remaining domain SQL slices are still under `supabase-cmi/schema-drafts/` and have been tested on isolated local CI stacks using temporary migrations. These drafts are not permanent migration history and are not deployed to hosted production.

PRs #24 and #25 have since been merged, and the integrated frontend source is present under `web/`. PR #26 has also been merged and adds first-administrator bootstrap and administrator-reviewed password recovery source. This updates the repository-source finding only: the frontend is not deployed; the current authentication source is email/password and is non-conformant with the confirmed email + private PIN requirement; the authentication lifecycle is not configured or deployed; the hosted project has only the 11-table identity/authorization foundation and zero deployed CMI Edge Functions; and no production administrator has been bootstrapped.

## Release-blocking governance and engineering gaps

The formal stakeholder decision register still marks R-01–R-12 and D-01–D-13 as pending. These include:
- Exact capability grants and role/scope combinations.
- Admin/Pastor pastoral oversight and audit boundaries.
- Coordinator prayer workflow versus narrative access.
- Contact field visibility for field workers and volunteers.
- Team leader cross-team boundaries and export permissions.
- SMS send/campaign permissions, provider, consent, opt-out, quiet hours and spend limits.
- Contact duplicate/merge, public registration and capacity rules.
- Care/prayer retention, offline device protection and data retention.
- Report fields and review authority.
- PIN activation, private PIN setup, reset/reissue and recovery security. The email + private PIN architecture proposal is now documented in `docs/30_CMI_PIN_AUTHENTICATION_ARCHITECTURE_PROPOSAL.md`; PIN length/format, KDF parameters, throttling thresholds, session lifetime and recovery proof remain unresolved.

The six roles are confirmed as fixed. That confirmation does not itself approve these sensitive permission and data-governance decisions. The system must remain fail-closed: no role-capability grants should be invented, no broad RLS policies should be introduced, and no sensitive prayer/care narrative should be exposed.

## Required next release sequence

1. Record church approval for the pending R/D decisions and authentication, SMS, offline and audit controls.
2. Reconcile each SQL draft against the physical schema proposal, traceability matrix, data dictionaries and tests.
3. Promote reviewed SQL drafts into permanent, ordered migrations in `supabase-cmi/supabase/migrations/`; do not apply legacy `supabase/` ChurchConnect migrations.
4. Apply migrations to an isolated non-production Supabase environment first.
5. Run all pgTAP suites, Deno tests, authorization-negative tests and migration replay tests.
6. Apply the approved migration sequence to production with a backup/rollback plan.
7. Verify hosted table inventory, constraints, indexes, RLS on every exposed table, grants, policies, triggers, functions and migration history.
8. Deploy only the required Edge Functions after configuration and security review; test JWT validation and service-role boundaries.
9. Complete and integrate the PWA frontend, then run end-to-end tests against the deployed API.
10. Run Supabase security, performance and health advisors and document every accepted residual risk.

## Release decision

**NO-GO for production launch.** The direct-execution vulnerability was remediated and verified, but the hosted CMI application schema, functions, authentication lifecycle, frontend integration and approved authorization model are not deployed. Do not describe CMI as production-ready until all release gates above pass.

## Follow-up engineering work — 10 November 2026

The following source and client-readiness changes were made after the initial hosted snapshot above:

- Added [document 29 — Client Stakeholder Approval & Handover Pack](29_CLIENT_STAKEHOLDER_APPROVAL_AND_HANDOVER_PACK.md), which consolidates the proposed least-privilege six-role baseline, R-01–R-12 and D-01–D-13 recommendations, authentication decision, client configuration inputs, UAT cases and formal approval record. The document is a review pack; it does not forge or imply church approval.
- Corrected the first-administrator bootstrap design. After the one-time bootstrap, the first Admin/Pastor receives only four branch-scoped control-plane capabilities: `staff.directory.read`, `staff.account.manage`, `access.role.assign` and `staff.password_reset.manage`. It does not receive capability-policy editing, contact export, pastoral oversight, SMS, or other business-domain grants. Staff invitation/account creation remains unimplemented.
- Added isolated database assertions that the bootstrap grants exactly those four capabilities and leaves pastoral oversight, SMS, exports and capability-policy editing ungranted.
- Clarified that the merged PR #26 sign-in flow currently uses email/password, while the product baseline specifies email + private PIN. This is a conformance blocker, not a decision to silently change the product requirement.
- Updated the root README, backend workspace guide and documentation index to reflect the merged frontend source, the hosted security-only migration and the current non-deployed state.

The isolated CMI backend CI run completed successfully at commit `6b7aa14c50467989dbeafa0244c15596e8f0071c`: [GitHub Actions run 42825105544](https://github.com/Elgit4/PCG_Missions/actions/runs/42825105544). The job passed Edge Function lint/type-check/request-validation tests, the isolated Supabase migration application and pgTAP database tests. This verifies the source at that exact SHA, not a hosted production deployment. Subsequent changes after that SHA are documentation-only; a final current-head run should still be observed before release.

A dedicated frontend workflow was added at `.github/workflows/cmi-web-ci.yml`. The full web pipeline passed on commit `7b5b497278209e3b56f8b13761462f2aad57fa66` in [GitHub Actions run 42825681902](https://github.com/Elgit4/PCG_Missions/actions/runs/42825681902): locked dependency installation, TypeScript type-check, ESLint, Vitest unit tests and Vite production build. A fresh backend CI run is still in progress at commit `a88f5e376fe790c94676858745609d38edcfb1c4`; do not call that run passed until its database migration and pgTAP steps finish successfully.

The hosted production snapshot remains unchanged: zero CMI public application tables, one hosted security-remediation migration, zero deployed CMI Edge Functions, and no production Auth users or CMI records created by this work. Security, performance and health advisors returned no lints; the RLS-helper direct-execution checks remain false for `anon`, `authenticated` and `service_role`.

**Release decision remains NO-GO.** The client must approve the role/data/authentication decisions, the email+PIN mismatch must be resolved and implemented, staff invitation/activation must be completed, domain migrations must be promoted and tested in staging, and the application must be deployed and accepted before production launch.


## Post-migration verification addendum — 10 November 2026

This addendum supersedes the earlier **Hosted production snapshot** above for the current state. The original snapshot is retained as a historical record of the audit before the identity/authorization foundation was applied.

The explicitly authorised identity/authorization foundation and its supporting indexes have since been applied to hosted Supabase project `cgwffpxlwgbnlinzwfoj`.

| Control | Verified current result |
|---|---|
| Hosted public foundation tables | 11 |
| Recorded hosted migrations | 3 |
| CMI Edge Functions deployed | 0 |
| RLS enabled | 11 of 11 tables |
| Six approved roles | 6 seeded |
| Role-capability grants | 0 |
| Staff, church, branch, team and service-area records | 0 |
| Anonymous SELECT on staff profiles | Denied |
| Authenticated SELECT on staff profiles | Denied |
| Service-role SELECT on foundation staff profiles | Allowed; server-side only |
| Security advisor | 11 informational `rls_enabled_no_policy` notices; intentional fail-closed state |
| Performance advisor | No unindexed foreign-key findings; unused-index notices remain expected on empty tables |

Hosted migration history:

1. `20261110130847` — `revoke_public_rls_auto_enable_execute`
2. `20261110134538` — `cmi_identity_authorization_foundation`
3. `20261110134606` — `cmi_foundation_fk_indexes`

The 11 tables are `church`, `branch`, `staff_profile`, `role`, `capability`, `role_capability`, `staff_role_assignment`, `team`, `staff_team_membership`, `service_area` and `staff_area_coverage`. The role catalogue contains exactly the six approved roles. No role-capability grants or business records were seeded. All 11 tables have RLS enabled and no client-facing policies, so the informational no-policy notices are expected and access remains closed.

The supporting-index migration added indexes for the seven previously unindexed foreign-key paths. The remaining unused-index notices are not a reason to remove these integrity/performance indexes before real query workloads exist.

The current backend CI run for commit `2528205046b48d1cca7b4c59f800780ce442a2cf` passed: [GitHub Actions run 42827620899](https://github.com/Elgit4/PCG_Missions/actions/runs/42827620899). The immediately preceding run for the index-migration commit was cancelled when the newer main-branch run superseded it; the successful current-head run is the relevant result.

**Release decision remains NO-GO.** This is only the identity/authorization foundation, not the complete CMI schema or application. No administrator, church/branch records, Edge Functions, authentication flow, domain tables, business role grants or production staff have been provisioned. Stakeholder approvals and the email + private PIN authentication conformance work remain release blockers.
