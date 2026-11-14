-- Event flyer media metadata. Binary objects live in the isolated R2 bucket.
ALTER TABLE event ADD COLUMN flyer_key TEXT;
ALTER TABLE event ADD COLUMN flyer_content_type TEXT CHECK(flyer_content_type IS NULL OR flyer_content_type IN ('image/jpeg','image/png','image/webp'));
ALTER TABLE event ADD COLUMN flyer_size INTEGER CHECK(flyer_size IS NULL OR flyer_size BETWEEN 16 AND 5242880);
ALTER TABLE event ADD COLUMN flyer_updated_at TEXT;
CREATE UNIQUE INDEX event_flyer_key_unique_idx ON event(flyer_key) WHERE flyer_key IS NOT NULL;
CREATE TRIGGER event_flyer_metadata_consistency_insert
BEFORE INSERT ON event
WHEN (NEW.flyer_key IS NULL) <> (NEW.flyer_content_type IS NULL)
  OR (NEW.flyer_key IS NULL) <> (NEW.flyer_size IS NULL)
BEGIN SELECT RAISE(ABORT,'EVENT_FLYER_METADATA_INCOMPLETE'); END;
CREATE TRIGGER event_flyer_metadata_consistency_update
BEFORE UPDATE OF flyer_key,flyer_content_type,flyer_size ON event
WHEN (NEW.flyer_key IS NULL) <> (NEW.flyer_content_type IS NULL)
  OR (NEW.flyer_key IS NULL) <> (NEW.flyer_size IS NULL)
BEGIN SELECT RAISE(ABORT,'EVENT_FLYER_METADATA_INCOMPLETE'); END;
UPDATE app_meta SET schema_version=30 WHERE id=1 AND environment='non-production' AND schema_version=29;
