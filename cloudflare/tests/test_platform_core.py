from pathlib import Path
import sqlite3
import unittest
import re


MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "0001_platform_core.sql"


class PlatformCoreMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
        self.db.executescript((MIGRATION.parent / "0002_contacts_followup.sql").read_text(encoding="utf-8"))
        self.db.executescript((MIGRATION.parent / "0004_staff_session_revocation.sql").read_text(encoding="utf-8"))
        self.db.executescript((MIGRATION.parent / "0005_better_auth_rate_limit.sql").read_text(encoding="utf-8"))
        self.db.executescript((MIGRATION.parent / "0006_last_role_session_revocation.sql").read_text(encoding="utf-8"))
        self.db.execute(
            'INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
            ("user-1", "Admin Pastor", "admin@example.test", 1, 1),
        )
        self.db.execute(
            "INSERT INTO church (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("church-1", "Test Church", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
        )
        self.db.execute(
            "INSERT INTO branch (id, church_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            ("branch-1", "church-1", "Main Branch", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
        )
        self.db.execute(
            "INSERT INTO role (id, code, name, created_at) VALUES (?, ?, ?, ?)",
            ("role-1", "admin_pastor", "Administrator", "2026-01-01T00:00:00.000Z"),
        )
        self.db.execute(
            """INSERT INTO staff_profile
               (id, auth_user_id, full_name, account_status, created_at, updated_at)
               VALUES (?, ?, ?, 'active', ?, ?)""",
            ("staff-1", "user-1", "Admin Pastor", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
        )
        self.db.execute(
            "INSERT INTO team (id, branch_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            ("team-1", "branch-1", "Follow Up", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
        )
        self.db.execute(
            "INSERT INTO service_area (id, branch_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            ("area-1", "branch-1", "Tema", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
        )

    def tearDown(self):
        self.db.close()

    def assignment(self, assignment_id, start, end=None):
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, ends_at, created_at)
               VALUES (?, 'staff-1', 'role-1', 'branch-1', 'staff-1', ?, ?, ?)""",
            (assignment_id, start, end, start),
        )


    def test_staff_deactivation_revokes_all_existing_auth_sessions(self):
        self.db.execute(
            """INSERT INTO session
               (id, expiresAt, token, createdAt, updatedAt, userId)
               VALUES ('session-1', 9999999999, 'opaque-session-token', 1, 1, 'user-1')"""
        )
        self.db.execute(
            """INSERT INTO session
               (id, expiresAt, token, createdAt, updatedAt, userId)
               VALUES ('session-2', 9999999999, 'another-opaque-session-token', 1, 1, 'user-1')"""
        )
        self.db.execute(
            "UPDATE staff_profile SET account_status = 'inactive', deactivated_at = ? WHERE id = 'staff-1'",
            ("2026-01-02T00:00:00.000Z",),
        )
        remaining = self.db.execute(
            "SELECT COUNT(*) FROM session WHERE userId = 'user-1'"
        ).fetchone()[0]
        self.assertEqual(remaining, 0)


    def test_better_auth_rate_limit_storage_has_unique_persistent_keys(self):
        self.db.execute(
            """INSERT INTO rateLimit (id, key, count, lastRequest)
               VALUES ('rl-1', '203.0.113.8|/sign-in/email', 1, 1767225600000)"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO rateLimit (id, key, count, lastRequest)
                   VALUES ('rl-2', '203.0.113.8|/sign-in/email', 1, 1767225600000)"""
            )


    def test_revoking_last_active_role_assignment_revokes_sessions(self):
        self.assignment("last-role-assignment", "2026-01-01T00:00:00.000Z")
        self.db.execute(
            """INSERT INTO session
               (id, expiresAt, token, createdAt, updatedAt, userId)
               VALUES ('last-role-session', 9999999999, 'last-role-token', 1, 1, 'user-1')"""
        )
        self.db.execute(
            "UPDATE staff_role_assignment SET revoked_at = ? WHERE id = 'last-role-assignment'",
            ("2026-01-02T00:00:00.000Z",),
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM session WHERE userId = 'user-1'").fetchone()[0],
            0,
        )

    def test_schema_is_non_production_and_expected_tables_exist(self):
        meta = self.db.execute(
            "SELECT schema_version, environment FROM app_meta WHERE id = 1"
        ).fetchone()
        self.assertEqual(meta, (6, "non-production"))
        names = {
            row[0] for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        self.assertTrue({
            "user", "session", "account", "verification", "church", "branch",
            "role", "capability", "role_capability", "staff_profile",
            "staff_role_assignment", "staff_access_audit", "team",
            "service_area", "staff_team_membership", "staff_area_coverage",
        }.issubset(names))

    def test_role_assignment_overlap_is_rejected_but_adjacent_period_is_allowed(self):
        self.assignment("assignment-1", "2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z")
        with self.assertRaises(sqlite3.IntegrityError):
            self.assignment("assignment-overlap", "2026-01-15T00:00:00.000Z", "2026-03-01T00:00:00.000Z")
        self.assignment("assignment-adjacent", "2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z")

    def test_role_assignment_update_overlap_is_rejected(self):
        self.assignment("assignment-1", "2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z")
        self.assignment("assignment-2", "2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "UPDATE staff_role_assignment SET starts_at = ? WHERE id = ?",
                ("2026-01-15T00:00:00.000Z", "assignment-2"),
            )

    def test_team_membership_overlap_is_rejected(self):
        self.db.execute(
            """INSERT INTO staff_team_membership
               (id, staff_profile_id, team_id, branch_id, starts_at, created_by, created_at)
               VALUES ('member-1', 'staff-1', 'team-1', 'branch-1',
                       '2026-01-01T00:00:00.000Z', 'staff-1', '2026-01-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO staff_team_membership
                   (id, staff_profile_id, team_id, branch_id, starts_at, created_by, created_at)
                   VALUES ('member-2', 'staff-1', 'team-1', 'branch-1',
                           '2026-01-02T00:00:00.000Z', 'staff-1', '2026-01-02T00:00:00.000Z')"""
            )

    def test_area_coverage_overlap_is_rejected(self):
        self.db.execute(
            """INSERT INTO staff_area_coverage
               (id, staff_profile_id, service_area_id, branch_id, starts_at, created_by, created_at)
               VALUES ('coverage-1', 'staff-1', 'area-1', 'branch-1',
                       '2026-01-01T00:00:00.000Z', 'staff-1', '2026-01-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO staff_area_coverage
                   (id, staff_profile_id, service_area_id, branch_id, starts_at, created_by, created_at)
                   VALUES ('coverage-2', 'staff-1', 'area-1', 'branch-1',
                           '2026-01-02T00:00:00.000Z', 'staff-1', '2026-01-02T00:00:00.000Z')"""
            )

    def test_access_audit_is_append_only(self):
        self.db.execute(
            """INSERT INTO staff_access_audit
               (id, branch_id, actor_profile_id, target_profile_id, action, reason, created_at)
               VALUES ('audit-1', 'branch-1', 'staff-1', 'staff-1',
                       'account_created', 'Initial test account setup', '2026-01-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE staff_access_audit SET reason = 'tampered audit reason' WHERE id = 'audit-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM staff_access_audit WHERE id = 'audit-1'")

    def test_staff_profile_cannot_reference_missing_identity(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO staff_profile
                   (id, auth_user_id, full_name, account_status, created_at, updated_at)
                   VALUES ('staff-2', 'missing-user', 'Another Person', 'invited',
                           '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
            )


    def test_team_membership_update_overlap_is_rejected(self):
        self.db.execute(
            """INSERT INTO staff_team_membership
               (id, staff_profile_id, team_id, branch_id, starts_at, ends_at, created_by, created_at)
               VALUES ('member-1', 'staff-1', 'team-1', 'branch-1',
                       '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
                       'staff-1', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO staff_team_membership
               (id, staff_profile_id, team_id, branch_id, starts_at, ends_at, created_by, created_at)
               VALUES ('member-2', 'staff-1', 'team-1', 'branch-1',
                       '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z',
                       'staff-1', '2026-02-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "UPDATE staff_team_membership SET starts_at = ? WHERE id = ?",
                ("2026-01-15T00:00:00.000Z", "member-2"),
            )

    def test_area_coverage_update_overlap_is_rejected(self):
        self.db.execute(
            """INSERT INTO staff_area_coverage
               (id, staff_profile_id, service_area_id, branch_id, starts_at, ends_at, created_by, created_at)
               VALUES ('coverage-1', 'staff-1', 'area-1', 'branch-1',
                       '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
                       'staff-1', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO staff_area_coverage
               (id, staff_profile_id, service_area_id, branch_id, starts_at, ends_at, created_by, created_at)
               VALUES ('coverage-2', 'staff-1', 'area-1', 'branch-1',
                       '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z',
                       'staff-1', '2026-02-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "UPDATE staff_area_coverage SET starts_at = ? WHERE id = ?",
                ("2026-01-15T00:00:00.000Z", "coverage-2"),
            )

    def test_capability_code_format_is_constrained(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO capability (id, code, description, created_at)
                   VALUES ('cap-bad', 'Invalid Code!', 'invalid', '2026-01-01T00:00:00.000Z')"""
            )
        self.db.execute(
            """INSERT INTO capability (id, code, description, created_at)
               VALUES ('cap-good', 'contacts.read', 'Read contacts', '2026-01-01T00:00:00.000Z')"""
        )


    def add_contact(self, contact_id="contact-1", email=None):
        self.db.execute(
            """INSERT INTO contact
               (id, branch_id, first_name, email_normalized, created_by, created_at, updated_at)
               VALUES (?, 'branch-1', 'Ama', ?, 'user-1',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
            (contact_id, email),
        )

    def test_contact_email_must_be_normalized(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.add_contact(email="Ama@Example.com")
        self.add_contact(email="ama@example.com")

    def test_contact_capture_idempotency_and_metadata_allowlist(self):
        self.add_contact()
        values = (
            "capture-1", "contact-1", "branch-1", "staff_manual", "request-1",
            bytes(range(32)), "2026-01-01T00:00:00.000Z", '{"app_version":"1.0"}',
            "2026-01-01T00:00:00.000Z",
        )
        self.db.execute(
            """INSERT INTO contact_capture
               (id, contact_id, branch_id, capture_source, client_request_id,
                request_digest, captured_at, source_metadata, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            values,
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO contact_capture
                   (id, contact_id, branch_id, capture_source, client_request_id,
                    request_digest, captured_at, source_metadata, created_at)
                   VALUES ('capture-2', 'contact-1', 'branch-1', 'staff_manual', 'request-1',
                           ?, '2026-01-01T00:00:00.000Z', '{}', '2026-01-01T00:00:00.000Z')""",
                (bytes(range(32)),),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO contact_capture
                   (id, contact_id, branch_id, capture_source, client_request_id,
                    request_digest, captured_at, source_metadata, created_at)
                   VALUES ('capture-3', 'contact-1', 'branch-1', 'staff_manual', 'request-3',
                           ?, '2026-01-01T00:00:00.000Z', '{"unexpected":"secret"}',
                           '2026-01-01T00:00:00.000Z')""",
                (bytes(range(32)),),
            )

    def test_contact_assignment_rejects_overlapping_staff_periods(self):
        self.add_contact()
        self.db.execute(
            """INSERT INTO contact_assignment
               (id, contact_id, branch_id, assignee_user_id, assigned_by, starts_at, ends_at, created_at)
               VALUES ('assign-1', 'contact-1', 'branch-1', 'user-1', 'user-1',
                       '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
                       '2026-01-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO contact_assignment
                   (id, contact_id, branch_id, assignee_user_id, assigned_by, starts_at, created_at)
                   VALUES ('assign-2', 'contact-1', 'branch-1', 'user-1', 'user-1',
                           '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')"""
            )

    def test_contact_assignment_requires_exactly_one_target(self):
        self.add_contact()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO contact_assignment
                   (id, contact_id, branch_id, assigned_by, starts_at, created_at)
                   VALUES ('assign-invalid', 'contact-1', 'branch-1', 'user-1',
                           '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
            )

    def test_followup_task_completion_requires_timestamp_and_one_target(self):
        self.add_contact()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO followup_task
                   (id, contact_id, branch_id, assignee_user_id, created_by,
                    status, created_at, updated_at)
                   VALUES ('task-invalid', 'contact-1', 'branch-1', 'user-1', 'user-1',
                           'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO followup_task
                   (id, contact_id, branch_id, created_by, created_at, updated_at)
                   VALUES ('task-no-target', 'contact-1', 'branch-1', 'user-1',
                           '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
            )

    def test_followup_task_event_is_append_only(self):
        self.add_contact()
        self.db.execute(
            """INSERT INTO followup_task
               (id, contact_id, branch_id, assignee_user_id, created_by, created_at, updated_at)
               VALUES ('task-1', 'contact-1', 'branch-1', 'user-1', 'user-1',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO followup_task_event
               (id, task_id, actor_user_id, event_type, details, created_at)
               VALUES ('task-event-1', 'task-1', 'user-1', 'created', '{}',
                       '2026-01-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE followup_task_event SET event_type = 'cancelled' WHERE id = 'task-event-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM followup_task_event WHERE id = 'task-event-1'")




if __name__ == "__main__":
    unittest.main()


class StaffAuthorizationPolicyTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        migrations = Path(__file__).resolve().parents[1] / "migrations"
        for name in ("0001_platform_core.sql", "0002_contacts_followup.sql", "0003_staff_authorization_policy.sql", "0004_staff_session_revocation.sql", "0005_better_auth_rate_limit.sql", "0006_last_role_session_revocation.sql", "0007_staff_lifecycle_and_admin_revocation.sql", "0008_staff_invitation_onboarding.sql", "0009_contacts_private_field_write.sql", "0010_contact_assignment_audit.sql", "0011_followup_task_idempotency.sql", "0012_prayer_pastoral_care.sql", "0013_events_attendance_transport.sql", "0014_calendar_announcements_public_content.sql"):
            self.db.executescript((migrations / name).read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def grants(self, role_code):
        return {row[0] for row in self.db.execute(
            """SELECT c.code FROM role_capability rc
               JOIN role r ON r.id = rc.role_id
               JOIN capability c ON c.id = rc.capability_id WHERE r.code = ?""",
            (role_code,),
        )}


    def _lifecycle_fixture(self, branch_id="lifecycle-branch"):
        self.db.execute(
            """INSERT INTO church (id, name, created_at, updated_at)
               VALUES ('lifecycle-church', 'Lifecycle Church', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO branch (id, church_id, name, created_at, updated_at)
               VALUES (?, 'lifecycle-church', 'Lifecycle Branch', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
            (branch_id,),
        )

    def _lifecycle_staff(self, user_id, profile_id, name, email):
        self.db.execute(
            """INSERT INTO "user" (id, name, email, createdAt, updatedAt)
               VALUES (?, ?, ?, 1, 1)""",
            (user_id, name, email),
        )
        self.db.execute(
            """INSERT INTO staff_profile
               (id, auth_user_id, full_name, account_status, created_at, updated_at)
               VALUES (?, ?, ?, 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
            (profile_id, user_id, name),
        )

    def _lifecycle_assignment(self, assignment_id, profile_id, role_code, branch_id, actor_id):
        role_id = self.db.execute("SELECT id FROM role WHERE code = ?", (role_code,)).fetchone()[0]
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, reason, created_at)
               VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z',
                       'Lifecycle test assignment', '2026-01-01T00:00:00.000Z')""",
            (assignment_id, profile_id, role_id, branch_id, actor_id),
        )

    def test_staff_deactivation_and_reactivation_are_audited_and_revoke_sessions(self):
        self._lifecycle_fixture()
        self._lifecycle_staff("life-admin-user", "life-admin", "Admin", "life-admin@example.test")
        self._lifecycle_staff("life-worker-user", "life-worker", "Worker", "life-worker@example.test")
        self._lifecycle_assignment("life-admin-role", "life-admin", "admin_pastor", "lifecycle-branch", "life-admin")
        self._lifecycle_assignment("life-worker-role", "life-worker", "field_worker", "lifecycle-branch", "life-admin")
        self.db.execute(
            """INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
               VALUES ('life-worker-session', 9999999999, 'life-worker-token', 1, 1, 'life-worker-user')"""
        )
        self.db.execute(
            """UPDATE staff_profile
               SET account_status = 'inactive', deactivated_at = '2026-01-02T00:00:00.000Z',
                   account_status_changed_by = 'life-admin',
                   account_status_changed_branch_id = 'lifecycle-branch',
                   account_status_reason = 'Staff member left the ministry team',
                   updated_at = '2026-01-02T00:00:00.000Z'
               WHERE id = 'life-worker'"""
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM session WHERE userId = 'life-worker-user'").fetchone()[0],
            0,
        )
        event = self.db.execute(
            "SELECT actor_profile_id, target_profile_id, action FROM staff_account_audit"
        ).fetchone()
        self.assertEqual(event, ("life-admin", "life-worker", "account_deactivated"))
        self.db.execute(
            """UPDATE staff_profile
               SET account_status = 'active', deactivated_at = NULL,
                   account_status_changed_by = 'life-admin',
                   account_status_changed_branch_id = 'lifecycle-branch',
                   account_status_reason = 'Staff member has returned to active service',
                   updated_at = '2026-01-03T00:00:00.000Z'
               WHERE id = 'life-worker'"""
        )
        self.assertEqual(
            self.db.execute("SELECT account_status FROM staff_profile WHERE id = 'life-worker'").fetchone()[0],
            "active",
        )
        self.assertEqual(
            self.db.execute("SELECT action FROM staff_account_audit ORDER BY created_at").fetchall(),
            [("account_deactivated",), ("account_reactivated",)],
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE staff_account_audit SET reason = 'tampered audit event' ")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM staff_account_audit")

    def test_account_deactivation_cannot_remove_last_admin_in_another_branch(self):
        self._lifecycle_fixture()
        self.db.execute(
            """INSERT INTO branch (id, church_id, name, created_at, updated_at)
               VALUES ('lifecycle-branch-two', 'lifecycle-church', 'Second Branch',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self._lifecycle_staff("life-admin-user", "life-admin", "Admin", "life-admin@example.test")
        self._lifecycle_staff("life-target-user", "life-target", "Target Admin", "life-target@example.test")
        self._lifecycle_assignment("life-admin-role", "life-admin", "admin_pastor", "lifecycle-branch", "life-admin")
        self._lifecycle_assignment("life-target-worker-role", "life-target", "coordinator", "lifecycle-branch", "life-admin")
        self._lifecycle_assignment("life-target-admin-role", "life-target", "admin_pastor", "lifecycle-branch-two", "life-admin")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """UPDATE staff_profile
                   SET account_status = 'inactive', deactivated_at = '2026-01-02T00:00:00.000Z',
                       account_status_changed_by = 'life-admin',
                       account_status_changed_branch_id = 'lifecycle-branch',
                       account_status_reason = 'Deactivation test for a cross-branch administrator',
                       updated_at = '2026-01-02T00:00:00.000Z'
                   WHERE id = 'life-target'"""
            )
        self.assertEqual(
            self.db.execute("SELECT account_status FROM staff_profile WHERE id = 'life-target'").fetchone()[0],
            "active",
        )

    def test_admin_pastor_revocation_requires_distinct_approval_and_is_audited(self):
        self._lifecycle_fixture()
        self._lifecycle_staff("life-admin-a-user", "life-admin-a", "Admin A", "life-a@example.test")
        self._lifecycle_staff("life-admin-b-user", "life-admin-b", "Admin B", "life-b@example.test")
        self._lifecycle_assignment("life-admin-a-role", "life-admin-a", "admin_pastor", "lifecycle-branch", "life-admin-a")
        self._lifecycle_assignment("life-admin-b-role", "life-admin-b", "admin_pastor", "lifecycle-branch", "life-admin-a")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """UPDATE staff_role_assignment
                   SET revoked_at = '2026-01-02T00:00:00.000Z', revoked_by = 'life-admin-b'
                   WHERE id = 'life-admin-a-role'"""
            )
        request_id = "life-admin-revoke-request"
        self.db.execute(
            """INSERT INTO staff_role_revocation_request
               (id, branch_id, assignment_id, target_profile_id, role_id, requested_by, reason, requested_at)
               VALUES (?, 'lifecycle-branch', 'life-admin-a-role', 'life-admin-a',
                       'role-admin-pastor', 'life-admin-a',
                       'Admin A requested a role transition', '2026-01-02T00:00:00.000Z')""",
            (request_id,),
        )
        self.db.execute(
            """UPDATE staff_role_revocation_request
               SET status = 'approved', reviewed_by = 'life-admin-b',
                   reviewed_at = '2026-01-03T00:00:00.000Z',
                   review_reason = 'Second administrator approved the transition'
               WHERE id = ?""",
            (request_id,),
        )
        self.db.execute(
            """UPDATE staff_role_assignment
               SET revoked_at = '2026-01-03T00:00:00.000Z',
                   revoked_by = 'life-admin-b',
                   revocation_request_id = ?,
                   reason = 'Second administrator approved the transition'
               WHERE id = 'life-admin-a-role'""",
            (request_id,),
        )
        self.db.execute(
            "UPDATE staff_role_revocation_request SET status = 'applied' WHERE id = ?",
            (request_id,),
        )
        self.assertEqual(
            self.db.execute("SELECT status FROM staff_role_revocation_request WHERE id = ?", (request_id,)).fetchone()[0],
            "applied",
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM staff_role_revocation_audit WHERE request_id = ?", (request_id,)).fetchone()[0],
            3,
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE staff_role_revocation_audit SET reason = 'tampered audit event' ")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM staff_role_revocation_audit")




    def test_followup_task_idempotency_key_is_unique_per_branch(self):
        self._lifecycle_fixture()
        self._lifecycle_staff("task-admin-user", "task-admin", "Task Admin", "task-admin@example.test")
        self._lifecycle_staff("task-worker-user", "task-worker", "Task Worker", "task-worker@example.test")
        self._lifecycle_assignment("task-admin-role", "task-admin", "admin_pastor", "lifecycle-branch", "task-admin")
        self._lifecycle_assignment("task-worker-role", "task-worker", "field_worker", "lifecycle-branch", "task-admin")
        self.db.execute(
            """INSERT INTO contact (id, branch_id, first_name, created_by, created_at, updated_at)
               VALUES ('task-contact', 'lifecycle-branch', 'Task Contact', 'task-admin-user',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO followup_task
               (id, contact_id, branch_id, assignee_user_id, created_by,
                client_request_id, digest_key_version, request_digest, created_at, updated_at)
               VALUES ('task-idem-one', 'task-contact', 'lifecycle-branch', 'task-worker-user',
                       'task-admin-user', 'task-idem-key', 1, ?, 
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
            (b"x" * 32,),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO followup_task
                   (id, contact_id, branch_id, assignee_user_id, created_by,
                    client_request_id, digest_key_version, request_digest, created_at, updated_at)
                   VALUES ('task-idem-two', 'task-contact', 'lifecycle-branch', 'task-worker-user',
                           'task-admin-user', 'task-idem-key', 1, ?,
                           '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:01.000Z')""",
                (b"y" * 32,),
            )

    def test_contact_assignment_requires_scope_and_writes_append_only_audit(self):
        self._lifecycle_fixture()
        self._lifecycle_staff("assignment-admin-user", "assignment-admin", "Assignment Admin", "assignment-admin@example.test")
        self._lifecycle_staff("assignment-worker-user", "assignment-worker", "Assignment Worker", "assignment-worker@example.test")
        self._lifecycle_staff("assignment-target-user", "assignment-target", "Assignment Target", "assignment-target@example.test")
        self._lifecycle_assignment("assignment-admin-role", "assignment-admin", "admin_pastor", "lifecycle-branch", "assignment-admin")
        self._lifecycle_assignment("assignment-worker-role", "assignment-worker", "field_worker", "lifecycle-branch", "assignment-admin")
        self._lifecycle_assignment("assignment-target-role", "assignment-target", "coordinator", "lifecycle-branch", "assignment-admin")
        self.db.execute(
            """INSERT INTO contact (id, branch_id, first_name, created_by, created_at, updated_at)
               VALUES ('assignment-contact', 'lifecycle-branch', 'Contact', 'assignment-admin-user',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO contact_assignment
                   (id, contact_id, branch_id, assignee_user_id, assigned_by, starts_at, reason, created_at)
                   VALUES ('assignment-forbidden', 'assignment-contact', 'lifecycle-branch',
                           'assignment-target-user', 'assignment-worker-user',
                           '2026-01-01T00:00:00.000Z', 'Worker cannot assign another person',
                           '2026-01-01T00:00:00.000Z')"""
            )
        self.db.execute(
            """INSERT INTO contact_assignment
               (id, contact_id, branch_id, assignee_user_id, assigned_by, starts_at, reason, created_at)
               VALUES ('assignment-valid', 'assignment-contact', 'lifecycle-branch',
                       'assignment-worker-user', 'assignment-admin-user',
                       '2026-01-01T00:00:00.000Z', 'Admin assigned the field worker',
                       '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """UPDATE contact_assignment
               SET ends_at = '2026-01-02T00:00:00.000Z',
                   ended_by = 'assignment-admin-user',
                   reason = 'Admin reassigned contact to another worker'
               WHERE id = 'assignment-valid'"""
        )
        self.assertEqual(
            self.db.execute("SELECT action FROM contact_assignment_audit WHERE assignment_id = 'assignment-valid' ORDER BY created_at").fetchall(),
            [("assigned",), ("ended",)],
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE contact_assignment_audit SET reason = 'tampered assignment audit'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM contact_assignment_audit")

    def test_staff_invitation_requires_admin_and_is_audited(self):
        self._lifecycle_fixture()
        self._lifecycle_staff("invite-admin-user", "invite-admin", "Invite Admin", "invite-admin@example.test")
        self._lifecycle_staff("invite-coordinator-user", "invite-coordinator", "Coordinator", "invite-coordinator@example.test")
        self._lifecycle_assignment("invite-admin-role", "invite-admin", "admin_pastor", "lifecycle-branch", "invite-admin")
        self._lifecycle_assignment("invite-coordinator-role", "invite-coordinator", "coordinator", "lifecycle-branch", "invite-admin")
        self.db.execute(
            """INSERT INTO staff_invitation
               (id, branch_id, invited_by, email, full_name, role_id, token_hash,
                expires_at, reason, created_at, updated_at)
               VALUES ('invite-1', 'lifecycle-branch', 'invite-admin',
                       'new-staff@example.test', 'New Staff', 'role-field-worker', ?,
                       '2026-02-01T00:00:00.000Z', 'Add new field worker to branch',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
            ("a" * 64,),
        )
        self.assertEqual(
            self.db.execute(
                "SELECT actor_profile_id, action FROM staff_invitation_audit WHERE invitation_id = 'invite-1'"
            ).fetchone(),
            ("invite-admin", "invitation_created"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO staff_invitation
                   (id, branch_id, invited_by, email, full_name, role_id, token_hash,
                    expires_at, reason, created_at, updated_at)
                   VALUES ('invite-unauthorized', 'lifecycle-branch', 'invite-coordinator',
                           'unauthorized@example.test', 'Unauthorized', 'role-field-worker', ?,
                           '2026-02-01T00:00:00.000Z', 'Attempt unauthorized account invitation',
                           '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
                ("b" * 64,),
            )

    def test_staff_invitation_acceptance_consumes_token_and_assigns_role(self):
        self._lifecycle_fixture()
        self._lifecycle_staff("invite-admin-user", "invite-admin", "Invite Admin", "invite-admin@example.test")
        self._lifecycle_assignment("invite-admin-role", "invite-admin", "admin_pastor", "lifecycle-branch", "invite-admin")
        self.db.execute(
            """INSERT INTO staff_invitation
               (id, branch_id, invited_by, email, full_name, role_id, token_hash,
                expires_at, reason, created_at, updated_at)
               VALUES ('invite-accept', 'lifecycle-branch', 'invite-admin',
                       'accept@example.test', 'Accepted Staff', 'role-field-worker', ?,
                       '2026-02-01T00:00:00.000Z', 'Invite a new field worker',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
            ("c" * 64,),
        )
        self.db.execute(
            """INSERT INTO "user" (id, name, email, createdAt, updatedAt)
               VALUES ('accepted-user', 'Accepted Staff', 'accept@example.test', 1, 1)"""
        )
        self.db.execute(
            """INSERT INTO staff_profile
               (id, auth_user_id, full_name, email, account_status, created_at, updated_at, password_changed_at)
               VALUES ('accepted-profile', 'accepted-user', 'Accepted Staff', 'accept@example.test',
                       'active', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z',
                       '2026-01-02T00:00:00.000Z')"""
        )
        self._lifecycle_assignment("accepted-field-role", "accepted-profile", "field_worker", "lifecycle-branch", "invite-admin")
        self.db.execute(
            """UPDATE staff_invitation
               SET status = 'accepted', accepted_at = '2026-01-02T00:00:00.000Z',
                   accepted_user_id = 'accepted-user', accepted_profile_id = 'accepted-profile',
                   token_hash = NULL, updated_at = '2026-01-02T00:00:00.000Z'
               WHERE id = 'invite-accept'"""
        )
        self.assertEqual(
            self.db.execute(
                "SELECT status, token_hash FROM staff_invitation WHERE id = 'invite-accept'"
            ).fetchone(),
            ("accepted", None),
        )
        self.assertEqual(
            self.db.execute(
                "SELECT actor_profile_id, action FROM staff_invitation_audit WHERE invitation_id = 'invite-accept' ORDER BY created_at DESC LIMIT 1"
            ).fetchone(),
            ("accepted-profile", "invitation_accepted"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE staff_invitation SET status = 'revoked' WHERE id = 'invite-accept'")

    def test_staff_invitation_revocation_consumes_token_and_is_audited(self):
        self._lifecycle_fixture()
        self._lifecycle_staff("invite-admin-user", "invite-admin", "Invite Admin", "invite-admin@example.test")
        self._lifecycle_assignment("invite-admin-role", "invite-admin", "admin_pastor", "lifecycle-branch", "invite-admin")
        self.db.execute(
            """INSERT INTO staff_invitation
               (id, branch_id, invited_by, email, full_name, role_id, token_hash,
                expires_at, reason, created_at, updated_at)
               VALUES ('invite-revoke', 'lifecycle-branch', 'invite-admin',
                       'revoke@example.test', 'Revoked Staff', 'role-field-worker', ?,
                       '2026-02-01T00:00:00.000Z', 'Invite field worker for testing',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
            ("d" * 64,),
        )
        self.db.execute(
            """UPDATE staff_invitation
               SET status = 'revoked', revoked_at = '2026-01-02T00:00:00.000Z',
                   revoked_by = 'invite-admin', token_hash = NULL,
                   updated_at = '2026-01-02T00:00:00.000Z'
               WHERE id = 'invite-revoke'"""
        )
        self.assertEqual(
            self.db.execute(
                "SELECT status, token_hash FROM staff_invitation WHERE id = 'invite-revoke'"
            ).fetchone(),
            ("revoked", None),
        )
        self.assertEqual(
            self.db.execute(
                "SELECT action FROM staff_invitation_audit WHERE invitation_id = 'invite-revoke' ORDER BY created_at DESC LIMIT 1"
            ).fetchone(),
            ("invitation_revoked",),
        )

    def test_exactly_six_fixed_roles_are_seeded(self):
        self.assertEqual(
            {row[0] for row in self.db.execute("SELECT code FROM role WHERE is_active = 1")},
            {"admin_pastor", "coordinator", "team_leader", "field_worker", "follow_up_volunteer", "prayer_intercessor"},
        )

    def test_admin_gets_staff_governance_but_not_sensitive_case_access(self):
        grants = self.grants("admin_pastor")
        self.assertIn("staff.account.manage", grants)
        self.assertIn("staff.role.assign", grants)
        self.assertIn("contacts.private_fields.read", grants)
        self.assertNotIn("prayer.request.read", grants)
        self.assertNotIn("pastoral.case.read", grants)
        self.assertNotIn("contacts.export", grants)
        self.assertNotIn("sms.dispatch", grants)

    def test_coordinator_cannot_administer_staff_accounts_or_roles(self):
        grants = self.grants("coordinator")
        self.assertIn("contacts.assign", grants)
        self.assertIn("events.manage", grants)
        self.assertNotIn("staff.account.manage", grants)
        self.assertNotIn("staff.role.assign", grants)
        self.assertNotIn("staff.audit.read", grants)
        self.assertNotIn("contacts.private_fields.read", grants)

    def test_team_leader_is_team_scoped_and_not_branch_admin(self):
        grants = self.grants("team_leader")
        self.assertIn("contacts.read", grants)
        self.assertIn("followup.update", grants)
        self.assertNotIn("contacts.private_fields.read", grants)
        self.assertNotIn("team.manage", grants)
        self.assertNotIn("staff.directory.read", grants)

    def test_field_worker_has_no_reassignment_or_private_field_grant(self):
        grants = self.grants("field_worker")
        self.assertIn("contacts.create", grants)
        self.assertEqual(self.db.execute("SELECT scope_mode FROM role_capability WHERE role_id = 'role-field-worker' AND capability_id = 'contacts.create'").fetchone()[0], 'branch')
        self.assertEqual(self.db.execute("SELECT scope_mode FROM role_capability WHERE role_id = 'role-field-worker' AND capability_id = 'contacts.read'").fetchone()[0], 'assigned')
        self.assertIn("contacts.interaction.create", grants)
        self.assertNotIn("contacts.assign", grants)
        self.assertNotIn("contacts.private_fields.read", grants)
        self.assertNotIn("followup.assign", grants)

    def test_followup_volunteer_has_task_only_access(self):
        grants = self.grants("follow_up_volunteer")
        self.assertIn("followup.read", grants)
        self.assertIn("followup.update", grants)
        self.assertIn("contacts.contact_details.read", grants)
        self.assertIn("contacts.interaction.create", grants)
        self.assertNotIn("contacts.read", grants)
        self.assertNotIn("contacts.private_fields.read", grants)
        self.assertNotIn("contacts.note.create", grants)

    def test_prayer_intercessor_has_only_explicit_share_prayer_capabilities(self):
        self.assertEqual(self.grants("prayer_intercessor"), {"prayer.request.read", "prayer.request.respond"})
        scopes = {row[0] for row in self.db.execute(
            """SELECT DISTINCT rc.scope_mode FROM role_capability rc
               JOIN role r ON r.id = rc.role_id WHERE r.code = 'prayer_intercessor'"""
        )}
        self.assertEqual(scopes, {"explicit_share"})


    def test_private_contact_field_write_is_admin_only(self):
        self.assertIn("contacts.private_fields.update", self.grants("admin_pastor"))
        for role in ("coordinator", "team_leader", "field_worker", "follow_up_volunteer", "prayer_intercessor"):
            self.assertNotIn("contacts.private_fields.update", self.grants(role))

    def test_no_baseline_role_gets_pastoral_case_export_or_sms_capability(self):
        count = self.db.execute(
            """SELECT COUNT(*) FROM role_capability rc JOIN capability c ON c.id = rc.capability_id
               WHERE c.code IN ('pastoral.case.read','pastoral.case.update','contacts.export','sms.dispatch')"""
        ).fetchone()[0]
        self.assertEqual(count, 0)

    def test_policy_seed_is_idempotent(self):
        sql = (Path(__file__).resolve().parents[1] / "migrations" / "0003_staff_authorization_policy.sql").read_text(encoding="utf-8")
        self.db.executescript(sql)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM role WHERE is_active = 1").fetchone()[0], 6)
        self.assertGreater(self.db.execute("SELECT COUNT(*) FROM role_capability").fetchone()[0], 0)


    def test_sensitive_access_audit_is_append_only_and_excludes_narrative_column(self):
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(sensitive_record_access_audit)")}
        self.assertNotIn("narrative", columns)
        self.assertNotIn("body", columns)
        self.assertIn("purpose", columns)
        self.db.execute(
            """INSERT INTO church (id, name, created_at, updated_at)
               VALUES ('audit-church', 'Audit Church', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO branch (id, church_id, name, created_at, updated_at)
               VALUES ('audit-branch', 'audit-church', 'Audit Branch', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO "user" (id, name, email, createdAt, updatedAt)
               VALUES ('audit-user', 'Audit Actor', 'audit@example.test', 1, 1)"""
        )
        self.db.execute(
            """INSERT INTO staff_profile
               (id, auth_user_id, full_name, account_status, created_at, updated_at)
               VALUES ('audit-staff', 'audit-user', 'Audit Actor', 'active',
                       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO sensitive_record_access_audit
               (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, created_at)
               VALUES ('sensitive-audit-1', 'audit-branch', 'audit-staff', 'prayer_request',
                       'prayer-1', 'read', 'Assigned prayer request review',
                       '2026-01-01T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE sensitive_record_access_audit SET purpose = 'tampered purpose' WHERE id = 'sensitive-audit-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM sensitive_record_access_audit WHERE id = 'sensitive-audit-1'")


    def test_admin_role_elevation_is_not_part_of_ordinary_assignment_grant(self):
        grants = self.grants("admin_pastor")
        self.assertIn("staff.role.approve", grants)
        self.assertIn("prayer.request.share", grants)
        self.assertNotIn("prayer.request.read", grants)
        self.assertNotIn("staff.role.assign_admin_pastor", grants)


    def test_explicit_record_share_is_time_bounded_revocable_and_audited(self):
        self.db.execute(
            """INSERT INTO church (id, name, created_at, updated_at)
               VALUES ('share-church', 'Share Church', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO branch (id, church_id, name, created_at, updated_at)
               VALUES ('share-branch', 'share-church', 'Share Branch', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        for user_id, email, staff_id, name in (
            ("share-user-a", "a@example.test", "share-staff-a", "Grantor"),
            ("share-user-b", "b@example.test", "share-staff-b", "Recipient"),
        ):
            self.db.execute(
                """INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)""",
                (user_id, name, email),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id, auth_user_id, full_name, account_status, created_at, updated_at)
                   VALUES (?, ?, ?, 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')""",
                (staff_id, user_id, name),
            )
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, created_at)
               VALUES ('share-admin-role', 'share-staff-a', 'role-admin-pastor', 'share-branch',
                       'share-staff-a', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, created_at)
               VALUES ('share-intercessor-role', 'share-staff-b', 'role-prayer-intercessor', 'share-branch',
                       'share-staff-a', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"""
        )
        self.db.execute(
            """INSERT INTO staff_record_share
               (id, branch_id, record_type, record_id, staff_profile_id, granted_by,
                purpose, starts_at, ends_at, created_at)
               VALUES ('share-1', 'share-branch', 'prayer_request', 'prayer-1',
                       'share-staff-b', 'share-staff-a', 'Temporary prayer team coverage',
                       '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
                       '2026-01-01T00:00:00.000Z')"""
        )
        grant_audit = self.db.execute(
            "SELECT actor_profile_id, action FROM sensitive_record_access_audit WHERE id = 'share-grant-share-1'"
        ).fetchone()
        self.assertEqual(grant_audit, ("share-staff-a", "share_granted"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO staff_record_share
                   (id, branch_id, record_type, record_id, staff_profile_id, granted_by,
                    purpose, starts_at, created_at)
                   VALUES ('share-overlap', 'share-branch', 'prayer_request', 'prayer-1',
                           'share-staff-b', 'share-staff-a', 'Overlapping prayer coverage',
                           '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')"""
            )
        self.db.execute(
            """UPDATE staff_record_share SET revoked_at = '2026-01-10T00:00:00.000Z',
               revoked_by = 'share-staff-a' WHERE id = 'share-1'"""
        )
        revoke_audit = self.db.execute(
            "SELECT actor_profile_id, action FROM sensitive_record_access_audit WHERE id = 'share-revoke-share-1'"
        ).fetchone()
        self.assertEqual(revoke_audit, ("share-staff-a", "share_revoked"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE staff_record_share SET revoked_at = NULL, revoked_by = NULL WHERE id = 'share-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM staff_record_share WHERE id = 'share-1'")


class AuthorizationQueryTests(unittest.TestCase):
    NOW = "2026-01-15T12:00:00.000Z"

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        migrations = Path(__file__).resolve().parents[1] / "migrations"
        for name in ("0001_platform_core.sql", "0002_contacts_followup.sql", "0003_staff_authorization_policy.sql", "0004_staff_session_revocation.sql", "0005_better_auth_rate_limit.sql", "0006_last_role_session_revocation.sql", "0007_staff_lifecycle_and_admin_revocation.sql", "0008_staff_invitation_onboarding.sql", "0009_contacts_private_field_write.sql", "0010_contact_assignment_audit.sql", "0011_followup_task_idempotency.sql"):
            self.db.executescript((migrations / name).read_text(encoding="utf-8"))
        self.db.execute(
            """INSERT INTO church (id, name, created_at, updated_at)
               VALUES ('authz-church', 'Authorization Church', ?, ?)""",
            (self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO branch (id, church_id, name, created_at, updated_at)
               VALUES ('authz-branch', 'authz-church', 'Authorization Branch', ?, ?)""",
            (self.NOW, self.NOW),
        )
        self.staff = {}
        identities = (
            ("admin", "Admin", "admin_pastor"),
            ("field", "Field Worker", "field_worker"),
            ("leader", "Team Leader", "team_leader"),
            ("prayer", "Prayer Intercessor", "prayer_intercessor"),
            ("followup", "Follow-up Volunteer", "follow_up_volunteer"),
        )
        for key, name, role_code in identities:
            user_id = "authz-user-" + key
            profile_id = "authz-staff-" + key
            self.staff[key] = (user_id, profile_id)
            self.db.execute(
                """INSERT INTO "user" (id, name, email, createdAt, updatedAt)
                   VALUES (?, ?, ?, 1, 1)""",
                (user_id, name, key + "@example.test"),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id, auth_user_id, full_name, account_status, created_at, updated_at)
                   VALUES (?, ?, ?, 'active', ?, ?)""",
                (profile_id, user_id, name, self.NOW, self.NOW),
            )
            self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, created_at)
                   VALUES (?, ?, ?, 'authz-branch', 'authz-staff-admin', ?, ?)""",
                ("authz-role-" + key, profile_id, "role-" + role_code.replace("_", "-"), self.NOW, self.NOW),
            ) if key != "admin" else self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, created_at)
                   VALUES (?, ?, ?, 'authz-branch', ?, ?, ?)""",
                ("authz-role-admin", profile_id, "role-admin-pastor", profile_id, self.NOW, self.NOW),
            )
        self.db.execute(
            """INSERT INTO team (id, branch_id, name, created_at, updated_at)
               VALUES ('authz-team', 'authz-branch', 'Field Team', ?, ?)""",
            (self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO staff_team_membership
               (id, staff_profile_id, team_id, branch_id, membership_role, starts_at, created_by, created_at)
               VALUES ('authz-team-membership', 'authz-staff-leader', 'authz-team',
                       'authz-branch', 'leader', ?, 'authz-staff-admin', ?)""",
            (self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO contact
               (id, branch_id, first_name, created_by, created_at, updated_at)
               VALUES ('authz-contact', 'authz-branch', 'Ama', 'authz-user-admin', ?, ?)""",
            (self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO contact_assignment
               (id, contact_id, branch_id, assignee_user_id, assigned_by, starts_at, created_at)
               VALUES ('authz-contact-assignment', 'authz-contact', 'authz-branch',
                       'authz-user-field', 'authz-user-admin', ?, ?)""",
            (self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO followup_task
               (id, contact_id, branch_id, assignee_user_id, created_by, created_at, updated_at)
               VALUES ('authz-task', 'authz-contact', 'authz-branch', 'authz-user-followup',
                       'authz-user-admin', ?, ?)""",
            (self.NOW, self.NOW),
        )

    def tearDown(self):
        self.db.close()

    def query_and_bind(self, actor, capability, resource_type=None, record_id=None, team_id=None):
        source = (Path(__file__).resolve().parents[1] / "src" / "authorization.ts").read_text(encoding="utf-8")
        match = re.search(r"const AUTHORIZATION_SQL = `([\s\S]*?)`;", source)
        self.assertIsNotNone(match, "authorization SQL must remain a static, testable query")
        query = match.group(1)
        actor_profile = self.staff[actor][1]
        resource_type = resource_type or ""
        record_id = record_id or ""
        team_id = team_id or ""
        values = (
            "authz-branch", actor_profile, capability, self.NOW, self.NOW,
            team_id, team_id, self.NOW, self.NOW,
            resource_type, record_id, record_id, self.NOW, self.NOW,
            resource_type, record_id, record_id,
            resource_type, record_id, resource_type, record_id,
            self.NOW, self.NOW, actor_profile,
        )
        self.assertEqual(query.count("?"), len(values), "SQL placeholders and D1 bind values must match")
        return self.db.execute(query, values).fetchone()

    def test_branch_grant_requires_active_role_and_branch(self):
        self.assertIsNotNone(self.query_and_bind("admin", "contacts.read", "contact", "authz-contact"))
        self.assertIsNone(self.query_and_bind("field", "staff.account.manage"))

    def test_field_worker_reads_only_an_individually_assigned_contact(self):
        self.assertIsNotNone(self.query_and_bind("field", "contacts.read", "contact", "authz-contact"))
        self.assertIsNone(self.query_and_bind("field", "contacts.read", "contact", "another-contact"))

    def test_team_leader_requires_active_leader_membership_for_team_scope(self):
        self.assertIsNotNone(self.query_and_bind("leader", "contacts.read", "contact", "authz-contact", "authz-team"))
        self.db.execute("UPDATE staff_team_membership SET revoked_at = ? WHERE id = 'authz-team-membership'", (self.NOW,))
        self.assertIsNone(self.query_and_bind("leader", "contacts.read", "contact", "authz-contact", "authz-team"))

    def test_followup_volunteer_gets_minimal_contact_details_only_via_assigned_task(self):
        self.assertIsNotNone(self.query_and_bind("followup", "contacts.contact_details.read", "followup_task", "authz-task"))
        self.assertIsNone(self.query_and_bind("followup", "contacts.read", "contact", "authz-contact"))

    def test_prayer_intercessor_requires_exact_active_explicit_share(self):
        self.db.execute(
            """INSERT INTO staff_record_share
               (id, branch_id, record_type, record_id, staff_profile_id, granted_by,
                purpose, starts_at, ends_at, created_at)
               VALUES ('authz-prayer-share', 'authz-branch', 'prayer_request', 'prayer-authz',
                       'authz-staff-prayer', 'authz-staff-admin', 'Temporary prayer team cover',
                       ?, '2026-01-16T12:00:00.000Z', ?)""",
            (self.NOW, self.NOW),
        )
        self.assertIsNotNone(self.query_and_bind("prayer", "prayer.request.read", "prayer_request", "prayer-authz"))
        self.assertIsNone(self.query_and_bind("prayer", "prayer.request.read", "prayer_request", "other-prayer"))
        self.db.execute(
            "UPDATE staff_record_share SET revoked_at = ?, revoked_by = 'authz-staff-admin' WHERE id = 'authz-prayer-share'",
            (self.NOW,),
        )
        self.assertIsNone(self.query_and_bind("prayer", "prayer.request.read", "prayer_request", "prayer-authz"))


    def test_admin_pastor_elevation_requires_distinct_approval_and_preserves_last_admin(self):
        second_user = "authz-user-admin-two"
        second_profile = "authz-staff-admin-two"
        self.db.execute(
            """INSERT INTO "user" (id, name, email, createdAt, updatedAt)
               VALUES (?, 'Second Admin', 'admin-two@example.test', 1, 1)""",
            (second_user,),
        )
        self.db.execute(
            """INSERT INTO staff_profile
               (id, auth_user_id, full_name, account_status, created_at, updated_at)
               VALUES (?, ?, 'Second Admin', 'active', ?, ?)""",
            (second_profile, second_user, self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, created_at)
               VALUES ('authz-role-admin-two', ?, 'role-admin-pastor', 'authz-branch',
                       'authz-staff-admin', ?, ?)""",
            (second_profile, self.NOW, self.NOW),
        )
        self.assertEqual(
            self.db.execute("SELECT remaining_slots FROM staff_admin_bootstrap_state WHERE id = 1").fetchone()[0],
            0,
        )
        self.db.execute(
            """INSERT INTO staff_role_elevation_request
               (id, branch_id, target_profile_id, role_id, requested_by, reason, requested_at)
               VALUES ('elevation-1', 'authz-branch', 'authz-staff-field', 'role-admin-pastor',
                       'authz-staff-admin', 'Promote experienced branch field lead', ?)""",
            (self.NOW,),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """UPDATE staff_role_elevation_request
                   SET status = 'approved', reviewed_by = 'authz-staff-admin',
                       reviewed_at = ?, review_reason = 'Self approval is not permitted'
                   WHERE id = 'elevation-1'""",
                (self.NOW,),
            )
        self.db.execute(
            """UPDATE staff_role_elevation_request
               SET status = 'approved', reviewed_by = ?, reviewed_at = ?,
                   review_reason = 'Independent second administrator approval'
               WHERE id = 'elevation-1'""",
            (second_profile, self.NOW),
        )
        self.db.execute(
            """INSERT INTO staff_role_assignment
               (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, reason, created_at)
               SELECT 'authz-role-field-promoted', req.target_profile_id, req.role_id,
                      req.branch_id, ?, req.reviewed_at, req.reason, ?
               FROM staff_role_elevation_request req
               WHERE req.id = 'elevation-1'
                 AND req.branch_id = 'authz-branch'
                 AND req.status = 'approved'
                 AND req.reviewed_by = ?
                 AND changes() = 1""",
            (second_profile, self.NOW, second_profile),
        )
        self.assertEqual(
            self.db.execute("SELECT status FROM staff_role_elevation_request WHERE id = 'elevation-1'").fetchone()[0],
            "applied",
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM staff_role_elevation_audit WHERE request_id = 'elevation-1'").fetchone()[0],
            3,
        )
        self.assertIsNotNone(
            self.db.execute("SELECT 1 FROM staff_access_audit WHERE id = 'admin-elevation-authz-role-field-promoted'").fetchone()
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, created_at)
                   VALUES ('unauthorized-admin-grant', 'authz-staff-followup', 'role-admin-pastor',
                           'authz-branch', 'authz-staff-admin', ?, ?)""",
                (self.NOW, self.NOW),
            )
        # Approve a revocation of the promoted admin in advance while two
        # independent active administrators still exist. It must still be
        # blocked when applied after the other two admin assignments are removed.
        self.db.execute(
            """INSERT INTO staff_role_revocation_request
               (id, branch_id, assignment_id, target_profile_id, role_id, requested_by, reason, requested_at)
               VALUES ('revoke-promoted', 'authz-branch', 'authz-role-field-promoted',
                       'authz-staff-field', 'role-admin-pastor', 'authz-staff-admin',
                       'Prepare a final-admin safeguard test', ?)""",
            (self.NOW,),
        )
        self.db.execute(
            """UPDATE staff_role_revocation_request
               SET status = 'approved', reviewed_by = ?, reviewed_at = ?,
                   review_reason = 'Independent reviewer approved the test request'
               WHERE id = 'revoke-promoted'""",
            (second_profile, self.NOW),
        )

        # The second admin is revoked first, with the first admin requesting
        # and the promoted admin reviewing.
        self.db.execute(
            """INSERT INTO staff_role_revocation_request
               (id, branch_id, assignment_id, target_profile_id, role_id, requested_by, reason, requested_at)
               VALUES ('revoke-admin-two', 'authz-branch', 'authz-role-admin-two',
                       ?, 'role-admin-pastor', 'authz-staff-admin',
                       'Remove the second bootstrap administrator', ?)""",
            (second_profile, self.NOW),
        )
        self.db.execute(
            """UPDATE staff_role_revocation_request
               SET status = 'approved', reviewed_by = 'authz-staff-field', reviewed_at = ?,
                   review_reason = 'Independent promoted administrator approved removal'
               WHERE id = 'revoke-admin-two'""",
            (self.NOW,),
        )
        self.db.execute(
            """UPDATE staff_role_assignment
               SET revoked_at = ?, revoked_by = 'authz-staff-field',
                   revocation_request_id = 'revoke-admin-two'
               WHERE id = 'authz-role-admin-two'""",
            (self.NOW,),
        )

        # The first admin then requests their own step-down; the promoted admin
        # independently reviews and applies it.
        self.db.execute(
            """INSERT INTO staff_role_revocation_request
               (id, branch_id, assignment_id, target_profile_id, role_id, requested_by, reason, requested_at)
               VALUES ('revoke-admin-one', 'authz-branch', 'authz-role-admin',
                       'authz-staff-admin', 'role-admin-pastor', 'authz-staff-admin',
                       'First administrator requests a role transition', ?)""",
            (self.NOW,),
        )
        self.db.execute(
            """UPDATE staff_role_revocation_request
               SET status = 'approved', reviewed_by = 'authz-staff-field', reviewed_at = ?,
                   review_reason = 'Independent promoted administrator approved removal'
               WHERE id = 'revoke-admin-one'""",
            (self.NOW,),
        )
        self.db.execute(
            """UPDATE staff_role_assignment
               SET revoked_at = ?, revoked_by = 'authz-staff-field',
                   revocation_request_id = 'revoke-admin-one'
               WHERE id = 'authz-role-admin'""",
            (self.NOW,),
        )

        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """UPDATE staff_role_assignment
                   SET revoked_at = ?, revoked_by = ?, revocation_request_id = 'revoke-promoted'
                   WHERE id = 'authz-role-field-promoted'""",
                (self.NOW, second_profile),
            )

    def test_prayer_request_is_private_and_assignment_is_limited_to_intercessor(self):
        admin_user, admin_profile = self.staff["admin"]
        prayer_user, prayer_profile = self.staff["prayer"]
        field_user, field_profile = self.staff["field"]
        self.db.execute(
            """INSERT INTO prayer_request
               (id, branch_id, created_by, request_text, created_at, updated_at)
               VALUES ('prayer-1', 'authz-branch', ?, 'Confidential prayer narrative',
                       ?, ?)""",
            (admin_user, self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO prayer_assignment
               (id, prayer_request_id, branch_id, intercessor_user_id, assigned_by,
                starts_at, created_at)
               VALUES ('prayer-assignment-1', 'prayer-1', 'authz-branch', ?, ?, ?, ?)""",
            (prayer_user, admin_user, self.NOW, self.NOW),
        )
        self.assertEqual(
            self.db.execute(
                "SELECT actor_user_id, action FROM prayer_access_audit WHERE prayer_request_id='prayer-1'"
            ).fetchone(),
            (admin_user, "assigned"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO prayer_assignment
                   (id, prayer_request_id, branch_id, intercessor_user_id, assigned_by,
                    starts_at, created_at)
                   VALUES ('prayer-assignment-field', 'prayer-1', 'authz-branch', ?, ?, ?, ?)""",
                (field_user, admin_user, self.NOW, self.NOW),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM prayer_access_audit WHERE prayer_request_id='prayer-1'")

    def test_prayer_intercessor_has_no_contact_or_pastoral_case_grants(self):
        grants = {
            row[0] for row in self.db.execute(
                """SELECT c.code FROM role_capability rc
                   JOIN role r ON r.id=rc.role_id
                   JOIN capability c ON c.id=rc.capability_id
                   WHERE r.code='prayer_intercessor'"""
            )
        }
        self.assertNotIn("contacts.read", grants)
        self.assertNotIn("pastoral.case.read", grants)
        self.assertIn("prayer.request.read", grants)
        self.assertIn("prayer.request.respond", grants)

    def test_care_record_creation_is_admin_only_and_audits_assignment(self):
        admin_user, admin_profile = self.staff["admin"]
        prayer_user, prayer_profile = self.staff["prayer"]
        self.db.execute(
            """INSERT INTO contact
               (id, branch_id, first_name, created_at, updated_at)
               VALUES ('care-contact', 'authz-branch', 'Care Subject', ?, ?)""",
            (self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO care_record
               (id, branch_id, contact_id, created_by, created_at, updated_at)
               VALUES ('care-record-1', 'authz-branch', 'care-contact', ?, ?, ?)""",
            (admin_user, self.NOW, self.NOW),
        )
        self.db.execute(
            """INSERT INTO care_assignment
               (id, care_record_id, branch_id, assignee_user_id, assigned_by,
                starts_at, created_at)
               VALUES ('care-assignment-1', 'care-record-1', 'authz-branch', ?, ?, ?, ?)""",
            (prayer_user, admin_user, self.NOW, self.NOW),
        )
        self.assertEqual(
            self.db.execute(
                "SELECT actor_user_id, action FROM care_access_audit WHERE care_record_id='care-record-1'"
            ).fetchone(),
            (admin_user, "assigned"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO care_record
                   (id, branch_id, contact_id, created_by, created_at, updated_at)
                   VALUES ('care-record-unauthorized', 'authz-branch', 'care-contact', ?, ?, ?)""",
                (prayer_user, self.NOW, self.NOW),
            )



    def test_event_creation_is_branch_authorized_and_field_workers_cannot_create_events(self):
        admin_user, _ = self.staff["admin"]
        field_user, _ = self.staff["field"]
        self.db.execute(
            """INSERT INTO event
               (id,branch_id,title,starts_at,ends_at,created_by,created_at,updated_at)
               VALUES ('event-1','authz-branch','Sunday Service',?,?,?, ?, ?)""",
            ("2026-02-01T08:00:00.000Z","2026-02-01T11:00:00.000Z",admin_user,self.NOW,self.NOW),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO event
                   (id,branch_id,title,starts_at,ends_at,created_by,created_at,updated_at)
                   VALUES ('event-field','authz-branch','Unauthorized Event',?,?,?, ?, ?)""",
                ("2026-02-02T08:00:00.000Z","2026-02-02T11:00:00.000Z",field_user,self.NOW,self.NOW),
            )

    def test_event_checkin_requires_event_capability_and_idempotency_key(self):
        admin_user, _ = self.staff["admin"]
        field_user, _ = self.staff["field"]
        self.db.execute(
            """INSERT INTO event
               (id,branch_id,title,starts_at,ends_at,created_by,created_at,updated_at)
               VALUES ('event-checkin','authz-branch','Service',?,?,?, ?, ?)""",
            ("2026-02-01T08:00:00.000Z","2026-02-01T11:00:00.000Z",admin_user,self.NOW,self.NOW),
        )
        self.db.execute(
            """INSERT INTO event_checkin
               (id,event_id,branch_id,attendee_name_snapshot,checked_in_at,recorded_by,source,client_request_id)
               VALUES ('checkin-1','event-checkin','authz-branch','Walk-in Guest',? ,?,'staff','checkin-request-1')""",
            (self.NOW,admin_user),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO event_checkin
                   (id,event_id,branch_id,attendee_name_snapshot,checked_in_at,recorded_by,source,client_request_id)
                   VALUES ('checkin-field','event-checkin','authz-branch','Unauthorized Guest',? ,?,'staff','checkin-request-2')""",
                (self.NOW,field_user),
            )

    def test_event_registration_requires_a_valid_staff_actor_and_request_key(self):
        admin_user, _ = self.staff["admin"]
        field_user, _ = self.staff["field"]
        self.db.execute(
            """INSERT INTO event
               (id,branch_id,title,starts_at,ends_at,created_by,created_at,updated_at)
               VALUES ('event-registration','authz-branch','Registration Event',?,?,?, ?, ?)""",
            ("2026-02-01T08:00:00.000Z","2026-02-01T11:00:00.000Z",admin_user,self.NOW,self.NOW),
        )
        self.db.execute(
            """INSERT INTO event_registration
               (id,event_id,branch_id,attendee_name_snapshot,registration_source,registered_at,
                client_request_id,created_by)
               VALUES ('registration-1','event-registration','authz-branch','Guest One','staff',?,
                       'registration-request-1',?)""",
            (self.NOW,admin_user),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO event_registration
                   (id,event_id,branch_id,attendee_name_snapshot,registration_source,registered_at,
                    client_request_id,created_by)
                   VALUES ('registration-field','event-registration','authz-branch','Guest Two','staff',?,
                           'registration-request-2',?)""",
                (self.NOW,field_user),
            )



    def test_calendar_and_announcement_creation_are_capability_scoped(self):
        admin_user, _ = self.staff["admin"]
        field_user, _ = self.staff["field"]
        self.db.execute(
            """INSERT INTO calendar_entry
               (id,branch_id,entry_type,title,starts_at,scope_type,created_by,created_at,updated_at)
               VALUES ('calendar-1','authz-branch','service','Sunday Service',?,'branch',?,?,?)""",
            (self.NOW,admin_user,self.NOW,self.NOW),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO calendar_entry
                   (id,branch_id,entry_type,title,starts_at,scope_type,created_by,created_at,updated_at)
                   VALUES ('calendar-field','authz-branch','service','Private Event',?,'branch',?,?,?)""",
                (self.NOW,field_user,self.NOW,self.NOW),
            )
        self.db.execute(
            """INSERT INTO announcement
               (id,branch_id,title,body,audience_type,created_by,created_at,updated_at)
               VALUES ('announcement-1','authz-branch','Service Notice','Sunday service begins at 9','branch',?,?,?)""",
            (admin_user,self.NOW,self.NOW),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO announcement
                   (id,branch_id,title,body,audience_type,created_by,created_at,updated_at)
                   VALUES ('announcement-field','authz-branch','Unauthorized','No access','branch',?,?,?)""",
                (field_user,self.NOW,self.NOW),
            )

    def test_public_content_requires_content_manage_and_published_projection_fields(self):
        admin_user, _ = self.staff["admin"]
        field_user, _ = self.staff["field"]
        self.db.execute(
            """INSERT INTO welcome_message
               (id,branch_id,title,body,status,published_at,created_by,created_at,updated_at)
               VALUES ('welcome-1','authz-branch','Welcome','Welcome to church','published',?,?,?,?)""",
            (self.NOW,admin_user,self.NOW,self.NOW),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO welcome_message
                   (id,branch_id,title,body,created_by,created_at,updated_at)
                   VALUES ('welcome-field','authz-branch','Unauthorized','No access',?,?,?)""",
                (field_user,self.NOW,self.NOW),
            )
        self.assertEqual(
            self.db.execute("SELECT title FROM welcome_message WHERE status='published'").fetchone(),
            ("Welcome",),
        )

    def test_calendar_typed_scope_and_external_link_target_are_unambiguous(self):
        admin_user, _ = self.staff["admin"]
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO calendar_entry
                   (id,branch_id,entry_type,title,starts_at,scope_type,team_id,created_by,created_at,updated_at)
                   VALUES ('calendar-invalid','authz-branch','other','Bad scope',?,'branch','team-authz',?,?,?)""",
                (self.NOW,admin_user,self.NOW,self.NOW),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO external_document_link
                   (id,label,url,created_by,created_at)
                   VALUES ('link-invalid','Invalid link','https://example.test/doc',?,?)""",
                (admin_user,self.NOW),
            )
