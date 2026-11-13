-- If a staff member loses their final currently-active role assignment
-- across all active branches, revoke their sessions so a later re-assignment
-- cannot silently revive an old login session.
CREATE TRIGGER IF NOT EXISTS staff_role_assignment_revoke_sessions_after_last_role
AFTER UPDATE OF revoked_at, ends_at ON staff_role_assignment
WHEN (NEW.revoked_at IS NOT NULL OR
      (NEW.ends_at IS NOT NULL AND NEW.ends_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
 AND NOT EXISTS (
   SELECT 1
   FROM staff_role_assignment active
   JOIN role r ON r.id = active.role_id AND r.is_active = 1
   JOIN branch b ON b.id = active.branch_id AND b.is_active = 1
   WHERE active.staff_profile_id = NEW.staff_profile_id
     AND active.revoked_at IS NULL
     AND active.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     AND (active.ends_at IS NULL OR active.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
 )
BEGIN
  DELETE FROM session
  WHERE userId = (
    SELECT auth_user_id FROM staff_profile WHERE id = NEW.staff_profile_id
  );
END;

UPDATE app_meta
SET schema_version = 6
WHERE id = 1 AND environment = 'non-production';
