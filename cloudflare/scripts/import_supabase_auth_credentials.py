#!/usr/bin/env python3
"""One-time, idempotent bridge for existing Supabase Auth bcrypt hashes to preview D1.

Credentials are read directly from the source Postgres connection and sent to the
isolated EU D1 database over the Cloudflare API. Hashes are never written to disk,
printed, uploaded as artifacts, or placed in GitHub outputs.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import urllib.parse

ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "1697f36d4227453d2e25cfb49b347e5f")
DATABASE_ID = os.environ.get("PCG_MISSIONS_PREVIEW_D1_ID", "74074d53-1edc-4ad7-83e6-bb3333a6ab4f")
API_BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}"
BCRYPT_PATTERN = re.compile(r"^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$")


def parse_source_rows(output: str) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for row in csv.reader(io.StringIO(output), delimiter="\t"):
        if not row or len(row) != 3:
            raise ValueError("Source credential query returned an invalid row shape.")
        user_id, email, password_hash = row
        uuid.UUID(user_id)
        normalized_email = email.strip().lower()
        if not normalized_email or len(normalized_email) > 320:
            raise ValueError("A linked staff identity has an invalid email address.")
        if not BCRYPT_PATTERN.fullmatch(password_hash):
            raise ValueError("A linked staff identity does not have a supported bcrypt password hash.")
        rows.append((user_id, normalized_email, password_hash))
    if not rows:
        raise ValueError("No linked staff credentials were found in the source database.")
    if len({row[0] for row in rows}) != len(rows):
        raise ValueError("The source returned duplicate staff identity IDs.")
    if len({row[1] for row in rows}) != len(rows):
        raise ValueError("The source returned duplicate staff email addresses.")
    return rows


def resolve_source_connection(database_url: str) -> str:
    parsed = urllib.parse.urlsplit(database_url)
    host = parsed.hostname or ""
    username = urllib.parse.unquote(parsed.username or "")
    password = urllib.parse.unquote(parsed.password or "")
    if host.startswith("db.") and host.endswith(".supabase.co"):
        project_ref = host[3:-len(".supabase.co")]
    elif host.endswith(".pooler.supabase.com"):
        project_ref = username.rsplit(".", 1)[-1] if "." in username else ""
    else:
        raise RuntimeError("Unsupported Supabase source endpoint; refusing to guess its region.")
    if project_ref != "cgwffpxlwgbnlinzwfoj":
        raise RuntimeError("The source connection is not the approved PCG Missions Supabase project.")
    if username == "postgres":
        username = "postgres." + project_ref
    if username != "postgres." + project_ref or not password:
        raise RuntimeError("The source connection username/password format is invalid.")
    for cluster in range(10):
        pooler_host = f"aws-{cluster}-eu-west-1.pooler.supabase.com"
        authority = (
            urllib.parse.quote(username, safe="") + ":" +
            urllib.parse.quote(password, safe="") + "@" + pooler_host + ":5432"
        )
        candidate = urllib.parse.urlunsplit((
            parsed.scheme or "postgresql", authority, parsed.path or "/postgres",
            parsed.query, parsed.fragment,
        ))
        try:
            probe = subprocess.run(
                ["psql", candidate, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", "SELECT 1"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, check=False,
                env={**os.environ, "PGCONNECT_TIMEOUT": "5"},
            )
        except (subprocess.TimeoutExpired, OSError):
            continue
        if probe.returncode == 0:
            return candidate
    raise RuntimeError("No assigned EU Supabase Session Pooler host accepted a read-only connection.")


def psql_source_rows(database_url: str) -> list[tuple[str, str, str]]:
    sql = """
      SELECT u.id::text, lower(u.email), u.encrypted_password
      FROM auth.users AS u
      INNER JOIN public.staff_profile AS sp ON sp.auth_user_id = u.id
      WHERE sp.auth_user_id IS NOT NULL
      ORDER BY u.id
    """
    source_url = resolve_source_connection(database_url)
    try:
        completed = subprocess.run(
            ["psql", source_url, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=90,
            env={**os.environ, "PGCONNECT_TIMEOUT": "15"},
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        raise RuntimeError("Could not securely read linked staff credentials from the Supabase source.") from None
    return parse_source_rows(completed.stdout)

def d1_query(token: str, sql: str, params: list[str] | None = None) -> list[dict]:
    body = {"sql": sql}
    if params is not None:
        body["params"] = params
    request = urllib.request.Request(
        API_BASE + "/query",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        error_codes = []
        try:
            error_payload = json.loads(error.read().decode("utf-8"))
            error_codes = [
                str(item.get("code")) for item in error_payload.get("errors", [])
                if isinstance(item, dict) and item.get("code") is not None
            ]
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
        suffix = ", Cloudflare code " + ",".join(error_codes) if error_codes else ""
        raise RuntimeError(
            f"Cloudflare D1 query failed (HTTP {error.code}{suffix}); credential values were not logged."
        ) from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise RuntimeError("Cloudflare D1 query failed; credential values were not logged.") from None
    if not payload.get("success") or payload.get("errors"):
        raise RuntimeError("Cloudflare D1 rejected a credential-import query; credential values were not logged.")
    result = payload.get("result") or []
    if not result or not result[0].get("success"):
        raise RuntimeError("Cloudflare D1 returned an unsuccessful credential-import result.")
    return result[0].get("results") or []


def require_preview_schema(meta: list[dict]) -> None:
    if len(meta) != 1 or meta[0].get("schema_version") != 46 or meta[0].get("environment") != "non-production":
        raise RuntimeError("Credential import is restricted to schema 46 in the isolated non-production D1 database.")

def verify_credential_hashes(token: str, source_rows: list[tuple[str, str, str]]) -> None:
    # Compare hashes inside D1 and return only a match count. Never read hashes
    # back into the runner or expose them in logs, artifacts, or API responses.
    for user_id, _email, password_hash in source_rows:
        matches = d1_query(
            token,
            "SELECT COUNT(*) AS count FROM account WHERE providerId='credential' AND userId=? AND password=?",
            [user_id, password_hash],
        )
        count = int(matches[0]["count"]) if matches else 0
        if count != 1:
            raise RuntimeError("Credential-import hash verification failed; no hash values were returned or logged.")


def main() -> int:
    source_url = os.environ.get("SUPABASE_SOURCE_DB_URL", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not source_url or not token:
        raise RuntimeError("The source database URL and Cloudflare D1 token are required.")
    if "cgwffpxlwgbnlinzwfoj" not in source_url:
        raise RuntimeError("The source connection is not the approved PCG Missions Supabase project.")

    meta = d1_query(token, "SELECT schema_version, environment FROM app_meta WHERE id=1")
    require_preview_schema(meta)

    source_rows = psql_source_rows(source_url)
    target_rows = d1_query(token, 'SELECT id, lower(email) AS email FROM "user" ORDER BY id')
    target = {row["id"]: row["email"] for row in target_rows}
    source = {user_id: email for user_id, email, _ in source_rows}
    if target != source:
        raise RuntimeError("Supabase and D1 staff identity IDs/emails do not match exactly; no credential was imported.")

    now_ms = str(int(time.time() * 1000))
    for user_id, _email, password_hash in source_rows:
        account_id = user_id + ":credential"
        d1_query(
            token,
            """INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
               VALUES (?, ?, 'credential', ?, ?, ?, ?)
               ON CONFLICT(providerId, accountId) DO UPDATE
               SET password=excluded.password, updatedAt=excluded.updatedAt""",
            [account_id, user_id, user_id, password_hash, now_ms, now_ms],
        )

    imported = d1_query(
        token,
        "SELECT COUNT(*) AS count FROM account WHERE providerId='credential'",
    )
    count = int(imported[0]["count"]) if imported else -1
    if count != len(source_rows):
        raise RuntimeError("Credential-import verification did not match the linked staff identity count.")

    verify_credential_hashes(token, source_rows)

    print(f"Verified {count} linked staff credential hashes in isolated non-production D1. No password hashes or tokens were logged.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        # Error text is deliberately generic; do not include source rows, SQL output, or credentials.
        print(f"Credential import stopped safely: {error}", file=sys.stderr)
        sys.exit(1)
