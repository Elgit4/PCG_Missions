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
    values: [staffUserId, now, now, now, now],
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
  const now = new Date().toISOString();
  const readPredicate = contactScopePredicate(readScope, "c", context.staff.userId, context.activeBranch.branchId, now);
  const detailPredicate = contactScopePredicate(detailScope, "c", context.staff.userId, context.activeBranch.branchId, now);
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
  const bindValues: unknown[] = [
    detailPredicate.values.length > 0 ? 1 : detailScope === "branch" ? 1 : 0,
    ...detailPredicate.values,
    context.activeBranch.branchId,
  ];
  if (status !== "all") bindValues.push(status);
  bindValues.push(`%${search}%`, `%${search}%`, `%${search}%`);
  bindValues.push(...readPredicate.values, limit);
  const rows = await env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email,
           c.age_range, c.preferred_language, c.contact_status, c.created_at, c.updated_at
    FROM contact c
    WHERE c.branch_id = ?
      AND ${statusPredicate}
      AND (? = '%%' OR c.first_name LIKE ? OR COALESCE(c.last_name, '') LIKE ?)
      AND (${readPredicate.sql})
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ?
  `).bind(
    detailScope ? 1 : 0, ...detailPredicate.values,
    detailScope ? 1 : 0, ...detailPredicate.values,
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
  const predicate = contactScopePredicate(scope, "c", access.staff.userId, access.activeBranch.branchId, now);
  const details = await authorizeRequestCapability(request, env, "contacts.contact_details.read", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  const includeDetails = details.state === "authorized";
  const row = await env.DB.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 THEN c.email_normalized ELSE NULL END AS email,
           c.age_range, c.preferred_language, c.contact_status, c.created_at, c.updated_at
    FROM contact c
    WHERE c.id = ? AND c.branch_id = ? AND (${predicate.sql})
    LIMIT 1
  `).bind(
    includeDetails ? 1 : 0, includeDetails ? 1 : 0,
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
  const predicate = contactScopePredicate(access.decision.scopeMode as ContactScopeMode, "contact", access.staff.userId, access.activeBranch.branchId, now);
  const result = await env.DB.prepare(`
    UPDATE contact SET ${assignments.join(", ")}
    WHERE id = ? AND branch_id = ? AND contact_status <> 'merged' AND (${predicate.sql})
  `).bind(
    ...Object.values(values), now, contactId, access.activeBranch.branchId, ...predicate.values,
  ).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) {
    return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND_OR_NOT_ACCESSIBLE" } }, requestId, origin);
  }
  return json(200, { ok: true, contact_id: contactId, updated_at: now }, requestId, origin);
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
  const predicate = contactScopePredicate(access.decision.scopeMode as ContactScopeMode, "c", access.staff.userId, access.activeBranch.branchId, now);
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

    if (url.pathname === "/api/v1/contacts" && request.method === "GET") {
      return listContacts(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/contacts" && request.method === "POST") {
      return createContact(request, env, requestId, origin);
    }
    const contactMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)$/);
    if (contactMatch) {
      let contactId: string;
      try { contactId = decodeURIComponent(contactMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin); }
      if (request.method === "GET") return getContact(request, env, contactId, requestId, origin);
      if (request.method === "PATCH") return updateContact(request, env, contactId, requestId, origin);
    }
    const interactionMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/interactions$/);
    if (interactionMatch && request.method === "POST") {
      let contactId: string;
      try { contactId = decodeURIComponent(interactionMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin); }
      return createContactInteraction(request, env, contactId, requestId, origin);
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
