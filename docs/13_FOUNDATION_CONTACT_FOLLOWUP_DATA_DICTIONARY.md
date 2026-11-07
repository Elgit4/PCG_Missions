# CMI Follow-up — Foundation, Contacts & Follow-up Data Dictionary

**Version:** 0.1  
**Baseline:** CMI Follow-up v2.1  
**Status:** Typed design proposal for review — not executable SQL and not applied to Supabase  
**Depends on:** [Logical Data Model](06_CMI_LOGICAL_DATA_MODEL_PROPOSAL.md), [Physical Schema Proposal](08_CMI_PHYSICAL_DATABASE_SCHEMA_PROPOSAL.md), [ERD-to-Physical Traceability](10_ERD_TO_PHYSICAL_SCHEMA_TRACEABILITY.md), [Stakeholder Decision Register](11_CMI_STAKEHOLDER_DECISION_REGISTER.md)

## 1. Purpose and scope

This document takes the first physical-schema slice from conceptual column lists to a typed PostgreSQL data dictionary. It covers:

- Church/branch configuration and settings.
- Staff identity, roles, capabilities and organizational scope.
- Contacts, capture provenance, assignments, ordinary notes, interactions and merge history.
- Follow-up lists, tasks and append-only task events.

It is a design contract for review, not SQL. Type choices, nullability, names and constraints remain proposed until the ERD and stakeholder decisions are approved. It does not create migration files, database objects, grants or RLS policies.

The next data-dictionary slices should cover restricted prayer/care, events/registration/attendance, public content/calendar, SMS, reports/audit and limited offline synchronization.

## 2. Shared conventions

| Convention | Proposal |
|---|---|
| Primary key | `uuid NOT NULL DEFAULT gen_random_uuid()`, unless a natural/composite key is explicitly shown |
| Timestamps | `timestamptz NOT NULL DEFAULT now()`; store instants in UTC |
| Calendar dates | `date` only for date-based business meaning |
| Boolean | `boolean NOT NULL DEFAULT false/true` where the default is unambiguous |
| Human text | `text`; apply length/format validation in trusted server logic and reasonable DB checks where stable |
| Email | normalized lowercase `text` with unique index, or `citext` after explicitly enabling the extension |
| Phone | `text` in E.164 form; nullable unless required by the workflow; validate in trusted server logic |
| Audit actors | UUID references to `staff_profile.user_id`; actor may be nullable only for system/public intake and must retain provenance |
| Deletion | RESTRICT for business history; no cascading deletion of contacts or staff with operational history |
| Branch consistency | use composite unique keys and composite foreign keys for branch-owned parent/child relationships |
| Status | constrained text with documented state transitions; do not accept arbitrary client-supplied values |
| RLS | enable on every exposed table; this dictionary does not itself grant access |

**Staff identity:** Supabase Auth remains the credential/session authority. `staff_profile.user_id` references `auth.users(id)`. Never store PINs, password hashes or recovery secrets in application tables.

**Branch model:** this is one configured church instance. Branch IDs are operational scope, not a tenant/network architecture. If leadership confirms a single branch permanently, retaining the branch key still supports a consistent scope predicate without introducing multi-church tenancy.

## 3. Church and branch foundation

### 3.1 `church`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Church instance identifier |
| `name` | `text` | No | — | Official church display name |
| `timezone` | `text` | No | — | Valid IANA timezone name |
| `is_configured_instance` | `boolean` | No | DEFAULT true | Must remain true; unique partial/constant index permits at most one configured instance |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Updated by trusted trigger/service |

**Constraints:** CHECK `is_configured_instance`; unique index on `is_configured_instance` (with all rows constrained true) permits at most one row. A controlled bootstrap transaction must ensure exactly one configured row exists. Do not use this table as a general multi-church tenant table.

### 3.2 `branch`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Branch identifier |
| `church_id` | `uuid` | No | FK → church.id, RESTRICT | Configured church instance |
| `name` | `text` | No | — | Branch name |
| `code` | `text` | Yes | — | Optional stable branch code |
| `is_active` | `boolean` | No | DEFAULT true | Inactive branches retain history |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Update time |

**Constraints/indexes:** UNIQUE `(id, church_id)` to support composite references where needed; unique `(church_id, code)` when code is not null; optional case-insensitive unique active name per church if approved. Deactivation must not cascade-delete branch data.

