# CMI Production Database Audit — 10 November 2026

**Repository:** `Elgit4/PCG_Missions`  
**Production Supabase project:** `cgwffpxlwgbnlinzwfoj` (PCG Missions)  
**Audit scope:** Hosted PostgreSQL schema, migration history, Edge Functions and security advisor  
**Authority:** CMI Follow-up Master Product Specification v2.1 and stakeholder decision register  
**Status:** Initial production security remediation verified; CMI application schema is not deployed; release blocked.

## Executive result

The production project is active, but the CMI application schema is not present. At audit time the hosted `public` schema contained **zero application tables**, the migration history contained only the security-remediation migration listed below, and there were **zero deployed CMI Edge Functions**. This is not a production-ready application.

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

## Hosted production snapshot

| Control | Observed result |
|---|---|
| Supabase project | Active / healthy |
| Hosted `public` application tables | 0 |
| Hosted migration history | 1 remediation migration |
| CMI Edge Functions deployed | 0 |
| RLS helper exposed to anon | No |
| RLS helper exposed to authenticated | No |
| Security advisor | No findings after remediation |
| Six-role catalogue in hosted DB | Not deployed |
| Role-capability grants | Not deployed |
| Staff profiles / branch / teams | Not deployed |
| Production authentication workflow | Not deployed |

## Repository and design findings

The repository contains the CMI v2.1 product specification, logical and physical data proposals, role/capability proposal, schema drafts, Edge Function source and pgTAP test suites. These are not equivalent to deployed production functionality.

The permanent CMI migration currently in source is the identity/authorization foundation. The remaining domain SQL slices are still under `supabase-cmi/schema-drafts/` and have been tested on isolated local CI stacks using temporary migrations. The repository implementation status explicitly records that these drafts are not permanent migration history and are not deployed to hosted production.

PRs #24 and #25 have since been merged, and the integrated frontend source is present under `web/`. PR #26 has also been merged and adds first-administrator bootstrap and administrator-approved password recovery source. This updates the repository-source finding only: the frontend is not deployed, the authentication lifecycle is not configured or deployed, the hosted project still has zero CMI public application tables and zero deployed CMI Edge Functions, and no production administrator has been bootstrapped.

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
- PIN activation, private PIN setup, reset/reissue and recovery security.

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

The hosted production snapshot remains unchanged: zero CMI public application tables, one hosted security-remediation migration, zero deployed CMI Edge Functions, and no production Auth users or CMI records created by this work. Security, performance and health advisors returned no lints; the RLS-helper direct-execution checks remain false for `anon`, `authenticated` and `service_role`.

**Release decision remains NO-GO.** The client must approve the role/data/authentication decisions, the email+PIN mismatch must be resolved and implemented, staff invitation/activation must be completed, domain migrations must be promoted and tested in staging, and the application must be deployed and accepted before production launch.
