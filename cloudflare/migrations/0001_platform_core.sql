-- PCG Missions Cloudflare/D1 non-production foundation.
-- All timestamps are normalized UTC ISO-8601 TEXT.
-- All boolean values are SQLite INTEGER constrained to 0/1.
-- This migration intentionally establishes identity/access and team/area foundations only.
-- Ministry domain tables are ported in later, separately reviewed migrations.

PRAGMA foreign_keys = ON;

CREATE TABLE app_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  environment TEXT NOT NULL CHECK (environment = 'non-production'),
  created_at TEXT NOT NULL
);

INSERT INTO app_meta (id, schema_version, environment, created_at)
VALUES (1, 1, 'non-production', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Better Auth-compatible core identity tables.
-- Validate this schema against the pinned Better Auth version before enabling auth routes.
CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0 CHECK (emailVerified IN (0, 1)),
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_id_idx ON session(userId);
CREATE INDEX session_expires_at_idx ON session(expiresAt);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX account_user_id_idx ON account(userId);
CREATE UNIQUE INDEX account_provider_identity_idx ON account(providerId, accountId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE INDEX verification_identifier_idx ON verification(identifier);

CREATE TABLE church (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 180),
  timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
  is_configured_instance INTEGER NOT NULL DEFAULT 1 CHECK (is_configured_instance = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE branch (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL REFERENCES church(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  code TEXT,
  timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (church_id, code),
  UNIQUE (id, church_id)
);

CREATE TABLE capability (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (
    length(code) BETWEEN 3 AND 120
    AND substr(code, 1, 1) GLOB '[a-z]'
    AND code NOT GLOB '*[^a-z0-9_.-]*'
  ),
  description TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'ordinary'
    CHECK (sensitivity IN ('ordinary', 'restricted', 'highly_restricted')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE role (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code IN (
    'admin_pastor', 'coordinator', 'team_leader',
    'field_worker', 'follow_up_volunteer', 'prayer_intercessor'
  )),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE role_capability (
  role_id TEXT NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  capability_id TEXT NOT NULL REFERENCES capability(id) ON DELETE RESTRICT,
  scope_mode TEXT NOT NULL CHECK (scope_mode IN (
    'branch', 'team', 'assigned', 'event', 'self', 'explicit_share', 'oversight'
  )),
  created_at TEXT NOT NULL,
  PRIMARY KEY (role_id, capability_id, scope_mode)
);

CREATE TABLE staff_profile (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 180),
  email TEXT,
  phone_e164 TEXT,
  account_status TEXT NOT NULL DEFAULT 'invited'
    CHECK (account_status IN ('invited', 'active', 'inactive', 'suspended')),
  last_active_at TEXT,
  deactivated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  password_setup_expires_at TEXT,
  password_changed_at TEXT,
  CHECK (
    (account_status = 'inactive' AND deactivated_at IS NOT NULL)
    OR (account_status <> 'inactive' AND deactivated_at IS NULL)
  )
);

CREATE TABLE staff_role_assignment (
  id TEXT PRIMARY KEY,
  staff_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  revoked_at TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (revoked_at IS NULL OR revoked_at >= starts_at)
);
CREATE INDEX staff_role_assignment_lookup_idx
  ON staff_role_assignment(staff_profile_id, branch_id, starts_at, ends_at);

CREATE TRIGGER staff_role_assignment_no_overlap_insert
BEFORE INSERT ON staff_role_assignment
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_role_assignment existing
    WHERE existing.staff_profile_id = NEW.staff_profile_id
      AND existing.role_id = NEW.role_id
      AND existing.branch_id = NEW.branch_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'STAFF_ROLE_ASSIGNMENT_OVERLAP') END;
END;

CREATE TRIGGER staff_role_assignment_no_overlap_update
BEFORE UPDATE OF staff_profile_id, role_id, branch_id, starts_at, ends_at, revoked_at
ON staff_role_assignment
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_role_assignment existing
    WHERE existing.id <> NEW.id
      AND existing.staff_profile_id = NEW.staff_profile_id
      AND existing.role_id = NEW.role_id
      AND existing.branch_id = NEW.branch_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'STAFF_ROLE_ASSIGNMENT_OVERLAP') END;
END;

CREATE TABLE staff_access_audit (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  target_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'role_assigned', 'role_revoked', 'account_created',
    'account_deactivated', 'account_reactivated'
  )),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
  created_at TEXT NOT NULL
);
CREATE INDEX staff_access_audit_branch_created_idx
  ON staff_access_audit(branch_id, created_at DESC);
CREATE TRIGGER staff_access_audit_no_update
BEFORE UPDATE ON staff_access_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_ACCESS_AUDIT_APPEND_ONLY');
END;
CREATE TRIGGER staff_access_audit_no_delete
BEFORE DELETE ON staff_access_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_ACCESS_AUDIT_APPEND_ONLY');
END;

CREATE TABLE team (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, branch_id)
);

CREATE TABLE service_area (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (branch_id, code),
  UNIQUE (id, branch_id)
);

CREATE TRIGGER staff_team_membership_no_overlap_update
BEFORE UPDATE OF staff_profile_id, team_id, starts_at, ends_at, revoked_at
ON staff_team_membership
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_team_membership existing
    WHERE existing.id <> NEW.id
      AND existing.staff_profile_id = NEW.staff_profile_id
      AND existing.team_id = NEW.team_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'STAFF_TEAM_MEMBERSHIP_OVERLAP') END;
END;

CREATE TABLE staff_team_membership (
  id TEXT PRIMARY KEY,
  staff_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  team_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  membership_role TEXT NOT NULL DEFAULT 'member' CHECK (membership_role IN ('member', 'leader')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (revoked_at IS NULL OR revoked_at >= starts_at),
  FOREIGN KEY (team_id, branch_id) REFERENCES team(id, branch_id) ON DELETE RESTRICT
);

CREATE TRIGGER staff_team_membership_no_overlap_insert
BEFORE INSERT ON staff_team_membership
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_team_membership existing
    WHERE existing.staff_profile_id = NEW.staff_profile_id
      AND existing.team_id = NEW.team_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'STAFF_TEAM_MEMBERSHIP_OVERLAP') END;
END;

CREATE TABLE staff_area_coverage (
  id TEXT PRIMARY KEY,
  staff_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  service_area_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  FOREIGN KEY (service_area_id, branch_id) REFERENCES service_area(id, branch_id) ON DELETE RESTRICT
);

CREATE TRIGGER staff_area_coverage_no_overlap_insert
BEFORE INSERT ON staff_area_coverage
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_area_coverage existing
    WHERE existing.staff_profile_id = NEW.staff_profile_id
      AND existing.service_area_id = NEW.service_area_id
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'STAFF_AREA_COVERAGE_OVERLAP') END;
END;

CREATE TRIGGER staff_area_coverage_no_overlap_update
BEFORE UPDATE OF staff_profile_id, service_area_id, starts_at, ends_at
ON staff_area_coverage
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_area_coverage existing
    WHERE existing.id <> NEW.id
      AND existing.staff_profile_id = NEW.staff_profile_id
      AND existing.service_area_id = NEW.service_area_id
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'STAFF_AREA_COVERAGE_OVERLAP') END;
END;
