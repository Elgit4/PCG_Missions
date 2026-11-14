import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"


class PasswordResetAuditMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript((MIGRATIONS / "0001_platform_core.sql").read_text(encoding="utf-8"))
        self.db.execute("UPDATE app_meta SET schema_version = 27 WHERE id = 1")
        self.db.executescript((MIGRATIONS / "0028_staff_password_reset_audit.sql").read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_migration_advances_schema_and_keeps_request_reference_opaque(self):
        version = self.db.execute("SELECT schema_version FROM app_meta WHERE id = 1").fetchone()[0]
        self.assertEqual(version, 28)
        self.db.execute(
            """INSERT INTO staff_password_reset_audit
               (id, request_id, event_type, metadata, created_at)
               VALUES ('audit-1', 'excluded-source-request-1', 'requested', '{}', '2026-11-13T00:00:00.000Z')"""
        )
        row = self.db.execute(
            "SELECT request_id FROM staff_password_reset_audit WHERE id = 'audit-1'"
        ).fetchone()
        self.assertEqual(row[0], "excluded-source-request-1")

    def test_audit_rows_are_append_only(self):
        self.db.execute(
            """INSERT INTO staff_password_reset_audit
               (id, request_id, event_type, metadata, created_at)
               VALUES ('audit-2', 'request-2', 'approved', '{}', '2026-11-13T00:00:00.000Z')"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE staff_password_reset_audit SET event_type='denied' WHERE id='audit-2'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM staff_password_reset_audit WHERE id='audit-2'")

    def test_audit_metadata_must_be_a_json_object(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO staff_password_reset_audit
                   (id, request_id, event_type, metadata, created_at)
                   VALUES ('audit-3', 'request-3', 'requested', '[]', '2026-11-13T00:00:00.000Z')"""
            )


if __name__ == "__main__":
    unittest.main()
