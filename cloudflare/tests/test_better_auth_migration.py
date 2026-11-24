import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"

class BetterAuthMigrationTests(unittest.TestCase):
    def test_version_48_preserves_identity_and_restores_report_event_capabilities(self):
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
        self.assertEqual(db.execute("SELECT schema_version FROM app_meta WHERE id=1").fetchone()[0], 49)
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


    def test_schema_49_forward_migration_accepts_guarded_production_environment(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys = ON")
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            if migration.name == "0046_restore_report_and_event_capabilities.sql":
                db.execute("UPDATE app_meta SET environment='production' WHERE id=1")
                db.commit()
            db.executescript(migration.read_text(encoding="utf-8"))
        self.assertEqual(
            db.execute("SELECT schema_version,environment FROM app_meta WHERE id=1").fetchone(),
            (49, "production"),
        )
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.close()


    def test_early_contact_assignment_handoff_is_audited_and_only_shortens(self):
        db = sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys = ON")
        db.executescript("""
            CREATE TABLE app_meta(id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL);
            INSERT INTO app_meta(id, schema_version) VALUES(1, 47);
            CREATE TABLE branch(id TEXT PRIMARY KEY);
            CREATE TABLE staff_profile(auth_user_id TEXT PRIMARY KEY);
            CREATE TABLE contact(
                id TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                UNIQUE(id, branch_id)
            );
            CREATE TABLE contact_assignment(
                id TEXT PRIMARY KEY,
                contact_id TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                assignee_user_id TEXT,
                team_id TEXT,
                assigned_by TEXT NOT NULL,
                starts_at TEXT NOT NULL,
                ends_at TEXT,
                reason TEXT,
                ended_by TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE contact_assignment_audit(
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                contact_id TEXT NOT NULL,
                branch_id TEXT NOT NULL,
                actor_user_id TEXT NOT NULL,
                action TEXT NOT NULL CHECK(action IN ('assigned','ended')),
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
        """)
        db.executescript((MIGRATIONS / "0048_allow_early_contact_assignment_handoff.sql").read_text(encoding="utf-8"))
        db.executescript((MIGRATIONS / "0049_allow_early_handoff_audit_action.sql").read_text(encoding="utf-8"))
        self.assertEqual(db.execute("SELECT schema_version FROM app_meta WHERE id=1").fetchone()[0], 49)

        db.execute("INSERT INTO branch(id) VALUES('handoff-branch')")
        db.execute("INSERT INTO staff_profile(auth_user_id) VALUES('handoff-admin-user')")
        db.execute("INSERT INTO contact(id,branch_id) VALUES('handoff-contact','handoff-branch')")
        db.execute("""
            INSERT INTO contact_assignment
              (id,contact_id,branch_id,assignee_user_id,team_id,assigned_by,starts_at,ends_at,reason,ended_by,created_at)
            VALUES
              ('handoff-assignment','handoff-contact','handoff-branch','assigned-user',NULL,
               'handoff-admin-user','2026-11-01T00:00:00.000Z','2026-12-31T00:00:00.000Z',
               'Initial scheduled visitor assignment','handoff-admin-user','2026-11-01T00:00:00.000Z')
        """)
        db.execute("""
            UPDATE contact_assignment
            SET ends_at='2026-12-01T00:00:00.000Z',
                reason='Authorized early handoff to the receiving ministry team',
                ended_by='handoff-admin-user'
            WHERE id='handoff-assignment'
        """)
        actions = db.execute(
            "SELECT action FROM contact_assignment_audit WHERE assignment_id='handoff-assignment' ORDER BY created_at"
        ).fetchall()
        self.assertEqual([row[0] for row in actions], ["assigned", "ended_early"])

        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(
                "UPDATE contact_assignment SET ends_at='2027-01-01T00:00:00.000Z' WHERE id='handoff-assignment'"
            )
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(
                "UPDATE contact_assignment SET ends_at=NULL WHERE id='handoff-assignment'"
            )
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(
                "UPDATE contact_assignment_audit SET reason='rewritten audit history' WHERE assignment_id='handoff-assignment'"
            )
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("DELETE FROM contact_assignment_audit WHERE assignment_id='handoff-assignment'")
        self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        db.close()


if __name__ == "__main__":
    unittest.main()
