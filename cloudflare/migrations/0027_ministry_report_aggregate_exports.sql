-- Aggregate-only report export, restricted to Admin/Pastor and immutably audited.
INSERT INTO capability(id,code,description,sensitivity,is_active,created_at)
VALUES('cap-reports-export','reports.export',
  'Export aggregate ministry metrics and privacy-thresholded report cohorts for the active branch.',
  'restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET
  description=excluded.description,sensitivity=excluded.sensitivity,is_active=excluded.is_active;

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code='reports.export'
WHERE r.code='admin_pastor';

CREATE TABLE ministry_report_export_audit (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  exported_rows INTEGER NOT NULL CHECK(exported_rows BETWEEN 1 AND 5000),
  privacy_threshold INTEGER NOT NULL DEFAULT 3 CHECK(privacy_threshold>=3),
  format TEXT NOT NULL CHECK(format='csv'),
  created_at TEXT NOT NULL,
  CHECK(period_from<=period_to)
);
CREATE INDEX ministry_report_export_audit_branch_time_idx
  ON ministry_report_export_audit(branch_id,created_at DESC);

CREATE TRIGGER ministry_report_export_audit_authorize_insert
BEFORE INSERT ON ministry_report_export_audit
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='branch'
    JOIN capability c ON c.id=rc.capability_id AND c.code='reports.export' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.actor_user_id AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
  ) THEN RAISE(ABORT,'MINISTRY_REPORT_EXPORT_NOT_AUTHORIZED') END;
END;
CREATE TRIGGER ministry_report_export_audit_no_update
BEFORE UPDATE ON ministry_report_export_audit
BEGIN SELECT RAISE(ABORT,'MINISTRY_REPORT_EXPORT_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER ministry_report_export_audit_no_delete
BEFORE DELETE ON ministry_report_export_audit
BEGIN SELECT RAISE(ABORT,'MINISTRY_REPORT_EXPORT_AUDIT_APPEND_ONLY'); END;

UPDATE app_meta SET schema_version=27 WHERE id=1 AND environment='non-production';
