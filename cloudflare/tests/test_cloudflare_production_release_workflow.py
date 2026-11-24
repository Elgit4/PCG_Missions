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
        self.assertIn("production-data-restore-rehearsal:\n    needs: restore-rehearsal", self.production)
        self.assertIn("production-worker:\n    needs: [restore-rehearsal, production-data-restore-rehearsal]", self.production)
        self.assertIn("needs.production-data-restore-rehearsal.result == 'success'", self.production)
        self.assertIn("Require active Admin/Pastor owner and verify owner-directed cleanup candidates before restore rehearsal", self.production)

    def test_preview_and_production_health_gates_require_schema_49(self):
        self.assertIn("schema_version!==49", self.preview)
        self.assertIn("schema_version!==49", self.production)
        self.assertIn("Number(row.schema_version) !== 49", self.production)
        self.assertIn("Number(row.migration_count) !== 49", self.production)

    def test_owner_directed_staff_cleanup_runs_after_schema_49_and_before_worker_deploy(self):
        self.assertIn("owner_directed_orphan_profiles", self.production)
        self.assertIn("owner_directed_stale_assignments", self.production)
        self.assertIn("scripts/reconcile_owner_directed_staff_cleanup.sql", self.production)
        self.assertIn("staff_account_audit", self.production)
        self.assertIn("owner_directed_role_revocation_audits", self.production)
        self.assertLess(
            self.production.index("Verify production schema and migration ledger after migration"),
            self.production.index("Reconcile owner-directed staff deactivation and stale team-leader assignment"),
        )
        self.assertLess(
            self.production.index("Reconcile owner-directed staff deactivation and stale team-leader assignment"),
            self.production.index("Deploy reviewed Worker code to production"),
        )

    def test_current_source_gates_accept_successful_main_or_migration_branch_runs(self):
        self.assertIn("for source_branch in main migration/cloudflare-auth-consolidation; do", self.production)
        self.assertIn('branch="$source_branch"', self.production)
        self.assertIn("sort -u", self.production)

    def test_production_accepts_null_for_anonymous_better_auth_session(self):
        self.assertIn(
            'if(p!==null && (typeof p!=="object" || Array.isArray(p) || p.error)) process.exit(1)',
            self.production,
        )
        self.assertNotIn("if(p===null || (typeof p!==\"object\"))", self.production)

    def test_production_cutover_requires_owner_but_allows_onboarded_staff(self):
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
        self.assertNotIn("summary.auth_users === 1", self.production)
        self.assertNotIn("summary.password_users === 1", self.production)
        self.assertIn("summary.active_staff_profiles >= 1", self.production)
        self.assertNotIn("summary.active_staff_profiles === 1", self.production)
        self.assertNotIn("summary.assigned_role_codes === 1", self.production)
        self.assertIn("summary.active_profiles_without_role === summary.owner_directed_orphan_profiles", self.production)
        self.assertIn("summary.assignments_on_inactive_profiles === summary.owner_directed_stale_assignments", self.production)
        self.assertIn("summary.invalid_first_login_setups === summary.owner_directed_orphan_profiles", self.production)
        self.assertIn("summary.owner_directed_orphan_profiles <= 1", self.production)
        self.assertIn("summary.owner_directed_stale_assignments <= 1", self.production)
        self.assertIn("summary.active_staff_without_credential === 0", self.production)
        self.assertIn("if (!rosterReady)", self.production)
        self.assertIn("Production cutover blocked:", self.production)
        self.assertIn("Additional staff accounts may be added through staff account creation and first-login onboarding", self.production)
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
