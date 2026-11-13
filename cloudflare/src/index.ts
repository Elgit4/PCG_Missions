import { createAuth } from "./auth";
import { authorizeRequestCapability, resolveStaffContext, type StaffEnvironment } from "./staff-context";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<Array<{ success: boolean; meta?: { changes?: number } }>>;
}

interface Env extends Omit<StaffEnvironment, "DB"> {
  DB: D1Database;
  APP_ENV?: string;
}

function json(status: number, body: Record<string, unknown>, requestId: string, origin?: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "X-Request-Id": requestId,
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify({ ...body, request_id: requestId }), { status, headers });
}

function allowedOrigins(env: Env): Set<string> {
  const values = [
    env.BETTER_AUTH_URL ?? "",
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
  ].map((value) => value.trim()).filter(Boolean);
  return new Set(values.map((value) => new URL(value).origin));
}

function requestOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return allowedOrigins(env).has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function authCorsHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Branch-Id",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  });
}

function withSecurityHeaders(response: Response, origin?: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.append("Vary", "Origin");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}


const STANDARD_ASSIGNABLE_ROLES = new Set([
  "coordinator",
  "team_leader",
  "field_worker",
  "follow_up_volunteer",
  "prayer_intercessor",
]);


type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

async function readJsonBody(request: Request, maxBytes = 8192): Promise<JsonBodyResult> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return { ok: false, status: 413 };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

type StaffRoleRequest = {
  target_profile_id?: unknown;
  role_code?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  reason?: unknown;
};

function parseIsoTimestamp(value: unknown, fallback: string): string | null {
  if (value === undefined || value === null || value === "") return fallback;
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function mapCapabilityFailure(state: string, requestId: string, origin?: string): Response {
  const status = state === "unauthenticated" ? 401 :
    state === "branch_required" ? 400 : 403;
  return json(status, {
    ok: false,
    error: { code: state.toUpperCase() },
  }, requestId, origin);
}

async function assignStaffRole(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.role.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  const body = await readJsonBody(request);
  if (!body.ok) {
    return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  const payload = body.value as StaffRoleRequest;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }

  const allowedKeys = new Set(["target_profile_id", "role_code", "starts_at", "ends_at", "reason"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    return json(400, { ok: false, error: { code: "UNEXPECTED_FIELDS" } }, requestId, origin);
  }

  const targetProfileId = typeof payload.target_profile_id === "string" ? payload.target_profile_id.trim() : "";
  const roleCode = typeof payload.role_code === "string" ? payload.role_code : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const now = new Date().toISOString();
  const startsAt = parseIsoTimestamp(payload.starts_at, now);
  const endsAt = payload.ends_at === undefined || payload.ends_at === null || payload.ends_at === ""
    ? null
    : parseIsoTimestamp(payload.ends_at, "");

  if (
    !targetProfileId || targetProfileId.length > 128 ||
    !STANDARD_ASSIGNABLE_ROLES.has(roleCode) ||
    targetProfileId === access.staff.profileId ||
    reason.length < 10 || reason.length > 500 ||
    !startsAt ||
    (payload.ends_at !== undefined && payload.ends_at !== null && payload.ends_at !== "" && !endsAt) ||
    (endsAt !== null && endsAt <= startsAt)
  ) {
    return json(400, { ok: false, error: { code: "INVALID_ROLE_ASSIGNMENT" } }, requestId, origin);
  }

  const target = await env.DB.prepare(`
    SELECT id, account_status
    FROM staff_profile
    WHERE id = ?
      AND account_status IN ('invited', 'active')
    LIMIT 1
  `).bind(targetProfileId).first<{ id: string; account_status: string }>();

  if (!target) {
    return json(404, { ok: false, error: { code: "STAFF_PROFILE_NOT_FOUND" } }, requestId, origin);
  }

  const role = await env.DB.prepare(
    "SELECT id FROM role WHERE code = ? AND is_active = 1 LIMIT 1",
  ).bind(roleCode).first<{ id: string }>();

  if (!role) {
    return json(400, { ok: false, error: { code: "ROLE_NOT_AVAILABLE" } }, requestId, origin);
  }

  const assignmentId = crypto.randomUUID();
  const metadata = JSON.stringify({ role_code: roleCode, assignment_id: assignmentId });
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO staff_role_assignment
          (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, ends_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        assignmentId, target.id, role.id, access.activeBranch.branchId,
        access.staff.profileId, startsAt, endsAt, reason, now,
      ),
      env.DB.prepare(`
        INSERT INTO staff_access_audit
          (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
        VALUES (?, ?, ?, ?, 'role_assigned', ?, ?, ?)
      `).bind(
        crypto.randomUUID(), access.activeBranch.branchId, access.staff.profileId,
        target.id, reason, metadata, now,
      ),
    ]);
    if (results.some((result) => !result.success)) throw new Error("ROLE_ASSIGNMENT_BATCH_FAILED");
  } catch {
    return json(409, { ok: false, error: { code: "ROLE_ASSIGNMENT_CONFLICT" } }, requestId, origin);
  }

  return json(201, {
    ok: true,
    assignment: {
      id: assignmentId,
      target_profile_id: target.id,
      role_code: roleCode,
      branch_id: access.activeBranch.branchId,
      starts_at: startsAt,
      ends_at: endsAt,
    },
  }, requestId, origin);
}

