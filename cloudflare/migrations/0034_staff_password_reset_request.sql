-- Preserve the private staff password-reset request lifecycle in Worker-only D1.
-- This table is not directly exposed to browser clients. Fingerprints are retained as source data;
-- raw passwords, recovery tokens, and access/refresh tokens are never stored here.
CREATE TABLE staff_password_reset_request (
  id TEXT PRIMARY KEY,
  target_profile_id TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branch(id) ON DELETE RESTRICT,
  email_normalized TEXT,
  email_fingerprint TEXT NOT NULL
    CHECK (length(email_fingerprint)=64 AND email_fingerprint NOT GLOB '*[^0-9a-f]*'),
  ip_fingerprint TEXT NOT NULL
    CHECK (length(ip_fingerprint)=64 AND ip_fingerprint NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','approved','denied','completed','unmatched','expired')),
  notification_sent_at TEXT,
  notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reviewed_by_profile_id TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_reason TEXT
    CHECK (review_reason IS NULL OR length(trim(review_reason)) BETWEEN 1 AND 300),
  completed_at TEXT
);
CREATE INDEX staff_password_reset_request_status_expiry_idx
  ON staff_password_reset_request(status, expires_at);
CREATE INDEX staff_password_reset_request_target_idx
  ON staff_password_reset_request(target_profile_id, requested_at DESC);
UPDATE app_meta SET schema_version=34
WHERE id=1 AND environment='non-production';
