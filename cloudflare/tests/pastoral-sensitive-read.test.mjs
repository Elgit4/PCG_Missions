import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

const AUTH_ID = "10000000-0000-4000-8000-000000000001";
const PROFILE_ID = "20000000-0000-4000-8000-000000000001";
const BRANCH_ID = "30000000-0000-4000-8000-000000000001";
const PRAYER_ID = "40000000-0000-4000-8000-000000000001";
const CARE_ID = "50000000-0000-4000-8000-000000000001";

function makePastoralEnv(options = {}) {
  const grants = options.grants ?? [];
  const recordExists = options.recordExists !== false;
  const assignmentExists = options.assignmentExists !== false;
  const auditFailure = options.auditFailure === true;
  const batches = [];
  const staff = { id: PROFILE_ID, auth_user_id: AUTH_ID, full_name: "Synthetic Pastoral User", email: "pastoral@example.test", account_status: "active", must_change_password: 0, password_setup_expires_at: null };
  const DB = {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (this.sql.includes("SELECT COUNT(*) AS total") && this.sql.includes("prayer_assignment")) {
            return { total: recordExists && assignmentExists ? 1 : 0 };
          }
          if (this.sql.includes("FROM app_meta")) return { schema_version: 46, environment: "non-production" };
          if (this.sql.includes("FROM staff_profile") && this.sql.includes("WHERE auth_user_id = ?")) return staff;
          return null;
        },
        async all() {
          if (this.sql.includes("SELECT DISTINCT b.id, b.name, b.timezone")) return { results: [{ id: BRANCH_ID, name: "Main Branch", timezone: "Africa/Accra" }] };
          if (this.sql.includes("SELECT DISTINCT r.id AS role_id")) {
            const role = options.roleCode ?? "admin_pastor";
            return { results: [{ role_id: "role-" + role, code: role, name: role, branch_id: BRANCH_ID }] };
          }
          if (this.sql.includes("SELECT DISTINCT c.code, rc.scope_mode")) return { results: grants.map((g) => ({ code: g[0], scope_mode: g[1], branch_id: BRANCH_ID })) };
          if (this.sql.includes("role_code, c.code AS capability_code")) {
            const role = options.roleCode ?? "admin_pastor";
            return { results: grants.map((g) => ({ role_code: role, capability_code: g[0], scope_mode: g[1], sensitivity: "highly_restricted" })) };
          }
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
    async batch(statements) {
      batches.push(statements.map((s) => ({ sql: s.sql, values: s.values })));
      return statements.map((s) => {
        if (auditFailure && (s.sql.includes("INSERT INTO prayer_access_audit") || s.sql.includes("INSERT INTO care_access_audit"))) {
          return { success: false, meta: { changes: 0 } };
        }
        if (s.sql.includes("SELECT p.id, p.branch_id, p.request_text") ||
            s.sql.includes("SELECT prayer_request.id, prayer_request.request_text")) {
          const allowed = recordExists && assignmentExists;
          return { success: true, results: allowed ? [{
            id: PRAYER_ID, branch_id: BRANCH_ID, request_text: "Synthetic prayer narrative",
            status: "assigned", sensitivity: "highly_restricted", expires_at: null,
            answered_at: null, created_at: "2026-11-20T08:00:00.000Z",
            updated_at: "2026-11-20T08:00:00.000Z",
            assignment_starts_at: "2026-11-20T08:00:00.000Z", assignment_ends_at: null,
          }] : [] };
        }
        if (s.sql.includes("SELECT cr.id, cr.branch_id, cr.status")) {
          const allowed = recordExists && (!s.sql.includes("EXISTS (SELECT 1 FROM care_assignment") || assignmentExists);
          return { success: true, results: allowed ? [{ id: CARE_ID, branch_id: BRANCH_ID, status: "active", reviewed_at: null, created_at: "2026-11-19T08:00:00.000Z", updated_at: "2026-11-20T08:00:00.000Z" }] : [] };
        }
        if (s.sql.includes("FROM care_interaction ci")) return { success: true, results: recordExists ? [{ id: "60000000-0000-4000-8000-000000000001", interaction_type: "visit", outcome_code: "completed", restricted_note: "Synthetic restricted note", occurred_at: "2026-11-20T10:00:00.000Z" }] : [] };
        const needsAssignment = s.sql.includes("prayer_assignment") || s.sql.includes("EXISTS (SELECT 1 FROM care_assignment");
        return { success: true, meta: { changes: recordExists && (!needsAssignment || assignmentExists) ? 1 : 0 } };
      });
    },
  };
  return { env: {
    DB, APP_ENV: "non-production", APP_ALLOWED_ORIGINS: "https://preview.example",
    BETTER_AUTH_SECRET: "integration-test-secret-that-is-long-enough-123456",
    BETTER_AUTH_URL: "https://worker.example",
    BETTER_AUTH_TRUSTED_ORIGINS: "https://preview.example",
    __TEST_SESSION_RESOLVER: async (request) => request.headers.has("Cookie")
      ? { user: { id: AUTH_ID, email: "pastoral@example.test" } } : null,
  }, batches };
}

