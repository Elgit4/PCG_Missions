# ChurchConnect — Supabase Database Implementation Guide

**Version:** 1.0  
**Date:** 7 November 2026  
**Status:** Implementation notes for database package v1  
**Repository:** `Elgit4/PCG_Missions`

## 1. Purpose and implementation status

This guide explains how to apply and verify the ChurchConnect database package in a **dedicated ChurchConnect Supabase project**. It covers the committed PostgreSQL schema, access policies, test suite, local development sequence and first-Administrator bootstrap.

The current database package is source-controlled, but it has **not been applied to a hosted ChurchConnect database**. No ChurchConnect Supabase project reference or database credentials have been configured in this repository. Do not link or apply these migrations to the unrelated SkillSprint project.

## 2. Repository files

| File | Purpose |
|---|---|
| `supabase/config.toml` | Local Supabase CLI configuration; the project ID is a local identifier, not a hosted project reference. |
| `supabase/migrations/20261107001200_churchconnect_core_schema.sql` | Core tables, two-role catalogue, permission catalogue, seed data, constraints, indexes and timestamp triggers. |
| `supabase/migrations/20261107001300_churchconnect_rls_and_audit.sql` | Least-privilege grants, RLS policies, authorization helpers, audit triggers and task-history capture. |
| `supabase/migrations/20261107170000_churchconnect_sensitive_access_and_history.sql` | Sensitive access grant hardening, re-issuable revocable grants, directory-read correction and complete integration-stage transition history. |
| `supabase/tests/churchconnect_rls.test.sql` | pgTAP schema, integrity and authorization regression tests. |
| `.github/workflows/churchconnect-db-tests.yml` | GitHub Actions workflow to start a local Supabase stack and run the database tests. |

Migrations are applied in timestamp order. Do not renumber or reorder a migration after it has been applied to an environment.

## 3. Database design safeguards

### 3.1 Roles and capabilities

The schema seeds exactly two system roles:

- `ADMIN` — Church Administrator
- `MISSION_MEMBER` — Mission Member

The database constraint rejects other role codes. Ministry duties do not create additional roles.

The permission catalogue includes explicit capabilities such as:

- `VISITOR_REGISTER`
- `ATTENDANCE_RECORD`
- `VISITOR_DIRECTORY_VIEW`
- `SMS_SEND`
- `CONSENT_MANAGE`
- `INTEGRATION_RECORD`
- `PASTORAL_VIEW`
- `PASTORAL_RECORD`
- `REPORT_EXPORT`

**Important access distinction:** `VISITOR_REGISTER` and `ATTENDANCE_RECORD` do not grant permission to browse the entire visitor directory. A member who needs directory search must receive `VISITOR_DIRECTORY_VIEW` explicitly. Without it, a member can work with assigned/shared visitors and can retain limited access to a visitor they registered while that profile remains unassigned.

### 3.2 Sensitive pastoral records

Reading a prayer request or faith-commitment event requires both:

1. the `PASTORAL_VIEW` capability; and
2. a current, record-specific access grant.

Creating restricted pastoral information requires `PASTORAL_RECORD` and visitor-record access. The creator receives an initial record-specific grant automatically. Additional users must be granted access through a trusted administrative operation.

Administrators may receive explicitly designated sensitive capabilities, but cannot receive ordinary Mission Member capabilities. Access grants are historical: revoking a grant preserves its record, and a later re-grant creates a new active grant rather than overwriting the old one.

### 3.3 RLS and database privileges

- Anonymous browser access is not granted to application tables.
- RLS is enabled on every application table in the exposed `public` schema.
- Authenticated table privileges are granted narrowly and paired with table-specific policies.
- Authorization uses the application profile and explicit permission grants; editable user metadata is not an authorization source.
- Helper functions live in the unexposed `private` schema, use a pinned empty search path and schema-qualified references, and receive restricted execution privileges.
- The frontend must not use a Supabase service-role/secret key. Privileged account provisioning, assignment handover, workflow scheduling, SMS submission/callbacks and sensitive access grants must be executed by trusted server-side code.
- No ordinary client DELETE policies are provided. Historical records are ended, cancelled, revoked or archived.

### 3.4 History and relational integrity

- One visitor may have many attendance, consent, task, interaction and integration events.
- A partial unique index permits only one active primary assignment per visitor.
- Composite foreign keys ensure a task, interaction, workflow instance or SMS reference belongs to the same visitor as its parent record.
- Follow-up task creation, rescheduling, status changes, cancellation and reassignment append events to `follow_up_task_history`.
- Integration-stage history records both the previous and resulting stages. Clearing the current stage is retained as a transition to no stage.
- SMS provider callbacks are append-only and idempotently processed; delivery is not proof of reading or response.

