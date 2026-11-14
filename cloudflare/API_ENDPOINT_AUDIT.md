# Cloudflare Worker API audit

**Environment:** isolated EU D1 non-production track  
**Audited:** 13 November 2026  
**Production boundary:** Supabase, Vercel, DNS and production data are unchanged.

## API surface reviewed

The Worker is a single entry point in `src/index.ts`. Protected routes resolve the Better Auth session, load the active staff profile and validate the selected branch from `X-Branch-Id`. The browser must treat `/api/v1/me` capability metadata as UI guidance only; every business operation still performs server-side authorization and record-scope checks.

| Area | Method and path | Current behavior |
|---|---|---|
| Readiness | `GET /health`, `GET /api/v1/health` | Checks the non-production D1 schema marker |
| Authentication | `GET/POST /api/auth/*` | Better Auth session and email/password operations; password-reset delivery uses Resend when configured and fails closed otherwise; public signup disabled |
| Staff context | `GET /api/v1/me` | Verified identity, branches, roles and capability metadata |
| Staff directory | `GET /api/v1/staff` | Capability-gated, branch-scoped directory |
| Staff audit | `GET /api/v1/staff/audit` | Cursor-paginated governance audit; password-reset history is retained separately in append-only `staff_password_reset_audit` without live reset tokens or request state |
| Invitations | `GET/POST /api/v1/staff/invitations` | List and create invitation; token currently returned once for manual secure delivery until the invitation acceptance UI is integrated |
| Invitation lifecycle | `POST /api/v1/staff/invitations/accept`, `POST /api/v1/staff/invitations/{id}/revoke` | One-time invitation acceptance/revocation |
| Account lifecycle | `POST /api/v1/staff/{id}/deactivate`, `suspend`, `reactivate` | Audited branch-scoped account status changes; database triggers revoke sessions |
| Standard roles | `POST /api/v1/staff/roles`, `DELETE /api/v1/staff/roles/{id}` | Assign/revoke only the five standard roles |
| Admin/Pastor elevation | `GET/POST /api/v1/staff/role-elevations`, `POST /{id}/approve`, `POST /{id}/reject` | Distinct requester/reviewer approval |
| Admin/Pastor revocation | `GET/POST /api/v1/staff/role-revocations`, `POST /{id}/approve`, `POST /{id}/reject` | Distinct requester/reviewer approval with last-admin protection |
| Contacts | `GET/POST /api/v1/contacts`, `GET/PATCH /api/v1/contacts/{id}` | Scoped list/create/read/update; creation requires `Idempotency-Key` |
| Contact notes | `GET/POST /api/v1/contacts/{id}/notes` | Visibility constrained by author, assignment, team or branch scope |
| Contact interactions | `GET/POST /api/v1/contacts/{id}/interactions` | Scoped interaction history and interaction creation |
| Contact assignment | `POST /api/v1/contacts/{id}/assign` | Branch/team/assignment checks and assignment history |
| Follow-up tasks | `GET/POST /api/v1/followup/tasks`, `PATCH /api/v1/followup/tasks/{id}` | Scoped task list/create/update with idempotency and event ledger |
| Follow-up assignment | `POST /api/v1/followup/tasks/{id}/assign` | Scoped reassignment to an active staff member or team |
| Pastoral care | `GET/POST /api/v1/pastoral/care`, `GET/PATCH /api/v1/pastoral/care/{id}`, `POST /{id}/assignments`, `POST /{id}/assignments/{assignmentId}/revoke`, `POST /{id}/interactions` | Admin/Pastor branch-scoped metadata; narrative reads, status updates and interactions require an active explicit share and care assignment; reasoned revocation and append-only care audit |
| Prayer intake and queue | `POST /api/v1/pastoral/prayer/requests`, `GET /api/v1/pastoral/prayer/queue` | Authenticated branch-capability intake with bounded narrative, idempotency key, restricted default sensitivity and creation audit; metadata-only Admin/Pastor assignment queue; sensitive reads are audited |
| Assigned prayer | `GET /api/v1/pastoral/prayer/assigned` | Narrative projection only for active intercessor assignment and explicit share |
| Prayer shares | `POST /api/v1/pastoral/prayer/requests/{id}/shares`, `POST /.../{shareId}/revoke` | Explicit share grant and reasoned revocation |
| Prayer response | `PATCH /api/v1/pastoral/prayer/requests/{id}` | Assigned intercessor can move request into progress or answered |
| Events | `GET/POST /api/v1/events`, `GET/PATCH /api/v1/events/{id}` | Branch/team/assigned-scope list/detail; Admin/Pastor and Coordinator can create/edit private drafts |
| Event lifecycle and audit | `POST /api/v1/events/{id}/publish`, `POST /api/v1/events/{id}/cancel`, `GET /api/v1/events/{id}/audit` | Staff-only publish/cancel; branch manager can read append-only actor and before/after history |
| Event registration | `POST /api/v1/events/{id}/registration/open`, `POST /registration/close` | Branch event manager opens/closes registration; D1 blocks registration when the event is unpublished or closed |
| Event attendee registration | `GET/POST /api/v1/events/{id}/registrations`, `POST /registrations/{registrationId}/cancel` | Staff-only list/create/cancel, capacity guard, request-digest receipts and replay-safe cancellation keys |
| Event check-in | `GET/POST /api/v1/events/{id}/checkins` | Check-in capability plus branch/event assignment scope; one check-in per registration and immutable idempotency receipt |
| Transport | `GET/POST /api/v1/events/{id}/transport-options`, `PATCH /transport-options/{optionId}`, `GET/POST /transport-reservations`, `POST /transport-reservations/{reservationId}/cancel` | Event transport enabled, active registration required, capacity and actor checks enforced by D1 |
| Event closeout | `GET/POST /api/v1/events/{id}/closeout`, `POST /closeout/resubmit`, `POST /closeout/review` | Counted closeout submission, idempotency receipts, separate review capability and append-only event ledger |
| Calendar | `GET/POST /api/v1/calendar`, `GET/PATCH /api/v1/calendar/{id}`, `POST /{id}/cancel`, `POST /{id}/read`, `POST /api/v1/calendar/series`, `POST /series/{id}/cancel` | Branch/team/own/event-scoped reads; branch manager creates/updates/cancels active entries; cancellation reason required; append-only change audit and recipient read receipts; timezone-aware daily/weekly/monthly recurrence bounded to 52 occurrences; series cancellation preserves past entries and cancels future entries with reason; cancelled entries excluded from reads |
| Announcements | `GET/POST /api/v1/announcements`, `GET/PATCH /api/v1/announcements/{id}`, `POST /{id}/publish`, `POST /{id}/schedule`, `POST /{id}/archive`, `GET /api/v1/announcements/inbox`, `POST /{id}/read` | Branch-managed audience targets; immediate or scheduled publication; a five-minute cron publishes due items only while the scheduling actor retains active branch authority; delivery fans out only to eligible active staff; recipient-only inbox and append-only read receipts |
| Public content | `GET /api/public/content?branch_id={id}` | Anonymous published-only projection for church profile, welcome messages, sermons, daily word, tracts, public announcements, public events and HTTPS links |
| Content management | `GET /api/v1/content`, `POST /api/v1/content/{kind}`, `PATCH /api/v1/content/{kind}/{id}`, `POST /api/v1/content/{kind}/{id}/publish|archive` | Branch capability-gated draft and publication lifecycle for welcome messages, sermons, daily words and digital tracts |
| Church profile and links | `GET/PATCH /api/v1/content/profile`, `POST /api/v1/content/links` | Church-scoped profile upsert and immutable HTTPS links to sermon/tract content |
| Content audit | `GET /api/v1/content/audit` | Branch/church-visible append-only public-content change history |
| Reporting | `GET /api/v1/reports/overview`, `GET /api/v1/reports/export?from=&to=`, `GET/POST /api/v1/reports`, `GET /api/v1/reports/{id}`, `GET /api/v1/reports/teams`, `GET /api/v1/reports/events`, `POST /{id}/review`, `POST /{id}/resubmit` | Aggregate-only overview with prior-period comparisons; Admin/Pastor-only CSV export with append-only export audit; typed daily/event/weekly reports; D-12 self/team/branch scopes, author-only resubmission, no self-review, append-only review history; report cohorts require three distinct authors |
| Content management | `GET /api/v1/content`, `POST /api/v1/content/{kind}`, `PATCH /api/v1/content/{kind}/{id}`, `POST /{kind}/{id}/publish`, `POST /{kind}/{id}/archive` | Branch capability-gated draft and publication lifecycle for welcome messages, sermons, daily words and digital tracts |
| Church profile and links | `GET/PATCH /api/v1/content/profile`, `POST /api/v1/content/links` | Church-scoped profile upsert and immutable HTTPS links to sermon/tract content |
| Content audit | `GET /api/v1/content/audit` | Branch/church-visible append-only public-content change history |

