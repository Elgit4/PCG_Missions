import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

function fakeEnv(options = {}) {
  const calls = [];
  const row = options.meta ?? { schema_version: 37, environment: "non-production" };
  const DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          calls.push(sql);
          if (sql.includes("FROM app_meta")) return row;
          return null;
        },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: { changes: 0 } }; },
      };
    },
    async batch() { return []; },
  };
  return {
    calls,
    env: {
      DB,
      APP_ENV: "non-production",
      APP_ALLOWED_ORIGINS: "https://preview.example, http://localhost:5173",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    },
  };
}

test("health reports the migrated non-production D1 schema and request ID", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.environment, "non-production");
  assert.equal(payload.schema_version, 37);
  assert.ok(payload.request_id);
  assert.equal(calls.length, 1);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("health fails closed if D1 is marked as production", async () => {
  const { env } = fakeEnv({ meta: { schema_version: 37, environment: "production" } });
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.state, "database_not_initialized");
});

test("health fails closed when the D1 metadata row is missing", async () => {
  const { env } = fakeEnv({ meta: null });
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  assert.equal(response.status, 503);
});

test("rejects an untrusted browser origin without reflecting it", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/health", {
    headers: { Origin: "https://attacker.example" },
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "ORIGIN_NOT_ALLOWED");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(calls.length, 0);
});

test("answers preflight only for configured origins and required headers", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/contacts", {
    method: "OPTIONS",
    headers: {
      Origin: "https://preview.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type,x-branch-id",
    },
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://preview.example");
  assert.match(response.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  assert.equal(calls.length, 0);
});

test("rejects protected staff context without a bearer token before querying D1", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/me"), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("returns a stable 404 envelope for an unimplemented route", async () => {
  const { env } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/not-yet-implemented"), env);
  const payload = await response.json();
  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "ROUTE_NOT_FOUND");
  assert.ok(payload.request_id);
});
