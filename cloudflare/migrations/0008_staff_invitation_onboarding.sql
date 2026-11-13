-- Invitation-only staff onboarding. No public self-registration or email provider is enabled.
CREATE TABLE staff_invitation (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  invited_by TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  email TEXT NOT NULL COLLATE NOCASE CHECK (email = lower(trim(email)) AND length(email) BETWEEN 6 AND 254),
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 180),
  phone_e164 TEXT CHECK (phone_e164 IS NULL OR phone_e164 GLOB '+[1-9]*' AND length(phone_e164) BETWEEN 8 AND 16),
  role_id TEXT NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  token_hash TEXT UNIQUE CHECK (token_hash IS NULL OR (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*')),
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  accepted_at TEXT,
  accepted_user_id TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  accepted_profile_id TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'pending' AND token_hash IS NOT NULL AND accepted_at IS NULL
      AND accepted_user_id IS NULL AND accepted_profile_id IS NULL
      AND revoked_at IS NULL AND revoked_by IS NULL)
    OR
    (status = 'accepted' AND token_hash IS NULL AND accepted_at IS NOT NULL
      AND accepted_user_id IS NOT NULL AND accepted_profile_id IS NOT NULL
      AND revoked_at IS NULL AND revoked_by IS NULL)
    OR
    (status = 'revoked' AND token_hash IS NULL AND accepted_at IS NULL
      AND accepted_user_id IS NULL AND accepted_profile_id IS NULL
      AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);
CREATE UNIQUE INDEX staff_invitation_one_pending_email_idx
  ON staff_invitation(email) WHERE status = 'pending';
CREATE INDEX staff_invitation_branch_status_idx
  ON staff_invitation(branch_id, status, created_at DESC);

CREATE TABLE staff_invitation_audit (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL REFERENCES staff_invitation(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('invitation_created','invitation_accepted','invitation_revoked')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  created_at TEXT NOT NULL
);
CREATE INDEX staff_invitation_audit_branch_time_idx
  ON staff_invitation_audit(branch_id, created_at DESC);
CREATE TRIGGER staff_invitation_audit_no_update
BEFORE UPDATE ON staff_invitation_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_INVITATION_AUDIT_APPEND_ONLY');
END;
CREATE TRIGGER staff_invitation_audit_no_delete
BEFORE DELETE ON staff_invitation_audit
BEGIN
  SELECT RAISE(ABORT, 'STAFF_INVITATION_AUDIT_APPEND_ONLY');
END;

CREATE TRIGGER staff_invitation_authorize_insert
BEFORE INSERT ON staff_invitation
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    JOIN branch b ON b.id = ra.branch_id AND b.is_active = 1
    JOIN role target_role ON target_role.id = NEW.role_id AND target_role.is_active = 1
    WHERE actor.id = NEW.invited_by
      AND actor.account_status = 'active'
      AND ra.branch_id = NEW.branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at > NEW.created_at)
      AND c.code IN ('staff.account.manage','staff.role.assign')
      AND EXISTS (
        SELECT 1 FROM role_capability required_rc
        JOIN capability required_c ON required_c.id = required_rc.capability_id AND required_c.is_active = 1
        WHERE required_rc.role_id = r.id AND required_c.code = 'staff.account.manage'
      )
      AND EXISTS (
        SELECT 1 FROM role_capability required_rc
        JOIN capability required_c ON required_c.id = required_rc.capability_id AND required_c.is_active = 1
        WHERE required_rc.role_id = r.id AND required_c.code = 'staff.role.assign'
      )
      AND target_role.code IN ('coordinator','team_leader','field_worker','follow_up_volunteer','prayer_intercessor')
  ) THEN RAISE(ABORT, 'STAFF_INVITATION_NOT_AUTHORIZED') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_profile sp WHERE lower(trim(sp.email)) = NEW.email
  ) OR EXISTS (
    SELECT 1 FROM "user" u WHERE lower(trim(u.email)) = NEW.email
  ) THEN RAISE(ABORT, 'STAFF_INVITATION_EMAIL_ALREADY_REGISTERED') END;
END;

CREATE TRIGGER staff_invitation_immutable_fields
BEFORE UPDATE OF id, branch_id, invited_by, email, full_name, phone_e164, role_id, expires_at, reason, created_at
ON staff_invitation
BEGIN
  SELECT RAISE(ABORT, 'STAFF_INVITATION_IMMUTABLE_FIELDS');
END;