All protected business routes require a verified session and an authorized active branch. Caller-supplied profile, role, capability, assignee and branch values are not accepted as authorization authority.

## Corrections made in this review

1. **Identity-domain separation:** contact scope predicates now receive both the staff profile ID and Better Auth user ID. Team membership uses the profile ID; contact assignment uses the auth user ID. All contact-scope call sites pass both values.
2. **CORS contract:** `Idempotency-Key` is now included in allowed request headers so browser contact/follow-up creation can pass preflight.
3. **Interaction history:** added `GET /api/v1/contacts/{id}/interactions`, using the same branch/record scope gate as contact reads. Existing POST remains available.
4. **Merged contact exclusion:** the contact list always excludes merged records, including when `status=all`.
5. **Bounded JSON parsing:** request bodies are now rejected using declared Content-Length where available and streamed with a strict byte ceiling. Oversized streams are cancelled instead of being fully buffered before checking the limit.
6. **Regression contracts:** added Python unit tests for contact identity mapping, CORS headers, interaction history route, merged-record exclusion and bounded request parsing.
7. **Event lifecycle foundation:** added scoped event list/detail and draft create/update/publish/cancel routes. Publishing remains staff-only with registration closed. Migration 0016 adds a database-enforced event manager actor and append-only before/after event audit.
8. **Calendar and announcement workflows:** added branch/team/assigned calendar reads, branch-manager calendar create/update, audience-scoped announcement list/create/update/publish/archive, and a published-only anonymous content projection. The key SQL statements were compiled with `EXPLAIN` against the real EU D1 schema without mutating records.
9. **Public content management:** added capability-gated draft/update/publish/archive routes for welcome messages, sermons, daily words and digital tracts; church public profile upsert; HTTPS external links; and a scoped audit read. Migration 0017 adds profile/link database authorization and immutable content-change audit.
10. **Event operations:** added staff registration/list/cancel, open/close registration, check-in, transport option/reservation and closeout submit/resubmit/review endpoints. Migrations 0018–0020 add capacity/actor guards, cancellation request-key uniqueness and role-specific event assignment checks. EU D1 is now at schema version 20.
11. **Announcement delivery and read receipts:** publishing now fans out in-app deliveries to the configured branch/team/event audience; staff receive a recipient-scoped inbox and can mark items read. Migration 0021 adds an audience-checked delivery trigger and immutable read receipts. EU D1 was verified at schema version 21 before typed reports were added.
12. **Typed ministry reports:** migration 0022 adds typed daily/event/weekly submissions, D-12 scopes, self-review protection and append-only review/resubmission history.
13. **Prayer intake:** added authenticated `POST /api/v1/pastoral/prayer/requests`. It requires `prayer.request.create` at branch scope, validates bounded narrative/contact/expiry inputs, requires an `Idempotency-Key`, stores a request digest and appends a creation audit. Migration 0023 adds the branch-scoped idempotency ledger; public intake remains disabled.
14. **Calendar lifecycle:** added cancellation with mandatory reason, immutable change history, recipient-scoped immutable read receipts and active-only list/detail reads. Migration 0024 adds cancellation attribution, actor attribution for edits, audit and receipt tables. Timezone-aware daily/weekly/monthly recurrence generation and reasoned series cancellation are implemented in source/schema; runtime verification remains.
15. **Ministry report analytics:** the aggregate overview includes typed daily/event/weekly report time-series cohorts and prior-period comparisons. Cohorts require at least three distinct authors; Admin/Pastor aggregate CSV export is available with an append-only export audit and excludes personal identifiers and prayer narratives.
16. **Password-reset history:** migration 0028 preserves approved historical reset events in an append-only audit table without copying live reset requests or tokens. Resend delivery is implemented for password-reset links and remains disabled until a verified sender and API key are configured.

