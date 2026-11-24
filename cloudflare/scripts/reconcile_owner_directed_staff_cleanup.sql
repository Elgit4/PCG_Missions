-- Reconcile only staff records already marked by the owner-directed account-reset audit.
-- This script never deletes or anonymizes a staff profile or ministry history.
-- It is safe to rerun: status updates are conditional and audit IDs are deterministic.

UPDATE staff_profile
SET account_status = 'inactive',
    deactivated_at = COALESCE(deactivated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    account_status_changed_by = (
      SELECT aa.actor_profile_id FROM staff_access_audit aa
      WHERE aa.target_profile_id = staff_profile.id
        AND aa.action = 'account_deactivated'
        AND json_extract(aa.metadata, '$.operation') = 'owner_directed_account_reset'
      ORDER BY aa.created_at DESC LIMIT 1
    ),
    account_status_changed_branch_id = (
      SELECT aa.branch_id FROM staff_access_audit aa
      WHERE aa.target_profile_id = staff_profile.id
        AND aa.action = 'account_deactivated'
        AND json_extract(aa.metadata, '$.operation') = 'owner_directed_account_reset'
      ORDER BY aa.created_at DESC LIMIT 1
    ),
    account_status_reason = 'Owner-directed removal of login access; preserve ministry history.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE account_status = 'active'
  AND deactivated_at IS NULL
  AND must_change_password = 1
  AND (password_setup_expires_at IS NULL OR datetime(password_setup_expires_at) < datetime('now'))
  AND NOT EXISTS (
    SELECT 1 FROM staff_role_assignment a
    WHERE a.staff_profile_id = staff_profile.id AND a.revoked_at IS NULL
      AND datetime(a.starts_at) <= datetime('now')
      AND (a.ends_at IS NULL OR datetime(a.ends_at) > datetime('now'))
  )
  AND NOT EXISTS (SELECT 1 FROM session se WHERE se.userId = staff_profile.auth_user_id)
  AND EXISTS (
    SELECT 1 FROM staff_access_audit aa
    WHERE aa.target_profile_id = staff_profile.id AND aa.action = 'account_deactivated'
      AND json_extract(aa.metadata, '$.operation') = 'owner_directed_account_reset'
  );

-- Correct the earlier access-audit claim without erasing the identity or ministry history.
INSERT OR IGNORE INTO staff_access_audit
  (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
SELECT
  'owner-reset-reconciled-' || s.id, sa.branch_id, sa.actor_profile_id, s.id,
  'account_deactivated',
  'Reconciled owner-directed login removal; identity retained for ministry history.',
  json_object('operation','owner_directed_account_reset_reconciled',
              'identity_anonymized',0,
              'identity_retained_for_ministry_history',1,
              'prior_audit_id',aa.id),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM staff_profile s
JOIN staff_account_audit sa
  ON sa.target_profile_id=s.id AND sa.action='account_deactivated'
 AND sa.reason='Owner-directed removal of login access; preserve ministry history.'
 AND sa.created_at=s.updated_at
JOIN staff_access_audit aa
  ON aa.target_profile_id=s.id AND aa.action='account_deactivated'
 AND json_extract(aa.metadata,'$.operation')='owner_directed_account_reset'
WHERE s.account_status='inactive' AND s.deactivated_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM staff_access_audit existing WHERE existing.id='owner-reset-reconciled-'||s.id);

-- Revoke only the still-effective team_leader assignment of an already inactive,
-- owner-audited profile with no session. No other role or staff record is touched.
UPDATE staff_role_assignment
SET revoked_at=COALESCE(revoked_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    revoked_by=(
      SELECT aa.actor_profile_id FROM staff_access_audit aa
      WHERE aa.target_profile_id=staff_role_assignment.staff_profile_id
        AND aa.action='account_deactivated'
        AND json_extract(aa.metadata,'$.operation')='owner_directed_account_reset'
      ORDER BY aa.created_at DESC LIMIT 1
    ),
    reason='Owner-directed removal of login access; preserve ministry history.'
WHERE revoked_at IS NULL
  AND role_id=(SELECT id FROM role WHERE code='team_leader')
  AND EXISTS (SELECT 1 FROM staff_profile s WHERE s.id=staff_role_assignment.staff_profile_id
    AND (s.account_status<>'active' OR s.deactivated_at IS NOT NULL))
  AND NOT EXISTS (SELECT 1 FROM session se JOIN staff_profile s ON s.auth_user_id=se.userId
    WHERE s.id=staff_role_assignment.staff_profile_id)
  AND EXISTS (SELECT 1 FROM staff_access_audit aa WHERE aa.target_profile_id=staff_role_assignment.staff_profile_id
    AND aa.action='account_deactivated'
    AND json_extract(aa.metadata,'$.operation')='owner_directed_account_reset');

-- Preserve an immutable audit event for the stale role grant that was revoked.
INSERT OR IGNORE INTO staff_access_audit
  (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
SELECT
  'owner-reset-role-revoked-'||a.id, a.branch_id, a.revoked_by, a.staff_profile_id,
  'role_revoked',
  'Reconciled owner-directed login removal by revoking the remaining team_leader assignment.',
  json_object('operation','owner_directed_account_reset_reconciled',
              'assignment_id',a.id,'role_code',r.code),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM staff_role_assignment a
JOIN role r ON r.id=a.role_id AND r.code='team_leader'
WHERE a.revoked_at IS NOT NULL
  AND a.reason='Owner-directed removal of login access; preserve ministry history.'
  AND a.revoked_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM staff_access_audit aa WHERE aa.target_profile_id=a.staff_profile_id
    AND aa.action='account_deactivated'
    AND json_extract(aa.metadata,'$.operation')='owner_directed_account_reset')
  AND NOT EXISTS (SELECT 1 FROM staff_access_audit existing WHERE existing.id='owner-reset-role-revoked-'||a.id);