async function revokeStaffRole(
  request: Request,
  env: Env,
  assignmentId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.role.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  if (!assignmentId || assignmentId.length > 128) {
    return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_ID" } }, requestId, origin);
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  const payload = body.value as { reason?: unknown };

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (Object.keys(payload).some((key) => key !== "reason") || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_REVOCATION_REASON" } }, requestId, origin);
  }

  const existing = await env.DB.prepare(`
    SELECT sra.id, sra.staff_profile_id, r.code AS role_code
    FROM staff_role_assignment sra
    JOIN role r ON r.id = sra.role_id
    WHERE sra.id = ?
      AND sra.branch_id = ?
      AND sra.revoked_at IS NULL
    LIMIT 1
  `).bind(assignmentId, access.activeBranch.branchId).first<{
    id: string;
    staff_profile_id: string;
    role_code: string;
  }>();

  if (!existing) {
    return json(404, { ok: false, error: { code: "ROLE_ASSIGNMENT_NOT_FOUND" } }, requestId, origin);
  }
  if (existing.role_code === "admin_pastor") {
    return json(409, {
      ok: false,
      error: { code: "ADMIN_PASTOR_REVOCATION_REQUIRES_DUAL_CONTROL" },
    }, requestId, origin);
  }

  const now = new Date().toISOString();
  const metadata = JSON.stringify({ role_code: existing.role_code, assignment_id: existing.id });
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE staff_role_assignment
        SET revoked_at = ?, revoked_by = ?, reason = ?
        WHERE id = ? AND branch_id = ? AND revoked_at IS NULL
      `).bind(now, access.staff.profileId, reason, existing.id, access.activeBranch.branchId),
      env.DB.prepare(`
        INSERT INTO staff_access_audit
          (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
        SELECT ?, ?, ?, ?, 'role_revoked', ?, ?, ?
        WHERE changes() = 1
      `).bind(
        crypto.randomUUID(), access.activeBranch.branchId, access.staff.profileId,
        existing.staff_profile_id, reason, metadata, now,
      ),
    ]);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "ROLE_ASSIGNMENT_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "ROLE_REVOCATION_CONFLICT" } }, requestId, origin);
  }

  return json(200, { ok: true, revoked_assignment_id: existing.id }, requestId, origin);
}


async function listAdminElevationRequests(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.role.approve");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  const rows = await env.DB.prepare(`
    SELECT req.id, req.target_profile_id, target.full_name AS target_name,
           req.requested_by, requester.full_name AS requester_name,
           req.reason, req.requested_at
    FROM staff_role_elevation_request req
    JOIN staff_profile target ON target.id = req.target_profile_id
    JOIN staff_profile requester ON requester.id = req.requested_by
    WHERE req.branch_id = ? AND req.status = 'pending'
    ORDER BY req.requested_at ASC
    LIMIT 100
  `).bind(access.activeBranch.branchId).all<{
    id: string;
    target_profile_id: string;
    target_name: string;
    requested_by: string;
    requester_name: string;
    reason: string;
    requested_at: string;
  }>();

  return json(200, {
    ok: true,
    requests: rows.results ?? [],
  }, requestId, origin);
}

async function createAdminElevationRequest(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.role.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  const body = await readJsonBody(request);
  if (!body.ok) {
    return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  const payload = body.value as { target_profile_id?: unknown; reason?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  if (Object.keys(payload).some((key) => key !== "target_profile_id" && key !== "reason")) {
    return json(400, { ok: false, error: { code: "UNEXPECTED_FIELDS" } }, requestId, origin);
  }

  const targetProfileId = typeof payload.target_profile_id === "string" ? payload.target_profile_id.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!targetProfileId || targetProfileId.length > 128 ||
      targetProfileId === access.staff.profileId ||
      reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_ELEVATION_REQUEST" } }, requestId, origin);
  }

  const target = await env.DB.prepare(`
    SELECT id FROM staff_profile
    WHERE id = ? AND account_status = 'active'
    LIMIT 1
  `).bind(targetProfileId).first<{ id: string }>();
  if (!target) {
    return json(404, { ok: false, error: { code: "ACTIVE_STAFF_PROFILE_NOT_FOUND" } }, requestId, origin);
  }

  const adminRole = await env.DB.prepare(
    "SELECT id FROM role WHERE code = 'admin_pastor' AND is_active = 1 LIMIT 1",
  ).first<{ id: string }>();
  if (!adminRole) {
    return json(503, { ok: false, error: { code: "ADMIN_PASTOR_ROLE_UNAVAILABLE" } }, requestId, origin);
  }

  const elevationId = crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`
      INSERT INTO staff_role_elevation_request
        (id, branch_id, target_profile_id, role_id, requested_by, reason, requested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      elevationId, access.activeBranch.branchId, target.id, adminRole.id,
      access.staff.profileId, reason, requestedAt,
    ).run();

    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      throw new Error("ELEVATION_REQUEST_NOT_CREATED");
    }
  } catch {
    return json(409, {
      ok: false,
      error: { code: "ELEVATION_REQUEST_CONFLICT", message: "A request may already be open for this staff member in this branch." },
    }, requestId, origin);
  }

  return json(201, {
    ok: true,
    elevation_request: {
      id: elevationId,
      target_profile_id: target.id,
      branch_id: access.activeBranch.branchId,
      status: "pending",
      requested_at: requestedAt,
    },
  }, requestId, origin);
}

