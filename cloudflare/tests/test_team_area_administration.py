from pathlib import Path
import sqlite3
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0031_team_area_administration_guards.sql"
NOW = "2026-11-14T00:00:00.000Z"


class TeamAreaAdministrationGuardTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "migrations" / "0001_platform_core.sql").read_text(encoding="utf-8"))
        self.db.execute("UPDATE app_meta SET schema_version=30 WHERE id=1")
        self.db.execute('INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES("u1","Admin","admin@test.invalid",1,1)')
        self.db.execute("INSERT INTO church(id,name,created_at,updated_at) VALUES('c1','Test Church',?,?)",(NOW,NOW))
        self.db.execute("INSERT INTO branch(id,church_id,name,created_at,updated_at) VALUES('b1','c1','Main',?,?)",(NOW,NOW))
        self.db.execute("INSERT INTO role(id,code,name,created_at) VALUES('r-admin','admin_pastor','Admin',?)",(NOW,))
        self.db.execute("INSERT INTO role(id,code,name,created_at) VALUES('r-leader','team_leader','Team Leader',?)",(NOW,))
        self.db.execute("""INSERT INTO staff_profile(id,auth_user_id,full_name,email,account_status,created_at,updated_at)
                           VALUES('sp1','u1','Admin','admin@test.invalid','active',?,?)""",(NOW,NOW))
        self.db.execute("""INSERT INTO staff_role_assignment(id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
                           VALUES('ra-admin','sp1','r-admin','b1','sp1',?,?)""",(NOW,NOW))
        self.db.execute("""INSERT INTO staff_role_assignment(id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
                           VALUES('ra-leader','sp1','r-leader','b1','sp1',?,?)""",(NOW,NOW))
        self.db.execute("INSERT INTO team(id,branch_id,name,created_at,updated_at) VALUES('t1','b1','Team',?,?)",(NOW,NOW))
        self.db.execute("INSERT INTO service_area(id,branch_id,name,created_at,updated_at) VALUES('a1','b1','Area',?,?)",(NOW,NOW))
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_migration_advances_schema_and_creates_append_only_audit(self):
        self.assertEqual(self.db.execute("SELECT schema_version FROM app_meta WHERE id=1").fetchone()[0],31)
        self.db.execute("INSERT INTO team_management_audit VALUES('audit1','b1','sp1','team','t1','team.created','{}',?)",(NOW,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE team_management_audit SET action='changed' WHERE id='audit1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM team_management_audit WHERE id='audit1'")

    def test_team_membership_requires_active_staff_and_active_team_in_branch(self):
        self.db.execute("UPDATE team SET is_active=0 WHERE id='t1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,"ACTIVE_TEAM_NOT_FOUND"):
            self.db.execute("""INSERT INTO staff_team_membership
                (id,staff_profile_id,team_id,branch_id,starts_at,created_by,created_at)
                VALUES('m1','sp1','t1','b1',?,'sp1',?)""",(NOW,NOW))

    def test_team_leader_membership_requires_team_leader_role(self):
        self.db.execute("DELETE FROM staff_role_assignment WHERE id='ra-leader'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,"TEAM_LEADER_ROLE_REQUIRED"):
            self.db.execute("""INSERT INTO staff_team_membership
                (id,staff_profile_id,team_id,branch_id,membership_role,starts_at,created_by,created_at)
                VALUES('m1','sp1','t1','b1','leader',?,'sp1',?)""",(NOW,NOW))

    def test_team_membership_cannot_be_promoted_without_team_leader_role(self):
        self.db.execute("""INSERT INTO staff_team_membership
            (id,staff_profile_id,team_id,branch_id,membership_role,starts_at,created_by,created_at)
            VALUES('m1','sp1','t1','b1','member',?,'sp1',?)""",(NOW,NOW))
        self.db.execute("DELETE FROM staff_role_assignment WHERE id='ra-leader'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,"TEAM_LEADER_ROLE_REQUIRED"):
            self.db.execute("UPDATE staff_team_membership SET membership_role='leader' WHERE id='m1'")

    def test_team_cannot_be_deactivated_while_active_members_remain(self):
        self.db.execute("""INSERT INTO staff_team_membership
            (id,staff_profile_id,team_id,branch_id,starts_at,created_by,created_at)
            VALUES('m1','sp1','t1','b1',?,'sp1',?)""",(NOW,NOW))
        with self.assertRaisesRegex(sqlite3.IntegrityError,"TEAM_HAS_ACTIVE_MEMBERS"):
            self.db.execute("UPDATE team SET is_active=0 WHERE id='t1'")

    def test_team_cannot_be_deactivated_with_future_scheduled_membership(self):
        future = "2026-12-01T00:00:00.000Z"
        self.db.execute("""INSERT INTO staff_team_membership
            (id,staff_profile_id,team_id,branch_id,membership_role,starts_at,created_by,created_at)
            VALUES('m-future','sp1','t1','b1','member',?,'sp1',?)""",(future,NOW))
        with self.assertRaisesRegex(sqlite3.IntegrityError,"TEAM_HAS_ACTIVE_MEMBERS"):
            self.db.execute("UPDATE team SET is_active=0 WHERE id='t1'")

    def test_area_coverage_requires_active_area_and_staff_in_same_branch(self):
        self.db.execute("UPDATE service_area SET is_active=0 WHERE id='a1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,"ACTIVE_SERVICE_AREA_NOT_FOUND"):
            self.db.execute("""INSERT INTO staff_area_coverage
                (id,staff_profile_id,service_area_id,branch_id,starts_at,created_by,created_at)
                VALUES('cov1','sp1','a1','b1',?,'sp1',?)""",(NOW,NOW))

    def test_area_cannot_be_deactivated_with_future_scheduled_coverage(self):
        future = "2026-12-01T00:00:00.000Z"
        self.db.execute("""INSERT INTO staff_area_coverage
            (id,staff_profile_id,service_area_id,branch_id,starts_at,created_by,created_at)
            VALUES('cov-future','sp1','a1','b1',?,'sp1',?)""",(future,NOW))
        with self.assertRaisesRegex(sqlite3.IntegrityError,"AREA_HAS_ACTIVE_COVERAGE"):
            self.db.execute("UPDATE service_area SET is_active=0 WHERE id='a1'")

    def test_future_area_coverage_can_be_revoked_before_it_starts(self):
        future = "2026-12-01T00:00:00.000Z"
        self.db.execute("""INSERT INTO staff_area_coverage
            (id,staff_profile_id,service_area_id,branch_id,starts_at,created_by,created_at)
            VALUES('cov-future','sp1','a1','b1',?,'sp1',?)""",(future,NOW))
        self.db.execute("UPDATE staff_area_coverage SET revoked_at=?,revoked_by='sp1' WHERE id='cov-future'",(NOW,))
        self.db.execute("UPDATE service_area SET is_active=0 WHERE id='a1'")
        self.assertEqual(self.db.execute("SELECT revoked_at FROM staff_area_coverage WHERE id='cov-future'").fetchone()[0],NOW)

    def test_area_cannot_be_deactivated_while_active_coverage_remains(self):
        self.db.execute("""INSERT INTO staff_area_coverage
            (id,staff_profile_id,service_area_id,branch_id,starts_at,created_by,created_at)
            VALUES('cov1','sp1','a1','b1',?,'sp1',?)""",(NOW,NOW))
        with self.assertRaisesRegex(sqlite3.IntegrityError,"AREA_HAS_ACTIVE_COVERAGE"):
            self.db.execute("UPDATE service_area SET is_active=0 WHERE id='a1'")


if __name__ == "__main__":
    unittest.main()
