#!/usr/bin/env python3
"""Create and compare metadata-only manifests for controlled CMI data snapshots.

The utility never prints row values. Input files are JSON Lines, one JSON object
per row, exported in primary-key order. Target snapshots must be normalized to
the source column contract before hash comparison when a transform is required.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


def canonical_row(row: dict[str, Any]) -> bytes:
    return (json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def table_file(root: Path, table: str, side: str) -> Path:
    if side == "source":
        schema, name = table.split(".", 1)
        return root / schema / f"{name}.jsonl"
    return root / "target" / f"{table}.jsonl"


def build_manifest(root: Path, config: dict[str, Any], side: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "format_version": 1,
        "canonicalization": "json-sort-keys-compact-utf8-v1",
        "side": side,
        "tables": {},
        "excluded": [],
    }
    for spec in config["tables"]:
        source = spec["source_table"]
        target = spec["target_table"]
        action = spec["action"]
        if action == "exclude":
            result["excluded"].append({"source_table": source, "reason": spec.get("reason", "excluded by policy")})
            continue
        path = table_file(root, source if side == "source" else target, side)
        if not path.is_file():
            raise ValueError(f"Missing snapshot file for {source}: {path}")
        primary_key = spec["primary_key"]
        count = 0
        columns: set[str] = set()
        seen_keys: set[tuple[Any, ...]] = set()
        digest = hashlib.sha256()
        previous_key: tuple[Any, ...] | None = None
        with path.open("r", encoding="utf-8") as handle:
            for line_number, raw in enumerate(handle, 1):
                if not raw.strip():
                    continue
                try:
                    row = json.loads(raw)
                except json.JSONDecodeError as error:
                    raise ValueError(f"{path}:{line_number}: invalid JSON: {error.msg}") from error
                if not isinstance(row, dict):
                    raise ValueError(f"{path}:{line_number}: each row must be a JSON object")
                missing = [key for key in primary_key if key not in row or row[key] is None]
                if missing:
                    raise ValueError(f"{path}:{line_number}: missing primary-key fields: {', '.join(missing)}")
                key = tuple(row[field] for field in primary_key)
                if key in seen_keys:
                    raise ValueError(f"{path}:{line_number}: duplicate primary key in {source}")
                if previous_key is not None and key < previous_key:
                    raise ValueError(f"{path}:{line_number}: rows are not ordered by primary key in {source}")
                previous_key = key
                seen_keys.add(key)
                columns.update(row.keys())
                digest.update(canonical_row(row))
                count += 1
        result["tables"][source] = {
            "target_table": target,
            "action": action,
            "classification": spec["classification"],
            "primary_key": primary_key,
            "row_count": count,
            "columns": sorted(columns),
            "sha256": digest.hexdigest(),
        }
    return result


def compare_manifests(source: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    comparisons = []
    mismatches = []
    for table, source_meta in source.get("tables", {}).items():
        target_meta = target.get("tables", {}).get(table)
        if target_meta is None:
            mismatches.append({"source_table": table, "reason": "target table missing"})
            continue
        reasons = []
        if source_meta["row_count"] != target_meta["row_count"]:
            reasons.append("row_count")
        if source_meta["sha256"] != target_meta["sha256"]:
            reasons.append("sha256")
        item = {
            "source_table": table,
            "target_table": source_meta["target_table"],
            "row_count": source_meta["row_count"],
            "target_row_count": target_meta["row_count"],
            "sha256_match": source_meta["sha256"] == target_meta["sha256"],
            "status": "match" if not reasons else "mismatch",
        }
        comparisons.append(item)
        if reasons:
            mismatches.append({"source_table": table, "reason": ",".join(reasons)})
    for table in target.get("tables", {}):
        if table not in source.get("tables", {}):
            mismatches.append({"source_table": table, "reason": "unexpected target table"})
    return {
        "format_version": 1,
        "source_side": source.get("side"),
        "target_side": target.get("side"),
        "matched_tables": sum(item["status"] == "match" for item in comparisons),
        "mismatched_tables": len(mismatches),
        "comparisons": comparisons,
        "mismatches": mismatches,
        "excluded_source_tables": source.get("excluded", []),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    manifest = sub.add_parser("manifest", help="Create a metadata-only snapshot manifest")
    manifest.add_argument("--snapshot-dir", required=True, type=Path)
    manifest.add_argument("--config", required=True, type=Path)
    manifest.add_argument("--side", choices=("source", "target"), required=True)
    manifest.add_argument("--output", required=True, type=Path)
    compare = sub.add_parser("compare", help="Compare normalized source and target manifests")
    compare.add_argument("--source-manifest", required=True, type=Path)
    compare.add_argument("--target-manifest", required=True, type=Path)
    compare.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    try:
        if args.command == "manifest":
            config = json.loads(args.config.read_text(encoding="utf-8"))
            value = build_manifest(args.snapshot_dir, config, args.side)
        else:
            source = json.loads(args.source_manifest.read_text(encoding="utf-8"))
            target = json.loads(args.target_manifest.read_text(encoding="utf-8"))
            value = compare_manifests(source, target)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if args.command == "compare" and value["mismatched_tables"]:
            print(f"Reconciliation mismatch: {value['mismatched_tables']} table(s); row values were not emitted.", file=sys.stderr)
            return 1
        print(f"Wrote metadata-only {args.command} result to {args.output}")
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"Reconciliation failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
