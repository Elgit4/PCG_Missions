-- Recurring calendar series with bounded occurrence expansion and immutable audit.
CREATE TABLE calendar_series (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
  entry_type TEXT NOT NULL CHECK(entry_type IN ('service','event','followup','prayer_schedule','other')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  timezone TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('branch','team','event','own')),
  team_id TEXT,
  event_id TEXT,
  owner_user_id TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  recurrence_frequency TEXT NOT NULL CHECK(recurrence_frequency IN ('daily','weekly','monthly')),
  recurrence_interval INTEGER NOT NULL CHECK(recurrence_interval BETWEEN 1 AND 12),
  occurrence_count INTEGER NOT NULL CHECK(occurrence_count BETWEEN 2 AND 52),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
  cancelled_at TEXT,
  cancelled_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  cancellation_reason TEXT,
  created_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(ends_at IS NULL OR ends_at>starts_at),
  CHECK(
    (scope_type='branch' AND team_id IS NULL AND event_id IS NULL AND owner_user_id IS NULL)
    OR (scope_type='team' AND team_id IS NOT NULL AND event_id IS NULL AND owner_user_id IS NULL)
    OR (scope_type='event' AND team_id IS NULL AND event_id IS NOT NULL AND owner_user_id IS NULL)
    OR (scope_type='own' AND team_id IS NULL AND event_id IS NULL AND owner_user_id=created_by)
  ),
  CHECK(
    (status='active' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
    OR (status='cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
      AND length(trim(COALESCE(cancellation_reason,''))) BETWEEN 10 AND 300)
  ),
  FOREIGN KEY(team_id,branch_id) REFERENCES team(id,branch_id) ON DELETE RESTRICT,
  FOREIGN KEY(event_id,branch_id) REFERENCES event(id,branch_id) ON DELETE RESTRICT
);
CREATE INDEX calendar_series_branch_status_idx
  ON calendar_series(branch_id,status,starts_at);

ALTER TABLE calendar_entry
  ADD COLUMN series_id TEXT REFERENCES calendar_series(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX calendar_entry_series_occurrence_uq
  ON calendar_entry(series_id,starts_at) WHERE series_id IS NOT NULL;
CREATE INDEX calendar_entry_series_idx
  ON calendar_entry(series_id,starts_at) WHERE series_id IS NOT NULL;

CREATE TABLE calendar_series_audit (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES calendar_series(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('created','cancelled')),
  reason TEXT,
  safe_metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(safe_metadata) AND json_type(safe_metadata)='object'),
  created_at TEXT NOT NULL
);
CREATE INDEX calendar_series_audit_branch_time_idx
  ON calendar_series_audit(branch_id,created_at DESC);
CREATE TRIGGER calendar_series_audit_no_update
BEFORE UPDATE ON calendar_series_audit
BEGIN SELECT RAISE(ABORT,'CALENDAR_SERIES_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER calendar_series_audit_no_delete
BEFORE DELETE ON calendar_series_audit
BEGIN SELECT RAISE(ABORT,'CALENDAR_SERIES_AUDIT_APPEND_ONLY'); END;

CREATE TRIGGER calendar_series_authorize_insert
BEFORE INSERT ON calendar_series
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='branch'
    JOIN capability c ON c.id=rc.capability_id AND c.code='calendar.manage' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.created_by AND actor.account_status='active'
      AND NEW.updated_by=NEW.created_by
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.created_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.created_at)
  ) THEN RAISE(ABORT,'CALENDAR_SERIES_CREATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER calendar_series_authorize_update
BEFORE UPDATE ON calendar_series
BEGIN
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.branch_id<>OLD.branch_id
    OR NEW.title<>OLD.title OR NEW.entry_type<>OLD.entry_type
    OR NEW.starts_at<>OLD.starts_at OR COALESCE(NEW.ends_at,'')<>COALESCE(OLD.ends_at,'')
    OR NEW.timezone<>OLD.timezone OR NEW.scope_type<>OLD.scope_type
    OR COALESCE(NEW.team_id,'')<>COALESCE(OLD.team_id,'')
    OR COALESCE(NEW.event_id,'')<>COALESCE(OLD.event_id,'')
    OR COALESCE(NEW.owner_user_id,'')<>COALESCE(OLD.owner_user_id,'')
    OR NEW.recurrence_frequency<>OLD.recurrence_frequency
    OR NEW.recurrence_interval<>OLD.recurrence_interval
    OR NEW.occurrence_count<>OLD.occurrence_count
    OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
    THEN RAISE(ABORT,'CALENDAR_SERIES_IMMUTABLE_FIELDS') END;
  SELECT CASE WHEN OLD.status<>'active' OR NEW.status<>'cancelled'
    OR NEW.cancelled_at IS NULL OR NEW.cancelled_by<>NEW.updated_by
    OR length(trim(COALESCE(NEW.cancellation_reason,''))) NOT BETWEEN 10 AND 300
    THEN RAISE(ABORT,'CALENDAR_SERIES_INVALID_CANCELLATION') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='branch'
    JOIN capability c ON c.id=rc.capability_id AND c.code='calendar.manage' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.updated_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.updated_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.updated_at)
  ) THEN RAISE(ABORT,'CALENDAR_SERIES_UPDATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER calendar_series_no_delete
BEFORE DELETE ON calendar_series
BEGIN SELECT RAISE(ABORT,'CALENDAR_SERIES_APPEND_ONLY'); END;

CREATE TRIGGER calendar_series_audit_insert
AFTER INSERT ON calendar_series
BEGIN
  INSERT INTO calendar_series_audit(id,series_id,branch_id,actor_user_id,action,reason,safe_metadata,created_at)
  VALUES('calendar-series-created-'||lower(hex(randomblob(16))),NEW.id,NEW.branch_id,NEW.created_by,
    'created',NULL,json_object('frequency',NEW.recurrence_frequency,'interval',NEW.recurrence_interval,
      'occurrence_count',NEW.occurrence_count),NEW.created_at);
END;
CREATE TRIGGER calendar_series_audit_cancel
AFTER UPDATE OF status ON calendar_series
WHEN NEW.status='cancelled' AND OLD.status<>'cancelled'
BEGIN
  INSERT INTO calendar_series_audit(id,series_id,branch_id,actor_user_id,action,reason,safe_metadata,created_at)
  VALUES('calendar-series-cancelled-'||lower(hex(randomblob(16))),NEW.id,NEW.branch_id,NEW.updated_by,
    'cancelled',NEW.cancellation_reason,json_object('cancelled_at',NEW.cancelled_at),NEW.updated_at);
END;

CREATE TRIGGER calendar_entry_series_insert_guard
BEFORE INSERT ON calendar_entry
WHEN NEW.series_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM calendar_series cs
    WHERE cs.id=NEW.series_id AND cs.branch_id=NEW.branch_id
      AND cs.created_by=NEW.created_by AND cs.status='active'
  ) THEN RAISE(ABORT,'CALENDAR_ENTRY_SERIES_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER calendar_entry_series_update_guard
BEFORE UPDATE OF series_id ON calendar_entry
WHEN NEW.series_id IS NOT OLD.series_id AND NEW.series_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM calendar_series cs
    WHERE cs.id=NEW.series_id AND cs.branch_id=NEW.branch_id
      AND cs.created_by=NEW.created_by AND cs.status='active'
  ) THEN RAISE(ABORT,'CALENDAR_ENTRY_SERIES_SCOPE_MISMATCH') END;
END;

UPDATE app_meta SET schema_version=26 WHERE id=1 AND environment='non-production';
