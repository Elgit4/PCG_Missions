-- Least-privilege pastoral care access: Admin/Pastor only, with explicit case assignment.
-- Branch-scoped access is limited to case metadata. Restricted notes and interactions
-- require an active explicit share and are audited on every read/write.

INSERT OR IGNORE INTO capability (id,code,description,sensitivity,created_at)
VALUES
 ('cap-pastoral-case-metadata-read','pastoral.case.metadata.read',
  'Read pastoral case metadata within an authorized branch without restricted interaction notes.',
  'highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('cap-pastoral-case-interact','pastoral.case.interact',
  'Record restricted pastoral-care interactions on an explicitly assigned case.',
  'highly_restricted',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Preserve the six-role model. No coordinator, team leader, volunteer or intercessor
-- receives pastoral case access by default.
DELETE FROM role_capability
WHERE capability_id IN (
  SELECT id FROM capability
  WHERE code IN ('pastoral.case.metadata.read','pastoral.case.read','pastoral.case.update','pastoral.case.interact')
)
AND role_id <> 'role-admin-pastor';

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-admin-pastor',id,'branch',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM capability WHERE code='pastoral.case.metadata.read';

INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
SELECT 'role-admin-pastor',id,'explicit_share',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM capability
WHERE code IN ('pastoral.case.read','pastoral.case.update','pastoral.case.interact');

ALTER TABLE care_assignment ADD COLUMN assignment_reason TEXT
  CHECK (assignment_reason IS NULL OR length(trim(assignment_reason)) BETWEEN 10 AND 300);
ALTER TABLE care_assignment ADD COLUMN revoked_by TEXT REFERENCES staff_profile(auth_user_id);
ALTER TABLE care_assignment ADD COLUMN revocation_reason TEXT
  CHECK (revocation_reason IS NULL OR length(trim(revocation_reason)) BETWEEN 10 AND 300);
ALTER TABLE care_record ADD COLUMN updated_by TEXT REFERENCES staff_profile(auth_user_id);

-- Only a recipient with the explicit-share read grant may be assigned.
CREATE TRIGGER care_assignment_target_explicit_share_guard
BEFORE INSERT ON care_assignment
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile target
    JOIN staff_role_assignment ra ON ra.staff_profile_id=target.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='explicit_share'
    JOIN capability c ON c.id=rc.capability_id AND c.code='pastoral.case.read' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE target.auth_user_id=NEW.assignee_user_id
      AND target.account_status='active'
      AND ra.revoked_at IS NULL
      AND ra.starts_at<=NEW.starts_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
  ) THEN RAISE(ABORT,'CARE_ASSIGNMENT_TARGET_NOT_AUTHORIZED') END;
END;

-- Re-check that the grantor has branch-scoped sharing authority.
CREATE TRIGGER care_assignment_grantor_scope_guard
BEFORE INSERT ON care_assignment
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='branch'
    JOIN capability c ON c.id=rc.capability_id AND c.code='pastoral.case.share' AND c.is_active=1
    JOIN branch b ON b.id=ra.branch_id AND b.is_active=1
    WHERE actor.auth_user_id=NEW.assigned_by
      AND actor.account_status='active'
      AND ra.revoked_at IS NULL
      AND ra.starts_at<=NEW.starts_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.starts_at)
  ) THEN RAISE(ABORT,'CARE_ASSIGNMENT_GRANTOR_NOT_AUTHORIZED') END;
END;

DROP TRIGGER care_assignment_audit_insert;
CREATE TRIGGER care_assignment_audit_insert
AFTER INSERT ON care_assignment
BEGIN
  INSERT INTO care_access_audit
    (id,care_record_id,branch_id,actor_user_id,action,reason,request_id,safe_metadata,accessed_at)
  VALUES
    ('care-assigned-'||NEW.id,NEW.care_record_id,NEW.branch_id,NEW.assigned_by,
     'assigned',COALESCE(NEW.assignment_reason,'Assigned to an explicitly authorized care worker'),
     NULL,json_object('assignment_id',NEW.id),NEW.created_at);
