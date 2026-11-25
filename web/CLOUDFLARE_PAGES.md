# PCG Missions — Cloudflare Pages and Workers

Cloudflare Pages serves the PWA. A same-origin Pages Function gateway forwards all /api requests to the Cloudflare API Worker. Better Auth owns staff credentials and HttpOnly cookie sessions; Cloudflare D1 owns application data and authorization. The Worker uses a private EU Cloudflare Workers KV namespace for event-flyer media. The application runtime has no Supabase dependency.

## Runtime architecture

- Browser → same-origin /api/auth/* → Better Auth on the Cloudflare Worker.
- Browser → same-origin /api/v1/* → Cloudflare Worker business API.
- Pages Function gateway forwards cookies, request bodies, branch context and idempotency keys to the Worker and returns its Set-Cookie headers.
- Worker → EU Cloudflare D1 for authentication, staff identity, six-role authorization, ministry records, audit, reports, announcements, events and follow-up.
- Worker → private EU Cloudflare Workers KV for event-flyer upload, signed retrieval, replacement and deletion. KV is accessible only through the Worker binding; no public bucket or public URL is enabled.

## Pages project settings

| Setting | Value |
| --- | --- |
| Project | pcg-missions |
| Root directory | web |
| Build command | npm run build |
| Build output | dist |
| Node.js | 22 |

The `web/functions/api/[[path]].ts` dynamic route is required to make every `/api/*` URL match a real Pages Function. The nested `web/functions/api/_middleware.ts` runs for those matched routes and performs the same-origin proxy to the API Worker. The `web/public/_routes.json` include rule ensures `/api/*` requests invoke Pages Functions. Do not remove the dynamic route while the proxy remains middleware-based; a middleware file alone does not create a route. SPA routes use the existing fallback.

## Runtime variables

For Preview, set PCG_MISSIONS_API_ORIGIN to https://pcg-missions-api-preview.pcg-missions-nonprod.workers.dev.

For Production, set PCG_MISSIONS_API_ORIGIN to the separately provisioned production Worker only after its D1 binding, secrets, health checks, authenticated acceptance and rollback checks pass.

The Worker requires BETTER_AUTH_SECRET (at least 32 random characters), BETTER_AUTH_URL and BETTER_AUTH_TRUSTED_ORIGINS (exact HTTPS origins), APP_ALLOWED_ORIGINS (exact Pages origin allowlist), and the `EVENT_MEDIA` KV binding. Event-media links are signed with HMAC and expire after 15 minutes.

Do not add storage credentials or secrets to Pages variables or browser build variables. SMS remains disabled.

## Current guarded release checks

The numbered schema-44 and credential-import steps from the original migration are historical. Better Auth and the Cloudflare identity foundation are already present; do not repeat the one-time credential import.

1. Run Cloudflare D1 Foundation CI, Worker tests/typecheck, Wrangler preview/production dry-run bundle checks, and frontend CI on the exact release commit.
2. Deploy the candidate to the isolated preview Worker and verify health, Better Auth session boundary, anonymous authorization boundary and same-origin Pages proxy.
3. Run the full isolated schema-49 authenticated acceptance harness. It must cover all six roles, branch/team/assignee isolation, login and password recovery, contacts/follow-up/reassignment/handoff, notification producers and recipient scope, report lifecycle, event registration/check-in/closeout, prayer/care restrictions, team/service-area administration, announcements/content/calendar and audit integrity.
4. Clone production D1 into an isolated EU database, compare manifests and foreign keys, rehearse Time Travel restore, and securely delete the clone/export.
5. Use only the guarded production release workflow. Capture the production bookmark, apply forward-only migrations, verify the migration ledger and roster reconciliation, then deploy Worker and Pages from the same reviewed commit.
6. Verify production direct Worker and same-origin Pages health/session/CORS boundaries plus authenticated staff smoke tests. Keep automatic Pages production deployment disabled.
7. Keep the event-media KV namespace private and EU-jurisdictioned. Monitor the 1 GB free storage allowance and KV request quotas; KV is eventually consistent, so media read-after-write behaviour must remain covered by acceptance tests.

The 24 November release attempt passed roster preflight. The first Cloudflare API request for `wrangler d1 migrations apply` on the isolated schema-49 rehearsal database was rejected with error 7500 because the account-wide free-tier daily row-write quota was exhausted. No migration was applied to the scratch database; the workflow cleaned it up. Production D1 received zero writes and was not modified. Scheduled follow-up reminders are now implemented on main as a release candidate, but are not operational in production until authenticated D1 acceptance and the guarded deployment pass. SMS remains disabled.

A preview build or anonymous health response alone is not production readiness. The current source of truth is [cloudflare/OPERATIONS_RUNBOOK.md](../cloudflare/OPERATIONS_RUNBOOK.md) and [PRODUCTION_CUTOVER_READINESS_2026-11-24.md](../docs/PRODUCTION_CUTOVER_READINESS_2026-11-24.md).
