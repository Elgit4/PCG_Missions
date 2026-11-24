-- Preserve approved password-reset audit history without migrating live reset requests.
-- The source request table contains one-time recovery workflow state and is excluded.
-- request_id is therefore retained as an opaque historical reference, not a D1 FK.
-- This migration is additive and restricted to the isolated non-production database.

CREATE TABLE staff_password_reset_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  branch_id TEXT REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'requested', 'notification_sent', 'notification_failed',
    'approved', 'denied', 'reset_completed', 'expired'
  )),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
  created_at TEXT NOT NULL
);

CREATE INDEX staff_password_reset_audit_request_time_idx
  ON staff_password_reset_audit(request_id, created_at);

CREATE TRIGGER staff_password_reset_audit_no_update
BEFORE UPDATE ON staff_password_reset_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_PASSWORD_RESET_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER staff_password_reset_audit_no_delete
BEFORE DELETE ON staff_password_reset_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_PASSWORD_RESET_AUDIT_APPEND_ONLY');
END;

UPDATE app_meta
SET schema_version = 28
WHERE id = 1
  AND environment = 'non-production'
  AND schema_version = 27;
