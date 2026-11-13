-- Revoke every active Better Auth session as soon as a staff account is
-- deactivated or suspended. Re-activation never restores old sessions.
CREATE TRIGGER IF NOT EXISTS staff_profile_revoke_sessions_after_deactivation
AFTER UPDATE OF account_status ON staff_profile
WHEN OLD.account_status = 'active'
 AND NEW.account_status IN ('inactive', 'suspended')
BEGIN
  DELETE FROM session WHERE userId = NEW.auth_user_id;
END;

UPDATE app_meta
SET schema_version = 4
WHERE id = 1 AND environment = 'non-production';
