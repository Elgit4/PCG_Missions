-- Explicit, auditable service-area coverage revocation. Coverage is ended,
-- never deleted, including assignments that had a future start date.
ALTER TABLE staff_area_coverage ADD COLUMN revoked_at TEXT;
ALTER TABLE staff_area_coverage ADD COLUMN revoked_by TEXT REFERENCES staff_profile(id) ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS staff_area_coverage_no_overlap_insert;
CREATE TRIGGER staff_area_coverage_no_overlap_insert
BEFORE INSERT ON staff_area_coverage
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_area_coverage existing
    WHERE existing.staff_profile_id=NEW.staff_profile_id
      AND existing.service_area_id=NEW.service_area_id
      AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at,'9999-12-31T23:59:59.999Z')>NEW.starts_at
      AND COALESCE(NEW.ends_at,'9999-12-31T23:59:59.999Z')>existing.starts_at
  ) THEN RAISE(ABORT,'STAFF_AREA_COVERAGE_OVERLAP') END;
END;

DROP TRIGGER IF EXISTS staff_area_coverage_no_overlap_update;
CREATE TRIGGER staff_area_coverage_no_overlap_update
BEFORE UPDATE OF staff_profile_id,service_area_id,starts_at,ends_at,revoked_at
ON staff_area_coverage
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_area_coverage existing
    WHERE existing.id<>NEW.id AND existing.staff_profile_id=NEW.staff_profile_id
      AND existing.service_area_id=NEW.service_area_id AND existing.revoked_at IS NULL
      AND COALESCE(existing.ends_at,'9999-12-31T23:59:59.999Z')>NEW.starts_at
      AND COALESCE(NEW.ends_at,'9999-12-31T23:59:59.999Z')>existing.starts_at
  ) THEN RAISE(ABORT,'STAFF_AREA_COVERAGE_OVERLAP') END;
END;

CREATE TABLE staff_area_coverage_audit (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  service_area_id TEXT NOT NULL REFERENCES service_area(id) ON DELETE RESTRICT,
  coverage_id TEXT NOT NULL REFERENCES staff_area_coverage(id) ON DELETE RESTRICT,
  subject_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('assigned','revoked')),
  occurred_at TEXT NOT NULL
);
CREATE INDEX staff_area_coverage_audit_branch_time_idx
  ON staff_area_coverage_audit(branch_id,occurred_at DESC);
CREATE TRIGGER staff_area_coverage_audit_no_update
BEFORE UPDATE ON staff_area_coverage_audit
BEGIN SELECT RAISE(ABORT,'STAFF_AREA_COVERAGE_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER staff_area_coverage_audit_no_delete
BEFORE DELETE ON staff_area_coverage_audit
BEGIN SELECT RAISE(ABORT,'STAFF_AREA_COVERAGE_AUDIT_APPEND_ONLY'); END;

UPDATE app_meta SET schema_version=31
WHERE id=1 AND environment='non-production' AND schema_version=30;
