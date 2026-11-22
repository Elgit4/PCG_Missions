import importlib.util
import sys
import unittest
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


if __name__ == "__main__":
    unittest.main()
