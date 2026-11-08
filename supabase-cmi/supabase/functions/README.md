# CMI Edge Functions

All functions in this directory are server-side application boundaries. Never place Supabase service-role keys, provider credentials or signing secrets in the PWA.

## public-content

Read-only public projection for published content. Supported query examples:

- `?resource=church-profile`
- `?resource=sermons&limit=20&offset=0`
- `?resource=sermons&slug=hope-in-christ`
- `?resource=daily-words`
- `?resource=tracts`
- `?resource=welcome-messages`
- `?resource=announcements`
- `?resource=events`

The function selects explicit public columns, applies publication/visibility filters on the server, bounds pagination, rejects unknown resources and query parameters, permits GET/OPTIONS only, and returns generic errors. Welcome messages are limited to church-wide rows (`branch_id IS NULL`) until a branch-public identity/routing decision exists. Public event responses omit capacity. It never accepts arbitrary table names, column lists, filters, sort expressions, IDs for private records or write operations.

### Required server environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side secret only; never expose to the browser.
- `PUBLIC_CONTENT_ALLOWED_ORIGINS` — comma-separated exact HTTPS origins for the deployed public PWA. Do not use wildcard origins in production.

The function fails closed if server credentials are absent. Supabase service-role access bypasses RLS; therefore this function is intentionally a narrow, fixed-query projection. Changes to selected columns, tables or filters require security review and tests. Do not reuse this client or helper for staff APIs.

### Deployment gates

- Set exact production PWA origins before enabling browser access.
- Configure platform-level rate limiting / abuse protection and caching. CORS is not an authorization or rate-limit mechanism.
- Review public fields for consent and privacy before publication.
- Deploy only after the database schema has been promoted through its approved migration path.
- Do not deploy against the hosted CMI project until explicit deployment approval is given.
