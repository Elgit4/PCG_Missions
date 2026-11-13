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
        calls = re.findall(r"contactScopePredicate\(([\s\S]*?)\)", self.source)
        self.assertGreaterEqual(len(calls), 10)
        call_sites = [call for call in calls if not re.search(r"\bmode\s*:", call)]
        self.assertGreaterEqual(len(call_sites), 10)
        for call in call_sites:
            self.assertRegex(
                call,
                r"(?:context|access)\.staff\.profileId[\s\S]*?(?:context|access)\.staff\.userId[\s\S]*?(?:context|access)\.activeBranch\.branchId",
                msg=f"Contact scope call must pass profile ID and auth user ID separately: {call}",
            )


    def test_cors_allows_idempotency_header_used_by_browser_mutations(self):
        cors = re.search(r"function authCorsHeaders\\([\\s\\S]*?\\n\\}", self.source)
        self.assertIsNotNone(cors)
        self.assertRegex(cors.group(0), r"(?i)Access-Control-Allow-Headers[\\s\\S]*Idempotency-Key")

    def test_followup_contact_details_use_followup_task_scope_predicate(self):
        handler = re.search(r"async function listFollowupTasks\\([\\s\\S]*?\\n\\}", self.source)
        self.assertIsNotNone(handler)
        self.assertIn('followupScopePredicate(detailScope, "ft"', handler.group(0))
        self.assertNotIn('contactScopePredicate(detailScope, "ft"', handler.group(0))

    def test_contact_list_never_returns_merged_records_even_with_all_status_filter(self):
        handler = re.search(r"async function listContacts\\([\\s\\S]*?\\n\\}", self.source)
        self.assertIsNotNone(handler)
        self.assertIn("c.contact_status <> 'merged'", handler.group(0))

    def test_contact_interaction_history_has_a_scoped_get_route(self):
        self.assertIn("async function listContactInteractions(", self.source)
        self.assertRegex(
            self.source,
            r'if \\(request\\.method === "GET"\\) return listContactInteractions\\(request, env, contactId',
        )


if __name__ == "__main__":
    unittest.main()
