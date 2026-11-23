import assert from "node:assert/strict";
import test from "node:test";
import { resolveStaffContext } from "../src/staff-context.ts";
import { authorizeCapability } from "../src/authorization.ts";

const USER_ID = "3c4f4f8d-7d3b-4a9c-8f1a-5a5f4a4b7c21";
const PROFILE_ID = "4c4f4f8d-7d3b-4a9c-8f1a-5a5f4a4b7c21";
const BRANCH_ID = "5c4f4f8d-7d3b-4a9c-8f1a-5a5f4a4b7c21";

function fakeEnvironment(overrides = {}) {
  const calls = [];
  const profile = {
    id: PROFILE_ID, auth_user_id: USER_ID, full_name: "Staff Member",
    email: "staff@example.com", account_status: "active",
    must_change_password: 0, password_setup_expires_at: null,
    ...overrides.profile,
  };
  const DB = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { this.values = values; return this; },
        async first() {
          calls.push({ kind: "first", sql, values: this.values });
          if (sql.includes("FROM staff_profile")) return profile;
          return null;
        },
        async all() {
          calls.push({ kind: "all", sql, values: this.values });
          if (sql.includes("SELECT DISTINCT b.id, b.name")) return { results: [{ id: BRANCH_ID, name: "Main Branch", timezone: "Africa/Accra" }] };
          if (sql.includes("SELECT DISTINCT r.id AS role_id")) return { results: [{ role_id: "role-1", code: "coordinator", name: "Coordinator", branch_id: BRANCH_ID }] };
          if (sql.includes("SELECT DISTINCT c.code, rc.scope_mode")) return { results: [{ code: "contacts.read", scope_mode: "branch", branch_id: BRANCH_ID }] };
          if (sql.includes("role_code, c.code AS capability_code")) return { results: [{ role_code: "coordinator", capability_code: "contacts.read", scope_mode: "branch", sensitivity: "normal" }] };
          return { results: [] };
        },
      };
      return statement;
    },
  };
  return { calls, env: {
    DB,
    __TEST_SESSION_RESOLVER: async (request) => {
      if (overrides.authUnavailable) throw new Error("Better Auth session storage unavailable");
      return request.headers.has("Cookie")
        ? { user: { id: USER_ID, email: "staff@example.com" } } : null;
    },
  } };
}

test("assigned-scope contact capture is authorized before a new contact ID exists", async () => {
  let capturedSql = "";
  let capturedValues = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) { capturedSql = sql; capturedValues = values; return this; },
        async first() {
          return capturedValues[2] === "contacts.create" && capturedSql.includes("c.code = 'contacts.create'")
            ? { scope_mode: "assigned", sensitivity: "normal" }
            : null;
        },
      };
    },
  };
  const allowed = await authorizeCapability(db, {
    actorProfileId: PROFILE_ID,
    branchId: BRANCH_ID,
    capability: "contacts.create",
    now: "2026-11-23T16:00:00.000Z",
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.scopeMode, "assigned");
  assert.deepEqual(capturedValues.slice(-3), ["", "", PROFILE_ID]);

  const denied = await authorizeCapability(db, {
    actorProfileId: PROFILE_ID,
    branchId: BRANCH_ID,
    capability: "contacts.update",
    now: "2026-11-23T16:00:00.000Z",
  });
  assert.equal(denied.allowed, false);
});

test("resolves a Better Auth cookie session into active D1 staff, role and capability context", async () => {
  const { env, calls } = fakeEnvironment();
  const request = new Request("https://worker.test/api/v1/me", {
    headers: { Cookie: "better-auth.session_token=synthetic-session", "X-Branch-Id": BRANCH_ID },
  });
  const result = await resolveStaffContext(request, env);
  assert.equal(result.state, "authenticated");
  assert.equal(result.staff.profileId, PROFILE_ID);
  assert.deepEqual(result.staff.roles, [{ code: "coordinator", name: "Coordinator", branch_id: BRANCH_ID }]);
  assert.equal(result.activeBranch.branchId, BRANCH_ID);
  assert.deepEqual(result.activeBranch.roles, ["coordinator"]);
  assert.deepEqual(result.activeBranch.capabilities.map((item) => item.code), ["contacts.read"]);
  assert.ok(calls.some((call) => call.sql.includes("FROM staff_role_assignment")));
});

test("keeps branch workspace data hidden during a valid temporary-password setup", async () => {
  const { env } = fakeEnvironment({ profile: { must_change_password: 1, password_setup_expires_at: new Date(Date.now() + 60_000).toISOString() } });
  const request = new Request("https://worker.test/api/v1/me", { headers: { Cookie: "better-auth.session_token=synthetic-session" } });
  const result = await resolveStaffContext(request, env);
  assert.equal(result.state, "authenticated");
  assert.equal(result.staff.mustChangePassword, true);
  assert.deepEqual(result.staff.branches, []);
  assert.deepEqual(result.staff.roles, []);
  assert.deepEqual(result.staff.capabilities, []);
  assert.equal(result.activeBranch, null);
});

test("returns a distinct expired temporary-password state", async () => {
  const { env } = fakeEnvironment({ profile: { must_change_password: 1, password_setup_expires_at: "2020-01-01T00:00:00.000Z" } });
  const request = new Request("https://worker.test/api/v1/me", { headers: { Cookie: "better-auth.session_token=synthetic-session" } });
  const result = await resolveStaffContext(request, env);
  assert.deepEqual(result, { state: "password_setup_expired" });
});

test("fails closed without querying D1 when Better Auth session storage is unavailable", async () => {
  const { env, calls } = fakeEnvironment({ authUnavailable: true });
  const request = new Request("https://worker.test/api/v1/me", { headers: { Cookie: "better-auth.session_token=synthetic-session" } });
  const result = await resolveStaffContext(request, env);
  assert.deepEqual(result, { state: "auth_unavailable" });
  assert.equal(calls.length, 0);
});