## 4. Local development and verification

### Prerequisites

Install Docker Desktop and the [Supabase CLI](https://supabase.com/docs/guides/cli). The local stack runs in Docker; it does not require a hosted ChurchConnect project.

### Start and inspect the local stack

From the repository root:

```bash
supabase start
supabase status
```

The CLI starts the local Supabase services and applies the repository migrations. If the local database has already been initialized and needs a clean rebuild, use `supabase db reset` only when you intend to recreate the local database and reapply all committed migrations.

### Run the pgTAP regression suite

```bash
supabase test db
```

The current test file declares **35 assertions** covering, among other things:

- exactly two roles and RLS enabled across all public application tables;
- no anonymous table access and no client-side permission-grant writes;
- assigned-visitor isolation and explicit directory-search permission;
- attendance restrictions against unrelated visitors;
- sensitive pastoral access requiring both capability and record grant;
- administrator access to restricted records only after explicit authorization;
- assignment handover and retained-task access boundaries;
- task-history creation/rescheduling;
- stage-history creation and clearing;
- prevention of multiple active primary assignments.

The test fixtures use synthetic identities and data and roll back. They are not live church records.

### Stop the local stack

```bash
supabase stop
```

## 5. GitHub Actions verification

The workflow `.github/workflows/churchconnect-db-tests.yml` runs on pushes to `main`, pull requests targeting `main` and manual workflow dispatch when database files or the workflow itself change.

It installs the Supabase CLI, starts a local Supabase stack, runs `supabase test db` and stops the stack. It uses no hosted database credentials and does not deploy or mutate any Supabase project.

After pushing the workflow, check **GitHub → Actions → ChurchConnect database tests**. A successful workflow run is the first automated verification that the migrations apply and the pgTAP suite passes in the CI Supabase environment.

## 6. First Administrator bootstrap

The core migration seeds the two role definitions and permission catalogue; it does **not** create a church user or password.

For a fresh, dedicated ChurchConnect project:

1. Create the project and configure its Auth provider and approved login method.
2. Create/invite the designated first Administrator through Supabase Auth using a secure administrator-controlled process.
3. In the Supabase SQL Editor for that dedicated project, create the application profile for that Auth identity. Replace the example name and email with the approved values:

```sql
insert into public.user_profiles (
  user_id,
  role_code,
  full_name,
  account_status
)
select
  id,
  'ADMIN',
  'Church Administrator',
  'ACTIVE'
from auth.users
where lower(email) = lower('ADMIN_EMAIL_TO_REPLACE')
on conflict (user_id) do nothing;
```

4. Confirm exactly one profile was created for the intended Auth identity. Add its contact details if required.
5. Keep the first Administrator's credential under the Auth provider's secure credential process. Never store a plaintext password in ChurchConnect tables or repository files.

Subsequent Mission Member accounts must be provisioned by a trusted server-side operation using Supabase Auth Admin APIs and corresponding profile creation. Do not enable public team self-registration and do not place a service-role/secret key in React or browser environment variables.

## 7. Hosted deployment gate

Do **not** run `supabase link` or `supabase db push` until the church has selected and created a dedicated ChurchConnect Supabase project, confirmed the owner/organization and reviewed the schema and security policies.

When the dedicated hosted project is ready:

1. Link the local repository to the ChurchConnect project reference.
2. Confirm the linked project name and reference before any write operation.
3. Compare the remote migration history with the committed migration sequence.
4. Apply migrations to a staging/test project first.
5. Run database tests and security review in that environment.
6. Only after stakeholder approval should migrations be deployed to the production ChurchConnect project.

The CI workflow in this repository is intentionally test-only. It does not deploy migrations to production.

## 8. Current verification boundary

The migrations, RLS policies and pgTAP tests are committed to GitHub. They have been reviewed statically and cross-checked for the intended policy/test coverage. They have **not yet been executed against a local Docker Supabase stack or a dedicated hosted ChurchConnect database in this work session**, so the database package must still be treated as a draft until the GitHub Actions run or a local `supabase test db` run passes.

Relevant Supabase documentation:

- [Local development and CLI](https://supabase.com/docs/guides/cli)
- [Database testing with pgTAP](https://supabase.com/docs/guides/database/testing)
- [Testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Managing environments and CI](https://supabase.com/docs/guides/deployment/managing-environments)
