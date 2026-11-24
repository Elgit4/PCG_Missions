# PCG Missions Production Remediation Plan

> **Execution:** Native, in ordered stages. The owner has asked for the issues in the production-readiness audit to be solved one after another.

**Goal:** Convert the current migration candidate into a verified, operational PCG Missions production release without losing ministry history or enabling deferred SMS.

**Architecture:** Keep Cloudflare Workers and EU D1 as the application/API/database platform. Deploy the Better Auth frontend through Cloudflare Pages. Retain Supabase Storage only for event flyers until an R2 decision is explicitly approved. Apply production data corrections only through guarded, auditable, recoverable steps.

**Tech Stack:** Cloudflare Workers, D1, Pages, Wrangler, Better Auth, React/Vite, GitHub Actions, Supabase Storage.

**Spec:** `docs/47_PRODUCTION_READINESS_CONTINUATION_2026-11-23.md` and the owner-supplied Production Readiness Audit dated 23 Nov 2026.

## Global Constraints

- Keep the six-role model: admin_pastor, coordinator, team_leader, field_worker, follow_up_volunteer, prayer_intercessor.
- Do not create fake production business data.
- Keep SMS/Arkesel disabled.
- Keep R2 disabled unless the owner approves the billable resource.
- Preserve staff/profile IDs and ministry history when removing test login access.
- Do not expose branch internals in ordinary staff UI.
- Do not grant pastoral-care reader/writer capabilities without explicit owner approval.
- Do not delete pcg-missions-migration-test or pcg-missions-dev.
- Do not delete restore-rehearsal resources or the Supabase restore-test project until release evidence exists and the owner explicitly approves cleanup.

## Review Focus

- Better Auth cookie handling and session refresh through the real Pages Functions proxy.
- Branch and role isolation, including dual-control and assigned-prayer access.
- Idempotent production roster cleanup with append-only audit evidence.
- End-to-end feature workflows rather than route or component presence.
- Supabase Storage compatibility after retiring the old Auth/Edge Function surface.

---

### Task 1: Stabilize authenticated acceptance

**Files:**
- Modify: `cloudflare/scripts/run_authenticated_acceptance.mjs`
- Create: `cloudflare/scripts/run_browser_acceptance.mjs`
- Modify: `web/src/lib/auth.ts`, `web/src/lib/auth.test.ts`
- Modify: `.github/workflows/cloudflare-d1-restore-rehearsal.yml`

**Acceptance:** Run the authenticated D1 harness with conservative rate-limit pacing, then run a real Chromium login through Pages Functions, verify the HttpOnly cookie, rolling session refresh, responsive layout, and logout. Restore the temporary D1 bookmark and prove test records are removed.

### Task 2: Reconcile the known production test-login roster

**Files:**
- Review/test: `cloudflare/scripts/remove_test_staff_logins.sql`
- Modify: `cloudflare/tests/test_cmi_role_capability_migrations.py`
- Modify: `.github/workflows/cloudflare-production-worker-deploy.yml`

**Acceptance:** Preflight must prove the exact owner-approved baseline, one ready Admin/Pastor, zero ministry records referencing the two test logins, and zero live sessions for those accounts. After migrations 0046/0047, execute the idempotent cleanup script, preserve staff/profile history, remove credential access, revoke the stale team_leader assignment, and verify all three roster-gate counts are zero.

### Task 3: Complete guarded production cutover

**Files:**
- Modify: `.github/workflows/cloudflare-production-worker-deploy.yml`
- Review: `cloudflare/wrangler.toml`, `web/functions/api/[[path]].ts`

**Acceptance:** Verify the exact production D1 and Worker targets, preserve a pre-release Time Travel recovery point, apply pending migrations through Wrangler, deploy the reviewed Worker and Pages build, and pass health, session, anonymous-boundary, and production roster checks. Confirm the actual deployed Worker version and Pages deployment commit.

### Task 4: Verify every operational feature end-to-end

**Files:**
- Modify: `cloudflare/scripts/run_authenticated_acceptance.mjs` and focused tests under `cloudflare/tests/`
- Modify affected Worker routes and web screens only when a failing test proves a defect.

**Acceptance:** Test staff lifecycle, contacts, assignments, follow-up scheduling/completion/escalation, teams/service areas, events/registration/check-in/closeout/transport, reports and return/resubmission, notifications, announcements/read receipts, calendar/timezones, public content, and assigned-prayer access. Verify positive and negative authorization paths. Treat pastoral-care narrative access as intentionally unbuilt until the owner approves its capability model.

### Task 5: Retire obsolete Supabase application surface safely

**Files:**
- Review Supabase Edge Function inventory and repository references.
- Modify Cloudflare/Supabase configuration only after production Pages and Worker acceptance.

**Acceptance:** Confirm no deployed application path depends on Supabase Auth or the old Edge Functions. Disable/delete obsolete functions only after the Cloudflare cutover is evidenced. Preserve the PCG Missions Supabase project and Storage dependency for event flyers.

### Task 6: Observability, documentation, and controlled cleanup

**Files:**
- Modify: `cloudflare/MIGRATION_STATUS.md` and current release documentation.
- Review Cloudflare Worker observability settings and Pages environment variables.

**Acceptance:** Verify deployed query-string redaction, document exact live builds and release evidence, retain SMS off and R2 off, and request explicit owner approval before deleting leftover restore-rehearsal databases, obsolete Workers, or the Supabase restore-test project.