function makeRequest(path, body) {
  return new Request("https://worker.example" + path, {
    method: "POST",
    headers: { Cookie: "better-auth.session_token=synthetic-pastoral-session", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
test("assigned Prayer inbox uses the canonical assigned grant and does not require a legacy share", async () => {
  const f = makePastoralEnv({
    roleCode: "prayer_intercessor",
    grants: [["prayer.request.read.assigned", "assigned"]],
    assignmentExists: true,
  });
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/pastoral/prayer/assigned?limit=25&offset=0",
    { headers: { Cookie: "better-auth.session_token=synthetic-pastoral-session", "X-Branch-Id": BRANCH_ID } },
  ), f.env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.requests.length, 1);
  assert.equal(body.data.total, 1);
  assert.equal(body.data.requests[0].assignment_starts_at, "2026-11-20T08:00:00.000Z");
  assert.equal(body.data.requests[0].assignment_ends_at, null);
  assert.equal(f.batches.length, 1);
  assert.ok(f.batches[0].every((statement) => !statement.sql.includes("staff_record_share")));
  assert.ok(f.batches[0].some((statement) =>
    statement.sql.includes("prayer.request.read.assigned") && statement.sql.includes("scope_mode = 'assigned'")));
});

test("assigned Prayer inbox fails closed without the assigned-read capability", async () => {
  const f = makePastoralEnv({ roleCode: "prayer_intercessor", grants: [] });
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/pastoral/prayer/assigned",
    { headers: { Cookie: "better-auth.session_token=synthetic-pastoral-session", "X-Branch-Id": BRANCH_ID } },
  ), f.env);
  assert.equal(response.status, 403);
  assert.equal(f.batches.length, 0);
});

test("assigned Prayer inbox rejects a duplicate branch query parameter", async () => {
  const f = makePastoralEnv({
    roleCode: "prayer_intercessor",
    grants: [["prayer.request.read.assigned", "assigned"]],
  });
  const response = await worker.fetch(new Request(
    "https://worker.example/api/v1/pastoral/prayer/assigned?branch_id=" + BRANCH_ID,
    { headers: { Cookie: "better-auth.session_token=synthetic-pastoral-session", "X-Branch-Id": BRANCH_ID } },
  ), f.env);
  assert.equal(response.status, 400);
  assert.equal(f.batches.length, 0);
});

test("assigned prayer read audits before returning the allowlisted narrative", async (t) => {
  const f = makePastoralEnv({ roleCode: "prayer_intercessor", grants: [["prayer.request.read.assigned", "assigned"]], assignmentExists: true });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/prayer/requests/" + PRAYER_ID + "/read", { branch_id: BRANCH_ID, access_mode: "assigned" }), f.env);
  const p = await r.json();
  assert.equal(r.status, 200);
  assert.equal(p.data.request.request_text, "Synthetic prayer narrative");
  assert.match(f.batches[0][0].sql, /INSERT INTO prayer_access_audit/);
  assert.match(f.batches[0][1].sql, /INSERT INTO sensitive_record_access_audit/);
  assert.equal(f.batches[0][0].values[2], "read");
  assert.equal(f.batches[0][0].values[3], null);
  assert.equal(f.batches[0][1].values[2], "assigned_prayer_read");
  assert.equal(f.batches[0][0].sql.includes("request_text"), false);
});

test("oversight prayer read requires and audits an allowlisted reason code", async (t) => {
  const f = makePastoralEnv({ roleCode: "admin_pastor", grants: [["prayer.oversight.read", "oversight"]], assignmentExists: false });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/prayer/requests/" + PRAYER_ID + "/read", { branch_id: BRANCH_ID, access_mode: "oversight", reason_code: "safeguarding_concern" }), f.env);
  const p = await r.json();
  assert.equal(r.status, 200);
  assert.equal(p.data.request.id, PRAYER_ID);
  assert.equal(f.batches[0][0].values[2], "oversight");
  assert.equal(f.batches[0][0].values[3], "safeguarding_concern");
  assert.equal(f.batches[0][1].values[2], "oversight:safeguarding_concern");
});

test("assigned prayer read does not disclose a request without a live assignment", async (t) => {
  const f = makePastoralEnv({ roleCode: "prayer_intercessor", grants: [["prayer.request.read.assigned", "assigned"]], assignmentExists: false });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/prayer/requests/" + PRAYER_ID + "/read", { branch_id: BRANCH_ID, access_mode: "assigned" }), f.env);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, "PASTORAL_RECORD_NOT_FOUND");
});

