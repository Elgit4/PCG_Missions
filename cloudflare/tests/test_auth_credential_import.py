import importlib.util
import sys
import unittest
from unittest.mock import patch
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "import_supabase_auth_credentials.py"
SPEC = importlib.util.spec_from_file_location("credential_import", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CredentialImportTests(unittest.TestCase):
    def test_accepts_bcrypt_rows_without_printing_credentials(self):
        row = "10000000-0000-4000-8000-000000000001\tstaff@example.test\t$2b$12$" + "a" * 53
        parsed = MODULE.parse_source_rows(row)
        self.assertEqual(parsed[0][0], "10000000-0000-4000-8000-000000000001")
        self.assertEqual(parsed[0][1], "staff@example.test")
        self.assertEqual(len(parsed[0][2]), 60)

    def test_credential_import_requires_schema_46_nonproduction(self):
        MODULE.require_preview_schema([{"schema_version": 46, "environment": "non-production"}])

    def test_credential_import_rejects_schema_45_and_production(self):
        with self.assertRaises(RuntimeError):
            MODULE.require_preview_schema([{"schema_version": 45, "environment": "non-production"}])
        with self.assertRaises(RuntimeError):
            MODULE.require_preview_schema([{"schema_version": 46, "environment": "production"}])

    def test_rejects_non_bcrypt_hashes(self):
        row = "10000000-0000-4000-8000-000000000001\tstaff@example.test\tplaintext"
        with self.assertRaises(ValueError):
            MODULE.parse_source_rows(row)

    def test_rejects_duplicate_identity_ids(self):
        row = "10000000-0000-4000-8000-000000000001\tstaff@example.test\t$2b$12$" + "a" * 53
        with self.assertRaises(ValueError):
            MODULE.parse_source_rows(row + "\n" + row)

    def test_rejects_empty_source(self):
        with self.assertRaises(ValueError):
            MODULE.parse_source_rows("")

    def test_import_skips_credentials_that_already_match(self):
        source = [(
            "10000000-0000-4000-8000-000000000001",
            "staff@example.test",
            "$2b$12$" + "a" * 53,
        )]
        calls = []

        def fake_query(_token, sql, params=None):
            calls.append(sql)
            return [{"count": 1}]

        with patch.object(MODULE, "d1_query", side_effect=fake_query):
            writes = MODULE.import_credential_rows("test-token", source, "1795464000000")

        self.assertEqual(writes, 0)
        self.assertEqual(len(calls), 1)
        self.assertTrue(calls[0].startswith("SELECT COUNT(*)"))

    def test_import_updates_only_a_credential_that_does_not_match(self):
        source = [(
            "10000000-0000-4000-8000-000000000001",
            "staff@example.test",
            "$2b$12$" + "a" * 53,
        )]
        calls = []

        def fake_query(_token, sql, params=None):
            calls.append((sql, params))
            return [{"count": 0}]

        with patch.object(MODULE, "d1_query", side_effect=fake_query):
            writes = MODULE.import_credential_rows("test-token", source, "1795464000000")

        self.assertEqual(writes, 1)
        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[1][0].startswith("INSERT INTO account"))
        self.assertEqual(calls[1][1][0], source[0][0] + ":credential")

    def test_hash_verification_compares_inside_d1_without_returning_hashes(self):
        source = [(
            "10000000-0000-4000-8000-000000000001",
            "staff@example.test",
            "$2b$12$" + "a" * 53,
        )]
        calls = []

        def fake_query(_token, sql, params=None):
            calls.append((sql, params))
            return [{"count": 1}]

        with patch.object(MODULE, "d1_query", side_effect=fake_query):
            MODULE.verify_credential_hashes("test-token", source)

        self.assertEqual(len(calls), 1)
        self.assertIn("COUNT(*) AS count", calls[0][0])
        self.assertIn("password=?", calls[0][0])
        self.assertEqual(calls[0][1], [source[0][0], source[0][2]])
        self.assertNotIn("SELECT userId, password", calls[0][0])

    def test_hash_verification_fails_closed_when_a_hash_does_not_match(self):
        source = [(
            "10000000-0000-4000-8000-000000000001",
            "staff@example.test",
            "$2b$12$" + "a" * 53,
        )]
        with patch.object(MODULE, "d1_query", return_value=[{"count": 0}]):
            with self.assertRaisesRegex(RuntimeError, "hash verification failed"):
                MODULE.verify_credential_hashes("test-token", source)


if __name__ == "__main__":
    unittest.main()