END;

CREATE TRIGGER care_assignment_immutable_fields
BEFORE UPDATE ON care_assignment
WHEN NEW.id IS NOT OLD.id
  OR NEW.care_record_id IS NOT OLD.care_record_id
  OR NEW.branch_id IS NOT OLD.branch_id
  OR NEW.assignee_user_id IS NOT OLD.assignee_user_id
  OR NEW.assigned_by IS NOT OLD.assigned_by
  OR NEW.starts_at IS NOT OLD.starts_at
  OR NEW.ends_at IS NOT OLD.ends_at
  OR NEW.assignment_reason IS NOT OLD.assignment_reason
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT,'CARE_ASSIGNMENT_IMMUTABLE_FIELDS');
END;

CREATE TRIGGER care_assignment_no_unrevoke
BEFORE UPDATE OF revoked_at ON care_assignment
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
BEGIN
  SELECT RAISE(ABORT,'CARE_ASSIGNMENT_REVOCATION_IMMUTABLE');
END;

CREATE TRIGGER care_assignment_revoke_authorize
BEFORE UPDATE OF revoked_at ON care_assignment
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.revoked_by IS NULL
    OR length(trim(COALESCE(NEW.revocation_reason,''))) NOT BETWEEN 10 AND 300
    THEN RAISE(ABORT,'CARE_ASSIGNMENT_REVOCATION_REASON_REQUIRED') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='branch'
    JOIN capability c ON c.id=rc.capability_id AND c.code='pastoral.case.share' AND c.is_active=1
    WHERE actor.auth_user_id=NEW.revoked_by AND actor.account_status='active'
      AND ra.revoked_at IS NULL AND ra.starts_at<=NEW.revoked_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.revoked_at)
  ) THEN RAISE(ABORT,'CARE_ASSIGNMENT_REVOKE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER care_assignment_no_delete
BEFORE DELETE ON care_assignment
BEGIN
  SELECT RAISE(ABORT,'CARE_ASSIGNMENT_APPEND_ONLY');
END;

CREATE TRIGGER care_assignment_audit_revoke
AFTER UPDATE OF revoked_at ON care_assignment
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO care_access_audit
    (id,care_record_id,branch_id,actor_user_id,action,reason,request_id,safe_metadata,accessed_at)
  VALUES
    ('care-revoked-'||NEW.id,NEW.care_record_id,NEW.branch_id,NEW.revoked_by,
     'revoked',NEW.revocation_reason,NULL,json_object('assignment_id',NEW.id),NEW.revoked_at);
END;

-- Restricted interaction notes are append-only and only available to an assigned
-- Admin/Pastor with explicit-share interaction capability.
CREATE TRIGGER care_interaction_authorize_insert
BEFORE INSERT ON care_interaction
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM care_record cr
    JOIN care_assignment ca ON ca.care_record_id=cr.id AND ca.branch_id=cr.branch_id
    JOIN staff_profile actor ON actor.auth_user_id=NEW.actor_user_id AND actor.account_status='active'
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=cr.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='explicit_share'
    JOIN capability c ON c.id=rc.capability_id AND c.code='pastoral.case.interact' AND c.is_active=1
    WHERE cr.id=NEW.care_record_id
      AND ca.assignee_user_id=NEW.actor_user_id
      AND ca.revoked_at IS NULL
      AND ca.starts_at<=NEW.occurred_at
      AND (ca.ends_at IS NULL OR ca.ends_at>NEW.occurred_at)
      AND ra.revoked_at IS NULL
      AND ra.starts_at<=NEW.occurred_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.occurred_at)
  ) THEN RAISE(ABORT,'CARE_INTERACTION_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER care_interaction_no_update
BEFORE UPDATE ON care_interaction
BEGIN
  SELECT RAISE(ABORT,'CARE_INTERACTION_APPEND_ONLY');
END;
CREATE TRIGGER care_interaction_no_delete
BEFORE DELETE ON care_interaction
BEGIN
  SELECT RAISE(ABORT,'CARE_INTERACTION_APPEND_ONLY');
END;

CREATE TRIGGER care_interaction_audit_insert
AFTER INSERT ON care_interaction
BEGIN
  INSERT INTO care_access_audit
    (id,care_record_id,branch_id,actor_user_id,action,reason,request_id,safe_metadata,accessed_at)
  SELECT
    'care-interaction-'||NEW.id,NEW.care_record_id,cr.branch_id,NEW.actor_user_id,
    'updated','Authorized pastoral-care interaction recorded',NULL,
    json_object('interaction_type',NEW.interaction_type),NEW.created_at
  FROM care_record cr
  WHERE cr.id=NEW.care_record_id;
END;

-- Status updates require an active explicit assignment and cannot alter identity,
-- branch, contact or creation attribution.
CREATE TRIGGER care_record_immutable_fields
BEFORE UPDATE ON care_record
WHEN NEW.id IS NOT OLD.id
  OR NEW.branch_id IS NOT OLD.branch_id
  OR NEW.contact_id IS NOT OLD.contact_id
  OR NEW.care_group_id IS NOT OLD.care_group_id
  OR NEW.created_by IS NOT OLD.created_by
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.reviewed_at IS NOT OLD.reviewed_at
BEGIN
  SELECT RAISE(ABORT,'CARE_RECORD_IMMUTABLE_FIELDS');
END;

CREATE TRIGGER care_record_update_authorize
BEFORE UPDATE OF status ON care_record
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM care_assignment ca
    JOIN staff_profile actor ON actor.auth_user_id=NEW.updated_by AND actor.account_status='active'
    JOIN staff_role_assignment ra ON ra.staff_profile_id=actor.id AND ra.branch_id=NEW.branch_id
    JOIN role r ON r.id=ra.role_id AND r.is_active=1
    JOIN role_capability rc ON rc.role_id=r.id AND rc.scope_mode='explicit_share'
    JOIN capability c ON c.id=rc.capability_id AND c.code='pastoral.case.update' AND c.is_active=1
    WHERE ca.care_record_id=NEW.id AND ca.branch_id=NEW.branch_id
      AND ca.assignee_user_id=NEW.updated_by
      AND ca.revoked_at IS NULL
      AND ca.starts_at<=NEW.updated_at
      AND (ca.ends_at IS NULL OR ca.ends_at>NEW.updated_at)
      AND ra.revoked_at IS NULL
      AND ra.starts_at<=NEW.updated_at
      AND (ra.ends_at IS NULL OR ra.ends_at>NEW.updated_at)
  ) THEN RAISE(ABORT,'CARE_RECORD_UPDATE_NOT_AUTHORIZED') END;
