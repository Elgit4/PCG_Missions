-- Staff account lifecycle and two-person Admin/Pastor revocation.
-- Non-production migration only. No invitation is delivered by this migration.

ALTER TABLE staff_profile ADD COLUMN account_status_changed_by TEXT REFERENCES staff_profile(id);
ALTER TABLE staff_profile ADD COLUMN account_status_changed_branch_id TEXT REFERENCES branch(id);
ALTER TABLE staff_profile ADD COLUMN account_status_reason TEXT;
ALTER TABLE staff_role_assignment ADD COLUMN revoked_by TEXT REFERENCES staff_profile(id);
ALTER TABLE staff_role_assignment ADD COLUMN revocation_request_id TEXT;

CREATE TABLE staff_account_audit (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  target_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'account_deactivated','account_reactivated','account_suspended',
    'invitation_created','invitation_accepted','password_reset_requested'
  )),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
  created_at TEXT NOT NULL
);
CREATE INDEX staff_account_audit_branch_time_idx
  ON staff_account_audit(branch_id, created_at DESC);
CREATE TRIGGER staff_account_audit_no_update
BEFORE UPDATE ON staff_account_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_ACCOUNT_AUDIT_APPEND_ONLY');
END;
CREATE TRIGGER staff_account_audit_no_delete
BEFORE DELETE ON staff_account_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_ACCOUNT_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER staff_profile_account_status_authorize
BEFORE UPDATE OF account_status ON staff_profile
WHEN OLD.account_status <> NEW.account_status
BEGIN
  SELECT CASE WHEN NEW.account_status NOT IN ('active','inactive','suspended')
    THEN RAISE(ABORT, 'STAFF_ACCOUNT_STATUS_TRANSITION_INVALID') END;
  SELECT CASE WHEN NEW.account_status_changed_by IS NULL
      OR NEW.account_status_changed_branch_id IS NULL
      OR NEW.account_status_reason IS NULL
      OR length(trim(NEW.account_status_reason)) NOT BETWEEN 10 AND 500
    THEN RAISE(ABORT, 'STAFF_ACCOUNT_STATUS_CHANGE_METADATA_REQUIRED') END;
  SELECT CASE WHEN NEW.id = NEW.account_status_changed_by
    THEN RAISE(ABORT, 'STAFF_CANNOT_CHANGE_OWN_ACCOUNT_STATUS') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    JOIN branch b ON b.id = ra.branch_id AND b.is_active = 1
    WHERE actor.id = NEW.account_status_changed_by
      AND actor.account_status = 'active'
      AND ra.branch_id = NEW.account_status_changed_branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND (ra.ends_at IS NULL OR ra.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND c.code = 'staff.account.manage'
  ) THEN RAISE(ABORT, 'STAFF_ACCOUNT_CHANGE_NOT_AUTHORIZED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_role_assignment target_assignment
    WHERE target_assignment.staff_profile_id = NEW.id
      AND target_assignment.branch_id = NEW.account_status_changed_branch_id
      AND target_assignment.revoked_at IS NULL
      AND target_assignment.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND (target_assignment.ends_at IS NULL OR target_assignment.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) THEN RAISE(ABORT, 'STAFF_TARGET_NOT_IN_BRANCH') END;
  SELECT CASE WHEN NEW.account_status IN ('inactive','suspended') AND EXISTS (
    SELECT 1
    FROM staff_role_assignment target_admin
    JOIN role ar ON ar.id = target_admin.role_id AND ar.code = 'admin_pastor'
    WHERE target_admin.staff_profile_id = NEW.id
      AND target_admin.revoked_at IS NULL
      AND target_admin.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND (target_admin.ends_at IS NULL OR target_admin.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND NOT EXISTS (
        SELECT 1
        FROM staff_role_assignment other_admin
        JOIN role rr ON rr.id = other_admin.role_id AND rr.code = 'admin_pastor' AND rr.is_active = 1
        JOIN staff_profile other_staff ON other_staff.id = other_admin.staff_profile_id
        JOIN branch other_branch ON other_branch.id = other_admin.branch_id AND other_branch.is_active = 1
        WHERE other_admin.branch_id = target_admin.branch_id
          AND other_admin.staff_profile_id <> NEW.id
          AND other_staff.account_status = 'active'
          AND other_admin.revoked_at IS NULL
          AND other_admin.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
          AND (other_admin.ends_at IS NULL OR other_admin.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )
  ) THEN RAISE(ABORT, 'CANNOT_DEACTIVATE_LAST_ACTIVE_ADMIN_PASTOR') END;
END;

CREATE TRIGGER staff_profile_account_status_audit
AFTER UPDATE OF account_status ON staff_profile
WHEN OLD.account_status <> NEW.account_status
BEGIN
  INSERT INTO staff_account_audit
    (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
  VALUES (
    'account-status-' || NEW.id || '-' || NEW.updated_at,
    NEW.account_status_changed_branch_id,
    NEW.account_status_changed_by,
    NEW.id,
    CASE NEW.account_status
      WHEN 'inactive' THEN 'account_deactivated'
      WHEN 'suspended' THEN 'account_suspended'
      ELSE 'account_reactivated'
    END,
    NEW.account_status_reason,
    json_object('previous_status', OLD.account_status, 'new_status', NEW.account_status),
    NEW.updated_at
  );
END;

CREATE TABLE staff_role_revocation_request (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES staff_role_assignment(id) ON DELETE RESTRICT,
  target_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','applied')),
  reviewed_by TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_reason TEXT,
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status IN ('approved','rejected','applied') AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL
      AND length(trim(review_reason)) BETWEEN 10 AND 500)
  )
);
CREATE UNIQUE INDEX staff_role_revocation_one_open_idx
  ON staff_role_revocation_request(branch_id, assignment_id)
  WHERE status IN ('pending','approved');

CREATE TABLE staff_role_revocation_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES staff_role_revocation_request(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('request_created','request_approved','request_rejected','request_applied')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  created_at TEXT NOT NULL
);
CREATE INDEX staff_role_revocation_audit_branch_time_idx
  ON staff_role_revocation_audit(branch_id, created_at DESC);
CREATE TRIGGER staff_role_revocation_audit_no_update
BEFORE UPDATE ON staff_role_revocation_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_ROLE_REVOCATION_AUDIT_APPEND_ONLY');
END;
CREATE TRIGGER staff_role_revocation_audit_no_delete
BEFORE DELETE ON staff_role_revocation_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_ROLE_REVOCATION_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER staff_role_revocation_request_authorize_insert
BEFORE INSERT ON staff_role_revocation_request
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_role_assignment a
    JOIN role r ON r.id = a.role_id AND r.code = 'admin_pastor' AND r.is_active = 1
    JOIN staff_profile target ON target.id = a.staff_profile_id AND target.account_status = 'active'
    JOIN staff_profile actor ON actor.id = NEW.requested_by AND actor.account_status = 'active'
    JOIN staff_role_assignment actor_assignment ON actor_assignment.staff_profile_id = actor.id
    JOIN role actor_role ON actor_role.id = actor_assignment.role_id AND actor_role.is_active = 1
    JOIN role_capability rc ON rc.role_id = actor_role.id
    JOIN capability c ON c.id = rc.capability_id AND c.code = 'staff.role.assign' AND c.is_active = 1
    WHERE a.id = NEW.assignment_id
      AND a.staff_profile_id = NEW.target_profile_id
      AND a.role_id = NEW.role_id
      AND a.branch_id = NEW.branch_id
      AND a.revoked_at IS NULL
      AND a.starts_at <= NEW.requested_at
      AND (a.ends_at IS NULL OR a.ends_at > NEW.requested_at)
      AND actor_assignment.branch_id = NEW.branch_id
      AND actor_assignment.revoked_at IS NULL
      AND actor_assignment.starts_at <= NEW.requested_at
      AND (actor_assignment.ends_at IS NULL OR actor_assignment.ends_at > NEW.requested_at)
      AND NEW.status = 'pending'
      AND NEW.reviewed_by IS NULL AND NEW.reviewed_at IS NULL AND NEW.review_reason IS NULL
  ) THEN RAISE(ABORT, 'ADMIN_PASTOR_REVOCATION_REQUEST_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER staff_role_revocation_request_immutable
BEFORE UPDATE OF id, branch_id, assignment_id, target_profile_id, role_id, requested_by, reason, requested_at
ON staff_role_revocation_request
BEGIN
  SELECT RAISE(ABORT, 'ROLE_REVOCATION_REQUEST_IMMUTABLE');
END;

CREATE TRIGGER staff_role_revocation_request_review_authorize
BEFORE UPDATE OF status, reviewed_by, reviewed_at, review_reason
ON staff_role_revocation_request
WHEN OLD.status = 'pending'
BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('approved','rejected')
      OR NEW.reviewed_by = NEW.requested_by
      OR NEW.reviewed_at IS NULL
      OR NEW.review_reason IS NULL
      OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 500
    THEN RAISE(ABORT, 'ROLE_REVOCATION_REQUIRES_DISTINCT_REVIEWER') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile reviewer
    JOIN staff_role_assignment ra ON ra.staff_profile_id = reviewer.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.code = 'staff.role.approve' AND c.is_active = 1
    WHERE reviewer.id = NEW.reviewed_by
      AND reviewer.account_status = 'active'
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.reviewed_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.reviewed_at)
  ) THEN RAISE(ABORT, 'ROLE_REVOCATION_REVIEW_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER staff_role_revocation_request_terminal_guard
BEFORE UPDATE OF status ON staff_role_revocation_request
WHEN OLD.status <> 'pending' AND NOT (OLD.status = 'approved' AND NEW.status = 'applied')
BEGIN
  SELECT RAISE(ABORT, 'ROLE_REVOCATION_REQUEST_TERMINAL');
END;

CREATE TRIGGER staff_role_assignment_admin_revoke_requires_approval
BEFORE UPDATE OF revoked_at ON staff_role_assignment
WHEN (SELECT code FROM role WHERE id = OLD.role_id) = 'admin_pastor'
  AND OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.revoked_by IS NULL OR NEW.revocation_request_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM staff_role_revocation_request req
      WHERE req.id = NEW.revocation_request_id
        AND req.assignment_id = OLD.id
        AND req.target_profile_id = OLD.staff_profile_id
        AND req.branch_id = OLD.branch_id
        AND req.status = 'approved'
        AND req.reviewed_by = NEW.revoked_by
        AND req.requested_by <> req.reviewed_by
        AND req.reviewed_at <= NEW.revoked_at
    )
    THEN RAISE(ABORT, 'ADMIN_PASTOR_REVOCATION_REQUIRES_DUAL_CONTROL') END;
