import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

function fakeEnv(options = {}) {
  const calls = [];
  const row = Object.hasOwn(options, "meta") ? options.meta : { schema_version: 44, environment: "non-production" };
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
      BETTER_AUTH_SECRET: "integration-test-secret-that-is-long-enough-123456",
      BETTER_AUTH_URL: "https://worker.example",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://preview.example",
      APP_ALLOWED_ORIGINS: "https://preview.example, http://localhost:5173",
      BETTER_AUTH_SECRET: "integration-test-secret-that-is-long-enough-123456",
      BETTER_AUTH_URL: "https://worker.example",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://preview.example",
      __TEST_SESSION_RESOLVER: async (request) => request.headers.has("Cookie")
        ? { user: { id: AUTH_USER_ID, email: "staff@example.com" } } : null,
      SUPABASE_URL: "https://example.supabase.co",
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
  assert.equal(payload.schema_version, 44);
  assert.ok(payload.request_id);
  assert.equal(calls.length, 1);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("health fails closed if D1 is marked as production", async () => {
  const { env } = fakeEnv({ meta: { schema_version: 44, environment: "production" } });
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.state, "database_not_initialized");
});

test("health accepts a production D1 marker only for a production Worker environment", async () => {
  const { env } = fakeEnv({ meta: { schema_version: 44, environment: "production" } });
  env.APP_ENV = "production";
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.environment, "production");
  assert.equal(payload.schema_version, 44);
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

test("rejects protected staff context without a Better Auth cookie before querying D1", async () => {
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
  const batches = [];
  const resetRequest = { id: "90000000-0000-4000-8000-000000000002", target_profile_id: COVERED_STAFF_ID, branch_id: BRANCH_ID, status: "pending", expires_at: "2099-01-01T00:00:00.000Z", auth_user_id: "10000000-0000-4000-8000-000000000002", email: "reset-target@example.test" };
  let followupTaskStatus = "open";
  let calendarEntryRow = null;
  let announcementRow = null;
  let eventRow = { id: "40000000-0000-4000-8000-000000000001", branch_id: BRANCH_ID, title: "Missions Conference", starts_at: "2026-12-01T09:00:00.000Z", ends_at: "2026-12-01T17:00:00.000Z", status: "draft", visibility: "private", registration_state: "closed", capacity: 100 };
  let eventStaffAssignment = null;
  let eventTeamAssignment = null;

  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.push({ kind: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM calendar_entry")) return calendarEntryRow;
          if (this.sql.includes("SELECT req.id, req.target_profile_id") && this.sql.includes("FROM staff_password_reset_request")) return resetRequest;
          if (this.sql.includes("SELECT id,branch_id,title,starts_at,ends_at,status") && this.sql.includes("FROM event")) return eventRow;
          if (this.sql.includes("SELECT id,account_status FROM staff_profile")) return { id: STAFF_PROFILE_ID, account_status: "active" };
          if (this.sql.includes("SELECT sra.id FROM staff_role_assignment")) return { id: "active-role-assignment" };
          if (this.sql.includes("SELECT id FROM team WHERE id=?")) return this.values[0] === OWN_TEAM_ID ? { id: OWN_TEAM_ID } : null;
          if (this.sql.includes("SELECT id,event_id,branch_id,starts_at,ends_at,revoked_at FROM event_staff_assignment")) return eventStaffAssignment;
          if (this.sql.includes("SELECT id,event_id,branch_id,starts_at,ends_at,revoked_at FROM event_team_assignment")) return eventTeamAssignment;
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
          if (this.sql.includes("FROM event_staff_assignment a")) return { results: eventStaffAssignment ? [eventStaffAssignment] : [] };
          if (this.sql.includes("FROM event_team_assignment a")) return { results: eventTeamAssignment ? [eventTeamAssignment] : [] };
          if (this.sql.includes("SELECT DISTINCT sp.auth_user_id,sp.full_name")) return { results: [{ auth_user_id: AUTH_USER_ID, full_name: "Test Staff" }] };
          if (this.sql.includes("SELECT id,name FROM team WHERE branch_id")) return { results: [{ id: OWN_TEAM_ID, name: "Welcome Team" }] };
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
          if (this.sql.includes("INSERT INTO event_staff_assignment")) {
            const [id,event_id,branch_id,staff_auth_user_id,assignment_role,assigned_by,starts_at,ends_at,created_at] = this.values;
            eventStaffAssignment = { id,event_id,branch_id,staff_auth_user_id,assignment_role,starts_at,ends_at,revoked_at:null,created_at };
          } else if (this.sql.includes("INSERT INTO event_team_assignment")) {
            const [id,event_id,branch_id,team_id,assignment_role,assigned_by,starts_at,ends_at,created_at] = this.values;
            eventTeamAssignment = { id,event_id,branch_id,team_id,assignment_role,starts_at,ends_at,revoked_at:null,created_at };
          } else if (this.sql.includes("UPDATE event_staff_assignment SET revoked_at")) {
            eventStaffAssignment = { ...eventStaffAssignment, revoked_at: this.values[0] };
          } else if (this.sql.includes("UPDATE event_team_assignment SET revoked_at")) {
            eventTeamAssignment = { ...eventTeamAssignment, revoked_at: this.values[0] };
          } else if (this.sql.includes("INSERT INTO calendar_entry")) {
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
      batches.push(statements.map((statement) => ({ sql: statement.sql, values: statement.values })));
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
    batches,
    get writes() { return writes; },
    env: {
      DB,
      APP_ENV: "non-production",
      APP_ALLOWED_ORIGINS: "https://preview.example, http://localhost:5173",
      BETTER_AUTH_SECRET: "integration-test-secret-that-is-long-enough-123456",
      BETTER_AUTH_URL: "https://worker.example",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://preview.example",
      __TEST_SESSION_RESOLVER: async (request) => request.headers.has("Cookie")
        ? { user: { id: AUTH_USER_ID, email: "staff@example.com" } }
        : null,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-synthetic-secret",
    },
  };
}

function authenticatedDirectoryRequest(path) {
  return new Request("https://worker.example" + path, {
    headers: {
      Cookie: "better-auth.session_token=verified-test-token",
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
      Cookie: "better-auth.session_token=verified-test-token",
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
  assert.equal(created.data.is_public, false);
  assert.equal(created.data.branch_id, BRANCH_ID);
  const insert = fixture.calls.find((call) => call.kind === "run" && call.sql.includes("INSERT INTO announcement"));
  assert.ok(insert);
  assert.match(insert.sql, /'branch',0,'draft',NULL,NULL/);

  const update = await worker.fetch(new Request(
    "https://worker.example/api/v1/announcements/" + created.data.id + "?branch_id=" + BRANCH_ID,
    {
      method: "PATCH",
      headers: {
        Cookie: "better-auth.session_token=verified-test-token",
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
      Cookie: "better-auth.session_token=verified-test-token",
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
      Cookie: "better-auth.session_token=verified-test-token",
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
        Cookie: "better-auth.session_token=verified-test-token",
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
      Cookie: "better-auth.session_token=verified-test-token",
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
          Cookie: "better-auth.session_token=verified-test-token",
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
    headers: { Cookie: "better-auth.session_token=verified-test-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
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
    headers: { Cookie: "better-auth.session_token=verified-test-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
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
        Cookie: "better-auth.session_token=verified-test-token",
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
        Cookie: "better-auth.session_token=verified-test-token",
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
      Cookie: "better-auth.session_token=verified-test-token",
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
        Cookie: "better-auth.session_token=verified-test-token",
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
        Cookie: "better-auth.session_token=verified-test-token",
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
        Cookie: "better-auth.session_token=verified-test-token",
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
        Cookie: "better-auth.session_token=verified-test-token",
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
      Cookie: "better-auth.session_token=verified-test-token",
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
        Cookie: "better-auth.session_token=verified-test-token",
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
        Cookie: "better-auth.session_token=verified-test-token",
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
    headers: { Cookie: "better-auth.session_token=verified-test-token" },
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



test("event draft CRUD and flyer routes reject anonymous access before D1 writes", async () => {
  const { env, calls } = fakeEnv();
  const branch = "30000000-0000-4000-8000-000000000001";
  const event = "40000000-0000-4000-8000-000000000001";
  const requests = [
    new Request(`https://worker.example/api/v1/events?branch_id=${branch}`),
    new Request("https://worker.example/api/v1/events", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Branch-Id": branch },
      body: JSON.stringify({ branch_id: branch, title: "Outreach", starts_at: "2026-11-29T08:00:00Z", ends_at: "2026-11-29T10:00:00Z", timezone: "Africa/Accra" }),
    }),
    new Request(`https://worker.example/api/v1/events/${event}?branch_id=${branch}`),
    new Request(`https://worker.example/api/v1/events/${event}?branch_id=${branch}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Updated outreach" }),
    }),
    new Request(`https://worker.example/api/v1/events/${event}/cancel?branch_id=${branch}`, { method: "POST" }),
    new Request(`https://worker.example/api/v1/events/${event}/flyer?branch_id=${branch}`),
    new Request(`https://worker.example/api/v1/events/${event}/flyer?branch_id=${branch}`, { method: "POST" }),
  ];
  for (const request of requests) {
    const response = await worker.fetch(request, env);
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "UNAUTHENTICATED");
  }
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


test("password change and admin reset endpoints reject anonymous requests before database access", async () => {
  const { env, calls } = fakeEnv();
  const change = await worker.fetch(new Request("https://worker.example/api/v1/auth/password/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "A-strong-New-Password-2026!" }),
  }), env);
  const changePayload = await change.json();
  assert.equal(change.status, 401);
  assert.equal(changePayload.error.code, "UNAUTHENTICATED");

  const list = await worker.fetch(new Request("https://worker.example/api/v1/admin/password-reset-requests?branch_id=30000000-0000-4000-8000-000000000001"), env);
  const listPayload = await list.json();
  assert.equal(list.status, 401);
  assert.equal(listPayload.error.code, "UNAUTHENTICATED");
  assert.equal(calls.length, 0);
});

test("Admin/Pastor can load event assignment workspace, assign staff and teams, and revoke assignments", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ id: AUTH_USER_ID, email: "staff@example.com" }),
  );
  const fixture = authorizedDirectoryEnv("admin_pastor", [["events.manage", "branch"]]);
  const eventId = "40000000-0000-4000-8000-000000000001";
  const workspace = await worker.fetch(authenticatedDirectoryRequest("/api/v1/events/" + eventId + "/assignments?branch_id=" + BRANCH_ID), fixture.env);
  assert.equal(workspace.status, 200);
  const workspaceBody = await workspace.json();
  assert.equal(workspaceBody.ok, true);
  assert.equal(workspaceBody.data.staff_candidates[0].auth_user_id, AUTH_USER_ID);
  assert.equal(workspaceBody.data.team_candidates[0].id, OWN_TEAM_ID);

  const staffStart = "2026-12-01T10:00:00.000Z";
  const staffEnd = "2026-12-01T12:00:00.000Z";
  const staffResponse = await worker.fetch(new Request(
    "https://worker.example/api/v1/events/" + eventId + "/staff-assignments?branch_id=" + BRANCH_ID,
    {
      method: "POST",
      headers: { Cookie: "better-auth.session_token=verified-test-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ staff_auth_user_id: AUTH_USER_ID, assignment_role: "checkin", starts_at: staffStart, ends_at: staffEnd }),
    },
  ), fixture.env);
  assert.equal(staffResponse.status, 201);
  const staffBody = await staffResponse.json();
  assert.equal(staffBody.data.staff_auth_user_id, AUTH_USER_ID);
  assert.equal(staffBody.data.assignment_role, "checkin");
  assert.equal(staffBody.data.ends_at, staffEnd);

  const teamResponse = await worker.fetch(new Request(
    "https://worker.example/api/v1/events/" + eventId + "/team-assignments?branch_id=" + BRANCH_ID,
    {
      method: "POST",
      headers: { Cookie: "better-auth.session_token=verified-test-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: OWN_TEAM_ID, assignment_role: "ushering", starts_at: staffStart, ends_at: staffEnd }),
    },
  ), fixture.env);
  assert.equal(teamResponse.status, 201);
  const teamBody = await teamResponse.json();
  assert.equal(teamBody.data.team_id, OWN_TEAM_ID);
  assert.equal(teamBody.data.assignment_role, "ushering");

  const revoke = await worker.fetch(new Request(
    "https://worker.example/api/v1/events/" + eventId + "/staff-assignments/" + staffBody.data.id + "/revoke?branch_id=" + BRANCH_ID,
    { method: "POST", headers: { Cookie: "better-auth.session_token=verified-test-token", "X-Branch-Id": BRANCH_ID } },
  ), fixture.env);
  assert.equal(revoke.status, 200);
  const revokeBody = await revoke.json();
  assert.equal(revokeBody.already_revoked, false);
  assert.ok(revokeBody.data.revoked_at);
});

test("non-admin staff cannot manage event assignment workspace or create assignments", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ id: AUTH_USER_ID, email: "staff@example.com" }),
  );
  const fixture = authorizedDirectoryEnv("field_worker");
  const eventId = "40000000-0000-4000-8000-000000000001";
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/events/" + eventId + "/team-assignments?branch_id=" + BRANCH_ID,
    {
      method: "POST",
      headers: { Cookie: "better-auth.session_token=verified-test-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: OWN_TEAM_ID, assignment_role: "ushering", starts_at: "2026-12-01T10:00:00.000Z" }),
    },
  ), fixture.env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "CAPABILITY_DENIED");
});


test("Admin/Pastor approval rotates the D1 credential, revokes sessions and returns a one-time password", async () => {
  const fixture = authorizedDirectoryEnv("admin_pastor", [["staff.password_reset.manage", "branch"]]);
  const resetId = "90000000-0000-4000-8000-000000000002";
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/admin/password-reset-requests/" + resetId + "/approve",
    {
      method: "POST",
      headers: { Cookie: "better-auth.session_token=synthetic-admin-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ branch_id: BRANCH_ID, reason: "Verified the staff member through a direct call" }),
    },
  ), fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.status, "approved");
  assert.equal(payload.data.temporary_password_sent, false);
  assert.equal(payload.data.manual_handoff_required, true);
  assert.equal(payload.data.must_change_password, true);
  assert.equal(payload.data.password_expires_in_hours, 24);
  assert.match(payload.data.temporary_password, /[A-Z]/);
  assert.match(payload.data.temporary_password, /[a-z]/);
  assert.match(payload.data.temporary_password, /[0-9]/);

  assert.equal(fixture.batches.length, 2);
  assert.match(fixture.batches[0][0].sql, /UPDATE account SET password=/);
  assert.match(fixture.batches[0][1].sql, /DELETE FROM session/);
  assert.match(fixture.batches[1][0].sql, /UPDATE staff_profile/);
  assert.match(fixture.batches[1][1].sql, /UPDATE staff_password_reset_request/);
  assert.match(fixture.batches[1][2].sql, /INSERT INTO staff_password_reset_audit/);
  assert.equal(JSON.stringify(fixture.batches).includes(payload.data.temporary_password), false);
});

test("Admin/Pastor denial records a reason without changing the D1 credential", async () => {
  const fixture = authorizedDirectoryEnv("admin_pastor", [["staff.password_reset.manage", "branch"]]);
  const resetId = "90000000-0000-4000-8000-000000000002";
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/admin/password-reset-requests/" + resetId + "/deny",
    {
      method: "POST",
      headers: { Cookie: "better-auth.session_token=synthetic-admin-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ branch_id: BRANCH_ID, reason: "The request could not be independently verified" }),
    },
  ), fixture.env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { status: "denied" });
  assert.equal(fixture.batches.length, 1);
  assert.equal(fixture.batches.flat().some((statement) => /UPDATE account SET password=/.test(statement.sql)), false);
  assert.match(fixture.batches[0][0].sql, /status = 'denied'/);
  assert.match(fixture.batches[0][1].sql, /INSERT INTO staff_password_reset_audit/);
  assert.match(fixture.batches[0][1].values.join(" "), /The request could not be independently verified/);
});


test("public password reset is non-enumerating and records only eligible active staff requests", async () => {
  const unknown = fakeEnv();
  const known = fakeEnv();
  unknown.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-synthetic-secret";
  known.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-synthetic-secret";
  const originalPrepare = known.env.DB.prepare.bind(known.env.DB);
  const writes = [];
  const originalBatch = known.env.DB.batch.bind(known.env.DB);
  known.env.DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    statement.sql = sql;
    if (sql.includes("SELECT sp.id AS profile_id, sra.branch_id")) {
      statement.first = async () => ({ profile_id: "20000000-0000-4000-8000-000000000002", branch_id: "30000000-0000-4000-8000-000000000001" });
    }
    return statement;
  };
  known.env.DB.batch = async (statements) => {
    writes.push(...statements.map((statement) => ({ sql: statement.sql, values: statement.values })));
    return originalBatch(statements);
  };
  const send = (env, email) => worker.fetch(new Request("https://worker.example/api/v1/auth/password-reset-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.10" },
    body: JSON.stringify({ email }),
  }), env);
  const unknownResponse = await send(unknown.env, "unknown@example.test");
  const knownResponse = await send(known.env, " STAFF@EXAMPLE.TEST ");
  const unknownBody = await unknownResponse.json();
  const knownBody = await knownResponse.json();
  assert.equal(unknownResponse.status, 200);
  assert.equal(knownResponse.status, 200);
  assert.equal(knownBody.ok, unknownBody.ok);
  assert.equal(knownBody.message, unknownBody.message);
  assert.notEqual(knownBody.request_id, unknownBody.request_id);
  assert.equal(JSON.stringify(knownBody).includes("staff@example.test"), false);
  assert.equal(writes.length, 2);
  assert.match(writes[0].sql, /INSERT INTO staff_password_reset_request/);
  assert.match(writes[1].sql, /INSERT INTO staff_password_reset_audit/);
  assert.equal(writes.some((write) => JSON.stringify(write.values ?? []).includes("STAFF@EXAMPLE.TEST")), false);
});

test("password change rotates the D1 credential before clearing the forced-change gate", async () => {
  const fixture = fakeEnv();
  fixture.env.__TEST_SESSION_RESOLVER = async () => ({ user: { id: AUTH_USER_ID, email: "staff@example.com" } });
  const originalPrepare = fixture.env.DB.prepare.bind(fixture.env.DB);
  const batches = [];
  fixture.env.DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    statement.sql = sql;
    if (sql.includes("SELECT id, account_status, must_change_password, password_setup_expires_at")) {
      statement.first = async () => ({
        id: "20000000-0000-4000-8000-000000000002",
        account_status: "active",
        must_change_password: 1,
        password_setup_expires_at: "2099-01-01T00:00:00.000Z",
      });
    }
    return statement;
  };
  fixture.env.DB.batch = async (statements) => {
    batches.push(statements.map((statement) => ({ sql: statement.sql, values: statement.values })));
    return statements.map(() => ({ success: true, meta: { changes: 1 } }));
  };
  const response = await worker.fetch(new Request("https://worker.example/api/v1/auth/password/change", {
    method: "POST",
    headers: { Cookie: "better-auth.session_token=synthetic-staff-token", "Content-Type": "application/json" },
    body: JSON.stringify({ password: "A-strong-New-Password-2026!" }),
  }), fixture.env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.data.password_changed, true);
  assert.equal(payload.data.must_change_password, false);
  assert.equal(batches.length, 2);
  assert.match(batches[0][0].sql, /UPDATE account SET password=/);
  assert.match(batches[1][0].sql, /SET must_change_password = 0/);
});

test("expired temporary-password gate blocks Better Auth credential mutation", async () => {
  const fixture = fakeEnv();
  fixture.env.__TEST_SESSION_RESOLVER = async () => ({ user: { id: AUTH_USER_ID, email: "staff@example.com" } });
  const originalPrepare = fixture.env.DB.prepare.bind(fixture.env.DB);
  fixture.env.DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    if (sql.includes("SELECT id, account_status, must_change_password, password_setup_expires_at")) {
      statement.first = async () => ({
        id: "20000000-0000-4000-8000-000000000002",
        account_status: "active",
        must_change_password: 1,
        password_setup_expires_at: "2000-01-01T00:00:00.000Z",
      });
    }
    return statement;
  };
  const response = await worker.fetch(new Request("https://worker.example/api/v1/auth/password/change", {
    method: "POST",
    headers: { Cookie: "better-auth.session_token=synthetic-staff-token", "Content-Type": "application/json" },
    body: JSON.stringify({ password: "A-strong-New-Password-2026!" }),
  }), fixture.env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "PASSWORD_SETUP_EXPIRED");
  assert.equal(fixture.batches?.length ?? 0, 0);
});


