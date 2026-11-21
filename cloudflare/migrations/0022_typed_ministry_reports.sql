-- Typed ministry reports: D-12 capability scopes, protected storage and atomic review history.
-- No export capability is created or granted.

INSERT INTO capability(id,code,description,sensitivity,is_active,created_at) VALUES
 ('cap-report-read-own','report.read.own','Read reports authored by the authenticated staff member.','ordinary',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cap-report-submit-own','report.submit.own','Create and submit typed reports for the authenticated staff member.','ordinary',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cap-report-review-branch','report.review.branch','Review submitted ministry reports across the active branch.','ordinary',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cap-report-review-team','report.review.team','Review submitted ministry reports for active own-team membership.','ordinary',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(code) DO UPDATE SET
 description=excluded.description,sensitivity=excluded.sensitivity,is_active=excluded.is_active;

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code='report.review.branch'
WHERE r.code IN ('admin_pastor','coordinator');

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'self',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code IN ('report.read.own','report.submit.own')
WHERE r.code IN ('team_leader','field_worker','follow_up_volunteer');

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT r.id,c.id,'team',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM role r JOIN capability c ON c.code='report.review.team'
WHERE r.code='team_leader';

CREATE TABLE ministry_report (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  report_type TEXT NOT NULL CHECK(report_type IN ('daily_evangelism','event_evangelism','weekly_ministry')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  author_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  team_id TEXT REFERENCES team(id) ON DELETE RESTRICT,
  event_id TEXT REFERENCES event(id) ON DELETE RESTRICT,
  contacts_captured INTEGER NOT NULL DEFAULT 0 CHECK(contacts_captured BETWEEN 0 AND 100000),
  gospel_presentations INTEGER NOT NULL DEFAULT 0 CHECK(gospel_presentations BETWEEN 0 AND 100000),
  decisions_for_christ INTEGER NOT NULL DEFAULT 0 CHECK(decisions_for_christ BETWEEN 0 AND 100000),
  followup_required INTEGER NOT NULL DEFAULT 0 CHECK(followup_required BETWEEN 0 AND 100000),
  followup_completed INTEGER NOT NULL DEFAULT 0 CHECK(followup_completed BETWEEN 0 AND 100000),
  visits_completed INTEGER NOT NULL DEFAULT 0 CHECK(visits_completed BETWEEN 0 AND 100000),
  calls_completed INTEGER NOT NULL DEFAULT 0 CHECK(calls_completed BETWEEN 0 AND 100000),
  events_supported INTEGER NOT NULL DEFAULT 0 CHECK(events_supported BETWEEN 0 AND 100000),
  attendance_count INTEGER NOT NULL DEFAULT 0 CHECK(attendance_count BETWEEN 0 AND 100000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','returned','approved')),
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  last_action_id TEXT,
  last_action_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  last_action_decision TEXT CHECK(last_action_decision IS NULL OR last_action_decision IN ('approved','returned','comment','resubmitted')),
  last_action_comment TEXT CHECK(last_action_comment IS NULL OR length(last_action_comment)<=2000),
  last_action_at TEXT,
  CHECK(date(period_start) IS NOT NULL AND date(period_start)=period_start),
  CHECK(date(period_end) IS NOT NULL AND date(period_end)=period_end),
  CHECK(period_end>=period_start),
  CHECK(
    (report_type IN ('daily_evangelism','event_evangelism') AND period_end=period_start)
    OR (report_type='weekly_ministry' AND julianday(period_end)-julianday(period_start)=6)
  ),
  CHECK(
    (report_type='event_evangelism' AND event_id IS NOT NULL)
    OR (report_type<>'event_evangelism' AND event_id IS NULL)
  ),
  CHECK(decisions_for_christ<=gospel_presentations),
  CHECK(followup_completed<=followup_required),
  CHECK(
    (last_action_id IS NULL AND last_action_by IS NULL AND last_action_decision IS NULL AND last_action_at IS NULL)
    OR (last_action_id IS NOT NULL AND last_action_by IS NOT NULL AND last_action_decision IS NOT NULL AND last_action_at IS NOT NULL)
  )
);

CREATE INDEX ministry_report_branch_period_idx
  ON ministry_report(branch_id,period_start DESC,report_type);
CREATE INDEX ministry_report_author_created_idx
  ON ministry_report(author_profile_id,created_at DESC);
CREATE UNIQUE INDEX ministry_report_one_submission_per_scope_uq
  ON ministry_report(branch_id,author_profile_id,report_type,period_start,
    COALESCE(team_id,''),COALESCE(event_id,''));
CREATE INDEX ministry_report_team_period_idx
  ON ministry_report(team_id,period_start DESC) WHERE team_id IS NOT NULL;
CREATE INDEX ministry_report_event_idx
  ON ministry_report(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE report_review_event (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES ministry_report(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK(decision IN ('approved','returned','comment','resubmitted')),
  comment TEXT CHECK(comment IS NULL OR length(comment)<=2000),
  created_at TEXT NOT NULL
);
CREATE INDEX report_review_event_report_created_idx
  ON report_review_event(report_id,created_at ASC);

CREATE TRIGGER ministry_report_scope_guard_insert
BEFORE INSERT ON ministry_report
BEGIN
  SELECT CASE WHEN NEW.team_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM team t WHERE t.id=NEW.team_id AND t.branch_id=NEW.branch_id AND t.is_active=1
  ) THEN RAISE(ABORT,'REPORT_TEAM_BRANCH_MISMATCH') END;
  SELECT CASE WHEN NEW.event_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM event e WHERE e.id=NEW.event_id AND e.branch_id=NEW.branch_id
  ) THEN RAISE(ABORT,'REPORT_EVENT_BRANCH_MISMATCH') END;
END;

CREATE TRIGGER ministry_report_scope_guard_update
BEFORE UPDATE OF branch_id,team_id,event_id,author_profile_id ON ministry_report
BEGIN
  SELECT RAISE(ABORT,'REPORT_SCOPE_IMMUTABLE');
END;

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
      JOIN capability c ON c.id=rc.capability_id AND c.code='report.submit.own' AND c.is_active=1
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
              AND c.code='report.review.branch' AND c.is_active=1
          )
          OR (OLD.team_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM role_capability rc JOIN capability c ON c.id=rc.capability_id
            JOIN staff_team_membership stm ON stm.staff_profile_id=actor.id
              AND stm.team_id=OLD.team_id AND stm.branch_id=OLD.branch_id
              AND stm.revoked_at IS NULL AND stm.starts_at<=NEW.last_action_at
              AND (stm.ends_at IS NULL OR stm.ends_at>NEW.last_action_at)
            JOIN team t ON t.id=stm.team_id AND t.branch_id=stm.branch_id AND t.is_active=1
            WHERE rc.role_id=r.id AND rc.scope_mode='team'
              AND c.code='report.review.team' AND c.is_active=1
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
      JOIN capability c ON c.id=rc.capability_id AND c.code='report.submit.own' AND c.is_active=1
      WHERE actor.id=OLD.author_profile_id AND actor.auth_user_id=NEW.last_action_by
        AND actor.account_status='active' AND actor.must_change_password=0
        AND sra.revoked_at IS NULL AND sra.starts_at<=NEW.last_action_at
        AND (sra.ends_at IS NULL OR sra.ends_at>NEW.last_action_at)
    )
  ) THEN RAISE(ABORT,'REPORT_SUBMIT_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.last_action_decision NOT IN ('approved','returned','comment','resubmitted')
    THEN RAISE(ABORT,'REPORT_ACTION_INVALID') END;
END;

CREATE TRIGGER ministry_report_append_review_event
AFTER UPDATE OF last_action_id ON ministry_report
WHEN NEW.last_action_id IS NOT OLD.last_action_id
BEGIN
  INSERT INTO report_review_event(id,report_id,actor_profile_id,decision,comment,created_at)
  SELECT NEW.last_action_id,NEW.id,actor.id,NEW.last_action_decision,NEW.last_action_comment,NEW.last_action_at
  FROM staff_profile actor WHERE actor.auth_user_id=NEW.last_action_by;
END;

CREATE TRIGGER report_review_event_authorize_insert
BEFORE INSERT ON report_review_event
WHEN NOT EXISTS(
  SELECT 1 FROM ministry_report mr
  JOIN staff_profile actor ON actor.id=NEW.actor_profile_id
  WHERE mr.id=NEW.report_id AND mr.last_action_id=NEW.id
    AND mr.last_action_by=actor.auth_user_id
    AND mr.last_action_decision=NEW.decision
    AND COALESCE(mr.last_action_comment,'')=COALESCE(NEW.comment,'')
    AND mr.last_action_at=NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT,'REPORT_REVIEW_EVENT_NOT_AUTHORIZED');
END;

CREATE TRIGGER report_review_event_immutable_update
BEFORE UPDATE ON report_review_event
BEGIN
  SELECT RAISE(ABORT,'REPORT_REVIEW_HISTORY_IMMUTABLE');
END;
CREATE TRIGGER report_review_event_immutable_delete
BEFORE DELETE ON report_review_event
BEGIN
  SELECT RAISE(ABORT,'REPORT_REVIEW_HISTORY_IMMUTABLE');
END;

UPDATE app_meta SET schema_version=22 WHERE id=1 AND environment='non-production';
