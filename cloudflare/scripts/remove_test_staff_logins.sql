-- Owner-approved one-time cleanup of the two non-production test logins.
-- Preserve all staff_profile IDs, church/ministry foreign keys and append-only audit history.
-- Original email addresses are released for reuse by the existing /api/v1/staff/accounts onboarding flow.
-- Idempotent: safe to rerun after a partial interrupted execution.

-- 1. Revoke Nana's only outstanding role assignment. No active ministry assignments
--    reference either test login (checked by the preflight workflow).
UPDATE staff_role_assignment
SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    revoked_by = 'ff3da224-34df-4702-93fd-6011cc52e4e9',
    reason = 'Owner-approved removal of a test login; access revoked for fresh onboarding.'
WHERE id = 'b17e5a7f-a359-49c2-9cb6-a73f0245117d'
  AND staff_profile_id = 'd9c55d3f-ec29-457f-a131-621a72d326e9'
  AND branch_id = '2951a1c3-fb47-49c1-a83a-435daf3419c2'
  AND revoked_at IS NULL;

-- 2. Deactivate Nyarko, who is still marked active but has no current role.
--    Migration 0047 allows a branch-linked profile to be deactivated even after
--    its current role is missing. The status trigger revokes any remaining sessions
--    and writes the corresponding immutable staff_account_audit row.
UPDATE staff_profile
SET account_status = 'inactive',
    deactivated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    account_status_changed_by = 'ff3da224-34df-4702-93fd-6011cc52e4e9',
    account_status_changed_branch_id = '2951a1c3-fb47-49c1-a83a-435daf3419c2',
    account_status_reason = 'Owner-approved removal of a test login; access revoked for fresh onboarding.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'd5c922ca-0e64-4a65-b14e-128c9131f79c'
  AND auth_user_id = 'a75f19b8-be85-4a90-835c-d8848bad8bc1'
  AND account_status = 'active';

-- 5. Preserve the profile/user IDs for all foreign keys, but erase staff PII
--    and make both profiles permanently ineligible for login.
UPDATE staff_profile
SET full_name = 'Removed test account',
    email = NULL,
    phone_e164 = NULL,
    must_change_password = 1,
    password_setup_expires_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id IN (
  'd5c922ca-0e64-4a65-b14e-128c9131f79c',
  'd9c55d3f-ec29-457f-a131-621a72d326e9'
)
  AND account_status = 'inactive';

-- 6. Remove every login credential/session and any residual email verification
--    material. Delete the Better Auth credentials only, not the user/profile rows.
DELETE FROM session
WHERE userId IN (
  'a75f19b8-be85-4a90-835c-d8848bad8bc1',
  'b831e1e5-e2f5-4257-bd90-e7c84c4e6c91'
);

DELETE FROM account
WHERE userId IN (
  'a75f19b8-be85-4a90-835c-d8848bad8bc1',
  'b831e1e5-e2f5-4257-bd90-e7c84c4e6c91'
);

DELETE FROM verification
WHERE lower(identifier) IN (
  'eltech6363@gmail.com',
  'nanaseiboateng15@gmail.com'
);

DELETE FROM staff_push_subscription
WHERE staff_profile_id IN (
  'd5c922ca-0e64-4a65-b14e-128c9131f79c',
  'd9c55d3f-ec29-457f-a131-621a72d326e9'
);

-- 7. Retain auth user IDs as tombstones, but anonymise the user rows and release
--    both original addresses so the normal Admin/Pastor "Create staff account"
--    workflow can provision those addresses again from scratch.
UPDATE "user"
SET name = 'Removed test account',
    email = 'removed+' || id || '@invalid.example',
    emailVerified = 0,
    image = NULL,
    updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id IN (
  'a75f19b8-be85-4a90-835c-d8848bad8bc1',
  'b831e1e5-e2f5-4257-bd90-e7c84c4e6c91'
);

-- Completion audits are appended only after profile anonymisation, credential/session
-- deletion and email release have all succeeded. A partially failed run can be retried
-- without recording a false 'completed' state.
-- 3. Append the completed operation to staff access audit. The earlier preliminary
--    audit entries are append-only and remain; these new rows explicitly record
--    that the reset is now complete, not merely requested.
INSERT OR IGNORE INTO staff_access_audit
  (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
SELECT
  'owner-test-login-removal-complete-' || sp.id,
  '2951a1c3-fb47-49c1-a83a-435daf3419c2',
  'ff3da224-34df-4702-93fd-6011cc52e4e9',
  sp.id,
  'account_deactivated',
  'Completed owner-approved removal of a test login; audit history retained and email released for onboarding.',
  json_object(
    'operation','owner_approved_test_login_cleanup',
    'status','completed',
    'credential_removed',1,
    'original_email_released',1,
    'staff_profile_preserved',1,
    'ministry_history_preserved',1
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM staff_profile sp
WHERE sp.id IN (
  'd5c922ca-0e64-4a65-b14e-128c9131f79c',
  'd9c55d3f-ec29-457f-a131-621a72d326e9'
);

-- 4. Explicit role-revocation audit for Nana's old team_leader assignment.
INSERT OR IGNORE INTO staff_access_audit
  (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
SELECT
  'owner-test-role-removal-complete-' || a.id,
  a.branch_id,
  'ff3da224-34df-4702-93fd-6011cc52e4e9',
  a.staff_profile_id,
  'role_revoked',
  'Owner-approved removal of the test account; previous team_leader assignment revoked.',
  json_object('operation','owner_approved_test_login_cleanup','role_code','team_leader','assignment_id',a.id),
  COALESCE(a.revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM staff_role_assignment a
WHERE a.id = 'b17e5a7f-a359-49c2-9cb6-a73f0245117d'
  AND a.revoked_at IS NOT NULL
  AND a.staff_profile_id = 'd9c55d3f-ec29-457f-a131-621a72d326e9';

-- Nana was already inactive before this cleanup, so the status-change trigger
-- does not fire for her. Append her corresponding account audit once.
INSERT OR IGNORE INTO staff_account_audit
  (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
SELECT
  'owner-test-account-removal-complete-nana',
  '2951a1c3-fb47-49c1-a83a-435daf3419c2',
  'ff3da224-34df-4702-93fd-6011cc52e4e9',
  'd9c55d3f-ec29-457f-a131-621a72d326e9',
  'account_deactivated',
  'Completed owner-approved removal of the inactive test login; audit history retained and email released for onboarding.',
  json_object('operation','owner_approved_test_login_cleanup','status','completed','credential_removed',1,'original_email_released',1,'staff_profile_preserved',1),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (
  SELECT 1 FROM staff_profile
  WHERE id = 'd9c55d3f-ec29-457f-a131-621a72d326e9'
    AND account_status = 'inactive'
);


