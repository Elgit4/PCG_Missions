from pathlib import Path
import sqlite3
import unittest


MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "0001_platform_core.sql"


class PlatformCoreMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
        self.db.executescript((MIGRATION.parent / "0002_contacts_followup.sql").read_text(encoding="utf-8"))
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

    def test_schema_is_non_production_and_expected_tables_exist(self):
        meta = self.db.execute(
            "SELECT schema_version, environment FROM app_meta WHERE id = 1"
        ).fetchone()
        self.assertEqual(meta, (1, "non-production"))
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
