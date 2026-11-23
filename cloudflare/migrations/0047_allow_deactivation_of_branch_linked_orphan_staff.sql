-- Allow authorised administrators to deactivate a branch-linked staff profile
-- even when the profile has no current role assignment. This covers partially
-- provisioned/orphaned staff records while retaining branch isolation and the
-- existing last-Admin/Pastor protection.
DROP TRIGGER staff_profile_account_status_authorize;

CREATE TRIGGER staff_profile_account_status_authorize
BEFORE UPDATE OF account_status ON staff_profile
WHEN OLD.account_status <> NEW.account_status
BEGIN
  SELECT CASE WHEN NEW.account_status NOT IN ('active','inactive','suspended')
    THEN RAISE(ABORT, 'STAFF_ACCOUNT_STATUS_TRANSITION_INVALID') END;
  SELECT CASE WHEN NEW.account_status_changed_by IS NULL
      OR NEW.account_status_changed_branch_id IS NULL
      OR NEW.account_status_reason IS NULL
      OR length(trim(NEW.account_status_reason)) NOT BETWEEN 10 AND 500
    THEN RAISE(ABORT, 'STAFF_ACCOUNT_STATUS_CHANGE_METADATA_REQUIRED') END;
  SELECT CASE WHEN NEW.id = NEW.account_status_changed_by
    THEN RAISE(ABORT, 'STAFF_CANNOT_CHANGE_OWN_ACCOUNT_STATUS') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    JOIN branch b ON b.id = ra.branch_id AND b.is_active = 1
    WHERE actor.id = NEW.account_status_changed_by
      AND actor.account_status = 'active'
      AND ra.branch_id = NEW.account_status_changed_branch_id
      AND ra.revoked_at IS NULL
      AND ra.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND (ra.ends_at IS NULL OR ra.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND c.code = 'staff.account.manage'
  ) THEN RAISE(ABORT, 'STAFF_ACCOUNT_CHANGE_NOT_AUTHORIZED') END;

  -- A target must have a verifiable relationship to this branch, but the
  -- relationship may be historical or represented by its immutable access
  -- audit. Requiring a *current* role here strands accounts that were created
  -- without a role or whose assignment was already ended.
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_role_assignment target_assignment
    WHERE target_assignment.staff_profile_id = NEW.id
      AND target_assignment.branch_id = NEW.account_status_changed_branch_id
  ) AND NOT EXISTS (
    SELECT 1 FROM staff_access_audit target_audit
    WHERE target_audit.target_profile_id = NEW.id
      AND target_audit.branch_id = NEW.account_status_changed_branch_id
  ) THEN RAISE(ABORT, 'STAFF_TARGET_NOT_IN_BRANCH') END;

  -- Keep the final Admin/Pastor safeguard unchanged.
  SELECT CASE WHEN NEW.account_status IN ('inactive','suspended') AND EXISTS (
    SELECT 1
    FROM staff_role_assignment target_admin
    JOIN role ar ON ar.id = target_admin.role_id AND ar.code = 'admin_pastor' AND ar.is_active = 1
    JOIN branch target_branch ON target_branch.id = target_admin.branch_id AND target_branch.is_active = 1
    WHERE target_admin.staff_profile_id = NEW.id
      AND target_admin.revoked_at IS NULL
      AND target_admin.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND (target_admin.ends_at IS NULL OR target_admin.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND NOT EXISTS (
        SELECT 1
        FROM staff_role_assignment other_admin
        JOIN role rr ON rr.id = other_admin.role_id AND rr.code = 'admin_pastor' AND rr.is_active = 1
        JOIN staff_profile other_staff ON other_staff.id = other_admin.staff_profile_id
        JOIN branch other_branch ON other_branch.id = other_admin.branch_id AND other_branch.is_active = 1
        WHERE other_admin.branch_id = target_admin.branch_id
          AND other_admin.staff_profile_id <> NEW.id
          AND other_staff.account_status = 'active'
          AND other_admin.revoked_at IS NULL
          AND other_admin.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
          AND (other_admin.ends_at IS NULL OR other_admin.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )
  ) THEN RAISE(ABORT, 'CANNOT_DEACTIVATE_LAST_ACTIVE_ADMIN_PASTOR') END;
END;

UPDATE app_meta
SET schema_version = 47
WHERE id = 1 AND schema_version = 46
  AND environment IN ('non-production','production');
