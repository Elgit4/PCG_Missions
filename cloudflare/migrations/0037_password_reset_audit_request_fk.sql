-- Rebuild the reset audit ledger now that its parent request table exists.
-- Preserve its append-only behaviour and convert request_id from an opaque historical
-- reference into a checked D1 foreign key.
DROP TRIGGER IF EXISTS staff_password_reset_audit_no_update;
DROP TRIGGER IF EXISTS staff_password_reset_audit_no_delete;
DROP INDEX IF EXISTS staff_password_reset_audit_request_time_idx;
ALTER TABLE staff_password_reset_audit RENAME TO staff_password_reset_audit_legacy;
CREATE TABLE staff_password_reset_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES staff_password_reset_request(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'requested','notification_sent','notification_failed',
    'approved','denied','reset_completed','expired'
  )),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata)='object'),
  created_at TEXT NOT NULL
);
INSERT INTO staff_password_reset_audit(id,request_id,branch_id,actor_profile_id,event_type,metadata,created_at)
SELECT id,request_id,branch_id,actor_profile_id,event_type,metadata,created_at
FROM staff_password_reset_audit_legacy;
DROP TABLE staff_password_reset_audit_legacy;
CREATE INDEX staff_password_reset_audit_request_time_idx
  ON staff_password_reset_audit(request_id,created_at);
CREATE TRIGGER staff_password_reset_audit_no_update
BEFORE UPDATE ON staff_password_reset_audit
BEGIN SELECT RAISE(ABORT,'STAFF_PASSWORD_RESET_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER staff_password_reset_audit_no_delete
BEFORE DELETE ON staff_password_reset_audit
BEGIN SELECT RAISE(ABORT,'STAFF_PASSWORD_RESET_AUDIT_APPEND_ONLY'); END;
UPDATE app_meta SET schema_version=37
WHERE id=1 AND environment='non-production';
