from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"


class ReleaseCiWorkflowGateTests(unittest.TestCase):
    def test_production_worker_waits_for_both_recovery_gates(self):
        workflow = (WORKFLOWS / "cloudflare-production-worker-deploy.yml").read_text(encoding="utf-8")
        self.assertIn(
            "production-worker:\n    needs: [restore-rehearsal, production-data-restore-rehearsal]",
            workflow,
        )
        self.assertIn("needs.restore-rehearsal.result == 'success'", workflow)
        self.assertIn("needs.production-data-restore-rehearsal.result == 'success'", workflow)

    def test_local_cmi_pgtap_starts_only_postgres_not_unused_supabase_services(self):
        workflow = (WORKFLOWS / "cmi-backend-ci.yml").read_text(encoding="utf-8")
        expected = (
            "--exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,"
            "postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"
        )
        self.assertIn("supabase --workdir supabase-cmi start " + expected, workflow)


if __name__ == "__main__":
    unittest.main()