CREATE TRIGGER staff_invitation_status_transition
BEFORE UPDATE OF status ON staff_invitation
WHEN OLD.status <> NEW.status
BEGIN
  SELECT CASE WHEN OLD.status <> 'pending' OR NEW.status NOT IN ('accepted','revoked')
    THEN RAISE(ABORT, 'STAFF_INVITATION_TERMINAL') END;

  SELECT CASE WHEN NEW.status = 'accepted' AND (
    NEW.accepted_at IS NULL OR NEW.accepted_at > OLD.expires_at
    OR NEW.accepted_user_id IS NULL OR NEW.accepted_profile_id IS NULL
    OR NEW.token_hash IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM staff_profile accepted
      JOIN "user" u ON u.id = accepted.auth_user_id
      JOIN staff_role_assignment assignment
        ON assignment.staff_profile_id = accepted.id
       AND assignment.branch_id = OLD.branch_id
       AND assignment.role_id = OLD.role_id
       AND assignment.assigned_by = OLD.invited_by
      WHERE accepted.id = NEW.accepted_profile_id
        AND accepted.auth_user_id = NEW.accepted_user_id
        AND lower(trim(accepted.email)) = OLD.email
        AND accepted.account_status = 'active'
        AND u.email = OLD.email
        AND assignment.revoked_at IS NULL
        AND assignment.starts_at <= NEW.accepted_at
        AND (assignment.ends_at IS NULL OR assignment.ends_at > NEW.accepted_at)
    )
    OR NOT EXISTS (
      SELECT 1
      FROM staff_profile inviter
      JOIN staff_role_assignment ra ON ra.staff_profile_id = inviter.id
      JOIN role r ON r.id = ra.role_id AND r.is_active = 1
      JOIN role_capability rc ON rc.role_id = r.id
      JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
      WHERE inviter.id = OLD.invited_by
        AND inviter.account_status = 'active'
        AND ra.branch_id = OLD.branch_id
        AND ra.revoked_at IS NULL
        AND ra.starts_at <= NEW.accepted_at
        AND (ra.ends_at IS NULL OR ra.ends_at > NEW.accepted_at)
        AND c.code IN ('staff.account.manage','staff.role.assign')
        AND EXISTS (
          SELECT 1 FROM role_capability required_rc
          JOIN capability required_c ON required_c.id = required_rc.capability_id AND required_c.is_active = 1
          WHERE required_rc.role_id = r.id AND required_c.code = 'staff.account.manage'
        )
        AND EXISTS (
          SELECT 1 FROM role_capability required_rc
          JOIN capability required_c ON required_c.id = required_rc.capability_id AND required_c.is_active = 1
          WHERE required_rc.role_id = r.id AND required_c.code = 'staff.role.assign'
        )
    )
  ) THEN RAISE(ABORT, 'STAFF_INVITATION_ACCEPTANCE_INVALID') END;

  SELECT CASE WHEN NEW.status = 'revoked' AND (
    NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR NEW.token_hash IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM staff_profile actor
      JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
      JOIN role r ON r.id = ra.role_id AND r.is_active = 1
      JOIN role_capability rc ON rc.role_id = r.id
      JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
      WHERE actor.id = NEW.revoked_by
        AND actor.account_status = 'active'
        AND ra.branch_id = OLD.branch_id
        AND ra.revoked_at IS NULL
        AND ra.starts_at <= NEW.revoked_at
        AND (ra.ends_at IS NULL OR ra.ends_at > NEW.revoked_at)
        AND c.code = 'staff.account.manage'
    )
  ) THEN RAISE(ABORT, 'STAFF_INVITATION_REVOCATION_INVALID') END;
END;

CREATE TRIGGER staff_invitation_audit_insert
AFTER INSERT ON staff_invitation
BEGIN
  INSERT INTO staff_invitation_audit
    (id, invitation_id, branch_id, actor_profile_id, action, reason, created_at)
  VALUES ('invitation-created-' || NEW.id, NEW.id, NEW.branch_id, NEW.invited_by,
          'invitation_created', NEW.reason, NEW.created_at);
END;
CREATE TRIGGER staff_invitation_audit_status
AFTER UPDATE OF status ON staff_invitation
WHEN OLD.status = 'pending' AND NEW.status IN ('accepted','revoked')
BEGIN
  INSERT INTO staff_invitation_audit
    (id, invitation_id, branch_id, actor_profile_id, action, reason, created_at)
  VALUES (
    CASE NEW.status WHEN 'accepted' THEN 'invitation-accepted-' ELSE 'invitation-revoked-' END || NEW.id,
    NEW.id, NEW.branch_id,
    CASE NEW.status WHEN 'accepted' THEN NEW.accepted_profile_id ELSE NEW.revoked_by END,
    CASE NEW.status WHEN 'accepted' THEN 'invitation_accepted' ELSE 'invitation_revoked' END,
    CASE NEW.status WHEN 'accepted' THEN 'Staff member accepted the invitation and set a private password' ELSE 'Administrator revoked the pending staff invitation' END,
    CASE NEW.status WHEN 'accepted' THEN NEW.accepted_at ELSE NEW.revoked_at END
  );
END;

UPDATE app_meta
SET schema_version = 8
WHERE id = 1 AND environment = 'non-production';
