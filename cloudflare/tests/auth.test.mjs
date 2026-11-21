import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseAuthUser,
  deleteSupabaseAuthUser,
  verifySupabaseAccessToken,
} from "../src/auth.ts";

const USER_ID = "3c4f4f8d-7d3b-4a9c-8f1a-5a5f4a4b7c21";
const BASE_ENV = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-secret",
};

test("missing bearer token is rejected without contacting Supabase", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  const result = await verifySupabaseAccessToken(new Request("https://worker.test/api/v1/me"), BASE_ENV);
  assert.deepEqual(result, { state: "unauthenticated" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("uses the identity returned by Supabase Auth", async (t) => {
  let receivedUrl = "";
  let receivedInit;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    receivedUrl = String(url);
    receivedInit = init;
    return Response.json({ id: USER_ID, email: "staff@example.com" });
  });
  const request = new Request("https://worker.test/api/v1/me", {
    headers: { Authorization: "Bearer valid-access-token" },
  });
  const result = await verifySupabaseAccessToken(request, BASE_ENV);
  assert.deepEqual(result, { state: "valid", user: { id: USER_ID, email: "staff@example.com" } });
  assert.equal(receivedUrl, "https://example.supabase.co/auth/v1/user");
  assert.equal(receivedInit.headers.apikey, "sb_publishable_test");
  assert.equal(receivedInit.headers.Authorization, "Bearer valid-access-token");
});

test("401 from Supabase rejects expired or revoked tokens", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  const result = await verifySupabaseAccessToken(
    new Request("https://worker.test", { headers: { Authorization: "Bearer expired-token" } }),
    BASE_ENV,
  );
  assert.deepEqual(result, { state: "unauthenticated" });
});

test("upstream 5xx fails closed as an authentication-service outage", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  const result = await verifySupabaseAccessToken(
    new Request("https://worker.test", { headers: { Authorization: "Bearer token" } }),
    BASE_ENV,
  );
  assert.deepEqual(result, { state: "unavailable" });
});

test("network failure fails closed", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network unavailable"); });
  const result = await verifySupabaseAccessToken(
    new Request("https://worker.test", { headers: { Authorization: "Bearer token" } }),
    BASE_ENV,
  );
  assert.deepEqual(result, { state: "unavailable" });
});

test("malformed successful Auth response fails closed", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: "not-a-uuid" }));
  const result = await verifySupabaseAccessToken(
    new Request("https://worker.test", { headers: { Authorization: "Bearer token" } }),
    BASE_ENV,
  );
  assert.deepEqual(result, { state: "unavailable" });
});

test("creates an invitation identity using the server-only Admin API", async (t) => {
  let receivedUrl = "";
  let receivedInit;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    receivedUrl = String(url);
    receivedInit = init;
    return Response.json({ id: USER_ID });
  });
  const id = await createSupabaseAuthUser(BASE_ENV, {
    email: "staff@example.com",
    password: "a-long-temporary-password",
    fullName: "Staff Member",
  });
  assert.equal(id, USER_ID);
  assert.equal(receivedUrl, "https://example.supabase.co/auth/v1/admin/users");
  assert.equal(receivedInit.headers.Authorization, "Bearer server-only-service-role-secret");
  assert.match(receivedInit.body, /"email_confirm":true/);
});

test("deletes a newly created identity as the D1 compensation action", async (t) => {
  let receivedUrl = "";
  let receivedInit;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    receivedUrl = String(url);
    receivedInit = init;
    return new Response(null, { status: 204 });
  });
  await deleteSupabaseAuthUser(BASE_ENV, USER_ID);
  assert.equal(receivedUrl, `https://example.supabase.co/auth/v1/admin/users/${USER_ID}`);
  assert.equal(receivedInit.method, "DELETE");
});

test("Admin API is unavailable without the service-role secret", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  await assert.rejects(
    createSupabaseAuthUser(
      { ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined },
      { email: "staff@example.com", password: "temporary-password", fullName: "Staff" },
    ),
    /SUPABASE_ADMIN_AUTH_NOT_CONFIGURED/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
