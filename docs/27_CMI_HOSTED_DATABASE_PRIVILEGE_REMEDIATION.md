# Hosted public-schema privilege remediation runbook

**Review date:** 2026-11-10  
**Project:** CMI Follow-up v2.1  
**Status:** Application migration hardening is implemented in source; one hosted platform-owner default-ACL action remains outstanding.

## Why this runbook exists

A read-only PostgreSQL catalogue audit of the hosted Supabase project found broad default privileges for objects created by both `postgres` and `supabase_admin` in the `public` schema:

- future tables received broad DML/DDL-related privileges for `anon`, `authenticated` and `service_role`;
- future sequences received `USAGE`, `SELECT` and `UPDATE`;
- future functions received `EXECUTE`, including the default `PUBLIC EXECUTE` privilege.

The audit also found the hosted `public.rls_auto_enable()` SECURITY DEFINER helper, owned by `postgres`, with direct `EXECUTE` granted to `PUBLIC`, `anon`, `authenticated` and `service_role`. It is attached to the enabled `ensure_rls` DDL event trigger. The hosted project had no CMI application tables or applied CMI migrations at the time of review, so this was a latent privilege-escalation/exposure risk for future objects, not evidence that current CMI records had been read.

## Source remediation now in the CMI foundation migration

The foundation migration in `supabase-cmi/supabase/migrations/20261108010000_cmi_identity_authorization_foundation.sql` now:

1. Revokes `USAGE` on schema `public` from `PUBLIC`, `anon` and `authenticated`.
2. Explicitly retains `USAGE` for `service_role`, which is used by trusted Edge Functions.
3. Revokes future table and sequence grants for objects created by `postgres` in `public`.
4. Revokes schema-specific future function grants for `postgres` in `public`.
5. Removes PostgreSQL's global default `PUBLIC EXECUTE` grant for future functions created by `postgres`. This global revoke is required because schema-specific default ACLs cannot subtract the built-in global default grant.
6. Conditionally revokes direct SQL/API execution on `public.rls_auto_enable()` when that hosted helper exists. The event trigger itself is not disabled or dropped.
7. Explicitly enables RLS on each of the eleven foundation tables. The migration no longer relies on the hosted event trigger to enable RLS; it therefore remains safe and testable on an isolated local Supabase stack that does not have the hosted helper.

The migration does not seed role-capability grants or grant direct browser access to CMI tables. Trusted backend permissions remain separately scoped and reviewed.

The pgTAP foundation suite tests schema usage, new table/sequence/function default privileges, helper execution restrictions (when present), and RLS on all foundation tables. The domain suites test time-range exclusion constraints and branch integrity.

## Remaining hosted platform-owner action

The hosted audit found a second set of default privileges owned by `supabase_admin`. The current SQL session reports:

- `current_user = postgres`;
- `supabase_admin` is a superuser/platform role;
- `postgres` is not a member of `supabase_admin`.

The normal project SQL session therefore cannot safely alter defaults owned by `supabase_admin`. Do not try `SET ROLE supabase_admin`, do not place platform credentials in the repository, and do not weaken the ownership check.

An authorized Supabase platform maintenance context with the necessary role-owner/superuser authority must review and execute the equivalent statements for the `supabase_admin` owner:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
```

These statements are a review/runbook proposal only. They have **not** been executed. Confirm Supabase's current managed-object ownership and dependencies with the platform owner before applying them. Do not modify default privileges for other schemas such as `auth`, `storage`, `extensions`, `graphql` or `graphql_public` as part of this focused `public`-schema remediation.

## Post-maintenance verification

Run catalogue queries in an authorized read-only session after the platform-owner action:

```sql
-- Inspect all default ACLs. No anon/authenticated/service_role entry should
-- remain for public-schema tables, sequences or functions owned by either
-- application or platform object creators.
SELECT
  pg_get_userbyid(d.defaclrole) AS grantor,
  CASE WHEN d.defaclnamespace = 0 THEN '<all schemas>'
       ELSE n.nspname END AS schema_name,
  d.defaclobjtype AS object_type,
  d.defaclacl
FROM pg_default_acl AS d
LEFT JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' OR d.defaclnamespace = 0
ORDER BY grantor, schema_name, object_type;

-- Browser roles must not have public schema USAGE; trusted Edge Functions
-- retain it.
SELECT
  has_schema_privilege('anon', 'public', 'USAGE') AS anon_usage,
  has_schema_privilege('authenticated', 'public', 'USAGE') AS authenticated_usage,
  has_schema_privilege('service_role', 'public', 'USAGE') AS service_role_usage;

-- Inspect direct helper grants without dropping or disabling the event trigger.
SELECT
  p.proname,
  pg_get_userbyid(p.proowner) AS owner,
  p.proacl
FROM pg_proc AS p
WHERE p.oid = to_regprocedure('public.rls_auto_enable()');

SELECT evtname, evtenabled, evtevent
FROM pg_event_trigger
WHERE evtname = 'ensure_rls';
```

Then verify:
- no `anon` or `authenticated` schema usage on `public`;
- `service_role` still has schema usage required by deployed Edge Functions;
- no broad default grants to browser or service roles for new public tables, sequences or functions from either owner;
- any remaining helper direct execute grant is absent, while the `ensure_rls` event trigger remains enabled;
- every CMI application table has RLS enabled and no unapproved policies or browser grants;
- all backend and database CI checks pass against the exact release commit.

## Deployment boundary

This runbook does not authorize production deployment. The hosted project must remain unchanged until:

1. stakeholder decisions and the role/capability matrix are approved;
2. reviewed schema drafts are promoted into a properly ordered permanent migration history;
3. the platform-owner privilege action is completed and independently verified;
4. the migration and Edge Function deployment plan is reviewed and approved;
5. initial church/branch/staff provisioning and explicit grants are performed through a trusted administrative process;
6. staging security and end-to-end tests pass.

The source migration and local CI are not proof that hosted default privileges have been changed. Record the platform action, operator, timestamp and verification evidence before closing this item.