### 3.3 `church_setting`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Setting row |
| `church_id` | `uuid` | No | FK → church.id, RESTRICT | Single configured church |
| `setting_key` | `text` | No | — | Stable allowlisted key |
| `setting_value` | `jsonb` | No | — | Typed-by-key configuration value |
| `updated_by` | `uuid` | Yes | FK → staff_profile.user_id, SET NULL | Last staff editor; null only for bootstrap/system |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Update time |

**Constraints:** UNIQUE `(church_id, setting_key)`. Validate JSON shape by setting key in trusted server code or dedicated typed columns. Do not store SMS provider credentials, PINs or secrets in this table.

## 4. Identity and authorization catalogue

### 4.1 `staff_profile`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `user_id` | `uuid` | No | PK, FK → auth.users.id, CASCADE only on Auth identity teardown after approved retention | Auth identity link |
| `display_name` | `text` | No | — | Staff display name |
| `email_normalized` | `text` | No | — | Lowercase canonical email |
| `phone_e164` | `text` | Yes | — | Optional staff phone |
| `is_active` | `boolean` | No | DEFAULT true | Operational access gate |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Update time |

**Constraints/indexes:** UNIQUE `(email_normalized)`; CHECK normalized email is lowercase and non-empty. The Auth FK deletion behaviour needs an explicit account-retention decision; preferred operational offboarding is deactivation, not Auth-user deletion. Never place a PIN or credential verifier here.

### 4.2 `role`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Role ID |
| `code` | `text` | No | UNIQUE | Stable role code |
| `name` | `text` | No | — | Display label |
| `description` | `text` | Yes | — | Role purpose |
| `is_system` | `boolean` | No | DEFAULT true | Seeded CMI role |
| `is_active` | `boolean` | No | DEFAULT true | Prevent assignment to retired role |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |

Seed only the six baseline role codes: `admin_pastor`, `coordinator`, `team_leader`, `field_worker`, `follow_up_volunteer`, `prayer_intercessor`. Do not add a Super Admin role.

### 4.3 `staff_role_assignment`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Assignment row |
| `user_id` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Staff member |
| `role_id` | `uuid` | No | FK → role.id, RESTRICT | Granted role |
| `branch_id` | `uuid` | Yes | FK → branch.id, RESTRICT | Null only for church-wide role scope if approved |
| `assigned_by` | `uuid` | Yes | FK → staff_profile.user_id, SET NULL | Granting actor; null only for bootstrap |
| `valid_from` | `timestamptz` | No | DEFAULT now() | Start of role validity |
| `valid_until` | `timestamptz` | Yes | — | Exclusive end of validity |
| `revoked_at` | `timestamptz` | Yes | — | Early revocation time |
| `created_at` | `timestamptz` | No | DEFAULT now() | Assignment creation |

**Constraints/indexes:** CHECK `valid_until IS NULL OR valid_until > valid_from`; CHECK `revoked_at IS NULL OR revoked_at >= valid_from`; index active assignments by `(user_id, role_id, branch_id)`. Prevent overlapping active validity intervals for the same user/role/scope using an exclusion constraint or a transactional assignment function; a simple unique key is insufficient for history.

### 4.4 `capability`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Capability ID |
| `code` | `text` | No | UNIQUE | Stable action code |
| `description` | `text` | No | — | Capability meaning |
| `sensitivity` | `text` | No | CHECK | `ordinary`, `restricted`, `privileged` |
| `is_non_overridable` | `boolean` | No | DEFAULT false | Mandatory safety restriction |
| `is_active` | `boolean` | No | DEFAULT true | Retire without deleting history |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |

### 4.5 `role_capability_grant`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `role_id` | `uuid` | No | PK part, FK → role.id | Role |
| `capability_id` | `uuid` | No | PK part, FK → capability.id | Capability |
| `grant_state` | `text` | No | CHECK | `grant`, `conditional`, `deny` |
| `scope_mode` | `text` | No | CHECK | `church`, `branch`, `team`, `event`, `assigned`, `own`, `public_published` |
| `approval_reference` | `text` | Yes | — | Decision register reference |
| `approved_by` | `uuid` | Yes | FK → staff_profile.user_id | Approver |
| `approved_at` | `timestamptz` | Yes | — | Approval time |

