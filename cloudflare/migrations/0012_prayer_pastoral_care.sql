-- Restricted prayer and pastoral-care domain for the non-production D1 migration.
-- Narrative reads must be mediated by Worker handlers that write the matching
-- access-audit row in the same D1 batch before returning any narrative fields.
-- No generic contact, report, search, export, or notification query may join these narratives.

INSERT INTO capability (id, code, description, sensitivity, created_at)
VALUES
 ('prayer.request.create','prayer.request.create','Create a private prayer request without granting narrative read access.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('pastoral.case.create','pastoral.case.create','Create a restricted pastoral-care record.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET description=excluded.description,sensitivity=excluded.sensitivity,is_active=1;

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code='prayer.request.create'
WHERE r.code IN ('admin_pastor','coordinator');

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code='pastoral.case.create'
WHERE r.code='admin_pastor';

CREATE TABLE prayer_request (
 id TEXT PRIMARY KEY,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 contact_id TEXT,
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 request_text TEXT NOT NULL CHECK(length(trim(request_text)) BETWEEN 1 AND 10000),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','answered','closed','expired')),
 sensitivity TEXT NOT NULL DEFAULT 'restricted' CHECK(sensitivity IN ('restricted','highly_restricted')),
 expires_at TEXT,
 answered_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(id,branch_id),
 FOREIGN KEY(contact_id,branch_id) REFERENCES contact(id,branch_id) ON DELETE RESTRICT,
 CHECK(expires_at IS NULL OR expires_at > created_at),
 CHECK((status='answered' AND answered_at IS NOT NULL) OR (status<>'answered' AND answered_at IS NULL))
);
CREATE INDEX prayer_request_branch_status_idx ON prayer_request(branch_id,status,created_at DESC);

CREATE TABLE prayer_assignment (
 id TEXT PRIMARY KEY,
 prayer_request_id TEXT NOT NULL REFERENCES prayer_request(id) ON DELETE RESTRICT,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 intercessor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 assigned_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 starts_at TEXT NOT NULL,
 ends_at TEXT,
 revoked_at TEXT,
 created_at TEXT NOT NULL,
 CHECK(ends_at IS NULL OR ends_at > starts_at),
 CHECK(revoked_at IS NULL OR revoked_at >= starts_at),
 FOREIGN KEY(prayer_request_id,branch_id) REFERENCES prayer_request(id,branch_id) ON DELETE RESTRICT
);
CREATE INDEX prayer_assignment_active_intercessor_idx ON prayer_assignment(intercessor_user_id,branch_id,starts_at,ends_at) WHERE revoked_at IS NULL;
CREATE INDEX prayer_assignment_request_idx ON prayer_assignment(prayer_request_id,starts_at DESC);

CREATE TRIGGER prayer_assignment_authorize_insert
BEFORE INSERT ON prayer_assignment
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM prayer_request p
  JOIN staff_profile actor ON actor.auth_user_id=NEW.assigned_by AND actor.account_status='active'
  JOIN staff_role_assignment ara ON ara.staff_profile_id=actor.id AND ara.branch_id=NEW.branch_id
  JOIN role ar ON ar.id=ara.role_id AND ar.is_active=1
  JOIN role_capability arc ON arc.role_id=ar.id
  JOIN capability ac ON ac.id=arc.capability_id AND ac.code='prayer.request.share' AND ac.is_active=1
  JOIN staff_profile target ON target.auth_user_id=NEW.intercessor_user_id AND target.account_status='active'
  JOIN staff_role_assignment tra ON tra.staff_profile_id=target.id AND tra.branch_id=NEW.branch_id
  JOIN role tr ON tr.id=tra.role_id AND tr.code='prayer_intercessor' AND tr.is_active=1
  WHERE p.id=NEW.prayer_request_id AND p.branch_id=NEW.branch_id
   AND ara.revoked_at IS NULL AND ara.starts_at<=NEW.starts_at AND (ara.ends_at IS NULL OR ara.ends_at>NEW.starts_at)
   AND tra.revoked_at IS NULL AND tra.starts_at<=NEW.starts_at AND (tra.ends_at IS NULL OR tra.ends_at>NEW.starts_at)
 ) THEN RAISE(ABORT,'PRAYER_ASSIGNMENT_NOT_AUTHORIZED') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM prayer_assignment old
  WHERE old.prayer_request_id=NEW.prayer_request_id AND old.intercessor_user_id=NEW.intercessor_user_id
   AND old.revoked_at IS NULL
   AND COALESCE(old.ends_at,'9999-12-31T23:59:59.999Z')>NEW.starts_at
   AND COALESCE(NEW.ends_at,'9999-12-31T23:59:59.999Z')>old.starts_at
 ) THEN RAISE(ABORT,'PRAYER_ASSIGNMENT_OVERLAP') END;
