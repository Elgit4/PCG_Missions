# PCG Missions — Cloudflare Pages production

The Cloudflare Pages production project is `pcg-missions`.

- Production URL: https://pcg-missions.pages.dev
- GitHub repository: `Elgit4/PCG_Missions`
- Production branch: `feat/cmi-pcg-missions-final-review-v6`
- Root directory: `web`
- Build command: `npm run build`
- Build output directory: `dist`
- Backend: existing Supabase project (`eu-west-1`); Supabase remains the application backend.

The previous Pages project `pcg-missions-nonprod` is retained as a rollback reference. Do not delete it until the new production deployment and authenticated application flows have been verified.

Do not commit credentials, API keys, tokens, or other secrets to this repository. Configure runtime values through the Cloudflare Pages environment settings.
