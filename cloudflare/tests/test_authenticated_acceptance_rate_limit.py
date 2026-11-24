from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class AuthenticatedAcceptanceRateLimitTests(unittest.TestCase):
    def test_acceptance_harness_captures_assignment_preflight_without_private_contact_fields(self):
        harness = (ROOT / "cloudflare" / "scripts" / "run_authenticated_acceptance.mjs").read_text(encoding="utf-8")

        self.assertIn("CONTACT_ASSIGNMENT_PRECHECK", harness)
        self.assertIn("'contact_status', c.contact_status", harness)
        self.assertIn("'target_team_active'", harness)
        self.assertIn("'active_assignments'", harness)
        self.assertIn("'admin_has_active_branch_assign_grant'", harness)
        self.assertNotIn("phone_e164", harness[harness.index("CONTACT_ASSIGNMENT_PRECHECK") - 2500:harness.index("CONTACT_ASSIGNMENT_PRECHECK") + 2500])
        self.assertNotIn("email_normalized", harness[harness.index("CONTACT_ASSIGNMENT_PRECHECK") - 2500:harness.index("CONTACT_ASSIGNMENT_PRECHECK") + 2500])

    def test_acceptance_harness_respects_the_real_better_auth_sign_in_limit(self):
        auth_source = (ROOT / "cloudflare" / "src" / "auth.ts").read_text(encoding="utf-8")
        harness = (ROOT / "cloudflare" / "scripts" / "run_authenticated_acceptance.mjs").read_text(encoding="utf-8")

        self.assertIn('"/sign-in/email": { window: 60, max: 5 }', auth_source)
        self.assertIn("const SIGN_IN_RATE_LIMIT_INTERVAL_MS = 20_000;", harness)
        self.assertIn("const SIGN_IN_RATE_LIMIT_RETRY_MS = 61_000;", harness)
        self.assertIn("async function signInAttempt(identity, label)", harness)
        self.assertIn("response.status !== 429", harness)
        self.assertIn("await signInAttempt(firstLoginUser", harness)
        self.assertIn("await signInAttempt(resetTarget", harness)


if __name__ == "__main__":
    unittest.main()
