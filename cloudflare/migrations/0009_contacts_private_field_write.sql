-- Keep private demographic/language fields separately writable from general contact updates.
INSERT INTO capability (id, code, description, sensitivity, created_at)
VALUES (
  'contacts.private_fields.update',
  'contacts.private_fields.update',
  'Create or update highly restricted contact fields.',
  'highly_restricted',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(code) DO UPDATE SET
  description = excluded.description,
  sensitivity = excluded.sensitivity,
  is_active = 1;

INSERT OR IGNORE INTO role_capability (role_id, capability_id, scope_mode, created_at)
SELECT r.id, c.id, 'branch', strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r CROSS JOIN capability c
WHERE r.code = 'admin_pastor'
  AND c.code = 'contacts.private_fields.update';

UPDATE app_meta
SET schema_version = 9
WHERE id = 1 AND environment = 'non-production';
