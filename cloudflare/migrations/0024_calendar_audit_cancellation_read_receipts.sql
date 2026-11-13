-- Calendar cancellation state, append-only change history and read receipts.
ALTER TABLE calendar_entry ADD COLUMN updated_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE calendar_entry ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled'));
ALTER TABLE calendar_entry ADD COLUMN cancelled_at TEXT;
ALTER TABLE calendar_entry ADD COLUMN cancelled_by TEXT REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT;
ALTER TABLE calendar_entry ADD COLUMN cancellation_reason TEXT;
CREATE INDEX calendar_entry_branch_status_time_idx ON calendar_entry(branch_id,status,starts_at);

CREATE TABLE calendar_entry_change_audit (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES calendar_entry(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('created','updated','cancelled')),
  before_state TEXT CHECK(before_state IS NULL OR (json_valid(before_state) AND json_type(before_state)='object')),
  after_state TEXT NOT NULL CHECK(json_valid(after_state) AND json_type(after_state)='object'),
  created_at TEXT NOT NULL
);
CREATE INDEX calendar_entry_change_audit_branch_time_idx ON calendar_entry_change_audit(branch_id,created_at DESC);
CREATE INDEX calendar_entry_change_audit_entry_time_idx ON calendar_entry_change_audit(entry_id,created_at DESC);
CREATE TRIGGER calendar_entry_audit_insert
AFTER INSERT ON calendar_entry
BEGIN
  INSERT INTO calendar_entry_change_audit
    (id,entry_id,branch_id,actor_user_id,action,before_state,after_state,created_at)
  VALUES (
    'calendar-created-'||lower(hex(randomblob(16))),NEW.id,NEW.branch_id,NEW.created_by,
    'created',NULL,
    json_object('title',NEW.title,'starts_at',NEW.starts_at,'ends_at',NEW.ends_at,
      'scope_type',NEW.scope_type,'status',NEW.status),
    NEW.created_at
  );
END;
CREATE TRIGGER calendar_entry_audit_update
AFTER UPDATE ON calendar_entry
BEGIN
  INSERT INTO calendar_entry_change_audit
    (id,entry_id,branch_id,actor_user_id,action,before_state,after_state,created_at)
  VALUES (
    'calendar-updated-'||lower(hex(randomblob(16))),NEW.id,NEW.branch_id,
    COALESCE(NEW.updated_by,NEW.created_by),
    CASE WHEN NEW.status='cancelled' AND OLD.status<>'cancelled' THEN 'cancelled' ELSE 'updated' END,
    json_object('title',OLD.title,'starts_at',OLD.starts_at,'ends_at',OLD.ends_at,
      'scope_type',OLD.scope_type,'status',OLD.status),
    json_object('title',NEW.title,'starts_at',NEW.starts_at,'ends_at',NEW.ends_at,
      'scope_type',NEW.scope_type,'status',NEW.status,'cancellation_reason',NEW.cancellation_reason),
    NEW.updated_at
  );
END;
CREATE TRIGGER calendar_entry_change_audit_no_update
BEFORE UPDATE ON calendar_entry_change_audit
BEGIN SELECT RAISE(ABORT,'CALENDAR_CHANGE_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER calendar_entry_change_audit_no_delete
BEFORE DELETE ON calendar_entry_change_audit
BEGIN SELECT RAISE(ABORT,'CALENDAR_CHANGE_AUDIT_APPEND_ONLY'); END;

CREATE TABLE calendar_entry_read_receipt (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES calendar_entry(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  staff_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  read_at TEXT NOT NULL,
  UNIQUE(entry_id,staff_user_id),
  FOREIGN KEY(entry_id,branch_id) REFERENCES calendar_entry(id,branch_id) ON DELETE RESTRICT
);
CREATE INDEX calendar_entry_read_receipt_staff_time_idx
  ON calendar_entry_read_receipt(staff_user_id,read_at DESC);
CREATE TRIGGER calendar_entry_read_receipt_no_update
BEFORE UPDATE ON calendar_entry_read_receipt
BEGIN SELECT RAISE(ABORT,'CALENDAR_READ_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER calendar_entry_read_receipt_no_delete
BEFORE DELETE ON calendar_entry_read_receipt
BEGIN SELECT RAISE(ABORT,'CALENDAR_READ_RECEIPT_IMMUTABLE'); END;

UPDATE app_meta SET schema_version=24 WHERE id=1 AND environment='non-production';
