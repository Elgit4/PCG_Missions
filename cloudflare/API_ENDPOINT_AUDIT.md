# Cloudflare Worker API audit

**Environment:** isolated EU D1 non-production track  
**Audited:** 13 November 2026  
**Production boundary:** Supabase, Vercel, DNS and production data are unchanged.

## API surface reviewed

The Worker is a single entry point in `src/index.ts`. Protected routes resolve the Better Auth session, load the active staff profile and validate the selected branch from `X-Branch-Id`. The browser must treat `/api/v1/me` capability metadata as UI guidance only; every business operation still performs server-side authorization and record-scope checks.

| Area | Method and path | Current behavior |
|---|---|---|
| Readiness | `GET /health`, `GET /api/v1/health` | Checks the non-production D1 schema marker |
| Authentication | `GET/POST /api/auth/*` | Better Auth session and email/password operations; public signup disabled |
| Staff context | `GET /api/v1/me` | Verified identity, branches, roles and capability metadata |
| Staff directory | `GET /api/v1/staff` | Capability-gated, branch-scoped directory |
| Staff audit | `GET /api/v1/staff/audit` | Cursor-paginated governance audit |
| Invitations | `GET/POST /api/v1/staff/invitations` | List and create invitation; token currently returned once for manual secure delivery |
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
| Prayer queue | `GET /api/v1/pastoral/prayer/queue` | Metadata-only Admin/Pastor assignment queue; sensitive reads are audited |
| Assigned prayer | `GET /api/v1/pastoral/prayer/assigned` | Narrative projection only for active intercessor assignment and explicit share |
| Prayer shares | `POST /api/v1/pastoral/prayer/requests/{id}/shares`, `POST /.../{shareId}/revoke` | Explicit share grant and reasoned revocation |
| Prayer response | `PATCH /api/v1/pastoral/prayer/requests/{id}` | Assigned intercessor can move request into progress or answered |
| Events | `GET/POST /api/v1/events`, `GET/PATCH /api/v1/events/{id}` | Branch/team/assigned-scope list/detail; Admin/Pastor and Coordinator can create/edit drafts |
| Event lifecycle | `POST /api/v1/events/{id}/publish`, `POST /api/v1/events/{id}/cancel` | Staff-only publish (visibility remains staff and registration closed) and cancellation; D1 records actor and before/after audit |

All protected business routes require a verified session and an authorized active branch. Caller-supplied profile, role, capability, assignee and branch values are not accepted as authorization authority.

## Corrections made in this review

1. **Identity-domain separation:** contact scope predicates now receive both the staff profile ID and Better Auth user ID. Team membership uses the profile ID; contact assignment uses the auth user ID. All contact-scope call sites pass both values.
2. **CORS contract:** `Idempotency-Key` is now included in allowed request headers so browser contact/follow-up creation can pass preflight.
3. **Interaction history:** added `GET /api/v1/contacts/{id}/interactions`, using the same branch/record scope gate as contact reads. Existing POST remains available.
4. **Merged contact exclusion:** the contact list always excludes merged records, including when `status=all`.
5. **Bounded JSON parsing:** request bodies are now rejected using declared Content-Length where available and streamed with a strict byte ceiling. Oversized streams are cancelled instead of being fully buffered before checking the limit.
6. **Regression contracts:** added Python unit tests for contact identity mapping, CORS headers, interaction history route, merged-record exclusion and bounded request parsing.
7. **Event lifecycle foundation:** added scoped event list/detail and draft create/update/publish/cancel routes. Publishing remains staff-only with registration closed. Migration 0016 adds a database-enforced event manager actor and append-only before/after event audit.

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
| P0 | Runtime deployment and auth | Deploy full Worker to non-production; validate Better Auth D1 schema compatibility; test sign-in, session refresh, sign-out, invitation acceptance and revocation |
| P0 | API integration tests | Add real Worker/D1 tests for staff, contacts, follow-up and prayer endpoints, including negative cross-branch/team/assignment cases |
| P1 | Prayer intake | Add authenticated prayer-request creation and lifecycle controls; keep public intake disabled until separately approved |
| P1 | Pastoral care | Implement case metadata and narrative handlers only after a distinct care-reader capability, explicit-share policy and audit tests are approved |
| P1 | Events | Staff registration, capacity-safe public registration, idempotency digest verification, transport reservation, check-in and closeout; current lifecycle routes are staff-only and registration remains closed |
| P1 | Calendar | Branch/team/event-scoped list, create, update and cancellation handlers |
| P1 | Announcements | Draft, audience assignment, publish/archive and in-app delivery ledger handlers |
| P1 | Public content | Published-only public read projections and capability-gated content editing/publishing |
| P2 | Ministry reports | Typed report submissions, review/resubmit, aggregation and privacy-controlled exports |
| P2 | Data reconciliation | Supabase export, transformation, D1 import and source-to-target row/count/hash reconciliation; no production data copied yet |
| P2 | Communications | Verified email provider for invitations/password resets; Hubtel remains disabled until consent, sender and cost controls are approved |
| P2 | Frontend | Cloudflare Pages preview binding and API client migration, keeping the production Supabase client intact until cutover approval |

## Known release blockers

- The full Worker is not yet deployed. The only deployed script is the isolated D1 smoke-check Worker.
- No deployed Worker request has exercised Better Auth against the EU D1 binding.
- Invitation email and password-reset delivery are not configured; invitation token delivery remains a manual one-time handoff.
- Pastoral-care narrative routes remain disabled.
- Event registration/transport/check-in/closeout, calendar, announcements, public-content and reporting handlers remain incomplete.
- The D1 schema is a first porting slice, not a complete replacement for the full live Supabase schema.
- No production data migration, frontend cutover, production DNS change or Supabase shutdown is authorized or performed.
