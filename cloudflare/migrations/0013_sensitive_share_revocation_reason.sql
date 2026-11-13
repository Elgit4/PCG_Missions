-- Require an explicit reason when revoking a high-sensitivity record share.
ALTER TABLE staff_record_share ADD COLUMN revocation_reason TEXT;

CREATE TRIGGER staff_record_share_revoke_reason_required
BEFORE UPDATE OF revoked_at ON staff_record_share
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.revocation_reason IS NULL
      OR length(trim(NEW.revocation_reason)) < 10
      OR length(trim(NEW.revocation_reason)) > 300
    THEN RAISE(ABORT, 'SENSITIVE_SHARE_REVOCATION_REASON_REQUIRED') END;
END;

DROP TRIGGER staff_record_share_audit_revoke;
CREATE TRIGGER staff_record_share_audit_revoke
AFTER UPDATE OF revoked_at ON staff_record_share
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO sensitive_record_access_audit
    (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
  VALUES
    ('share-revoke-' || NEW.id, NEW.branch_id, NEW.revoked_by, NEW.record_type, NEW.record_id,
     'share_revoked', COALESCE(NEW.revocation_reason, NEW.purpose), NEW.id, NEW.revoked_at);
END;

UPDATE app_meta
SET schema_version = 13
WHERE id = 1 AND environment = 'non-production';
