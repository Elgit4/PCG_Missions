-- Restore Worker route capabilities after the canonical catalogue migration.
-- Preserve the original typed-report role matrix and align event operations to canonical codes.
CREATE TABLE authorization_policy_v46_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO authorization_policy_v46_guard (ok)
SELECT CASE WHEN
  (SELECT schema_version FROM app_meta WHERE id=1)=45
  AND (SELECT environment FROM app_meta WHERE id=1)='non-production'
  AND (SELECT COUNT(*) FROM role WHERE code IN ('admin_pastor','coordinator','team_leader','field_worker','follow_up_volunteer','prayer_intercessor'))=6
  AND (SELECT COUNT(*) FROM capability WHERE code IN ('report.read.scoped','report.submit.scoped','report.review.scoped','event.closeout.submit','event.closeout.review'))=5
  AND (SELECT COUNT(*) FROM role_capability)=128
THEN 1 ELSE 0 END;

UPDATE capability SET is_active=1
WHERE code IN ('report.read.scoped','report.submit.scoped','report.review.scoped','event.closeout.submit','event.closeout.review');

WITH restored_grants(role_code,capability_code,scope_mode) AS (
  VALUES
    ('admin_pastor','report.review.scoped','branch'),
    ('coordinator','report.review.scoped','branch'),
    ('team_leader','report.read.scoped','self'),
    ('team_leader','report.submit.scoped','self'),
    ('team_leader','report.review.scoped','team'),
    ('field_worker','report.read.scoped','self'),
    ('field_worker','report.submit.scoped','self'),
    ('follow_up_volunteer','report.read.scoped','self'),
    ('follow_up_volunteer','report.submit.scoped','self'),
    ('admin_pastor','event.closeout.submit','branch'),
    ('admin_pastor','event.closeout.review','branch'),
    ('coordinator','event.closeout.review','branch')
)
INSERT INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,g.scope_mode,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM restored_grants g
JOIN role r ON r.code=g.role_code
JOIN capability c ON c.code=g.capability_code
ON CONFLICT(role_id,capability_id,scope_mode) DO NOTHING;

