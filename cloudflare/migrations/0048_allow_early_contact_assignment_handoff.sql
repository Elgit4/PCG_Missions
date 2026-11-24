-- Allow an authorized handoff to shorten an assignment that was originally
-- scheduled to end later. The previous end-once guard made transfer impossible
-- whenever the current assignment already had a future ends_at value.
--
-- A handoff may move an end time earlier, never later or back to NULL. The
-- assignment audit records this as ended_early so the history remains explicit.

DROP TRIGGER IF EXISTS contact_assignment_end_once;
CREATE TRIGGER contact_assignment_end_once
BEFORE UPDATE OF ends_at ON contact_assignment
WHEN OLD.ends_at IS NOT NULL
  AND (
    NEW.ends_at IS NULL
    OR julianday(NEW.ends_at) >= julianday(OLD.ends_at)
  )
BEGIN
  SELECT RAISE(ABORT, 'CONTACT_ASSIGNMENT_ALREADY_ENDED');
END;

DROP TRIGGER IF EXISTS contact_assignment_reason_update_guard;
CREATE TRIGGER contact_assignment_reason_update_guard
BEFORE UPDATE OF reason ON contact_assignment
WHEN NOT (
  (OLD.ends_at IS NULL AND NEW.ends_at IS NOT NULL)
  OR (
    OLD.ends_at IS NOT NULL
    AND NEW.ends_at IS NOT NULL
    AND julianday(NEW.ends_at) < julianday(OLD.ends_at)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'CONTACT_ASSIGNMENT_REASON_IMMUTABLE');
END;

DROP TRIGGER IF EXISTS contact_assignment_audit_end;
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

UPDATE app_meta SET schema_version = 48 WHERE id = 1;