END;

CREATE TRIGGER staff_role_revocation_request_audit_insert
AFTER INSERT ON staff_role_revocation_request
BEGIN
  INSERT INTO staff_role_revocation_audit
    (id, request_id, branch_id, actor_profile_id, action, reason, created_at)
  VALUES ('role-revoke-request-' || NEW.id, NEW.id, NEW.branch_id, NEW.requested_by,
          'request_created', NEW.reason, NEW.requested_at);
END;
CREATE TRIGGER staff_role_revocation_request_audit_review
AFTER UPDATE OF status ON staff_role_revocation_request
WHEN OLD.status = 'pending' AND NEW.status IN ('approved','rejected')
BEGIN
  INSERT INTO staff_role_revocation_audit
    (id, request_id, branch_id, actor_profile_id, action, reason, created_at)
  VALUES ('role-revoke-review-' || NEW.id, NEW.id, NEW.branch_id, NEW.reviewed_by,
          CASE NEW.status WHEN 'approved' THEN 'request_approved' ELSE 'request_rejected' END,
          NEW.review_reason, NEW.reviewed_at);
END;

CREATE TRIGGER staff_role_revocation_request_applied_guard
BEFORE UPDATE OF status ON staff_role_revocation_request
WHEN OLD.status = 'approved' AND NEW.status = 'applied'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_role_assignment a
    WHERE a.id = OLD.assignment_id
      AND a.revoked_at IS NOT NULL
      AND a.revoked_by = OLD.reviewed_by
      AND a.revocation_request_id = OLD.id
  ) THEN RAISE(ABORT, 'ROLE_REVOCATION_NOT_APPLIED') END;
END;
CREATE TRIGGER staff_role_revocation_request_audit_applied
AFTER UPDATE OF status ON staff_role_revocation_request
WHEN OLD.status = 'approved' AND NEW.status = 'applied'
BEGIN
  INSERT INTO staff_role_revocation_audit
    (id, request_id, branch_id, actor_profile_id, action, reason, created_at)
  VALUES ('role-revoke-applied-' || NEW.id, NEW.id, NEW.branch_id, NEW.reviewed_by,
          'request_applied', NEW.review_reason, NEW.reviewed_at);
END;

UPDATE app_meta
SET schema_version = 7
WHERE id = 1 AND environment = 'non-production';
