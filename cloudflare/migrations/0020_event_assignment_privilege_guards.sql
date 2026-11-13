-- Restrict event operations to staff whose assignment role matches the operation.
-- Migration 0020 tightens the broad event-assignment checks introduced in 0013/0018.

DROP TRIGGER event_registration_authorize_insert;
CREATE TRIGGER event_registration_authorize_insert
BEFORE INSERT ON event_registration
BEGIN
  SELECT CASE WHEN NEW.created_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
    WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.registered_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.registered_at)
      AND (
        (c.code='events.manage' AND rc.scope_mode='branch')
        OR EXISTS (
          SELECT 1 FROM event_staff_assignment esa
          WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
            AND esa.staff_auth_user_id=NEW.created_by
            AND esa.assignment_role IN ('owner','organizer')
            AND esa.revoked_at IS NULL AND esa.starts_at<=NEW.registered_at
            AND (esa.ends_at IS NULL OR esa.ends_at>NEW.registered_at)
        )
        OR EXISTS (
          SELECT 1 FROM event_team_assignment eta
          JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
          WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
            AND eta.assignment_role IN ('organizer','ushering')
            AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
            AND eta.starts_at<=NEW.registered_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.registered_at)
            AND stm.starts_at<=NEW.registered_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.registered_at)
        )
      )
  ) THEN RAISE(ABORT,'EVENT_REGISTRATION_NOT_AUTHORIZED') END;
END;

DROP TRIGGER event_registration_cancel_authorize_update;
CREATE TRIGGER event_registration_cancel_authorize_update
BEFORE UPDATE OF status ON event_registration
WHEN OLD.status='registered' AND NEW.status='cancelled'
BEGIN
  SELECT CASE WHEN NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
    WHERE actor.auth_user_id=NEW.cancelled_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.cancelled_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.cancelled_at)
      AND (
        (c.code='events.manage' AND rc.scope_mode='branch')
        OR EXISTS (
          SELECT 1 FROM event_staff_assignment esa
          WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
            AND esa.staff_auth_user_id=NEW.cancelled_by
            AND esa.assignment_role IN ('owner','organizer')
            AND esa.revoked_at IS NULL AND esa.starts_at<=NEW.cancelled_at
            AND (esa.ends_at IS NULL OR esa.ends_at>NEW.cancelled_at)
        )
        OR EXISTS (
          SELECT 1 FROM event_team_assignment eta
          JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
          WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
            AND eta.assignment_role IN ('organizer','ushering')
            AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
            AND eta.starts_at<=NEW.cancelled_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.cancelled_at)
            AND stm.starts_at<=NEW.cancelled_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.cancelled_at)
        )
      )
  ) THEN RAISE(ABORT,'EVENT_REGISTRATION_CANCEL_NOT_AUTHORIZED') END;
END;

DROP TRIGGER event_checkin_authorize_insert;
CREATE TRIGGER event_checkin_authorize_insert
BEFORE INSERT ON event_checkin
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.code IN ('events.checkin','events.manage') AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.recorded_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.checked_in_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.checked_in_at)
      AND (
        rc.scope_mode='branch'
        OR EXISTS (
          SELECT 1 FROM event_staff_assignment esa
          WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
            AND esa.staff_auth_user_id=NEW.recorded_by
            AND esa.assignment_role IN ('owner','organizer','checkin')
            AND esa.revoked_at IS NULL AND esa.starts_at<=NEW.checked_in_at
            AND (esa.ends_at IS NULL OR esa.ends_at>NEW.checked_in_at)
        )
        OR EXISTS (
          SELECT 1 FROM event_team_assignment eta
          JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
          WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
            AND eta.assignment_role IN ('organizer','ushering')
            AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
            AND eta.starts_at<=NEW.checked_in_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.checked_in_at)
            AND stm.starts_at<=NEW.checked_in_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.checked_in_at)
        )
      )
  ) THEN RAISE(ABORT,'EVENT_CHECKIN_NOT_AUTHORIZED') END;
END;

-- Preserve the new schema marker only in the isolated non-production environment.
UPDATE app_meta SET schema_version=20 WHERE id=1 AND environment='non-production';
