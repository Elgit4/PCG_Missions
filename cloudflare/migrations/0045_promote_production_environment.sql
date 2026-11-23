-- Advance the shared migration chain to schema 45 without changing environment.
-- Preview remains non-production; the production release workflow performs the
-- separately guarded environment promotion after schema 45 is applied.
UPDATE app_meta
SET schema_version = 45
WHERE id = 1 AND schema_version = 44;
