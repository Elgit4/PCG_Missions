-- The handoff migration now records early termination as "ended_early".
-- Expand the append-only audit table's action constraint without losing history.

DROP TRIGGER IF EXISTS contact_assignment_audit_insert;
DROP TRIGGER IF EXISTS contact_assignment_audit_end;
DROP TRIGGER IF EXISTS contact_assignment_audit_no_update;
DROP TRIGGER IF EXISTS contact_assignment_audit_no_delete;
DROP TABLE IF EXISTS contact_assignment_audit_new;

CREATE TABLE contact_assignment_audit_new (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES contact_assignment(id) ON DELETE RESTRICT,
  contact_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('assigned','ended','ended_early')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT
);

INSERT INTO contact_assignment_audit_new
  (id, assignment_id, contact_id, branch_id, actor_user_id, action, reason, created_at)
SELECT
  id, assignment_id, contact_id, branch_id, actor_user_id, action, reason, created_at
FROM contact_assignment_audit;

DROP TABLE contact_assignment_audit;
ALTER TABLE contact_assignment_audit_new RENAME TO contact_assignment_audit;

CREATE INDEX contact_assignment_audit_branch_time_idx
  ON contact_assignment_audit(branch_id, created_at DESC);
CREATE INDEX contact_assignment_audit_contact_time_idx
  ON contact_assignment_audit(contact_id, created_at DESC);

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

CREATE TRIGGER contact_assignment_audit_insert
AFTER INSERT ON contact_assignment
BEGIN
  INSERT INTO contact_assignment_audit
    (id, assignment_id, contact_id, branch_id, actor_user_id, action, reason, created_at)
  VALUES (
    'contact-assigned-' || lower(hex(randomblob(16))),
    NEW.id,
    NEW.contact_id,
    NEW.branch_id,
    NEW.assigned_by,
    'assigned',
    COALESCE(NEW.reason, 'Contact assigned to a staff member or team'),
    NEW.created_at
  );
END;

CREATE TRIGGER contact_assignment_audit_end
AFTER UPDATE OF ends_at ON contact_assignment
WHEN NEW.ends_at IS NOT NULL
  AND (
    OLD.ends_at IS NULL
    OR julianday(NEW.ends_at) < julianday(OLD.ends_at)
  )
BEGIN
  INSERT INTO contact_assignment_audit
    (id, assignment_id, contact_id, branch_id, actor_user_id, action, reason, created_at)
  VALUES (
    'contact-ended-' || lower(hex(randomblob(16))),
    NEW.id,
    NEW.contact_id,
    NEW.branch_id,
    NEW.ended_by,
    CASE WHEN OLD.ends_at IS NULL THEN 'ended' ELSE 'ended_early' END,
    COALESCE(NEW.reason, 'Contact assignment ended'),
    NEW.ends_at
  );
END;

UPDATE app_meta SET schema_version = 49 WHERE id = 1;