**Constraints:** composite PK `(role_id, capability_id)`; conditional grant is ineffective until approval fields and a valid decision reference exist. A deny or mandatory restriction cannot be overridden by a broad grant. Do not convert the matrix's conditional cells into grants without a recorded stakeholder decision.

### 4.6 `staff_capability_override`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Override ID |
| `user_id` | `uuid` | No | FK → staff_profile.user_id | Target user |
| `capability_id` | `uuid` | No | FK → capability.id | Capability |
| `effect` | `text` | No | CHECK | `grant` or `deny` |
| `scope_type` | `text` | No | CHECK | `church`, `branch`, `team`, `event`, `contact` |
| `scope_id` | `uuid` | Yes | — | Required except church-wide scope |
| `valid_from` | `timestamptz` | No | DEFAULT now() | Start |
| `valid_until` | `timestamptz` | Yes | — | End |
| `approved_by` | `uuid` | No | FK → staff_profile.user_id | Approver |
| `reason` | `text` | No | — | Justification |
| `created_at` | `timestamptz` | No | DEFAULT now() | Audit timestamp |

**Important limitation:** `scope_type/scope_id` is polymorphic and cannot have a conventional FK to all possible scope tables. Before migration, either replace it with explicit nullable FK columns plus an exactly-one CHECK, or create separate typed override-scope tables. An override must never bypass non-overridable capabilities, branch restrictions or prayer/care assignment requirements.

### 4.7 `team`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Team ID |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Owning branch |
| `name` | `text` | No | — | Team name |
| `description` | `text` | Yes | — | Optional description |
| `is_active` | `boolean` | No | DEFAULT true | Operational state |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Update time |

**Constraints/indexes:** UNIQUE `(id, branch_id)`; unique active normalized team name per branch using a partial unique index.

### 4.8 `team_membership`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Membership ID |
| `team_id` | `uuid` | No | FK → team.id, RESTRICT | Team |
| `user_id` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Staff member |
| `membership_role` | `text` | No | CHECK | `member`, `leader` |
| `valid_from` | `timestamptz` | No | DEFAULT now() | Membership start |
| `valid_until` | `timestamptz` | Yes | — | Membership end |
| `assigned_by` | `uuid` | Yes | FK → staff_profile.user_id | Assigning actor |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |

**Constraints/indexes:** CHECK validity interval; index active membership in both directions; prevent overlapping active intervals for the same user/team using exclusion or trusted transactional assignment logic. Leader status is membership metadata, not a substitute for the Team Leader role/capability.

### 4.9 `service_area`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Area ID |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Owning branch |
| `name` | `text` | No | — | Area name |
| `code` | `text` | Yes | — | Optional stable code |
| `is_active` | `boolean` | No | DEFAULT true | Active area |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |

**Constraints/indexes:** UNIQUE `(id, branch_id)`; unique active `(branch_id, code)` when code exists.

### 4.10 `staff_area_assignment`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Coverage assignment |
| `area_id` | `uuid` | No | FK → service_area.id, RESTRICT | Service area |
| `user_id` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Assigned staff |
| `valid_from` | `timestamptz` | No | DEFAULT now() | Start |
| `valid_until` | `timestamptz` | Yes | — | End |
| `assigned_by` | `uuid` | Yes | FK → staff_profile.user_id | Assigning actor |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |

Prevent overlapping active assignments for the same area/user if overlapping coverage is not meaningful. Area membership does not by itself grant access to all contacts captured in that area.

### 4.11 `event_team_assignment`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Assignment ID |
| `event_id` | `uuid` | No | FK → event.id, RESTRICT | Event |
| `team_id` | `uuid` | Yes | FK → team.id, RESTRICT | Assigned team |
| `user_id` | `uuid` | Yes | FK → staff_profile.user_id, RESTRICT | Assigned individual |
| `event_role` | `text` | No | — | Event-specific responsibility |
| `assigned_by` | `uuid` | Yes | FK → staff_profile.user_id | Assigning actor |
| `starts_at` | `timestamptz` | No | DEFAULT now() | Assignment start |
| `ends_at` | `timestamptz` | Yes | — | Assignment end |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation |

