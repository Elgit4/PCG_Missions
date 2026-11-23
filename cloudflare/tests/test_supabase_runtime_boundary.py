from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
WEB_SOURCE = ROOT / "web" / "src"
WORKER_SOURCE = ROOT / "cloudflare" / "src"


class SupabaseRuntimeBoundaryTests(unittest.TestCase):
    def test_browser_application_has_no_supabase_auth_or_client_dependency(self):
        package = (ROOT / "web" / "package.json").read_text(encoding="utf-8")
        self.assertNotRegex(package, r'"@supabase/[^"]+"')

        production_sources = [
            path for path in WEB_SOURCE.rglob("*")
            if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".jsx"}
            and not path.name.endswith((".test.ts", ".test.tsx", ".test.js", ".test.jsx"))
        ]
        self.assertTrue(production_sources, "expected browser application source files")

        forbidden_patterns = (
            r'from\s*["\']@supabase/',
            r'import\s*\(\s*["\']@supabase/',
            r'\bsupabase\.auth\b',
            r'\bVITE_SUPABASE_(?:URL|PUBLISHABLE_KEY|ANON_KEY)\b',
        )
        violations = []
        for path in production_sources:
            source = path.read_text(encoding="utf-8")
            for pattern in forbidden_patterns:
                if re.search(pattern, source, re.IGNORECASE):
                    violations.append(f"{path.relative_to(ROOT)} matches {pattern}")
        self.assertEqual(violations, [])

    def test_worker_supabase_credentials_are_confined_to_private_event_flyer_storage(self):
        worker_files = [
            path for path in WORKER_SOURCE.rglob("*")
            if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".mjs"}
        ]
        self.assertTrue(worker_files, "expected Worker source files")

        credential_names = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        other_file_references = []
        for path in worker_files:
            if path.name == "index.ts":
                continue
            source = path.read_text(encoding="utf-8")
            for name in credential_names:
                if name in source:
                    other_file_references.append(f"{path.relative_to(ROOT)} references {name}")
        self.assertEqual(other_file_references, [])

        index_path = WORKER_SOURCE / "index.ts"
        index = index_path.read_text(encoding="utf-8")
        # Env typing is allowed; all runtime reads must stay within the event-flyer
        # Storage adapter and its dedicated request handler.
        env_type = re.search(r"interface Env extends[\s\S]*?\n}\n", index)
        self.assertIsNotNone(env_type, "Worker Env type declaration must remain explicit")
        runtime = index[:env_type.end()] + index[env_type.end():]
        runtime = runtime.replace(env_type.group(0), "", 1)

        start = runtime.find("async function eventFlyerStorageRequest")
        end = runtime.find("const EVENT_RESPONSE_COLUMNS", start)
        self.assertGreaterEqual(start, 0, "private event-flyer Storage adapter is missing")
        self.assertGreater(end, start, "event-flyer integration boundary is not explicit")

        integration = runtime[start:end]
        outside = runtime[:start] + runtime[end:]
        for name in credential_names:
            self.assertNotIn(name, outside, f"{name} must not be used outside event-flyer Storage")
            self.assertIn(name, integration, f"{name} must be used by event-flyer Storage")

        self.assertIn("/storage/v1/object/pcg-missions-event-media/", integration)
        self.assertIn("expiresIn:900", integration)
        self.assertIn("async function handleEventFlyer", integration)

    def test_public_content_projection_uses_cloudflare_d1_not_supabase(self):
        public_content = (WORKER_SOURCE / "public-content.ts").read_text(encoding="utf-8")
        self.assertIn("db.prepare", public_content)
        self.assertNotIn("SUPABASE_URL", public_content)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", public_content)


if __name__ == "__main__":
    unittest.main()
