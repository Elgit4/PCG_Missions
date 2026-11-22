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

test("direct staff account provisioning rejects anonymous requests before database access", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/staff/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      branch_id: "00000000-0000-4000-8000-000000000001",
      full_name: "Test Staff",
      email: "staff@example.test",
      role_code: "field_worker",
      reason: "Create a test staff account",
    }),
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("legacy staff invitation endpoints are permanently disabled", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/staff/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitation_token: "x".repeat(43), password: "not-used" }),
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 410);
  assert.equal(payload.error.code, "STAFF_INVITATIONS_DISABLED");
  assert.equal(calls.length, 0);
});

test("calendar collection reads reject anonymous requests before database access", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/calendar/entries?branch_id=30000000-0000-4000-8000-000000000001"), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("calendar creation rejects anonymous requests before database access", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/calendar/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      branch_id: "30000000-0000-4000-8000-000000000001",
      entry_type: "service",
      title: "Sunday service",
      starts_at: "2026-11-29T09:00:00+00:00",
      ends_at: "2026-11-29T11:00:00+00:00",
    }),
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("calendar detail reads and updates reject anonymous requests before database access", async () => {
  const { env, calls } = fakeEnv();
  const id = "60000000-0000-4000-8000-000000000001";
  const branch = "30000000-0000-4000-8000-000000000001";
  const read = await worker.fetch(new Request(`https://worker.example/api/v1/calendar/entries/${id}?branch_id=${branch}`), env);
  const readPayload = await read.json();
  assert.equal(read.status, 401);
  assert.equal(readPayload.error.code, "UNAUTHENTICATED");
  const update = await worker.fetch(new Request(`https://worker.example/api/v1/calendar/entries/${id}?branch_id=${branch}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Updated service" }),
  }), env);
  const updatePayload = await update.json();
  assert.equal(update.status, 401);
  assert.equal(updatePayload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("team collection reads reject anonymous requests", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/teams?branch_id=00000000-0000-4000-8000-000000000001"), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("service-area collection reads reject anonymous requests", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.example/api/v1/areas?branch_id=00000000-0000-4000-8000-000000000001"), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("follow-up reassignment requires an authenticated staff session", async () => {
  const { env, calls } = fakeEnv();
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/followup/tasks/90000000-0000-4000-8000-000000000002/assign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignee_profile_id: "20000000-0000-4000-8000-000000000002",
        reason: "Rebalance the follow-up workload",
      }),
    },
  ), env);
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

function authorizedDirectoryEnv(roleCode, additionalCapabilities = []) {
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
      : roleCode === "team_leader"
        ? [["team.read", "team"], ["area.read", "team"]]
        : [];
  for (const grant of additionalCapabilities) {
    if (!capabilityRows.some(([code, scope]) => code === grant[0] && scope === grant[1])) {
      capabilityRows.push(grant);
    }
  }
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
  let followupTaskStatus = "open";
  let calendarEntryRow = null;
  let announcementRow = null;

  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.push({ kind: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM calendar_entry")) return calendarEntryRow;
          if (this.sql.includes("FROM announcement")) return announcementRow;
          if (this.sql.includes("SELECT id, branch_id, first_name") && this.sql.includes("FROM contact")) {
            return {
              id: CONTACT_ID,
              branch_id: BRANCH_ID,
              first_name: "Ama",
              last_name: "Mensah",
              preferred_name: null,
              contact_status: "active",
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            };
          }
          if (this.sql.includes("FROM staff_profile") && this.sql.includes("WHERE auth_user_id = ?")) return staff;
          if (this.sql.includes("SELECT id FROM contact") && this.sql.includes("contact_status <> 'merged'")) {
            return this.values[0] === CONTACT_ID && this.values[1] === BRANCH_ID ? { id: CONTACT_ID } : null;
          }
          if (this.sql.includes("SELECT id FROM contact") && this.sql.includes("WHERE id = ? AND branch_id = ?")) {
            return this.values[0] === CONTACT_ID && this.values[1] === BRANCH_ID ? { id: CONTACT_ID } : null;
          }
          if (this.sql.includes("SELECT ca.team_id") && this.sql.includes("FROM contact_assignment ca")) return null;
          if (this.sql.includes("SELECT sp.id AS profile_id, sp.auth_user_id") && this.sql.includes("FROM staff_profile sp")) {
            return { profile_id: STAFF_PROFILE_ID, auth_user_id: AUTH_USER_ID };
          }
          if (this.sql.includes("FROM followup_task") && this.sql.includes("SELECT id, status, team_id, assignee_user_id")) {
            return { id: "90000000-0000-4000-8000-000000000001", status: "open", team_id: null, assignee_user_id: AUTH_USER_ID };
          }
          if (this.sql.includes("FROM followup_task") && this.sql.includes("SELECT id, branch_id, contact_id, assignee_user_id")) {
            return {
              id: "90000000-0000-4000-8000-000000000001",
              branch_id: BRANCH_ID,
              contact_id: CONTACT_ID,
              assignee_user_id: AUTH_USER_ID,
              team_id: null,
              priority: 2,
              due_at: null,
              status: followupTaskStatus,
              task_note: "Follow up with visitor",
              created_at: "2026-11-21T12:00:00.000Z",
              updated_at: "2026-11-21T12:30:00.000Z",
            };
          }
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
          if (this.sql.includes("SELECT id, hex(request_digest) AS digest_hex") && this.sql.includes("FROM followup_task")) {
            return null;
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
          if (this.sql.includes("FROM calendar_entry")) return { results: calendarEntryRow ? [calendarEntryRow] : [] };
          if (this.sql.includes("FROM announcement")) return { results: announcementRow ? [announcementRow] : [] };
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
          if (this.sql.includes("FROM contact_interaction i")) {
            return { results: [{
              id: "90000000-0000-4000-8000-000000000001",
              interaction_type: "call",
              occurred_at: "2026-11-21T12:00:00.000Z",
              outcome_code: "answered",
              summary: "Spoke with visitor",
              next_action_at: null,
              created_at: "2026-11-21T12:00:01.000Z",
            }] };
          }
          return { results: [] };
        },
        async run() {
          calls.push({ kind: "run", sql: this.sql, values: this.values });
          if (this.sql.includes("INSERT INTO calendar_entry")) {
            const [id, branch_id, entry_type, title, starts_at, ends_at, created_by, updated_by, created_at, updated_at] = this.values;
            calendarEntryRow = { id, branch_id, entry_type, title, starts_at, ends_at, scope_type: "branch", created_by, created_at, updated_at };
          } else if (this.sql.includes("UPDATE calendar_entry") && calendarEntryRow) {
            const [entry_type, title, starts_at, ends_at, , updated_at] = this.values;
            calendarEntryRow = { ...calendarEntryRow, entry_type, title, starts_at, ends_at, updated_at };
          } else if (this.sql.includes("INSERT INTO announcement")) {
            const [id, branch_id, title, body, created_by, updated_by, created_at, updated_at] = this.values;
            announcementRow = { id, branch_id, title, body, is_public: 0, status: "draft", created_by, created_at, updated_at };
          } else if (this.sql.includes("UPDATE announcement") && announcementRow) {
            const [title, body, , updated_at] = this.values;
            announcementRow = { ...announcementRow, title, body, updated_at };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      writes += statements.length;
      if (statements.some((statement) => statement.sql.includes("UPDATE followup_task"))) {
        followupTaskStatus = "completed";
      }
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

test("Admin/Pastor can list, create and update branch announcement drafts through D1", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ id: AUTH_USER_ID, email: "staff@example.com" }),
  );
  const fixture = authorizedDirectoryEnv("admin_pastor", [
    ["announcement.read.scoped", "branch"],
    ["announcement.create.scoped", "branch"],
  ]);

  const list = await worker.fetch(
    authenticatedDirectoryRequest("/api/v1/announcements?branch_id=" + BRANCH_ID),
    fixture.env,
  );
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).data, []);

  const create = await worker.fetch(new Request("https://worker.example/api/v1/announcements", {
    method: "POST",
    headers: {
      Authorization: "Bearer verified-test-token",
      "X-Branch-Id": BRANCH_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch_id: BRANCH_ID,
      title: "Sunday service notice",
      body: "The service begins at 9:00 AM.",
    }),
  }), fixture.env);
  const created = await create.json();
  assert.equal(create.status, 201);
  assert.equal(created.data.status, "draft");
  assert.equal(created.data.is_public, 0);
  assert.equal(created.data.branch_id, BRANCH_ID);
  const insert = fixture.calls.find((call) => call.kind === "run" && call.sql.includes("INSERT INTO announcement"));
  assert.ok(insert);
  assert.match(insert.sql, /'branch',0,'draft',NULL,NULL/);

  const update = await worker.fetch(new Request(
    "https://worker.example/api/v1/announcements/" + created.data.id + "?branch_id=" + BRANCH_ID,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Updated Sunday service notice" }),
    },
  ), fixture.env);
  const updated = await update.json();
  assert.equal(update.status, 200);
  assert.equal(updated.data.title, "Updated Sunday service notice");
  const updateStatement = fixture.calls.find((call) => call.kind === "run" && call.sql.includes("UPDATE announcement"));
  assert.ok(updateStatement);
  assert.match(updateStatement.sql, /created_by=\?/);
  assert.match(updateStatement.sql, /updated_at=\?/);
});

test("Field Worker cannot create branch announcement drafts", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ id: AUTH_USER_ID, email: "staff@example.com" }),
  );
  const fixture = authorizedDirectoryEnv("field_worker");
  const response = await worker.fetch(new Request("https://worker.example/api/v1/announcements", {
    method: "POST",
    headers: {
      Authorization: "Bearer verified-test-token",
      "X-Branch-Id": BRANCH_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch_id: BRANCH_ID,
      title: "Must not be created",
      body: "This write should be denied.",
    }),
  }), fixture.env);
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "CAPABILITY_DENIED");
  assert.equal(fixture.calls.some((call) => call.kind === "run" && call.sql.includes("announcement")), false);
});

test("Admin/Pastor can list, create and update branch calendar entries through D1", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("admin_pastor", [
    ["calendar.read.scoped", "branch"],
    ["calendar.manage.scoped", "branch"],
  ]);

  const list = await worker.fetch(
    authenticatedDirectoryRequest("/api/v1/calendar/entries?branch_id=" + BRANCH_ID),
    fixture.env,
  );
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).data, []);
  assert.ok(fixture.calls.some((call) => call.kind === "all" && call.sql.includes("FROM calendar_entry") && call.sql.includes("scope_type = 'branch'")));

  const create = await worker.fetch(new Request("https://worker.example/api/v1/calendar/entries", {
    method: "POST",
    headers: {
      Authorization: "Bearer verified-test-token",
      "X-Branch-Id": BRANCH_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch_id: BRANCH_ID,
      entry_type: "service",
      title: "Sunday service",
      starts_at: "2026-11-29T09:00:00+00:00",
      ends_at: "2026-11-29T11:00:00+00:00",
    }),
  }), fixture.env);
  const created = await create.json();
  assert.equal(create.status, 201);
  assert.equal(created.data.scope_type, "branch");
  assert.equal(created.data.created_by, AUTH_USER_ID);
  const insert = fixture.calls.find((call) => call.kind === "run" && call.sql.includes("INSERT INTO calendar_entry"));
  assert.ok(insert);
  assert.match(insert.sql, /'branch',NULL,NULL,NULL/);

  const update = await worker.fetch(new Request(
    "https://worker.example/api/v1/calendar/entries/" + created.data.id + "?branch_id=" + BRANCH_ID,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Updated Sunday service" }),
    },
  ), fixture.env);
  const updated = await update.json();
  assert.equal(update.status, 200);
  assert.equal(updated.data.title, "Updated Sunday service");
  const updateStatement = fixture.calls.find((call) => call.kind === "run" && call.sql.includes("UPDATE calendar_entry"));
  assert.ok(updateStatement);
  assert.match(updateStatement.sql, /updated_at=\?/);
  assert.match(updateStatement.sql, /updated_by=\?/);
});

test("non-admin roles cannot manage branch calendar entries", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ id: AUTH_USER_ID, email: "staff@example.com" }),
  );
  const fixture = authorizedDirectoryEnv("field_worker");
  const response = await worker.fetch(new Request("https://worker.example/api/v1/calendar/entries", {
    method: "POST",
    headers: {
      Authorization: "Bearer verified-test-token",
      "X-Branch-Id": BRANCH_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      branch_id: BRANCH_ID,
      entry_type: "service",
      title: "Must not be created",
      starts_at: "2026-11-29T09:00:00+00:00",
      ends_at: null,
    }),
  }), fixture.env);
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "CAPABILITY_DENIED");
  assert.equal(fixture.calls.some((call) => call.kind === "run" && call.sql.includes("calendar_entry")), false);
});

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

  const teamQuery = calls.find((call) => call.kind === "all" && call.sql.includes("FROM team t"));
  assert.ok(teamQuery);
  assert.match(teamQuery.sql, /t\.is_active = 1/);

  const teamMembershipQuery = calls.find((call) => call.kind === "all" && call.sql.includes("FROM staff_team_membership stm"));
  assert.ok(teamMembershipQuery);
  assert.match(teamMembershipQuery.sql, /active_team\.is_active = 1/);

  const areaQuery = calls.find((call) => call.kind === "all" && call.sql.includes("FROM service_area sa"));
  assert.ok(areaQuery);
  assert.match(areaQuery.sql, /covered_profile\.account_status = 'active'/);
  assert.match(areaQuery.sql, /covered_profile\.deactivated_at IS NULL/);
  assert.match(areaQuery.sql, /covered_team\.is_active = 1/);

  const coverageQuery = calls.find((call) => call.kind === "all" && call.sql.includes("FROM staff_area_coverage"));
  assert.ok(coverageQuery);
  assert.match(coverageQuery.sql, /covered_team\.is_active = 1/);
});

test("Field Worker, Follow-up Volunteer and Prayer Intercessor cannot read team or service-area directories", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });

  for (const roleCode of ["field_worker", "follow_up_volunteer", "prayer_intercessor"]) {
    const fixture = authorizedDirectoryEnv(roleCode);
    for (const resource of ["teams", "areas"]) {
      const response = await worker.fetch(
        authenticatedDirectoryRequest("/api/v1/" + resource + "?branch_id=" + BRANCH_ID),
        fixture.env,
      );
      const payload = await response.json();
      assert.equal(response.status, 403, roleCode + " must not read " + resource);
      assert.equal(payload.error.code, "CAPABILITY_DENIED");
    }
    assert.equal(
      fixture.calls.some((call) => call.kind === "all" && (
        call.sql.includes("FROM team t") || call.sql.includes("FROM service_area sa")
      )),
      false,
      roleCode + " must be denied before directory queries",
    );
  }
});

test("all five non-admin roles are denied team and service-area management routes", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });

  const mutations = [
    {
      path: "/api/v1/teams",
      body: { branch_id: BRANCH_ID, name: "Must Not Create", description: null },
    },
    {
      path: "/api/v1/areas",
      body: { branch_id: BRANCH_ID, name: "Must Not Create", code: "DENIED" },
    },
    {
      path: "/api/v1/teams/" + OWN_TEAM_ID + "/members?branch_id=" + BRANCH_ID,
      body: { staff_profile_id: COVERED_STAFF_ID, membership_role: "member" },
    },
    {
      path: "/api/v1/areas/" + OWN_AREA_ID + "/coverage?branch_id=" + BRANCH_ID,
      body: { staff_profile_id: COVERED_STAFF_ID },
    },
  ];

  for (const roleCode of [
    "coordinator",
    "team_leader",
    "field_worker",
    "follow_up_volunteer",
    "prayer_intercessor",
  ]) {
    const fixture = authorizedDirectoryEnv(roleCode);
    for (const mutation of mutations) {
      const response = await worker.fetch(new Request("https://worker.example" + mutation.path, {
        method: "POST",
        headers: {
          Authorization: "Bearer verified-test-token",
          "X-Branch-Id": BRANCH_ID,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mutation.body),
      }), fixture.env);
      const payload = await response.json();
      assert.equal(response.status, 403, roleCode + " must not manage " + mutation.path);
      assert.equal(payload.error.code, "CAPABILITY_DENIED");
    }
    assert.equal(fixture.writes, 0, roleCode + " must not write team or service-area records");
    assert.equal(
      fixture.calls.some((call) => call.kind === "batch" || call.kind === "run"),
      false,
      roleCode + " must be denied before any D1 mutation",
    );
  }
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

test("Coordinator updates a scoped contact and receives the redacted D1 projection", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("coordinator", [
    ["contacts.update", "branch"],
    ["contacts.contact_details.read", "branch"],
  ]);
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/contacts/" + CONTACT_ID,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: "Ama",
        email: "ama@example.com",
      }),
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.id, CONTACT_ID);
  assert.equal(payload.data.first_name, "Ama");
  assert.equal(payload.data.identity_redacted, false);
  assert.ok(fixture.calls.some((call) =>
    call.kind === "run" && call.sql.includes("UPDATE contact SET")
  ));
  assert.equal(payload.contact_id, undefined);
});

test("Field Worker without contact-update capability cannot edit a contact", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("field_worker", [["contacts.create", "branch"]]);
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/contacts/" + CONTACT_ID,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ first_name: "Must not be saved" }),
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "CAPABILITY_DENIED");
  assert.equal(
    fixture.calls.some((call) => call.kind === "run" && call.sql.includes("UPDATE contact SET")),
    false,
  );
});

test("Field Worker creates a visitor contact through the idempotent D1 capture route", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("field_worker", [["contacts.create", "branch"]]);
  const response = await worker.fetch(new Request("https://worker.example/api/v1/contacts", {
    method: "POST",
    headers: {
      Authorization: "Bearer verified-test-token",
      "X-Branch-Id": BRANCH_ID,
      "Idempotency-Key": "capture-request-123456",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      first_name: "Ama",
      last_name: "Mensah",
      phone_e164: "+233241234567",
      email: "ama@example.com",
      source_metadata: { device_type: "web" },
    }),
  }), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.data.first_name, "Ama");
  assert.equal(payload.data.branch_id, BRANCH_ID);
  assert.equal(payload.data.identity_redacted, true);
  assert.equal(payload.data.phone_e164, null);
  assert.equal(payload.contact_id, undefined);
  assert.ok(fixture.calls.some((call) => call.kind === "batch" && call.statements === 3));
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

test("Coordinator lists scoped contact interaction history from D1", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("coordinator");
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/contacts/" + CONTACT_ID + "/interactions",
    {
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
      },
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data[0]?.interaction_type, "call");
  assert.equal(payload.data[0]?.summary, "Spoke with visitor");
  const query = fixture.calls.find((call) =>
    call.kind === "all" && call.sql.includes("FROM contact_interaction i")
  );
  assert.ok(query);
  assert.equal(query.values[0], CONTACT_ID);
  assert.equal(query.values[1], BRANCH_ID);
  assert.match(query.sql, /c\.contact_status <> 'merged'/);
  assert.match(query.sql, /LIMIT 100/);
});

test("Prayer Intercessor cannot read visitor contact interaction history", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("prayer_intercessor");
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/contacts/" + CONTACT_ID + "/interactions",
    {
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
      },
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "CAPABILITY_DENIED");
  assert.equal(
    fixture.calls.some((call) => call.kind === "all" && call.sql.includes("FROM contact_interaction i")),
    false,
  );
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

test("Admin/Pastor can create an idempotent branch-scoped follow-up task assigned by Auth user ID", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("admin_pastor", [
    ["followup.read", "branch"],
    ["followup.create", "branch"],
    ["followup.assign", "branch"],
    ["followup.update", "branch"],
  ]);
  const response = await worker.fetch(new Request("https://worker.example/api/v1/followup/tasks", {
    method: "POST",
    headers: {
      Authorization: "Bearer verified-test-token",
      "X-Branch-Id": BRANCH_ID,
      "Idempotency-Key": "request-key-123456",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contact_id: CONTACT_ID,
      assignee_user_id: AUTH_USER_ID,
      priority: 2,
      due_at: null,
      task_note: "Follow up with visitor",
    }),
  }), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.data.id, "90000000-0000-4000-8000-000000000001");
  assert.equal(payload.data.branch_id, BRANCH_ID);
  assert.equal(payload.data.contact_id, CONTACT_ID);
  assert.equal(payload.data.assignee_user_id, AUTH_USER_ID);
  assert.equal(payload.data.status, "open");
  assert.equal(fixture.writes, 3);
  assert.ok(fixture.calls.some((call) => call.kind === "batch" && call.statements === 3));
});

test("Admin/Pastor can update a follow-up task and receive the full updated record", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("admin_pastor", [
    ["followup.read", "branch"],
    ["followup.create", "branch"],
    ["followup.assign", "branch"],
    ["followup.update", "branch"],
  ]);
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/followup/tasks/90000000-0000-4000-8000-000000000001",
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "completed" }),
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.id, "90000000-0000-4000-8000-000000000001");
  assert.equal(payload.data.status, "completed");
  assert.equal(payload.data.assignee_user_id, AUTH_USER_ID);
  assert.equal(fixture.writes, 2);
});

test("Prayer Intercessor cannot update follow-up tasks without the follow-up update grant", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/auth/v1/user");
    return Response.json({ id: AUTH_USER_ID, email: "staff@example.com" });
  });
  const fixture = authorizedDirectoryEnv("prayer_intercessor");
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/followup/tasks/90000000-0000-4000-8000-000000000001",
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer verified-test-token",
        "X-Branch-Id": BRANCH_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "completed" }),
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "CAPABILITY_DENIED");
  assert.equal(fixture.writes, 0);
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


test("ministry report routes reject anonymous reads and submissions before touching D1", async () => {
  const { env, calls } = fakeEnv();
  const read = await worker.fetch(new Request("https://worker.example/api/v1/reports?branch_id=30000000-0000-4000-8000-000000000001"), env);
  const readPayload = await read.json();
  assert.equal(read.status, 401);
  assert.equal(readPayload.error.code, "UNAUTHENTICATED");

  const create = await worker.fetch(new Request("https://worker.example/api/v1/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Branch-Id": "30000000-0000-4000-8000-000000000001" },
    body: JSON.stringify({ branch_id: "30000000-0000-4000-8000-000000000001", report_type: "daily_evangelism", period_start: "2026-11-22", period_end: "2026-11-22" }),
  }), env);
  const createPayload = await create.json();
  assert.equal(create.status, 401);
  assert.equal(createPayload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});



test("event registration, check-in and closeout routes reject anonymous access before D1 writes", async () => {
  const { env, calls } = fakeEnv();
  const branch = "30000000-0000-4000-8000-000000000001";
  const event = "40000000-0000-4000-8000-000000000001";
  const registration = "50000000-0000-4000-8000-000000000001";
  const requests = [
    new Request(`https://worker.example/api/v1/events/${event}/registrations?branch_id=${branch}`),
    new Request(`https://worker.example/api/v1/events/${event}/registrations`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Branch-Id": branch },
      body: JSON.stringify({ idempotency_key: "registration-key-123", attendee_name: "Test Attendee", attendee_phone: null }),
    }),
    new Request(`https://worker.example/api/v1/events/${event}/registrations/${registration}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Branch-Id": branch },
      body: JSON.stringify({ idempotency_key: "checkin-key-123" }),
    }),
    new Request(`https://worker.example/api/v1/events/${event}/closeout?branch_id=${branch}`),
    new Request(`https://worker.example/api/v1/events/${event}/closeout/submit`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Branch-Id": branch },
      body: JSON.stringify({ idempotency_key: "closeout-key-123", summary_notes: null }),
    }),
  ];
  for (const request of requests) {
    const response = await worker.fetch(request, env);
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "UNAUTHENTICATED");
  }
  assert.equal(calls.length, 0);
});

