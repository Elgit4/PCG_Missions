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
- `schema-drafts/`: reviewable domain SQL and pgTAP drafts, not yet permanent migration history. The capability catalogue/contact-capture transaction is also validated from this workspace.

### Domain drafts

1. `contacts_followup_domain.sql` and matching test.
2. `restricted_pastoral_domain.sql` and matching test.
3. `events_attendance_public_content.sql` and matching test.
4. `backend_capability_catalogue.sql` and matching security test; it seeds capability metadata only and does not create role grants.

The third slice covers event lifecycle, typed event staff/team assignments, registration, transport, check-in, closeout, typed calendar scope, typed announcement audiences, church public profile, welcome messages, sermons, daily word, digital tracts and typed external document links.

All domain drafts preserve branch-consistent foreign keys, RLS and closed browser grants. No client policies or role-capability grants are created while stakeholder approvals remain pending. The event draft removes the unapproved waitlist state, requires idempotency for public registrations and check-ins, and avoids polymorphic scope/audience/content references.

## Validation

The first three suites passed in [GitHub Actions run 42436473154](https://github.com/Elgit4/PCG_Missions/actions/runs/42436473154): 14 + 24 + 20 = 58 assertions. The events/attendance/public-content draft is included in the isolated local CI workflow with an expanded 46-assertion suite. The original 36 assertions passed in [run 42437731467](https://github.com/Elgit4/PCG_Missions/actions/runs/42437731467); the expanded 46 assertions and the full 104-assertion workflow passed in [run 42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140).

CI generates temporary migration filenames using `supabase migration new`, copies the drafts into the isolated CLI project, applies them locally, runs pgTAP, then removes the temporary files. Draft SQL is not yet promoted to permanent migrations.

## Edge Functions

The first server-side function draft is `supabase/functions/public-content/`. It provides fixed read-only projections for published sermons, daily words, tracts, welcome messages, public announcements, public events and the church public profile. It does not grant anonymous access to the underlying tables. See [Edge Function security and deployment rules](supabase/functions/README.md).

Run its input-validation tests with:

```bash
deno test supabase-cmi/supabase/functions/public-content/validation_test.ts
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and exact `PUBLIC_CONTENT_ALLOWED_ORIGINS` only in the Edge Function's server environment. The service-role key bypasses RLS; the function's fixed query allowlist is therefore security-critical. It exposes only church-wide welcome messages and omits event capacity from public event responses. Do not reuse it for staff operations. Platform rate limiting and production origin configuration are required before deployment. At the PR #5 milestone, Deno type-check and request-validation tests passed in [run 42438088374](https://github.com/Elgit4/PCG_Missions/actions/runs/42438088374) and the expanded event/public-content suite contributed to 104 database assertions in [run 42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140). Those are historical validation checkpoints; the later PR #8 exact-head run [42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750) passed the current 129-assertion total and current Deno checks. This function is not deployed.

## Staff API groundwork (review branch)

The `feat/cmi-staff-session-api` branch adds an initial server API for frontend integration:
- `staff-session`: validates a Supabase Auth access token, checks the active staff profile and returns branch, role and approved capability projections.
- `staff-operations`: scoped contact list/detail, idempotent contact capture and ordinary-field update endpoints.
- Capability definitions are seeded as metadata only. `role_capability` remains empty until R-01–R-12 and D-01 are approved.
- Phone/email capture, read and update use separate identity capabilities. Without the appropriate grant, identity fields are not returned.
- Team-scoped capture requires active team membership. Assigned-only capture creates an assignment to the capturing staff member in the same transaction.

See [the Staff API Contract](../docs/19_CMI_STAFF_API_CONTRACT.md). These functions and the capability/contact transaction are source-only in this review branch and have not been deployed.

## Security and approval gates

- Auth credentials stay in Supabase Auth; no PIN/password columns.
- Role-capability grants and full role/scope RLS wait for R-01–R-12 and D-01 approvals.
- Prayer/care narratives remain unavailable through direct browser reads; trusted audited-read endpoints are not yet implemented.
- Public registration and public content require narrow server-mediated projections; no base-table public grants.
- Registration snapshot retention, walk-in identity, event waitlist, transport pickup model and data retention remain decision-gated.
- SMS uses one future canonical outbox/campaign state machine; announcement delivery must not duplicate SMS lifecycle state.
- No hosted Supabase project has been linked or modified.

See `IMPLEMENTATION_STATUS.md` and `../docs/16_CMI_SCHEMA_RECONCILIATION_AND_DECISION_CROSSWALK.md` for detailed status and design gates.


The event schema's attendee and public-profile phone constraints use the correct single-plus E.164 expression. Tests verify a valid +233 value, reject a number without the international plus and reject a literal backslash prefix. The 104-assertion run [42439672140](https://github.com/Elgit4/PCG_Missions/actions/runs/42439672140) is an earlier PR #5 checkpoint; it was superseded by the PR #8 exact-head validation of 129 assertions in [run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750).


## Event integrity test status

At the PR #7 milestone, the event-domain suite contained **53 pgTAP assertions**, including registration/contact identity consistency on check-in and append-only closeout history protections. The latest PR #7 head passed all four database suites (**112 assertions total**) plus Deno checks in [run 42448742945](https://github.com/Elgit4/PCG_Missions/actions/runs/42448742945). PR #8 subsequently expanded the event/idempotency suite to 71 assertions. These changes are source-control only; they are not deployed and no hosted project was changed.


## Event idempotency ledger

The event schema draft includes a private HMAC-backed idempotency receipt ledger. Keys are scoped by event, branch, operation, caller class and (for staff) trusted actor. Receipts store only a versioned digest and resource reference, not request PII. The helper's canonical JSON serializer rejects unsafe/accessor-backed object structures and sorts Unicode-normalized keys deterministically. The reconciled migration and test suite also verify the event integrity trigger functions cannot be invoked by browser roles. PR #8 is merged to `main` as commit [d091a894](https://github.com/Elgit4/PCG_Missions/commit/d091a89404165d11e96949b5aa7d35a646a89db8); its exact head passed [CI run 42449272750](https://github.com/Elgit4/PCG_Missions/actions/runs/42449272750), including 129 database assertions across four suites and the Deno idempotency helper tests. This is not an active transaction endpoint or production feature.


## Current source-control status (2026-11-09)

Backend PRs #3–#9 are merged to `main`. PR #10 (`feat/cmi-staff-session-api`) remains open and in draft review; it has not been merged.

The functional/security code head `5697b4f3c051da8c127941082205706eb62e1537` passed [CI run 42579507429](https://github.com/Elgit4/PCG_Missions/actions/runs/42579507429). That run completed CMI Edge Function formatting, linting, type-checking and Deno unit tests, then applied the domain drafts and capability/contact transaction through temporary CLI-generated migrations on the disposable local CMI stack. All five pgTAP files passed: **148 assertions, zero failures**. The RPC was executed as `service_role` using `SECURITY INVOKER`.

Six later documentation and SQL-comment commits advanced PR #10 to `9dd081145d5b1ee25a2c48b6c90cee359f0a3094` without changing executable SQL or Edge Function logic. CI run [42580225147](https://github.com/Elgit4/PCG_Missions/actions/runs/42580225147) stopped before project checks because the Deno release download returned HTTP 504 at setup. No workflow rerun was requested.

No `role_capability` rows are seeded; business access remains denied until R-01–R-12 and D-01 are approved. No hosted CMI project has been linked, queried, migrated or modified; no Edge Function has been deployed and no SMS has been sent.
