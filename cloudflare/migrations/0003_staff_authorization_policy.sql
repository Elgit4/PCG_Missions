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
('contacts.contact_details.read','contacts.contact_details.read','Read phone and email contact details within the same record scope.','restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
('staff.role.assign','staff.role.assign','Assign and revoke standard roles in an authorized branch.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('staff.role.approve','staff.role.approve','Approve high-privilege Admin/Pastor role changes under two-person control.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('staff.role.assign_admin_pastor','staff.role.assign_admin_pastor','Reserved capability for the separately approved Admin/Pastor elevation workflow.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
('prayer.request.share','prayer.request.share','Grant or revoke time-bounded prayer-request shares to active prayer intercessors in the same branch.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('pastoral.case.share','pastoral.case.share','Grant or revoke time-bounded pastoral-case shares to separately authorized staff.','highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
WHERE code IN ('contacts.read','contacts.contact_details.read','contacts.create','contacts.update','contacts.assign','contacts.private_fields.read','contacts.interaction.create','contacts.note.create','followup.read','followup.create','followup.update','followup.assign','team.read','team.manage','area.read','area.manage','staff.directory.read','staff.account.manage','staff.role.assign','staff.role.approve','staff.audit.read','events.read','events.manage','events.checkin','calendar.read','calendar.manage','announcements.read','announcements.manage','content.read','content.manage','reports.read','prayer.request.share');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-coordinator',id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('contacts.read','contacts.contact_details.read','contacts.create','contacts.update','contacts.assign','contacts.interaction.create','contacts.note.create','followup.read','followup.create','followup.update','followup.assign','team.read','area.read','staff.directory.read','events.read','events.manage','events.checkin','calendar.read','calendar.manage','announcements.read','announcements.manage','content.read','content.manage','reports.read');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-team-leader',id,'team',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('contacts.read','contacts.contact_details.read','contacts.update','contacts.interaction.create','contacts.note.create','followup.read','followup.create','followup.update','followup.assign','team.read','area.read','events.read','events.checkin','calendar.read','announcements.read','content.read');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-field-worker',id,'assigned',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('contacts.read','contacts.contact_details.read','contacts.update','contacts.interaction.create','contacts.note.create','followup.read','followup.update','events.read','events.checkin','calendar.read','announcements.read','content.read');

-- A worker may create a new branch contact, but may only read/update existing
-- contacts after the assignment predicate is satisfied.
INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
VALUES ('role-field-worker','contacts.create','branch',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-follow-up-volunteer',id,'assigned',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('followup.read','followup.update','contacts.contact_details.read','contacts.interaction.create','events.read','calendar.read','announcements.read');

INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-prayer-intercessor',id,'explicit_share',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM capability
WHERE code IN ('prayer.request.read','prayer.request.respond');

-- No baseline role is granted pastoral.case.*, export, bulk-send or SMS dispatch.


-- Separate immutable ledger for high-sensitivity prayer and pastoral record access.
-- Narrative text and personal details are intentionally not stored in this ledger.
CREATE TABLE IF NOT EXISTS sensitive_record_access_audit (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  record_type TEXT NOT NULL CHECK (record_type IN ('prayer_request', 'pastoral_case')),
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('read', 'created', 'updated', 'share_granted', 'share_revoked')),
  purpose TEXT NOT NULL CHECK (length(trim(purpose)) BETWEEN 10 AND 300),
  share_reference TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sensitive_access_audit_branch_created_idx
  ON sensitive_record_access_audit(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sensitive_access_audit_record_idx
  ON sensitive_record_access_audit(record_type, record_id, created_at DESC);
CREATE TRIGGER IF NOT EXISTS sensitive_record_access_audit_no_update
BEFORE UPDATE ON sensitive_record_access_audit
BEGIN
  SELECT RAISE(ABORT, 'SENSITIVE_ACCESS_AUDIT_APPEND_ONLY');
END;
CREATE TRIGGER IF NOT EXISTS sensitive_record_access_audit_no_delete
BEFORE DELETE ON sensitive_record_access_audit
BEGIN
  SELECT RAISE(ABORT, 'SENSITIVE_ACCESS_AUDIT_APPEND_ONLY');
END;


-- Explicit record-level sharing is the only baseline route to highly sensitive
-- prayer/pastoral records. Shares are branch-bound, time-bounded and revocable.
CREATE TABLE IF NOT EXISTS staff_record_share (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  record_type TEXT NOT NULL CHECK (record_type IN ('prayer_request', 'pastoral_case')),
  record_id TEXT NOT NULL,
  staff_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  granted_by TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  revoked_by TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL CHECK (length(trim(purpose)) BETWEEN 10 AND 300),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (revoked_at IS NULL OR revoked_at >= starts_at),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS staff_record_share_active_lookup_idx
  ON staff_record_share(staff_profile_id, branch_id, record_type, record_id, starts_at, ends_at)
  WHERE revoked_at IS NULL;
CREATE TRIGGER IF NOT EXISTS staff_record_share_no_overlap_insert
BEFORE INSERT ON staff_record_share
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_record_share existing
    WHERE existing.staff_profile_id = NEW.staff_profile_id
      AND existing.branch_id = NEW.branch_id
      AND existing.record_type = NEW.record_type
      AND existing.record_id = NEW.record_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'STAFF_RECORD_SHARE_OVERLAP') END;
END;
CREATE TRIGGER IF NOT EXISTS staff_record_share_no_overlap_update
BEFORE UPDATE OF staff_profile_id, branch_id, record_type, record_id, starts_at, ends_at, revoked_at
ON staff_record_share
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_record_share existing
    WHERE existing.id <> NEW.id
      AND existing.staff_profile_id = NEW.staff_profile_id
      AND existing.branch_id = NEW.branch_id
      AND existing.record_type = NEW.record_type
      AND existing.record_id = NEW.record_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at, '9999-12-31T23:59:59.999Z') > NEW.starts_at
      AND COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z') > existing.starts_at
  ) THEN RAISE(ABORT, 'STAFF_RECORD_SHARE_OVERLAP') END;
END;
CREATE TRIGGER IF NOT EXISTS staff_record_share_audit_insert
AFTER INSERT ON staff_record_share
BEGIN
  INSERT INTO sensitive_record_access_audit
    (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
  VALUES
    ('share-grant-' || NEW.id, NEW.branch_id, NEW.granted_by, NEW.record_type, NEW.record_id,
     'share_granted', NEW.purpose, NEW.id, NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS staff_record_share_audit_revoke
AFTER UPDATE OF revoked_at ON staff_record_share
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO sensitive_record_access_audit
    (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
  VALUES
    ('share-revoke-' || NEW.id, NEW.branch_id, NEW.revoked_by, NEW.record_type, NEW.record_id,
     'share_revoked', NEW.purpose, NEW.id, NEW.revoked_at);
END;
CREATE TRIGGER IF NOT EXISTS staff_record_share_no_delete
BEFORE DELETE ON staff_record_share
BEGIN
  SELECT RAISE(ABORT, 'STAFF_RECORD_SHARE_NO_DELETE');
END;

CREATE TRIGGER IF NOT EXISTS staff_record_share_immutable_fields
BEFORE UPDATE OF branch_id, record_type, record_id, staff_profile_id, granted_by, purpose, starts_at, ends_at, created_at
ON staff_record_share
BEGIN
  SELECT RAISE(ABORT, 'STAFF_RECORD_SHARE_IMMUTABLE_FIELDS');
END;
CREATE TRIGGER IF NOT EXISTS staff_record_share_no_unrevoke
BEFORE UPDATE OF revoked_at, revoked_by ON staff_record_share
WHEN OLD.revoked_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'STAFF_RECORD_SHARE_ALREADY_REVOKED');
END;

-- Enforce the share authority and recipient capability in the database as well
-- as in Worker code. Prayer shares may be issued only by an active Admin/Pastor
-- and only to an active Prayer Intercessor in the same branch. Pastoral shares
-- remain unavailable until a separately approved capability is granted.
CREATE TRIGGER IF NOT EXISTS staff_record_share_authorize_insert
BEFORE INSERT ON staff_record_share
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile grantor
    JOIN staff_role_assignment ga ON ga.staff_profile_id = grantor.id
    JOIN role gr ON gr.id = ga.role_id AND gr.is_active = 1
    JOIN role_capability grc ON grc.role_id = gr.id
    JOIN capability gc ON gc.id = grc.capability_id AND gc.is_active = 1
    WHERE grantor.id = NEW.granted_by
      AND grantor.account_status = 'active'
      AND ga.branch_id = NEW.branch_id
      AND ga.revoked_at IS NULL
      AND ga.starts_at <= NEW.created_at
      AND (ga.ends_at IS NULL OR ga.ends_at > NEW.created_at)
      AND gc.code = CASE NEW.record_type
        WHEN 'prayer_request' THEN 'prayer.request.share'
        WHEN 'pastoral_case' THEN 'pastoral.case.share'
      END
  ) THEN RAISE(ABORT, 'SENSITIVE_SHARE_GRANT_NOT_AUTHORIZED') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile recipient
    JOIN staff_role_assignment ra ON ra.staff_profile_id = recipient.id
    JOIN role rr ON rr.id = ra.role_id AND rr.is_active = 1
    JOIN role_capability rrc ON rrc.role_id = rr.id
    JOIN capability rc ON rc.id = rrc.capability_id AND rc.is_active = 1
    WHERE recipient.id = NEW.staff_profile_id
      AND recipient.account_status = 'active'
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.created_at)
      AND rc.code = CASE NEW.record_type
        WHEN 'prayer_request' THEN 'prayer.request.read'
        WHEN 'pastoral_case' THEN 'pastoral.case.read'
      END
      AND rrc.scope_mode = 'explicit_share'
  ) THEN RAISE(ABORT, 'SENSITIVE_SHARE_RECIPIENT_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER IF NOT EXISTS staff_record_share_authorize_revoke
BEFORE UPDATE OF revoked_at, revoked_by ON staff_record_share
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    WHERE actor.id = NEW.revoked_by
      AND actor.account_status = 'active'
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.revoked_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.revoked_at)
      AND c.code = CASE NEW.record_type
        WHEN 'prayer_request' THEN 'prayer.request.share'
        WHEN 'pastoral_case' THEN 'pastoral.case.share'
      END
  ) THEN RAISE(ABORT, 'SENSITIVE_SHARE_REVOKE_NOT_AUTHORIZED') END;
END;


-- One-time owner-controlled bootstrap window for the first two Admin/Pastor
-- holders. After both slots are consumed, all additional Admin/Pastor grants
-- require a distinct second administrator's approval.
CREATE TABLE IF NOT EXISTS staff_admin_bootstrap_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  remaining_slots INTEGER NOT NULL CHECK (remaining_slots BETWEEN 0 AND 2)
);
INSERT INTO staff_admin_bootstrap_state (id, remaining_slots)
VALUES (1, 2)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS staff_role_elevation_request (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  target_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  reviewed_by TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_reason TEXT,
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR
    (status IN ('approved', 'rejected', 'applied') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 500)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_role_elevation_one_open_idx
  ON staff_role_elevation_request(branch_id, target_profile_id)
  WHERE status IN ('pending', 'approved');

CREATE TABLE IF NOT EXISTS staff_role_elevation_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES staff_role_elevation_request(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('request_created', 'request_approved', 'request_rejected', 'request_applied')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS staff_role_elevation_audit_branch_time_idx
  ON staff_role_elevation_audit(branch_id, created_at DESC);
CREATE TRIGGER IF NOT EXISTS staff_role_elevation_audit_no_update
BEFORE UPDATE ON staff_role_elevation_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_ROLE_ELEVATION_AUDIT_APPEND_ONLY');
END;
CREATE TRIGGER IF NOT EXISTS staff_role_elevation_audit_no_delete
BEFORE DELETE ON staff_role_elevation_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_ROLE_ELEVATION_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER IF NOT EXISTS staff_role_elevation_request_authorize_insert
BEFORE INSERT ON staff_role_elevation_request
BEGIN
  SELECT CASE WHEN (
    SELECT code FROM role WHERE id = NEW.role_id
  ) <> 'admin_pastor' THEN RAISE(ABORT, 'ELEVATION_REQUEST_ROLE_INVALID') END;

  SELECT CASE WHEN NEW.target_profile_id = NEW.requested_by THEN
    RAISE(ABORT, 'ELEVATION_REQUEST_SELF_ASSIGNMENT') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    JOIN staff_profile target ON target.id = NEW.target_profile_id
    WHERE actor.id = NEW.requested_by
      AND actor.account_status = 'active'
      AND target.account_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM staff_role_assignment existing
        JOIN role er ON er.id = existing.role_id
        WHERE existing.staff_profile_id = target.id
          AND existing.branch_id = NEW.branch_id
          AND er.code = 'admin_pastor'
          AND existing.revoked_at IS NULL
          AND existing.starts_at <= NEW.requested_at
          AND (existing.ends_at IS NULL OR existing.ends_at > NEW.requested_at)
      )
      AND NEW.status = 'pending'
      AND NEW.reviewed_by IS NULL AND NEW.reviewed_at IS NULL AND NEW.review_reason IS NULL
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.requested_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.requested_at)
      AND c.code = 'staff.role.assign'
  ) THEN RAISE(ABORT, 'ELEVATION_REQUEST_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER IF NOT EXISTS staff_role_elevation_request_immutable
BEFORE UPDATE OF id, branch_id, target_profile_id, role_id, requested_by, reason, requested_at
ON staff_role_elevation_request
BEGIN
  SELECT RAISE(ABORT, 'ELEVATION_REQUEST_IMMUTABLE_FIELDS');
END;

CREATE TRIGGER IF NOT EXISTS staff_role_elevation_request_terminal_guard
BEFORE UPDATE OF status ON staff_role_elevation_request
WHEN OLD.status <> 'pending' AND NOT (OLD.status = 'approved' AND NEW.status = 'applied')
BEGIN
  SELECT RAISE(ABORT, 'ELEVATION_REQUEST_TERMINAL');
END;

CREATE TRIGGER IF NOT EXISTS staff_role_elevation_request_applied_guard
BEFORE UPDATE OF status ON staff_role_elevation_request
WHEN OLD.status = 'approved' AND NEW.status = 'applied'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_role_assignment a
    JOIN role r ON r.id = a.role_id AND r.code = 'admin_pastor'
    WHERE a.staff_profile_id = OLD.target_profile_id
      AND a.branch_id = OLD.branch_id
      AND a.assigned_by = OLD.reviewed_by
      AND a.starts_at >= OLD.reviewed_at
  ) THEN RAISE(ABORT, 'ELEVATION_REQUEST_NOT_APPLIED') END;
