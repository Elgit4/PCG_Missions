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
        if (s.sql.includes("SELECT p.id, p.branch_id, p.request_text")) {
          const allowed = recordExists && (!s.sql.includes("EXISTS (SELECT 1 FROM prayer_assignment") || assignmentExists);
          return { success: true, results: allowed ? [{ id: PRAYER_ID, branch_id: BRANCH_ID, request_text: "Synthetic prayer narrative", status: "assigned", sensitivity: "highly_restricted", expires_at: null, answered_at: null, created_at: "2026-11-20T08:00:00.000Z", updated_at: "2026-11-20T08:00:00.000Z" }] : [] };
        }
        if (s.sql.includes("SELECT cr.id, cr.branch_id, cr.status")) {
          const allowed = recordExists && (!s.sql.includes("EXISTS (SELECT 1 FROM care_assignment") || assignmentExists);
          return { success: true, results: allowed ? [{ id: CARE_ID, branch_id: BRANCH_ID, status: "active", reviewed_at: null, created_at: "2026-11-19T08:00:00.000Z", updated_at: "2026-11-20T08:00:00.000Z" }] : [] };
        }
        if (s.sql.includes("FROM care_interaction ci")) return { success: true, results: recordExists ? [{ id: "60000000-0000-4000-8000-000000000001", interaction_type: "visit", outcome_code: "completed", restricted_note: "Synthetic restricted note", occurred_at: "2026-11-20T10:00:00.000Z" }] : [] };
        const needsAssignment = s.sql.includes("EXISTS (SELECT 1 FROM prayer_assignment") || s.sql.includes("EXISTS (SELECT 1 FROM care_assignment");
        return { success: true, meta: { changes: recordExists && (!needsAssignment || assignmentExists) ? 1 : 0 } };
      });
    },
  };
  return { env: { DB, APP_ENV: "non-production", APP_ALLOWED_ORIGINS: "https://preview.example", SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }, batches };
}

function makeRequest(path, body) {
  return new Request("https://worker.example" + path, {
    method: "POST",
    headers: { Authorization: "Bearer synthetic-access-token", "X-Branch-Id": BRANCH_ID, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function mockAuth(t) {
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: AUTH_ID, email: "pastoral@example.test" }));
}

test("assigned prayer read audits before returning the allowlisted narrative", async (t) => {
  mockAuth(t);
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
  mockAuth(t);
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
  mockAuth(t);
  const f = makePastoralEnv({ roleCode: "prayer_intercessor", grants: [["prayer.request.read.assigned", "assigned"]], assignmentExists: false });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/prayer/requests/" + PRAYER_ID + "/read", { branch_id: BRANCH_ID, access_mode: "assigned" }), f.env);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, "PASTORAL_RECORD_NOT_FOUND");
});

test("care oversight read audits and returns only the approved record projection and interactions", async (t) => {
  mockAuth(t);
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
  mockAuth(t);
  const f = makePastoralEnv({ roleCode: "admin_pastor", grants: [["care.oversight.read", "oversight"]] });
  const r = await worker.fetch(makeRequest("/api/v1/pastoral/care/records/" + CARE_ID + "/read", { branch_id: BRANCH_ID, access_mode: "oversight", reason_code: "curiosity" }), f.env);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, "OVERSIGHT_REASON_REQUIRED");
  assert.equal(f.batches.length, 0);
});


test("assigned care read requires a live assignment and writes both access audits", async (t) => {
  mockAuth(t);
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
  mockAuth(t);
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
  mockAuth(t);
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
  mockAuth(t);
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