END;

CREATE TRIGGER prayer_assignment_no_update_sensitive_fields
BEFORE UPDATE OF prayer_request_id,branch_id,intercessor_user_id,assigned_by,starts_at,created_at ON prayer_assignment
BEGIN SELECT RAISE(ABORT,'PRAYER_ASSIGNMENT_IMMUTABLE_FIELDS'); END;

CREATE TABLE prayer_access_audit (
 id TEXT PRIMARY KEY,
 prayer_request_id TEXT NOT NULL REFERENCES prayer_request(id) ON DELETE RESTRICT,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('read','created','updated','assigned','revoked','oversight')),
 reason TEXT,
 request_id TEXT,
 safe_metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(safe_metadata) AND json_type(safe_metadata)='object'),
 accessed_at TEXT NOT NULL,
 FOREIGN KEY(prayer_request_id,branch_id) REFERENCES prayer_request(id,branch_id) ON DELETE RESTRICT,
 CHECK(action NOT IN ('oversight') OR length(trim(COALESCE(reason,''))) BETWEEN 10 AND 300)
);
CREATE INDEX prayer_access_audit_branch_time_idx ON prayer_access_audit(branch_id,accessed_at DESC);
CREATE INDEX prayer_access_audit_record_time_idx ON prayer_access_audit(prayer_request_id,accessed_at DESC);
CREATE TRIGGER prayer_access_audit_no_update BEFORE UPDATE ON prayer_access_audit BEGIN SELECT RAISE(ABORT,'PRAYER_ACCESS_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER prayer_access_audit_no_delete BEFORE DELETE ON prayer_access_audit BEGIN SELECT RAISE(ABORT,'PRAYER_ACCESS_AUDIT_APPEND_ONLY'); END;

CREATE TABLE care_group (
 id TEXT PRIMARY KEY,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 description TEXT,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL,
 UNIQUE(id,branch_id)
);
CREATE UNIQUE INDEX care_group_active_name_idx ON care_group(branch_id,lower(name)) WHERE is_active=1;

CREATE TABLE care_group_membership (
 id TEXT PRIMARY KEY,
 care_group_id TEXT NOT NULL,
 contact_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 starts_at TEXT NOT NULL,
 ends_at TEXT,
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL,
 CHECK(ends_at IS NULL OR ends_at>starts_at),
 FOREIGN KEY(care_group_id,branch_id) REFERENCES care_group(id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(contact_id,branch_id) REFERENCES contact(id,branch_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX care_group_membership_active_idx ON care_group_membership(care_group_id,contact_id) WHERE ends_at IS NULL;

CREATE TABLE care_record (
 id TEXT PRIMARY KEY,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 contact_id TEXT NOT NULL,
 care_group_id TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','active','monitoring','resolved','closed')),
 created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 reviewed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(id,branch_id),
 FOREIGN KEY(contact_id,branch_id) REFERENCES contact(id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY(care_group_id,branch_id) REFERENCES care_group(id,branch_id) ON DELETE RESTRICT
);
CREATE INDEX care_record_branch_status_idx ON care_record(branch_id,status,created_at DESC);

CREATE TABLE care_assignment (
 id TEXT PRIMARY KEY,
 care_record_id TEXT NOT NULL,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 assignee_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 assigned_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 starts_at TEXT NOT NULL,
 ends_at TEXT,
 revoked_at TEXT,
 created_at TEXT NOT NULL,
 CHECK(ends_at IS NULL OR ends_at>starts_at),
 CHECK(revoked_at IS NULL OR revoked_at>=starts_at),
 FOREIGN KEY(care_record_id,branch_id) REFERENCES care_record(id,branch_id) ON DELETE RESTRICT
);
CREATE INDEX care_assignment_active_idx ON care_assignment(assignee_user_id,branch_id,starts_at,ends_at) WHERE revoked_at IS NULL;

CREATE TRIGGER care_assignment_authorize_insert
BEFORE INSERT ON care_assignment
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM care_record c
  JOIN staff_profile actor ON actor.auth_user_id=NEW.assigned_by AND actor.account_status='active'
  JOIN staff_role_assignment ara ON ara.staff_profile_id=actor.id AND ara.branch_id=NEW.branch_id
  JOIN role ar ON ar.id=ara.role_id AND ar.is_active=1
  JOIN role_capability arc ON arc.role_id=ar.id
  JOIN capability ac ON ac.id=arc.capability_id AND ac.code='pastoral.case.share' AND ac.is_active=1
  JOIN staff_profile target ON target.auth_user_id=NEW.assignee_user_id AND target.account_status='active'
  JOIN staff_role_assignment tra ON tra.staff_profile_id=target.id AND tra.branch_id=NEW.branch_id
  WHERE c.id=NEW.care_record_id AND c.branch_id=NEW.branch_id
   AND ara.revoked_at IS NULL AND ara.starts_at<=NEW.starts_at AND (ara.ends_at IS NULL OR ara.ends_at>NEW.starts_at)
   AND tra.revoked_at IS NULL AND tra.starts_at<=NEW.starts_at AND (tra.ends_at IS NULL OR tra.ends_at>NEW.starts_at)
 ) THEN RAISE(ABORT,'CARE_ASSIGNMENT_NOT_AUTHORIZED') END;
END;

CREATE TABLE care_interaction (
 id TEXT PRIMARY KEY,
 care_record_id TEXT NOT NULL REFERENCES care_record(id) ON DELETE RESTRICT,
 actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 interaction_type TEXT NOT NULL CHECK(interaction_type IN ('call','visit','meeting','other')),
 outcome_code TEXT,
 restricted_note TEXT,
 occurred_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);

CREATE TABLE care_access_audit (
 id TEXT PRIMARY KEY,
 care_record_id TEXT NOT NULL REFERENCES care_record(id) ON DELETE RESTRICT,
 branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
 actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('read','created','updated','assigned','revoked','oversight')),
 reason TEXT,
 request_id TEXT,
 safe_metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(safe_metadata) AND json_type(safe_metadata)='object'),
 accessed_at TEXT NOT NULL,
 FOREIGN KEY(care_record_id,branch_id) REFERENCES care_record(id,branch_id) ON DELETE RESTRICT,
 CHECK(action NOT IN ('oversight') OR length(trim(COALESCE(reason,''))) BETWEEN 10 AND 300)
);
CREATE INDEX care_access_audit_branch_time_idx ON care_access_audit(branch_id,accessed_at DESC);
CREATE INDEX care_access_audit_record_time_idx ON care_access_audit(care_record_id,accessed_at DESC);
CREATE TRIGGER care_access_audit_no_update BEFORE UPDATE ON care_access_audit BEGIN SELECT RAISE(ABORT,'CARE_ACCESS_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER care_access_audit_no_delete BEFORE DELETE ON care_access_audit BEGIN SELECT RAISE(ABORT,'CARE_ACCESS_AUDIT_APPEND_ONLY'); END;


-- Explicit pastoral-care sharing is an Admin/Pastor-only grant.
INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code='pastoral.case.share'
WHERE r.code='admin_pastor';

CREATE TRIGGER prayer_request_authorize_insert
BEFORE INSERT ON prayer_request
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='prayer.request.create' AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
 ) THEN RAISE(ABORT,'PRAYER_REQUEST_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER care_record_authorize_insert
BEFORE INSERT ON care_record
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM staff_profile actor
  JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
  JOIN role r ON r.id=ra.role_id AND r.is_active=1
  JOIN role_capability rc ON rc.role_id=r.id
  JOIN capability c ON c.id=rc.capability_id AND c.code='pastoral.case.create' AND c.is_active=1
  JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
  WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
   AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
   AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
 ) THEN RAISE(ABORT,'CARE_RECORD_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER prayer_assignment_audit_insert
AFTER INSERT ON prayer_assignment
BEGIN
 INSERT INTO prayer_access_audit
  (id,prayer_request_id,branch_id,actor_user_id,action,reason,request_id,safe_metadata,accessed_at)
 VALUES('prayer-assigned-'||NEW.id,NEW.prayer_request_id,NEW.branch_id,NEW.assigned_by,
  'assigned','Assigned to an active prayer intercessor',NULL,'{}',NEW.created_at);
END;

CREATE TRIGGER care_assignment_audit_insert
AFTER INSERT ON care_assignment
BEGIN
 INSERT INTO care_access_audit
  (id,care_record_id,branch_id,actor_user_id,action,reason,request_id,safe_metadata,accessed_at)
 VALUES('care-assigned-'||NEW.id,NEW.care_record_id,NEW.branch_id,NEW.assigned_by,
  'assigned','Assigned to an authorized care worker',NULL,'{}',NEW.created_at);
END;

UPDATE app_meta SET schema_version=12 WHERE id=1 AND environment='non-production';
