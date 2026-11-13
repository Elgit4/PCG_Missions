-- Deterministic role catalogue and least-privilege capability grants.
-- Non-production policy seed only. No staff assignment is created here.
-- scope_mode must be enforced by Worker authorization against server-derived scope.

INSERT INTO role (id, code, name, description, created_at) VALUES
('role-admin-pastor','admin_pastor','Admin/Pastor','Branch ministry administration and staff access governance; sensitive prayer and pastoral narratives remain separately restricted.',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('role-coordinator','coordinator','Coordinator','Coordinates branch contacts, follow-up, teams, events and communications without staff-security privileges.',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('role-team-leader','team_leader','Team Leader','Leads assigned teams and works only with team-scoped contacts, tasks and operational activity.',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('role-field-worker','field_worker','Field Worker','Captures and updates contacts assigned to the worker and records field interactions.',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('role-follow-up-volunteer','follow_up_volunteer','Follow-up Volunteer','Works assigned follow-up tasks and sees only the minimum contact details needed.',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('role-prayer-intercessor','prayer_intercessor','Prayer Intercessor','Handles explicitly assigned prayer requests; has no visitor CRM access.',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET name=excluded.name, description=excluded.description, is_active=1;

INSERT INTO capability (id,code,description,sensitivity,created_at) VALUES
('contacts.read','contacts.read','Read contact records within granted scope.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('contacts.create','contacts.create','Create a contact in the active branch.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('contacts.update','contacts.update','Update permitted contact fields within granted scope.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('contacts.assign','contacts.assign','Assign or reassign contacts within the active branch.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('contacts.private_fields.read','contacts.private_fields.read','Read private contact fields where separately allowed.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('contacts.interaction.create','contacts.interaction.create','Record a field or follow-up interaction.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('contacts.note.create','contacts.note.create','Create a non-pastoral contact note.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('followup.read','followup.read','Read follow-up tasks within granted scope.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('followup.create','followup.create','Create follow-up tasks in the active branch.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('followup.update','followup.update','Update assigned follow-up task status and permitted fields.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('followup.assign','followup.assign','Assign follow-up tasks within the active branch.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('team.read','team.read','Read team and membership information within scope.','ordinary',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('team.manage','team.manage','Manage branch teams and memberships.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('area.read','area.read','Read service-area information within scope.','ordinary',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('area.manage','area.manage','Manage service areas and staff coverage.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('staff.directory.read','staff.directory.read','Read limited staff directory in the active branch.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('staff.account.manage','staff.account.manage','Create, deactivate and reactivate staff accounts; trigger invitation and reset workflows.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('staff.role.assign','staff.role.assign','Assign and revoke the fixed six-role catalogue in an authorized branch.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('staff.audit.read','staff.audit.read','Read staff access and account administration audit entries.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('events.read','events.read','Read branch events and schedules.','ordinary',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('events.manage','events.manage','Create and manage branch events and registrations.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('events.checkin','events.checkin','Record attendance for explicitly assigned events.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('calendar.read','calendar.read','Read branch calendar entries.','ordinary',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('calendar.manage','calendar.manage','Create and manage branch calendar entries.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('announcements.read','announcements.read','Read branch announcements.','ordinary',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('announcements.manage','announcements.manage','Draft and manage announcements; publication is separately gated.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('content.read','content.read','Read branch content library entries.','ordinary',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('content.manage','content.manage','Create and manage branch content library entries.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('reports.read','reports.read','Read aggregate branch reports without unrestricted record exports.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('prayer.request.read','prayer.request.read','Read prayer requests explicitly assigned or shared with the intercessor.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('prayer.request.respond','prayer.request.respond','Record prayer handling status for explicitly assigned requests.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('pastoral.case.read','pastoral.case.read','Read a pastoral-care case only when explicitly shared.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('pastoral.case.update','pastoral.case.update','Update a pastoral-care case only when explicitly shared.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET description=excluded.description, sensitivity=excluded.sensitivity, is_active=1;

DELETE FROM role_capability WHERE role_id IN (
 SELECT id FROM role WHERE code IN ('admin_pastor','coordinator','team_leader','field_worker','follow_up_volunteer','prayer_intercessor')
);

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-admin-pastor',id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('contacts.read','contacts.create','contacts.update','contacts.assign','contacts.private_fields.read','contacts.interaction.create','contacts.note.create','followup.read','followup.create','followup.update','followup.assign','team.read','team.manage','area.read','area.manage','staff.directory.read','staff.account.manage','staff.role.assign','staff.audit.read','events.read','events.manage','events.checkin','calendar.read','calendar.manage','announcements.read','announcements.manage','content.read','content.manage','reports.read');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-coordinator',id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('contacts.read','contacts.create','contacts.update','contacts.assign','contacts.private_fields.read','contacts.interaction.create','contacts.note.create','followup.read','followup.create','followup.update','followup.assign','team.read','area.read','staff.directory.read','events.read','events.manage','events.checkin','calendar.read','calendar.manage','announcements.read','announcements.manage','content.read','content.manage','reports.read');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-team-leader',id,'team',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('contacts.read','contacts.update','contacts.interaction.create','contacts.note.create','followup.read','followup.create','followup.update','followup.assign','team.read','area.read','events.read','events.checkin','calendar.read','announcements.read','content.read');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-field-worker',id,'assigned',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('contacts.read','contacts.create','contacts.update','contacts.interaction.create','contacts.note.create','followup.read','followup.update','events.read','events.checkin','calendar.read','announcements.read','content.read');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-follow-up-volunteer',id,'assigned',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('followup.read','followup.update','contacts.interaction.create','events.read','calendar.read','announcements.read');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-prayer-intercessor',id,'explicit_share',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('prayer.request.read','prayer.request.respond');

-- No baseline role is granted pastoral.case.*, export, bulk-send or SMS dispatch.
