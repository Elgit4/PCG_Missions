-- Align the D1 authorization catalogue to the live six-role CMI policy.
-- Canonical codes are copied from Supabase; explicit Worker aliases mirror the
-- same role and scope. SMS remains ungranted. Directory-read additions are
-- the approved Admin/Coordinator branch and Team Leader team read scopes.

CREATE TABLE authorization_policy_v41_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO authorization_policy_v41_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM role WHERE code IN ('admin_pastor','coordinator','team_leader','field_worker','follow_up_volunteer','prayer_intercessor')) = 6
  AND (SELECT COUNT(*) FROM capability WHERE code IN ('team.read','area.read')) = 2
THEN 1 ELSE 0 END;

-- Keep the existing D1 role IDs: staff assignments use them as foreign keys.
UPDATE role SET name='Admin / Pastor',description='Combined church administration and pastoral leadership role.',is_active=1,created_at='2026-11-10T13:45:38.429931+00:00' WHERE code='admin_pastor';
UPDATE role SET name='Coordinator',description='Coordinates operational follow-up and ministry workflows.',is_active=1,created_at='2026-11-10T13:45:38.429931+00:00' WHERE code='coordinator';
UPDATE role SET name='Field Worker',description='Captures contacts and performs assigned field follow-up.',is_active=1,created_at='2026-11-10T13:45:38.429931+00:00' WHERE code='field_worker';
UPDATE role SET name='Follow-up Volunteer',description='Completes assigned follow-up activities.',is_active=1,created_at='2026-11-10T13:45:38.429931+00:00' WHERE code='follow_up_volunteer';
UPDATE role SET name='Prayer Intercessor',description='Works only with prayer requests assigned to the intercessor.',is_active=1,created_at='2026-11-10T13:45:38.429931+00:00' WHERE code='prayer_intercessor';
UPDATE role SET name='Team Leader',description='Leads an explicitly assigned ministry team.',is_active=1,created_at='2026-11-10T13:45:38.429931+00:00' WHERE code='team_leader';

