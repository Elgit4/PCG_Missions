-- Add the explicit compatibility capabilities required by current Worker routes.
-- Migration 0041 is already immutable/applied to rehearsal; this is a forward-only
-- repair so both rehearsal and production converge on the same capability catalogue.

CREATE TABLE authorization_policy_v42_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO authorization_policy_v42_guard (ok)
SELECT CASE WHEN
  (SELECT schema_version FROM app_meta WHERE id=1)=41
  AND (SELECT environment FROM app_meta WHERE id=1)='non-production'
  AND (SELECT COUNT(*) FROM role WHERE code IN ('admin_pastor','coordinator','team_leader','field_worker','follow_up_volunteer','prayer_intercessor'))=6
  AND (SELECT COUNT(*) FROM role_capability) IN (73,128)
  AND (SELECT COUNT(*) FROM capability WHERE code IN ('access.capability.manage','access.role.assign','announcement.create.scoped','announcement.publish.scoped','announcement.read.scoped','area.manage','audit.read.privileged','calendar.manage.scoped','calendar.read.scoped','care.directory.read.scoped','care.oversight.manage','care.oversight.read','care.record.read.assigned','care.record.update.assigned','church.settings.manage','contact.assign.scoped','contact.capture.create','contact.export.scoped','contact.identity.capture','contact.identity.read.scoped','contact.identity.update.scoped','contact.interaction.record','contact.merge','contact.note.create','contact.note.read.scoped','contact.read.scoped','contact.update.scoped','content.manage.draft','content.publish','event.checkin.scoped','event.closeout.review','event.closeout.submit','event.manage.scoped','event.read.scoped','event.registration.manage.scoped','followup.task.assign.scoped','followup.task.create','followup.task.read.scoped','followup.task.update.scoped','prayer.manage.scoped','prayer.oversight.manage','prayer.oversight.read','prayer.request.create','prayer.request.read.assigned','prayer.request.update.assigned','report.export.scoped','report.read.scoped','report.review.scoped','report.submit.scoped','sms.automation.configure','sms.automation.pause','sms.campaign.approve','sms.campaign.create.scoped','sms.campaign.send.scoped','sms.delivery.read.scoped','sms.individual.send.scoped','sms.provider.configure','staff.account.manage','staff.directory.read','staff.password_reset.manage','team.manage'))=61
THEN 1 ELSE 0 END;

