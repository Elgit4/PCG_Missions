-- Read-only guard for the owner-approved one-time cleanup of two test staff
-- logins. The cleanup must not run outside production or after ministry data
-- has been created. The existing profile/user IDs are preserved by the cleanup.
SELECT
  CASE WHEN
    app_meta.environment = 'production'
    AND EXISTS (
      SELECT 1 FROM staff_profile
      WHERE id = 'ff3da224-34df-4702-93fd-6011cc52e4e9'
        AND auth_user_id = 'ed68338d-3edd-4720-a30a-16f590c8ada2'
        AND account_status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM staff_role_assignment a
      JOIN role r ON r.id = a.role_id
      WHERE a.staff_profile_id = 'ff3da224-34df-4702-93fd-6011cc52e4e9'
        AND a.branch_id = '2951a1c3-fb47-49c1-a83a-435daf3419c2'
        AND r.code = 'admin_pastor'
        AND a.revoked_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM staff_profile
      WHERE id = 'd5c922ca-0e64-4a65-b14e-128c9131f79c'
        AND auth_user_id = 'a75f19b8-be85-4a90-835c-d8848bad8bc1'
        AND (
          (account_status = 'active'
            AND must_change_password = 1
            AND password_setup_expires_at IS NOT NULL
            AND julianday(password_setup_expires_at) < julianday('now'))
          OR
          (account_status = 'inactive'
            AND full_name = 'Removed test account'
            AND email IS NULL
            AND password_setup_expires_at IS NULL)
        )
    )
    AND EXISTS (
      SELECT 1 FROM staff_profile
      WHERE id = 'd9c55d3f-ec29-457f-a131-621a72d326e9'
        AND auth_user_id = 'b831e1e5-e2f5-4257-bd90-e7c84c4e6c91'
        AND account_status = 'inactive'
        AND (
          (full_name = 'Nana' AND email IS NOT NULL)
          OR (full_name = 'Removed test account' AND email IS NULL)
        )
    )
    AND EXISTS (
      SELECT 1 FROM staff_role_assignment a
      JOIN role r ON r.id = a.role_id
      WHERE a.id = 'b17e5a7f-a359-49c2-9cb6-a73f0245117d'
        AND a.staff_profile_id = 'd9c55d3f-ec29-457f-a131-621a72d326e9'
        AND a.branch_id = '2951a1c3-fb47-49c1-a83a-435daf3419c2'
        AND r.code = 'team_leader'
    )
    AND EXISTS (SELECT 1 FROM "user" WHERE id = 'a75f19b8-be85-4a90-835c-d8848bad8bc1')
    AND EXISTS (SELECT 1 FROM "user" WHERE id = 'b831e1e5-e2f5-4257-bd90-e7c84c4e6c91')
    AND NOT EXISTS (
      SELECT 1 FROM staff_role_assignment
      WHERE staff_profile_id = 'd5c922ca-0e64-4a65-b14e-128c9131f79c'
        AND revoked_at IS NULL
        AND starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND (ends_at IS NULL OR ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
    AND (
      SELECT COUNT(*) FROM staff_role_assignment
      WHERE staff_profile_id = 'd9c55d3f-ec29-457f-a131-621a72d326e9'
        AND revoked_at IS NULL
        AND starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND (ends_at IS NULL OR ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ) IN (0, 1)
    AND (SELECT COUNT(*) FROM contact) = 0
    AND (SELECT COUNT(*) FROM contact_assignment) = 0
    AND (SELECT COUNT(*) FROM contact_capture) = 0
    AND (SELECT COUNT(*) FROM contact_interaction) = 0
    AND (SELECT COUNT(*) FROM contact_note) = 0
    AND (SELECT COUNT(*) FROM followup_task) = 0
    AND (SELECT COUNT(*) FROM followup_task_event) = 0
    AND (SELECT COUNT(*) FROM event) = 0
    AND (SELECT COUNT(*) FROM event_registration) = 0
    AND (SELECT COUNT(*) FROM event_checkin) = 0
    AND (SELECT COUNT(*) FROM event_closeout) = 0
    AND (SELECT COUNT(*) FROM event_closeout_event) = 0
    AND (SELECT COUNT(*) FROM event_staff_assignment) = 0
    AND (SELECT COUNT(*) FROM event_team_assignment) = 0
    AND (SELECT COUNT(*) FROM event_idempotency_receipt) = 0
    AND (SELECT COUNT(*) FROM ministry_report) = 0
    AND (SELECT COUNT(*) FROM report_review_event) = 0
    AND (SELECT COUNT(*) FROM announcement) = 0
    AND (SELECT COUNT(*) FROM calendar_entry) = 0
    AND (SELECT COUNT(*) FROM calendar_series) = 0
    AND (SELECT COUNT(*) FROM prayer_request) = 0
    AND (SELECT COUNT(*) FROM prayer_assignment) = 0
    AND (SELECT COUNT(*) FROM prayer_access_audit) = 0
    AND (SELECT COUNT(*) FROM care_record) = 0
    AND (SELECT COUNT(*) FROM staff_notification) = 0
    AND (SELECT COUNT(*) FROM church_public_profile) = 0
    AND (SELECT COUNT(*) FROM daily_word) = 0
    AND (SELECT COUNT(*) FROM digital_tract) = 0
    AND (SELECT COUNT(*) FROM sermon) = 0
    AND (SELECT COUNT(*) FROM welcome_message) = 0
    AND (SELECT COUNT(*) FROM team) = 0
    AND (SELECT COUNT(*) FROM service_area) = 0
    AND (SELECT COUNT(*) FROM transport_option) = 0
    AND (SELECT COUNT(*) FROM transport_reservation) = 0
    AND (SELECT COUNT(*) FROM staff_record_share) = 0
    AND (SELECT COUNT(*) FROM sensitive_record_access_audit) = 0
  THEN 1 ELSE 0 END AS cleanup_allowed,
  (SELECT COUNT(*) FROM contact) AS contacts,
  (SELECT COUNT(*) FROM followup_task) AS followup_tasks,
  (SELECT COUNT(*) FROM event) AS events,
  (SELECT COUNT(*) FROM ministry_report) AS reports,
  (SELECT COUNT(*) FROM prayer_request) AS prayer_requests;
