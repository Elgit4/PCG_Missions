-- Allow the environment marker to be switched to production only after
-- the full ordered migration chain and data import have been validated.
-- Existing rehearsal/dev databases retain their current marker.
-- Production initialization is an explicit post-migration operation.

CREATE TABLE app_meta_v40 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  environment TEXT NOT NULL CHECK (environment IN ('non-production', 'production')),
  created_at TEXT NOT NULL
);

INSERT INTO app_meta_v40 (id, schema_version, environment, created_at)
SELECT id, 40, environment, created_at
FROM app_meta
WHERE id = 1 AND schema_version = 39;

DROP TABLE app_meta;
ALTER TABLE app_meta_v40 RENAME TO app_meta;
