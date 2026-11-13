-- Add database-enforced registration capacity/state, transport capacity/actor and closeout audit authorization.
-- Additive non-production migration 0018.

ALTER TABLE event_registration
  ADD COLUMN cancelled_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE event_registration
  ADD COLUMN cancelled_at TEXT;

ALTER TABLE transport_option
  ADD COLUMN created_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE transport_option
  ADD COLUMN updated_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE transport_option
  ADD COLUMN updated_at TEXT;

ALTER TABLE transport_reservation
  ADD COLUMN updated_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE transport_reservation
  ADD COLUMN cancelled_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE transport_reservation
  ADD COLUMN cancelled_at TEXT;

CREATE TRIGGER event_registration_open_guard
BEFORE INSERT ON event_registration
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event e
    WHERE e.id=NEW.event_id AND e.branch_id=NEW.branch_id
      AND e.status='published' AND e.registration_state='open'
  ) THEN RAISE(ABORT,'EVENT_REGISTRATION_CLOSED') END;
END;

CREATE TRIGGER event_registration_capacity_guard
BEFORE INSERT ON event_registration
WHEN (SELECT capacity FROM event WHERE id=NEW.event_id AND branch_id=NEW.branch_id) IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM event_registration er
    WHERE er.event_id=NEW.event_id AND er.branch_id=NEW.branch_id
      AND er.status IN ('registered','attended')
  ) >= (
    SELECT capacity FROM event WHERE id=NEW.event_id AND branch_id=NEW.branch_id
  ) THEN RAISE(ABORT,'EVENT_CAPACITY_REACHED') END;
END;

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
            AND esa.staff_auth_user_id=NEW.cancelled_by AND esa.revoked_at IS NULL
            AND esa.starts_at<=NEW.cancelled_at AND (esa.ends_at IS NULL OR esa.ends_at>NEW.cancelled_at)
        )
        OR EXISTS (
          SELECT 1 FROM event_team_assignment eta
          JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
          WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
            AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
            AND eta.starts_at<=NEW.cancelled_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.cancelled_at)
            AND stm.starts_at<=NEW.cancelled_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.cancelled_at)
        )
      )
  ) THEN RAISE(ABORT,'EVENT_REGISTRATION_CANCEL_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER transport_option_authorize_insert
BEFORE INSERT ON transport_option
BEGIN
  SELECT CASE WHEN NEW.created_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
    WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
      AND (
        (c.code='events.manage' AND rc.scope_mode='branch')
        OR EXISTS (
          SELECT 1 FROM event_staff_assignment esa
          WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
            AND esa.staff_auth_user_id=NEW.created_by
            AND esa.assignment_role IN ('owner','organizer','transport')
            AND esa.revoked_at IS NULL AND esa.starts_at<=NEW.created_at
            AND (esa.ends_at IS NULL OR esa.ends_at>NEW.created_at)
        )
        OR EXISTS (
          SELECT 1 FROM event_team_assignment eta
          JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
          WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
            AND eta.assignment_role IN ('organizer','transport')
            AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
            AND eta.starts_at<=NEW.created_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.created_at)
            AND stm.starts_at<=NEW.created_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.created_at)
        )
      )
  ) THEN RAISE(ABORT,'TRANSPORT_OPTION_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER transport_option_authorize_update
BEFORE UPDATE ON transport_option
BEGIN
  SELECT CASE WHEN NEW.updated_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
    WHERE actor.auth_user_id=NEW.updated_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.updated_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.updated_at)
      AND (
        (c.code='events.manage' AND rc.scope_mode='branch')
        OR EXISTS (
          SELECT 1 FROM event_staff_assignment esa
          WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
            AND esa.staff_auth_user_id=NEW.updated_by
            AND esa.assignment_role IN ('owner','organizer','transport')
            AND esa.revoked_at IS NULL AND esa.starts_at<=NEW.updated_at
            AND (esa.ends_at IS NULL OR esa.ends_at>NEW.updated_at)
        )
        OR EXISTS (
          SELECT 1 FROM event_team_assignment eta
          JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
          WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
            AND eta.assignment_role IN ('organizer','transport')
            AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
            AND eta.starts_at<=NEW.updated_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.updated_at)
            AND stm.starts_at<=NEW.updated_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.updated_at)
        )
      )
  ) THEN RAISE(ABORT,'TRANSPORT_OPTION_UPDATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER transport_reservation_capacity_guard
BEFORE INSERT ON transport_reservation
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM transport_option o
    WHERE o.id=NEW.transport_option_id AND o.event_id=NEW.event_id
      AND o.branch_id=NEW.branch_id AND o.is_enabled=1
  ) THEN RAISE(ABORT,'TRANSPORT_OPTION_DISABLED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event_registration er
    WHERE er.id=NEW.registration_id AND er.event_id=NEW.event_id
      AND er.branch_id=NEW.branch_id AND er.status='registered'
  ) THEN RAISE(ABORT,'TRANSPORT_REQUIRES_ACTIVE_REGISTRATION') END;
  SELECT CASE WHEN (
    SELECT o.capacity FROM transport_option o
    WHERE o.id=NEW.transport_option_id AND o.event_id=NEW.event_id AND o.branch_id=NEW.branch_id
  ) IS NOT NULL AND (
    COALESCE((
      SELECT SUM(tr.seat_count) FROM transport_reservation tr
      WHERE tr.transport_option_id=NEW.transport_option_id AND tr.event_id=NEW.event_id
        AND tr.branch_id=NEW.branch_id AND tr.status IN ('reserved','boarded')
    ),0) + NEW.seat_count
  ) > (
    SELECT o.capacity FROM transport_option o
    WHERE o.id=NEW.transport_option_id AND o.event_id=NEW.event_id AND o.branch_id=NEW.branch_id
  ) THEN RAISE(ABORT,'TRANSPORT_CAPACITY_REACHED') END;
