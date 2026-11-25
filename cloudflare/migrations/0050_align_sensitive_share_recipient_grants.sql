-- Align sensitive-record share recipient authorization with the approved six-role
-- catalogue. Prayer Intercessors receive prayer.request.read.assigned at assigned
-- scope; the retired prayer.request.read/explicit_share capability is not granted.
-- Care shares remain fail-closed until an owner-approved care.read.assigned grant exists.

DROP TRIGGER IF EXISTS staff_record_share_authorize_insert;

CREATE TRIGGER staff_record_share_authorize_insert
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
        WHEN 'prayer_request' THEN 'prayer.request.read.assigned'
        WHEN 'pastoral_case' THEN 'care.record.read.assigned'
      END
      AND rrc.scope_mode = 'assigned'
  ) THEN RAISE(ABORT, 'SENSITIVE_SHARE_RECIPIENT_NOT_AUTHORIZED') END;
END;

UPDATE app_meta SET schema_version = 50 WHERE id = 1 AND schema_version = 49;
