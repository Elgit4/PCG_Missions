# PCG Missions frontend — Cloudflare Worker integration

The staff portal now uses the Cloudflare API Worker and Better Auth cookie sessions. The browser no longer requires Supabase project credentials or a Supabase access token.

## Request architecture

- Browser → same-origin `/api/auth/*` → Better Auth on the non-production Cloudflare Worker.
- Browser → same-origin `/api/v1/*` → Cloudflare Worker API.
- The Vercel API proxy and Cloudflare Pages Functions forward requests to the same Worker origin.
- Authentication is an HttpOnly cookie. The frontend does not read, persist or send bearer tokens.
- The Worker remains the authorization boundary. The selected branch is sent as `X-Branch-Id` and validated against active role assignments by the Worker.

## Preview hosting configuration

For a Vercel Preview deployment, set this **server-side runtime variable**:

- `PCG_MISSIONS_API_ORIGIN=https://pcg-missions-api-nonprod.pcg-missions-nonprod.workers.dev`

For Cloudflare Pages Preview, set the same variable under Pages → Settings → Environment variables. It is a Pages Function runtime variable, not a `VITE_` build variable.

For the Cloudflare Worker, configure:

- `BETTER_AUTH_SECRET`: a unique random secret of at least 32 characters, stored as a Worker secret.
- `BETTER_AUTH_TRUSTED_ORIGINS`: comma-separated exact origins for the Worker and the deployed frontend preview origin(s).
- `RESEND_API_KEY` and `EMAIL_FROM`: only after the sending domain has been verified and the provider credentials have been securely configured.

The current Worker configuration includes its own workers.dev origin and the stable Vercel branch alias `https://pcg-missions-git-migration-cloudflare-nonprod-completion-eltech.vercel.app`. The Vercel project has a branch-scoped Preview variable `PCG_MISSIONS_API_ORIGIN` pointing at the non-production Worker. Do not guess or use wildcard origins. Never commit secrets or put them in `VITE_` variables.

## Local development

1. Start the Worker locally from `cloudflare/` using Wrangler and a non-production/local D1 database.
2. Start the web client from `web/` using `npm run dev`.
3. Vite proxies `/api/*` to `http://127.0.0.1:8787` by default. Override with `CMI_DEV_API_ORIGIN` when needed.
4. Configure the local Worker trusted origins to include the exact Vite origin, normally `http://localhost:5173`.

Do not point local development at production D1.

## Automated checks

From `web/`:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`

The frontend CI workflow runs these checks for changes to the web client and the Cloudflare Worker.

## Current functional boundary

The initial frontend cutover includes Better Auth sign-in/session restoration/sign-out, Worker health checks, the staff-context projection, branch-scoped request headers, and route translation for the existing contacts, follow-up, reporting, event, calendar, announcement, content and pastoral API adapters.

The Worker does not yet expose every legacy frontend operation. In particular, team/service-area administration, the previous administrator-approved password-reset request lifecycle, forced temporary-password replacement, and some legacy staff-account screens need dedicated Worker handlers and matching integration tests. The adapter deliberately reports these gaps rather than silently sending requests back to Supabase.

## Acceptance sequence

1. Deploy only a Preview frontend and the non-production Worker.
2. Verify Worker health and the exact-origin cookie flow.
3. Sign in with a provisioned non-production staff identity and confirm the staff context.
4. Verify branch scoping and role/capability denials against at least two test branches and all six roles.
5. Exercise contacts, follow-up, reports, events, calendar, announcements, public content and pastoral-care flows.
6. Verify sign-out, expired/revoked sessions, invitation acceptance and recovery.
7. Reconcile test records and review logs before any production cutover.

Production Vercel, production Supabase, DNS and live staff data remain outside this preview integration.