test("care oversight read audits and returns only the approved record projection and interactions", async (t) => {
  const f = makePastoralEnv({ roleCode: "admin_pastor", grants: [["care.oversight.read", "oversight"]] });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/care/records/" + CARE_ID + "/read", { branch_id: BRANCH_ID, access_mode: "oversight", reason_code: "continuity_of_care" }), f.env);
  const p = await r.json();
  assert.equal(r.status, 200);
  assert.equal(p.data.record.id, CARE_ID);
  assert.equal(p.data.interactions.length, 1);
  assert.equal(p.data.interactions[0].restricted_note, "Synthetic restricted note");
  assert.match(f.batches[0][0].sql, /INSERT INTO care_access_audit/);
  assert.match(f.batches[0][1].sql, /INSERT INTO sensitive_record_access_audit/);
  assert.equal(f.batches[0][0].values[2], "oversight");
  assert.equal(f.batches[0][0].values[3], "continuity_of_care");
  assert.equal(f.batches[0][1].values[2], "oversight:continuity_of_care");
});

test("oversight read rejects unsupported reason codes before any D1 operation", async (t) => {
  const f = makePastoralEnv({ roleCode: "admin_pastor", grants: [["care.oversight.read", "oversight"]] });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/care/records/" + CARE_ID + "/read", { branch_id: BRANCH_ID, access_mode: "oversight", reason_code: "curiosity" }), f.env);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, "OVERSIGHT_REASON_REQUIRED");
  assert.equal(f.batches.length, 0);
});


test("assigned care read requires a live assignment and writes both access audits", async (t) => {
  const f = makePastoralEnv({
    roleCode: "field_worker",
    grants: [["care.record.read.assigned", "assigned"]],
    assignmentExists: true,
  });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/care/records/" + CARE_ID + "/read", {
    branch_id: BRANCH_ID,
    access_mode: "assigned",
  }), f.env);
  const p = await r.json();
  assert.equal(r.status, 200);
  assert.equal(p.data.record.id, CARE_ID);
  assert.match(f.batches[0][0].sql, /EXISTS \(SELECT 1 FROM care_assignment/);
  assert.match(f.batches[0][1].sql, /INSERT INTO sensitive_record_access_audit/);
  assert.equal(f.batches[0][0].values[3], null);
});

test("assigned care read does not disclose a record without a live assignment", async (t) => {
  const f = makePastoralEnv({
    roleCode: "field_worker",
    grants: [["care.record.read.assigned", "assigned"]],
    assignmentExists: false,
  });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/care/records/" + CARE_ID + "/read", {
    branch_id: BRANCH_ID,
    access_mode: "assigned",
  }), f.env);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, "PASTORAL_RECORD_NOT_FOUND");
});

test("sensitive pastoral reads fail closed when append-only audit writes fail", async (t) => {
  const f = makePastoralEnv({
    roleCode: "admin_pastor",
    grants: [["care.oversight.read", "oversight"]],
    auditFailure: true,
  });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/care/records/" + CARE_ID + "/read", {
    branch_id: BRANCH_ID,
    access_mode: "oversight",
    reason_code: "pastoral_review",
  }), f.env);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, "PASTORAL_READ_AUDIT_FAILED");
});

test("sensitive pastoral read rejects a mismatched branch before querying records", async (t) => {
  const f = makePastoralEnv({
    roleCode: "admin_pastor",
    grants: [["care.oversight.read", "oversight"]],
  });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/care/records/" + CARE_ID + "/read", {
    branch_id: "30000000-0000-4000-8000-000000000099",
    access_mode: "oversight",
    reason_code: "pastoral_review",
  }), f.env);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, "INVALID_PASTORAL_READ");
  assert.equal(f.batches.length, 0);
});


test("six-role pastoral read matrix grants oversight only to Admin/Pastor and assigned prayer reads only to Intercessors", async (t) => {
  const cases = [
    { role: "admin_pastor", mode: "oversight", capability: ["prayer.oversight.read", "oversight"], expected: 200, reason_code: "pastoral_review" },
    { role: "coordinator", mode: "oversight", capability: null, expected: 403, reason_code: "pastoral_review" },
    { role: "team_leader", mode: "oversight", capability: null, expected: 403, reason_code: "pastoral_review" },
    { role: "field_worker", mode: "oversight", capability: null, expected: 403, reason_code: "pastoral_review" },
    { role: "follow_up_volunteer", mode: "oversight", capability: null, expected: 403, reason_code: "pastoral_review" },
    { role: "prayer_intercessor", mode: "assigned", capability: ["prayer.request.read.assigned", "assigned"], expected: 200, reason_code: undefined },
  ];
  for (const item of cases) {
    const f = makePastoralEnv({
      roleCode: item.role,
      grants: item.capability ? [item.capability] : [],
      assignmentExists: true,
    });
    const body = {
      branch_id: BRANCH_ID,
      access_mode: item.mode,
      ...(item.reason_code ? { reason_code: item.reason_code } : {}),
    };
    const r = await worker.fetch(makeRequest("/api/v1/pastoral/prayer/requests/" + PRAYER_ID + "/read", body), f.env);
    assert.equal(r.status, item.expected, item.role + " access result");
    if (item.expected === 200) {
      assert.equal((await r.json()).data.request.id, PRAYER_ID);
    } else {
      assert.equal((await r.json()).error.code, "PASTORAL_READ_NOT_AUTHORIZED");
      assert.equal(f.batches.length, 0);
    }
  }
});
