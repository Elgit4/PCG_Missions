-- Promote the migrated D1 database only after Better Auth schema 44 is present.
-- This is a one-way environment-marker change; no business data is modified.
CREATE TABLE app_meta_v45 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version = 45),
  environment TEXT NOT NULL CHECK (environment IN ('production')),
  created_at TEXT NOT NULL
);

INSERT INTO app_meta_v45 (id, schema_version, environment, created_at)
SELECT id, 45, 'production', created_at
FROM app_meta
WHERE id = 1 AND schema_version = 44 AND environment = 'non-production';

CREATE TABLE app_meta_v45_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO app_meta_v45_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM app_meta_v45) = 1 THEN 1 ELSE 0 END;

DROP TABLE app_meta;
ALTER TABLE app_meta_v45 RENAME TO app_meta;
DROP TABLE app_meta_v45_guard;