-- Worker aliases are separate rows, but their source grants and scope are identical.
INSERT INTO capability (id,code,description,sensitivity,is_active,created_at) VALUES
  ('staff.role.assign','staff.role.assign','Assign standard staff roles using the canonical access.role.assign capability.','highly_restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('staff.role.approve','staff.role.approve','Approve controlled staff-role changes using the canonical access.role.assign capability.','highly_restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('announcements.manage','announcements.manage','Draft announcements; publication remains separately authorized.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('announcements.read','announcements.read','Read branch announcements within the canonical source scope.','ordinary',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('calendar.manage','calendar.manage','Manage calendar entries within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('calendar.read','calendar.read','Read calendar entries within the canonical source scope.','ordinary',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.assign','contacts.assign','Assign contacts within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.create','contacts.create','Create contacts within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.contact_details.read','contacts.contact_details.read','Read identity details within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.private_fields.read','contacts.private_fields.read','Read separately protected identity fields within the canonical source scope.','highly_restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.private_fields.update','contacts.private_fields.update','Update identity fields within the canonical source scope.','highly_restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.interaction.create','contacts.interaction.create','Record interactions within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.note.create','contacts.note.create','Create ordinary contact notes within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.read','contacts.read','Read contacts within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('contacts.update','contacts.update','Update ordinary contact fields within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('content.manage','content.manage','Manage drafts within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('events.checkin','events.checkin','Check in at events within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('events.manage','events.manage','Manage events within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('events.read','events.read','Read events within the canonical source scope.','ordinary',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('followup.assign','followup.assign','Assign follow-up tasks within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('followup.create','followup.create','Create follow-up tasks within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('followup.read','followup.read','Read follow-up tasks within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('followup.update','followup.update','Update follow-up tasks within the canonical source scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('staff.audit.read','staff.audit.read','Worker compatibility capability for privileged staff audit reads; no role is granted this capability.','highly_restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('prayer.request.read','prayer.request.read','Worker compatibility capability for legacy explicit-share prayer reads; no role is granted this capability.','highly_restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('prayer.request.share','prayer.request.share','Worker compatibility capability for prayer sharing; no role is granted this capability.','highly_restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET description=excluded.description,sensitivity=excluded.sensitivity,is_active=1;

-- Retire legacy grants/capabilities not represented in the live six-role policy.
UPDATE capability SET is_active=0 WHERE code NOT IN (
  'access.capability.manage',
  'access.role.assign',
  'announcement.create.scoped',
  'announcement.publish.scoped',
  'announcement.read.scoped',
  'area.manage',
  'audit.read.privileged',
  'calendar.manage.scoped',
  'calendar.read.scoped',
  'care.directory.read.scoped',
  'care.oversight.manage',
  'care.oversight.read',
  'care.record.read.assigned',
  'care.record.update.assigned',
  'church.settings.manage',
  'contact.assign.scoped',
  'contact.capture.create',
  'contact.export.scoped',
  'contact.identity.capture',
  'contact.identity.read.scoped',
  'contact.identity.update.scoped',
  'contact.interaction.record',
  'contact.merge',
  'contact.note.create',
  'contact.note.read.scoped',
  'contact.read.scoped',
  'contact.update.scoped',
  'content.manage.draft',
  'content.publish',
  'event.checkin.scoped',
  'event.closeout.review',
  'event.closeout.submit',
  'event.manage.scoped',
  'event.read.scoped',
  'event.registration.manage.scoped',
  'followup.task.assign.scoped',
  'followup.task.create',
  'followup.task.read.scoped',
  'followup.task.update.scoped',
  'prayer.manage.scoped',
  'prayer.oversight.manage',
  'prayer.oversight.read',
  'prayer.request.create',
  'prayer.request.read.assigned',
  'prayer.request.update.assigned',
  'report.export.scoped',
  'report.read.scoped',
  'report.review.scoped',
  'report.submit.scoped',
  'sms.automation.configure',
  'sms.automation.pause',
  'sms.campaign.approve',
  'sms.campaign.create.scoped',
  'sms.campaign.send.scoped',
  'sms.delivery.read.scoped',
  'sms.individual.send.scoped',
  'sms.provider.configure',
  'staff.account.manage',
  'staff.directory.read',
  'staff.password_reset.manage',
  'team.manage',
  'staff.role.assign',
  'staff.role.approve',
  'announcements.manage',
  'announcements.read',
  'calendar.manage',
  'calendar.read',
  'contacts.assign',
  'contacts.create',
  'contacts.contact_details.read',
  'contacts.private_fields.read',
  'contacts.private_fields.update',
  'contacts.interaction.create',
  'contacts.note.create',
  'contacts.read',
  'contacts.update',
  'content.manage',
  'events.checkin',
  'events.manage',
  'events.read',
  'followup.assign',
  'followup.create',
  'followup.read',
  'followup.update',
  'staff.audit.read',
  'prayer.request.read',
  'prayer.request.share',
  'team.read',
  'area.read'
);

WITH worker_aliases(role_code,capability_code,scope_mode,created_at) AS (
  VALUES
    ('admin_pastor','staff.role.assign','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','staff.role.approve','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','announcements.manage','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','announcements.read','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','calendar.manage','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','calendar.read','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','contacts.assign','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contacts.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contacts.contact_details.read','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contacts.private_fields.read','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contacts.private_fields.update','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contacts.interaction.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contacts.note.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contacts.read','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contacts.update','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','content.manage','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','events.manage','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','events.read','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','followup.assign','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','followup.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','followup.read','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','followup.update','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contacts.assign','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contacts.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contacts.interaction.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contacts.note.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contacts.read','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contacts.update','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','followup.assign','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','followup.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','followup.read','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','followup.update','branch','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contacts.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contacts.interaction.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contacts.note.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contacts.read','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contacts.update','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','followup.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','followup.read','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','followup.update','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','contacts.interaction.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','contacts.note.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','contacts.read','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','followup.read','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','followup.update','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contacts.assign','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contacts.create','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contacts.interaction.create','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contacts.note.create','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contacts.read','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contacts.update','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','followup.assign','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','followup.create','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','followup.read','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','followup.update','team','2026-11-11T22:14:28.714977+00:00')
)
INSERT INTO role_capability (role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,g.scope_mode,g.created_at
FROM worker_aliases g
JOIN role r ON r.code=g.role_code
JOIN capability c ON c.code=g.capability_code
WHERE 1=1
ON CONFLICT(role_id,capability_id,scope_mode) DO NOTHING;

UPDATE app_meta SET schema_version=42 WHERE id=1 AND schema_version=41 AND environment='non-production';
DELETE FROM authorization_policy_v42_guard;
INSERT INTO authorization_policy_v42_guard (ok)
SELECT CASE WHEN
  (SELECT schema_version FROM app_meta WHERE id=1)=42
  AND (SELECT COUNT(*) FROM role_capability)=128
  AND (SELECT COUNT(*) FROM capability WHERE is_active=1)=89
THEN 1 ELSE 0 END;
DROP TABLE authorization_policy_v42_guard;