**Constraint decision:** require exactly one of `team_id` and `user_id` for each row. The ERD currently uses a staff-centric assignment entity; confirm whether team-level event assignment is truly needed. If team assignment is required, rename to `event_assignment` and update ERD; otherwise remove `team_id`.

## 5. Contact domain

### 5.1 `contact`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Canonical contact ID |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Owning branch |
| `first_name` | `text` | No | — | Required display/legal given name as captured |
| `last_name` | `text` | Yes | — | Family name may be unknown |
| `preferred_name` | `text` | Yes | — | Optional preferred name |
| `phone_e164` | `text` | Yes | — | Normalized phone; not globally unique |
| `phone_display` | `text` | Yes | — | Optional source/display form |
| `email_normalized` | `text` | Yes | — | Lowercase normalized email |
| `age_range` | `text` | Yes | CHECK from approved age-range catalogue | Do not collect full DOB unless explicitly required |
| `preferred_language` | `text` | Yes | — | Approved language code/value |
| `contact_status` | `text` | No | DEFAULT 'active', CHECK | e.g. active, archived, merged; final states need approval |
| `created_by` | `uuid` | Yes | FK → staff_profile.user_id, SET NULL | Null only for trusted public intake/system import |
| `merged_into_contact_id` | `uuid` | Yes | self-FK → contact.id, RESTRICT | Set only by merge transaction |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Update time |

**Constraints/indexes:** UNIQUE `(id, branch_id)` for composite child FKs; CHECK phone format when non-null; partial indexes for normalized phone/email duplicate review; search index on `(branch_id, lower(last_name), lower(first_name))`. Do not make phone/email a unique person key. Restricted pastoral fields must not be added to this table.

### 5.2 `contact_capture`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Capture record |
| `contact_id` | `uuid` | No | FK → contact.id, RESTRICT | Canonical contact |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Must equal contact.branch_id |
| `captured_by` | `uuid` | Yes | FK → staff_profile.user_id, SET NULL | Null for approved public intake/system capture |
| `capture_source` | `text` | No | CHECK | Approved source catalogue |
| `event_id` | `uuid` | Yes | FK → event.id, RESTRICT | Optional originating event |
| `service_area_id` | `uuid` | Yes | FK → service_area.id, RESTRICT | Optional capture area |
| `client_request_id` | `uuid` | No | — | Client-generated idempotency key |
| `captured_at` | `timestamptz` | No | DEFAULT now() | Capture instant |
| `source_metadata` | `jsonb` | No | DEFAULT '{}'::jsonb | Non-sensitive allowlisted metadata only |
| `created_at` | `timestamptz` | No | DEFAULT now() | Server receipt time |

**Constraints:** UNIQUE `(branch_id, client_request_id)`; composite FK `(contact_id, branch_id)` → contact `(id, branch_id)`; event/area branch consistency must also be enforced where those parent tables are branch-owned. Never trust client metadata as an authorization claim.

### 5.3 `contact_assignment`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Assignment ID |
| `contact_id` | `uuid` | No | FK → contact.id, RESTRICT | Contact |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Must match contact branch |
| `assignee_user_id` | `uuid` | Yes | FK → staff_profile.user_id, RESTRICT | Individual assignee |
| `team_id` | `uuid` | Yes | FK → team.id, RESTRICT | Team assignee |
| `assigned_by` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Assigning staff |
| `starts_at` | `timestamptz` | No | DEFAULT now() | Assignment start |
| `ends_at` | `timestamptz` | Yes | — | Assignment end |
| `reason` | `text` | Yes | — | Operational reason; no pastoral narrative |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation |

**Constraints:** exactly one of `assignee_user_id` and `team_id` is non-null; valid interval; composite contact/branch FK; team must belong to same branch. Index active assignments by contact, individual and team. Assignment revocation/end must immediately stop future access.

### 5.4 `contact_note`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Note ID |
| `contact_id` | `uuid` | No | FK → contact.id, RESTRICT | Related contact |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Must match contact branch |
| `author_user_id` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Author |
| `body` | `text` | No | — | Ordinary follow-up note only |
| `visibility` | `text` | No | CHECK | `author_only`, `assigned_scope`, `team_scope`, `branch_scope` subject to grants |
| `team_id` | `uuid` | Yes | FK → team.id, RESTRICT | Required for team-scoped visibility |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Update |

