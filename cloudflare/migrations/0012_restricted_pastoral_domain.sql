-- Restricted prayer and pastoral-care domain.
-- Narrative access is server-mediated, explicitly shared, branch-bound and audited.
CREATE TABLE prayer_request (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  contact_id TEXT,
  created_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  request_text TEXT NOT NULL CHECK (length(trim(request_text)) > 0),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','assigned','in_progress','answered','closed','expired')),
  sensitivity TEXT NOT NULL DEFAULT 'restricted'
    CHECK (sensitivity IN ('restricted','highly_restricted')),
  expires_at TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, branch_id),
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK ((status = 'answered' AND answered_at IS NOT NULL)
      OR (status <> 'answered' AND answered_at IS NULL))
);
CREATE INDEX prayer_request_branch_status_time_idx
  ON prayer_request(branch_id, status, created_at DESC);
CREATE INDEX prayer_request_contact_time_idx
  ON prayer_request(contact_id, created_at DESC) WHERE contact_id IS NOT NULL;

CREATE TABLE prayer_assignment (
  id TEXT PRIMARY KEY,
  prayer_request_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  intercessor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (prayer_request_id, branch_id) REFERENCES prayer_request(id, branch_id) ON DELETE RESTRICT,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (revoked_at IS NULL OR revoked_at >= starts_at),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);
CREATE UNIQUE INDEX prayer_assignment_one_active_user_request_idx
  ON prayer_assignment(intercessor_user_id, prayer_request_id)
  WHERE ends_at IS NULL AND revoked_at IS NULL;
CREATE INDEX prayer_assignment_request_idx ON prayer_assignment(prayer_request_id, starts_at DESC);
CREATE TRIGGER prayer_assignment_no_overlap_insert
BEFORE INSERT ON prayer_assignment
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM prayer_assignment existing
    WHERE existing.intercessor_user_id = NEW.intercessor_user_id
      AND existing.prayer_request_id = NEW.prayer_request_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_OVERLAP') END;
END;
CREATE TRIGGER prayer_assignment_no_overlap_update
BEFORE UPDATE OF intercessor_user_id, prayer_request_id, starts_at, ends_at, revoked_at ON prayer_assignment
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM prayer_assignment existing
    WHERE existing.id <> NEW.id
      AND existing.intercessor_user_id = NEW.intercessor_user_id
      AND existing.prayer_request_id = NEW.prayer_request_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_OVERLAP') END;
END;
CREATE TRIGGER prayer_assignment_immutable_fields
BEFORE UPDATE OF id, prayer_request_id, branch_id, intercessor_user_id, assigned_by, starts_at, created_at ON prayer_assignment
BEGIN
  SELECT RAISE(ABORT, 'PRAYER_ASSIGNMENT_IMMUTABLE_FIELDS');
END;
CREATE TRIGGER prayer_assignment_authorize_insert
BEFORE INSERT ON prayer_assignment
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1 AND c.code = 'prayer.request.share'
    WHERE actor.auth_user_id = NEW.assigned_by
      AND actor.account_status = 'active'
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.starts_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.starts_at)
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_ACTOR_NOT_AUTHORIZED') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile recipient
    JOIN staff_role_assignment ra ON ra.staff_profile_id = recipient.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    WHERE recipient.auth_user_id = NEW.intercessor_user_id
      AND recipient.account_status = 'active'
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.starts_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.starts_at)
      AND r.code = 'prayer_intercessor'
      AND c.code = 'prayer.request.read'
      AND rc.scope_mode = 'explicit_share'
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_RECIPIENT_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER prayer_assignment_requires_active_share
BEFORE INSERT ON prayer_assignment
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_record_share share
    JOIN staff_profile recipient ON recipient.id = share.staff_profile_id
    JOIN staff_profile grantor ON grantor.id = share.granted_by
    WHERE share.record_type = 'prayer_request'
      AND share.record_id = NEW.prayer_request_id
      AND share.branch_id = NEW.branch_id
      AND recipient.auth_user_id = NEW.intercessor_user_id
      AND grantor.auth_user_id = NEW.assigned_by
      AND share.revoked_at IS NULL
      AND share.starts_at <= NEW.starts_at
      AND (share.ends_at IS NULL OR share.ends_at > NEW.starts_at)
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_REQUIRES_ACTIVE_EXPLICIT_SHARE') END;
END;

CREATE TRIGGER prayer_assignment_authorize_revoke
BEFORE UPDATE OF revoked_at, revoked_by ON prayer_assignment
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.revoked_by IS NULL OR NEW.revoked_at < OLD.starts_at
    THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_REVOCATION_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1 AND c.code = 'prayer.request.share'
    WHERE actor.auth_user_id = NEW.revoked_by
      AND actor.account_status = 'active'
      AND ra.branch_id = OLD.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.revoked_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.revoked_at)
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_REVOKE_NOT_AUTHORIZED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_record_share share
    JOIN staff_profile actor ON actor.id = share.revoked_by
    JOIN staff_profile recipient ON recipient.id = share.staff_profile_id
    WHERE share.record_type = 'prayer_request'
      AND share.record_id = OLD.prayer_request_id
      AND share.branch_id = OLD.branch_id
      AND recipient.auth_user_id = OLD.intercessor_user_id
      AND actor.auth_user_id = NEW.revoked_by
      AND share.revoked_at = NEW.revoked_at
  ) THEN RAISE(ABORT, 'PRAYER_ASSIGNMENT_SHARE_NOT_REVOKED') END;