END;

CREATE TRIGGER IF NOT EXISTS staff_role_elevation_request_review_authorize
BEFORE UPDATE OF status, reviewed_by, reviewed_at, review_reason
ON staff_role_elevation_request
WHEN OLD.status = 'pending'
BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('approved', 'rejected') OR NEW.reviewed_by = NEW.requested_by
    THEN RAISE(ABORT, 'ELEVATION_REQUIRES_DISTINCT_REVIEWER') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile reviewer
    JOIN staff_role_assignment ra ON ra.staff_profile_id = reviewer.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    WHERE reviewer.id = NEW.reviewed_by
      AND reviewer.account_status = 'active'
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.reviewed_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.reviewed_at)
      AND c.code = 'staff.role.approve'
  ) THEN RAISE(ABORT, 'ELEVATION_REVIEW_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER IF NOT EXISTS staff_role_elevation_audit_request
AFTER INSERT ON staff_role_elevation_request
BEGIN
  INSERT INTO staff_role_elevation_audit
    (id, request_id, branch_id, actor_profile_id, action, reason, created_at)
  VALUES
    ('elevation-request-' || NEW.id, NEW.id, NEW.branch_id, NEW.requested_by,
     'request_created', NEW.reason, NEW.requested_at);
END;
CREATE TRIGGER IF NOT EXISTS staff_role_elevation_audit_review
AFTER UPDATE OF status ON staff_role_elevation_request
WHEN OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')
BEGIN
  INSERT INTO staff_role_elevation_audit
    (id, request_id, branch_id, actor_profile_id, action, reason, created_at)
  VALUES
    ('elevation-review-' || NEW.id, NEW.id, NEW.branch_id, NEW.reviewed_by,
     CASE NEW.status WHEN 'approved' THEN 'request_approved' ELSE 'request_rejected' END,
     NEW.review_reason, NEW.reviewed_at);
END;

CREATE TRIGGER IF NOT EXISTS staff_role_assignment_admin_elevation_insert
BEFORE INSERT ON staff_role_assignment
WHEN (SELECT code FROM role WHERE id = NEW.role_id) = 'admin_pastor'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_role_elevation_request req
    WHERE req.branch_id = NEW.branch_id
      AND req.target_profile_id = NEW.staff_profile_id
      AND req.role_id = NEW.role_id
      AND req.status = 'approved'
      AND req.reviewed_by = NEW.assigned_by
      AND req.requested_by <> req.reviewed_by
      AND req.reviewed_at <= NEW.starts_at
  ) AND (SELECT remaining_slots FROM staff_admin_bootstrap_state WHERE id = 1) <= 0
    THEN RAISE(ABORT, 'ADMIN_PASTOR_APPROVAL_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS staff_role_assignment_admin_bootstrap_consume
AFTER INSERT ON staff_role_assignment
WHEN (SELECT code FROM role WHERE id = NEW.role_id) = 'admin_pastor'
  AND NOT EXISTS (SELECT 1 FROM staff_role_elevation_request req WHERE req.branch_id = NEW.branch_id AND req.target_profile_id = NEW.staff_profile_id AND req.role_id = NEW.role_id AND req.status IN ('approved','applied') AND req.reviewed_by = NEW.assigned_by AND req.requested_by <> req.reviewed_by AND req.reviewed_at <= NEW.starts_at)
BEGIN
  UPDATE staff_admin_bootstrap_state
  SET remaining_slots = remaining_slots - 1
  WHERE id = 1 AND remaining_slots > 0;
  INSERT INTO staff_access_audit
    (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
  VALUES
    ('admin-bootstrap-' || NEW.id, NEW.branch_id, NEW.assigned_by, NEW.staff_profile_id,
     'role_assigned', 'Owner-controlled initial Admin/Pastor bootstrap',
     json_object('bootstrap', 1), NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS staff_role_assignment_admin_elevation_audit
AFTER INSERT ON staff_role_assignment
WHEN (SELECT code FROM role WHERE id = NEW.role_id) = 'admin_pastor'
  AND EXISTS (SELECT 1 FROM staff_role_elevation_request req WHERE req.branch_id = NEW.branch_id AND req.target_profile_id = NEW.staff_profile_id AND req.role_id = NEW.role_id AND req.status IN ('approved','applied') AND req.reviewed_by = NEW.assigned_by AND req.requested_by <> req.reviewed_by AND req.reviewed_at <= NEW.starts_at)
BEGIN
  INSERT INTO staff_access_audit
    (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
  SELECT
    'admin-elevation-' || NEW.id, NEW.branch_id, NEW.assigned_by, NEW.staff_profile_id,
    'role_assigned', req.reason, json_object('elevation_request_id', req.id), NEW.created_at
  FROM staff_role_elevation_request req
  WHERE req.branch_id = NEW.branch_id
    AND req.target_profile_id = NEW.staff_profile_id
    AND req.role_id = NEW.role_id
    AND req.reviewed_by = NEW.assigned_by
    AND req.status IN ('approved','applied');
END;

CREATE TRIGGER IF NOT EXISTS staff_role_assignment_admin_elevation_consume
AFTER INSERT ON staff_role_assignment
WHEN (SELECT code FROM role WHERE id = NEW.role_id) = 'admin_pastor'
  AND EXISTS (SELECT 1 FROM staff_role_elevation_request req WHERE req.branch_id = NEW.branch_id AND req.target_profile_id = NEW.staff_profile_id AND req.role_id = NEW.role_id AND req.status = 'approved' AND req.reviewed_by = NEW.assigned_by AND req.requested_by <> req.reviewed_by)
BEGIN
  UPDATE staff_role_elevation_request SET status = 'applied'
  WHERE branch_id = NEW.branch_id AND target_profile_id = NEW.staff_profile_id
    AND role_id = NEW.role_id AND status = 'approved' AND reviewed_by = NEW.assigned_by;
END;

CREATE TRIGGER IF NOT EXISTS staff_role_elevation_audit_applied
AFTER UPDATE OF status ON staff_role_elevation_request
WHEN OLD.status = 'approved' AND NEW.status = 'applied'
BEGIN
  INSERT INTO staff_role_elevation_audit
    (id, request_id, branch_id, actor_profile_id, action, reason, created_at)
  VALUES
    ('elevation-applied-' || NEW.id, NEW.id, NEW.branch_id, NEW.reviewed_by,
     'request_applied', NEW.review_reason, NEW.reviewed_at);
END;

CREATE TRIGGER IF NOT EXISTS staff_role_assignment_admin_last_holder_guard
BEFORE UPDATE OF revoked_at, ends_at ON staff_role_assignment
WHEN (SELECT code FROM role WHERE id = OLD.role_id) = 'admin_pastor'
  AND OLD.revoked_at IS NULL
  AND (NEW.revoked_at IS NOT NULL OR NEW.ends_at IS NOT NULL)
  AND (
    SELECT COUNT(*) FROM staff_role_assignment active
    JOIN role ar ON ar.id = active.role_id
    WHERE active.branch_id = OLD.branch_id
      AND ar.code = 'admin_pastor'
      AND active.revoked_at IS NULL
      AND active.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND (active.ends_at IS NULL OR active.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'CANNOT_REMOVE_LAST_ACTIVE_ADMIN_PASTOR');
END;
