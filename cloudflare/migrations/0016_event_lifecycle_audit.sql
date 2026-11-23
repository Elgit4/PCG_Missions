-- Add an append-only audit trail and database-enforced actor checks for event lifecycle changes.
-- Additive non-production migration 0016; never rewrite the already-applied 0001-0015 history.

ALTER TABLE event
  ADD COLUMN last_modified_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;

UPDATE event
SET last_modified_by = created_by
WHERE last_modified_by IS NULL;

CREATE TABLE event_change_audit (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('created','updated','published','cancelled')),
  before_state TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(before_state) AND json_type(before_state)='object'),
  after_state TEXT NOT NULL CHECK(json_valid(after_state) AND json_type(after_state)='object'),
  created_at TEXT NOT NULL,
  FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT
);

CREATE INDEX event_change_audit_branch_created_idx
  ON event_change_audit(branch_id,created_at DESC,id DESC);
CREATE INDEX event_change_audit_event_created_idx
  ON event_change_audit(event_id,created_at DESC,id DESC);

CREATE TRIGGER event_last_modified_actor_required
BEFORE INSERT ON event
WHEN NEW.last_modified_by IS NULL OR NEW.last_modified_by <> NEW.created_by
BEGIN
  SELECT RAISE(ABORT,'EVENT_CREATOR_AND_INITIAL_MODIFIER_MUST_MATCH');
END;

CREATE TRIGGER event_authorize_update
BEFORE UPDATE ON event
BEGIN
  SELECT CASE WHEN NEW.last_modified_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.code='events.manage' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.last_modified_by
      AND actor.account_status='active'
      AND ra.revoked_at IS NULL
      AND ra.starts_at<=NEW.updated_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.updated_at)
      AND rc.scope_mode='branch'
  ) THEN RAISE(ABORT,'EVENT_UPDATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER event_change_audit_after_insert
AFTER INSERT ON event
BEGIN
  INSERT INTO event_change_audit
    (id,event_id,branch_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT
    'event-create-' || NEW.id, NEW.id, NEW.branch_id, actor.id, NEW.last_modified_by,
    'created', '{}',
    json_object(
      'title',NEW.title,'description',NEW.description,'starts_at',NEW.starts_at,
      'ends_at',NEW.ends_at,'timezone',NEW.timezone,'location',NEW.location,
      'capacity',NEW.capacity,'registration_state',NEW.registration_state,
      'visibility',NEW.visibility,'status',NEW.status,'transport_enabled',NEW.transport_enabled
    ),
    NEW.created_at
  FROM staff_profile actor
  WHERE actor.auth_user_id=NEW.last_modified_by;
END;

CREATE TRIGGER event_change_audit_after_update
AFTER UPDATE ON event
BEGIN
  INSERT INTO event_change_audit
    (id,event_id,branch_id,actor_profile_id,actor_user_id,action,before_state,after_state,created_at)
  SELECT
    'event-change-' || lower(hex(randomblob(16))), NEW.id, NEW.branch_id,
    actor.id, NEW.last_modified_by,
    CASE
      WHEN OLD.status<>'published' AND NEW.status='published' THEN 'published'
      WHEN OLD.status<>'cancelled' AND NEW.status='cancelled' THEN 'cancelled'
      ELSE 'updated'
    END,
    json_object(
      'title',OLD.title,'description',OLD.description,'starts_at',OLD.starts_at,
      'ends_at',OLD.ends_at,'timezone',OLD.timezone,'location',OLD.location,
      'capacity',OLD.capacity,'registration_state',OLD.registration_state,
      'visibility',OLD.visibility,'status',OLD.status,'transport_enabled',OLD.transport_enabled
    ),
    json_object(
      'title',NEW.title,'description',NEW.description,'starts_at',NEW.starts_at,
      'ends_at',NEW.ends_at,'timezone',NEW.timezone,'location',NEW.location,
      'capacity',NEW.capacity,'registration_state',NEW.registration_state,
      'visibility',NEW.visibility,'status',NEW.status,'transport_enabled',NEW.transport_enabled
    ),
    NEW.updated_at
  FROM staff_profile actor
  WHERE actor.auth_user_id=NEW.last_modified_by;
END;

CREATE TRIGGER event_change_audit_no_update
BEFORE UPDATE ON event_change_audit
BEGIN
  SELECT RAISE(ABORT,'EVENT_CHANGE_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER event_change_audit_no_delete
BEFORE DELETE ON event_change_audit
BEGIN
  SELECT RAISE(ABORT,'EVENT_CHANGE_AUDIT_APPEND_ONLY');
END;

UPDATE app_meta
SET schema_version=16
WHERE id=1 AND environment='non-production';
