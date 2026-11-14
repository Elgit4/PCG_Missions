from pathlib import Path
import sqlite3
import unittest


MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "0031_area_coverage_revocation_audit.sql"


class AreaCoverageRevocationMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
          CREATE TABLE app_meta(id INTEGER PRIMARY KEY,environment TEXT,schema_version INTEGER);
          INSERT INTO app_meta VALUES(1,'non-production',30);
          CREATE TABLE branch(id TEXT PRIMARY KEY);
          CREATE TABLE staff_profile(id TEXT PRIMARY KEY);
          CREATE TABLE service_area(id TEXT PRIMARY KEY);
          CREATE TABLE staff_area_coverage(
            id TEXT PRIMARY KEY,staff_profile_id TEXT NOT NULL REFERENCES staff_profile(id),
            service_area_id TEXT NOT NULL REFERENCES service_area(id),branch_id TEXT NOT NULL REFERENCES branch(id),
            starts_at TEXT NOT NULL,ends_at TEXT,created_by TEXT NOT NULL REFERENCES staff_profile(id),
            created_at TEXT NOT NULL
          );
        """)
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
        self.db.execute("INSERT INTO branch VALUES('b1')")
        self.db.execute("INSERT INTO staff_profile VALUES('s1')")
        self.db.execute("INSERT INTO staff_profile VALUES('s2')")
        self.db.execute("INSERT INTO service_area VALUES('a1')")

    def tearDown(self):
        self.db.close()

    def test_schema_advances_and_revocation_is_append_only_audited(self):
        self.assertEqual(self.db.execute("SELECT schema_version FROM app_meta").fetchone()[0],31)
        self.db.execute("INSERT INTO staff_area_coverage(id,staff_profile_id,service_area_id,branch_id,starts_at,created_by,created_at) VALUES('c1','s1','a1','b1','2026-01-01','s2','2026-01-01')")
        self.db.execute("UPDATE staff_area_coverage SET revoked_at='2026-01-02',revoked_by='s2' WHERE id='c1'")
        self.db.execute("INSERT INTO staff_area_coverage_audit VALUES('audit1','b1','a1','c1','s1','s2','revoked','2026-01-02')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE staff_area_coverage_audit SET action='assigned' WHERE id='audit1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM staff_area_coverage_audit WHERE id='audit1'")

    def test_revoked_coverage_does_not_block_a_new_assignment(self):
        self.db.execute("INSERT INTO staff_area_coverage(id,staff_profile_id,service_area_id,branch_id,starts_at,created_by,created_at,revoked_at,revoked_by) VALUES('old','s1','a1','b1','2026-01-01','s2','2026-01-01','2026-01-02','s2')")
        self.db.execute("INSERT INTO staff_area_coverage(id,staff_profile_id,service_area_id,branch_id,starts_at,created_by,created_at) VALUES('new','s1','a1','b1','2026-01-03','s2','2026-01-03')")


if __name__ == "__main__":
    unittest.main()