END;

CREATE TRIGGER care_record_no_delete
BEFORE DELETE ON care_record
BEGIN
  SELECT RAISE(ABORT,'CARE_RECORD_APPEND_ONLY');
END;

CREATE TRIGGER care_record_audit_insert
AFTER INSERT ON care_record
BEGIN
  INSERT INTO care_access_audit
    (id,care_record_id,branch_id,actor_user_id,action,reason,request_id,safe_metadata,accessed_at)
  VALUES
    ('care-created-'||NEW.id,NEW.id,NEW.branch_id,NEW.created_by,'created',
     'Pastoral-care case created',NULL,json_object('status',NEW.status),NEW.created_at);
END;

CREATE TRIGGER care_record_audit_update
AFTER UPDATE OF status ON care_record
BEGIN
  INSERT INTO care_access_audit
    (id,care_record_id,branch_id,actor_user_id,action,reason,request_id,safe_metadata,accessed_at)
  VALUES
    ('care-updated-'||NEW.id||'-'||NEW.updated_at,NEW.id,NEW.branch_id,NEW.updated_by,'updated',
     'Pastoral-care case status changed',NULL,json_object('status',NEW.status),NEW.updated_at);
END;

UPDATE app_meta SET schema_version=25 WHERE id=1 AND environment='non-production';