END;

CREATE TRIGGER transport_reservation_authorize_update
BEFORE UPDATE OF status ON transport_reservation
WHEN OLD.status IN ('reserved','boarded') AND NEW.status IN ('cancelled','boarded','no_show')
BEGIN
  SELECT CASE WHEN NEW.updated_by IS NULL OR
    (NEW.status='cancelled' AND (NEW.cancelled_by IS NULL OR NEW.cancelled_by<>NEW.updated_by OR NEW.cancelled_at IS NULL))
    OR NOT EXISTS (
      SELECT 1
      FROM staff_profile actor
      JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
      JOIN role r ON r.id=ra.role_id AND r.is_active=1
      JOIN role_capability rc ON rc.role_id=r.id
      JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
      WHERE actor.auth_user_id=NEW.updated_by AND actor.account_status='active'
        AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.updated_at
        AND (ra.ends_at IS NULL OR ra.ends_at>NEW.updated_at)
        AND (
          (c.code='events.manage' AND rc.scope_mode='branch')
          OR EXISTS (
            SELECT 1 FROM event_staff_assignment esa
            WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
              AND esa.staff_auth_user_id=NEW.updated_by
              AND esa.assignment_role IN ('owner','organizer','transport')
              AND esa.revoked_at IS NULL AND esa.starts_at<=NEW.updated_at
              AND (esa.ends_at IS NULL OR esa.ends_at>NEW.updated_at)
          )
          OR EXISTS (
            SELECT 1 FROM event_team_assignment eta
            JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
            WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
              AND eta.assignment_role IN ('organizer','transport')
              AND stm.staff_profile_id=actor.id AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
              AND eta.starts_at<=NEW.updated_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.updated_at)
              AND stm.starts_at<=NEW.updated_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.updated_at)
          )
        )
  THEN RAISE(ABORT,'TRANSPORT_RESERVATION_UPDATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER event_closeout_event_authorize_insert
BEFORE INSERT ON event_closeout_event
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM event_closeout ec
    JOIN staff_profile actor ON actor.auth_user_id=NEW.actor_user_id
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=ec.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
    WHERE ec.id=NEW.closeout_id AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
      AND rc.scope_mode='branch'
      AND (
        (NEW.action='submitted' AND c.code IN ('events.manage','events.checkin'))
        OR (NEW.action IN ('approved','returned') AND c.code='events.closeout.review')
        OR (NEW.action='reopened' AND c.code='events.manage')
      )
  ) THEN RAISE(ABORT,'EVENT_CLOSEOUT_EVENT_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER event_closeout_resubmit_authorize_update
BEFORE UPDATE OF status ON event_closeout
WHEN OLD.status='returned' AND NEW.status='submitted'
BEGIN
  SELECT CASE WHEN NEW.submitted_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id
    JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
    WHERE actor.auth_user_id=NEW.submitted_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.submitted_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.submitted_at)
      AND rc.scope_mode='branch' AND c.code IN ('events.manage','events.checkin')
  ) THEN RAISE(ABORT,'EVENT_CLOSEOUT_RESUBMIT_NOT_AUTHORIZED') END;
END;

UPDATE app_meta SET schema_version=18 WHERE id=1 AND environment='non-production';
