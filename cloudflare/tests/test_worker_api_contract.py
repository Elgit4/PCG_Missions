from pathlib import Path
import re
import unittest


WORKER_SOURCE = Path(__file__).resolve().parents[1] / "src" / "index.ts"


class WorkerApiContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = WORKER_SOURCE.read_text(encoding="utf-8")

    def test_contact_team_scope_uses_profile_id_and_assigned_scope_uses_auth_user_id(self):
        match = re.search(
            r"function contactScopePredicate\([\s\S]*?\n\}",
            self.source,
        )
        self.assertIsNotNone(match, "contactScopePredicate must remain an explicit, testable policy helper")
        helper = match.group(0)
        self.assertRegex(helper, r"staffProfileId\s*:\s*string")
        self.assertRegex(helper, r"staffUserId\s*:\s*string")

        team_branch = helper.split('if (mode === "team")', 1)[1].split(
            'if (mode === "assigned")', 1
        )[0]
        assigned_branch = helper.split('if (mode === "assigned")', 1)[1]

        self.assertIn("values: [staffProfileId, now, now, now, now]", team_branch)
        self.assertIn("values: [staffUserId, now, now]", assigned_branch)

    def test_contact_scope_callers_pass_both_server_derived_staff_identifiers(self):
        self.assertNotRegex(
            self.source,
            r"contactScopePredicate\([^;]*?context\.staff\.userId,\s*context\.activeBranch\.branchId",
        )
        self.assertNotRegex(
            self.source,
            r"contactScopePredicate\([^;]*?access\.staff\.userId,\s*access\.activeBranch\.branchId",
        )
        self.assertIn("context.staff.profileId, context.staff.userId", self.source)
        self.assertIn("access.staff.profileId, access.staff.userId", self.source)


if __name__ == "__main__":
    unittest.main()
