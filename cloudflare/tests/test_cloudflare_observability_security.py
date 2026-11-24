from pathlib import Path
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CloudflareObservabilitySecurityTests(unittest.TestCase):
    def test_worker_observability_redacts_query_strings(self):
        config = tomllib.loads((ROOT / "wrangler.toml").read_text(encoding="utf-8"))
        self.assertIs(config["observability"]["redact_query_string"], True)

    def test_followup_error_logs_do_not_include_database_error_messages(self):
        source = (ROOT / "src" / "index.ts").read_text(encoding="utf-8")
        self.assertIn(
            'event: "FOLLOWUP_TASK_UPDATE_CONFLICT", requestId, errorType:',
            source,
        )
        self.assertNotIn(
            'console.error("FOLLOWUP_TASK_UPDATE_CONFLICT", requestId, error instanceof Error ? error.message',
            source,
        )

    def test_report_review_diagnostics_do_not_persist_staff_or_report_identifiers(self):
        source = (ROOT / "src" / "index.ts").read_text(encoding="utf-8")
        self.assertNotIn('console.log("REPORT_REVIEW_PRECONDITION"', source)
        self.assertNotIn('console.log("REPORT_REVIEW_BATCH_DIAGNOSTIC"', source)


if __name__ == "__main__":
    unittest.main()
