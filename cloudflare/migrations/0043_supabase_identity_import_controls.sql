-- Safe controls for importing existing CMI identity and audit records.
-- Supabase Auth remains the identity provider; no credentials or auth tokens move.
CREATE TABLE data_migration_control (
  import_key TEXT PRIMARY KEY,
  is_active INTEGER NOT NULL CHECK (is_active IN (0,1)),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO data_migration_control (import_key,is_active,reason,created_at,updated_at)
VALUES (
  'supabase_core_identity',
  0,
  'Controlled import of existing Supabase CMI identity and audit records',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(import_key) DO NOTHING;

-- Suppress the one-time bootstrap side-effect while historical Admin/Pastor
-- assignments are imported. Normal future assignment behavior is unchanged.
DROP TRIGGER staff_role_assignment_admin_bootstrap_consume;

CREATE TRIGGER staff_role_assignment_admin_bootstrap_consume
AFTER INSERT ON staff_role_assignment
WHEN (SELECT code FROM role WHERE id = NEW.role_id) = 'admin_pastor'
  AND NOT EXISTS (
    SELECT 1 FROM staff_role_elevation_request req
    WHERE req.branch_id = NEW.branch_id
      AND req.target_profile_id = NEW.staff_profile_id
      AND req.role_id = NEW.role_id
      AND req.status IN ('approved','applied')
      AND req.reviewed_by = NEW.assigned_by
      AND req.requested_by <> req.reviewed_by
      AND req.reviewed_at <= NEW.starts_at
  )
  AND NOT EXISTS (
    SELECT 1 FROM data_migration_control control
    WHERE control.import_key = 'supabase_core_identity'
      AND control.is_active = 1
  )
BEGIN
  UPDATE staff_admin_bootstrap_state
  SET remaining_slots = remaining_slots - 1
  WHERE id = 1 AND remaining_slots > 0;
  INSERT INTO staff_access_audit
    (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
  VALUES
    ('admin-bootstrap-' || NEW.id, NEW.branch_id, NEW.assigned_by, NEW.staff_profile_id,
     'role_assigned', 'Owner-controlled initial Admin/Pastor bootstrap',
     json_object('bootstrap', 1), NEW.created_at);
END;

UPDATE app_meta
SET schema_version = 43
WHERE id = 1 AND schema_version = 42 AND environment = 'non-production';
