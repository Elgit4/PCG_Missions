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

    def test_worker_event_media_uses_private_cloudflare_kv_and_no_supabase_runtime(self):
        index = (WORKER_SOURCE / "index.ts").read_text(encoding="utf-8")
        wrangler = (ROOT / "cloudflare" / "wrangler.toml").read_text(encoding="utf-8")
        rehearsal = (ROOT / ".github" / "workflows" / "cloudflare-d1-restore-rehearsal.yml").read_text(encoding="utf-8")

        for source in (index, wrangler, rehearsal):
            self.assertNotIn("SUPABASE_URL", source)
            self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", source)

        self.assertIn("EVENT_MEDIA.put(key,bytes", index)
        self.assertIn("EVENT_MEDIA.getWithMetadata", index)
        self.assertIn("EVENT_MEDIA.delete(", index)
        self.assertIn('binding = "EVENT_MEDIA"', wrangler)
        self.assertIn('id = "4c1b4d0c6066440ebdabfa75fd935dfe"', wrangler)
        self.assertIn('binding = "EVENT_MEDIA"', rehearsal)
        self.assertIn('crypto.subtle.sign("HMAC"', index)
        self.assertIn('crypto.subtle.verify("HMAC"', index)
        self.assertIn("EVENT_MEDIA_URL_TTL_SECONDS=900", index)
        self.assertIn("Cache-Control\\\":\\\"private, no-store, max-age=0", index)
        self.assertIn("async function serveSignedEventMedia", index)
        self.assertIn("async function handleEventFlyer", index)

    def test_public_content_projection_uses_cloudflare_d1_not_supabase(self):
        public_content = (WORKER_SOURCE / "public-content.ts").read_text(encoding="utf-8")
        self.assertIn("db.prepare", public_content)
        self.assertNotIn("SUPABASE_URL", public_content)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", public_content)


if __name__ == "__main__":
    unittest.main()
