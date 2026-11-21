-- Internal, recipient-scoped notifications from Supabase migration 22.
-- Event/follow-up/report producers and API handlers are implemented separately in Workers.
CREATE TABLE staff_notification (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  recipient_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('followup_assigned','event_assigned','report_reviewed','system')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 500),
  target_type TEXT CHECK (target_type IS NULL OR target_type IN ('followup_task','event','ministry_report')),
  target_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 240),
  created_at TEXT NOT NULL,
  read_at TEXT,
  CHECK (
    (target_type IS NULL AND target_id IS NULL)
    OR (target_type IS NOT NULL AND target_id IS NOT NULL)
  )
);
CREATE INDEX staff_notification_recipient_unread_idx
  ON staff_notification(recipient_user_id, branch_id, read_at, created_at DESC);
CREATE INDEX staff_notification_branch_created_idx
  ON staff_notification(branch_id, created_at DESC);
UPDATE app_meta SET schema_version=35
WHERE id=1 AND environment='non-production';
