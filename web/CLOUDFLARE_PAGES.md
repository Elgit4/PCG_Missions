# Deploy PCG Missions to Cloudflare Pages

The web client is a Vite application and the repository includes a Cloudflare Pages Function for the same-origin authentication proxy. Keep the existing Supabase project, database, Edge Functions, and access policies; this deployment changes only the frontend hosting layer.

## Cloudflare Pages project

Connect the GitHub repository `Elgit4/PCG_Missions` and use:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `web` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `22` (from `.node-version`) |

The `web/wrangler.toml` file declares the Pages project name, compatibility date, and build output directory. The `web/functions/api/auth.ts` file is deployed automatically as the `/api/auth` Pages Function. The `web/public/_redirects` file provides a single-page-app fallback for React routes.

## Environment variables

Set the following **build-time** variables in Cloudflare Pages → Settings → Environment variables, for both Production and Preview as appropriate:

- `VITE_SUPABASE_URL`: the existing Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the Supabase publishable key (or legacy anon key if that is what the project currently uses).

Also set these **Pages Function runtime** variables for Production and Preview:

- `SUPABASE_URL`: the same Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: the same Supabase publishable key.

The function accepts the `VITE_` names as a fallback, but using the unprefixed runtime names keeps server-side configuration separate from the browser build. These are public project connection values, not service-role credentials.

**Never add** a Supabase service-role key, database password, SMS provider secret, webhook secret, or HMAC secret to a `VITE_` variable. Do not commit real environment values to Git.

## Supabase and application checks

Before switching the production domain:

1. Deploy a Preview or `pages.dev` build and confirm the build completes.
2. Open `/api/auth?health=1`. It should return HTTP 200 and `ok: true` when the runtime variables are correct and Supabase Auth is reachable.
3. Test sign-in, session restoration/refresh, sign-out, staff-session loading, and password-reset request flows.
4. Open a nested React route directly and refresh it; it should return the application rather than a host-level 404.
5. Verify the browser console and Network panel for failed API calls, CORS errors, or missing assets.
6. Check Supabase Auth URL configuration and add the final Pages/custom domain to the allowed redirect URLs if the app's configured email flows require it.

Only after these checks pass should the custom production domain be attached to Cloudflare Pages and its DNS changed. Keep the existing Vercel deployment available until the Cloudflare deployment is verified.

## Important runtime boundary

The `/api/auth` Pages Function is a compatibility replacement for the existing Vercel auth proxy. Other application operations continue to call the existing Supabase Edge Functions directly. SMS provider configuration remains external and is not changed by this hosting migration.
