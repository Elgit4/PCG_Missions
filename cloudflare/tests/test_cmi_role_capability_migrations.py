import re
import sqlite3
import unittest
from pathlib import Path


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


class CmiRoleCapabilityMigrationTests(unittest.TestCase):
    """Replay the complete D1 chain and assert the owner-approved six-role grants."""

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        for migration in sorted(MIGRATIONS.glob("[0-9][0-9][0-9][0-9]_*.sql")):
            self.db.executescript(migration.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def role_codes(self):
        return {
            row[0] for row in self.db.execute(
                "SELECT code FROM role WHERE is_active = 1"
            )
        }

    def grants(self, role_code):
        return {
            (row[0], row[1]) for row in self.db.execute(
                """
                SELECT c.code, rc.scope_mode
                FROM role_capability rc
                JOIN role r ON r.id = rc.role_id
                JOIN capability c ON c.id = rc.capability_id
                WHERE r.code = ? AND r.is_active = 1 AND c.is_active = 1
                """,
                (role_code,),
            )
        }

    def test_full_migration_chain_reaches_schema_38(self):
        self.assertEqual(
            self.db.execute(
                "SELECT schema_version, environment FROM app_meta WHERE id = 1"
            ).fetchone(),
            (38, "non-production"),
        )
        self.assertEqual(
            self.role_codes(),
            {
                "admin_pastor",
                "coordinator",
                "team_leader",
                "field_worker",
                "follow_up_volunteer",
                "prayer_intercessor",
            },
        )

    def test_team_and_area_management_are_branch_scoped_and_admin_only(self):
        self.assertEqual(
            self.grants("admin_pastor")
            & {("team.manage", "branch"), ("area.manage", "branch")},
            {("team.manage", "branch"), ("area.manage", "branch")},
        )
        for role_code in (
            "coordinator",
            "team_leader",
            "field_worker",
            "follow_up_volunteer",
            "prayer_intercessor",
        ):
            self.assertFalse(
                self.grants(role_code)
                & {("team.manage", "branch"), ("area.manage", "branch")},
                f"{role_code} must not receive branch team/area administration",
            )

    def test_management_grants_are_not_implicitly_widened_to_other_scopes(self):
        for role_code in (
            "admin_pastor",
            "coordinator",
            "team_leader",
            "field_worker",
            "follow_up_volunteer",
            "prayer_intercessor",
        ):
            self.assertEqual(
                {grant for grant in self.grants(role_code) if grant[0] in ("team.manage", "area.manage")},
                {("team.manage", "branch"), ("area.manage", "branch")} if role_code == "admin_pastor" else set(),
            )

    def test_worker_authorization_sql_allows_team_area_management_only_for_admin_pastor(self):
        now = "2026-11-21T12:00:00.000Z"
        church_id = "authz-cmi-church"
        branch_id = "authz-cmi-branch"
        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (church_id, "Authorization Test Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,created_at,updated_at) VALUES(?,?,?,?,?)",
            (branch_id, church_id, "Authorization Test Branch", now, now),
        )

        role_codes = (
            "admin_pastor",
            "coordinator",
            "team_leader",
            "field_worker",
            "follow_up_volunteer",
            "prayer_intercessor",
        )
        profiles = {}
        for index, role_code in enumerate(role_codes, start=1):
            auth_id = f"authz-cmi-user-{index}"
            profile_id = f"authz-cmi-staff-{index}"
            role_id = self.db.execute(
                "SELECT id FROM role WHERE code = ?", (role_code,)
            ).fetchone()[0]
            self.db.execute(
                """INSERT INTO supabase_auth_identity
                   (id,name,email,emailVerified,createdAt,updatedAt)
                   VALUES(?,?,?,?,?,?)""",
                (auth_id, role_code, f"{role_code}@example.test", 1, 1, 1),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,account_status,created_at,updated_at,
                    must_change_password)
                   VALUES(?,?,?,'active',?,?,0)""",
                (profile_id, auth_id, role_code, now, now),
            )
            self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (
                    f"authz-cmi-assignment-{index}",
                    profile_id,
                    role_id,
                    branch_id,
                    profile_id,
                    now,
                    now,
                ),
            )
            profiles[role_code] = profile_id

        source = (Path(__file__).resolve().parents[1] / "src" / "authorization.ts").read_text(encoding="utf-8")
        match = re.search(r"const AUTHORIZATION_SQL = `([\s\S]*?)`;", source)
        self.assertIsNotNone(match, "Worker authorization query must remain statically testable")
        query = match.group(1)

        def authorize(profile_id, capability, selected_branch=branch_id):
            values = (
                selected_branch, profile_id, capability, now, now,
                "", "", now, now,
                "", "", "", now, now,
                "", "", "",
                "", "", "", "",
                now, now, profile_id,
            )
            self.assertEqual(query.count("?"), len(values))
            return self.db.execute(query, values).fetchone()

        for capability in ("team.manage", "area.manage"):
            self.assertIsNotNone(authorize(profiles["admin_pastor"], capability))
            for role_code in role_codes[1:]:
                with self.subTest(role=role_code, capability=capability):
                    self.assertIsNone(authorize(profiles[role_code], capability))
            self.assertIsNone(
                authorize(
                    profiles["admin_pastor"],
                    capability,
                    "authz-cmi-unassigned-branch",
                )
            )

    def test_directory_read_grants_are_role_and_scope_limited(self):
        self.assertIn(("team.read", "branch"), self.grants("admin_pastor"))
        self.assertIn(("area.read", "branch"), self.grants("admin_pastor"))
        self.assertIn(("team.read", "branch"), self.grants("coordinator"))
        self.assertIn(("area.read", "branch"), self.grants("coordinator"))
        self.assertIn(("team.read", "team"), self.grants("team_leader"))
        self.assertNotIn(("area.read", "team"), self.grants("team_leader"))
        for role_code in ("field_worker", "follow_up_volunteer", "prayer_intercessor"):
            self.assertFalse(
                {grant for grant in self.grants(role_code) if grant[0] in ("team.read", "area.read")},
                f"{role_code} must not receive a team/service-area directory grant",
            )

    def test_directory_read_migration_is_idempotent(self):
        migration = (MIGRATIONS / "0039_team_area_directory_read_grants.sql").read_text(encoding="utf-8")
        before = self.db.execute(
            """
            SELECT r.code, c.code, rc.scope_mode
            FROM role_capability rc
            JOIN role r ON r.id = rc.role_id
            JOIN capability c ON c.id = rc.capability_id
            ORDER BY r.code, c.code, rc.scope_mode
            """
        ).fetchall()
        self.db.executescript(migration)
        after = self.db.execute(
            """
            SELECT r.code, c.code, rc.scope_mode
            FROM role_capability rc
            JOIN role r ON r.id = rc.role_id
            JOIN capability c ON c.id = rc.capability_id
            ORDER BY r.code, c.code, rc.scope_mode
            """
        ).fetchall()
        self.assertEqual(after, before)
        self.assertEqual(
            self.db.execute("SELECT schema_version FROM app_meta WHERE id = 1").fetchone()[0],
            39,
        )

    def test_worker_authorization_query_enforces_team_leader_membership_for_directory_read(self):
        now = "2026-11-21T12:00:00.000Z"
        church_id = "team-read-church"
        branch_id = "team-read-branch"
        self.db.execute(
            "INSERT INTO church(id,name,created_at,updated_at) VALUES(?,?,?,?)",
            (church_id, "Team Read Test Church", now, now),
        )
        self.db.execute(
            "INSERT INTO branch(id,church_id,name,created_at,updated_at) VALUES(?,?,?,?,?)",
            (branch_id, church_id, "Team Read Test Branch", now, now),
        )
        team_id = "team-read-own-team"
        other_team_id = "team-read-other-team"
        self.db.execute(
            """INSERT INTO team(id,branch_id,name,description,is_active,created_at,updated_at)
               VALUES(?,?,?,NULL,1,?,?),(?,?,?,NULL,1,?,?)""",
            (team_id, branch_id, "Own Team", now, now, other_team_id, branch_id, "Other Team", now, now),
        )

        role_codes = ("admin_pastor", "coordinator", "team_leader")
        profiles = {}
        for index, role_code in enumerate(role_codes, start=1):
            auth_id = f"team-read-user-{index}"
            profile_id = f"team-read-staff-{index}"
            role_id = self.db.execute(
                "SELECT id FROM role WHERE code = ?", (role_code,)
            ).fetchone()[0]
            self.db.execute(
                """INSERT INTO supabase_auth_identity
                   (id,name,email,emailVerified,createdAt,updatedAt)
                   VALUES(?,?,?,?,?,?)""",
                (auth_id, role_code, f"{role_code}@example.test", 1, 1, 1),
            )
            self.db.execute(
                """INSERT INTO staff_profile
                   (id,auth_user_id,full_name,account_status,created_at,updated_at,must_change_password)
                   VALUES(?,?,?,'active',?,?,0)""",
                (profile_id, auth_id, role_code, now, now),
            )
            self.db.execute(
                """INSERT INTO staff_role_assignment
                   (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (f"team-read-assignment-{index}", profile_id, role_id, branch_id, profile_id, now, now),
            )
            profiles[role_code] = profile_id

        self.db.execute(
            """INSERT INTO staff_team_membership
               (id,staff_profile_id,team_id,branch_id,membership_role,starts_at,created_by,created_at)
               VALUES(?,?,?,?,'leader',?,?,?)""",
            ("team-read-membership", profiles["team_leader"], team_id, branch_id, now, profiles["admin_pastor"], now),
        )

        source = (Path(__file__).resolve().parents[1] / "src" / "authorization.ts").read_text(encoding="utf-8")
        match = re.search(r"const AUTHORIZATION_SQL = \x60([\\s\\S]*?)\x60;", source)
        self.assertIsNotNone(match)
        query = match.group(1)

        def authorize(profile_id, capability, resource_team_id=""):
            values = (
                branch_id, profile_id, capability, now, now,
                resource_team_id, resource_team_id, now, now,
                "", "", "", now, now,
                "", "", "",
                "", "", "", "",
                now, now, profile_id,
            )
            self.assertEqual(query.count("?"), len(values))
            return self.db.execute(query, values).fetchone()

        self.assertIsNotNone(authorize(profiles["admin_pastor"], "team.read"))
        self.assertIsNotNone(authorize(profiles["coordinator"], "team.read"))
        self.assertIsNotNone(authorize(profiles["admin_pastor"], "area.read"))
        self.assertIsNotNone(authorize(profiles["coordinator"], "area.read"))
        self.assertIsNotNone(authorize(profiles["team_leader"], "team.read", team_id))
        self.assertIsNone(authorize(profiles["team_leader"], "team.read", other_team_id))
        self.assertIsNone(authorize(profiles["team_leader"], "area.read"))

    def test_role_grant_migration_is_idempotent(self):
        before = self.db.execute(
            """
            SELECT r.code, c.code, rc.scope_mode
            FROM role_capability rc
            JOIN role r ON r.id = rc.role_id
            JOIN capability c ON c.id = rc.capability_id
            ORDER BY r.code, c.code, rc.scope_mode
            """
        ).fetchall()
        self.db.executescript(
            (MIGRATIONS / "0038_admin_pastor_team_area_management_grants.sql").read_text(encoding="utf-8")
        )
        after = self.db.execute(
            """
            SELECT r.code, c.code, rc.scope_mode
            FROM role_capability rc
            JOIN role r ON r.id = rc.role_id
            JOIN capability c ON c.id = rc.capability_id
            ORDER BY r.code, c.code, rc.scope_mode
            """
        ).fetchall()
        self.assertEqual(after, before)
        self.assertEqual(
            self.db.execute("SELECT schema_version FROM app_meta WHERE id = 1").fetchone()[0],
            38,
        )


if __name__ == "__main__":
    unittest.main()