-- Canonical capability catalogue from live Supabase (IDs retained by code on D1).
INSERT INTO capability (id,code,description,sensitivity,is_active,created_at) VALUES
  ('8df2a7c9-b68c-4694-a5de-44ebbdf3a21d','access.capability.manage','Maintain capability grants and policy configuration.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('a6139fa5-700e-4a19-bf8f-4058f4637684','access.role.assign','Assign or revoke one of the six predefined staff roles.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('c8b22c3a-2300-4c65-8e4a-86bba60db52c','announcement.create.scoped','Draft announcements for an authorized audience.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('6c2d43c9-ca85-4b2a-bbbd-4c8545fb8cd5','announcement.publish.scoped','Publish announcements to an authorized audience.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('2ac609b1-6d99-4741-89b4-3517e1799d35','announcement.read.scoped','Read announcements for authorized audiences.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('10552eb4-8e69-47f3-8647-cb980e9a0741','area.manage','Configure service areas and staff coverage.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('3679eebf-f12a-44d8-9b10-5125563b0394','audit.read.privileged','Read privileged audit metadata.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('4d202d16-5038-449e-b08b-3421f137ad57','calendar.manage.scoped','Manage calendar entries within approved scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('51d74a43-6275-41fa-9156-a2a41cfeb410','calendar.read.scoped','Read calendar entries within approved scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('f5172628-8286-4c38-8a74-ae3a42456d5f','care.directory.read.scoped','Read care groups and directory entries within approved scope.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('54040066-1e26-4e32-a479-20d0259236b0','care.oversight.manage','Manage care records through audited privileged oversight.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('0def8da0-440a-4fcc-8ae1-56d949597db0','care.oversight.read','Read restricted care records through audited privileged oversight.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('fdffddcd-d494-4f39-b221-b98eab9303e2','care.record.read.assigned','Read care records assigned to the requester.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('a99058a6-e082-4e9c-8f76-1ea33e6785c4','care.record.update.assigned','Update assigned care status and interactions.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('61969747-5cc2-41a2-865f-86a007752833','church.settings.manage','Maintain church profile and operational settings.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('13cd40cf-ea61-4281-8e3a-2ff60a88e7c7','contact.assign.scoped','Assign visitors within the role scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('dda514fc-c6fa-41f1-8b9d-81cd745e723c','contact.capture.create','Create a visitor record through the staff capture workflow.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('de6a1554-8cf9-4572-941e-491de39b22cc','contact.export.scoped','Export authorized minimized contact fields.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('31adc03c-2b84-4fff-a0de-a2f628af8f60','contact.identity.capture','Capture visitor phone and email where required for follow-up.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('b63145bf-f455-4316-ab52-411ecead05a9','contact.identity.read.scoped','Read visitor phone and email within the assigned scope.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('d20a9bd3-7094-413a-a111-418e27658896','contact.identity.update.scoped','Update visitor phone and email within the assigned scope.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('b2277dec-0136-41d1-8d63-1dca0653f998','contact.interaction.record','Record visitor calls, visits and follow-up outcomes.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('3e16dd3a-57fc-41bf-ba53-a4b8ef007f51','contact.merge','Merge duplicate contacts through an audited transaction.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('853741a8-ec10-4b33-9f32-56d3b2f21ad6','contact.note.create','Add ordinary non-sensitive visitor follow-up notes.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('7102dcbb-8792-4565-aea2-d2dd2a596079','contact.note.read.scoped','Read ordinary visitor follow-up notes within scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('18af0329-b24f-4e24-8999-138572dbde9e','contact.read.scoped','Read ordinary visitor fields within the assigned scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('9bef3920-2f95-48fc-9b0d-65733c9ba591','contact.update.scoped','Update ordinary visitor fields within the assigned scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('71a6c6d3-ba83-46cc-8e39-838a0371f9c0','content.manage.draft','Create and edit unpublished visitor content.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('8cd20f82-a4ea-4642-b54e-cfd1a05a22e2','content.publish','Publish and hide visitor-facing content.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('10265155-682b-4b0d-8743-fc2cda9a2d6a','event.checkin.scoped','Record attendance at an authorized event.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('84f5e009-c7da-485f-883f-25417902ba9b','event.closeout.review','Review event closeout within approved authority.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('67d3de4a-2912-4741-a2bb-93f212e43d74','event.closeout.submit','Submit event closeout for an authorized event.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('54becaaa-9aed-45c5-9504-22b084f0bc42','event.manage.scoped','Create and update events within authorized scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('e8d1dd7c-821f-49d2-884d-a9512ceb9422','event.read.scoped','Read events within branch or event assignment scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('ab45240d-25ec-4950-ba3d-48bd95c17373','event.registration.manage.scoped','Manage registrations within an authorized event.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('63b95ffd-5a41-422b-b522-26531e641a3c','followup.task.assign.scoped','Assign follow-up tasks within the role scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('ec9fc401-dcc5-4b7d-a619-aa70cb9482f6','followup.task.create','Create follow-up tasks for in-scope visitors.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('f673533b-f73b-42c4-aa46-5c9e050ea776','followup.task.read.scoped','Read follow-up tasks within the role scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('62523d6e-eda7-45c3-b060-ed25ba4182f6','followup.task.update.scoped','Update permitted follow-up task fields and status.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('035e28ef-7561-452b-a281-4f16de1a80d1','prayer.manage.scoped','Coordinate prayer assignment and workflow metadata without implying narrative access.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('7301adf8-c267-4c6f-8af2-76d3a18ef282','prayer.oversight.manage','Manage prayer requests through audited privileged oversight.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('2fdc709f-b193-4740-a52a-4217c9992e83','prayer.oversight.read','Read restricted prayer narratives through audited privileged oversight.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('b05ccbde-b8a0-4367-b8b6-8a9ddb4b7cd9','prayer.request.create','Create a prayer request through an approved workflow.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('63bc3d0f-aa8c-4110-bcca-6195dc927bc4','prayer.request.read.assigned','Read prayer requests actively assigned to the requester.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('cfd84a7d-d666-458e-b748-15c21750b2be','prayer.request.update.assigned','Update permitted fields on an assigned prayer request.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('6013acb2-2fbc-404f-a5ab-afa3e734fc19','report.export.scoped','Export authorized report data.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('cd94f7c8-c9c9-41ca-90ec-64842ee80603','report.read.scoped','Read reports within author, team or event scope.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('c8e07e23-6751-45f0-bdfe-eddd2e452d5b','report.review.scoped','Review, approve or return reports within authority.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('8cf5215d-a26a-43e2-a5af-6951c839e633','report.submit.scoped','Submit permitted ministry reports.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('a6a01c83-0b02-4848-b087-a757fc63dd8a','sms.automation.configure','Configure approved SMS automation rules and templates.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('0b607c18-70b7-4864-8541-4a6bfbb2e15a','sms.automation.pause','Pause or disable an SMS automation rule.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('93d235a9-76ab-4882-82e6-1ec5dd7c849d','sms.campaign.approve','Approve a bulk SMS campaign.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('a87aa138-7d80-40ca-ac28-1c9a1d8ed21a','sms.campaign.create.scoped','Create and preview a bulk SMS campaign.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('11b2ead6-be5d-4300-8714-3151afe10134','sms.campaign.send.scoped','Dispatch an approved campaign within scope and spend limits.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('2bfb20cc-7260-49d4-b594-b14e05d8c7cb','sms.delivery.read.scoped','Read permitted SMS delivery metadata.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('3c698c8c-b87f-45a6-b80e-3e657ed144ca','sms.individual.send.scoped','Send an individual SMS to an eligible in-scope recipient.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('40eda510-6363-4d69-b988-6e9c0adb9621','sms.provider.configure','Configure server-side SMS provider and sender settings.','highly_restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('919931d3-0209-4ee6-975b-9a3dbb7d7cc8','staff.account.manage','Manage existing staff account status and approved recovery.','restricted',1,'2026-11-11T22:14:19.495104+00:00'),
  ('6bdaf8f5-2716-4cb0-b3f8-147bf3ce282b','staff.directory.read','Read the minimum branch staff directory projection.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('8d12c88c-02bc-4bda-8b6b-69434fa2e38b','staff.password_reset.manage','Review staff password-reset requests and issue one-time temporary passwords by email.','restricted',1,'2026-11-11T22:14:28.714977+00:00'),
  ('1eb41791-e285-453f-9793-6142c37f4d2e','team.manage','Manage teams and team memberships.','ordinary',1,'2026-11-11T22:14:19.495104+00:00'),
  ('cap-team-read','team.read','Read teams and permitted membership summary within scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('cap-area-read','area.read','Read service areas and coverage summary within branch scope.','restricted',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET description=excluded.description,sensitivity=excluded.sensitivity,is_active=excluded.is_active,created_at=excluded.created_at;

-- Drop the stale broad Worker seed grants before rebuilding the exact policy.
DELETE FROM role_capability;

-- Canonical grants exactly match the live Supabase role/scope matrix.
WITH source_grants(role_code,capability_code,scope_mode,created_at) AS (
  VALUES
    ('admin_pastor','access.role.assign','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','announcement.create.scoped','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','announcement.read.scoped','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','calendar.manage.scoped','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','calendar.read.scoped','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','care.oversight.read','oversight','2026-11-11T22:14:48.09663+00:00'),
    ('admin_pastor','contact.assign.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.capture.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.identity.capture','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.identity.read.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.identity.update.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.interaction.record','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.note.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.note.read.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.read.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','contact.update.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','content.manage.draft','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','event.manage.scoped','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','event.read.scoped','branch','2026-11-12T22:02:04.108677+00:00'),
    ('admin_pastor','followup.task.assign.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','followup.task.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','followup.task.read.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','followup.task.update.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','prayer.oversight.read','oversight','2026-11-11T22:14:48.09663+00:00'),
    ('admin_pastor','staff.account.manage','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','staff.directory.read','branch','2026-11-11T22:14:28.714977+00:00'),
    ('admin_pastor','staff.password_reset.manage','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contact.assign.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contact.capture.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contact.interaction.record','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contact.note.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contact.note.read.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contact.read.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','contact.update.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','followup.task.assign.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','followup.task.create','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','followup.task.read.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('coordinator','followup.task.update.scoped','branch','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contact.capture.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contact.interaction.record','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contact.note.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contact.note.read.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contact.read.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','contact.update.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','followup.task.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','followup.task.read.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('field_worker','followup.task.update.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','contact.interaction.record','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','contact.note.create','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','contact.note.read.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','contact.read.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','followup.task.read.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('follow_up_volunteer','followup.task.update.scoped','assigned','2026-11-11T22:14:28.714977+00:00'),
    ('prayer_intercessor','prayer.request.read.assigned','assigned','2026-11-11T22:14:48.09663+00:00'),
    ('team_leader','contact.assign.scoped','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contact.capture.create','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contact.interaction.record','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contact.note.create','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contact.note.read.scoped','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contact.read.scoped','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','contact.update.scoped','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','followup.task.assign.scoped','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','followup.task.create','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','followup.task.read.scoped','team','2026-11-11T22:14:28.714977+00:00'),
    ('team_leader','followup.task.update.scoped','team','2026-11-11T22:14:28.714977+00:00')
)
INSERT INTO role_capability (role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,g.scope_mode,g.created_at
FROM source_grants g
JOIN role r ON r.code=g.role_code
JOIN capability c ON c.code=g.capability_code
WHERE 1=1
ON CONFLICT(role_id,capability_id,scope_mode) DO NOTHING;

-- Existing Worker route names mirror canonical role grants without changing scope.
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

-- Explicit directory-read scope: Admin/Pastor + Coordinator at branch level;
-- Team Leaders at team level only. Handler SQL still verifies active membership.
WITH directory_grants(role_code,capability_code,scope_mode) AS (
  VALUES ('admin_pastor','team.read','branch'),('admin_pastor','area.read','branch'),
         ('coordinator','team.read','branch'),('coordinator','area.read','branch'),
         ('team_leader','team.read','team'),('team_leader','area.read','team')
)
INSERT INTO role_capability (role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,g.scope_mode,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM directory_grants g
JOIN role r ON r.code=g.role_code
JOIN capability c ON c.code=g.capability_code
WHERE 1=1
ON CONFLICT(role_id,capability_id,scope_mode) DO NOTHING;

UPDATE app_meta SET schema_version=41 WHERE id=1 AND schema_version=40 AND environment='non-production';
DELETE FROM authorization_policy_v41_guard;
INSERT INTO authorization_policy_v41_guard (ok)
SELECT CASE WHEN (SELECT schema_version FROM app_meta WHERE id=1)=41 THEN 1 ELSE 0 END;
DROP TABLE authorization_policy_v41_guard;
