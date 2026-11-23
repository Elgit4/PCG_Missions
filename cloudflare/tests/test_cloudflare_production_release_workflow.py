from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"


class CloudflareProductionReleaseWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.production = (WORKFLOWS / "cloudflare-production-worker-deploy.yml").read_text(encoding="utf-8")
        cls.preview = (WORKFLOWS / "cloudflare-preview-deploy.yml").read_text(encoding="utf-8")

    def test_production_requires_full_restore_and_authenticated_acceptance(self):
        self.assertIn("uses: ./.github/workflows/cloudflare-d1-restore-rehearsal.yml", self.production)
        self.assertIn("needs: restore-rehearsal", self.production)
        self.assertIn("needs.restore-rehearsal.result == 'success'", self.production)
        self.assertIn("inputs.confirm_production == 'DEPLOY-PRODUCTION'", self.production)

    def test_read_only_staff_preflight_runs_before_expensive_restore_rehearsal(self):
        self.assertIn("production-roster-preflight:", self.production)
        self.assertIn("restore-rehearsal:\n    needs: production-roster-preflight", self.production)
        self.assertIn("production-worker:\n    needs: restore-rehearsal", self.production)
        self.assertIn("Require complete six-role production roster before restore rehearsal", self.production)

    def test_production_accepts_null_for_anonymous_better_auth_session(self):
        self.assertIn(
            'if(p!==null && (typeof p!=="object" || Array.isArray(p) || p.error)) process.exit(1)',
            self.production,
        )
        self.assertNotIn("if(p===null || (typeof p!==\"object\"))", self.production)

    def test_production_cutover_is_blocked_until_six_role_roster_is_ready(self):
        required_roles = (
            "admin_pastor",
            "coordinator",
            "team_leader",
            "field_worker",
            "follow_up_volunteer",
            "prayer_intercessor",
        )
        for role in required_roles:
            self.assertIn("'" + role + "'", self.production)

        self.assertIn("summary.configured_role_catalogue !== 6", self.production)
        self.assertIn("summary.active_staff_profiles >= 6", self.production)
        self.assertIn("summary.assigned_role_codes === 6", self.production)
        self.assertIn("summary.active_profiles_without_role === 0", self.production)
        self.assertIn("summary.assignments_on_inactive_profiles === 0", self.production)
        self.assertIn("summary.active_staff_without_credential === 0", self.production)
        self.assertIn("summary.invalid_first_login_setups === 0", self.production)
        self.assertIn("if (!fullRosterReady)", self.production)
        self.assertIn("Production cutover blocked:", self.production)
        self.assertNotIn("Production will enter Admin/Pastor bootstrap mode.", self.production)

    def test_routine_preview_does_not_import_from_legacy_postgres_or_probe_rate_limit_writes(self):
        self.assertNotIn("SUPABASE_SOURCE_DB_URL", self.preview)
        self.assertNotIn("scripts/import_supabase_auth_credentials.py", self.preview)
        self.assertNotIn("postgresql-client", self.preview)
        self.assertNotIn("INSERT INTO rateLimit", self.preview)
        self.assertNotIn("DELETE FROM rateLimit", self.preview)

    def test_routine_preview_does_not_run_the_full_restore_rehearsal(self):
        self.assertNotIn("restore-rehearsal:", self.preview)
        self.assertNotIn("needs: restore-rehearsal", self.preview)

    def test_new_preview_release_uses_a_fresh_concurrency_group(self):
        self.assertIn("pcg-missions-preview-release-v3", self.preview)


if __name__ == "__main__":
    unittest.main()
