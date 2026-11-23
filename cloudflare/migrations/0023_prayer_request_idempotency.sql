-- Idempotent, branch-scoped authenticated prayer intake.
CREATE TABLE prayer_request_idempotency (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES staff_profile(auth_user_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
  digest_hex TEXT NOT NULL CHECK(length(digest_hex)=64 AND digest_hex NOT GLOB '*[^0-9a-f]*'),
  prayer_request_id TEXT NOT NULL UNIQUE REFERENCES prayer_request(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE(branch_id,idempotency_key)
);
CREATE INDEX prayer_request_idempotency_actor_idx
  ON prayer_request_idempotency(branch_id,actor_user_id,created_at DESC);
UPDATE app_meta SET schema_version=23 WHERE id=1 AND environment='non-production';
