# CMI Follow-up backend workspace

This directory is the isolated Supabase CLI project root for the CMI Follow-up v2.1 backend. The CLI configuration and executable files live under `supabase-cmi/supabase/`.

## Critical migration boundary

The repository's top-level `supabase/` directory contains historical ChurchConnect migrations and tests for a two-role product. They are **not** the CMI schema. Never run CMI CLI commands against that directory.

Use this workspace explicitly:

```bash
supabase --workdir supabase-cmi --help
supabase --workdir supabase-cmi start
supabase --workdir supabase-cmi status
supabase --workdir supabase-cmi db reset
supabase --workdir supabase-cmi test db
```

Supabase CLI v3 is local-first. Do not add `--remote`, hosted credentials or `--yes` for a hosted mutation without explicit approval.

## Current source layout

- `supabase/migrations/`: permanent CMI identity/authorization foundation migration only.
- `supabase/tests/`: foundation pgTAP suite.
- `schema-drafts/`: reviewable domain SQL and pgTAP drafts, not yet permanent migration history.

### Domain drafts

1. `contacts_followup_domain.sql` and matching test.
2. `restricted_pastoral_domain.sql` and matching test.
3. `events_attendance_public_content.sql` and matching test.

The third slice covers event lifecycle, typed event staff/team assignments, registration, transport, check-in, closeout, typed calendar scope, typed announcement audiences, church public profile, welcome messages, sermons, daily word, digital tracts and typed external document links.

All domain drafts preserve branch-consistent foreign keys, RLS and closed browser grants. No client policies or role-capability grants are created while stakeholder approvals remain pending. The event draft removes the unapproved waitlist state, requires idempotency for public registrations and check-ins, and avoids polymorphic scope/audience/content references.

## Validation

The first three suites passed in [GitHub Actions run 42436473154](https://github.com/Elgit4/PCG_Missions/actions/runs/42436473154): 14 + 24 + 20 = 58 assertions. The events/attendance/public-content draft is included in the isolated local CI workflow with an expanded 46-assertion suite. The original 36 assertions passed in [run 42437731467](https://github.com/Elgit4/PCG_Missions/actions/runs/42437731467); the expanded 46 assertions and the full 104-assertion workflow passed in [run 42439419503](https://github.com/Elgit4/PCG_Missions/actions/runs/42439419503).

CI generates temporary migration filenames using `supabase migration new`, copies the drafts into the isolated CLI project, applies them locally, runs pgTAP, then removes the temporary files. Draft SQL is not yet promoted to permanent migrations.

## Edge Functions

The first server-side function draft is `supabase/functions/public-content/`. It provides fixed read-only projections for published sermons, daily words, tracts, welcome messages, public announcements, public events and the church public profile. It does not grant anonymous access to the underlying tables. See [Edge Function security and deployment rules](supabase/functions/README.md).

Run its input-validation tests with:

```bash
deno test supabase-cmi/supabase/functions/public-content/validation_test.ts
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and exact `PUBLIC_CONTENT_ALLOWED_ORIGINS` only in the Edge Function's server environment. The service-role key bypasses RLS; the function's fixed query allowlist is therefore security-critical. It exposes only church-wide welcome messages and omits event capacity from public event responses. Do not reuse it for staff operations. Platform rate limiting and production origin configuration are required before deployment. Deno type-check and request-validation tests passed in [run 42438088374](https://github.com/Elgit4/PCG_Missions/actions/runs/42438088374) and again on the latest head. Seven pgTAP assertions verify that every fixed API projection/filter/order column exists in the schema. The expanded 46-assertion domain suite and all 104 database assertions passed in [run 42439419503](https://github.com/Elgit4/PCG_Missions/actions/runs/42439419503). This function is not deployed.

## Security and approval gates

- Auth credentials stay in Supabase Auth; no PIN/password columns.
- Role-capability grants and full role/scope RLS wait for R-01–R-12 and D-01 approvals.
- Prayer/care narratives remain unavailable through direct browser reads; trusted audited-read endpoints are not yet implemented.
- Public registration and public content require narrow server-mediated projections; no base-table public grants.
- Registration snapshot retention, walk-in identity, event waitlist, transport pickup model and data retention remain decision-gated.
- SMS uses one future canonical outbox/campaign state machine; announcement delivery must not duplicate SMS lifecycle state.
- No hosted Supabase project has been linked or modified.

See `IMPLEMENTATION_STATUS.md` and `../docs/16_CMI_SCHEMA_RECONCILIATION_AND_DECISION_CROSSWALK.md` for detailed status and design gates.


The event schema's attendee and public-profile phone constraints now use the correct single-plus E.164 expression. Tests verify a valid +233 value, reject a number without the international plus and reject a literal backslash prefix. The latest head passed all four suites (104 pgTAP assertions) in [run 42439419503](https://github.com/Elgit4/PCG_Missions/actions/runs/42439419503).
