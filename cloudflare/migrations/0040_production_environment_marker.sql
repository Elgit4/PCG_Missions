-- Allow the environment marker to be switched to production only after
-- the full ordered migration chain and data import have been validated.
-- Existing rehearsal/dev databases retain their current marker.
-- Abort without dropping app_meta unless schema version 39 is present.

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

CREATE TABLE app_meta_migration_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO app_meta_migration_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM app_meta_v40) = 1 THEN 1 ELSE 0 END;

DROP TABLE app_meta;
ALTER TABLE app_meta_v40 RENAME TO app_meta;
DROP TABLE app_meta_migration_guard;
