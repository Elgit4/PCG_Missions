import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from reconcile_snapshot import build_manifest, compare_manifests


class SnapshotReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config = {
            "tables": [
                {
                    "source_table": "public.branch",
                    "target_table": "branch",
                    "primary_key": ["id"],
                    "action": "copy",
                    "classification": "operational",
                },
                {
                    "source_table": "private.first_admin_bootstrap_lease",
                    "target_table": "first_admin_bootstrap_lease",
                    "primary_key": ["lock_name"],
                    "action": "exclude",
                    "classification": "highly_restricted",
                },
            ]
        }

    def tearDown(self):
        self.temp.cleanup()

    def write_rows(self, side, table, rows):
        path = self.root / ("public" if side == "source" else "target")
        path.mkdir(parents=True, exist_ok=True)
        if side == "source":
            path = path / "branch.jsonl"
        else:
            path = path / "branch.jsonl"
        path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")

    def test_identical_normalized_snapshots_match_without_emitting_rows(self):
        rows = [{"id": "a", "name": "Branch A"}, {"id": "b", "name": "Branch B"}]
        self.write_rows("source", "branch", rows)
        self.write_rows("target", "branch", rows)
        source = build_manifest(self.root, self.config, "source")
        target = build_manifest(self.root, self.config, "target")
        comparison = compare_manifests(source, target)
        self.assertEqual(comparison["matched_tables"], 1)
        self.assertEqual(comparison["mismatched_tables"], 0)
        self.assertEqual(source["excluded"][0]["source_table"], "private.first_admin_bootstrap_lease")
        self.assertNotIn("Branch A", json.dumps(source))

    def test_duplicate_primary_keys_are_rejected(self):
        self.write_rows("source", "branch", [{"id": "a"}, {"id": "a"}])
        with self.assertRaisesRegex(ValueError, "duplicate primary key"):
            build_manifest(self.root, self.config, "source")

    def test_out_of_order_primary_keys_are_rejected(self):
        self.write_rows("source", "branch", [{"id": "b"}, {"id": "a"}])
        with self.assertRaisesRegex(ValueError, "not ordered by primary key"):
            build_manifest(self.root, self.config, "source")

    def test_row_count_and_digest_drift_are_reported(self):
        self.write_rows("source", "branch", [{"id": "a", "name": "A"}])
        self.write_rows("target", "branch", [{"id": "a", "name": "Changed"}])
        source = build_manifest(self.root, self.config, "source")
        target = build_manifest(self.root, self.config, "target")
        comparison = compare_manifests(source, target)
        self.assertEqual(comparison["mismatched_tables"], 1)
        self.assertEqual(comparison["mismatches"][0]["reason"], "sha256")

    def test_missing_snapshot_file_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "Missing snapshot file"):
            build_manifest(self.root, self.config, "source")


if __name__ == "__main__":
    unittest.main()