## API security review checklist

- Session identity is resolved by Better Auth, not request JSON.
- Active staff status and branch assignments are re-read from D1.
- Record-scope predicates are included in data statements.
- Highly restricted contact fields require separate grants.
- Prayer narrative reads require an active explicit share and are audited before return.
- Multi-row mutations use D1 batches and database constraints/triggers.
- Request bodies have an explicit size ceiling.
- Error responses avoid returning SQL errors or sensitive record contents.
- Worker CORS is exact-origin based; do not add wildcard origins.
- Do not expose the Cloudflare Worker to the production frontend until the complete preview test pass is green.

## Outstanding API implementation

| Priority | Domain | Remaining work |
|---|---|---|
| P0 | Runtime deployment and auth | Configure `CLOUDFLARE_API_TOKEN` and `BETTER_AUTH_SECRET`, deploy full Worker to non-production, validate Better Auth against remote EU D1, and test session refresh plus invitation acceptance/revocation |
| P0 | API integration tests | Local Worker/D1 tests cover Better Auth, cron invocation and unauthenticated route gates; add authenticated remote D1 tests for cross-branch/team/assignment, expiry/revocation, duplicate-key, capacity-race and audit-failure cases |
| P1 | Prayer intake | Authenticated creation is now implemented with branch capability, idempotency and audit; add real Worker/D1 integration tests and remaining lifecycle controls. Keep public intake disabled until separately approved |
| P1 | Pastoral care | Case metadata and explicit-share narrative handlers are implemented in source; apply migration 0025 and add real Worker/D1 integration tests for cross-branch, expired-share, revoked-assignment and audit failure cases |
| P1 | Events | Add real Worker/D1 integration tests for all new staff-only operations and verify the UI workflow; public registration remains deliberately disabled |
| P1 | Calendar | Recurring-series generation/cancellation, immutable change audit and scoped read receipts are implemented in source/schema; apply migrations 0025–0028 and verify Worker/D1 integration across time zones and DST boundaries |
| P1 | Announcements | Scheduled publication and five-minute cron are implemented in source; verify due-item publication, revoked scheduler denial, delivery fan-out and inbox isolation in a deployed Worker |
| P1 | Public content | Add deeper publishing/audience integration tests and public frontend wiring; CRUD, church profile management and published-only projection are in source |
| P2 | Ministry reports | Typed report submissions, review/resubmit, prior-period comparisons and Admin/Pastor-only aggregate CSV export with immutable audit are in source; verify export privacy and audit-failure denial against deployed Worker/D1 |
| P2 | Data reconciliation | Supabase export, transformation, D1 import and source-to-target row/count/hash reconciliation; no production data copied yet |
| P2 | Communications | Resend password-reset adapter and append-only reset audit are implemented; configure `RESEND_API_KEY` and verified `EMAIL_FROM`, then add invitation acceptance UI/email. Hubtel remains disabled until consent, sender and cost controls are approved |
| P2 | Frontend | Cloudflare Pages preview binding and API client migration, keeping the production Supabase client intact until cutover approval |

