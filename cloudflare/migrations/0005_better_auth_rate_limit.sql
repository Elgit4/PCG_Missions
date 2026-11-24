-- Better Auth's in-memory rate limiter is not shared between Worker
-- isolates. Persist counters in D1 so sign-in throttling is consistent.
CREATE TABLE IF NOT EXISTS rateLimit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL CHECK (count >= 0),
  lastRequest BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS rateLimit_lastRequest_idx ON rateLimit(lastRequest);

UPDATE app_meta
SET schema_version = 5
WHERE id = 1 AND environment = 'non-production';
