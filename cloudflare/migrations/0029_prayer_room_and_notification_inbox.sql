-- Branch-scoped staff prayer room. This is the only collaborative chat surface.
-- Existing prayer_request narratives remain separate and restricted; this room
-- is not a general-purpose chat channel and does not expose pastoral case notes.

INSERT INTO capability (id, code, description, sensitivity, created_at)
VALUES
 ('prayer.room.read','prayer.room.read','Read messages in the branch prayer room.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('prayer.room.post','prayer.room.post','Post messages in the branch prayer room.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET
 description=excluded.description,sensitivity=excluded.sensitivity,is_active=1;

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code IN ('prayer.room.read','prayer.room.post')
WHERE r.code IN (
 'admin_pastor','coordinator','team_leader',
 'field_worker','follow_up_volunteer','prayer_intercessor'
);

CREATE TABLE prayer_room_message (
 id TEXT PRIMARY KEY,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 author_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL
);
CREATE INDEX prayer_room_message_branch_time_idx
 ON prayer_room_message(branch_id,created_at DESC,id DESC);

CREATE TRIGGER prayer_room_message_authorize_insert
BEFORE INSERT ON prayer_room_message
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id
   AND c.code='prayer.room.post' AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.id=NEW.author_profile_id AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
   AND rc.scope_mode='branch'
 ) THEN RAISE(ABORT,'PRAYER_ROOM_POST_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER prayer_room_message_no_update
BEFORE UPDATE ON prayer_room_message
BEGIN SELECT RAISE(ABORT,'PRAYER_ROOM_MESSAGES_IMMUTABLE'); END;
CREATE TRIGGER prayer_room_message_no_delete
BEFORE DELETE ON prayer_room_message
BEGIN SELECT RAISE(ABORT,'PRAYER_ROOM_MESSAGES_IMMUTABLE'); END;

CREATE TABLE prayer_room_access_audit (
 id TEXT PRIMARY KEY,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('read','post')),
 message_id TEXT REFERENCES prayer_room_message(id) ON DELETE RESTRICT,
 accessed_at TEXT NOT NULL
);
CREATE INDEX prayer_room_access_audit_branch_time_idx
 ON prayer_room_access_audit(branch_id,accessed_at DESC);
CREATE TRIGGER prayer_room_access_audit_no_update
BEFORE UPDATE ON prayer_room_access_audit
BEGIN SELECT RAISE(ABORT,'PRAYER_ROOM_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER prayer_room_access_audit_no_delete
BEFORE DELETE ON prayer_room_access_audit
BEGIN SELECT RAISE(ABORT,'PRAYER_ROOM_AUDIT_APPEND_ONLY'); END;

UPDATE app_meta SET schema_version=29
WHERE id=1 AND environment='non-production' AND schema_version=28;


-- Church-wide staff announcements may be delivered to a recipient in another
-- active branch of the same church. Their read receipt remains anchored to the
-- announcement's source branch, while authorization is checked against the
-- recipient's own active branch membership in that same church.
DROP TRIGGER IF EXISTS announcement_read_receipt_authorize_insert;
CREATE TRIGGER announcement_read_receipt_authorize_insert
BEFORE INSERT ON announcement_read_receipt
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM announcement a
  JOIN branch source_branch ON source_branch.id=a.branch_id AND source_branch.is_active=1
  JOIN staff_profile reader ON reader.id=NEW.staff_profile_id
   AND reader.auth_user_id=NEW.read_by AND reader.account_status='active'
  JOIN announcement_delivery d ON d.announcement_id=a.id
   AND d.recipient_ref=reader.id AND d.channel='in_app' AND d.status='delivered'
  JOIN staff_role_assignment ra ON ra.staff_profile_id=reader.id
  JOIN branch reader_branch ON reader_branch.id=ra.branch_id
   AND reader_branch.church_id=source_branch.church_id AND reader_branch.is_active=1
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  WHERE a.id=NEW.announcement_id AND a.branch_id=NEW.branch_id AND a.status='published'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.read_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.read_at)
   AND (a.audience_type='staff' OR ra.branch_id=a.branch_id)
 ) THEN RAISE(ABORT,'ANNOUNCEMENT_READ_NOT_AUTHORIZED') END;
END;


CREATE TRIGGER prayer_room_access_audit_authorize_insert
BEFORE INSERT ON prayer_room_access_audit
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
   AND c.code=CASE WHEN NEW.action='read' THEN 'prayer.room.read' ELSE 'prayer.room.post' END
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.id=NEW.actor_profile_id AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.accessed_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.accessed_at)
   AND rc.scope_mode='branch'
 ) THEN RAISE(ABORT,'PRAYER_ROOM_AUDIT_NOT_AUTHORIZED') END;
 SELECT CASE WHEN NEW.message_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM prayer_room_message m
  WHERE m.id=NEW.message_id AND m.branch_id=NEW.branch_id
 ) THEN RAISE(ABORT,'PRAYER_ROOM_AUDIT_MESSAGE_SCOPE') END;
END;
