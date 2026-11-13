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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Branch-Id, Idempotency-Key",
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
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      return { ok: false, status: 400 };
    }
    if (declaredBytes > maxBytes) return { ok: false, status: 413 };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("REQUEST_TOO_LARGE");
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, status: 400 };
  }
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



async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function applyInvitationAcceptRateLimit(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const key = `staff-invite-accept:${await sha256Hex(ip)}`;
  const now = Date.now();
  const row = await env.DB.prepare(`
    INSERT INTO rateLimit (id, key, count, lastRequest)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN excluded.lastRequest - rateLimit.lastRequest > 900000
        THEN 1 ELSE rateLimit.count + 1 END,
      lastRequest = excluded.lastRequest
    RETURNING count
  `).bind(crypto.randomUUID(), key, now).first<{ count: number }>();
  return !!row && row.count <= 10;
}

async function createStaffInvitation(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.account.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const roleAccess = await authorizeRequestCapability(request, env, "staff.role.assign");
  if (roleAccess.state !== "authorized" ||
      roleAccess.staff.profileId !== access.staff.profileId ||
      roleAccess.activeBranch.branchId !== access.activeBranch.branchId) {
    return json(403, { ok: false, error: { code: "STAFF_ROLE_ASSIGNMENT_NOT_AUTHORIZED" } }, requestId, origin);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as {
    full_name?: unknown; email?: unknown; phone_e164?: unknown; role_code?: unknown; reason?: unknown;
  };
  const allowed = new Set(["full_name", "email", "phone_e164", "role_code", "reason"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_INVITATION_BODY" } }, requestId, origin);
  }
  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const phone = payload.phone_e164 === undefined || payload.phone_e164 === null || payload.phone_e164 === ""
    ? null : typeof payload.phone_e164 === "string" ? payload.phone_e164.trim() : "";
  const roleCode = typeof payload.role_code === "string" ? payload.role_code : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (
    fullName.length < 2 || fullName.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254 ||
    (phone !== null && (typeof phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(phone))) ||
    !STANDARD_ASSIGNABLE_ROLES.has(roleCode) ||
    reason.length < 10 || reason.length > 500
  ) {
    return json(400, { ok: false, error: { code: "INVALID_INVITATION_DETAILS" } }, requestId, origin);
  }

  const role = await env.DB.prepare(
    "SELECT id FROM role WHERE code = ? AND is_active = 1 LIMIT 1",
  ).bind(roleCode).first<{ id: string }>();
  if (!role) return json(400, { ok: false, error: { code: "ROLE_NOT_AVAILABLE" } }, requestId, origin);

  const token = createInvitationToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  const invitationId = crypto.randomUUID();
  try {
    const result = await env.DB.prepare(`
      INSERT INTO staff_invitation
        (id, branch_id, invited_by, email, full_name, phone_e164, role_id,
         token_hash, expires_at, reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      invitationId, access.activeBranch.branchId, access.staff.profileId,
      email, fullName, phone, role.id, tokenHash, expiresAt, reason, createdAt, createdAt,
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) throw new Error("INVITATION_NOT_CREATED");
  } catch {
    return json(409, { ok: false, error: { code: "INVITATION_CONFLICT", message: "The email may already belong to a staff account or have a pending invitation." } }, requestId, origin);
  }

  return json(201, {
    ok: true,
    invitation: {
      id: invitationId,
      email,
      full_name: fullName,
      role_code: roleCode,
      branch_id: access.activeBranch.branchId,
      expires_at: expiresAt,
      delivery_status: "manual_copy_required",
      invitation_token: token,
    },
  }, requestId, origin);
}

async function listStaffInvitations(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.account.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const rows = await env.DB.prepare(`
    SELECT i.id, i.email, i.full_name, i.phone_e164, r.code AS role_code,
           i.status, i.expires_at, i.created_at
    FROM staff_invitation i
    JOIN role r ON r.id = i.role_id
    WHERE i.branch_id = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC
    LIMIT 100
  `).bind(access.activeBranch.branchId).all<{
    id: string; email: string; full_name: string; phone_e164: string | null;
    role_code: string; status: string; expires_at: string; created_at: string;
  }>();
  return json(200, { ok: true, invitations: rows.results ?? [] }, requestId, origin);
}

async function revokeStaffInvitation(
  request: Request,
  env: Env,
  invitationId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.account.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { reason?: unknown };
  const reason = payload && typeof payload === "object" && !Array.isArray(payload) &&
    typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== "reason") ||
      !invitationId || invitationId.length > 128 || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_INVITATION_REVOCATION" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`
      UPDATE staff_invitation
      SET status = 'revoked', revoked_at = ?, revoked_by = ?,
          token_hash = NULL, updated_at = ?
      WHERE id = ? AND branch_id = ? AND status = 'pending'
    `).bind(
      now, access.staff.profileId, now, invitationId, access.activeBranch.branchId,
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      return json(404, { ok: false, error: { code: "PENDING_INVITATION_NOT_FOUND" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "INVITATION_REVOCATION_BLOCKED" } }, requestId, origin);
  }
  return json(200, { ok: true, invitation_id: invitationId, status: "revoked" }, requestId, origin);
}

async function acceptStaffInvitation(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  if (!await applyInvitationAcceptRateLimit(request, env)) {
    return json(429, { ok: false, error: { code: "INVITATION_ACCEPT_RATE_LIMITED" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { invitation_token?: unknown; password?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== "invitation_token" && key !== "password")) {
    return json(400, { ok: false, error: { code: "INVALID_INVITATION_ACCEPTANCE" } }, requestId, origin);
  }
  const token = typeof payload.invitation_token === "string" ? payload.invitation_token.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || password.length < 12 || password.length > 128) {
    return json(400, { ok: false, error: { code: "INVALID_INVITATION_CREDENTIALS" } }, requestId, origin);
  }

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const invitation = await env.DB.prepare(`
    SELECT i.id, i.branch_id, i.invited_by, i.email, i.full_name, i.phone_e164,
           i.role_id, r.code AS role_code, i.expires_at
    FROM staff_invitation i
    JOIN role r ON r.id = i.role_id AND r.is_active = 1
    WHERE i.token_hash = ? AND i.status = 'pending'
    LIMIT 1
  `).bind(tokenHash).first<{
    id: string; branch_id: string; invited_by: string; email: string;
    full_name: string; phone_e164: string | null; role_id: string; role_code: string; expires_at: string;
  }>();
  if (!invitation) return json(404, { ok: false, error: { code: "INVITATION_INVALID_OR_USED" } }, requestId, origin);
  if (invitation.expires_at <= now) {
    return json(410, { ok: false, error: { code: "INVITATION_EXPIRED" } }, requestId, origin);
  }

  let authUserId = "";
  try {
    const auth = createAuth(env, true);
    const signup = await auth.api.signUpEmail({
      body: {
        name: invitation.full_name,
        email: invitation.email,
        password,
      },
    });
    authUserId = signup.user.id;
  } catch {
    return json(409, {
      ok: false,
      error: { code: "INVITATION_CANNOT_BE_ACCEPTED", message: "The invitation could not be accepted. It may already have been used or the account may already exist." },
    }, requestId, origin);
  }

  const profileId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const acceptedAt = new Date().toISOString();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO staff_profile
          (id, auth_user_id, full_name, email, phone_e164, account_status,
           created_at, updated_at, must_change_password, password_changed_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 0, ?)
      `).bind(
        profileId, authUserId, invitation.full_name, invitation.email,
        invitation.phone_e164, acceptedAt, acceptedAt, acceptedAt,
      ),
      env.DB.prepare(`
        INSERT INTO staff_role_assignment
          (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        assignmentId, profileId, invitation.role_id, invitation.branch_id,
        invitation.invited_by, acceptedAt, "Assigned through accepted staff invitation", acceptedAt,
      ),
      env.DB.prepare(`
        UPDATE staff_invitation
        SET status = 'accepted', accepted_at = ?, accepted_user_id = ?,
            accepted_profile_id = ?, token_hash = NULL, updated_at = ?
        WHERE id = ? AND status = 'pending' AND token_hash = ? AND expires_at > ?
      `).bind(
        acceptedAt, authUserId, profileId, acceptedAt,
        invitation.id, tokenHash, acceptedAt,
      ),
      env.DB.prepare(`
        INSERT INTO staff_access_audit
          (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
        VALUES (?, ?, ?, ?, 'account_created', ?, ?, ?)
      `).bind(
        crypto.randomUUID(), invitation.branch_id, invitation.invited_by, profileId,
        "Staff invitation accepted and private password established",
        JSON.stringify({ invitation_id: invitation.id, role_code: invitation.role_code }),
        acceptedAt,
      ),
    ]);
    if (results.some((result) => !result.success) ||
        results.some((result) => (result.meta?.changes ?? 0) !== 1)) {
      throw new Error("INVITATION_ACCEPTANCE_BATCH_FAILED");
    }
  } catch {
    // The Better Auth identity has no staff profile/session if provisioning
    // fails. Remove the orphan credential identity so the same invite can retry.
    try {
      await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(authUserId).run();
    } catch {
      // The orphan remains blocked by the session-create staff-profile gate.
    }
    return json(409, { ok: false, error: { code: "INVITATION_PROVISIONING_FAILED" } }, requestId, origin);
  }

  return json(201, {
    ok: true,
    staff_profile_id: profileId,
    account_status: "active",
    sign_in_required: true,
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



type ContactScopeMode = "branch" | "team" | "assigned";

function bestScope(scopes: string[]): ContactScopeMode | null {
  if (scopes.includes("branch")) return "branch";
  if (scopes.includes("team")) return "team";
  if (scopes.includes("assigned")) return "assigned";
  return null;
}

function contactScopePredicate(
  mode: ContactScopeMode | null,
  alias: string,
  staffProfileId: string,
  staffUserId: string,
  branchId: string,
  now: string,
): { sql: string; values: unknown[] } {
  if (mode === "branch") return { sql: "1 = 1", values: [] };
  if (mode === "team") return {
    sql: `EXISTS (
      SELECT 1
      FROM contact_assignment ca
      JOIN staff_team_membership tm
        ON tm.team_id = ca.team_id AND tm.branch_id = ca.branch_id
      WHERE ca.contact_id = ${alias}.id
        AND ca.branch_id = ${alias}.branch_id
        AND tm.staff_profile_id = ?
        AND tm.membership_role = 'leader'
        AND tm.revoked_at IS NULL
        AND tm.starts_at <= ?
        AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        AND ca.starts_at <= ?
        AND (ca.ends_at IS NULL OR ca.ends_at > ?)
    )`,
    values: [staffProfileId, now, now, now, now],
  };
  if (mode === "assigned") return {
    sql: `EXISTS (
      SELECT 1 FROM contact_assignment ca
      WHERE ca.contact_id = ${alias}.id
        AND ca.branch_id = ${alias}.branch_id
        AND ca.assignee_user_id = ?
        AND ca.starts_at <= ?
        AND (ca.ends_at IS NULL OR ca.ends_at > ?)
    )`,
    values: [staffUserId, now, now],
  };
  return { sql: "0 = 1", values: [] };
}

async function contactResourceContext(
  request: Request,
  env: Env,
  contactId: string,
): Promise<
  | { ok: true; context: Extract<Awaited<ReturnType<typeof resolveStaffContext>>, { state: "authenticated" }>; teamId?: string }
  | { ok: false; response: Response }
> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") {
    return { ok: false, response: mapCapabilityFailure(context.state, crypto.randomUUID(), request.headers.get("Origin") ?? undefined) };
  }
  if (!context.activeBranch) {
    return { ok: false, response: mapCapabilityFailure("branch_required", crypto.randomUUID(), request.headers.get("Origin") ?? undefined) };
  }
  const contact = await env.DB.prepare(`
    SELECT id FROM contact
    WHERE id = ? AND branch_id = ? AND contact_status <> 'merged'
    LIMIT 1
  `).bind(contactId, context.activeBranch.branchId).first<{ id: string }>();
  if (!contact) {
    return { ok: false, response: json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, crypto.randomUUID(), request.headers.get("Origin") ?? undefined) };
  }
  const team = await env.DB.prepare(`
    SELECT ca.team_id
    FROM contact_assignment ca
    JOIN staff_team_membership tm
      ON tm.team_id = ca.team_id AND tm.branch_id = ca.branch_id
    WHERE ca.contact_id = ? AND ca.branch_id = ?
      AND tm.staff_profile_id = ? AND tm.membership_role = 'leader'
      AND tm.revoked_at IS NULL
      AND tm.starts_at <= ?
      AND (tm.ends_at IS NULL OR tm.ends_at > ?)
      AND ca.starts_at <= ?
      AND (ca.ends_at IS NULL OR ca.ends_at > ?)
    LIMIT 1
  `).bind(
    contactId, context.activeBranch.branchId, context.staff.profileId,
    new Date().toISOString(), new Date().toISOString(),
    new Date().toISOString(), new Date().toISOString(),
  ).first<{ team_id: string }>();
  return { ok: true, context, teamId: team?.team_id };
}

async function listContacts(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const grants = context.activeBranch.capabilities;
  const readScope = bestScope(grants.filter((g) => g.code === "contacts.read").map((g) => g.scopeMode));
  if (!readScope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const detailScope = bestScope(grants.filter((g) => g.code === "contacts.contact_details.read").map((g) => g.scopeMode));
  const privateScope = bestScope(grants.filter((g) => g.code === "contacts.private_fields.read").map((g) => g.scopeMode));
  const now = new Date().toISOString();
  const readPredicate = contactScopePredicate(readScope, "c", context.staff.profileId, context.staff.userId, context.activeBranch.branchId, now);
  const detailPredicate = contactScopePredicate(detailScope, "c", context.staff.profileId, context.staff.userId, context.activeBranch.branchId, now);
  const privatePredicate = contactScopePredicate(privateScope, "c", context.staff.profileId, context.staff.userId, context.activeBranch.branchId, now);
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  const status = url.searchParams.get("status") ?? "active";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!["active", "archived", "all"].includes(status) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [...url.searchParams.keys()].some((key) => !["search", "status", "limit"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_QUERY" } }, requestId, origin);
  }
  const statusPredicate = status === "all" ? "1 = 1" : "c.contact_status = ?";
  const rows = await env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.age_range ELSE NULL END AS age_range,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.preferred_language ELSE NULL END AS preferred_language,
           c.contact_status, c.created_at, c.updated_at
    FROM contact c
    WHERE c.branch_id = ?
      AND c.contact_status <> 'merged'
      AND ${statusPredicate}
      AND (? = '%%' OR c.first_name LIKE ? OR COALESCE(c.last_name, '') LIKE ?)
      AND (${readPredicate.sql})
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ?
  `).bind(
    detailScope ? 1 : 0, ...detailPredicate.values,
    detailScope ? 1 : 0, ...detailPredicate.values,
    privateScope ? 1 : 0, ...privatePredicate.values,
    privateScope ? 1 : 0, ...privatePredicate.values,
    context.activeBranch.branchId,
    ...(status === "all" ? [] : [status]),
    search ? `%${search}%` : "%%",
    search ? `%${search}%` : "%%",
    search ? `%${search}%` : "%%",
    ...readPredicate.values,
    limit,
  ).all<{
    id: string; first_name: string; last_name: string | null; preferred_name: string | null;
    phone_e164: string | null; email: string | null; age_range: string | null;
    preferred_language: string | null; contact_status: string; created_at: string; updated_at: string;
  }>();
  return json(200, { ok: true, contacts: rows.results ?? [] }, requestId, origin);
}

async function createContact(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "contacts.create");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return json(400, { ok: false, error: { code: "IDEMPOTENCY_KEY_REQUIRED" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as {
    first_name?: unknown; last_name?: unknown; preferred_name?: unknown; phone_e164?: unknown;
    email?: unknown; age_range?: unknown; preferred_language?: unknown; service_area_id?: unknown;
    source_metadata?: unknown;
  };
  const allowed = new Set(["first_name","last_name","preferred_name","phone_e164","email","age_range","preferred_language","service_area_id","source_metadata"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_BODY" } }, requestId, origin);
  }
  const firstName = typeof payload.first_name === "string" ? payload.first_name.trim() : "";
  const lastName = typeof payload.last_name === "string" ? payload.last_name.trim() || null : null;
  const preferredName = typeof payload.preferred_name === "string" ? payload.preferred_name.trim() || null : null;
  const phone = typeof payload.phone_e164 === "string" ? payload.phone_e164.trim() || null : null;
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() || null : null;
  const ageRange = typeof payload.age_range === "string" ? payload.age_range.trim() || null : null;
  const preferredLanguage = typeof payload.preferred_language === "string" ? payload.preferred_language.trim() || null : null;
  const serviceAreaId = typeof payload.service_area_id === "string" ? payload.service_area_id.trim() || null : null;
  const metadata = payload.source_metadata === undefined ? {} : payload.source_metadata;
  const metadataAllowed = new Set(["app_version","form_version","device_type","locale"]);
  if (
    firstName.length < 1 || firstName.length > 120 ||
    (lastName !== null && lastName.length > 120) ||
    (preferredName !== null && preferredName.length > 120) ||
    (phone !== null && !/^\+[1-9]\d{7,14}$/.test(phone)) ||
    (email !== null && (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254)) ||
    (ageRange !== null && ageRange.length > 50) ||
    (preferredLanguage !== null && preferredLanguage.length > 60) ||
    (serviceAreaId !== null && serviceAreaId.length > 128) ||
    !metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
    Object.keys(metadata as Record<string, unknown>).length > 4 ||
    Object.keys(metadata as Record<string, unknown>).some((key) => !metadataAllowed.has(key)) ||
    Object.values(metadata as Record<string, unknown>).some((value) => typeof value !== "string" || value.length > 80)
  ) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_DETAILS" } }, requestId, origin);
  }

  if (ageRange !== null || preferredLanguage !== null) {
    const privateWrite = await authorizeRequestCapability(request, env, "contacts.private_fields.update");
    if (privateWrite.state !== "authorized") {
      return json(403, { ok: false, error: { code: "PRIVATE_CONTACT_FIELDS_FORBIDDEN" } }, requestId, origin);
    }
  }

  if (serviceAreaId) {
    const area = await env.DB.prepare(
      "SELECT id FROM service_area WHERE id = ? AND branch_id = ? AND is_active = 1 LIMIT 1",
    ).bind(serviceAreaId, access.activeBranch.branchId).first<{ id: string }>();
    if (!area) return json(400, { ok: false, error: { code: "SERVICE_AREA_NOT_AVAILABLE" } }, requestId, origin);
  }

  const digestPayload = {
    first_name: firstName, last_name: lastName, preferred_name: preferredName,
    phone_e164: phone, email, age_range: ageRange, preferred_language: preferredLanguage,
    service_area_id: serviceAreaId, source_metadata: metadata,
  };
  const digestHex = await sha256Hex(JSON.stringify(digestPayload));
  const existing = await env.DB.prepare(`
    SELECT contact_id, hex(request_digest) AS digest_hex
    FROM contact_capture
    WHERE branch_id = ? AND client_request_id = ?
    LIMIT 1
  `).bind(access.activeBranch.branchId, idempotencyKey).first<{ contact_id: string; digest_hex: string }>();
  if (existing) {
    if (existing.digest_hex.toLowerCase() !== digestHex) {
      return json(409, { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" } }, requestId, origin);
    }
    return json(200, { ok: true, contact_id: existing.contact_id, idempotent_replay: true }, requestId, origin);
  }

  const contactId = crypto.randomUUID();
  const captureId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const digestBytes = new Uint8Array(digestHex.match(/.{2}/g)!.map((pair) => parseInt(pair, 16)));
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO contact
          (id, branch_id, first_name, last_name, preferred_name, phone_e164,
           email_normalized, age_range, preferred_language, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        contactId, access.activeBranch.branchId, firstName, lastName, preferredName,
        phone, email, ageRange, preferredLanguage, access.staff.userId, now, now,
      ),
      env.DB.prepare(`
        INSERT INTO contact_capture
          (id, contact_id, branch_id, captured_by, capture_source, service_area_id,
           client_request_id, digest_key_version, request_digest, captured_at, source_metadata, created_at)
        VALUES (?, ?, ?, ?, 'staff_manual', ?, ?, 1, ?, ?, ?, ?)
      `).bind(
        captureId, contactId, access.activeBranch.branchId, access.staff.userId,
        serviceAreaId, idempotencyKey, digestBytes, now, JSON.stringify(metadata), now,
      ),
      env.DB.prepare(`
        INSERT INTO contact_assignment
          (id, contact_id, branch_id, assignee_user_id, assigned_by, starts_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Auto-assigned to the capturing staff member', ?)
      `).bind(
        assignmentId, contactId, access.activeBranch.branchId, access.staff.userId,
        access.staff.userId, now, now,
      ),
    ]);
    if (results.some((result) => !result.success) || results.some((result) => (result.meta?.changes ?? 0) !== 1)) {
      throw new Error("CONTACT_CAPTURE_BATCH_FAILED");
    }
  } catch {
    const raced = await env.DB.prepare(`
      SELECT contact_id, hex(request_digest) AS digest_hex
      FROM contact_capture WHERE branch_id = ? AND client_request_id = ? LIMIT 1
    `).bind(access.activeBranch.branchId, idempotencyKey).first<{ contact_id: string; digest_hex: string }>();
    if (raced && raced.digest_hex.toLowerCase() === digestHex) {
      return json(200, { ok: true, contact_id: raced.contact_id, idempotent_replay: true }, requestId, origin);
    }
    return json(409, { ok: false, error: { code: "CONTACT_CAPTURE_CONFLICT" } }, requestId, origin);
  }
  return json(201, { ok: true, contact_id: contactId, idempotent_replay: false }, requestId, origin);
}

async function getContact(
  request: Request,
  env: Env,
  contactId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const resource = await contactResourceContext(request, env, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env, "contacts.read", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const scope = access.decision.scopeMode as ContactScopeMode;
  const now = new Date().toISOString();
  const predicate = contactScopePredicate(scope, "c", access.staff.profileId, access.staff.userId, access.activeBranch.branchId, now);
  const details = await authorizeRequestCapability(request, env, "contacts.contact_details.read", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  const includeDetails = details.state === "authorized";
  const privateFields = await authorizeRequestCapability(request, env, "contacts.private_fields.read", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  const includePrivate = privateFields.state === "authorized";
  const privatePredicate = contactScopePredicate(
    includePrivate ? privateFields.decision.scopeMode as ContactScopeMode : null,
    "c", access.staff.profileId, access.staff.userId, access.activeBranch.branchId, now,
  );
  const detailPredicate = contactScopePredicate(
    includeDetails ? details.decision.scopeMode as ContactScopeMode : null,
    "c", access.staff.profileId, access.staff.userId, access.activeBranch.branchId, now,
  );
  const row = await env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.age_range ELSE NULL END AS age_range,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.preferred_language ELSE NULL END AS preferred_language,
           c.contact_status, c.created_at, c.updated_at
    FROM contact c
    WHERE c.id = ? AND c.branch_id = ? AND (${predicate.sql})
    LIMIT 1
  `).bind(
    includeDetails ? 1 : 0, ...detailPredicate.values,
    includeDetails ? 1 : 0, ...detailPredicate.values,
    includePrivate ? 1 : 0, ...privatePredicate.values,
    includePrivate ? 1 : 0, ...privatePredicate.values,
    contactId, access.activeBranch.branchId, ...predicate.values,
  ).first<Record<string, unknown>>();
  if (!row) return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, requestId, origin);
  return json(200, { ok: true, contact: row }, requestId, origin);
}

async function updateContact(
  request: Request,
  env: Env,
  contactId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const resource = await contactResourceContext(request, env, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env, "contacts.update", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as Record<string, unknown>;
  const allowed = new Set(["first_name","last_name","preferred_name","phone_e164","email","age_range","preferred_language","contact_status"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length === 0 || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_UPDATE" } }, requestId, origin);
  }
  const values: Record<string, string | null> = {};
  const hasPrivateFields = Object.hasOwn(payload, "age_range") || Object.hasOwn(payload, "preferred_language");
  const hasContactDetails = Object.hasOwn(payload, "phone_e164") || Object.hasOwn(payload, "email");
  let privateFieldAccess: Awaited<ReturnType<typeof authorizeRequestCapability>> | null = null;
  let detailFieldAccess: Awaited<ReturnType<typeof authorizeRequestCapability>> | null = null;
  if (hasPrivateFields) {
    privateFieldAccess = await authorizeRequestCapability(request, env, "contacts.private_fields.update", {
      type: "contact", recordId: contactId, teamId: resource.teamId,
    });
    if (privateFieldAccess.state !== "authorized") {
      return json(403, { ok: false, error: { code: "PRIVATE_CONTACT_FIELDS_FORBIDDEN" } }, requestId, origin);
    }
  }
  if (hasContactDetails) {
    detailFieldAccess = await authorizeRequestCapability(request, env, "contacts.contact_details.read", {
      type: "contact", recordId: contactId, teamId: resource.teamId,
    });
    if (detailFieldAccess.state !== "authorized") {
      return json(403, { ok: false, error: { code: "CONTACT_DETAILS_FORBIDDEN" } }, requestId, origin);
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && typeof value !== "string") {
      return json(400, { ok: false, error: { code: "INVALID_CONTACT_UPDATE_VALUE" } }, requestId, origin);
    }
    const normalized = typeof value === "string" ? value.trim() : null;
    if (key === "first_name" && (!normalized || normalized.length > 120)) {
      return json(400, { ok: false, error: { code: "INVALID_FIRST_NAME" } }, requestId, origin);
    }
    if (key === "last_name" && normalized !== null && normalized.length > 120) {
      return json(400, { ok: false, error: { code: "INVALID_LAST_NAME" } }, requestId, origin);
    }
    if (key === "preferred_name" && normalized !== null && normalized.length > 120) {
      return json(400, { ok: false, error: { code: "INVALID_PREFERRED_NAME" } }, requestId, origin);
    }
    if (key === "phone_e164" && normalized !== null && !/^\+[1-9]\d{7,14}$/.test(normalized)) {
      return json(400, { ok: false, error: { code: "INVALID_PHONE" } }, requestId, origin);
    }
    if (key === "email" && normalized !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
      return json(400, { ok: false, error: { code: "INVALID_EMAIL" } }, requestId, origin);
    }
    if (key === "age_range" && normalized !== null && normalized.length > 50) {
      return json(400, { ok: false, error: { code: "INVALID_AGE_RANGE" } }, requestId, origin);
    }
    if (key === "preferred_language" && normalized !== null && normalized.length > 60) {
      return json(400, { ok: false, error: { code: "INVALID_LANGUAGE" } }, requestId, origin);
    }
    if (key === "contact_status" && normalized !== "active" && normalized !== "archived") {
      return json(400, { ok: false, error: { code: "INVALID_CONTACT_STATUS" } }, requestId, origin);
    }
    const column = key === "email" ? "email_normalized" : key;
    values[column] = key === "email" && normalized !== null ? normalized.toLowerCase() : normalized;
  }
  const assignments = Object.keys(values).map((key) => `${key} = ?`);
  const now = new Date().toISOString();
  assignments.push("updated_at = ?");
  const predicate = contactScopePredicate(access.decision.scopeMode as ContactScopeMode, "contact", access.staff.profileId, access.staff.userId, access.activeBranch.branchId, now);
  const additionalPredicates: string[] = [];
  const additionalValues: unknown[] = [];
  if (privateFieldAccess?.state === "authorized") {
    const privatePredicate = contactScopePredicate(
      privateFieldAccess.decision.scopeMode as ContactScopeMode, "contact",
      access.staff.profileId, access.staff.userId, access.activeBranch.branchId, now,
    );
    additionalPredicates.push(privatePredicate.sql);
    additionalValues.push(...privatePredicate.values);
  }
  if (detailFieldAccess?.state === "authorized") {
    const detailPredicate = contactScopePredicate(
      detailFieldAccess.decision.scopeMode as ContactScopeMode, "contact",
      access.staff.profileId, access.staff.userId, access.activeBranch.branchId, now,
    );
    additionalPredicates.push(detailPredicate.sql);
    additionalValues.push(...detailPredicate.values);
  }
  const result = await env.DB.prepare(`
    UPDATE contact SET ${assignments.join(", ")}
    WHERE id = ? AND branch_id = ? AND contact_status <> 'merged'
      AND (${predicate.sql})
      ${additionalPredicates.map((sql) => `AND (${sql})`).join(" ")}
  `).bind(
    ...Object.values(values), now, contactId, access.activeBranch.branchId,
    ...predicate.values, ...additionalValues,
  ).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) {
    return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND_OR_NOT_ACCESSIBLE" } }, requestId, origin);
  }
  return json(200, { ok: true, contact_id: contactId, updated_at: now }, requestId, origin);
}


async function assignContact(
  request: Request,
  env: Env,
  contactId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "contacts.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { assignee_profile_id?: unknown; team_id?: unknown; reason?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !["assignee_profile_id","team_id","reason"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_BODY" } }, requestId, origin);
  }
  const assigneeProfileId = typeof payload.assignee_profile_id === "string" ? payload.assignee_profile_id.trim() : "";
  const teamId = typeof payload.team_id === "string" ? payload.team_id.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!!assigneeProfileId === !!teamId || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_TARGET" } }, requestId, origin);
  }

  const now = new Date().toISOString();
  const contact = await env.DB.prepare(
    "SELECT id FROM contact WHERE id = ? AND branch_id = ? AND contact_status = 'active' LIMIT 1",
  ).bind(contactId, access.activeBranch.branchId).first<{ id: string }>();
  if (!contact) return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, requestId, origin);

  let assigneeUserId: string | null = null;
  let selectedTeamId: string | null = null;
  if (assigneeProfileId) {
    const target = await env.DB.prepare(`
      SELECT sp.auth_user_id
      FROM staff_profile sp
      WHERE sp.id = ? AND sp.account_status = 'active'
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          WHERE ra.staff_profile_id = sp.id
            AND ra.branch_id = ?
            AND ra.revoked_at IS NULL
            AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        )
      LIMIT 1
    `).bind(assigneeProfileId, access.activeBranch.branchId, now, now).first<{ auth_user_id: string }>();
    if (!target) return json(400, { ok: false, error: { code: "ASSIGNEE_NOT_ACTIVE_IN_BRANCH" } }, requestId, origin);
    assigneeUserId = target.auth_user_id;
  } else {
    const targetTeam = await env.DB.prepare(
      "SELECT id FROM team WHERE id = ? AND branch_id = ? AND is_active = 1 LIMIT 1",
    ).bind(teamId, access.activeBranch.branchId).first<{ id: string }>();
    if (!targetTeam) return json(400, { ok: false, error: { code: "TEAM_NOT_ACTIVE_IN_BRANCH" } }, requestId, origin);
    selectedTeamId = targetTeam.id;
  }

  const future = await env.DB.prepare(`
    SELECT id FROM contact_assignment
    WHERE contact_id = ? AND branch_id = ?
      AND starts_at > ?
      AND (ends_at IS NULL OR ends_at > ?)
    LIMIT 1
  `).bind(contactId, access.activeBranch.branchId, now, now).first<{ id: string }>();
  if (future) {
    return json(409, { ok: false, error: { code: "FUTURE_ASSIGNMENT_EXISTS" } }, requestId, origin);
  }

  const transitionAt = new Date(Date.now() + 1000).toISOString();
  const assignmentId = crypto.randomUUID();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE contact_assignment
        SET ends_at = ?, ended_by = ?, reason = ?
        WHERE contact_id = ? AND branch_id = ?
          AND starts_at <= ?
          AND (ends_at IS NULL OR ends_at > ?)
      `).bind(
        transitionAt, access.staff.userId, reason,
        contactId, access.activeBranch.branchId, now, transitionAt,
      ),
      env.DB.prepare(`
        INSERT INTO contact_assignment
          (id, contact_id, branch_id, assignee_user_id, team_id, assigned_by, starts_at, reason, created_at)
        SELECT ?, c.id, c.branch_id, ?, ?, ?, ?, ?, ?
        FROM contact c
        WHERE c.id = ? AND c.branch_id = ? AND c.contact_status = 'active'
      `).bind(
        assignmentId, assigneeUserId, selectedTeamId, access.staff.userId,
        transitionAt, reason, transitionAt, contactId, access.activeBranch.branchId,
      ),
    ]);
    if (results.some((result) => !result.success) || (results[1]?.meta?.changes ?? 0) !== 1) {
      throw new Error("CONTACT_ASSIGNMENT_BATCH_FAILED");
    }
  } catch {
    return json(409, { ok: false, error: { code: "CONTACT_ASSIGNMENT_CONFLICT" } }, requestId, origin);
  }
  return json(201, {
    ok: true,
    assignment_id: assignmentId,
    assignee_profile_id: assigneeProfileId || null,
    team_id: selectedTeamId,
    starts_at: transitionAt,
  }, requestId, origin);
}

async function listContactInteractions(
  request: Request,
  env: Env,
  contactId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const resource = await contactResourceContext(request, env, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env, "contacts.read", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  const now = new Date().toISOString();
  const predicate = contactScopePredicate(
    access.decision.scopeMode as ContactScopeMode,
    "c",
    access.staff.profileId,
    access.staff.userId,
    access.activeBranch.branchId,
    now,
  );
  const rows = await env.DB.prepare(`
    SELECT i.id, i.interaction_type, i.occurred_at, i.outcome_code,
           i.summary, i.next_action_at, i.actor_user_id,
           actor.full_name AS actor_name, i.created_at
    FROM contact_interaction i
    JOIN contact c ON c.id = i.contact_id AND c.branch_id = i.branch_id
    LEFT JOIN staff_profile actor ON actor.auth_user_id = i.actor_user_id
    WHERE i.contact_id = ? AND i.branch_id = ?
      AND c.contact_status <> 'merged'
      AND (${predicate.sql})
    ORDER BY i.occurred_at DESC, i.id DESC
    LIMIT 100
  `).bind(
    contactId,
    access.activeBranch.branchId,
    ...predicate.values,
  ).all<{
    id: string;
    interaction_type: string;
    occurred_at: string;
    outcome_code: string | null;
    summary: string | null;
    next_action_at: string | null;
    actor_user_id: string;
    actor_name: string | null;
    created_at: string;
  }>();
  return json(200, { ok: true, interactions: rows.results ?? [] }, requestId, origin);
}

async function createContactInteraction(
  request: Request,
  env: Env,
  contactId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const resource = await contactResourceContext(request, env, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env, "contacts.interaction.create", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as {
    interaction_type?: unknown; occurred_at?: unknown; outcome_code?: unknown;
    summary?: unknown; next_action_at?: unknown;
  };
  const allowed = new Set(["interaction_type","occurred_at","outcome_code","summary","next_action_at"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_INTERACTION_BODY" } }, requestId, origin);
  }
  const type = typeof payload.interaction_type === "string" ? payload.interaction_type : "";
  const occurredAt = payload.occurred_at === undefined ? new Date().toISOString() : parseIsoTimestamp(payload.occurred_at, "");
  const outcome = typeof payload.outcome_code === "string" ? payload.outcome_code.trim() || null : null;
  const summary = typeof payload.summary === "string" ? payload.summary.trim() || null : null;
  const nextActionAt = payload.next_action_at === undefined || payload.next_action_at === null || payload.next_action_at === ""
    ? null : parseIsoTimestamp(payload.next_action_at, "");
  if (
    !["call","visit","message","meeting","other"].includes(type) || !occurredAt ||
    (payload.outcome_code !== undefined && payload.outcome_code !== null && typeof payload.outcome_code !== "string") ||
    (outcome !== null && !/^[a-z][a-z0-9_]{1,59}$/.test(outcome)) ||
    (payload.summary !== undefined && payload.summary !== null && typeof payload.summary !== "string") ||
    (summary !== null && summary.length > 1000) ||
    (payload.next_action_at !== undefined && payload.next_action_at !== null && payload.next_action_at !== "" && !nextActionAt)
  ) {
    return json(400, { ok: false, error: { code: "INVALID_INTERACTION_DETAILS" } }, requestId, origin);
  }
  const interactionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const predicate = contactScopePredicate(access.decision.scopeMode as ContactScopeMode, "c", access.staff.profileId, access.staff.userId, access.activeBranch.branchId, now);
  const result = await env.DB.prepare(`
    INSERT INTO contact_interaction
      (id, contact_id, branch_id, actor_user_id, interaction_type, occurred_at,
       outcome_code, summary, next_action_at, created_at)
    SELECT ?, c.id, c.branch_id, ?, ?, ?, ?, ?, ?, ?
    FROM contact c
    WHERE c.id = ? AND c.branch_id = ? AND c.contact_status <> 'merged'
      AND (${predicate.sql})
  `).bind(
    interactionId, access.staff.userId, type, occurredAt, outcome, summary,
    nextActionAt, now, contactId, access.activeBranch.branchId, ...predicate.values,
  ).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) {
    return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND_OR_NOT_ACCESSIBLE" } }, requestId, origin);
  }
  return json(201, { ok: true, interaction_id: interactionId }, requestId, origin);
}


async function listContactNotes(
  request: Request,
  env: Env,
  contactId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const resource = await contactResourceContext(request, env, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env, "contacts.read", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const now = new Date().toISOString();
  const scope = access.decision.scopeMode;
  const rows = await env.DB.prepare(`
    SELECT n.id, n.author_user_id, author.full_name AS author_name,
           n.body, n.visibility, n.team_id, n.created_at, n.updated_at
    FROM contact_note n
    JOIN contact c ON c.id = n.contact_id AND c.branch_id = n.branch_id
    JOIN staff_profile author ON author.auth_user_id = n.author_user_id
    WHERE n.contact_id = ? AND n.branch_id = ? AND (${contactScopePredicate(
      access.decision.scopeMode as ContactScopeMode, "c", access.staff.profileId, access.staff.userId,
      access.activeBranch.branchId, now,
    ).sql})
      AND (
        (n.visibility = 'author_only' AND n.author_user_id = ?)
        OR (n.visibility = 'branch_scope' AND ? = 'branch')
        OR (n.visibility = 'assigned_scope' AND EXISTS (
          SELECT 1 FROM contact_assignment ca
          WHERE ca.contact_id = n.contact_id AND ca.branch_id = n.branch_id
            AND ca.assignee_user_id = ? AND ca.starts_at <= ?
            AND (ca.ends_at IS NULL OR ca.ends_at > ?)
        ))
        OR (n.visibility = 'team_scope' AND EXISTS (
          SELECT 1 FROM staff_team_membership tm
          WHERE tm.team_id = n.team_id AND tm.branch_id = n.branch_id
            AND tm.staff_profile_id = ? AND tm.revoked_at IS NULL
            AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        ))
      )
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 100
  `).bind(
    contactId, access.activeBranch.branchId,
    ...contactScopePredicate(
      access.decision.scopeMode as ContactScopeMode, "c", access.staff.profileId, access.staff.userId,
      access.activeBranch.branchId, now,
    ).values,
    access.staff.userId, scope,
    access.staff.userId, now, now,
    access.staff.profileId, now, now,
  ).all<{
    id: string; author_user_id: string; author_name: string; body: string;
    visibility: string; team_id: string | null; created_at: string; updated_at: string;
  }>();
  return json(200, { ok: true, notes: rows.results ?? [] }, requestId, origin);
}

async function createContactNote(
  request: Request,
  env: Env,
  contactId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const resource = await contactResourceContext(request, env, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env, "contacts.note.create", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { body?: unknown; visibility?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== "body" && key !== "visibility")) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_NOTE_BODY" } }, requestId, origin);
  }
  const noteBody = typeof payload.body === "string" ? payload.body.trim() : "";
  const visibility = payload.visibility === undefined
    ? access.decision.scopeMode === "branch" ? "branch_scope"
      : access.decision.scopeMode === "team" ? "team_scope" : "assigned_scope"
    : payload.visibility;
  if (!noteBody || noteBody.length > 4000 ||
      !["author_only","assigned_scope","team_scope","branch_scope"].includes(String(visibility))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_NOTE_DETAILS" } }, requestId, origin);
  }
  const scope = access.decision.scopeMode ?? "";
  if (
    (visibility === "branch_scope" && scope !== "branch") ||
    (visibility === "team_scope" && (scope !== "team" || !resource.teamId)) ||
    (visibility === "assigned_scope" && scope !== "assigned") ||
    (visibility === "author_only" && !["branch","team","assigned"].includes(scope))
  ) {
    return json(403, { ok: false, error: { code: "NOTE_VISIBILITY_EXCEEDS_ACCESS_SCOPE" } }, requestId, origin);
  }
  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();
  const predicate = contactScopePredicate(scope as ContactScopeMode, "c", access.staff.profileId, access.staff.userId, access.activeBranch.branchId, now);
  const result = await env.DB.prepare(`
    INSERT INTO contact_note
      (id, contact_id, branch_id, author_user_id, body, visibility, team_id, created_at, updated_at)
    SELECT ?, c.id, c.branch_id, ?, ?, ?, ?, ?, ?
    FROM contact c
    WHERE c.id = ? AND c.branch_id = ? AND c.contact_status <> 'merged'
      AND (${predicate.sql})
  `).bind(
    noteId, access.staff.userId, noteBody, visibility,
    visibility === "team_scope" ? resource.teamId : null,
    now, now, contactId, access.activeBranch.branchId, ...predicate.values,
  ).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) {
    return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, requestId, origin);
  }
  return json(201, { ok: true, note_id: noteId, visibility }, requestId, origin);
}


type FollowupScopeMode = "branch" | "team" | "assigned";

function followupScopePredicate(
  mode: FollowupScopeMode | null,
  alias: string,
  staffProfileId: string,
  staffUserId: string,
  now: string,
): { sql: string; values: unknown[] } {
  if (mode === "branch") return { sql: "1 = 1", values: [] };
  if (mode === "assigned") return {
    sql: `${alias}.assignee_user_id = ?`,
    values: [staffUserId],
  };
  if (mode === "team") return {
    sql: `EXISTS (
      SELECT 1
      FROM staff_team_membership leader
      WHERE leader.staff_profile_id = ?
        AND leader.branch_id = ${alias}.branch_id
        AND leader.membership_role = 'leader'
        AND leader.revoked_at IS NULL
        AND leader.starts_at <= ?
        AND (leader.ends_at IS NULL OR leader.ends_at > ?)
        AND (
          leader.team_id = ${alias}.team_id
          OR EXISTS (
            SELECT 1
            FROM staff_profile assigned_staff
            JOIN staff_team_membership member
              ON member.staff_profile_id = assigned_staff.id
            WHERE assigned_staff.auth_user_id = ${alias}.assignee_user_id
              AND assigned_staff.account_status = 'active'
              AND member.team_id = leader.team_id
              AND member.branch_id = ${alias}.branch_id
              AND member.revoked_at IS NULL
              AND member.starts_at <= ?
              AND (member.ends_at IS NULL OR member.ends_at > ?)
          )
        )
    )`,
    values: [staffProfileId, now, now, now, now],
  };
  return { sql: "0 = 1", values: [] };
}

async function listFollowupTasks(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const readScope = bestScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "followup.read")
    .map((grant) => grant.scopeMode));
  if (!readScope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const detailScope = bestScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "contacts.contact_details.read")
    .map((grant) => grant.scopeMode));
  const now = new Date().toISOString();
  const readPredicate = followupScopePredicate(readScope, "ft", context.staff.profileId, context.staff.userId, now);
  const detailPredicate = followupScopePredicate(detailScope, "ft", context.staff.profileId, context.staff.userId, now);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!["open","in_progress","completed","cancelled","all"].includes(status) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [...url.searchParams.keys()].some((key) => !["status","limit"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_QUERY" } }, requestId, origin);
  }
  const statusPredicate = status === "all" ? "1 = 1" : "ft.status = ?";
  const rows = await env.DB.prepare(`
    SELECT ft.id, ft.contact_id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email,
           ft.list_id, fl.title AS list_title, ft.assignee_user_id,
           assignee.full_name AS assignee_name, ft.team_id, t.name AS team_name,
           ft.priority, ft.due_at, ft.status, ft.task_note, ft.completed_at,
           ft.created_at, ft.updated_at
    FROM followup_task ft
    JOIN contact c ON c.id = ft.contact_id AND c.branch_id = ft.branch_id
    LEFT JOIN followup_list fl ON fl.id = ft.list_id AND fl.branch_id = ft.branch_id
    LEFT JOIN staff_profile assignee ON assignee.auth_user_id = ft.assignee_user_id
    LEFT JOIN team t ON t.id = ft.team_id AND t.branch_id = ft.branch_id
    WHERE ft.branch_id = ?
      AND ${statusPredicate}
      AND (${readPredicate.sql})
    ORDER BY CASE WHEN ft.due_at IS NULL THEN 1 ELSE 0 END, ft.due_at ASC, ft.created_at DESC
    LIMIT ?
  `).bind(
    detailScope ? 1 : 0, ...detailPredicate.values,
    detailScope ? 1 : 0, ...detailPredicate.values,
    context.activeBranch.branchId,
    ...(status === "all" ? [] : [status]),
    ...readPredicate.values,
    limit,
  ).all<Record<string, unknown>>();
  return json(200, { ok: true, tasks: rows.results ?? [] }, requestId, origin);
}

async function createFollowupTask(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const createScope = bestScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "followup.create")
    .map((grant) => grant.scopeMode));
  const assignScope = bestScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "followup.assign")
    .map((grant) => grant.scopeMode));
  if (!createScope || !assignScope || createScope === "assigned" || assignScope === "assigned" || createScope !== assignScope) {
    return json(403, { ok: false, error: { code: "FOLLOWUP_CREATE_NOT_AUTHORIZED" } }, requestId, origin);
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return json(400, { ok: false, error: { code: "IDEMPOTENCY_KEY_REQUIRED" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as {
    contact_id?: unknown; assignee_profile_id?: unknown; team_id?: unknown;
    list_id?: unknown; priority?: unknown; due_at?: unknown; task_note?: unknown;
  };
  const allowed = new Set(["contact_id","assignee_profile_id","team_id","list_id","priority","due_at","task_note"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_BODY" } }, requestId, origin);
  }
  const contactId = typeof payload.contact_id === "string" ? payload.contact_id.trim() : "";
  const assigneeProfileId = typeof payload.assignee_profile_id === "string" ? payload.assignee_profile_id.trim() : "";
  const requestedTeamId = typeof payload.team_id === "string" ? payload.team_id.trim() : "";
  const listId = typeof payload.list_id === "string" ? payload.list_id.trim() || null : null;
  const priority = payload.priority === undefined ? 3 : payload.priority;
  const dueAt = payload.due_at === undefined || payload.due_at === null || payload.due_at === ""
    ? null : parseIsoTimestamp(payload.due_at, "");
  const taskNote = typeof payload.task_note === "string" ? payload.task_note.trim() || null : null;
  if (
    !contactId || contactId.length > 128 ||
    (!!assigneeProfileId === !!requestedTeamId) ||
    (payload.priority !== undefined && typeof payload.priority !== "number") ||
    !Number.isInteger(priority) || Number(priority) < 1 || Number(priority) > 5 ||
    (payload.list_id !== undefined && payload.list_id !== null && typeof payload.list_id !== "string") ||
    (payload.due_at !== undefined && payload.due_at !== null && payload.due_at !== "" && !dueAt) ||
    (payload.task_note !== undefined && payload.task_note !== null && typeof payload.task_note !== "string") ||
    (taskNote !== null && taskNote.length > 2000)
  ) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_DETAILS" } }, requestId, origin);
  }

  const now = new Date().toISOString();
  const contact = await env.DB.prepare(
    "SELECT id FROM contact WHERE id = ? AND branch_id = ? AND contact_status = 'active' LIMIT 1",
  ).bind(contactId, context.activeBranch.branchId).first<{ id: string }>();
  if (!contact) return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, requestId, origin);

  let teamIdForScope: string | null = null;
  if (createScope === "team" || assignScope === "team") {
    const team = await env.DB.prepare(`
      SELECT tm.team_id
      FROM staff_team_membership tm
      JOIN contact_assignment ca
        ON ca.team_id = tm.team_id AND ca.branch_id = tm.branch_id
      WHERE tm.staff_profile_id = ? AND tm.branch_id = ?
        AND tm.membership_role = 'leader' AND tm.revoked_at IS NULL
        AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        AND ca.contact_id = ? AND ca.starts_at <= ?
        AND (ca.ends_at IS NULL OR ca.ends_at > ?)
      LIMIT 1
    `).bind(
      context.staff.profileId, context.activeBranch.branchId,
      now, now, contactId, now, now,
    ).first<{ team_id: string }>();
    if (!team) return json(403, { ok: false, error: { code: "CONTACT_NOT_IN_LEADER_TEAM" } }, requestId, origin);
    teamIdForScope = team.team_id;
  }

  let assigneeUserId: string | null = null;
  let teamId: string | null = null;
  if (assigneeProfileId) {
    const target = await env.DB.prepare(`
      SELECT sp.auth_user_id
      FROM staff_profile sp
      WHERE sp.id = ? AND sp.account_status = 'active'
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          WHERE ra.staff_profile_id = sp.id AND ra.branch_id = ?
            AND ra.revoked_at IS NULL AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        )
      LIMIT 1
    `).bind(assigneeProfileId, context.activeBranch.branchId, now, now).first<{ auth_user_id: string }>();
    if (!target) return json(400, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_NOT_ACTIVE" } }, requestId, origin);
    assigneeUserId = target.auth_user_id;
    if (assignScope === "team") {
      const member = await env.DB.prepare(`
        SELECT 1 FROM staff_team_membership tm
        JOIN staff_profile target ON target.id = tm.staff_profile_id
        WHERE tm.team_id = ? AND tm.branch_id = ? AND target.id = ?
          AND tm.revoked_at IS NULL AND tm.starts_at <= ?
          AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        LIMIT 1
      `).bind(teamIdForScope, context.activeBranch.branchId, assigneeProfileId, now, now).first();
      if (!member) return json(403, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_OUTSIDE_TEAM" } }, requestId, origin);
    }
  } else {
    const targetTeam = await env.DB.prepare(
      "SELECT id FROM team WHERE id = ? AND branch_id = ? AND is_active = 1 LIMIT 1",
    ).bind(requestedTeamId, context.activeBranch.branchId).first<{ id: string }>();
    if (!targetTeam) return json(400, { ok: false, error: { code: "FOLLOWUP_TEAM_NOT_ACTIVE" } }, requestId, origin);
    teamId = targetTeam.id;
    if (assignScope === "team" && teamId !== teamIdForScope) {
      return json(403, { ok: false, error: { code: "FOLLOWUP_TEAM_OUTSIDE_SCOPE" } }, requestId, origin);
    }
  }

  if (createScope === "team" && teamIdForScope === null) {
    return json(403, { ok: false, error: { code: "FOLLOWUP_TEAM_SCOPE_REQUIRED" } }, requestId, origin);
  }
  if (listId) {
    const list = await env.DB.prepare(
      "SELECT id, team_id FROM followup_list WHERE id = ? AND branch_id = ? AND status = 'active' LIMIT 1",
    ).bind(listId, context.activeBranch.branchId).first<{ id: string; team_id: string | null }>();
    if (!list || (assignScope === "team" && list.team_id !== null && list.team_id !== teamIdForScope)) {
      return json(400, { ok: false, error: { code: "FOLLOWUP_LIST_NOT_AVAILABLE" } }, requestId, origin);
    }
  }

  const digestPayload = {
    branch_id: context.activeBranch.branchId, contact_id: contactId,
    assignee_user_id: assigneeUserId, team_id: teamId, list_id: listId,
    priority, due_at: dueAt, task_note: taskNote,
  };
  const digestHex = await sha256Hex(JSON.stringify(digestPayload));
  const existing = await env.DB.prepare(`
    SELECT id, hex(request_digest) AS digest_hex
    FROM followup_task
    WHERE branch_id = ? AND client_request_id = ? LIMIT 1
  `).bind(context.activeBranch.branchId, idempotencyKey).first<{ id: string; digest_hex: string }>();
  if (existing) {
    if (existing.digest_hex.toLowerCase() !== digestHex) {
      return json(409, { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" } }, requestId, origin);
    }
    return json(200, { ok: true, task_id: existing.id, idempotent_replay: true }, requestId, origin);
  }

  const taskId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const digestBytes = new Uint8Array(digestHex.match(/.{2}/g)!.map((pair) => parseInt(pair, 16)));
  const contactPredicate = contactScopePredicate(
    createScope, "c", context.staff.profileId, context.staff.userId, context.activeBranch.branchId, now,
  );
  const targetPredicate = assigneeUserId !== null
    ? `EXISTS (
        SELECT 1 FROM staff_profile target
        JOIN staff_role_assignment target_assignment ON target_assignment.staff_profile_id = target.id
        JOIN role target_role ON target_role.id = target_assignment.role_id AND target_role.is_active = 1
        WHERE target.auth_user_id = ?
          AND target.account_status = 'active'
          AND target_assignment.branch_id = c.branch_id
          AND target_assignment.revoked_at IS NULL
          AND target_assignment.starts_at <= ?
          AND (target_assignment.ends_at IS NULL OR target_assignment.ends_at > ?)
          ${assignScope === "team" ? `AND EXISTS (
            SELECT 1 FROM staff_team_membership target_member
            WHERE target_member.staff_profile_id = target.id
              AND target_member.team_id = ?
              AND target_member.branch_id = c.branch_id
              AND target_member.revoked_at IS NULL
              AND target_member.starts_at <= ?
              AND (target_member.ends_at IS NULL OR target_member.ends_at > ?)
          )` : ""}
      )`
    : `EXISTS (
        SELECT 1 FROM team target_team
        WHERE target_team.id = ? AND target_team.branch_id = c.branch_id
          AND target_team.is_active = 1
          ${assignScope === "team" ? "AND target_team.id = ?" : ""}
      )`;
  const targetValues = assigneeUserId !== null
    ? assignScope === "team" ? [assigneeUserId, now, now, teamIdForScope, now, now] : [assigneeUserId, now, now]
    : assignScope === "team" ? [teamId, teamIdForScope] : [teamId];
  const listScopeTeamId = teamId ?? teamIdForScope;
  const listPredicate = listId === null
    ? "1 = 1"
    : `EXISTS (
        SELECT 1 FROM followup_list target_list
        WHERE target_list.id = ? AND target_list.branch_id = c.branch_id
          AND target_list.status = 'active'
          AND (target_list.team_id IS NULL OR target_list.team_id = ?)
      )`;
  const listValues = listId === null ? [] : [listId, listScopeTeamId];
  const actorCapabilityPredicate = (code: string) => `EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment actor_assignment ON actor_assignment.staff_profile_id = actor.id
    JOIN role actor_role ON actor_role.id = actor_assignment.role_id AND actor_role.is_active = 1
    JOIN role_capability actor_grant ON actor_grant.role_id = actor_role.id
    JOIN capability actor_capability ON actor_capability.id = actor_grant.capability_id
      AND actor_capability.is_active = 1 AND actor_capability.code = '${code}'
    WHERE actor.auth_user_id = ?
      AND actor.account_status = 'active'
      AND actor_assignment.branch_id = c.branch_id
      AND actor_assignment.revoked_at IS NULL
      AND actor_assignment.starts_at <= ?
      AND (actor_assignment.ends_at IS NULL OR actor_assignment.ends_at > ?)
      AND actor_grant.scope_mode = '${createScope}'
  )`;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO followup_task
          (id, list_id, contact_id, branch_id, assignee_user_id, team_id, priority,
           due_at, status, task_note, created_by, completed_at, created_at, updated_at,
           client_request_id, digest_key_version, request_digest)
        SELECT ?, ?, c.id, c.branch_id, ?, ?, ?, ?, 'open', ?, ?, NULL, ?, ?, ?, 1, ?
        FROM contact c
        WHERE c.id = ? AND c.branch_id = ? AND c.contact_status = 'active'
          AND (${contactPredicate.sql})
          AND (${targetPredicate})
          AND (${listPredicate})
          AND (${actorCapabilityPredicate("followup.create")})
          AND (${actorCapabilityPredicate("followup.assign")})
      `).bind(
        taskId, listId, assigneeUserId, teamId, priority, dueAt, taskNote,
        context.staff.userId, now, now, idempotencyKey, digestBytes,
        contactId, context.activeBranch.branchId, ...contactPredicate.values,
        ...targetValues, ...listValues,
        context.staff.userId, now, now,
        context.staff.userId, now, now,
      ),
      env.DB.prepare(`
        INSERT INTO followup_task_event
          (id, task_id, actor_user_id, event_type, from_status, to_status, details, created_at)
        VALUES (?, ?, ?, 'created', NULL, 'open', ?, ?)
      `).bind(
        eventId, taskId, context.staff.userId,
        JSON.stringify({ priority, due_at: dueAt, list_id: listId, team_id: teamId }),
        now,
      ),
    ]);
    if (results.some((result) => !result.success) ||
        results.some((result) => (result.meta?.changes ?? 0) !== 1)) {
      throw new Error("FOLLOWUP_TASK_CREATE_FAILED");
    }
  } catch {
    const raced = await env.DB.prepare(`
      SELECT id, hex(request_digest) AS digest_hex
      FROM followup_task WHERE branch_id = ? AND client_request_id = ? LIMIT 1
    `).bind(context.activeBranch.branchId, idempotencyKey).first<{ id: string; digest_hex: string }>();
    if (raced && raced.digest_hex.toLowerCase() === digestHex) {
      return json(200, { ok: true, task_id: raced.id, idempotent_replay: true }, requestId, origin);
    }
    return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_CREATE_CONFLICT" } }, requestId, origin);
  }
  return json(201, { ok: true, task_id: taskId, status: "open", idempotent_replay: false }, requestId, origin);
}

async function updateFollowupTask(
  request: Request,
  env: Env,
  taskId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const now = new Date().toISOString();
  const task = await env.DB.prepare(`
    SELECT id, status, team_id, assignee_user_id
    FROM followup_task
    WHERE id = ? AND branch_id = ?
    LIMIT 1
  `).bind(taskId, context.activeBranch.branchId).first<{
    id: string; status: string; team_id: string | null; assignee_user_id: string | null;
  }>();
  if (!task) return json(404, { ok: false, error: { code: "FOLLOWUP_TASK_NOT_FOUND" } }, requestId, origin);

  let teamId = task.team_id ?? undefined;
  if (!teamId && task.assignee_user_id) {
    const membership = await env.DB.prepare(`
      SELECT tm.team_id
      FROM staff_team_membership tm
      JOIN staff_profile assignee ON assignee.auth_user_id = ?
      JOIN staff_team_membership member
        ON member.staff_profile_id = assignee.id AND member.team_id = tm.team_id
      WHERE tm.staff_profile_id = ? AND tm.branch_id = ?
        AND tm.membership_role = 'leader' AND tm.revoked_at IS NULL
        AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        AND member.revoked_at IS NULL
        AND member.starts_at <= ? AND (member.ends_at IS NULL OR member.ends_at > ?)
      LIMIT 1
    `).bind(
      task.assignee_user_id, context.staff.profileId, context.activeBranch.branchId,
      now, now, now, now,
    ).first<{ team_id: string }>();
    teamId = membership?.team_id;
  }

  const access = await authorizeRequestCapability(request, env, "followup.update", {
    type: "followup_task", recordId: taskId, teamId,
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { status?: unknown; priority?: unknown; due_at?: unknown; task_note?: unknown };
  const allowed = new Set(["status","priority","due_at","task_note"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length === 0 || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_UPDATE" } }, requestId, origin);
  }

  const nextStatus = payload.status === undefined ? task.status : payload.status;
  const transitions: Record<string, string[]> = {
    open: ["in_progress","completed","cancelled"],
    in_progress: ["open","completed","cancelled"],
    completed: ["open"],
    cancelled: ["open"],
  };
  if (typeof nextStatus !== "string" ||
      (nextStatus !== task.status && !(transitions[task.status] ?? []).includes(nextStatus))) {
    return json(409, { ok: false, error: { code: "INVALID_FOLLOWUP_STATUS_TRANSITION" } }, requestId, origin);
  }
  const priority = payload.priority === undefined ? undefined : payload.priority;
  if (priority !== undefined && (typeof priority !== "number" || !Number.isInteger(priority) || priority < 1 || priority > 5)) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_PRIORITY" } }, requestId, origin);
  }
  const dueAt = payload.due_at === undefined ? undefined :
    payload.due_at === null || payload.due_at === "" ? null : parseIsoTimestamp(payload.due_at, "");
  if (payload.due_at !== undefined && payload.due_at !== null && payload.due_at !== "" && !dueAt) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_DUE_DATE" } }, requestId, origin);
  }
  const taskNote = payload.task_note === undefined ? undefined :
    payload.task_note === null ? null : typeof payload.task_note === "string" ? payload.task_note.trim() || null : "";
  if (taskNote === "" || (taskNote !== undefined && taskNote !== null && taskNote.length > 2000)) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_NOTE" } }, requestId, origin);
  }

  const assignments: string[] = ["status = ?", "completed_at = ?", "updated_at = ?"];
  const values: unknown[] = [
    nextStatus,
    nextStatus === "completed" ? now : null,
    now,
  ];
  if (priority !== undefined) { assignments.push("priority = ?"); values.push(priority); }
  if (dueAt !== undefined) { assignments.push("due_at = ?"); values.push(dueAt); }
  if (taskNote !== undefined) { assignments.push("task_note = ?"); values.push(taskNote); }

  const predicate = followupScopePredicate(
    access.decision.scopeMode as FollowupScopeMode, "ft",
    access.staff.profileId, access.staff.userId, now,
  );
  const eventType = nextStatus !== task.status
    ? nextStatus === "completed" ? "completed"
      : task.status === "completed" && nextStatus === "open" ? "reopened" : "status_changed"
    : taskNote !== undefined ? "note_added" : "details_updated";
  const eventId = crypto.randomUUID();
  const details = JSON.stringify({
    status_changed: nextStatus !== task.status,
    priority_changed: priority !== undefined,
    due_date_changed: dueAt !== undefined,
    note_changed: taskNote !== undefined,
  });
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE followup_task ft
        SET ${assignments.join(", ")}
        WHERE ft.id = ? AND ft.branch_id = ? AND ft.status = ?
          AND (${predicate.sql})
      `).bind(
        ...values, taskId, access.activeBranch.branchId, task.status, ...predicate.values,
      ),
      env.DB.prepare(`
        INSERT INTO followup_task_event
          (id, task_id, actor_user_id, event_type, from_status, to_status, details, created_at)
        SELECT ?, ft.id, ?, ?, ?, ?, ?, ?
        FROM followup_task ft
        WHERE ft.id = ? AND ft.branch_id = ? AND changes() = 1
      `).bind(
        eventId, access.staff.userId, eventType, task.status, nextStatus, details, now,
        taskId, access.activeBranch.branchId,
      ),
    ]);
    if (results.some((result) => !result.success) ||
        (results[0]?.meta?.changes ?? 0) !== 1 ||
        (results[1]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_UPDATE_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, task_id: taskId, status: nextStatus, updated_at: now }, requestId, origin);
}


async function reassignFollowupTask(
  request: Request,
  env: Env,
  taskId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const now = new Date().toISOString();
  const task = await env.DB.prepare(`
    SELECT id, status, team_id, assignee_user_id
    FROM followup_task WHERE id = ? AND branch_id = ? LIMIT 1
  `).bind(taskId, context.activeBranch.branchId).first<{
    id: string; status: string; team_id: string | null; assignee_user_id: string | null;
  }>();
  if (!task) return json(404, { ok: false, error: { code: "FOLLOWUP_TASK_NOT_FOUND" } }, requestId, origin);

  let teamId = task.team_id ?? undefined;
  if (!teamId && task.assignee_user_id) {
    const membership = await env.DB.prepare(`
      SELECT tm.team_id
      FROM staff_team_membership tm
      JOIN staff_profile assignee ON assignee.auth_user_id = ?
      JOIN staff_team_membership member
        ON member.staff_profile_id = assignee.id AND member.team_id = tm.team_id
      WHERE tm.staff_profile_id = ? AND tm.branch_id = ?
        AND tm.membership_role = 'leader' AND tm.revoked_at IS NULL
        AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        AND member.revoked_at IS NULL
        AND member.starts_at <= ? AND (member.ends_at IS NULL OR member.ends_at > ?)
      LIMIT 1
    `).bind(
      task.assignee_user_id, context.staff.profileId, context.activeBranch.branchId,
      now, now, now, now,
    ).first<{ team_id: string }>();
    teamId = membership?.team_id;
  }

  const access = await authorizeRequestCapability(request, env, "followup.assign", {
    type: "followup_task", recordId: taskId, teamId,
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { assignee_profile_id?: unknown; team_id?: unknown; reason?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !["assignee_profile_id","team_id","reason"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_ASSIGNMENT_BODY" } }, requestId, origin);
  }
  const assigneeProfileId = typeof payload.assignee_profile_id === "string" ? payload.assignee_profile_id.trim() : "";
  const requestedTeamId = typeof payload.team_id === "string" ? payload.team_id.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!!assigneeProfileId === !!requestedTeamId || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_ASSIGNMENT_TARGET" } }, requestId, origin);
  }

  let nextAssignee: string | null = null;
  let nextTeam: string | null = null;
  const assignScope = access.decision.scopeMode;
  if (assigneeProfileId) {
    const target = await env.DB.prepare(`
      SELECT sp.auth_user_id
      FROM staff_profile sp
      WHERE sp.id = ? AND sp.account_status = 'active'
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          WHERE ra.staff_profile_id = sp.id AND ra.branch_id = ?
            AND ra.revoked_at IS NULL AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        )
      LIMIT 1
    `).bind(assigneeProfileId, context.activeBranch.branchId, now, now).first<{ auth_user_id: string }>();
    if (!target) return json(400, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_NOT_ACTIVE" } }, requestId, origin);
    if (assignScope === "team") {
      const member = await env.DB.prepare(`
        SELECT 1 FROM staff_team_membership tm
        WHERE tm.staff_profile_id = ? AND tm.team_id = ? AND tm.branch_id = ?
          AND tm.revoked_at IS NULL AND tm.starts_at <= ?
          AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        LIMIT 1
      `).bind(assigneeProfileId, teamId, context.activeBranch.branchId, now, now).first();
      if (!member) return json(403, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_OUTSIDE_TEAM" } }, requestId, origin);
    }
    nextAssignee = target.auth_user_id;
  } else {
    const targetTeam = await env.DB.prepare(
      "SELECT id FROM team WHERE id = ? AND branch_id = ? AND is_active = 1 LIMIT 1",
    ).bind(requestedTeamId, context.activeBranch.branchId).first<{ id: string }>();
    if (!targetTeam) return json(400, { ok: false, error: { code: "FOLLOWUP_TEAM_NOT_ACTIVE" } }, requestId, origin);
    if (assignScope === "team" && targetTeam.id !== teamId) {
      return json(403, { ok: false, error: { code: "FOLLOWUP_TEAM_OUTSIDE_SCOPE" } }, requestId, origin);
    }
    nextTeam = targetTeam.id;
  }

  if (nextAssignee === task.assignee_user_id && nextTeam === task.team_id) {
    return json(409, { ok: false, error: { code: "FOLLOWUP_ASSIGNMENT_UNCHANGED" } }, requestId, origin);
  }
  const predicate = followupScopePredicate(
    access.decision.scopeMode as FollowupScopeMode, "ft",
    access.staff.profileId, access.staff.userId, now,
  );
  const targetPredicate = nextAssignee !== null
    ? `EXISTS (
        SELECT 1 FROM staff_profile target
        JOIN staff_role_assignment ra ON ra.staff_profile_id = target.id
        JOIN role r ON r.id = ra.role_id AND r.is_active = 1
        WHERE target.auth_user_id = ? AND target.account_status = 'active'
          AND ra.branch_id = ft.branch_id AND ra.revoked_at IS NULL
          AND ra.starts_at <= ? AND (ra.ends_at IS NULL OR ra.ends_at > ?)
          ${access.decision.scopeMode === "team" ? `AND EXISTS (
            SELECT 1 FROM staff_team_membership tm
            WHERE tm.staff_profile_id = target.id AND tm.team_id = ?
              AND tm.branch_id = ft.branch_id AND tm.revoked_at IS NULL
              AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
          )` : ""}
      )`
    : `EXISTS (
        SELECT 1 FROM team target_team
        WHERE target_team.id = ? AND target_team.branch_id = ft.branch_id
          AND target_team.is_active = 1
          ${access.decision.scopeMode === "team" ? "AND target_team.id = ?" : ""}
      )`;
  const targetValues = nextAssignee !== null
    ? access.decision.scopeMode === "team" ? [nextAssignee, now, now, teamId, now, now] : [nextAssignee, now, now]
    : access.decision.scopeMode === "team" ? [nextTeam, teamId] : [nextTeam];
  const eventId = crypto.randomUUID();
  const details = JSON.stringify({
    previous_assignee_user_id: task.assignee_user_id,
    previous_team_id: task.team_id,
    assignee_profile_id: assigneeProfileId || null,
    team_id: nextTeam,
    reason,
  });
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE followup_task ft
        SET assignee_user_id = ?, team_id = ?, updated_at = ?
        WHERE ft.id = ? AND ft.branch_id = ? AND (${predicate.sql})
          AND (${targetPredicate})
          AND EXISTS (
            SELECT 1
            FROM staff_profile actor
            JOIN staff_role_assignment actor_assignment ON actor_assignment.staff_profile_id = actor.id
            JOIN role actor_role ON actor_role.id = actor_assignment.role_id AND actor_role.is_active = 1
            JOIN role_capability actor_grant ON actor_grant.role_id = actor_role.id
            JOIN capability actor_capability ON actor_capability.id = actor_grant.capability_id
              AND actor_capability.code = 'followup.assign' AND actor_capability.is_active = 1
            WHERE actor.auth_user_id = ?
              AND actor.account_status = 'active'
              AND actor_assignment.branch_id = ft.branch_id
              AND actor_assignment.revoked_at IS NULL
              AND actor_assignment.starts_at <= ?
              AND (actor_assignment.ends_at IS NULL OR actor_assignment.ends_at > ?)
              AND actor_grant.scope_mode = '${access.decision.scopeMode}'
          )
      `).bind(
        nextAssignee, nextTeam, now, taskId, context.activeBranch.branchId,
        ...predicate.values, ...targetValues,
        access.staff.userId, now, now,
      ),
      env.DB.prepare(`
        INSERT INTO followup_task_event
          (id, task_id, actor_user_id, event_type, from_status, to_status, details, created_at)
        SELECT ?, ft.id, ?, 'reassigned', ?, ?, ?, ?
        FROM followup_task ft
        WHERE ft.id = ? AND ft.branch_id = ? AND changes() = 1
      `).bind(
        eventId, access.staff.userId, task.status, task.status, details, now,
        taskId, context.activeBranch.branchId,
      ),
    ]);
    if (results.some((result) => !result.success) ||
        (results[0]?.meta?.changes ?? 0) !== 1 ||
        (results[1]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "FOLLOWUP_REASSIGNMENT_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, task_id: taskId, assignee_profile_id: assigneeProfileId || null, team_id: nextTeam }, requestId, origin);
}

async function listStaffAudit(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "staff.audit.read");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [...url.searchParams.keys()].some((key) => !["limit", "before", "before_id"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_AUDIT_QUERY" } }, requestId, origin);
  }
  const beforeValue = url.searchParams.get("before");
  const before = beforeValue === null ? new Date().toISOString() : parseIsoTimestamp(beforeValue, "");
  const beforeIdValue = url.searchParams.get("before_id");
  const beforeId = beforeIdValue === null && beforeValue === null ? "~".repeat(128) : beforeIdValue;
  if (!before || !beforeId || beforeId.length > 128 ||
      ((beforeValue === null) !== (beforeIdValue === null))) {
    return json(400, { ok: false, error: { code: "INVALID_AUDIT_CURSOR" } }, requestId, origin);
  }

  const rows = await env.DB.prepare(`
    SELECT * FROM (
      SELECT a.id AS event_id, 'staff_access' AS event_type,
             a.actor_profile_id, actor.full_name AS actor_name,
             a.target_profile_id, target.full_name AS target_name,
             a.action, a.reason, a.metadata, a.created_at
      FROM staff_access_audit a
      JOIN staff_profile actor ON actor.id = a.actor_profile_id
      JOIN staff_profile target ON target.id = a.target_profile_id
      WHERE a.branch_id = ? AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
      UNION ALL
      SELECT a.id, 'staff_account', a.actor_profile_id, actor.full_name,
             a.target_profile_id, target.full_name, a.action, a.reason, a.metadata, a.created_at
      FROM staff_account_audit a
      JOIN staff_profile actor ON actor.id = a.actor_profile_id
      JOIN staff_profile target ON target.id = a.target_profile_id
      WHERE a.branch_id = ? AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
      UNION ALL
      SELECT a.id, 'admin_elevation', a.actor_profile_id, actor.full_name,
             req.target_profile_id, target.full_name, a.action, a.reason,
             json_object('request_id', a.request_id), a.created_at
      FROM staff_role_elevation_audit a
      JOIN staff_role_elevation_request req ON req.id = a.request_id
      JOIN staff_profile actor ON actor.id = a.actor_profile_id
      JOIN staff_profile target ON target.id = req.target_profile_id
      WHERE a.branch_id = ? AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
      UNION ALL
      SELECT a.id, 'admin_revocation', a.actor_profile_id, actor.full_name,
             req.target_profile_id, target.full_name, a.action, a.reason,
             json_object('request_id', a.request_id), a.created_at
      FROM staff_role_revocation_audit a
      JOIN staff_role_revocation_request req ON req.id = a.request_id
      JOIN staff_profile actor ON actor.id = a.actor_profile_id
      JOIN staff_profile target ON target.id = req.target_profile_id
      WHERE a.branch_id = ? AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
    )
    ORDER BY created_at DESC, event_id DESC
    LIMIT ?
  `).bind(
    access.activeBranch.branchId, before, before, beforeId,
    access.activeBranch.branchId, before, before, beforeId,
    access.activeBranch.branchId, before, before, beforeId,
    access.activeBranch.branchId, before, before, beforeId,
    limit,
  ).all<{
    event_id: string; event_type: string; actor_profile_id: string; actor_name: string;
    target_profile_id: string; target_name: string; action: string; reason: string;
    metadata: string; created_at: string;
  }>();
  const events = rows.results ?? [];
  return json(200, {
    ok: true,
    events,
    next_before: events.length === limit ? events[events.length - 1].created_at : null,
    next_before_id: events.length === limit ? events[events.length - 1].event_id : null,
  }, requestId, origin);
}

type EventScopeMode = "branch" | "team" | "assigned";

function bestEventScope(scopes: string[]): EventScopeMode | null {
  if (scopes.includes("branch")) return "branch";
  if (scopes.includes("team")) return "team";
  if (scopes.includes("assigned")) return "assigned";
  return null;
}

function eventScopePredicate(
  mode: EventScopeMode,
  alias: string,
  staffProfileId: string,
  staffUserId: string,
  now: string,
): { sql: string; values: unknown[] } {
  if (mode === "branch") return { sql: "1 = 1", values: [] };
  if (mode === "assigned") return {
    sql: `EXISTS (
      SELECT 1 FROM event_staff_assignment esa
      WHERE esa.event_id = ${alias}.id
        AND esa.branch_id = ${alias}.branch_id
        AND esa.staff_auth_user_id = ?
        AND esa.revoked_at IS NULL
        AND esa.starts_at <= ?
        AND (esa.ends_at IS NULL OR esa.ends_at > ?)
    )`,
    values: [staffUserId, now, now],
  };
  return {
    sql: `EXISTS (
      SELECT 1
      FROM event_team_assignment eta
      JOIN staff_team_membership tm
        ON tm.team_id = eta.team_id AND tm.branch_id = eta.branch_id
      WHERE eta.event_id = ${alias}.id
        AND eta.branch_id = ${alias}.branch_id
        AND tm.staff_profile_id = ?
        AND eta.revoked_at IS NULL
        AND eta.starts_at <= ?
        AND (eta.ends_at IS NULL OR eta.ends_at > ?)
        AND tm.revoked_at IS NULL
        AND tm.starts_at <= ?
        AND (tm.ends_at IS NULL OR tm.ends_at > ?)
    )`,
    values: [staffProfileId, now, now, now, now],
  };
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function listEvents(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const scope = bestEventScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "events.read")
    .map((grant) => grant.scopeMode));
  if (!scope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!["draft", "published", "cancelled", "completed", "all"].includes(status) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [...url.searchParams.keys()].some((key) => !["status", "limit"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_EVENT_QUERY" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  const predicate = eventScopePredicate(
    scope, "e", context.staff.profileId, context.staff.userId, now,
  );
  const statusPredicate = status === "all" ? "1 = 1" : "e.status = ?";
  const rows = await env.DB.prepare(`
    SELECT e.id, e.branch_id, e.title, e.description, e.starts_at, e.ends_at,
           e.timezone, e.location, e.capacity, e.registration_state,
           e.visibility, e.status, e.transport_enabled, e.created_at, e.updated_at
    FROM event e
    WHERE e.branch_id = ?
      AND ${statusPredicate}
      AND (${predicate.sql})
    ORDER BY e.starts_at DESC, e.id DESC
    LIMIT ?
  `).bind(
    context.activeBranch.branchId,
    ...(status === "all" ? [] : [status]),
    ...predicate.values,
    limit,
  ).all<Record<string, unknown>>();
  return json(200, { ok: true, events: rows.results ?? [] }, requestId, origin);
}

async function getEvent(
  request: Request,
  env: Env,
  eventId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const scope = bestEventScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "events.read")
    .map((grant) => grant.scopeMode));
  if (!scope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const now = new Date().toISOString();
  const predicate = eventScopePredicate(
    scope, "e", context.staff.profileId, context.staff.userId, now,
  );
  const row = await env.DB.prepare(`
    SELECT e.id, e.branch_id, e.title, e.description, e.starts_at, e.ends_at,
           e.timezone, e.location, e.capacity, e.registration_state,
           e.visibility, e.status, e.transport_enabled, e.created_at, e.updated_at
    FROM event e
    WHERE e.id = ? AND e.branch_id = ? AND (${predicate.sql})
    LIMIT 1
  `).bind(eventId, context.activeBranch.branchId, ...predicate.values).first<Record<string, unknown>>();
  if (!row) return json(404, { ok: false, error: { code: "EVENT_NOT_FOUND" } }, requestId, origin);
  return json(200, { ok: true, event: row }, requestId, origin);
}

async function createEvent(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "events.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as Record<string, unknown>;
  const allowed = new Set(["title", "description", "starts_at", "ends_at", "timezone", "location", "capacity", "transport_enabled"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_EVENT_BODY" } }, requestId, origin);
  }
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const description = payload.description === undefined || payload.description === null
    ? null : typeof payload.description === "string" ? payload.description.trim() || null : "";
  const startsAt = parseIsoTimestamp(payload.starts_at, "");
  const endsAt = parseIsoTimestamp(payload.ends_at, "");
  const timezone = payload.timezone === undefined ? "Africa/Accra" :
    typeof payload.timezone === "string" ? payload.timezone.trim() : "";
  const location = payload.location === undefined || payload.location === null
    ? null : typeof payload.location === "string" ? payload.location.trim() || null : "";
  const capacity = payload.capacity === undefined || payload.capacity === null || payload.capacity === ""
    ? null : payload.capacity;
  const transportEnabled = payload.transport_enabled === undefined ? false : payload.transport_enabled;
  if (
    title.length < 2 || title.length > 180 ||
    (description !== null && (typeof description !== "string" || description.length > 5000)) ||
    !startsAt || !endsAt || endsAt <= startsAt ||
    timezone.length < 3 || timezone.length > 64 || !isValidTimezone(timezone) ||
    (location !== null && (typeof location !== "string" || location.length > 200)) ||
    (capacity !== null && (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 || capacity > 100000)) ||
    typeof transportEnabled !== "boolean"
  ) {
    return json(400, { ok: false, error: { code: "INVALID_EVENT_DETAILS" } }, requestId, origin);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`
      INSERT INTO event
        (id, branch_id, title, description, starts_at, ends_at, timezone,
         location, capacity, registration_state, visibility, status,
         transport_enabled, created_by, last_modified_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'closed', 'private', 'draft', ?, ?, ?, ?, ?)
    `).bind(
      id, access.activeBranch.branchId, title, description, startsAt, endsAt,
      timezone, location, capacity, transportEnabled ? 1 : 0,
      access.staff.userId, access.staff.userId, now, now,
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) throw new Error("EVENT_CREATE_FAILED");
  } catch {
    return json(409, { ok: false, error: { code: "EVENT_CREATE_CONFLICT" } }, requestId, origin);
  }
  return json(201, {
    ok: true,
    event: {
      id, branch_id: access.activeBranch.branchId, title, starts_at: startsAt,
      ends_at: endsAt, timezone, capacity, registration_state: "closed",
      visibility: "private", status: "draft", transport_enabled: transportEnabled,
    },
  }, requestId, origin);
}

async function updateEvent(
  request: Request,
  env: Env,
  eventId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "events.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as Record<string, unknown>;
  const allowed = new Set(["title", "description", "starts_at", "ends_at", "timezone", "location", "capacity", "transport_enabled"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length === 0 || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_EVENT_UPDATE" } }, requestId, origin);
  }
  const existing = await env.DB.prepare(`
    SELECT id, starts_at, ends_at FROM event
    WHERE id = ? AND branch_id = ? AND status = 'draft'
    LIMIT 1
  `).bind(eventId, access.activeBranch.branchId).first<{
    id: string; starts_at: string; ends_at: string;
  }>();
  if (!existing) return json(404, { ok: false, error: { code: "DRAFT_EVENT_NOT_FOUND" } }, requestId, origin);

  const values: unknown[] = [];
  const assignments: string[] = [];
  const title = payload.title;
  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length < 2 || title.trim().length > 180) {
      return json(400, { ok: false, error: { code: "INVALID_EVENT_TITLE" } }, requestId, origin);
    }
    assignments.push("title = ?"); values.push(title.trim());
  }
  if (payload.description !== undefined) {
    if (payload.description !== null && (typeof payload.description !== "string" || payload.description.length > 5000)) {
      return json(400, { ok: false, error: { code: "INVALID_EVENT_DESCRIPTION" } }, requestId, origin);
    }
    assignments.push("description = ?"); values.push(typeof payload.description === "string" ? payload.description.trim() || null : null);
  }
  if (payload.starts_at !== undefined) {
    const value = parseIsoTimestamp(payload.starts_at, "");
    if (!value) return json(400, { ok: false, error: { code: "INVALID_EVENT_START" } }, requestId, origin);
    assignments.push("starts_at = ?"); values.push(value);
  }
  if (payload.ends_at !== undefined) {
    const value = parseIsoTimestamp(payload.ends_at, "");
    if (!value) return json(400, { ok: false, error: { code: "INVALID_EVENT_END" } }, requestId, origin);
    assignments.push("ends_at = ?"); values.push(value);
  }
  if (payload.timezone !== undefined) {
    if (typeof payload.timezone !== "string" || payload.timezone.length > 64 || !isValidTimezone(payload.timezone)) {
      return json(400, { ok: false, error: { code: "INVALID_EVENT_TIMEZONE" } }, requestId, origin);
    }
    assignments.push("timezone = ?"); values.push(payload.timezone);
  }
  if (payload.location !== undefined) {
    if (payload.location !== null && (typeof payload.location !== "string" || payload.location.length > 200)) {
      return json(400, { ok: false, error: { code: "INVALID_EVENT_LOCATION" } }, requestId, origin);
    }
    assignments.push("location = ?"); values.push(typeof payload.location === "string" ? payload.location.trim() || null : null);
  }
  if (payload.capacity !== undefined) {
    if (payload.capacity !== null && (typeof payload.capacity !== "number" || !Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > 100000)) {
      return json(400, { ok: false, error: { code: "INVALID_EVENT_CAPACITY" } }, requestId, origin);
    }
    assignments.push("capacity = ?"); values.push(payload.capacity);
  }
  if (payload.transport_enabled !== undefined) {
    if (typeof payload.transport_enabled !== "boolean") {
      return json(400, { ok: false, error: { code: "INVALID_TRANSPORT_SETTING" } }, requestId, origin);
    }
    assignments.push("transport_enabled = ?"); values.push(payload.transport_enabled ? 1 : 0);
  }
  const nextStart = typeof payload.starts_at === "string" ? parseIsoTimestamp(payload.starts_at, "")! : existing.starts_at;
  const nextEnd = typeof payload.ends_at === "string" ? parseIsoTimestamp(payload.ends_at, "")! : existing.ends_at;
  if (nextEnd <= nextStart) return json(400, { ok: false, error: { code: "EVENT_END_MUST_FOLLOW_START" } }, requestId, origin);
  assignments.push("last_modified_by = ?");
  values.push(access.staff.userId);
  assignments.push("updated_at = ?");
  values.push(new Date().toISOString());
  try {
    const result = await env.DB.prepare(`
      UPDATE event SET ${assignments.join(", ")}
      WHERE id = ? AND branch_id = ? AND status = 'draft'
    `).bind(...values, eventId, access.activeBranch.branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "EVENT_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "EVENT_UPDATE_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, event_id: eventId, status: "draft" }, requestId, origin);
}

async function publishEvent(
  request: Request,
  env: Env,
  eventId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "events.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`
      UPDATE event
      SET status = 'published', visibility = 'staff',
          registration_state = 'closed', last_modified_by = ?, updated_at = ?
      WHERE id = ? AND branch_id = ? AND status = 'draft'
        AND length(trim(title)) >= 2 AND ends_at > starts_at
    `).bind(access.staff.userId, now, eventId, access.activeBranch.branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "EVENT_NOT_PUBLISHABLE" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "EVENT_PUBLISH_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, event_id: eventId, status: "published", visibility: "staff" }, requestId, origin);
}

async function cancelEvent(
  request: Request,
  env: Env,
  eventId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "events.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`
      UPDATE event
      SET status = 'cancelled', registration_state = 'closed', last_modified_by = ?, updated_at = ?
      WHERE id = ? AND branch_id = ? AND status IN ('draft','published')
    `).bind(access.staff.userId, now, eventId, access.activeBranch.branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "EVENT_NOT_CANCELLABLE" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "EVENT_CANCEL_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, event_id: eventId, status: "cancelled" }, requestId, origin);
}

type CalendarScopeMode = "branch" | "team" | "assigned";

function bestCalendarScope(scopes: string[]): CalendarScopeMode | null {
  if (scopes.includes("branch")) return "branch";
  if (scopes.includes("team")) return "team";
  if (scopes.includes("assigned")) return "assigned";
  return null;
}

function calendarScopePredicate(
  mode: CalendarScopeMode,
  alias: string,
  staffProfileId: string,
  staffUserId: string,
  now: string,
): { sql: string; values: unknown[] } {
  if (mode === "branch") return { sql: "1 = 1", values: [] };
  if (mode === "assigned") return {
    sql: `(
      (${alias}.scope_type='own' AND ${alias}.owner_user_id=?)
      OR (${alias}.scope_type='event' AND EXISTS (
        SELECT 1 FROM event_staff_assignment esa
        WHERE esa.event_id=${alias}.event_id AND esa.branch_id=${alias}.branch_id
          AND esa.staff_auth_user_id=? AND esa.revoked_at IS NULL
          AND esa.starts_at<=? AND (esa.ends_at IS NULL OR esa.ends_at>?)
      ))
    )`,
    values: [staffUserId, staffUserId, now, now],
  };
  return {
    sql: `(
      (${alias}.scope_type='team' AND EXISTS (
        SELECT 1 FROM staff_team_membership tm
        WHERE tm.team_id=${alias}.team_id AND tm.branch_id=${alias}.branch_id
          AND tm.staff_profile_id=? AND tm.revoked_at IS NULL
          AND tm.starts_at<=? AND (tm.ends_at IS NULL OR tm.ends_at>?)
      ))
      OR (${alias}.scope_type='event' AND EXISTS (
        SELECT 1 FROM event_team_assignment eta
        JOIN staff_team_membership tm ON tm.team_id=eta.team_id AND tm.branch_id=eta.branch_id
        WHERE eta.event_id=${alias}.event_id AND eta.branch_id=${alias}.branch_id
          AND tm.staff_profile_id=? AND eta.revoked_at IS NULL AND tm.revoked_at IS NULL
          AND eta.starts_at<=? AND (eta.ends_at IS NULL OR eta.ends_at>?)
          AND tm.starts_at<=? AND (tm.ends_at IS NULL OR tm.ends_at>?)
      ))
    )`,
    values: [staffProfileId, now, now, staffProfileId, now, now, now, now],
  };
}

async function listCalendarEntries(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const scope = bestCalendarScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "calendar.read")
    .map((grant) => grant.scopeMode));
  if (!scope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);

  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw ? parseIsoTimestamp(fromRaw, "") : new Date(Date.now() - 30 * 86400000).toISOString();
  const to = toRaw ? parseIsoTimestamp(toRaw, "") : new Date(Date.now() + 180 * 86400000).toISOString();
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 100 : Number(rawLimit);
  if (!from || !to || to <= from || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [...url.searchParams.keys()].some((key) => !["from", "to", "limit"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CALENDAR_QUERY" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  const predicate = calendarScopePredicate(scope, "ce", context.staff.profileId, context.staff.userId, now);
  const rows = await env.DB.prepare(`
    SELECT ce.id, ce.branch_id, ce.entry_type, ce.title, ce.starts_at, ce.ends_at,
           ce.timezone, ce.scope_type, ce.team_id, ce.event_id, ce.owner_user_id,
           ce.created_by, ce.created_at, ce.updated_at
    FROM calendar_entry ce
    WHERE ce.branch_id = ?
      AND ce.starts_at < ?
      AND (ce.ends_at IS NULL OR ce.ends_at >= ?)
      AND (${predicate.sql})
    ORDER BY ce.starts_at ASC, ce.id ASC
    LIMIT ?
  `).bind(
    context.activeBranch.branchId, to, from, ...predicate.values, limit,
  ).all<Record<string, unknown>>();
  return json(200, { ok: true, entries: rows.results ?? [] }, requestId, origin);
}

async function getCalendarEntry(
  request: Request,
  env: Env,
  entryId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const scope = bestCalendarScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "calendar.read")
    .map((grant) => grant.scopeMode));
  if (!scope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const now = new Date().toISOString();
  const predicate = calendarScopePredicate(scope, "ce", context.staff.profileId, context.staff.userId, now);
  const row = await env.DB.prepare(`
    SELECT ce.id, ce.branch_id, ce.entry_type, ce.title, ce.starts_at, ce.ends_at,
           ce.timezone, ce.scope_type, ce.team_id, ce.event_id, ce.owner_user_id,
           ce.created_by, ce.created_at, ce.updated_at
    FROM calendar_entry ce
    WHERE ce.id=? AND ce.branch_id=? AND (${predicate.sql})
    LIMIT 1
  `).bind(entryId, context.activeBranch.branchId, ...predicate.values).first<Record<string, unknown>>();
  if (!row) return json(404, { ok: false, error: { code: "CALENDAR_ENTRY_NOT_FOUND" } }, requestId, origin);
  return json(200, { ok: true, entry: row }, requestId, origin);
}

async function createCalendarEntry(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "calendar.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as Record<string, unknown>;
  const allowed = new Set(["entry_type", "title", "starts_at", "ends_at", "timezone", "scope_type", "team_id", "event_id"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CALENDAR_BODY" } }, requestId, origin);
  }
  const entryType = typeof payload.entry_type === "string" ? payload.entry_type : "";
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const startsAt = parseIsoTimestamp(payload.starts_at, "");
  const endsAt = payload.ends_at === undefined || payload.ends_at === null || payload.ends_at === ""
    ? null : parseIsoTimestamp(payload.ends_at, "");
  const timezone = payload.timezone === undefined ? "Africa/Accra" :
    typeof payload.timezone === "string" ? payload.timezone.trim() : "";
  const scopeType = typeof payload.scope_type === "string" ? payload.scope_type : "";
  const teamId = typeof payload.team_id === "string" ? payload.team_id.trim() || null : null;
  const eventId = typeof payload.event_id === "string" ? payload.event_id.trim() || null : null;
  if ((payload.team_id !== undefined && payload.team_id !== null && typeof payload.team_id !== "string") ||
      (payload.event_id !== undefined && payload.event_id !== null && typeof payload.event_id !== "string") ||
      !["service", "event", "followup", "prayer_schedule", "other"].includes(entryType) ||
      title.length < 2 || title.length > 180 || !startsAt ||
      (payload.ends_at !== undefined && payload.ends_at !== null && payload.ends_at !== "" && !endsAt) ||
      (endsAt !== null && endsAt <= startsAt) ||
      timezone.length < 3 || timezone.length > 64 || !isValidTimezone(timezone) ||
      !["branch", "team", "event", "own"].includes(scopeType) ||
      (scopeType === "team" && !teamId) || (scopeType !== "team" && teamId !== null) ||
      (scopeType === "event" && !eventId) || (scopeType !== "event" && eventId !== null)) {
    return json(400, { ok: false, error: { code: "INVALID_CALENDAR_DETAILS" } }, requestId, origin);
  }
  if (teamId) {
    const team = await env.DB.prepare(
      "SELECT id FROM team WHERE id=? AND branch_id=? AND is_active=1 LIMIT 1",
    ).bind(teamId, access.activeBranch.branchId).first<{ id: string }>();
    if (!team) return json(400, { ok: false, error: { code: "TEAM_NOT_ACTIVE_IN_BRANCH" } }, requestId, origin);
  }
  if (eventId) {
    const event = await env.DB.prepare(
      "SELECT id FROM event WHERE id=? AND branch_id=? AND status<>'cancelled' LIMIT 1",
    ).bind(eventId, access.activeBranch.branchId).first<{ id: string }>();
    if (!event) return json(400, { ok: false, error: { code: "EVENT_NOT_AVAILABLE_IN_BRANCH" } }, requestId, origin);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const ownerUserId = scopeType === "own" ? access.staff.userId : null;
  try {
    const result = await env.DB.prepare(`
      INSERT INTO calendar_entry
        (id,branch_id,entry_type,title,starts_at,ends_at,timezone,scope_type,
         team_id,event_id,owner_user_id,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, access.activeBranch.branchId, entryType, title, startsAt, endsAt,
      timezone, scopeType, teamId, eventId, ownerUserId,
      access.staff.userId, access.staff.userId, now, now,
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) throw new Error("CALENDAR_CREATE_FAILED");
  } catch {
    return json(409, { ok: false, error: { code: "CALENDAR_CREATE_CONFLICT" } }, requestId, origin);
  }
  return json(201, { ok: true, entry_id: id }, requestId, origin);
}

async function updateCalendarEntry(
  request: Request,
  env: Env,
  entryId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "calendar.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as Record<string, unknown>;
  const allowed = new Set(["title", "starts_at", "ends_at", "timezone"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length === 0 || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CALENDAR_UPDATE" } }, requestId, origin);
  }
  const existing = await env.DB.prepare(
    "SELECT id,starts_at,ends_at FROM calendar_entry WHERE id=? AND branch_id=? LIMIT 1",
  ).bind(entryId, access.activeBranch.branchId).first<{ id: string; starts_at: string; ends_at: string | null }>();
  if (!existing) return json(404, { ok: false, error: { code: "CALENDAR_ENTRY_NOT_FOUND" } }, requestId, origin);
  const assignments: string[] = [];
  const values: unknown[] = [];
  if (payload.title !== undefined) {
    if (typeof payload.title !== "string" || payload.title.trim().length < 2 || payload.title.trim().length > 180) {
      return json(400, { ok: false, error: { code: "INVALID_CALENDAR_TITLE" } }, requestId, origin);
    }
    assignments.push("title=?"); values.push(payload.title.trim());
  }
  if (payload.starts_at !== undefined) {
    const value = parseIsoTimestamp(payload.starts_at, "");
    if (!value) return json(400, { ok: false, error: { code: "INVALID_CALENDAR_START" } }, requestId, origin);
    assignments.push("starts_at=?"); values.push(value);
  }
  if (payload.ends_at !== undefined) {
    const value = payload.ends_at === null || payload.ends_at === "" ? null : parseIsoTimestamp(payload.ends_at, "");
    if (payload.ends_at !== null && payload.ends_at !== "" && !value) return json(400, { ok: false, error: { code: "INVALID_CALENDAR_END" } }, requestId, origin);
    assignments.push("ends_at=?"); values.push(value);
  }
  if (payload.timezone !== undefined) {
    if (typeof payload.timezone !== "string" || payload.timezone.length > 64 || !isValidTimezone(payload.timezone)) {
      return json(400, { ok: false, error: { code: "INVALID_CALENDAR_TIMEZONE" } }, requestId, origin);
    }
    assignments.push("timezone=?"); values.push(payload.timezone);
  }
  const nextStart = typeof payload.starts_at === "string" ? parseIsoTimestamp(payload.starts_at, "")! : existing.starts_at;
  const nextEnd = payload.ends_at === undefined ? existing.ends_at :
    payload.ends_at === null || payload.ends_at === "" ? null : parseIsoTimestamp(payload.ends_at, "");
  if (nextEnd !== null && nextEnd <= nextStart) {
    return json(400, { ok: false, error: { code: "CALENDAR_END_MUST_FOLLOW_START" } }, requestId, origin);
  }
  assignments.push("updated_by=?"); values.push(access.staff.userId);
  assignments.push("updated_at=?"); values.push(new Date().toISOString());
  try {
    const result = await env.DB.prepare(`
      UPDATE calendar_entry SET ${assignments.join(",")}
      WHERE id=? AND branch_id=?
    `).bind(...values, entryId, access.activeBranch.branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "CALENDAR_ENTRY_CHANGED" } }, requestId, origin);
  } catch {
    return json(409, { ok: false, error: { code: "CALENDAR_UPDATE_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, entry_id: entryId }, requestId, origin);
}

type AnnouncementScopeMode = "branch" | "team" | "assigned";

function bestAnnouncementScope(scopes: string[]): AnnouncementScopeMode | null {
  if (scopes.includes("branch")) return "branch";
  if (scopes.includes("team")) return "team";
  if (scopes.includes("assigned")) return "assigned";
  return null;
}

function announcementScopePredicate(
  mode: AnnouncementScopeMode,
  alias: string,
  staffProfileId: string,
  staffUserId: string,
  now: string,
): { sql: string; values: unknown[] } {
  if (mode === "branch") return { sql: "1 = 1", values: [] };
  const base = `(${alias}.audience_type IN ('branch','staff') OR (${alias}.audience_type='public' AND ${alias}.is_public=1))`;
  const team = `(${alias}.audience_type='team' AND EXISTS (
    SELECT 1 FROM announcement_team_audience ata
    JOIN staff_team_membership tm ON tm.team_id=ata.team_id AND tm.branch_id=ata.branch_id
    WHERE ata.announcement_id=${alias}.id AND ata.branch_id=${alias}.branch_id
      AND tm.staff_profile_id=? AND tm.revoked_at IS NULL
      AND tm.starts_at<=? AND (tm.ends_at IS NULL OR tm.ends_at>?)
  ))`;
  const eventTeam = `(${alias}.audience_type='event' AND EXISTS (
    SELECT 1 FROM announcement_event_audience aea
    JOIN event_team_assignment eta ON eta.event_id=aea.event_id AND eta.branch_id=aea.branch_id
    JOIN staff_team_membership tm ON tm.team_id=eta.team_id AND tm.branch_id=eta.branch_id
    WHERE aea.announcement_id=${alias}.id AND aea.branch_id=${alias}.branch_id
      AND tm.staff_profile_id=? AND eta.revoked_at IS NULL AND tm.revoked_at IS NULL
      AND eta.starts_at<=? AND (eta.ends_at IS NULL OR eta.ends_at>?)
      AND tm.starts_at<=? AND (tm.ends_at IS NULL OR tm.ends_at>?)
  ))`;
  if (mode === "team") {
    return {
      sql: `(${base} OR ${team} OR ${eventTeam})`,
      values: [staffProfileId, now, now, staffProfileId, now, now, now, now],
    };
  }
  const eventStaff = `(${alias}.audience_type='event' AND EXISTS (
    SELECT 1 FROM announcement_event_audience aea
    JOIN event_staff_assignment esa ON esa.event_id=aea.event_id AND esa.branch_id=aea.branch_id
    WHERE aea.announcement_id=${alias}.id AND aea.branch_id=${alias}.branch_id
      AND esa.staff_auth_user_id=? AND esa.revoked_at IS NULL
      AND esa.starts_at<=? AND (esa.ends_at IS NULL OR esa.ends_at>?)
  ))`;
  return {
    sql: `(${base} OR ${team} OR ${eventTeam} OR ${eventStaff})`,
    values: [staffProfileId, now, now, staffProfileId, now, now, now, now, staffUserId, now, now],
  };
}

async function listAnnouncements(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const scope = bestAnnouncementScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "announcements.read")
    .map((grant) => grant.scopeMode));
  if (!scope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const canManage = context.activeBranch.capabilities.some((grant) => grant.code === "announcements.manage" && grant.scopeMode === "branch");
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "published";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!["draft", "scheduled", "published", "archived", "all"].includes(status) ||
      (status !== "published" && !canManage) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [...url.searchParams.keys()].some((key) => !["status", "limit"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_QUERY" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  const predicate = announcementScopePredicate(scope, "a", context.staff.profileId, context.staff.userId, now);
  const statusPredicate = status === "all" ? "1=1" : "a.status=?";
  const rows = await env.DB.prepare(`
    SELECT a.id,a.branch_id,a.title,a.body,a.audience_type,a.is_public,a.status,
           a.publish_at,a.published_at,a.created_by,a.created_at,a.updated_at
    FROM announcement a
    WHERE a.branch_id=? AND ${statusPredicate} AND (${predicate.sql})
    ORDER BY COALESCE(a.published_at,a.created_at) DESC,a.id DESC
    LIMIT ?
  `).bind(
    context.activeBranch.branchId,
    ...(status === "all" ? [] : [status]),
    ...predicate.values,
    limit,
  ).all<Record<string, unknown>>();
  return json(200, { ok: true, announcements: rows.results ?? [] }, requestId, origin);
}

async function getAnnouncement(
  request: Request,
  env: Env,
  announcementId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const scope = bestAnnouncementScope(context.activeBranch.capabilities
    .filter((grant) => grant.code === "announcements.read")
    .map((grant) => grant.scopeMode));
  if (!scope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const canManage = context.activeBranch.capabilities.some((grant) => grant.code === "announcements.manage" && grant.scopeMode === "branch");
  const now = new Date().toISOString();
  const predicate = announcementScopePredicate(scope, "a", context.staff.profileId, context.staff.userId, now);
  const row = await env.DB.prepare(`
    SELECT a.id,a.branch_id,a.title,a.body,a.audience_type,a.is_public,a.status,
           a.publish_at,a.published_at,a.created_by,a.created_at,a.updated_at
    FROM announcement a
    WHERE a.id=? AND a.branch_id=? AND (?=1 OR a.status='published') AND (${predicate.sql})
    LIMIT 1
  `).bind(announcementId, context.activeBranch.branchId, canManage ? 1 : 0, ...predicate.values).first<Record<string, unknown>>();
  if (!row) return json(404, { ok: false, error: { code: "ANNOUNCEMENT_NOT_FOUND" } }, requestId, origin);
  return json(200, { ok: true, announcement: row }, requestId, origin);
}

async function createAnnouncement(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "announcements.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as Record<string, unknown>;
  const allowed = new Set(["title", "body", "audience_type", "team_ids", "event_ids"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_BODY" } }, requestId, origin);
  }
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const message = typeof payload.body === "string" ? payload.body.trim() : "";
  const audience = typeof payload.audience_type === "string" ? payload.audience_type : "";
  const teamIds = payload.team_ids === undefined ? [] : payload.team_ids;
  const eventIds = payload.event_ids === undefined ? [] : payload.event_ids;
  if (title.length < 2 || title.length > 180 || message.length < 1 || message.length > 20000 ||
      !["public", "branch", "team", "event", "staff"].includes(audience) ||
      !Array.isArray(teamIds) || !Array.isArray(eventIds) ||
      teamIds.length > 20 || eventIds.length > 20 ||
      teamIds.some((id) => typeof id !== "string" || id.length > 128) ||
      eventIds.some((id) => typeof id !== "string" || id.length > 128) ||
      new Set(teamIds).size !== teamIds.length || new Set(eventIds).size !== eventIds.length ||
      (audience === "team" ? teamIds.length === 0 || eventIds.length !== 0 : teamIds.length !== 0) ||
      (audience === "event" ? eventIds.length === 0 : eventIds.length !== 0)) {
    return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_DETAILS" } }, requestId, origin);
  }
  const branchId = access.activeBranch.branchId;
  if (teamIds.length) {
    const found = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM team WHERE branch_id=? AND is_active=1 AND id IN (${teamIds.map(() => "?").join(",")})`,
    ).bind(branchId, ...teamIds).first<{ count: number }>();
    if ((found?.count ?? 0) !== teamIds.length) return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_TEAM_AUDIENCE" } }, requestId, origin);
  }
  if (eventIds.length) {
    const found = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM event WHERE branch_id=? AND status<>'cancelled' AND id IN (${eventIds.map(() => "?").join(",")})`,
    ).bind(branchId, ...eventIds).first<{ count: number }>();
    if ((found?.count ?? 0) !== eventIds.length) return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_EVENT_AUDIENCE" } }, requestId, origin);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(`
      INSERT INTO announcement
        (id,branch_id,title,body,audience_type,is_public,status,publish_at,published_at,
         created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?, 'draft',NULL,NULL,?,?,?,?)
    `).bind(
      id, branchId, title, message, audience, audience === "public" ? 1 : 0,
      access.staff.userId, access.staff.userId, now, now,
    ),
  ];
  for (const teamId of teamIds as string[]) {
    statements.push(env.DB.prepare(
      "INSERT INTO announcement_team_audience (announcement_id,branch_id,team_id,created_at,created_by) VALUES (?,?,?,?,?)",
    ).bind(id, branchId, teamId, now, access.staff.userId));
  }
  for (const eventId of eventIds as string[]) {
    statements.push(env.DB.prepare(
      "INSERT INTO announcement_event_audience (announcement_id,branch_id,event_id,created_at,created_by) VALUES (?,?,?,?,?)",
    ).bind(id, branchId, eventId, now, access.staff.userId));
  }
  try {
    const results = await env.DB.batch(statements);
    if (results.some((result) => !result.success || (result.meta?.changes ?? 0) !== 1)) throw new Error("ANNOUNCEMENT_BATCH_FAILED");
  } catch {
    return json(409, { ok: false, error: { code: "ANNOUNCEMENT_CREATE_CONFLICT" } }, requestId, origin);
  }
  return json(201, { ok: true, announcement_id: id, status: "draft" }, requestId, origin);
}

async function updateAnnouncement(
  request: Request,
  env: Env,
  announcementId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "announcements.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as Record<string, unknown>;
  const allowed = new Set(["title", "body"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length === 0 || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_UPDATE" } }, requestId, origin);
  }
  const assignments: string[] = [];
  const values: unknown[] = [];
  if (payload.title !== undefined) {
    if (typeof payload.title !== "string" || payload.title.trim().length < 2 || payload.title.trim().length > 180) {
      return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_TITLE" } }, requestId, origin);
    }
    assignments.push("title=?"); values.push(payload.title.trim());
  }
  if (payload.body !== undefined) {
    if (typeof payload.body !== "string" || payload.body.trim().length < 1 || payload.body.length > 20000) {
      return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_TEXT" } }, requestId, origin);
    }
    assignments.push("body=?"); values.push(payload.body.trim());
  }
  const now = new Date().toISOString();
  assignments.push("updated_by=?"); values.push(access.staff.userId);
  assignments.push("updated_at=?"); values.push(now);
  try {
    const result = await env.DB.prepare(`
      UPDATE announcement SET ${assignments.join(",")}
      WHERE id=? AND branch_id=? AND status='draft'
    `).bind(...values, announcementId, access.activeBranch.branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "ANNOUNCEMENT_NOT_EDITABLE" } }, requestId, origin);
  } catch {
    return json(409, { ok: false, error: { code: "ANNOUNCEMENT_UPDATE_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, announcement_id: announcementId }, requestId, origin);
}

async function publishAnnouncement(
  request: Request,
  env: Env,
  announcementId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "announcements.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`
      UPDATE announcement
      SET status='published',published_at=?,updated_at=?,updated_by=?
      WHERE id=? AND branch_id=? AND status='draft'
        AND (publish_at IS NULL OR publish_at<=?)
    `).bind(now, now, access.staff.userId, announcementId, access.activeBranch.branchId, now).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "ANNOUNCEMENT_NOT_PUBLISHABLE" } }, requestId, origin);
  } catch {
    return json(409, { ok: false, error: { code: "ANNOUNCEMENT_PUBLISH_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, announcement_id: announcementId, status: "published" }, requestId, origin);
}

async function archiveAnnouncement(
  request: Request,
  env: Env,
  announcementId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "announcements.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`
      UPDATE announcement
      SET status='archived',updated_at=?,updated_by=?
      WHERE id=? AND branch_id=? AND status IN ('draft','published','scheduled')
    `).bind(now, access.staff.userId, announcementId, access.activeBranch.branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "ANNOUNCEMENT_NOT_ARCHIVABLE" } }, requestId, origin);
  } catch {
    return json(409, { ok: false, error: { code: "ANNOUNCEMENT_ARCHIVE_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, announcement_id: announcementId, status: "archived" }, requestId, origin);
}

async function getPublicContent(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branch_id") ?? "";
  if (!branchId || branchId.length > 128 || [...url.searchParams.keys()].some((key) => key !== "branch_id")) {
    return json(400, { ok: false, error: { code: "PUBLIC_BRANCH_REQUIRED" } }, requestId, origin);
  }
  const branch = await env.DB.prepare(
    "SELECT b.id,b.church_id FROM branch b WHERE b.id=? AND b.is_active=1 LIMIT 1",
  ).bind(branchId).first<{ id: string; church_id: string }>();
  if (!branch) return json(404, { ok: false, error: { code: "PUBLIC_BRANCH_NOT_FOUND" } }, requestId, origin);
  const [profile,welcome,sermons,dailyWord,tracts,announcements,events,links] = await Promise.all([
    env.DB.prepare(`
      SELECT public_name,welcome_content,public_phone,public_email,address_text,website_url,social_links
      FROM church_public_profile WHERE church_id=? LIMIT 1
    `).bind(branch.church_id).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,title,body,display_order,published_at
      FROM welcome_message WHERE status='published' AND (branch_id IS NULL OR branch_id=?)
      ORDER BY display_order ASC,published_at DESC LIMIT 20
    `).bind(branchId).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,title,body,public_slug,published_at
      FROM sermon WHERE status='published' AND (branch_id IS NULL OR branch_id=?)
      ORDER BY published_at DESC LIMIT 20
    `).bind(branchId).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,title,body,publication_date,public_slug,published_at
      FROM daily_word WHERE status='published'
      ORDER BY publication_date DESC LIMIT 10
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,title,body,public_slug,published_at
      FROM digital_tract WHERE status='published'
      ORDER BY published_at DESC LIMIT 30
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,title,body,published_at FROM announcement
      WHERE branch_id=? AND is_public=1 AND audience_type='public' AND status='published'
      ORDER BY published_at DESC LIMIT 20
    `).bind(branchId).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,title,description,starts_at,ends_at,timezone,location,capacity
      FROM event WHERE branch_id=? AND visibility='public' AND status='published'
      ORDER BY starts_at ASC LIMIT 20
    `).bind(branchId).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT l.id,l.label,l.url,l.digital_tract_id,l.sermon_id
      FROM external_document_link l
      WHERE (l.digital_tract_id IN (SELECT id FROM digital_tract WHERE status='published')
         OR l.sermon_id IN (SELECT id FROM sermon WHERE status='published' AND (branch_id IS NULL OR branch_id=?)))
      ORDER BY l.created_at DESC LIMIT 100
    `).bind(branchId).all<Record<string, unknown>>(),
  ]);
  return json(200, {
    ok: true,
    branch_id: branchId,
    profile: profile ?? null,
    welcome_messages: welcome.results ?? [],
    sermons: sermons.results ?? [],
    daily_word: dailyWord.results ?? [],
    digital_tracts: tracts.results ?? [],
    announcements: announcements.results ?? [],
    events: events.results ?? [],
    external_links: links.results ?? [],
  }, requestId, origin);
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

function hasScopedGrant(
  context: Extract<Awaited<ReturnType<typeof resolveStaffContext>>, { state: "authenticated" }>,
  code: string,
  scopeMode: string,
): boolean {
  return !!context.activeBranch?.capabilities.some(
    (grant) => grant.code === code && grant.scopeMode === scopeMode,
  );
}

async function listPrayerQueue(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  if (!hasScopedGrant(context, "prayer.request.share", "branch")) {
    return json(403, { ok: false, error: { code: "PRAYER_QUEUE_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [...url.searchParams.keys()].some((key) => key !== "limit")) {
    return json(400, { ok: false, error: { code: "INVALID_PRAYER_QUEUE_QUERY" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  const actorAuthorized = `
    EXISTS (
      SELECT 1
      FROM staff_profile actor
      JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
      JOIN role r ON r.id = ra.role_id AND r.is_active = 1
      JOIN role_capability rc ON rc.role_id = r.id
      JOIN capability cap ON cap.id = rc.capability_id AND cap.is_active = 1
      WHERE actor.id = ? AND actor.account_status = 'active'
        AND ra.branch_id = prayer_request.branch_id
        AND ra.revoked_at IS NULL AND ra.starts_at <= ?
        AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        AND cap.code = 'prayer.request.share' AND rc.scope_mode = 'branch'
    )
  `;
  const batch = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO prayer_access_audit
        (id, prayer_request_id, branch_id, actor_user_id, action, reason, request_id, accessed_at, safe_metadata)
      SELECT 'prayer-queue-' || lower(hex(randomblob(16))), prayer_request.id,
             prayer_request.branch_id, ?, 'read',
             'Prayer queue metadata accessed for assignment', ?, ?,
             json_object('projection', 'metadata_only')
      FROM prayer_request
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('open','assigned','in_progress')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${actorAuthorized}
      ORDER BY prayer_request.created_at ASC, prayer_request.id ASC
      LIMIT ?
    `).bind(
      context.staff.userId, requestId, now, context.activeBranch.branchId,
      now, context.staff.profileId, now, now, limit,
    ),
    env.DB.prepare(`
      INSERT INTO sensitive_record_access_audit
        (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
      SELECT 'prayer-queue-meta-' || lower(hex(randomblob(16))),
             prayer_request.branch_id, ?, 'prayer_request', prayer_request.id,
             'read', 'Admin/Pastor accessed prayer queue metadata for assignment', NULL, ?
      FROM prayer_request
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('open','assigned','in_progress')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${actorAuthorized}
      ORDER BY prayer_request.created_at ASC, prayer_request.id ASC
      LIMIT ?
    `).bind(
      context.staff.profileId, now, context.activeBranch.branchId, now,
      context.staff.profileId, now, now, limit,
    ),
    env.DB.prepare(`
      SELECT id, status, sensitivity, expires_at, created_at, updated_at
      FROM prayer_request
      WHERE branch_id = ?
        AND status IN ('open','assigned','in_progress')
        AND (expires_at IS NULL OR expires_at > ?)
        AND ${actorAuthorized}
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    `).bind(
      context.activeBranch.branchId, now,
      context.staff.profileId, now, now, limit,
    ),
  ]);
  const rows = (batch[2] as unknown as {
    results?: Array<{ id: string; status: string; sensitivity: string; expires_at: string | null; created_at: string; updated_at: string }>;
  })?.results ?? [];
  if (!batch[0]?.success || !batch[1]?.success ||
      (batch[0]?.meta?.changes ?? 0) !== rows.length ||
      (batch[1]?.meta?.changes ?? 0) !== rows.length) {
    return json(503, { ok: false, error: { code: "PRAYER_QUEUE_AUDIT_FAILED" } }, requestId, origin);
  }
  return json(200, { ok: true, requests: rows }, requestId, origin);
}

async function listAssignedPrayerRequests(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  if (!hasScopedGrant(context, "prayer.request.read", "explicit_share")) {
    return json(403, { ok: false, error: { code: "PRAYER_ASSIGNMENT_READ_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      [...url.searchParams.keys()].some((key) => key !== "limit")) {
    return json(400, { ok: false, error: { code: "INVALID_ASSIGNED_PRAYER_QUERY" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  const activeShareAndAssignment = `
    prayer_assignment.intercessor_user_id = ?
    AND prayer_assignment.branch_id = prayer_request.branch_id
    AND prayer_assignment.revoked_at IS NULL
    AND prayer_assignment.starts_at <= ?
    AND (prayer_assignment.ends_at IS NULL OR prayer_assignment.ends_at > ?)
    AND staff_record_share.staff_profile_id = ?
    AND staff_record_share.record_type = 'prayer_request'
    AND staff_record_share.record_id = prayer_request.id
    AND staff_record_share.branch_id = prayer_request.branch_id
    AND staff_record_share.revoked_at IS NULL
    AND staff_record_share.starts_at <= ?
    AND (staff_record_share.ends_at IS NULL OR staff_record_share.ends_at > ?)
    AND EXISTS (
      SELECT 1
      FROM staff_role_assignment ra
      JOIN role r ON r.id = ra.role_id AND r.is_active = 1
      JOIN role_capability rc ON rc.role_id = r.id
      JOIN capability cap ON cap.id = rc.capability_id AND cap.is_active = 1
      WHERE ra.staff_profile_id = ?
        AND ra.branch_id = prayer_request.branch_id
        AND ra.revoked_at IS NULL
        AND ra.starts_at <= ?
        AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        AND cap.code = 'prayer.request.read'
        AND rc.scope_mode = 'explicit_share'
    )
  `;
  const batch = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO prayer_access_audit
        (id, prayer_request_id, branch_id, actor_user_id, action, reason, request_id, accessed_at, safe_metadata)
      SELECT 'prayer-read-' || lower(hex(randomblob(16))), prayer_request.id,
             prayer_request.branch_id, ?, 'read',
             'Assigned intercessor read through explicit share', ?, ?,
             json_object('access_mode', 'explicit_share')
      FROM prayer_request
      JOIN prayer_assignment ON prayer_assignment.prayer_request_id = prayer_request.id
      JOIN staff_record_share ON staff_record_share.record_id = prayer_request.id
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('assigned','in_progress','answered')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${activeShareAndAssignment}
      ORDER BY prayer_request.created_at DESC, prayer_request.id DESC
      LIMIT ?
    `).bind(
      context.staff.userId, requestId, now, context.activeBranch.branchId, now,
      context.staff.userId, now, now, context.staff.profileId, now, now,
      context.staff.profileId, now, now, limit,
    ),
    env.DB.prepare(`
      INSERT INTO sensitive_record_access_audit
        (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
      SELECT 'prayer-read-meta-' || lower(hex(randomblob(16))),
             prayer_request.branch_id, ?, 'prayer_request', prayer_request.id,
             'read', 'Assigned intercessor accessed narrative through explicit share',
             staff_record_share.id, ?
      FROM prayer_request
      JOIN prayer_assignment ON prayer_assignment.prayer_request_id = prayer_request.id
      JOIN staff_record_share ON staff_record_share.record_id = prayer_request.id
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('assigned','in_progress','answered')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${activeShareAndAssignment}
      ORDER BY prayer_request.created_at DESC, prayer_request.id DESC
      LIMIT ?
    `).bind(
      context.staff.profileId, now, context.activeBranch.branchId, now,
      context.staff.userId, now, now, context.staff.profileId, now, now,
      context.staff.profileId, now, now, limit,
    ),
    env.DB.prepare(`
      SELECT prayer_request.id, prayer_request.request_text, prayer_request.status,
             prayer_request.sensitivity, prayer_request.expires_at,
             prayer_request.answered_at, prayer_request.created_at, prayer_request.updated_at
      FROM prayer_request
      JOIN prayer_assignment ON prayer_assignment.prayer_request_id = prayer_request.id
      JOIN staff_record_share ON staff_record_share.record_id = prayer_request.id
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('assigned','in_progress','answered')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${activeShareAndAssignment}
      ORDER BY prayer_request.created_at DESC, prayer_request.id DESC
      LIMIT ?
    `).bind(
      context.activeBranch.branchId, now,
      context.staff.userId, now, now, context.staff.profileId, now, now,
      context.staff.profileId, now, now, limit,
    ),
  ]);
  const rows = (batch[2] as unknown as {
    results?: Array<{ id: string; request_text: string; status: string; sensitivity: string; expires_at: string | null; answered_at: string | null; created_at: string; updated_at: string }>;
  })?.results ?? [];
  if (!batch[0]?.success || !batch[1]?.success ||
      (batch[0]?.meta?.changes ?? 0) !== rows.length ||
      (batch[1]?.meta?.changes ?? 0) !== rows.length) {
    return json(503, { ok: false, error: { code: "PRAYER_READ_AUDIT_FAILED" } }, requestId, origin);
  }
  return json(200, { ok: true, requests: rows }, requestId, origin);
}

async function sharePrayerRequest(
  request: Request,
  env: Env,
  prayerRequestId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "prayer.request.share");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { staff_profile_id?: unknown; purpose?: unknown; starts_at?: unknown; ends_at?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !["staff_profile_id","purpose","starts_at","ends_at"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_PRAYER_SHARE_BODY" } }, requestId, origin);
  }
  const recipientProfileId = typeof payload.staff_profile_id === "string" ? payload.staff_profile_id.trim() : "";
  const purpose = typeof payload.purpose === "string" ? payload.purpose.trim() : "";
  const now = new Date().toISOString();
  const startsAt = parseIsoTimestamp(payload.starts_at, now);
  const endsAt = payload.ends_at === undefined || payload.ends_at === null || payload.ends_at === ""
    ? null : parseIsoTimestamp(payload.ends_at, "");
  if (
    !recipientProfileId || recipientProfileId.length > 128 ||
    purpose.length < 10 || purpose.length > 300 ||
    !startsAt || startsAt < now ||
    (payload.ends_at !== undefined && payload.ends_at !== null && payload.ends_at !== "" && !endsAt) ||
    (endsAt !== null && endsAt <= startsAt)
  ) {
    return json(400, { ok: false, error: { code: "INVALID_PRAYER_SHARE_DETAILS" } }, requestId, origin);
  }
  const requestRow = await env.DB.prepare(`
    SELECT id FROM prayer_request
    WHERE id = ? AND branch_id = ? AND status IN ('open','assigned','in_progress')
      AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1
  `).bind(prayerRequestId, access.activeBranch.branchId, now).first<{ id: string }>();
  if (!requestRow) return json(404, { ok: false, error: { code: "PRAYER_REQUEST_NOT_AVAILABLE" } }, requestId, origin);
  const recipient = await env.DB.prepare(`
    SELECT sp.id, sp.auth_user_id
    FROM staff_profile sp
    JOIN staff_role_assignment ra ON ra.staff_profile_id = sp.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    WHERE sp.id = ? AND sp.account_status = 'active'
      AND r.code = 'prayer_intercessor'
      AND ra.branch_id = ? AND ra.revoked_at IS NULL
      AND ra.starts_at <= ? AND (ra.ends_at IS NULL OR ra.ends_at > ?)
    LIMIT 1
  `).bind(recipientProfileId, access.activeBranch.branchId, now, now).first<{
    id: string; auth_user_id: string;
  }>();
  if (!recipient) return json(400, { ok: false, error: { code: "RECIPIENT_NOT_ACTIVE_INTERCESSOR" } }, requestId, origin);

  const shareId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO staff_record_share
          (id, branch_id, record_type, record_id, staff_profile_id, granted_by,
           purpose, starts_at, ends_at, created_at)
        SELECT ?, p.branch_id, 'prayer_request', p.id, ?, ?, ?, ?, ?, ?
        FROM prayer_request p
        WHERE p.id = ? AND p.branch_id = ?
          AND p.status IN ('open','assigned','in_progress')
          AND (p.expires_at IS NULL OR p.expires_at > ?)
      `).bind(
        shareId, recipient.id, access.staff.profileId, purpose, startsAt, endsAt, now,
        prayerRequestId, access.activeBranch.branchId, now,
      ),
      env.DB.prepare(`
        INSERT INTO prayer_assignment
          (id, prayer_request_id, branch_id, intercessor_user_id, assigned_by, starts_at, ends_at, created_at)
        SELECT ?, p.id, p.branch_id, ?, ?, ?, ?, ?
        FROM prayer_request p
        JOIN staff_record_share s
          ON s.record_type = 'prayer_request' AND s.record_id = p.id
         AND s.branch_id = p.branch_id AND s.staff_profile_id = ?
         AND s.revoked_at IS NULL
        WHERE p.id = ? AND p.branch_id = ?
      `).bind(
        assignmentId, recipient.auth_user_id, access.staff.userId,
        startsAt, endsAt, now, recipient.id, prayerRequestId, access.activeBranch.branchId,
      ),
      env.DB.prepare(`
        UPDATE prayer_request SET status = 'assigned', updated_at = ?
        WHERE id = ? AND branch_id = ? AND status = 'open'
      `).bind(now, prayerRequestId, access.activeBranch.branchId),
    ]);
    if (results.some((result) => !result.success) ||
        (results[0]?.meta?.changes ?? 0) !== 1 ||
        (results[1]?.meta?.changes ?? 0) !== 1) {
      throw new Error("PRAYER_SHARE_CREATE_FAILED");
    }
  } catch {
    return json(409, { ok: false, error: { code: "PRAYER_SHARE_CONFLICT" } }, requestId, origin);
  }
  return json(201, {
    ok: true,
    share_id: shareId,
    assignment_id: assignmentId,
    staff_profile_id: recipient.id,
    starts_at: startsAt,
    ends_at: endsAt,
  }, requestId, origin);
}

async function revokePrayerShare(
  request: Request,
  env: Env,
  prayerRequestId: string,
  shareId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const access = await authorizeRequestCapability(request, env, "prayer.request.share");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { reason?: unknown };
  const reason = payload && typeof payload === "object" && !Array.isArray(payload) &&
    typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => key !== "reason") ||
      reason.length < 10 || reason.length > 300) {
    return json(400, { ok: false, error: { code: "INVALID_PRAYER_SHARE_REVOCATION" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE staff_record_share
        SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
        WHERE id = ? AND branch_id = ? AND record_type = 'prayer_request'
          AND record_id = ? AND revoked_at IS NULL
      `).bind(
        now, access.staff.profileId, reason, shareId,
        access.activeBranch.branchId, prayerRequestId,
      ),
      env.DB.prepare(`
        UPDATE prayer_assignment
        SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
        WHERE prayer_request_id = ? AND branch_id = ?
          AND intercessor_user_id = (
            SELECT recipient.auth_user_id
            FROM staff_record_share s
            JOIN staff_profile recipient ON recipient.id = s.staff_profile_id
            WHERE s.id = ? AND s.revoked_at = ?
          )
          AND revoked_at IS NULL
      `).bind(
        now, access.staff.userId, reason, prayerRequestId, access.activeBranch.branchId, shareId, now,
      ),
    ]);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1) {
      return json(404, { ok: false, error: { code: "ACTIVE_PRAYER_SHARE_NOT_FOUND" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "PRAYER_SHARE_REVOCATION_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, share_id: shareId, revoked_at: now }, requestId, origin);
}

async function updatePrayerRequestStatus(
  request: Request,
  env: Env,
  prayerRequestId: string,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
  if (!context.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  if (!hasScopedGrant(context, "prayer.request.respond", "explicit_share")) {
    return json(403, { ok: false, error: { code: "PRAYER_RESPONSE_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value as { status?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length !== 1 || typeof payload.status !== "string" ||
      !["in_progress","answered"].includes(payload.status)) {
    return json(400, { ok: false, error: { code: "INVALID_PRAYER_STATUS" } }, requestId, origin);
  }
  const nextStatus = payload.status;
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE prayer_request
      SET status = ?, answered_at = CASE WHEN ? = 'answered' THEN ? ELSE NULL END,
          updated_at = ?
      WHERE id = ? AND branch_id = ?
        AND status IN ('open','assigned','in_progress')
        AND (expires_at IS NULL OR expires_at > ?)
        AND EXISTS (
          SELECT 1 FROM prayer_assignment pa
          WHERE pa.prayer_request_id = prayer_request.id
            AND pa.branch_id = prayer_request.branch_id
            AND pa.intercessor_user_id = ?
            AND pa.revoked_at IS NULL
            AND pa.starts_at <= ? AND (pa.ends_at IS NULL OR pa.ends_at > ?)
        )
        AND EXISTS (
          SELECT 1 FROM staff_record_share s
          WHERE s.record_type = 'prayer_request' AND s.record_id = prayer_request.id
            AND s.branch_id = prayer_request.branch_id
            AND s.staff_profile_id = ?
            AND s.revoked_at IS NULL
            AND s.starts_at <= ? AND (s.ends_at IS NULL OR s.ends_at > ?)
        )
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          JOIN role_capability rc ON rc.role_id = r.id
          JOIN capability cap ON cap.id = rc.capability_id AND cap.is_active = 1
          JOIN staff_profile sp ON sp.id = ra.staff_profile_id
          WHERE sp.auth_user_id = ? AND sp.account_status = 'active'
            AND ra.branch_id = prayer_request.branch_id
            AND ra.revoked_at IS NULL AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
            AND cap.code = 'prayer.request.respond' AND rc.scope_mode = 'explicit_share'
        )
    `).bind(
      nextStatus, nextStatus, now, now,
      prayerRequestId, context.activeBranch.branchId, now,
      context.staff.userId, now, now,
      context.staff.profileId, now, now,
      context.staff.userId, now, now,
    ),
    env.DB.prepare(`
      INSERT INTO prayer_access_audit
        (id, prayer_request_id, branch_id, actor_user_id, action, reason, request_id, accessed_at, safe_metadata)
      SELECT ?, prayer_request.id, prayer_request.branch_id, ?, 'update',
             'Assigned intercessor updated prayer status', ?, ?, ?
      FROM prayer_request
      WHERE prayer_request.id = ? AND prayer_request.branch_id = ?
        AND changes() = 1
    `).bind(
      crypto.randomUUID(), context.staff.userId, requestId, now,
      JSON.stringify({ status: nextStatus }),
      prayerRequestId, context.activeBranch.branchId,
    ),
    env.DB.prepare(`
      INSERT INTO sensitive_record_access_audit
        (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
      SELECT 'prayer-status-' || lower(hex(randomblob(16))), p.branch_id, ?,
             'prayer_request', p.id, 'updated',
             'Assigned intercessor updated prayer request status', s.id, ?
      FROM prayer_request p
      JOIN staff_record_share s
        ON s.record_type = 'prayer_request' AND s.record_id = p.id
       AND s.branch_id = p.branch_id AND s.staff_profile_id = ?
      WHERE p.id = ? AND p.branch_id = ? AND p.status = ?
        AND changes() = 1
    `).bind(
      context.staff.profileId, now, context.staff.profileId,
      prayerRequestId, context.activeBranch.branchId, nextStatus,
    ),
  ]);
  if (results.some((result) => !result.success) ||
      (results[0]?.meta?.changes ?? 0) !== 1 ||
      (results[1]?.meta?.changes ?? 0) !== 1 ||
      (results[2]?.meta?.changes ?? 0) !== 1) {
    return json(404, { ok: false, error: { code: "ASSIGNED_PRAYER_REQUEST_NOT_FOUND" } }, requestId, origin);
  }
  return json(200, { ok: true, prayer_request_id: prayerRequestId, status: nextStatus }, requestId, origin);
}


    if (url.pathname === "/api/v1/pastoral/prayer/queue" && request.method === "GET") {
      return listPrayerQueue(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/pastoral/prayer/assigned" && request.method === "GET") {
      return listAssignedPrayerRequests(request, env, requestId, origin);
    }
    const prayerShareRevokeMatch = url.pathname.match(/^\/api\/v1\/pastoral\/prayer\/requests\/([^/]+)\/shares\/([^/]+)\/revoke$/);
    if (prayerShareRevokeMatch && request.method === "POST") {
      let prayerId: string;
      let shareId: string;
      try {
        prayerId = decodeURIComponent(prayerShareRevokeMatch[1]);
        shareId = decodeURIComponent(prayerShareRevokeMatch[2]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_SHARE_ID" } }, requestId, origin);
      }
      return revokePrayerShare(request, env, prayerId, shareId, requestId, origin);
    }
    const prayerShareMatch = url.pathname.match(/^\/api\/v1\/pastoral\/prayer\/requests\/([^/]+)\/shares$/);
    if (prayerShareMatch && request.method === "POST") {
      let prayerId: string;
      try { prayerId = decodeURIComponent(prayerShareMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_PRAYER_REQUEST_ID" } }, requestId, origin); }
      return sharePrayerRequest(request, env, prayerId, requestId, origin);
    }
    const prayerRequestMatch = url.pathname.match(/^\/api\/v1\/pastoral\/prayer\/requests\/([^/]+)$/);
    if (prayerRequestMatch && request.method === "PATCH") {
      let prayerId: string;
      try { prayerId = decodeURIComponent(prayerRequestMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_PRAYER_REQUEST_ID" } }, requestId, origin); }
      return updatePrayerRequestStatus(request, env, prayerId, requestId, origin);
    }


    if (url.pathname === "/api/v1/followup/tasks" && request.method === "GET") {
      return listFollowupTasks(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/followup/tasks" && request.method === "POST") {
      return createFollowupTask(request, env, requestId, origin);
    }
    const followupTaskAssignMatch = url.pathname.match(/^\/api\/v1\/followup\/tasks\/([^/]+)\/assign$/);
    if (followupTaskAssignMatch && request.method === "POST") {
      let taskId: string;
      try { taskId = decodeURIComponent(followupTaskAssignMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_TASK_ID" } }, requestId, origin); }
      return reassignFollowupTask(request, env, taskId, requestId, origin);
    }

    const followupTaskMatch = url.pathname.match(/^\/api\/v1\/followup\/tasks\/([^/]+)$/);
    if (followupTaskMatch && request.method === "PATCH") {
      let taskId: string;
      try { taskId = decodeURIComponent(followupTaskMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_TASK_ID" } }, requestId, origin); }
      return updateFollowupTask(request, env, taskId, requestId, origin);
    }

    if (url.pathname === "/api/v1/contacts" && request.method === "GET") {
      return listContacts(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/contacts" && request.method === "POST") {
      return createContact(request, env, requestId, origin);
    }
    const contactNotesMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/notes$/);
    if (contactNotesMatch) {
      let contactId: string;
      try { contactId = decodeURIComponent(contactNotesMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin); }
      if (request.method === "GET") return listContactNotes(request, env, contactId, requestId, origin);
      if (request.method === "POST") return createContactNote(request, env, contactId, requestId, origin);
    }

    const contactMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)$/);
    if (contactMatch) {
      let contactId: string;
      try { contactId = decodeURIComponent(contactMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin); }
      if (request.method === "GET") return getContact(request, env, contactId, requestId, origin);
      if (request.method === "PATCH") return updateContact(request, env, contactId, requestId, origin);
    }
    const contactAssignMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/assign$/);
    if (contactAssignMatch && request.method === "POST") {
      let contactId: string;
      try { contactId = decodeURIComponent(contactAssignMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin); }
      return assignContact(request, env, contactId, requestId, origin);
    }

    const interactionMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/interactions$/);
    if (interactionMatch) {
      let contactId: string;
      try { contactId = decodeURIComponent(interactionMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin); }
      if (request.method === "GET") return listContactInteractions(request, env, contactId, requestId, origin);
      if (request.method === "POST") return createContactInteraction(request, env, contactId, requestId, origin);
    }

    if (url.pathname === "/api/public/content" && request.method === "GET") {
      return getPublicContent(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/calendar" && request.method === "GET") {
      return listCalendarEntries(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/calendar" && request.method === "POST") {
      return createCalendarEntry(request, env, requestId, origin);
    }
    const calendarMatch = url.pathname.match(/^\/api\/v1\/calendar\/([^/]+)$/);
    if (calendarMatch) {
      let entryId: string;
      try { entryId = decodeURIComponent(calendarMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_CALENDAR_ENTRY_ID" } }, requestId, origin); }
      if (request.method === "GET") return getCalendarEntry(request, env, entryId, requestId, origin);
      if (request.method === "PATCH") return updateCalendarEntry(request, env, entryId, requestId, origin);
    }
    if (url.pathname === "/api/v1/announcements" && request.method === "GET") {
      return listAnnouncements(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/announcements" && request.method === "POST") {
      return createAnnouncement(request, env, requestId, origin);
    }
    const announcementActionMatch = url.pathname.match(/^\/api\/v1\/announcements\/([^/]+)\/(publish|archive)$/);
    if (announcementActionMatch && request.method === "POST") {
      let announcementId: string;
      try { announcementId = decodeURIComponent(announcementActionMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_ID" } }, requestId, origin); }
      if (announcementActionMatch[2] === "publish") return publishAnnouncement(request, env, announcementId, requestId, origin);
      return archiveAnnouncement(request, env, announcementId, requestId, origin);
    }
    const announcementMatch = url.pathname.match(/^\/api\/v1\/announcements\/([^/]+)$/);
    if (announcementMatch) {
      let announcementId: string;
      try { announcementId = decodeURIComponent(announcementMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_ID" } }, requestId, origin); }
      if (request.method === "GET") return getAnnouncement(request, env, announcementId, requestId, origin);
      if (request.method === "PATCH") return updateAnnouncement(request, env, announcementId, requestId, origin);
    }

    if (url.pathname === "/api/v1/events" && request.method === "GET") {
      return listEvents(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/events" && request.method === "POST") {
      return createEvent(request, env, requestId, origin);
    }
    const eventActionMatch = url.pathname.match(/^\/api\/v1\/events\/([^/]+)\/(publish|cancel)$/);
    if (eventActionMatch && request.method === "POST") {
      let eventId: string;
      try { eventId = decodeURIComponent(eventActionMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_EVENT_ID" } }, requestId, origin); }
      if (eventActionMatch[2] === "publish") return publishEvent(request, env, eventId, requestId, origin);
      return cancelEvent(request, env, eventId, requestId, origin);
    }
    const eventMatch = url.pathname.match(/^\/api\/v1\/events\/([^/]+)$/);
    if (eventMatch) {
      let eventId: string;
      try { eventId = decodeURIComponent(eventMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_EVENT_ID" } }, requestId, origin); }
      if (request.method === "GET") return getEvent(request, env, eventId, requestId, origin);
      if (request.method === "PATCH") return updateEvent(request, env, eventId, requestId, origin);
    }

    if (url.pathname === "/api/v1/staff/invitations/accept" && request.method === "POST") {
      return acceptStaffInvitation(request, env, requestId, origin);
    }

    if (url.pathname === "/api/v1/staff/invitations" && request.method === "POST") {
      return createStaffInvitation(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/staff/invitations" && request.method === "GET") {
      return listStaffInvitations(request, env, requestId, origin);
    }
    const invitationRevokeMatch = url.pathname.match(/^\/api\/v1\/staff\/invitations\/([^/]+)\/revoke$/);
    if (invitationRevokeMatch && request.method === "POST") {
      let invitationId: string;
      try { invitationId = decodeURIComponent(invitationRevokeMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_INVITATION_ID" } }, requestId, origin); }
      return revokeStaffInvitation(request, env, invitationId, requestId, origin);
    }

    if (url.pathname === "/api/v1/staff/audit" && request.method === "GET") {
      return listStaffAudit(request, env, requestId, origin);
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
