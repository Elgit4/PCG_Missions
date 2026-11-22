# PCG Missions — Cloudflare Pages and Workers

Cloudflare Pages serves the PWA. A same-origin Pages Function gateway forwards all /api requests to the Cloudflare API Worker. Better Auth owns staff credentials and HttpOnly cookie sessions; Cloudflare D1 owns application data and authorization. The only planned Supabase runtime exception is private event-flyer object storage.

## Runtime architecture

- Browser → same-origin /api/auth/* → Better Auth on the Cloudflare Worker.
- Browser → same-origin /api/v1/* → Cloudflare Worker business API.
- Pages Function gateway forwards cookies, request bodies, branch context and idempotency keys to the Worker and returns its Set-Cookie headers.
- Worker → EU Cloudflare D1 for authentication, staff identity, six-role authorization, ministry records, audit, reports, announcements, events and follow-up.
- Worker → private Supabase Storage only for event-flyer upload and retrieval. Supabase Auth, Postgres and Edge Functions are not application dependencies.

## Pages project settings

| Setting | Value |
| --- | --- |
| Project | pcg-missions |
| Root directory | web |
| Build command | npm run build |
| Build output | dist |
| Node.js | 22 |

web/functions/api/_middleware.ts is the same-origin API gateway. web/public/_routes.json includes every /api/* route so authentication and business requests all pass through that gateway. SPA routes use the existing fallback.

## Runtime variables

For Preview, set PCG_MISSIONS_API_ORIGIN to https://pcg-missions-api-preview.pcg-missions-nonprod.workers.dev.

For Production, set PCG_MISSIONS_API_ORIGIN to the separately provisioned production Worker only after its D1 binding, secrets, health checks, authenticated acceptance and rollback checks pass.

The Worker requires BETTER_AUTH_SECRET (at least 32 random characters), BETTER_AUTH_URL and BETTER_AUTH_TRUSTED_ORIGINS (exact HTTPS origins), APP_ALLOWED_ORIGINS (exact Pages origin allowlist), and SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY solely for the existing private event-media bucket.

Never add the event-storage service key to Pages variables, browser build variables, source control or chat. Do not add Supabase URL or publishable keys to VITE_ variables. SMS remains disabled.

## Release checks

1. Run schema/security tests, Worker typecheck, Worker local Better Auth integration, frontend typecheck, unit tests and frontend production build.
2. Apply the forward-only D1 migration to the isolated EU preview database.
3. Import the matching existing Supabase bcrypt credential hashes into Better Auth D1 account rows through a secret-protected migration job. The job validates identity IDs and emails and never logs credentials or hashes.
4. Deploy only the preview Worker and verify schema 44, Better Auth session endpoint, anonymous API denial and exact-origin cookie gateway.
5. Verify staff login/session restoration/sign-out, all six roles, branch/team/assigned scopes, staff account lifecycle, reset approval, reports, events, calendar, announcements, prayer/care, notifications and public content against non-production fixtures.
6. Provision a separate production Worker and production-only D1 binding. Verify data reconciliation, foreign keys, monitoring, backup/restore and rollback before switching official Pages production.
7. Only after Cloudflare production is verified should Supabase Auth, Supabase Postgres/Edge Functions and Vercel application hosting be retired. Keep the private event-media storage bucket.

A preview build or anonymous health response alone is not production readiness.
