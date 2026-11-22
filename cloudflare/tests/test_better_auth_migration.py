import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"

class BetterAuthMigrationTests(unittest.TestCase):
    def test_version_46_preserves_identity_and_restores_report_event_capabilities(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys = ON")
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            db.executescript(migration.read_text(encoding="utf-8"))
            if migration.name == "0033_supabase_auth_identity.sql":
                for index in range(3):
                    user_id = "legacy-auth-user-" + str(index)
                    db.execute("""
                      INSERT INTO supabase_auth_identity
                        (id,name,email,emailVerified,image,createdAt,updatedAt,auth_provider)
                      VALUES (?,?,?,?,?,?,?,'supabase')
                    """, (user_id, "Staff " + str(index), "staff" + str(index) + "@example.test", 1, None, 1, 1))
                db.commit()
        self.assertEqual(db.execute("SELECT schema_version FROM app_meta WHERE id=1").fetchone()[0], 46)
        self.assertEqual(db.execute("SELECT environment FROM app_meta WHERE id=1").fetchone()[0], "non-production")
        expected_grants = [["admin_pastor","report.review.scoped","branch"],["coordinator","report.review.scoped","branch"],["team_leader","report.review.scoped","team"],["field_worker","report.submit.scoped","self"],["follow_up_volunteer","report.submit.scoped","self"],["admin_pastor","event.closeout.submit","branch"],["admin_pastor","event.closeout.review","branch"],["coordinator","event.closeout.review","branch"]]
        actual_grants = db.execute("""
            SELECT r.code, c.code, rc.scope_mode FROM role_capability rc
            JOIN role r ON r.id=rc.role_id JOIN capability c ON c.id=rc.capability_id
            WHERE c.code LIKE 'report.%' OR c.code LIKE 'event.closeout.%'
        """).fetchall()
        for grant in expected_grants:
            self.assertIn(tuple(grant), actual_grants)
        self.assertIsNotNone(db.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='user'").fetchone())
        self.assertIsNone(db.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='supabase_auth_identity'").fetchone())
        self.assertEqual(db.execute('SELECT COUNT(*) FROM "user"').fetchone()[0], 3)
        for table in ("account", "session", "verification", "rateLimit"):
            self.assertIsNotNone(db.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?", (table,)).fetchone())
        account_fks = db.execute("PRAGMA foreign_key_list(account)").fetchall()
        self.assertTrue(any(row[2] == "user" for row in account_fks))
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertIsNotNone(db.execute("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name='staff_profile_revoke_sessions_after_deactivation'").fetchone())
        self.assertIsNotNone(db.execute("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name='staff_role_assignment_revoke_sessions_after_last_role'").fetchone())
        db.close()


    def test_schema_46_forward_migration_accepts_guarded_production_environment(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys = ON")
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            if migration.name == "0046_restore_report_and_event_capabilities.sql":
                db.execute("UPDATE app_meta SET environment='production' WHERE id=1")
                db.commit()
            db.executescript(migration.read_text(encoding="utf-8"))
        self.assertEqual(
            db.execute("SELECT schema_version,environment FROM app_meta WHERE id=1").fetchone(),
            (46, "production"),
        )
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.close()

if __name__ == "__main__":
    unittest.main()