**Constraints:** composite FK `(contact_id, branch_id)` → contact; team branch must match; CHECK team_id is present only for team_scope and required for team_scope. Do not use for prayer/care narrative. Consider append-only note history if edits must be audited.

### 5.5 `contact_interaction`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Interaction ID |
| `contact_id` | `uuid` | No | FK → contact.id, RESTRICT | Related contact |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Must match contact branch |
| `actor_user_id` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Staff actor |
| `interaction_type` | `text` | No | CHECK | call, visit, message, meeting, other |
| `occurred_at` | `timestamptz` | No | DEFAULT now() | Actual interaction time |
| `outcome_code` | `text` | Yes | CHECK from approved outcome catalogue | Outcome |
| `summary` | `text` | Yes | — | Operational summary only |
| `next_action_at` | `timestamptz` | Yes | — | Suggested next action |
| `created_at` | `timestamptz` | No | DEFAULT now() | Server record time |

No prayer/care narrative in summary. Index by `(contact_id, occurred_at DESC)` and actor/time.

### 5.6 `contact_merge`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Merge transaction ID |
| `source_contact_id` | `uuid` | No | FK → contact.id, RESTRICT | Duplicate/source |
| `surviving_contact_id` | `uuid` | No | FK → contact.id, RESTRICT | Canonical survivor |
| `merged_by` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Authorized actor |
| `merged_at` | `timestamptz` | No | DEFAULT now() | Merge time |
| `reason` | `text` | No | — | Audit rationale |
| `reversal_of` | `uuid` | Yes | self-FK → contact_merge.id, RESTRICT | Optional reversal reference |
| `reversal_metadata` | `jsonb` | Yes | — | Safe references needed to reverse; no copied sensitive narratives |

**Constraints:** source != survivor; same branch; prevent multiple active merges of one source; merge action must run transactionally, re-point eligible FKs, preserve capture/history and write audit. Contact rows are not hard-deleted.

## 6. Follow-up domain

### 6.1 `followup_list`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | List ID |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Owning branch |
| `title` | `text` | No | — | List title |
| `description` | `text` | Yes | — | Operational description |
| `team_id` | `uuid` | Yes | FK → team.id, RESTRICT | Optional team scope |
| `event_id` | `uuid` | Yes | FK → event.id, RESTRICT | Optional event scope |
| `created_by` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Creator |
| `status` | `text` | No | DEFAULT 'active', CHECK | active, archived |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Update |

**Design recommendation:** use explicit `team_id` and `event_id` nullable FKs rather than a polymorphic `scope_type/scope_id` pair. CHECK at most one is set; both null means branch-level list. Enforce team/event branch equality with composite FKs. This is a proposed refinement from the generic scope pair in document 08 and must be reconciled there before migration.

### 6.2 `followup_task`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Task ID |
| `list_id` | `uuid` | Yes | FK → followup_list.id, RESTRICT | Optional list |
| `contact_id` | `uuid` | No | FK → contact.id, RESTRICT | Related contact |
| `branch_id` | `uuid` | No | FK → branch.id, RESTRICT | Must match contact and list branch |
| `assignee_user_id` | `uuid` | Yes | FK → staff_profile.user_id, RESTRICT | Individual assignee |
| `team_id` | `uuid` | Yes | FK → team.id, RESTRICT | Team assignee |
| `priority` | `smallint` | No | DEFAULT 3, CHECK 1–5 | Priority |
| `due_at` | `timestamptz` | Yes | — | Due instant |
| `status` | `text` | No | DEFAULT 'open', CHECK | open, in_progress, completed, cancelled |
| `task_note` | `text` | Yes | — | Operational task note only |
| `created_by` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Creator |
| `completed_at` | `timestamptz` | Yes | — | Completion instant |
| `created_at` | `timestamptz` | No | DEFAULT now() | Creation |
| `updated_at` | `timestamptz` | No | DEFAULT now() | Update |

**Constraints:** CHECK exactly one of `assignee_user_id` and `team_id` is set as the recommended D-04 default; check priority range; branch-consistent FKs to contact/list/team; status transitions only through trusted service logic; completed_at is set/cleared consistently with status. D-04 remains pending, so do not treat the one-target recommendation as approved.

### 6.3 `followup_task_event`

