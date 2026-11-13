-- Enforce and audit contact assignment changes at the database boundary.
ALTER TABLE contact_assignment
  ADD COLUMN ended_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;

CREATE TABLE contact_assignment_audit (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES contact_assignment(id) ON DELETE RESTRICT,
  contact_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('assigned','ended')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX contact_assignment_audit_contact_time_idx
  ON contact_assignment_audit(contact_id, created_at DESC);
CREATE INDEX contact_assignment_audit_branch_time_idx
  ON contact_assignment_audit(branch_id, created_at DESC);
CREATE TRIGGER contact_assignment_audit_no_update
BEFORE UPDATE ON contact_assignment_audit
BEGIN
  SELECT RAISE(ABORT, 'CONTACT_ASSIGNMENT_AUDIT_APPEND_ONLY');
END;
CREATE TRIGGER contact_assignment_audit_no_delete
BEFORE DELETE ON contact_assignment_audit
BEGIN
  SELECT RAISE(ABORT, 'CONTACT_ASSIGNMENT_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER contact_assignment_authorize_insert
BEFORE INSERT ON contact_assignment
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment actor_assignment ON actor_assignment.staff_profile_id = actor.id
    JOIN role actor_role ON actor_role.id = actor_assignment.role_id AND actor_role.is_active = 1
    JOIN role_capability rc ON rc.role_id = actor_role.id
    JOIN capability cap ON cap.id = rc.capability_id AND cap.is_active = 1
    JOIN branch b ON b.id = actor_assignment.branch_id AND b.is_active = 1
    WHERE actor.auth_user_id = NEW.assigned_by
      AND actor.account_status = 'active'
      AND actor_assignment.branch_id = NEW.branch_id
      AND actor_assignment.revoked_at IS NULL
      AND actor_assignment.starts_at <= NEW.starts_at
      AND (actor_assignment.ends_at IS NULL OR actor_assignment.ends_at > NEW.starts_at)
      AND (
        cap.code = 'contacts.assign'
        OR (cap.code = 'contacts.create'
            AND NEW.assignee_user_id = NEW.assigned_by
            AND NEW.team_id IS NULL)
      )
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_ACTOR_NOT_AUTHORIZED') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM contact c
    WHERE c.id = NEW.contact_id AND c.branch_id = NEW.branch_id
      AND c.contact_status = 'active'
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_CONTACT_NOT_ACTIVE') END;

  SELECT CASE WHEN NEW.assignee_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM staff_profile target
    JOIN staff_role_assignment target_assignment ON target_assignment.staff_profile_id = target.id
    JOIN role target_role ON target_role.id = target_assignment.role_id AND target_role.is_active = 1
    WHERE target.auth_user_id = NEW.assignee_user_id
      AND target.account_status = 'active'
      AND target_assignment.branch_id = NEW.branch_id
      AND target_assignment.revoked_at IS NULL
      AND target_assignment.starts_at <= NEW.starts_at
      AND (target_assignment.ends_at IS NULL OR target_assignment.ends_at > NEW.starts_at)
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_TARGET_NOT_ACTIVE_IN_BRANCH') END;

  SELECT CASE WHEN NEW.team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM team t
    WHERE t.id = NEW.team_id AND t.branch_id = NEW.branch_id AND t.is_active = 1
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_TEAM_NOT_ACTIVE_IN_BRANCH') END;
END;

CREATE TRIGGER contact_assignment_immutable_fields
BEFORE UPDATE OF id, contact_id, branch_id, assignee_user_id, team_id, assigned_by, starts_at, created_at
ON contact_assignment
BEGIN
  SELECT RAISE(ABORT, 'CONTACT_ASSIGNMENT_IMMUTABLE_FIELDS');
END;

CREATE TRIGGER contact_assignment_authorize_end
BEFORE UPDATE OF ends_at, ended_by ON contact_assignment
WHEN OLD.ends_at IS NULL OR NEW.ends_at <> OLD.ends_at
BEGIN
  SELECT CASE WHEN NEW.ends_at IS NULL OR NEW.ended_by IS NULL
      OR NEW.ends_at <= OLD.starts_at
    THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_END_METADATA_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.code = 'contacts.assign' AND c.is_active = 1
    WHERE actor.auth_user_id = NEW.ended_by
      AND actor.account_status = 'active'
      AND ra.branch_id = OLD.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.ends_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.ends_at)
  ) THEN RAISE(ABORT, 'CONTACT_ASSIGNMENT_END_NOT_AUTHORIZED') END;
END;


CREATE TRIGGER contact_assignment_end_once
BEFORE UPDATE OF ends_at ON contact_assignment
WHEN OLD.ends_at IS NOT NULL AND NEW.ends_at <> OLD.ends_at
BEGIN
  SELECT RAISE(ABORT, 'CONTACT_ASSIGNMENT_ALREADY_ENDED');
END;
CREATE TRIGGER contact_assignment_reason_update_guard
BEFORE UPDATE OF reason ON contact_assignment
WHEN NOT (OLD.ends_at IS NULL AND NEW.ends_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'CONTACT_ASSIGNMENT_REASON_IMMUTABLE');
END;
CREATE TRIGGER contact_assignment_ended_by_immutable
BEFORE UPDATE OF ended_by ON contact_assignment
WHEN OLD.ended_by IS NOT NULL OR (NEW.ended_by IS NOT NULL AND NEW.ends_at IS OLD.ends_at)
BEGIN
  SELECT RAISE(ABORT, 'CONTACT_ASSIGNMENT_END_ACTOR_IMMUTABLE');
END;

CREATE TRIGGER contact_assignment_audit_insert
AFTER INSERT ON contact_assignment
BEGIN
  INSERT INTO contact_assignment_audit
    (id, assignment_id, contact_id, branch_id, actor_user_id, action, reason, created_at)
  VALUES ('contact-assigned-' || lower(hex(randomblob(16))), NEW.id, NEW.contact_id,
          NEW.branch_id, NEW.assigned_by, 'assigned',
          COALESCE(NEW.reason, 'Contact assigned to a staff member or team'), NEW.created_at);
END;
CREATE TRIGGER contact_assignment_audit_end
AFTER UPDATE OF ends_at ON contact_assignment
WHEN OLD.ends_at IS NULL AND NEW.ends_at IS NOT NULL
BEGIN
  INSERT INTO contact_assignment_audit
    (id, assignment_id, contact_id, branch_id, actor_user_id, action, reason, created_at)
  VALUES ('contact-ended-' || lower(hex(randomblob(16))), NEW.id, NEW.contact_id,
          NEW.branch_id, NEW.ended_by, 'ended',
          COALESCE(NEW.reason, 'Contact assignment ended'), NEW.ends_at);
END;

UPDATE app_meta
SET schema_version = 10
WHERE id = 1 AND environment = 'non-production';
