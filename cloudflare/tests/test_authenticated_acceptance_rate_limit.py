from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class AuthenticatedAcceptanceRateLimitTests(unittest.TestCase):
    def test_acceptance_harness_respects_the_real_better_auth_sign_in_limit(self):
        auth_source = (ROOT / "cloudflare" / "src" / "auth.ts").read_text(encoding="utf-8")
        harness = (ROOT / "cloudflare" / "scripts" / "run_authenticated_acceptance.mjs").read_text(encoding="utf-8")

        self.assertIn('"/sign-in/email": { window: 60, max: 5 }', auth_source)
        self.assertIn("const remaining = 30_000 - (Date.now() - lastSignInAttemptAt);", harness)
        self.assertIn("async function waitForSignInRateLimitSlot()", harness)
        self.assertIn("if (response.status === 429 && attempt < 2)", harness)
        self.assertIn("Math.max(65_000, retryAfter * 1000)", harness)
        self.assertIn("await signIn(firstLoginUser", harness)
        self.assertIn("await signIn(resetTarget", harness)


if __name__ == "__main__":
    unittest.main()
