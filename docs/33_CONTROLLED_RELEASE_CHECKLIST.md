# PCG Missions — Controlled Release Checklist

**Scope:** PR #82 non-SMS workflows only.  
**Target project:** Supabase `cgwffpxlwgbnlinzwfoj` (EU West).  
**Source branch:** `feat/cmi-pcg-missions-final-review-v6`.  
**Current verified branch head:** `0f23ce7f7c6d4fbaf9d57cf48aa61c0ac8e850f6`.  
**Release status:** NOT APPROVED / NOT DEPLOYED.

This checklist is an execution order and evidence record. It does not authorize production changes.

## Gate 0 — Source integrity and CI

- [x] Confirm PR head `0f23ce7f7c6d4fbaf9d57cf48aa61c0ac8e850f6` and verify all three workflows against this exact SHA.
- [x] Web CI passed: run `44850979759`.
- [x] CMI frontend CI passed: run `44850979726` (typecheck, lint, tests and production build).
- [x] CMI backend CI passed: run `44850979713`, including clean isolated Supabase startup, ordered replay of all 29 migrations, CMI database/pgTAP test step and clean shutdown.
- [x] Confirm all three exact-head workflows completed successfully; no required workflow remains queued or cancelled.
- [ ] Complete a final human review of the full PR diff before merge.
- [ ] Obtain a Vercel Preview deployment for this exact SHA and verify static routes/assets. A direct lookup for this SHA returned no deployment yet; the previously READY preview is from an older commit and is not accepted as evidence.
- [ ] Perform authenticated desktop and mobile browser acceptance; HTTP 200 checks alone are not sufficient.

**Evidence updated 21 November 2026:** exact-head GitHub check-runs report success for frontend, web and backend. The backend job completed all 54 primary steps, including local migration replay, pgTAP and stack shutdown. This verifies the clean local migration chain, not compatibility against a disposable copy of the hosted production schema.

## Gate 1 — Migration provenance and schema compatibility

- [ ] Confirm the three historical migration version alignments against the hosted migration ledger.
- [ ] Compare identity foundation source SQL against the live catalog: tables, columns, data types, defaults, constraints, foreign keys, indexes, triggers, RLS, grants, and dependent functions. The hosted migration ledger does not retain the original SQL body; do not assume filename alignment proves byte-for-byte equivalence.
- [ ] Review the reconstructed hosted-only password-expiry grant migration. Confirm it grants only UPDATE on `staff_profile.password_setup_expires_at` to `service_role`.
- [ ] Start an isolated Supabase environment from a snapshot or disposable local stack; do not use production as the migration test target.
- [ ] Replay the complete 29-file migration chain from an empty database and compare resulting schema with the expected application schema.
- [ ] Replay the pending 12 migrations against a disposable copy of the hosted schema, checking for duplicate objects and incompatible existing definitions. This is distinct from the successful clean-database replay and remains a release gate.
- [ ] Verify migration order and exact versions before any production application.
- [ ] Capture a before/after schema diff for all tables, views, functions, triggers, policies, grants, indexes, enums and Storage metadata.
- [ ] Verify rollback/restore strategy and backup recoverability before release.

## Gate 2 — Backend and Storage deployment

Deploy only after Gate 1 passes and release approval is explicitly recorded.

### Database migrations
- [ ] Apply the approved forward-only migration set in order.
- [ ] Verify every migration version appears once in the hosted ledger.
- [ ] Recheck database grants, RLS, constraints and function execution privileges.

### Missing Edge Functions
- [ ] `team-operations`
- [ ] `report-operations`
- [ ] `pastoral-operations`
- [ ] `staff-notifications`
- [ ] `event-flyers`

### Reviewed updates to existing functions
- [ ] `event-operations`
- [ ] `public-content`
- [ ] `staff-auth`
- [ ] `staff-operations`

### Function secrets and storage
- [ ] Verify the event idempotency HMAC secret exists in the intended environment without printing its value.
- [ ] Verify required email sender/provider configuration and test delivery to owner-authorised test inboxes.
- [ ] Verify the private `event-flyers` bucket and its policies, signed URL expiry, upload MIME/type/size enforcement and cleanup behavior.
- [ ] Do not configure or invoke SMS/Arkesel as part of this release.

## Gate 3 — Security and functional acceptance

Use owner-authorised non-production identities for all six roles. Do not create or modify production staff identities to make tests pass.

- [ ] `admin_pastor`: authorised administration, branch-scoped access and audited sensitive pastoral access with reason codes.
- [ ] `coordinator`: cross-team coordination only within granted scope.
- [ ] `team_leader`: team/service-area and assigned-work scope.
- [ ] `field_worker`: assigned contacts and follow-up work only.
- [ ] `follow_up_volunteer`: limited assigned follow-up only.
- [ ] `prayer_intercessor`: assigned prayer requests only; no broad contact or pastoral-record access.
- [ ] Verify cross-branch and cross-recipient access is denied at the server boundary.
- [ ] Verify inactive staff, expired sessions, missing capabilities and malformed requests are rejected.
- [ ] Verify stale-update conflict handling and idempotent retries.
- [ ] Verify event capacity under simultaneous registrations.
- [ ] Verify notification recipient isolation and read receipts.
- [ ] Verify flyer spoofing rejection, signed-preview expiry and storage rollback/cleanup.
- [ ] Verify report submission, review, return-for-correction and resubmission.
- [ ] Verify assigned-only prayer inbox.
- [ ] Verify event registration, cancellation, check-in and closeout lifecycle.
- [ ] Verify staff onboarding, first-login password change, expiry and admin reset flows without sending unapproved invitations.
- [ ] Verify audit records are written for sensitive actions and are not editable by ordinary roles.

## Gate 4 — Operational readiness

- [ ] Review and enable Supabase Auth leaked-password protection after compatibility review.
- [ ] Confirm monitoring, alerting, error reporting and operational ownership.
- [ ] Confirm backup schedule and complete a restore rehearsal.
- [ ] Confirm privacy notice, data retention, access request and incident response procedures.
- [ ] Add only church-approved public profile, welcome, sermon, Daily Word, announcement and event content; do not seed demo content.
- [ ] Verify canonical production domain anonymous access without disabling deployment protection blindly.
- [ ] Confirm a support/admin recovery path for login and onboarding failures.
- [ ] Confirm no branch names or internal-only fields are exposed in the staff UI.

## Gate 5 — Explicit production release authorization

Before production action, obtain a separate approval that identifies:
1. The exact PR number and final commit SHA.
2. The approved migration versions.
3. The approved Edge Function list and versions.
4. The approved Storage changes and Auth setting changes.
5. The planned release window and rollback/restore owner.

Only after that approval:
- [ ] Merge PR #82.
- [ ] Apply approved production migrations.
- [ ] Deploy approved production Edge Functions.
- [ ] Apply approved Storage/Auth configuration.
- [ ] Promote the matching frontend deployment.
- [ ] Run production smoke tests and verify logs, metrics and audit records.
- [ ] Record release evidence and monitor the agreed observation window.

## Explicit exclusions

This checklist does not approve production migrations, function deployments, Storage changes, Auth changes, user creation/deletion, role assignments, Vercel production promotion, data cleanup or SMS setup. Those actions require their own explicit authorization.