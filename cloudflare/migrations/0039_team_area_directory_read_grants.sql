-- Add explicit, least-privilege directory-read grants for the team and
-- service-area workspace. Management remains a separate capability.
-- Admin/Pastor and Coordinator may read the active branch directory.
-- Team Leaders may read only teams to which they have active leader membership.

INSERT INTO capability (id, code, description, sensitivity, created_at)
VALUES
  ('cap-team-read', 'team.read', 'Read teams and permitted membership summary within scope.', 'restricted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('cap-area-read', 'area.read', 'Read service areas and coverage summary within branch scope.', 'restricted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_capability (role_id, capability_id, scope_mode, created_at)
SELECT r.id, c.id, 'branch', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM role r
JOIN capability c ON
  (r.code IN ('admin_pastor', 'coordinator') AND c.code IN ('team.read', 'area.read'))
WHERE r.is_active = 1 AND c.is_active = 1
ON CONFLICT (role_id, capability_id, scope_mode) DO NOTHING;

INSERT INTO role_capability (role_id, capability_id, scope_mode, created_at)
SELECT r.id, c.id, 'team', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM role r
JOIN capability c ON c.code = 'team.read'
WHERE r.code = 'team_leader' AND r.is_active = 1 AND c.is_active = 1
ON CONFLICT (role_id, capability_id, scope_mode) DO NOTHING;

UPDATE app_meta SET schema_version = 39
WHERE id = 1 AND environment = 'non-production' AND schema_version = 38;
