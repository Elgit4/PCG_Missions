import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

function fakeEnv(options = {}) {
  const calls = [];
  const row = Object.hasOwn(options, "meta") ? options.meta : { schema_version: 39, environment: "non-production" };
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
  assert.equal(payload.schema_version, 39);
  assert.ok(payload.request_id);
  assert.equal(calls.length, 1);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("health fails closed if D1 is marked as production", async () => {
  const { env } = fakeEnv({ meta: { schema_version: 39, environment: "production" } });
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.state, "database_not_initialized");
});

test("health accepts a production D1 marker only for a production Worker environment", async () => {
  const { env } = fakeEnv({ meta: { schema_version: 39, environment: "production" } });
  env.APP_ENV = "production";
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.environment, "production");
  assert.equal(payload.schema_version, 39);
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
  assert.match(response.headers.get("Access-Control-Allow-Headers"), /Idempotency-Key/);
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

test("team collection reads require an authenticated branch-scoped manager", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/teams?branch_id=00000000-0000-4000-8000-000000000001"), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("service-area collection reads require an authenticated branch-scoped manager", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/areas?branch_id=00000000-0000-4000-8000-000000000001"), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("team creation requires a verified branch-scoped manager", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch_id: "00000000-0000-4000-8000-000000000001", name: "Welcome", description: null }),
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("service-area creation requires a verified branch-scoped manager", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/areas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch_id: "00000000-0000-4000-8000-000000000001", name: "Tema West", code: "TEMA-W" }),
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("team membership writes require an authenticated branch-scoped manager", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/teams/00000000-0000-4000-8000-000000000002/members?branch_id=00000000-0000-4000-8000-000000000001", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staff_profile_id: "00000000-0000-4000-8000-000000000005", membership_role: "member" }),
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("area coverage writes require an authenticated branch-scoped manager", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/areas/00000000-0000-4000-8000-000000000003/coverage?branch_id=00000000-0000-4000-8000-000000000001", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staff_profile_id: "00000000-0000-4000-8000-000000000005" }),
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

const AUTH_USER_ID = "10000000-0000-4000-8000-000000000001";
const STAFF_PROFILE_ID = "20000000-0000-4000-8000-000000000001";
const BRANCH_ID = "30000000-0000-4000-8000-000000000001";
const OWN_TEAM_ID = "40000000-0000-4000-8000-000000000001";
const OTHER_TEAM_ID = "40000000-0000-4000-8000-000000000002";
const OWN_AREA_ID = "50000000-0000-4000-8000-000000000001";
const OTHER_AREA_ID = "50000000-0000-4000-8000-000000000002";
const COVERED_STAFF_ID = "20000000-0000-4000-8000-000000000002";
const OTHER_STAFF_ID = "20000000-0000-4000-8000-000000000003";
const CONTACT_ID = "80000000-0000-4000-8000-000000000001";

function authorizedDirectoryEnv(roleCode) {
  const calls = [];
  const teamRows = [
    { id: OWN_TEAM_ID, branch_id: BRANCH_ID, name: "Welcome Team", description: "Greets visitors", is_active: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
    { id: OTHER_TEAM_ID, branch_id: BRANCH_ID, name: "Prayer Team", description: "Separate team", is_active: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  ];
  const membershipRows = [
    { id: "60000000-0000-4000-8000-000000000001", team_id: OWN_TEAM_ID, staff_profile_id: COVERED_STAFF_ID, membership_role: "member", starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "60000000-0000-4000-8000-000000000002", team_id: OTHER_TEAM_ID, staff_profile_id: OTHER_STAFF_ID, membership_role: "member", starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, created_at: "2026-01-01T00:00:00.000Z" },
  ];
  const areaRows = [
    { id: OWN_AREA_ID, branch_id: BRANCH_ID, name: "Tema West", code: "TEMA-W", is_active: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
    { id: OTHER_AREA_ID, branch_id: BRANCH_ID, name: "Tema East", code: "TEMA-E", is_active: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  ];
  const coverageRows = [
    { id: "70000000-0000-4000-8000-000000000001", service_area_id: OWN_AREA_ID, staff_profile_id: COVERED_STAFF_ID, starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "70000000-0000-4000-8000-000000000002", service_area_id: OTHER_AREA_ID, staff_profile_id: OTHER_STAFF_ID, starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, created_at: "2026-01-01T00:00:00.000Z" },
  ];
  const profiles = [
    { id: COVERED_STAFF_ID, full_name: "Assigned Worker", account_status: "active" },
    { id: OTHER_STAFF_ID, full_name: "Other Worker", account_status: "active" },
  ];
  const capabilityRows = roleCode === "admin_pastor"
    ? [
        ["team.read", "branch"], ["area.read", "branch"],
        ["team.manage", "branch"], ["area.manage", "branch"],
        ["staff.directory.read", "branch"],
      ]
    : roleCode === "coordinator"
      ? [
          ["team.read", "branch"], ["area.read", "branch"],
          ["staff.directory.read", "branch"], ["contacts.read", "branch"],
          ["contacts.interaction.create", "branch"],
        ]
      : [["team.read", "team"], ["area.read", "team"]];
  const staff = {
    id: STAFF_PROFILE_ID,
    auth_user_id: AUTH_USER_ID,
    full_name: "Test Staff",
    email: "staff@example.com",
    account_status: "active",
    must_change_password: 0,
    password_setup_expires_at: null,
  };
  let writes = 0;

  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.push({ kind: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM staff_profile") && this.sql.includes("WHERE auth_user_id = ?")) return staff;
          if (this.sql.includes("SELECT id FROM contact") && this.sql.includes("contact_status <> 'merged'")) {
            return this.values[0] === CONTACT_ID && this.values[1] === BRANCH_ID ? { id: CONTACT_ID } : null;
          }
          if (this.sql.includes("SELECT ca.team_id") && this.sql.includes("FROM contact_assignment ca")) return null;
          if (this.sql.includes("FROM contact c") && this.sql.includes("SELECT c.id")) {
            return {
              id: CONTACT_ID,
              branch_id: BRANCH_ID,
              first_name: "Ama",
              last_name: "Mensah",
              preferred_name: null,
              phone_e164: null,
              email_normalized: null,
              age_range: null,
              preferred_language: null,
              contact_status: "active",
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            };
          }
          if (this.sql.includes("FROM contact_interaction") && this.sql.includes("SELECT id, interaction_type")) {
            return {
              id: this.values[0],
              interaction_type: "call",
              occurred_at: "2026-11-21T12:00:00.000Z",
              outcome_code: "answered",
              summary: "Spoke with visitor",
              next_action_at: null,
              created_at: "2026-11-21T12:00:01.000Z",
            };
          }
          if (this.sql.includes("JOIN branch b") && this.sql.includes("JOIN role_capability rc")) {
            const requestedCapability = this.values[2];
            const grant = capabilityRows.find(([code]) => code === requestedCapability);
            return grant ? { scope_mode: grant[1], sensitivity: "restricted" } : null;
          }
          return null;
        },
        async all() {
          calls.push({ kind: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT DISTINCT b.id, b.name, b.timezone")) {
            return { results: [{ id: BRANCH_ID, name: "Main Branch", timezone: "Africa/Accra" }] };
          }
          if (this.sql.includes("SELECT DISTINCT r.id AS role_id")) {
            return { results: [{
              role_id: "role-" + roleCode,
              code: roleCode,
              name: roleCode,
              branch_id: BRANCH_ID,
            }] };
          }
          if (this.sql.includes("SELECT DISTINCT c.code, rc.scope_mode")) {
            return { results: capabilityRows.map(([code, scope_mode]) => ({ code, scope_mode, branch_id: BRANCH_ID })) };
          }
          if (this.sql.includes("role_code, c.code AS capability_code")) {
            return { results: capabilityRows.map(([capability_code, scope_mode]) => ({
              role_code: roleCode, capability_code, scope_mode, sensitivity: "restricted",
            })) };
          }
          if (this.sql.includes("FROM team t")) {
            const branchRead = this.values[1] === 1;
            return { results: branchRead ? teamRows : teamRows.filter((team) => team.id === OWN_TEAM_ID) };
          }
          if (this.sql.includes("FROM staff_team_membership stm")) {
            const branchRead = this.values[3] === 1;
            return { results: branchRead ? membershipRows : membershipRows.filter((membership) => membership.team_id === OWN_TEAM_ID) };
          }
          if (this.sql.includes("FROM service_area sa")) {
            const branchRead = this.values[1] === 1;
            return { results: branchRead ? areaRows : areaRows.filter((area) => area.id === OWN_AREA_ID) };
          }
          if (this.sql.includes("FROM staff_area_coverage")) {
            const branchRead = this.values.includes(1);
            return { results: branchRead ? coverageRows : coverageRows.filter((coverage) => coverage.service_area_id === OWN_AREA_ID) };
          }
          if (this.sql.includes("SELECT id, full_name, account_status")) {
            const requested = new Set(this.values.map(String));
            return { results: profiles.filter((profile) => requested.has(profile.id)) };
          }
          return { results: [] };
        },
        async run() {
          calls.push({ kind: "run", sql: this.sql, values: this.values });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      writes += statements.length;
      calls.push({ kind: "batch", statements: statements.length });
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };

  return {
    calls,
    get writes() { return writes; },
    env: {
      DB,
      APP_ENV: "non-production",
      APP_ALLOWED_ORIGINS: "https://preview.example, http://localhost:5173",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    },
  };
}

function authenticatedDirectoryRequest(path) {
  return new Request("https://worker.example" + path, {
    headers: {
      Authorization: "Bearer verified-test-token",
      "X-Branch-Id": BRANCH_ID,
    },
  });
}

test("Team Leader directory reads return only own-team data and omit staff identities", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const { env, calls } = authorizedDirectoryEnv("team_leader");

  const teamsResponse = await worker.fetch(
    authenticatedDirectoryRequest("/api/v1/teams?branch_id=" + BRANCH_ID),
    env,
  );
  const teamsPayload = await teamsResponse.json();
  assert.equal(teamsResponse.status, 200);
  assert.deepEqual(teamsPayload.data.teams.map((team) => team.id), [OWN_TEAM_ID]);
  assert.equal(teamsPayload.data.teams[0].member_count, 1);
  assert.deepEqual(teamsPayload.data.teams[0].members, []);
  assert.doesNotMatch(JSON.stringify(teamsPayload), /Assigned Worker|Other Worker/);

  const areasResponse = await worker.fetch(
    authenticatedDirectoryRequest("/api/v1/areas?branch_id=" + BRANCH_ID),
    env,
  );
  const areasPayload = await areasResponse.json();
  assert.equal(areasResponse.status, 200);
  assert.deepEqual(areasPayload.data.areas.map((area) => area.id), [OWN_AREA_ID]);
  assert.equal(areasPayload.data.areas[0].coverage_count, 1);
  assert.deepEqual(areasPayload.data.areas[0].coverage, []);
  assert.ok(calls.some((call) => call.kind === "all" && call.sql.includes("actor_membership.membership_role = 'leader'")));
});

test("Coordinator can read the branch directory and staff names, but cannot manage teams", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("coordinator");

  const teamsResponse = await worker.fetch(
    authenticatedDirectoryRequest("/api/v1/teams?branch_id=" + BRANCH_ID),
    fixture.env,
  );
  const teamsPayload = await teamsResponse.json();
  assert.equal(teamsResponse.status, 200);
  assert.deepEqual(
    teamsPayload.data.teams.map((team) => team.id).sort(),
    [OWN_TEAM_ID, OTHER_TEAM_ID].sort(),
  );
  assert.ok(teamsPayload.data.teams.some((team) =>
    team.members.some((member) => member.staff?.full_name === "Assigned Worker")
  ));

  const createResponse = await worker.fetch(new Request("https://worker.example/api/v1/teams", {
    method: "POST",
    headers: { Authorization: "Bearer verified-test-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
    body: JSON.stringify({ branch_id: BRANCH_ID, name: "Must Not Create", description: null }),
  }), fixture.env);
  const createPayload = await createResponse.json();
  assert.equal(createResponse.status, 403);
  assert.equal(createPayload.error.code, "CAPABILITY_DENIED");
  assert.equal(fixture.writes, 0);
});

test("Admin/Pastor with branch management grant can create a team and writes audit in the same D1 batch", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("admin_pastor");
  const response = await worker.fetch(new Request("https://worker.example/api/v1/teams", {
    method: "POST",
    headers: { Authorization: "Bearer verified-test-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
    body: JSON.stringify({ branch_id: BRANCH_ID, name: "New Team", description: "Managed by Admin/Pastor" }),
  }), fixture.env);
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.data.name, "New Team");
  assert.equal(fixture.writes, 2);
});

test("Coordinator contact detail read uses the branch-scoped Worker projection and redacts restricted identity", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const { env } = authorizedDirectoryEnv("coordinator");
  const response = await worker.fetch(
    authenticatedDirectoryRequest("/api/v1/contacts/" + CONTACT_ID + "?branch_id=" + BRANCH_ID),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.id, CONTACT_ID);
  assert.equal(payload.data.branch_id, BRANCH_ID);
  assert.equal(payload.data.first_name, "Ama");
  assert.equal(payload.data.identity_redacted, true);
  assert.equal(payload.data.phone_e164, null);
  assert.equal(payload.data.email_normalized, null);
  assert.equal(payload.contact, undefined);
});

test("Coordinator can record a scoped contact interaction through the D1 Worker", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("coordinator");
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/contacts/" + CONTACT_ID + "/interactions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interaction_type: "call",
        occurred_at: "2026-11-21T12:00:00.000Z",
        outcome_code: "answered",
        summary: "Spoke with visitor",
      }),
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.data.interaction_type, "call");
  assert.equal(payload.data.outcome_code, "answered");
  assert.ok(fixture.calls.some((call) =>
    call.kind === "run" && call.sql.includes("INSERT INTO contact_interaction")
  ));
});

test("Prayer Intercessor cannot write visitor contact interactions", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("prayer_intercessor");
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/contacts/" + CONTACT_ID + "/interactions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interaction_type: "call",
        summary: "Must not be stored",
      }),
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "CAPABILITY_DENIED");
  assert.equal(
    fixture.calls.some((call) => call.kind === "run" || call.kind === "batch"),
    false,
  );
});

test("contact detail reads fail closed when no active branch is selected", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("coordinator");
  const response = await worker.fetch(new Request("https://worker.example/api/v1/contacts/" + CONTACT_ID, {
    headers: { Authorization: "Bearer verified-test-token" },
  }), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "BRANCH_REQUIRED");
  assert.equal(
    fixture.calls.some((call) => call.sql.includes("SELECT id FROM contact WHERE id = ?")),
    false,
  );
});

test("returns a stable 404 envelope for an unimplemented route", async () => {
  const { env } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/not-yet-implemented"), env);
  const payload = await response.json();
  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "ROUTE_NOT_FOUND");
  assert.ok(payload.request_id);
});
