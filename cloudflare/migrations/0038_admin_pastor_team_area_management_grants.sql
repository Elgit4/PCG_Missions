-- Port of supabase-cmi migration 20261113010000_team_area_administration.sql.
-- The owner-directed policy grants management only to Admin/Pastor at the active
-- branch. The other five roles deliberately receive no team/area management grant.

INSERT INTO role_capability (role_id, capability_id, scope_mode, created_at)
SELECT r.id, c.id, 'branch', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM role r
JOIN capability c ON c.code IN ('team.manage', 'area.manage')
WHERE r.code = 'admin_pastor'
  AND r.is_active = 1
  AND c.is_active = 1
ON CONFLICT (role_id, capability_id, scope_mode) DO NOTHING;

UPDATE app_meta SET schema_version = 38
WHERE id = 1 AND environment = 'non-production';