DROP TRIGGER ministry_report_authorize_insert;
CREATE TRIGGER ministry_report_authorize_insert
BEFORE INSERT ON ministry_report
BEGIN
  SELECT CASE WHEN NEW.status<>'submitted' OR NEW.submitted_at IS NULL
    OR NEW.created_by IS NULL OR NEW.updated_by<>NEW.created_by
    OR NOT EXISTS(
      SELECT 1
      FROM staff_profile sp
      JOIN staff_role_assignment sra ON sra.staff_profile_id=sp.id AND sra.branch_id=NEW.branch_id
      JOIN role r ON r.id=sra.role_id AND r.is_active=1
      JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='self'
      JOIN capability c ON c.id=rc.capability_id AND c.code='report.submit.scoped' AND c.is_active=1
      WHERE sp.id=NEW.author_profile_id AND sp.auth_user_id=NEW.created_by
        AND sp.account_status='active' AND sp.must_change_password=0
        AND sra.revoked_at IS NULL AND sra.starts_at<=NEW.created_at
        AND (sra.ends_at IS NULL OR sra.ends_at>NEW.created_at)
    )
  THEN RAISE(ABORT,'REPORT_SUBMIT_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.team_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM staff_team_membership stm
    JOIN team t ON t.id=stm.team_id AND t.branch_id=stm.branch_id AND t.is_active=1
    WHERE stm.staff_profile_id=NEW.author_profile_id AND stm.team_id=NEW.team_id
      AND stm.branch_id=NEW.branch_id AND stm.revoked_at IS NULL
      AND stm.starts_at<=NEW.created_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.created_at)
  ) THEN RAISE(ABORT,'REPORT_TEAM_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.event_id IS NOT NULL AND NOT (
    EXISTS(
      SELECT 1 FROM event_staff_assignment esa
      WHERE esa.event_id=NEW.event_id AND esa.branch_id=NEW.branch_id
        AND esa.staff_auth_user_id=NEW.created_by AND esa.revoked_at IS NULL
        AND esa.starts_at<=NEW.created_at AND (esa.ends_at IS NULL OR esa.ends_at>NEW.created_at)
    )
    OR EXISTS(
      SELECT 1 FROM event_team_assignment eta
      JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
      WHERE eta.event_id=NEW.event_id AND eta.branch_id=NEW.branch_id
        AND stm.staff_profile_id=NEW.author_profile_id
        AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
        AND eta.starts_at<=NEW.created_at AND (eta.ends_at IS NULL OR eta.ends_at>NEW.created_at)
        AND stm.starts_at<=NEW.created_at AND (stm.ends_at IS NULL OR stm.ends_at>NEW.created_at)
    )
  ) THEN RAISE(ABORT,'REPORT_EVENT_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.last_action_id IS NOT NULL OR NEW.last_action_decision IS NOT NULL
    THEN RAISE(ABORT,'REPORT_INITIAL_ACTION_NOT_ALLOWED') END;
END;

DROP TRIGGER ministry_report_authorize_update;
CREATE TRIGGER ministry_report_authorize_update
BEFORE UPDATE ON ministry_report
BEGIN
  SELECT CASE WHEN NEW.last_action_decision IN ('approved','returned','comment')
    AND NEW.last_action_by=(SELECT auth_user_id FROM staff_profile WHERE id=OLD.author_profile_id)
    THEN RAISE(ABORT,'REPORT_SELF_REVIEW_FORBIDDEN') END;

  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.branch_id<>OLD.branch_id
    OR NEW.report_type<>OLD.report_type OR NEW.period_start<>OLD.period_start
    OR NEW.period_end<>OLD.period_end OR NEW.author_profile_id<>OLD.author_profile_id
    OR COALESCE(NEW.team_id,'')<>COALESCE(OLD.team_id,'')
    OR COALESCE(NEW.event_id,'')<>COALESCE(OLD.event_id,'')
    OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by
    OR NEW.last_action_id IS NULL OR NEW.last_action_id=OLD.last_action_id
    OR NEW.last_action_by IS NULL OR NEW.last_action_decision IS NULL OR NEW.last_action_at IS NULL
    OR NEW.updated_by<>NEW.last_action_by OR NEW.updated_at<>NEW.last_action_at
  THEN RAISE(ABORT,'REPORT_UPDATE_NOT_AUTHORIZED') END;

  SELECT CASE WHEN NEW.last_action_decision IN ('approved','returned','comment') AND NOT (
    OLD.status='submitted'
    AND NEW.status=CASE WHEN NEW.last_action_decision='comment' THEN 'submitted' ELSE NEW.last_action_decision END
    AND NEW.last_action_by IS NOT NULL
    AND (NEW.last_action_decision<>'returned' OR length(trim(COALESCE(NEW.last_action_comment,'')))>0)
    AND NEW.submitted_at=OLD.submitted_at
    AND NEW.contacts_captured=OLD.contacts_captured
    AND NEW.gospel_presentations=OLD.gospel_presentations
    AND NEW.decisions_for_christ=OLD.decisions_for_christ
    AND NEW.followup_required=OLD.followup_required
    AND NEW.followup_completed=OLD.followup_completed
    AND NEW.visits_completed=OLD.visits_completed
    AND NEW.calls_completed=OLD.calls_completed
    AND NEW.events_supported=OLD.events_supported
    AND NEW.attendance_count=OLD.attendance_count
    AND EXISTS(
      SELECT 1 FROM staff_profile actor
      JOIN staff_role_assignment sra ON sra.staff_profile_id=actor.id AND sra.branch_id=OLD.branch_id
      JOIN role r ON r.id=sra.role_id AND r.is_active=1
      WHERE actor.auth_user_id=NEW.last_action_by AND actor.account_status='active'
        AND actor.must_change_password=0 AND actor.id<>OLD.author_profile_id
        AND sra.revoked_at IS NULL AND sra.starts_at<=NEW.last_action_at
        AND (sra.ends_at IS NULL OR sra.ends_at>NEW.last_action_at)
        AND (
          EXISTS(
            SELECT 1 FROM role_capability rc JOIN capability c ON c.id=rc.capability_id
            WHERE rc.role_id=r.id AND rc.scope_mode='branch'
              AND c.code='report.review.scoped' AND c.is_active=1
          )
          OR (OLD.team_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM role_capability rc JOIN capability c ON c.id=rc.capability_id
            JOIN staff_team_membership stm ON stm.staff_profile_id=actor.id
              AND stm.team_id=OLD.team_id AND stm.branch_id=OLD.branch_id
              AND stm.revoked_at IS NULL AND stm.starts_at<=NEW.last_action_at
              AND (stm.ends_at IS NULL OR stm.ends_at>NEW.last_action_at)
            JOIN team t ON t.id=stm.team_id AND t.branch_id=stm.branch_id AND t.is_active=1
            WHERE rc.role_id=r.id AND rc.scope_mode='team'
              AND c.code='report.review.scoped' AND c.is_active=1
          ))
        )
    )
  ) THEN RAISE(ABORT,'REPORT_REVIEW_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.last_action_decision='resubmitted' AND NOT (
    OLD.status='returned' AND NEW.status='submitted'
    AND NEW.last_action_by=(
      SELECT auth_user_id FROM staff_profile WHERE id=OLD.author_profile_id
    )
    AND NEW.submitted_at=NEW.last_action_at
    AND EXISTS(
      SELECT 1 FROM staff_profile actor
      JOIN staff_role_assignment sra ON sra.staff_profile_id=actor.id AND sra.branch_id=OLD.branch_id
      JOIN role r ON r.id=sra.role_id AND r.is_active=1
      JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='self'
      JOIN capability c ON c.id=rc.capability_id AND c.code='report.submit.scoped' AND c.is_active=1
      WHERE actor.id=OLD.author_profile_id AND actor.auth_user_id=NEW.last_action_by
        AND actor.account_status='active' AND actor.must_change_password=0
        AND sra.revoked_at IS NULL AND sra.starts_at<=NEW.last_action_at
        AND (sra.ends_at IS NULL OR sra.ends_at>NEW.last_action_at)
    )
  ) THEN RAISE(ABORT,'REPORT_SUBMIT_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.last_action_decision NOT IN ('approved','returned','comment','resubmitted')
    THEN RAISE(ABORT,'REPORT_ACTION_INVALID') END;
END;

DROP TRIGGER event_closeout_event_authorize_insert;
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
        (NEW.action='submitted' AND c.code='event.closeout.submit')
        OR (NEW.action IN ('approved','returned') AND c.code='event.closeout.review')
        OR (NEW.action='reopened' AND c.code='events.manage')
      )
  ) THEN RAISE(ABORT,'EVENT_CLOSEOUT_EVENT_NOT_AUTHORIZED') END;
END;

DROP TRIGGER event_closeout_resubmit_authorize_update;
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
      AND rc.scope_mode='branch' AND c.code='event.closeout.submit'
  ) THEN RAISE(ABORT,'EVENT_CLOSEOUT_RESUBMIT_NOT_AUTHORIZED') END;
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
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.recorded_by AND actor.account_status='active'
      AND actor.must_change_password=0
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.checked_in_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.checked_in_at)
      AND (
        EXISTS (
          SELECT 1 FROM role_capability rc
          JOIN capability c ON c.id=rc.capability_id AND c.is_active=1
          WHERE rc.role_id=r.id AND rc.scope_mode='branch' AND c.code='events.manage'
        )
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

UPDATE app_meta SET schema_version=46 WHERE id=1 AND schema_version=45 AND environment='non-production';
DELETE FROM authorization_policy_v46_guard;
DROP TABLE authorization_policy_v46_guard;
