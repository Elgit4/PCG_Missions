import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

const STAFF_ID = "20000000-0000-4000-8000-000000000001";
const AUTH_ID = "10000000-0000-4000-8000-000000000001";
const BRANCH_ID = "30000000-0000-4000-8000-000000000001";
const RESET_ID = "90000000-0000-4000-8000-000000000001";
const ADMIN_AUTH_ID = "10000000-0000-4000-8000-000000000002";
const EXPIRY = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function result(changes = 1) {
  return { success: true, meta: { changes } };
}

function makeEnv(options = {}) {
  const statements = [];
  const batches = [];
  const profile = {
    id: STAFF_ID,
    auth_user_id: AUTH_ID,
    full_name: "Synthetic Staff",
    email: "staff@example.test",
    account_status: "active",
    must_change_password: options.mustChangePassword === false ? 0 : 1,
    password_setup_expires_at: options.expired ? "2020-01-01T00:00:00.000Z" : EXPIRY,
  };
  const reset = { id: RESET_ID };
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          statements.push({ kind: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT COUNT(*) AS count")) return { count: options.rateLimited ? 5 : 0 };
          if (this.sql.includes("SELECT sp.id AS profile_id, sra.branch_id")) {
            return options.knownEmail === false ? null : { profile_id: STAFF_ID, branch_id: BRANCH_ID };
          }
          if (this.sql.includes("WHERE auth_user_id = ?")) return profile;
          if (this.sql.includes("SELECT id FROM staff_password_reset_request")) return reset;
          return null;
        },
        async all() {
          statements.push({ kind: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT DISTINCT sp.auth_user_id")) return { results: [{ auth_user_id: ADMIN_AUTH_ID }] };
          if (this.sql.includes("SELECT DISTINCT b.id, b.name, b.timezone")) return { results: [] };
          if (this.sql.includes("SELECT DISTINCT r.id AS role_id")) return { results: [] };
          return { results: [] };
        },
        async run() {
          statements.push({ kind: "run", sql: this.sql, values: this.values });
          return result();
        },
      };
      return statement;
    },
    async batch(items) {
      batches.push(items.map((item) => ({ sql: item.sql, values: item.values })));
      return items.map(() => result());
    },
  };
  return {
    env: {
      DB,
      APP_ENV: "non-production",
      APP_ALLOWED_ORIGINS: "https://preview.example",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-only-secret",
    },
    statements,
    batches,
    profile,
  };
}

function post(path, body, headers = {}) {
  return new Request("https://worker.example" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("public reset request is non-enumerating and persists a branch-scoped request for a known staff identity", async () => {
  const known = makeEnv();
  const unknown = makeEnv({ knownEmail: false });
  const knownResponse = await worker.fetch(post("/api/v1/auth/password-reset-requests", { email: " STAFF@EXAMPLE.TEST " }), known.env);
  const unknownResponse = await worker.fetch(post("/api/v1/auth/password-reset-requests", { email: "unknown@example.test" }), unknown.env);
  const knownBody = await knownResponse.json();
  const unknownBody = await unknownResponse.json();

  assert.equal(knownResponse.status, 200);
  assert.equal(unknownResponse.status, 200);
  assert.equal(knownBody.ok, unknownBody.ok);
  assert.equal(knownBody.message, unknownBody.message);
  assert.notEqual(knownBody.request_id, unknownBody.request_id);
  assert.equal(knownBody.ok, true);
  assert.match(knownBody.message, /If this address belongs to an active staff account/);

  assert.equal(known.batches.length, 1);
  const writes = known.batches[0];
  assert.equal(writes.length, 3);
  assert.match(writes[0].sql, /INSERT INTO staff_password_reset_request/);
  assert.equal(writes[0].values[1], STAFF_ID);
  assert.equal(writes[0].values[2], BRANCH_ID);
  assert.equal(writes[0].values[3], "staff@example.test");
  assert.match(writes[1].sql, /INSERT INTO staff_password_reset_audit/);
  assert.match(writes[2].sql, /INSERT INTO staff_notification/);
  assert.equal(writes[2].values[2], ADMIN_AUTH_ID);
  assert.equal(unknown.batches.length, 0);
});

test("public reset request validates input and rate-limits without writing", async () => {
  const invalid = makeEnv();
  const invalidResponse = await worker.fetch(post("/api/v1/auth/password-reset-requests", { email: "not-an-email" }), invalid.env);
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error.code, "INVALID_RESET_REQUEST");
  assert.equal(invalid.batches.length, 0);

  const limited = makeEnv({ rateLimited: true });
  const limitedResponse = await worker.fetch(post("/api/v1/auth/password-reset-requests", { email: "staff@example.test" }), limited.env);
  assert.equal(limitedResponse.status, 429);
  assert.equal((await limitedResponse.json()).error.code, "RESET_REQUEST_RATE_LIMITED");
  assert.equal(limited.batches.length, 0);
});

test("forced password change updates Supabase Auth and atomically clears the D1 gate with completion audit", async (t) => {
  const fixture = makeEnv();
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body ?? null });
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: AUTH_ID, email: "staff@example.test" });
    }
    return new Response(null, { status: 200 });
  });

  const response = await worker.fetch(post(
    "/api/v1/auth/password/change",
    { password: "A-strong-New-Password-2026!" },
    { Authorization: "Bearer synthetic-staff-access-token" },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data, { password_changed: true, must_change_password: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://example.supabase.co/auth/v1/user");
  assert.equal(calls[1].url, "https://example.supabase.co/auth/v1/admin/users/" + AUTH_ID);
  assert.equal(calls[1].method, "PUT");
  assert.deepEqual(JSON.parse(calls[1].body), { password: "A-strong-New-Password-2026!" });
  assert.equal(calls[1].headers.Authorization, "Bearer synthetic-server-only-secret");

  assert.equal(fixture.batches.length, 1);
  const writes = fixture.batches[0];
  assert.match(writes[0].sql, /UPDATE staff_profile/);
  assert.match(writes[0].sql, /must_change_password = 0/);
  assert.match(writes[1].sql, /INSERT INTO staff_password_reset_audit/);
  assert.match(writes[2].sql, /UPDATE staff_password_reset_request SET status = 'completed'/);
});

test("expired temporary-password gate blocks password mutation", async (t) => {
  const fixture = makeEnv({ expired: true });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    return Response.json({ id: AUTH_ID, email: "staff@example.test" });
  });

  const response = await worker.fetch(post(
    "/api/v1/auth/password/change",
    { password: "A-strong-New-Password-2026!" },
    { Authorization: "Bearer synthetic-staff-access-token" },
  ), fixture.env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "PASSWORD_SETUP_EXPIRED");
  assert.deepEqual(calls, ["https://example.supabase.co/auth/v1/user"]);
  assert.equal(fixture.batches.length, 0);
});
