# CMI Follow-up Edge Functions

Backend runtime: Supabase Edge Functions (Deno/TypeScript).

## Current foundation

- `health-check`: minimal runtime liveness endpoint. It returns no project
  identifiers, secrets, database details or personal data.
- `_shared/http.ts`: shared JSON response envelope, request correlation ID,
  no-store cache policy, method handling and explicit-origin CORS handling.
- `_shared/http_test.ts`: unit tests for the shared HTTP boundary.

## Security defaults

- Supabase's default JWT verification remains enabled for functions. Do not
  disable it globally.
- CORS is not authentication or authorization. Every business endpoint must
  independently validate the caller and enforce the CMI capability and
  record-scope model.
- Configure `APP_ALLOWED_ORIGINS` as a comma-separated allowlist of exact
  trusted origins. Do not use `*`.
- Never expose secret/service-role keys to browser clients.
- Never return raw database errors, stack traces, secrets or sensitive pastoral
  narratives.
- All business functions must validate request shape, actor state, capability,
  branch/team/event/assignment scope and state transitions.
- Public visitor endpoints must be separate, narrowly scoped operations and must
  never grant anonymous directory access.

## Local development

Install the Supabase CLI and Deno, then use the commands documented in the
repository's backend implementation guide. Do not start the local database until
the CMI migration set is created and reviewed: legacy ChurchConnect migrations
have been archived outside the active migration path.

The current repository does not contain an approved CMI migration set or a
linked CMI Supabase project. Do not deploy this function or connect it to an
unrelated project as part of this foundation commit.
