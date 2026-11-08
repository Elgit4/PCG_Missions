# CMI Follow-up backend workspace

This directory is the isolated Supabase CLI workspace for the CMI Follow-up v2.1 backend.

## Critical migration boundary

The repository's top-level `supabase/` directory contains historical ChurchConnect migrations and tests for a two-role product. They are **not** the CMI schema. Do not run Supabase CLI commands against that directory for CMI work.

Use this workspace explicitly, for example:

```bash
supabase --workdir supabase-cmi start
supabase --workdir supabase-cmi status
supabase --workdir supabase-cmi db reset
supabase --workdir supabase-cmi test db
```

Check the installed CLI's `--help` output before relying on command flags. The workspace has a distinct local project ID and non-conflicting ports. It is not linked to a hosted project.

## Current implementation

- `migrations/20261108010000_cmi_identity_authorization_foundation.sql`: first CMI-only foundation migration (church/branch, staff profile link, six-role catalogue, capability catalogue, role assignment and team/area structures).
- `tests/identity_authorization_foundation.test.sql`: pgTAP structural and deny-by-default checks.
- No role-capability grants are seeded. The stakeholder matrix remains pending.
- No anonymous or authenticated table grants/policies are created in this first slice. Browser access is deny-by-default until reviewed policies and trusted API operations are implemented.
- No PIN, password, provider secret or personal data is stored by the schema.

## Contacts and follow-up domain draft

The next domain slice is authored under `schema-drafts/` and is intentionally **not** in the executable migrations or test folders yet:

- `schema-drafts/contacts_followup_domain.sql`
- `schema-drafts/contacts_followup_domain.test.sql`
- `schema-drafts/restricted_pastoral_domain.sql`
- `schema-drafts/restricted_pastoral_domain.test.sql`

It defines contacts, capture provenance/idempotency, individual-or-team assignment, ordinary notes, interactions, merge history, follow-up lists/tasks and append-only task events. The restricted-pastoral draft adds prayer/care records, assignment lifecycles and separate append-only narrative-read audit tables for prayer and care. The SQL keeps RLS enabled and browser grants withheld. Event references on capture/list are deferred until the event tables exist.

Before promotion, use the Supabase CLI to create the migration filename, then move the reviewed SQL into that generated file and move the pgTAP suite into `tests/`. The CLI was not available in the authoring runtime, so this draft has not been CLI-generated, parsed or executed.

## CLI safety

Supabase CLI v3 is local-first: database commands target the local stack unless `--remote` is explicitly supplied, and hosted mutations require explicit confirmation (or `--yes` in non-interactive workflows). Never add `--remote` or `--yes` for this project without an approved deployment request. See the [Supabase CLI v3 breaking-change notice](https://supabase.com/changelog/supabase-cli-v3).

## Approval and execution status

The SQL is committed as a reviewable development artifact. It has **not** been run against local PostgreSQL/Supabase or any hosted database. The schema is intentionally incomplete: contacts, tasks, restricted pastoral records, events, SMS and public content follow after reconciliation and security tests.

Do not link this workspace to a hosted project, push migrations, seed real data, or enable SMS without explicit approval and the required stakeholder/provider decisions.
