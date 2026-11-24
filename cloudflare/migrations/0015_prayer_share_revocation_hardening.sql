-- Harden the prayer share lifecycle for the non-production EU D1 schema.
-- Keep the already-applied 0001-0014 history intact; this is additive migration 0015.

ALTER TABLE staff_record_share ADD COLUMN revocation_reason TEXT;
ALTER TABLE prayer_assignment
  ADD COLUMN revoked_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE prayer_assignment ADD COLUMN revocation_reason TEXT;

DROP TRIGGER IF EXISTS staff_record_share_audit_revoke;

CREATE TRIGGER staff_record_share_revoke_reason_required
BEFORE UPDATE OF revoked_at ON staff_record_share
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.revocation_reason IS NULL
      OR length(trim(NEW.revocation_reason)) < 10
      OR length(trim(NEW.revocation_reason)) > 300
    THEN RAISE(ABORT, 'SENSITIVE_SHARE_REVOCATION_REASON_REQUIRED') END;
END;

CREATE TRIGGER staff_record_share_audit_revoke
AFTER UPDATE OF revoked_at ON staff_record_share
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO sensitive_record_access_audit
    (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
  VALUES
    ('share-revoke-' || NEW.id, NEW.branch_id, NEW.revoked_by, NEW.record_type, NEW.record_id,
     'share_revoked', NEW.revocation_reason, NEW.id, NEW.revoked_at);
END;

CREATE TRIGGER prayer_assignment_revoke_guard
BEFORE UPDATE OF revoked_at, revoked_by, revocation_reason ON prayer_assignment
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.revoked_by IS NULL
      OR NEW.revocation_reason IS NULL
      OR length(trim(NEW.revocation_reason)) < 10
      OR length(trim(NEW.revocation_reason)) > 300
    THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_REVOCATION_METADATA_REQUIRED') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    WHERE actor.auth_user_id = NEW.revoked_by
      AND actor.account_status = 'active'
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.revoked_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.revoked_at)
      AND c.code = 'prayer.request.share'
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_REVOKE_NOT_AUTHORIZED') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_record_share share
    JOIN staff_profile recipient ON recipient.id = share.staff_profile_id
    JOIN staff_profile actor ON actor.auth_user_id = NEW.revoked_by
    WHERE share.record_type = 'prayer_request'
      AND share.record_id = NEW.prayer_request_id
      AND share.branch_id = NEW.branch_id
      AND recipient.auth_user_id = NEW.intercessor_user_id
      AND share.revoked_at = NEW.revoked_at
      AND share.revoked_by = actor.id
      AND share.revocation_reason = NEW.revocation_reason
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_REQUIRES_MATCHING_REVOKED_SHARE') END;
END;

CREATE TRIGGER prayer_assignment_audit_revoke
AFTER UPDATE OF revoked_at ON prayer_assignment
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO prayer_access_audit
    (id, prayer_request_id, branch_id, actor_user_id, action, reason, request_id, safe_metadata, accessed_at)
  VALUES
    ('prayer-revoked-' || NEW.id, NEW.prayer_request_id, NEW.branch_id, NEW.revoked_by,
     'revoked', NEW.revocation_reason, NULL,
     json_object('assignment_id', NEW.id), NEW.revoked_at);
END;

UPDATE app_meta
SET schema_version = 15
WHERE id = 1 AND environment = 'non-production';
