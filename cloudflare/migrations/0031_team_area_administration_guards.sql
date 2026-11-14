-- Team and service-area administration hardening for the Cloudflare/D1 port.
-- The Worker authorizes every mutation; these triggers preserve the invariants
-- under concurrent requests and prevent direct SQL paths from bypassing them.

CREATE TABLE team_management_audit (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  actor_profile_id TEXT NOT NULL REFERENCES staff_profile(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK(target_type IN ('team','team_membership','service_area','area_coverage')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(length(action) BETWEEN 3 AND 80),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata) AND json_type(metadata)='object'),
  created_at TEXT NOT NULL
);
CREATE INDEX team_management_audit_branch_created_idx
  ON team_management_audit(branch_id,created_at DESC);
CREATE TRIGGER team_management_audit_no_update
BEFORE UPDATE ON team_management_audit
BEGIN SELECT RAISE(ABORT,'TEAM_MANAGEMENT_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER team_management_audit_no_delete
BEFORE DELETE ON team_management_audit
BEGIN SELECT RAISE(ABORT,'TEAM_MANAGEMENT_AUDIT_IMMUTABLE'); END;

CREATE TRIGGER team_membership_active_parent_guard
BEFORE INSERT ON staff_team_membership
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM team t JOIN branch b ON b.id=t.branch_id
    WHERE t.id=NEW.team_id AND t.branch_id=NEW.branch_id
      AND t.is_active=1 AND b.is_active=1
  ) THEN RAISE(ABORT,'ACTIVE_TEAM_NOT_FOUND') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_profile sp
    WHERE sp.id=NEW.staff_profile_id AND sp.account_status='active'
      AND sp.must_change_password=0
      AND EXISTS (
        SELECT 1 FROM staff_role_assignment ra JOIN role r ON r.id=ra.role_id AND r.is_active=1
        WHERE ra.staff_profile_id=sp.id AND ra.branch_id=NEW.branch_id
          AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
          AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
      )
  ) THEN RAISE(ABORT,'STAFF_NOT_ACTIVE_IN_BRANCH') END;
  SELECT CASE WHEN NEW.membership_role='leader' AND NOT EXISTS (
    SELECT 1 FROM staff_role_assignment ra JOIN role r ON r.id=ra.role_id
    WHERE ra.staff_profile_id=NEW.staff_profile_id AND ra.branch_id=NEW.branch_id
      AND r.code='team_leader' AND r.is_active=1
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
  ) THEN RAISE(ABORT,'TEAM_LEADER_ROLE_REQUIRED') END;
END;

CREATE TRIGGER team_membership_active_parent_update_guard
BEFORE UPDATE OF staff_profile_id,team_id,branch_id,starts_at,membership_role ON staff_team_membership
WHEN NEW.revoked_at IS NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM team t JOIN branch b ON b.id=t.branch_id
    WHERE t.id=NEW.team_id AND t.branch_id=NEW.branch_id
      AND t.is_active=1 AND b.is_active=1
  ) THEN RAISE(ABORT,'ACTIVE_TEAM_NOT_FOUND') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_profile sp
    WHERE sp.id=NEW.staff_profile_id AND sp.account_status='active'
      AND sp.must_change_password=0
      AND EXISTS (
        SELECT 1 FROM staff_role_assignment ra JOIN role r ON r.id=ra.role_id AND r.is_active=1
        WHERE ra.staff_profile_id=sp.id AND ra.branch_id=NEW.branch_id
          AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
          AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
      )
  ) THEN RAISE(ABORT,'STAFF_NOT_ACTIVE_IN_BRANCH') END;
  SELECT CASE WHEN NEW.membership_role='leader' AND NOT EXISTS (
    SELECT 1 FROM staff_role_assignment ra JOIN role r ON r.id=ra.role_id
    WHERE ra.staff_profile_id=NEW.staff_profile_id AND ra.branch_id=NEW.branch_id
      AND r.code='team_leader' AND r.is_active=1
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
  ) THEN RAISE(ABORT,'TEAM_LEADER_ROLE_REQUIRED') END;
END;

CREATE TRIGGER team_deactivation_active_members_guard
BEFORE UPDATE OF is_active ON team
WHEN OLD.is_active=1 AND NEW.is_active=0
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_team_membership stm
    WHERE stm.team_id=OLD.id AND stm.branch_id=OLD.branch_id
      AND stm.revoked_at IS NULL
      AND (stm.ends_at IS NULL OR stm.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) THEN RAISE(ABORT,'TEAM_HAS_ACTIVE_MEMBERS') END;
END;

CREATE TRIGGER area_coverage_active_parent_guard
BEFORE INSERT ON staff_area_coverage
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM service_area sa JOIN branch b ON b.id=sa.branch_id
    WHERE sa.id=NEW.service_area_id AND sa.branch_id=NEW.branch_id
      AND sa.is_active=1 AND b.is_active=1
  ) THEN RAISE(ABORT,'ACTIVE_SERVICE_AREA_NOT_FOUND') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_profile sp
    WHERE sp.id=NEW.staff_profile_id AND sp.account_status='active'
      AND sp.must_change_password=0
      AND EXISTS (
        SELECT 1 FROM staff_role_assignment ra JOIN role r ON r.id=ra.role_id AND r.is_active=1
        WHERE ra.staff_profile_id=sp.id AND ra.branch_id=NEW.branch_id
          AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
          AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
      )
  ) THEN RAISE(ABORT,'STAFF_NOT_ACTIVE_IN_BRANCH') END;
END;

CREATE TRIGGER area_coverage_active_parent_update_guard
BEFORE UPDATE OF staff_profile_id,service_area_id,branch_id,starts_at ON staff_area_coverage
WHEN NEW.ends_at IS NULL OR NEW.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM service_area sa JOIN branch b ON b.id=sa.branch_id
    WHERE sa.id=NEW.service_area_id AND sa.branch_id=NEW.branch_id
      AND sa.is_active=1 AND b.is_active=1
  ) THEN RAISE(ABORT,'ACTIVE_SERVICE_AREA_NOT_FOUND') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM staff_profile sp
    WHERE sp.id=NEW.staff_profile_id AND sp.account_status='active'
      AND sp.must_change_password=0
      AND EXISTS (
        SELECT 1 FROM staff_role_assignment ra JOIN role r ON r.id=ra.role_id AND r.is_active=1
        WHERE ra.staff_profile_id=sp.id AND ra.branch_id=NEW.branch_id
          AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.starts_at
          AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
      )
  ) THEN RAISE(ABORT,'STAFF_NOT_ACTIVE_IN_BRANCH') END;
END;

CREATE TRIGGER area_deactivation_active_coverage_guard
BEFORE UPDATE OF is_active ON service_area
WHEN OLD.is_active=1 AND NEW.is_active=0
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM staff_area_coverage sac
    WHERE sac.service_area_id=OLD.id AND sac.branch_id=OLD.branch_id
      AND (sac.ends_at IS NULL OR sac.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) THEN RAISE(ABORT,'AREA_HAS_ACTIVE_COVERAGE') END;
END;

UPDATE app_meta SET schema_version=31
WHERE id=1 AND environment='non-production' AND schema_version=30;
