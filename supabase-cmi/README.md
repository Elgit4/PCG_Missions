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

## Approval and execution status

The SQL is committed as a reviewable development artifact. It has **not** been run against local PostgreSQL/Supabase or any hosted database. The schema is intentionally incomplete: contacts, tasks, restricted pastoral records, events, SMS and public content follow after reconciliation and security tests.

Do not link this workspace to a hosted project, push migrations, seed real data, or enable SMS without explicit approval and the required stakeholder/provider decisions.