END;

CREATE TABLE prayer_access_audit (
  id TEXT PRIMARY KEY,
  prayer_request_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('read','update','assign','revoke','oversight')),
  reason TEXT,
  request_id TEXT,
  accessed_at TEXT NOT NULL,
  safe_metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(safe_metadata) AND json_type(safe_metadata) = 'object'),
  FOREIGN KEY (prayer_request_id, branch_id) REFERENCES prayer_request(id, branch_id) ON DELETE RESTRICT,
  CHECK (action <> 'oversight' OR length(trim(COALESCE(reason,''))) > 0)
);
CREATE INDEX prayer_access_audit_record_time_idx ON prayer_access_audit(prayer_request_id, accessed_at DESC);
CREATE INDEX prayer_access_audit_actor_time_idx ON prayer_access_audit(actor_user_id, accessed_at DESC);
CREATE TRIGGER prayer_access_audit_no_update BEFORE UPDATE ON prayer_access_audit
BEGIN SELECT RAISE(ABORT, 'PRAYER_ACCESS_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER prayer_access_audit_no_delete BEFORE DELETE ON prayer_access_audit
BEGIN SELECT RAISE(ABORT, 'PRAYER_ACCESS_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER prayer_assignment_audit_insert
AFTER INSERT ON prayer_assignment
BEGIN
  INSERT INTO prayer_access_audit
    (id, prayer_request_id, branch_id, actor_user_id, action, reason, accessed_at, safe_metadata)
  VALUES ('prayer-assigned-' || NEW.id, NEW.prayer_request_id, NEW.branch_id, NEW.assigned_by,
          'assign', 'Prayer request assigned to an authorized intercessor',
          NEW.created_at, json_object('assignment_id', NEW.id));
END;
CREATE TRIGGER prayer_assignment_audit_revoke
AFTER UPDATE OF revoked_at ON prayer_assignment
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO prayer_access_audit
    (id, prayer_request_id, branch_id, actor_user_id, action, reason, accessed_at, safe_metadata)
  VALUES ('prayer-revoked-' || NEW.id, NEW.prayer_request_id, NEW.branch_id, NEW.revoked_by,
          'revoke', 'Prayer request assignment revoked',
          NEW.revoked_at, json_object('assignment_id', NEW.id));
END;

CREATE TABLE care_group (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE (id, branch_id)
);
CREATE UNIQUE INDEX care_group_active_name_branch_idx ON care_group(branch_id, lower(name)) WHERE is_active = 1;

CREATE TABLE care_group_membership (
  id TEXT PRIMARY KEY,
  care_group_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (care_group_id, branch_id) REFERENCES care_group(id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX care_group_membership_one_active_contact_idx
  ON care_group_membership(care_group_id, contact_id) WHERE ends_at IS NULL;
CREATE INDEX care_group_membership_contact_active_idx
  ON care_group_membership(contact_id, care_group_id) WHERE ends_at IS NULL;
CREATE TRIGGER care_group_membership_no_overlap_insert
BEFORE INSERT ON care_group_membership
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM care_group_membership existing
    WHERE existing.care_group_id = NEW.care_group_id
      AND existing.contact_id = NEW.contact_id
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'CARE_GROUP_MEMBERSHIP_OVERLAP') END;
END;
CREATE TRIGGER care_group_membership_no_overlap_update
BEFORE UPDATE OF care_group_id, contact_id, starts_at, ends_at ON care_group_membership
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM care_group_membership existing
    WHERE existing.id <> NEW.id
      AND existing.care_group_id = NEW.care_group_id
      AND existing.contact_id = NEW.contact_id
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'CARE_GROUP_MEMBERSHIP_OVERLAP') END;
END;

CREATE TABLE care_record (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  contact_id TEXT NOT NULL,
  care_group_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','active','monitoring','resolved','closed')),
  created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, branch_id),
  FOREIGN KEY (contact_id, branch_id) REFERENCES contact(id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY (care_group_id, branch_id) REFERENCES care_group(id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX care_record_branch_status_idx ON care_record(branch_id, status, created_at DESC);
CREATE INDEX care_record_contact_idx ON care_record(contact_id, created_at DESC);

CREATE TABLE care_assignment (
  id TEXT PRIMARY KEY,
  care_record_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  assignee_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (care_record_id, branch_id) REFERENCES care_record(id, branch_id) ON DELETE RESTRICT,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (revoked_at IS NULL OR revoked_at >= starts_at),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);
CREATE UNIQUE INDEX care_assignment_one_active_assignee_record_idx
  ON care_assignment(assignee_user_id, care_record_id) WHERE ends_at IS NULL AND revoked_at IS NULL;
CREATE INDEX care_assignment_record_idx ON care_assignment(care_record_id, assignee_user_id)
  WHERE ends_at IS NULL AND revoked_at IS NULL;
CREATE TRIGGER care_assignment_no_overlap_insert
BEFORE INSERT ON care_assignment
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM care_assignment existing
    WHERE existing.assignee_user_id = NEW.assignee_user_id
      AND existing.care_record_id = NEW.care_record_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'CARE_ASSIGNMENT_OVERLAP') END;
END;
CREATE TRIGGER care_assignment_no_overlap_update
BEFORE UPDATE OF assignee_user_id, care_record_id, starts_at, ends_at, revoked_at ON care_assignment
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM care_assignment existing
    WHERE existing.id <> NEW.id
      AND existing.assignee_user_id = NEW.assignee_user_id
      AND existing.care_record_id = NEW.care_record_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'CARE_ASSIGNMENT_OVERLAP') END;
END;

CREATE TABLE care_interaction (
  id TEXT PRIMARY KEY,
  care_record_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call','visit','meeting','other')),
  outcome_code TEXT CHECK (outcome_code IS NULL OR outcome_code GLOB '[a-z][a-z0-9_]*' AND length(outcome_code) BETWEEN 2 AND 60),
  restricted_note TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (care_record_id, branch_id) REFERENCES care_record(id, branch_id) ON DELETE RESTRICT
);
CREATE INDEX care_interaction_record_time_idx ON care_interaction(care_record_id, occurred_at DESC);
CREATE INDEX care_interaction_actor_time_idx ON care_interaction(actor_user_id, occurred_at DESC);


CREATE TRIGGER prayer_assignment_no_delete BEFORE DELETE ON prayer_assignment
BEGIN SELECT RAISE(ABORT, 'PRAYER_ASSIGNMENT_HISTORY_PRESERVED'); END;
CREATE TRIGGER prayer_assignment_end_requires_revocation
BEFORE UPDATE OF ends_at ON prayer_assignment
WHEN OLD.ends_at IS NULL AND NEW.ends_at IS NOT NULL AND NEW.revoked_at IS NULL
BEGIN SELECT RAISE(ABORT, 'PRAYER_ASSIGNMENT_END_REQUIRES_REVOKE'); END;

CREATE TRIGGER care_group_membership_no_delete BEFORE DELETE ON care_group_membership
BEGIN SELECT RAISE(ABORT, 'CARE_GROUP_MEMBERSHIP_HISTORY_PRESERVED'); END;
CREATE TRIGGER care_assignment_no_delete BEFORE DELETE ON care_assignment
BEGIN SELECT RAISE(ABORT, 'CARE_ASSIGNMENT_HISTORY_PRESERVED'); END;
CREATE TRIGGER care_interaction_no_update BEFORE UPDATE ON care_interaction
BEGIN SELECT RAISE(ABORT, 'CARE_INTERACTION_APPEND_ONLY'); END;
CREATE TRIGGER care_interaction_no_delete BEFORE DELETE ON care_interaction
BEGIN SELECT RAISE(ABORT, 'CARE_INTERACTION_APPEND_ONLY'); END;

CREATE TABLE care_access_audit (
  id TEXT PRIMARY KEY,
  care_record_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('read','update','assign','revoke','oversight')),
  reason TEXT,
  request_id TEXT,
  accessed_at TEXT NOT NULL,
  safe_metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(safe_metadata) AND json_type(safe_metadata) = 'object'),
  FOREIGN KEY (care_record_id, branch_id) REFERENCES care_record(id, branch_id) ON DELETE RESTRICT,
  CHECK (action <> 'oversight' OR length(trim(COALESCE(reason,''))) > 0)
);
CREATE INDEX care_access_audit_record_time_idx ON care_access_audit(care_record_id, accessed_at DESC);
CREATE INDEX care_access_audit_actor_time_idx ON care_access_audit(actor_user_id, accessed_at DESC);
CREATE TRIGGER care_access_audit_no_update BEFORE UPDATE ON care_access_audit
BEGIN SELECT RAISE(ABORT, 'CARE_ACCESS_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER care_access_audit_no_delete BEFORE DELETE ON care_access_audit
BEGIN SELECT RAISE(ABORT, 'CARE_ACCESS_AUDIT_APPEND_ONLY'); END;

CREATE TRIGGER prayer_request_set_updated_at
AFTER UPDATE ON prayer_request
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE prayer_request SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
CREATE TRIGGER care_record_set_updated_at
AFTER UPDATE ON care_record
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE care_record SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

UPDATE app_meta
SET schema_version = 12
WHERE id = 1 AND environment = 'non-production';
