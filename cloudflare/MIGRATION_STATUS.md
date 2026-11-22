# PCG Missions — Cloudflare production status

**Status date:** 22 November 2026  
**Production Pages:** [https://pcg-missions.pages.dev](https://pcg-missions.pages.dev)  
**Production Worker:** `pcg-missions-api-production`  
**Production D1:** `pcg-missions-production` (`2bbfb04f-9182-427d-b269-d050b8a9403f`)  
**Production schema:** version **45**, EU jurisdiction  
**Production release branch:** `migration/cloudflare-auth-consolidation`

This document supersedes the historical preview-only migration notes previously stored in this file. Historical Supabase/PostgreSQL migration artifacts remain in the repository for traceability; they are not the live operational database.

## 1. Live architecture

- Cloudflare Pages serves the staff PWA and public visitor site.
- The production Cloudflare Worker owns Better Auth, session cookies, staff authorization and application API routes.
- Cloudflare D1 is the primary operational database and authorization store.
- Supabase is retained only for private event-flyer object storage. Supabase Auth and PostgreSQL are not the live staff identity or operational data plane.
- SMS sending, campaigns and automation are disabled. The production role-capability catalogue has no SMS grants.

Production Pages deployment after the hardening release:
- Deployment: [70252198-bd66-4cb0-9f54-a0dcb08abf73](https://dash.cloudflare.com/1697f36d4227453d2e25cfb49b347e5f/pages/view/pcg-missions/deployments)
- Source commit: `de8d324902d59cfa00ea0f6296a215a98bc9611c`
- Status: successful.

The production Worker is deployed and receives production traffic. Its `workers.dev` hostname includes the account subdomain `pcg-missions-nonprod`; that hostname label does not mean the script is using the non-production D1 binding. The production script and its production D1 binding are identified by the script/database resources above.

## 2. Production database verification

The last verified production D1 inspection confirmed:

- Environment marker is `production`.
- Schema version is 45.
- The migration ledger contains 45 ordered migrations with a consistent version sequence.
- `PRAGMA foreign_key_check` returned zero violations.
- Six roles have capability grants: Admin/Pastor, Coordinator, Team Leader, Field Worker, Follow-up Volunteer and Prayer Intercessor.
- The active capability catalogue contains 89 capabilities.
- Three staff profiles and three Better Auth user/credential-account records exist.
- Operational business tables for visitor contacts, follow-up tasks, events, ministry reports and announcements were empty at the time of inspection.

Do not seed synthetic visitors, tasks, events or reports into production. Empty operational tables are expected until the church begins using the live system.

The current production Admin/Pastor branch grants include the content-draft capabilities `content.manage.draft` and `content.manage`, plus `announcement.read.scoped`, `announcement.create.scoped` and the D1 trigger's `announcements.manage` requirement. No lower-role content authoring grants are added by this feature repair.

## 3. Authentication and access model

- Better Auth is the staff authentication system.
- Staff sessions are cookie-based and HttpOnly.
- Public self-registration is disabled.
- Administrators provision staff accounts; first-login password replacement and administrator-reviewed recovery are supported.
- Each request resolves the authenticated staff profile, active role assignments, branch and capability grants server-side.
- Authorization is enforced in the Worker and repeated in record-scoped SQL predicates where needed.
- Sensitive prayer and pastoral reads use restricted, audited access paths.

The six-role database grants are present, but complete authenticated acceptance for all six roles and every module remains a release gate.

## 4. Release safety and monitoring

The production release workflow includes:

- Worker type, security and route tests.
- Production database target verification.
- Forward-only D1 migration and migration-ledger checks.
- Pre-release D1 Time Travel bookmark capture.
- Production Worker deployment and health/auth/CORS checks.
- Pages production deployment verification.

The production hardening release also added Pages security headers, service-worker cache protections, release documentation and an availability monitor.

The availability monitor is scheduled every 15 minutes from the repository default branch `main`. It checks Pages, Worker health/schema marker, same-origin API health, anonymous authorization rejection, Better Auth session endpoint and exact-origin CORS. It can open/update a GitHub incident issue when a check fails. The workflow definition is in place; record a successful scheduled run before treating continuous monitoring as operationally proven.

A release-time Time Travel bookmark is not a full disaster-recovery rehearsal. An independent D1 export/import restore rehearsal is still outstanding.

## 5. Feature state and intentional restrictions

| Area | State |
|---|---|
| Authentication and staff sessions | Deployed; real-user acceptance remains outstanding |
| Staff account provisioning and password lifecycle | Implemented; full lifecycle acceptance remains outstanding |
| Contacts and interactions | Worker routes and scoped projections implemented; duplicate merge and complete live acceptance remain outstanding |
| Follow-up | Task creation, assignment, reassignment and status operations implemented; full live acceptance remains outstanding |
| Teams and service areas | Worker routes and capability enforcement implemented |
| Events and assignments | Staff operations implemented; complete registration/check-in/closeout acceptance remains outstanding |
| Calendar | Branch-scoped draft and update operations implemented |
| Announcements | Private draft operations only; publication and delivery are disabled |
| Sermons and welcome-message drafts | Cloudflare Worker migration is in progress in [PR #112](https://github.com/Elgit4/PCG_Missions/pull/112); not yet part of the production release |
| Ministry reports | Typed Worker workflows implemented; full submit/review/resubmit acceptance remains outstanding |
| Prayer and pastoral care | Restricted audited reads; complete care-management lifecycle is not enabled |
| Notifications | Inbox/read-state routes implemented; trigger-to-recipient acceptance remains outstanding |
| Private event-flyer storage | Supabase retained as the only runtime exception; storage workflow needs live acceptance |
| SMS | Disabled |
| Public event self-registration | Disabled |
| Transport | Excluded |
| Offline capture and sync | Disabled |
| Public content publication and announcement delivery | Disabled |

Announcement archival is explicitly outside the approved announcement-draft contract. The interface must not offer an archive/delete control for announcement drafts. Publication, scheduling and delivery remain separate future capabilities requiring their own approval and security controls.

## 6. Current feature repair

[PR #112 — Fix Cloudflare content draft wiring](https://github.com/Elgit4/PCG_Missions/pull/112) is a separate, non-production branch. It migrates the existing private sermon and welcome-message draft contract to Cloudflare D1 and adds regression coverage. It does not add new capability grants, enable publication, change production data, deploy the Worker or enable SMS.

The implementation preserves:
- Better Auth cookie sessions.
- `content.manage.draft` branch-scope authorization.
- The D1 `content.manage` trigger guard.
- Creator-only draft listing, detail and editing.
- Server-controlled draft status and null publication timestamp.
- No daily-word, digital-tract or church-wide profile authoring.

## 7. Outstanding production acceptance gates

1. Complete authenticated browser acceptance for Admin/Pastor and each of the five other roles.
2. Verify branch isolation, team/assignment scoping, private-field redaction and sensitive prayer/care boundaries.
3. Exercise the complete Contacts and Follow-up lifecycle, including duplicate review/merge once implemented.
4. Exercise event registration, capacity, check-in, closeout and private flyer upload/retrieval.
5. Verify reports, announcements, content drafts and notification trigger-to-recipient behavior end to end.
6. Observe successful scheduled monitor runs and establish incident ownership.
7. Complete an independent D1 export/import restore rehearsal and document recovery time and recovery point.
8. Verify GitHub branch protection, production environment reviewer gates and release permissions.
9. Approve and document privacy notice, lawful purpose, data retention, incident response and operational ownership before loading real congregant data.

The Vercel free-plan deployment limit is not a production outage: Cloudflare Pages is the production host. Do not route production traffic back to Vercel to work around that unrelated limit.

## 8. Safe operating rules

- Never run preview migrations or preview Worker deployments against production resources.
- Do not use a D1 Time Travel restore on production without an explicitly approved rollback and a freshly verified bookmark.
- Do not apply historical Supabase/PostgreSQL SQL to D1.
- Do not place credentials, session cookies, provider secrets or private congregant information in source control or chat.
- Keep SMS disabled and preserve the private event-flyer storage exception.
- Keep production data untouched during feature acceptance; use isolated test databases for synthetic data.