## Known release blockers

- The full Worker is not yet deployed. The only deployed script is the isolated D1 smoke-check Worker. Wrangler typecheck and dry-run bundling pass; GitHub Actions skips deployment until the repository secret `CLOUDFLARE_API_TOKEN` is configured.
- No deployed Worker request has exercised Better Auth against the EU D1 binding.
- Password-reset email delivery uses the Resend adapter but is disabled until `RESEND_API_KEY` and verified `EMAIL_FROM` are configured; invitation token delivery remains a manual one-time handoff until its acceptance UI is integrated.
- Pastoral-care routes, recurring calendar series, scheduled announcements and aggregate CSV exports are implemented in source and pass local Worker/D1 contract tests, but the full Worker is not deployed; migrations 0025–0028 are applied to EU non-production D1 (schema version 28); the full API Worker remains undeployed.
- Event registration/transport/check-in/closeout, calendar, announcement inbox/read receipts, aggregate reporting and public-content routes are implemented in source and local D1 schema, but remain undeployed and require authenticated remote Worker/D1 integration tests. Aggregate CSV export is restricted and audited; source-to-target data reconciliation remains incomplete.
- The D1 schema is a first porting slice, not a complete replacement for the full live Supabase schema.
- No production data migration, frontend cutover, production DNS change or Supabase shutdown is authorized or performed.
