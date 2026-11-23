# PCG Missions — Cloudflare Release Readiness Evidence

**Evidence timestamp:** 23 November 2026, 22:05 UTC  
**Repository:** `Elgit4/PCG_Missions`  
**Release-candidate branch:** `migration/cloudflare-auth-consolidation`  
**Candidate commit:** `98b1751563fb95dd30efcee2eddeb2016a265183`  
**Decision:** **Not approved for production cutover.** Preview and source CI are green; live authenticated acceptance, staff readiness, main-branch integration and production migration remain incomplete.

This document supersedes earlier session/quota observations in the end-to-end audit where the current candidate has since changed. It does not replace the full restore/authorization acceptance record.

## 1. Verified candidate CI and preview evidence

The current candidate commit `98b1751563fb95dd30efcee2eddeb2016a265183` has the following successful GitHub Actions runs:

| Workflow | Run | Result | What it proves |
|---|---:|---|---|
| Cloudflare D1 Foundation | [45275655900](https://github.com/Elgit4/PCG_Missions/actions/runs/45275655900) | Passed | SQLite migration/security tests, Worker TypeScript checks, Better Auth regression tests, Cloudflare runtime-boundary regression and acceptance-harness syntax checks |
| CMI web CI | [45275655747](https://github.com/Elgit4/PCG_Missions/actions/runs/45275655747) | Passed | Frontend type-check, lint, unit tests (including Pages gateway cookie/IP forwarding) and production build |
| Cloudflare Auth Preview Release | [45275280818](https://github.com/Elgit4/PCG_Missions/actions/runs/45275280818) | Passed on Worker-source commit `43cfa691f1f990d628e10d216336f91638b32141` | Preview Worker deployment, forward-only D1 migration, health and anonymous-boundary smoke tests |

The preview Worker is deployed at 100% to `pcg-missions-api-preview`, version `42b874b7-e425-42c2-a190-8807c2ad658a`, and is bound to the isolated non-production D1 database `pcg-missions-migration-test` (91 tables). The latest Pages preview build for candidate commit `98b1751563fb95dd30efcee2eddeb2016a265183` completed successfully as deployment [88ca8a22-cd72-4faa-bce9-6e81bf1a9135](https://88ca8a22.pcg-missions.pages.dev). Its preview environment has `PCG_MISSIONS_API_ORIGIN` set to the preview Worker. Production Worker and D1 remain separate.

The successful preview smoke results were:

- `GET /health`: HTTP 200; state ready; environment `non-production`; schema version 46; Better Auth configuration ready.
- `GET /api/v1/me` without a session: HTTP 401 with `UNAUTHENTICATED`.
- `GET /api/auth/get-session` without a session: HTTP 200 with JSON `null`.

The last result proves anonymous session initialization works. It does **not** prove authenticated password sign-in, session refresh, logout, forced first-password change or password recovery. Those remain part of the authenticated acceptance rehearsal.

## 2. Authentication and release-pipeline corrections merged into the candidate

The following pull requests have been merged into the candidate branch:

- [PR #139](https://github.com/Elgit4/PCG_Missions/pull/139): makes changes to the preview-release workflow run Cloudflare D1 Foundation validation.
- [PR #140](https://github.com/Elgit4/PCG_Missions/pull/140): separates routine preview deployment from the full D1 restore rehearsal; makes the restore/authenticated acceptance a prerequisite of explicit production cutover; removes duplicate Pages production deployment.
- [PR #141](https://github.com/Elgit4/PCG_Missions/pull/141): removes routine preview D1 insert/delete probes and legacy PostgreSQL credential re-import; keeps real login and recovery rate limits enabled.
- [PR #142](https://github.com/Elgit4/PCG_Missions/pull/142): makes sign-out fail visibly when Better Auth cannot confirm server-side revocation; the browser no longer clears the UI and falsely claims an HttpOnly session was revoked.
- [PR #143](https://github.com/Elgit4/PCG_Missions/pull/143): enforces a fail-closed production staff-roster gate and regression tests.
- [PR #144](https://github.com/Elgit4/PCG_Missions/pull/144): moves the read-only roster preflight ahead of the expensive D1 restore rehearsal.
- [PR #145](https://github.com/Elgit4/PCG_Missions/pull/145): makes passive session hydration read-only using Better Auth deferred refresh, and makes the browser issue an explicit POST refresh only when the server returns `needsRefresh: true`. Both internal and basePath-qualified GET session routes are exempt from the rate-limit write path; sign-in and password-recovery limits remain database-backed.
- [PR #146](https://github.com/Elgit4/PCG_Missions/pull/146): expands the authenticated acceptance harness for first-login password change, old-password rejection, Admin/Pastor reset approval, temporary credential handoff, old-session revocation, confirmed sign-out, team drafts and calendar lifecycle.
- [PR #147](https://github.com/Elgit4/PCG_Missions/pull/147): adds regression tests proving no browser-side Supabase Auth/client usage, confines Worker Supabase credentials to private event-flyer Storage and checks public content uses D1.
- [PR #148](https://github.com/Elgit4/PCG_Missions/pull/148): adds Pages gateway tests for HttpOnly Cookie/Origin forwarding, multiple Set-Cookie preservation, cross-origin rejection, fail-closed configuration and Cloudflare client-IP forwarding. It also fixes the nullable Set-Cookie fallback type error.

Four stale, divergent release/preview PRs (#134, #136, #137 and #138) were closed. They are superseded by the active candidate's guarded manual release workflow and the newer verified fixes. The alternative push-triggered production release path in the old proposals was not adopted.

## 3. Live production state — unchanged

Read-only Cloudflare D1 inspection on 23 November 2026 confirmed:

- Production D1 `pcg-missions-production` remains at schema 45; migration 0046 is not applied.
- The production Worker remains on its existing version. No candidate Worker version has been deployed to production.
- Production Pages has not been cut over by this release candidate.
- No production records, staff credentials, roles or assignments were modified during this remediation.
- SMS remains disabled.

The candidate release workflow now orders its production jobs as follows:

1. `production-roster-preflight`: reads production readiness and fails closed if the intended six-role staff roster is incomplete.
2. `restore-rehearsal`: runs the isolated EU D1 restore and authenticated six-role acceptance only after roster preflight passes.
3. `production-worker`: requires successful restore rehearsal, current exact-source CI and preview acceptance, and the explicit `DEPLOY-PRODUCTION` manual confirmation before production migration/deployment.

No automatic push or approval-file trigger is used to deploy production.

## 4. Current production staff-roster blocker

The read-only production roster summary currently reports:

| Measure | Production result | Release requirement |
|---|---:|---:|
| Staff profiles | 3 | At least 6 active staff profiles |
| Active staff profiles | 2 | At least 6 |
| Effectively assigned role codes | 1 | All 6 approved role codes |
| Active profiles without an effective role | 1 | 0 |
| Current assignments on inactive profiles | 1 | 0 |
| Expired first-login setup windows | 1 | 0 |

The six required roles are `admin_pastor`, `coordinator`, `team_leader`, `field_worker`, `follow_up_volunteer` and `prayer_intercessor`.

The existing Better Auth identity/credential reconciliation reported three staff profiles, three Auth users and three credential accounts in production; the current blocker is staff/role lifecycle readiness, not a missing password-hash import. Do not invent staff identities or silently assign roles. Reconcile the two inactive/unassigned/stale cases and provision/assign the remaining approved staff accounts through the audited staff-administration process.

The roster preflight was deliberately moved before restore rehearsal so that a known-incomplete roster does not spend D1 write quota on a rehearsal that cannot lead to a release.

## 5. D1 daily quota blocker

Cloudflare D1 account insights for 23 November 2026 at 21:42 UTC reported:

- 46 D1 databases with activity.
- 110,453 rows written across those databases that day.
- The Workers Free account-level D1 daily row-write allowance is 100,000.

The excess was driven primarily by repeated restore-rehearsal databases, each recording thousands of writes. D1 rejects further queries when the account reaches/exceeds the Free daily limit until the UTC daily reset, or until the account is moved to a paid Workers plan. This limit does not delete existing D1 data.

References:
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare changelog — D1 Free-tier daily limits](https://developers.cloudflare.com/changelog/2026-09-01-d1-free-tier-limits/)

The routine preview pipeline no longer runs a synthetic rate-limit insert/delete probe, repeated restore rehearsal, or the legacy PostgreSQL credential import. The real authenticated sign-in and recovery throttles remain enabled. A successful isolated authenticated restore rehearsal is still mandatory before production, after the staff preflight passes and account quota is available.

## 6. Supabase runtime boundary on the candidate branch

The candidate branch was checked directly (not inferred from the default branch):

- `web/src/App.tsx` initializes `PcgAuthClient` and `CmiApiClient`; it no longer reads Supabase Auth build-time configuration.
- `web/src/lib/cmi-api.ts` documents same-origin Cloudflare Pages gateway requests with HttpOnly Better Auth cookies.
- `cloudflare/src/public-content.ts` reads public church content from D1.
- `cloudflare/src/index.ts` retains `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in the event-flyer Storage operations (upload/sign/delete). These are server-side Worker bindings and are not exposed to the browser.
- Routine preview deployment no longer connects to the Supabase PostgreSQL credential source.

This is the intended private event-flyer storage exception. It does not mean that the candidate has been merged to the default branch or released to production.

## 7. Main-branch integration is still pending

The candidate code is not yet on `main`:

- [PR #82](https://github.com/Elgit4/PCG_Missions/pull/82), the feature-completion branch, remains a draft to `main` (537 commits, 131 changed files).
- [PR #102](https://github.com/Elgit4/PCG_Missions/pull/102), the Cloudflare/Better Auth migration candidate, remains a draft on top of the feature-completion branch (667 commits ahead of its base, 119 changed files).
- The migration branch has passing current candidate CI, but that is not the same as merging the candidate to `main`.

The safe integration order remains: complete release acceptance and owner/staff prerequisites, then integrate the feature baseline and Cloudflare migration into `main` as one reviewed release candidate. Do not merge the feature-only PR to production independently while its browser/auth path is still the legacy Supabase implementation.

## 8. Remaining production acceptance gates

1. Reconcile and provision the approved six-person staff roster; resolve expired first-login setup and inactive role assignment.
2. Obtain D1 write capacity (after the UTC reset or via an approved Workers Paid upgrade), then pass the complete isolated D1 restore rehearsal and authenticated six-role acceptance.
3. Verify real login, session retrieval, deferred session refresh, sign-out/revocation, forced first-password change and password reset using synthetic or approved test accounts.
4. Complete the six-role positive/negative authorization matrix, including team/contact/follow-up handoff, branch isolation, pastoral restrictions and audit records.
5. Complete browser-level acceptance of visitor capture, contact assignment, follow-up lifecycle, staff/role administration, events/registrations/check-in/closeout, calendar, announcements, public content, reports and notifications.
6. Rehearse recovery of a protected production-data clone/backup without changing production or exposing ministry data.
7. Confirm privacy notice, controller contact, lawful purposes, retention/deletion rules, pastoral-record access, incident response and operational support.
8. Confirm the operational credential-delivery procedure; do not assume invitation/reset email delivery is configured until end-to-end delivery is tested.
9. Merge the reviewed candidate to `main`, apply migration 0046 through the guarded manual workflow, deploy the production Worker and Pages frontend, then verify same-origin routes, CORS, sessions, recovery and monitoring.

**No production migration, production Worker/Pages deployment, staff role or credential mutation, or SMS activation is authorized by this evidence record.**


## 10. Authorization parity and event media storage

A direct row-level comparison of production D1 and the source Supabase project's `role_capability` table was completed on 23 November:

- Supabase: 65 `(role_code, capability_code)` grants.
- Production D1: 128 grants.
- Missing legacy role-capability pairs in D1: **0**.
- Scope changes among the 65 legacy pairs: **0**.
- The additional 63 D1 grants are compatibility/expanded capabilities; their configured modes are branch, team or assigned (not a new global/unscoped mode).

The Supabase Storage bucket `pcg-missions-event-media` was inspected directly. It is **private**, has the intended event-media bucket name and currently allows JPEG, PNG, WebP and AVIF at the bucket layer. The Worker deliberately enforces a stricter 5 MiB JPEG/PNG/WebP upload allowlist and serves 15-minute signed URLs. The bucket is not made public.

The automated Cloudflare Foundation regression test `cloudflare/tests/test_supabase_runtime_boundary.py` is merged and passed in run [45275655900](https://github.com/Elgit4/PCG_Missions/actions/runs/45275655900). It enforces that:
- production browser source and the web package contain no Supabase Auth/client dependency;
- the Cloudflare Worker can use Supabase credentials only inside the private event-flyer Storage integration;
- public church content remains served from D1.

The ten legacy Supabase Edge Functions remain deployed and active in the source Supabase project. Do **not** disable them before the Cloudflare production deployment is integrated, accepted and serving the live Pages domains. Once the cutover has passed, decommission the old staff/event/calendar/content/announcement/public-content functions and unused Supabase Auth/database dependencies, while retaining only the private event-media Storage service and the minimum server-side Storage credentials. Do not pause the Supabase project while Storage remains the agreed exception.


## 11. Pages authentication gateway — latest preview candidate

PR #148 added and passed the following browser-gateway checks on commit `98b1751563fb95dd30efcee2eddeb2016a265183`:

- forwards the browser's HttpOnly Better Auth `Cookie` and same-origin `Origin` to the API Worker;
- forwards `CF-Connecting-IP` for the Worker-side authentication throttling path;
- relays multiple upstream `Set-Cookie` values back to the Pages browser origin;
- keeps API responses no-store;
- rejects cross-origin requests before contacting the Worker;
- returns a closed failure when `PCG_MISSIONS_API_ORIGIN` is absent.

The TypeScript failure discovered by the first gateway test run (nullable `Set-Cookie` fallback) was corrected and the final web CI passed. The current candidate Pages preview deployment is `https://88ca8a22.pcg-missions.pages.dev`, with deployment status `success`; it is not the production Pages domain. A direct smoke from the current tool execution network was denied before reaching the Pages/Worker host, so no fresh HTTP response from that URL is claimed here. The Cloudflare deployment record and CI results confirm build/deploy success, not a full browser sign-in session.

The preview Worker API smoke was confirmed by the Cloudflare preview workflow on the unchanged Worker-source commit listed in section 1: health 200/schema 46, anonymous staff API 401, anonymous Better Auth session 200/null. Authenticated sign-in/session persistence and recovery remain gated by the isolated acceptance rehearsal.