| Column | PostgreSQL type | Null? | Key/default | Rule / meaning |
|---|---|---:|---|---|
| `id` | `uuid` | No | PK, generated | Event ID |
| `task_id` | `uuid` | No | FK → followup_task.id, RESTRICT | Task |
| `actor_user_id` | `uuid` | No | FK → staff_profile.user_id, RESTRICT | Actor |
| `event_type` | `text` | No | CHECK | created, assigned, reassigned, status_changed, note_added, completed, reopened, cancelled |
| `from_status` | `text` | Yes | — | Previous state |
| `to_status` | `text` | Yes | — | New state |
| `details` | `jsonb` | No | DEFAULT '{}'::jsonb | Allowlisted, non-sensitive event metadata |
| `created_at` | `timestamptz` | No | DEFAULT now() | Immutable event time |

Append-only: no client UPDATE/DELETE. Do not put contact phone, prayer/care narratives, credentials or provider secrets in `details`.

## 7. Cross-table integrity requirements

Before migration drafting, define the composite candidate keys and foreign keys needed to guarantee branch equality. At minimum:

- `team(id, branch_id)`, `service_area(id, branch_id)`, `contact(id, branch_id)`, `followup_list(id, branch_id)`, `followup_task(id, branch_id)`, and each other branch-owned parent table need a UNIQUE composite key where a child references both ID and branch.
- `contact_capture(contact_id, branch_id)` → `contact(id, branch_id)`.
- `contact_assignment(contact_id, branch_id)` → `contact(id, branch_id)`.
- `contact_note(contact_id, branch_id)` → `contact(id, branch_id)`.
- `contact_interaction(contact_id, branch_id)` → `contact(id, branch_id)`.
- `followup_task(contact_id, branch_id)` → `contact(id, branch_id)`.
- `followup_task(list_id, branch_id)` → `followup_list(id, branch_id)` when list_id is not null.
- Team assignment/list/task references must use `(team_id, branch_id)` → `team(id, branch_id)`.
- Service-area capture references must use a branch-consistent composite FK.
- Event references must use a branch-consistent composite FK once the event dictionary slice is approved.

Use RESTRICT for parent deletion where operational history exists. If a person leaves the church or a staff account is deactivated, retain the historical identity/reference needed for audit and historical attribution.

## 8. Design findings to reconcile in parent documents

| Finding | Current design tension | Required action before migrations |
|---|---|---|
| DD-01 | Document 08 uses `followup_list.scope_type/scope_id`; this dictionary recommends typed `team_id/event_id` FKs. | Approve explicit-FK refinement and update 08/ERD. |
| DD-02 | `event_team_assignment` supports either team or user, while ERD entity is staff-centric. | Resolve team-vs-individual event assignment semantics and rename/adjust ERD. |
| DD-03 | `staff_capability_override.scope_type/scope_id` is polymorphic. | Replace with typed scope FKs or typed scope tables before migration. |
| DD-04 | `staff_profile` Auth FK deletion action interacts with account retention. | Approve deactivation-first offboarding and retention before choosing Auth FK action. |
| DD-05 | Branch may be a single fixed configuration, while records carry branch_id. | Confirm D-02; retain composite branch consistency either way. |
| DD-06 | D-04 task assignment mode is not approved. | Recommended one-target assignment is a safe default only, not a decision. |
| DD-07 | `contact_note` visibility options and contact field exposure require R-05/R-03. | Finalize field-level projections and visibility policy before grants. |

## 9. Validation checklist

- [x] Typed data dictionary drafted for foundation, authorization, contact and follow-up domains.
- [x] Nullability and proposed defaults documented for listed columns.
- [x] Candidate keys, foreign keys and branch consistency requirements documented.
- [x] Polymorphic scope risks called out rather than hidden.
- [ ] Reconcile DD-01–DD-07 with ERD, logical model and physical schema proposal.
- [ ] Approve R-01–R-12 and D-01–D-13 or record safe deferrals.
- [ ] Complete remaining domain data-dictionary slices.
- [ ] Generate executable SQL drafts only after schema and decision approval.
- [ ] Validate migrations and RLS tests in disposable local PostgreSQL/Supabase.

## 10. Verification status

This document is a proposed design artifact. It has not been parsed as SQL, checked against a live database, generated into migrations, tested with RLS or applied to any hosted Supabase project. No claim is made that the application currently implements these tables or rules.