async function reviewAdminElevationRequest(
  request: Request,
  env: Env,
  elevationId: string,
  decision: "approve" | "reject",
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.role.approve");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  const body = await readJsonBody(request);
  if (!body.ok) {
    return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  const payload = body.value as { review_reason?: unknown; ends_at?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const allowedKeys = decision === "approve" ? new Set(["review_reason", "ends_at"]) : new Set(["review_reason"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    return json(400, { ok: false, error: { code: "UNEXPECTED_FIELDS" } }, requestId, origin);
  }

  const reviewReason = typeof payload.review_reason === "string" ? payload.review_reason.trim() : "";
  const now = new Date().toISOString();
  const endsAt = decision === "approve" && payload.ends_at !== undefined && payload.ends_at !== null && payload.ends_at !== ""
    ? parseIsoTimestamp(payload.ends_at, "")
    : null;
  if (
    !elevationId || elevationId.length > 128 ||
    reviewReason.length < 10 || reviewReason.length > 500 ||
    (decision === "approve" && payload.ends_at !== undefined && payload.ends_at !== null && payload.ends_at !== "" && !endsAt) ||
    (endsAt !== null && endsAt <= now)
  ) {
    return json(400, { ok: false, error: { code: "INVALID_ELEVATION_REVIEW" } }, requestId, origin);
  }

  if (decision === "reject") {
    try {
      const result = await env.DB.prepare(`
        UPDATE staff_role_elevation_request
        SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(
        access.staff.profileId, now, reviewReason, elevationId, access.activeBranch.branchId,
      ).run();
      if (!result.success || (result.meta?.changes ?? 0) !== 1) {
        return json(409, { ok: false, error: { code: "ELEVATION_REQUEST_NOT_PENDING" } }, requestId, origin);
      }
    } catch {
      return json(409, { ok: false, error: { code: "ELEVATION_REVIEW_NOT_AUTHORIZED" } }, requestId, origin);
    }
    return json(200, { ok: true, elevation_request_id: elevationId, status: "rejected" }, requestId, origin);
  }

  const assignmentId = crypto.randomUUID();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE staff_role_elevation_request
        SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(
        access.staff.profileId, now, reviewReason, elevationId, access.activeBranch.branchId,
      ),
      env.DB.prepare(`
        INSERT INTO staff_role_assignment
          (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, ends_at, reason, created_at)
        SELECT ?, req.target_profile_id, req.role_id, req.branch_id, ?,
               req.reviewed_at, ?, req.reason, ?
        FROM staff_role_elevation_request req
        WHERE req.id = ? AND req.branch_id = ?
          AND req.status = 'approved' AND req.reviewed_by = ?
          AND changes() = 1
      `).bind(
        assignmentId, access.staff.profileId, endsAt, now,
        elevationId, access.activeBranch.branchId, access.staff.profileId,
      ),
    ]);
    if (
      results.some((result) => !result.success) ||
      (results[0]?.meta?.changes ?? 0) !== 1 ||
      (results[1]?.meta?.changes ?? 0) !== 1
    ) {
      return json(409, { ok: false, error: { code: "ELEVATION_REQUEST_NOT_PENDING" } }, requestId, origin);
    }
  } catch {
    return json(409, {
      ok: false,
      error: { code: "ELEVATION_REVIEW_NOT_AUTHORIZED", message: "A distinct active Admin/Pastor reviewer is required." },
    }, requestId, origin);
  }

  return json(200, {
    ok: true,
    elevation_request_id: elevationId,
    assignment_id: assignmentId,
    status: "applied",
  }, requestId, origin);
}


async function listStaffDirectory(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.directory.read");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const rows = await env.DB.prepare(`
    SELECT sp.id, sp.full_name, sp.account_status, sp.last_active_at,
           GROUP_CONCAT(DISTINCT r.name) AS roles
    FROM staff_profile sp
    JOIN staff_role_assignment sra ON sra.staff_profile_id = sp.id
    JOIN role r ON r.id = sra.role_id AND r.is_active = 1
    WHERE sra.branch_id = ?
      AND sra.revoked_at IS NULL
      AND sra.starts_at <= ?
      AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    GROUP BY sp.id, sp.full_name, sp.account_status, sp.last_active_at
    ORDER BY sp.full_name COLLATE NOCASE
    LIMIT 100
  `).bind(access.activeBranch.branchId, new Date().toISOString(), new Date().toISOString()).all<{
    id: string; full_name: string; account_status: string; last_active_at: string | null; roles: string | null;
  }>();
  return json(200, { ok: true, staff: rows.results ?? [] }, requestId, origin);
}

async function changeStaffAccountStatus(
  request: Request,
  env: Env,
  targetProfileId: string,
  action: "deactivate" | "suspend" | "reactivate",
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.account.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (!targetProfileId || targetProfileId.length > 128 || targetProfileId === access.staff.profileId) {
    return json(400, { ok: false, error: { code: "INVALID_STAFF_TARGET" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { reason?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== "reason")) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_ACCOUNT_STATUS_REASON" } }, requestId, origin);
  }

  const now = new Date().toISOString();
  const target = await env.DB.prepare(`
    SELECT sp.id, sp.account_status
    FROM staff_profile sp
    WHERE sp.id = ?
      AND EXISTS (
        SELECT 1 FROM staff_role_assignment target_assignment
        WHERE target_assignment.staff_profile_id = sp.id
          AND target_assignment.branch_id = ?
          AND target_assignment.revoked_at IS NULL
          AND target_assignment.starts_at <= ?
          AND (target_assignment.ends_at IS NULL OR target_assignment.ends_at > ?)
      )
    LIMIT 1
  `).bind(targetProfileId, access.activeBranch.branchId, now, now).first<{
    id: string; account_status: string;
  }>();
  if (!target) return json(404, { ok: false, error: { code: "STAFF_PROFILE_NOT_FOUND_IN_BRANCH" } }, requestId, origin);

  const nextStatus = action === "deactivate" ? "inactive" : action === "suspend" ? "suspended" : "active";
  const allowedCurrent = action === "reactivate" ? ["inactive", "suspended"] : ["active"];
  if (!allowedCurrent.includes(target.account_status)) {
    return json(409, { ok: false, error: { code: "STAFF_ACCOUNT_STATUS_CONFLICT" } }, requestId, origin);
  }
  try {
    const result = await env.DB.prepare(`
      UPDATE staff_profile
      SET account_status = ?,
          deactivated_at = ?,
          account_status_changed_by = ?,
          account_status_changed_branch_id = ?,
          account_status_reason = ?,
          updated_at = ?
      WHERE id = ? AND account_status = ?
    `).bind(
      nextStatus,
      nextStatus === "inactive" ? now : null,
      access.staff.profileId,
      access.activeBranch.branchId,
      reason,
      now,
      target.id,
      target.account_status,
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "STAFF_ACCOUNT_STATUS_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, {
      ok: false,
      error: { code: "STAFF_ACCOUNT_STATUS_CHANGE_BLOCKED", message: "The change may violate branch access or last-Admin/Pastor safeguards." },
    }, requestId, origin);
  }
  return json(200, { ok: true, staff_profile_id: target.id, account_status: nextStatus }, requestId, origin);
}

async function listAdminRevocationRequests(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.role.approve");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const rows = await env.DB.prepare(`
    SELECT req.id, req.assignment_id, req.target_profile_id,
           target.full_name AS target_name, req.requested_by,
           requester.full_name AS requester_name, req.reason, req.requested_at
    FROM staff_role_revocation_request req
    JOIN staff_profile target ON target.id = req.target_profile_id
    JOIN staff_profile requester ON requester.id = req.requested_by
    WHERE req.branch_id = ? AND req.status = 'pending'
    ORDER BY req.requested_at ASC LIMIT 100
  `).bind(access.activeBranch.branchId).all<{
    id: string; assignment_id: string; target_profile_id: string; target_name: string;
    requested_by: string; requester_name: string; reason: string; requested_at: string;
  }>();
  return json(200, { ok: true, requests: rows.results ?? [] }, requestId, origin);
}

async function createAdminRevocationRequest(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.role.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { assignment_id?: unknown; reason?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== "assignment_id" && key !== "reason")) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const assignmentId = typeof payload.assignment_id === "string" ? payload.assignment_id.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!assignmentId || assignmentId.length > 128 || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_REVOCATION_REQUEST" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  const assignment = await env.DB.prepare(`
    SELECT a.id, a.staff_profile_id, a.role_id
    FROM staff_role_assignment a JOIN role r ON r.id = a.role_id
    WHERE a.id = ? AND a.branch_id = ? AND r.code = 'admin_pastor'
      AND a.revoked_at IS NULL AND a.starts_at <= ?
      AND (a.ends_at IS NULL OR a.ends_at > ?)
  `).bind(assignmentId, access.activeBranch.branchId, now, now).first<{
    id: string; staff_profile_id: string; role_id: string;
  }>();
  if (!assignment) return json(404, { ok: false, error: { code: "ACTIVE_ADMIN_ASSIGNMENT_NOT_FOUND" } }, requestId, origin);

  const requestIdForRevocation = crypto.randomUUID();
  try {
    const result = await env.DB.prepare(`
      INSERT INTO staff_role_revocation_request
        (id, branch_id, assignment_id, target_profile_id, role_id, requested_by, reason, requested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      requestIdForRevocation, access.activeBranch.branchId, assignment.id,
      assignment.staff_profile_id, assignment.role_id, access.staff.profileId, reason, now,
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) throw new Error("REVOCATION_REQUEST_NOT_CREATED");
  } catch {
    return json(409, { ok: false, error: { code: "REVOCATION_REQUEST_CONFLICT" } }, requestId, origin);
  }
  return json(201, {
    ok: true,
    revocation_request: {
      id: requestIdForRevocation,
      assignment_id: assignment.id,
      target_profile_id: assignment.staff_profile_id,
      branch_id: access.activeBranch.branchId,
      status: "pending",
      requested_at: now,
    },
  }, requestId, origin);
}

async function reviewAdminRevocationRequest(
  request: Request,
  env: Env,
  revocationId: string,
  decision: "approve" | "reject",
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.role.approve");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { review_reason?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== "review_reason")) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const reason = typeof payload.review_reason === "string" ? payload.review_reason.trim() : "";
  if (!revocationId || revocationId.length > 128 || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_REVOCATION_REVIEW" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  if (decision === "reject") {
    try {
      const result = await env.DB.prepare(`
        UPDATE staff_role_revocation_request
        SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(access.staff.profileId, now, reason, revocationId, access.activeBranch.branchId).run();
      if (!result.success || (result.meta?.changes ?? 0) !== 1) {
        return json(409, { ok: false, error: { code: "REVOCATION_REQUEST_NOT_PENDING" } }, requestId, origin);
      }
    } catch {
      return json(409, { ok: false, error: { code: "REVOCATION_REVIEW_NOT_AUTHORIZED" } }, requestId, origin);
    }
    return json(200, { ok: true, revocation_request_id: revocationId, status: "rejected" }, requestId, origin);
  }

  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE staff_role_revocation_request
        SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(access.staff.profileId, now, reason, revocationId, access.activeBranch.branchId),
      env.DB.prepare(`
        UPDATE staff_role_assignment
        SET revoked_at = ?, revoked_by = ?, revocation_request_id = ?, reason = ?
        WHERE id = (
          SELECT assignment_id FROM staff_role_revocation_request
          WHERE id = ? AND branch_id = ? AND status = 'approved'
            AND reviewed_by = ? AND changes() = 1
        )
          AND branch_id = ? AND revoked_at IS NULL
      `).bind(
        now, access.staff.profileId, revocationId, reason,
        revocationId, access.activeBranch.branchId, access.staff.profileId, access.activeBranch.branchId,
      ),
      env.DB.prepare(`
        UPDATE staff_role_revocation_request SET status = 'applied'
        WHERE id = ? AND branch_id = ? AND status = 'approved'
          AND reviewed_by = ? AND changes() = 1
      `).bind(revocationId, access.activeBranch.branchId, access.staff.profileId),
    ]);
    if (results.some((result) => !result.success) ||
        (results[0]?.meta?.changes ?? 0) !== 1 ||
        (results[1]?.meta?.changes ?? 0) !== 1 ||
        (results[2]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "REVOCATION_REQUEST_NOT_APPLIED", message: "The request may be stale or the last-Admin/Pastor safeguard blocked removal." } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "REVOCATION_REVIEW_NOT_AUTHORIZED" } }, requestId, origin);
  }
  return json(200, { ok: true, revocation_request_id: revocationId, status: "applied" }, requestId, origin);
}

function isAuthPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const origin = request.headers.get("Origin") ?? undefined;

    if (!requestOriginAllowed(request, env)) {
      return json(403, {
        ok: false,
        error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." },
      }, requestId);
    }

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 204 });
      return new Response(null, { status: 204, headers: authCorsHeaders(origin) });
    }

    if (isAuthPath(url.pathname)) {
      if (request.method !== "GET" && request.method !== "POST") {
        return json(405, {
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
        }, requestId, origin);
      }
      try {
        const auth = createAuth(env);
        return withSecurityHeaders(await auth.handler(request), origin);
      } catch {
        return json(503, {
          ok: false,
          error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured for this environment." },
        }, requestId, origin);
      }
    }

    if (url.pathname === "/api/v1/staff" && request.method === "GET") {
      return listStaffDirectory(request, env, requestId, origin);
    }

    const staffStatusMatch = url.pathname.match(/^\/api\/v1\/staff\/([^/]+)\/(deactivate|suspend|reactivate)$/);
    if (staffStatusMatch && request.method === "POST") {
      let profileId: string;
      try { profileId = decodeURIComponent(staffStatusMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_STAFF_TARGET" } }, requestId, origin); }
      return changeStaffAccountStatus(
        request, env, profileId, staffStatusMatch[2] as "deactivate" | "suspend" | "reactivate", requestId, origin,
      );
    }

    if (url.pathname === "/api/v1/staff/role-revocations" && request.method === "GET") {
      return listAdminRevocationRequests(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/staff/role-revocations" && request.method === "POST") {
      return createAdminRevocationRequest(request, env, requestId, origin);
    }

    const revocationReviewMatch = url.pathname.match(/^\/api\/v1\/staff\/role-revocations\/([^/]+)\/(approve|reject)$/);
    if (revocationReviewMatch && request.method === "POST") {
      let revocationId: string;
      try { revocationId = decodeURIComponent(revocationReviewMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_REVOCATION_REQUEST_ID" } }, requestId, origin); }
      return reviewAdminRevocationRequest(
        request, env, revocationId, revocationReviewMatch[2] as "approve" | "reject", requestId, origin,
      );
    }

    if (url.pathname === "/api/v1/staff/role-elevations" && request.method === "GET") {
      return listAdminElevationRequests(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/staff/role-elevations" && request.method === "POST") {
      return createAdminElevationRequest(request, env, requestId, origin);
    }

    const elevationReviewMatch = url.pathname.match(/^\/api\/v1\/staff\/role-elevations\/([^/]+)\/(approve|reject)$/);
    if (elevationReviewMatch && request.method === "POST") {
      let elevationId: string;
      try {
        elevationId = decodeURIComponent(elevationReviewMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_ELEVATION_REQUEST_ID" } }, requestId, origin);
      }
      return reviewAdminElevationRequest(
        request, env, elevationId, elevationReviewMatch[2] as "approve" | "reject", requestId, origin,
      );
    }

    if (url.pathname === "/api/v1/staff/roles" && request.method === "POST") {
      return assignStaffRole(request, env, requestId, origin);
    }

    const roleAssignmentMatch = url.pathname.match(/^\/api\/v1\/staff\/roles\/([^/]+)$/);
    if (roleAssignmentMatch && request.method === "DELETE") {
      let assignmentId: string;
      try {
        assignmentId = decodeURIComponent(roleAssignmentMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_ID" } }, requestId, origin);
      }
      return revokeStaffRole(request, env, assignmentId, requestId, origin);
    }

    if (request.method !== "GET") {
      return json(405, {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "This endpoint is read-only." },
      }, requestId, origin);
    }

    if (url.pathname === "/health" || url.pathname === "/api/v1/health") {
      try {
        const result = await env.DB.prepare(
          "SELECT schema_version, environment FROM app_meta WHERE id = 1 LIMIT 1",
        ).first<{ schema_version: number; environment: string }>();

        if (!result || result.environment !== "non-production") {
          return json(503, {
            ok: false,
            service: "pcg-missions-cloudflare-api",
            state: "database_not_initialized",
          }, requestId, origin);
        }

        return json(200, {
          ok: true,
          service: "pcg-missions-cloudflare-api",
          state: "ready",
          environment: result.environment,
          schema_version: result.schema_version,
        }, requestId, origin);
      } catch {
        return json(503, {
          ok: false,
          service: "pcg-missions-cloudflare-api",
          state: "database_unavailable_or_migrations_missing",
        }, requestId, origin);
      }
    }

    if (url.pathname === "/api/v1/me") {
      try {
        const context = await resolveStaffContext(request, env);
        if (context.state === "unauthenticated") {
          return json(401, { ok: false, error: { code: "UNAUTHENTICATED" } }, requestId, origin);
        }
        if (context.state === "staff_not_provisioned") {
          return json(403, { ok: false, error: { code: "STAFF_NOT_PROVISIONED" } }, requestId, origin);
        }
        if (context.state === "staff_inactive") {
          return json(403, { ok: false, error: { code: "STAFF_ACCOUNT_INACTIVE" } }, requestId, origin);
        }
        if (context.state === "branch_not_authorized") {
          return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
        }
        if (context.staff.branches.length === 0) {
          return json(403, { ok: false, error: { code: "NO_ACTIVE_BRANCH_ASSIGNMENT" } }, requestId, origin);
        }
        return json(200, {
          ok: true,
          staff: context.staff,
          active_branch: context.activeBranch,
          branch_selection_required: context.activeBranch === null && context.staff.branches.length > 0,
        }, requestId, origin);
      } catch {
        return json(503, {
          ok: false,
          error: { code: "STAFF_CONTEXT_UNAVAILABLE", message: "The staff session could not be verified." },
        }, requestId, origin);
      }
    }

    return json(404, {
      ok: false,
      error: { code: "ROUTE_NOT_FOUND", message: "This API route has not been implemented." },
    }, requestId, origin);
  },
};