test("staff role assignment and Admin/Pastor review endpoints enforce their capabilities", async () => {
  const fixture = authorizedDirectoryEnv("coordinator");
  const headers = {
    Cookie: "better-auth.session_token=verified-test-token",
    "X-Branch-Id": BRANCH_ID,
    "Content-Type": "application/json",
  };
  const assignment = await worker.fetch(new Request("https://worker.example/api/v1/staff/roles", {
    method: "POST",
    headers,
    body: JSON.stringify({
      target_profile_id: COVERED_STAFF_ID,
      role_code: "field_worker",
      starts_at: "2026-11-22T12:00:00.000Z",
      ends_at: null,
      reason: "The ministry appointment was approved.",
    }),
  }), fixture.env);
  const elevationList = await worker.fetch(new Request("https://worker.example/api/v1/staff/role-elevations", { headers }), fixture.env);
  const revocationList = await worker.fetch(new Request("https://worker.example/api/v1/staff/role-revocations", { headers }), fixture.env);

  for (const response of [assignment, elevationList, revocationList]) {
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.error.code, "CAPABILITY_DENIED");
  }
  assert.equal(fixture.batches.length, 0);
  assert.equal(fixture.writes, 0);
});


test("staff directory preserves branch history and exposes active assignment identifiers for role management", async () => {
  const fixture = authorizedDirectoryEnv("admin_pastor");
  const response = await worker.fetch(new Request("https://worker.example/api/v1/staff?limit=50&offset=0", {
    headers: { Cookie: "better-auth.session_token=verified-test-token", "X-Branch-Id": BRANCH_ID },
  }), fixture.env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.data, []);
  const query = fixture.calls.find((call) => call.kind === "all" && call.sql.includes("FROM staff_profile sp") && call.sql.includes("roles_json"));
  assert.ok(query);
  assert.match(query.sql, /json_object\('assignment_id', sra2\.id/);
  const branchHistoryPredicate = query.sql.slice(query.sql.indexOf("WHERE EXISTS"));
  assert.match(branchHistoryPredicate, /sra\.branch_id = \?/);
  assert.doesNotMatch(branchHistoryPredicate, /sra\.revoked_at IS NULL/);
});

test("Admin/Pastor role approval queues return the standard data envelope", async () => {
  const fixture = authorizedDirectoryEnv("admin_pastor", [["staff.role.approve", "branch"]]);
  const headers = { Cookie: "better-auth.session_token=verified-test-token", "X-Branch-Id": BRANCH_ID };
  const elevations = await worker.fetch(new Request("https://worker.example/api/v1/staff/role-elevations", { headers }), fixture.env);
  const revocations = await worker.fetch(new Request("https://worker.example/api/v1/staff/role-revocations", { headers }), fixture.env);
  const elevationPayload = await elevations.json();
  const revocationPayload = await revocations.json();
  assert.equal(elevations.status, 200);
  assert.equal(revocations.status, 200);
  assert.deepEqual(elevationPayload.data, []);
  assert.deepEqual(revocationPayload.data, []);
});
