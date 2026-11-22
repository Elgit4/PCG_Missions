import { createSupabaseAuthUser, deleteSupabaseAuthUser } from "./auth.ts";
import { authorizeRequestCapability, resolveStaffContext, type StaffEnvironment } from "./staff-context.ts";

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
  APP_ALLOWED_ORIGINS?: string;
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
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify({ ...body, request_id: requestId }), { status, headers });
}

function allowedOrigins(env: Env): Set<string> {
  const values = (env.APP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const origins = new Set<string>();
  for (const value of values) {
    try {
      const parsed = new URL(value);
      if ((parsed.protocol === "https:" || parsed.hostname === "localhost") && parsed.origin === value.replace(/\/$/, "")) origins.add(parsed.origin);
    } catch {
      // Ignore malformed configured origins; an empty allowlist fails closed.
    }
  }
  return origins;
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
    state === "auth_unavailable" ? 503 :
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
    authUserId = await createSupabaseAuthUser(env, {
      email: invitation.email,
      password,
      fullName: invitation.full_name,
    });
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
    // Compensate the Supabase Auth identity if D1 provisioning did not commit.
    try {
      await deleteSupabaseAuthUser(env, authUserId);
    } catch {
      // The invitation remains pending; an orphan identity cannot access Worker APIs without a staff profile.
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
  const url = new URL(request.url);
  const requestedBranchId = url.searchParams.get("branch_id");
  if (requestedBranchId !== null && requestedBranchId !== access.activeBranch.branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  const rawOffset = url.searchParams.get("offset");
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 10000 ||
      [...url.searchParams.keys()].some((key) => !["branch_id", "limit", "offset", "search"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_STAFF_DIRECTORY_QUERY" } }, requestId, origin);
  }
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(`
    SELECT sp.id, sp.full_name, sp.account_status, sp.last_active_at,
           (
             SELECT json_group_array(json_object('code', r2.code, 'name', r2.name))
             FROM staff_role_assignment sra2
             JOIN role r2 ON r2.id = sra2.role_id AND r2.is_active = 1
             WHERE sra2.staff_profile_id = sp.id
               AND sra2.branch_id = ?
               AND sra2.revoked_at IS NULL
               AND sra2.starts_at <= ?
               AND (sra2.ends_at IS NULL OR sra2.ends_at > ?)
           ) AS roles_json
    FROM staff_profile sp
    WHERE EXISTS (
      SELECT 1 FROM staff_role_assignment sra
      JOIN role r ON r.id = sra.role_id AND r.is_active = 1
      WHERE sra.staff_profile_id = sp.id
        AND sra.branch_id = ?
        AND sra.revoked_at IS NULL
        AND sra.starts_at <= ?
        AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    )
      AND (? = '' OR sp.full_name LIKE ?)
    ORDER BY sp.full_name COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).bind(
    access.activeBranch.branchId, now, now,
    access.activeBranch.branchId, now, now,
    search, search ? `%${search}%` : "",
    limit, offset,
  ).all<{
    id: string; full_name: string; account_status: string; last_active_at: string | null; roles_json: string | null;
  }>();
  const staff = (rows.results ?? []).map((row) => {
    let roles: Array<{ code: string; name: string }> = [];
    try { roles = JSON.parse(row.roles_json ?? "[]") as Array<{ code: string; name: string }>; }
    catch { roles = []; }
    return { id: row.id, full_name: row.full_name, account_status: row.account_status, roles };
  });
  return json(200, { ok: true, data: staff }, requestId, origin);
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
  const privateScope = bestScope(grants.filter((g) => g.code === "contacts.private_fields.read").map((g) => g.scopeMode));
  const now = new Date().toISOString();
  const readPredicate = contactScopePredicate(readScope, "c", context.staff.userId, context.activeBranch.branchId, now);
  const detailPredicate = contactScopePredicate(detailScope, "c", context.staff.userId, context.activeBranch.branchId, now);
  const privatePredicate = contactScopePredicate(privateScope, "c", context.staff.userId, context.activeBranch.branchId, now);
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  const status = url.searchParams.get("status") ?? "active";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  const rawOffset = url.searchParams.get("offset");
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  const requestedBranchId = url.searchParams.get("branch_id");
  if ((requestedBranchId !== null && requestedBranchId !== context.activeBranch.branchId) ||
      !["active", "archived", "all"].includes(status) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 10000 ||
      [...url.searchParams.keys()].some((key) => !["branch_id", "search", "status", "limit", "offset"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_QUERY" } }, requestId, origin);
  }
  const statusPredicate = status === "all" ? "1 = 1" : "c.contact_status = ?";
  const rows = await env.DB.prepare(`
    SELECT c.id, c.branch_id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_display ELSE NULL END AS phone_display,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email_normalized,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.age_range ELSE NULL END AS age_range,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.preferred_language ELSE NULL END AS preferred_language,
           c.contact_status, c.created_at, c.updated_at
    FROM contact c
    WHERE c.branch_id = ?
      AND ${statusPredicate}
      AND (? = '%%' OR c.first_name LIKE ? OR COALESCE(c.last_name, '') LIKE ?)
      AND (${readPredicate.sql})
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ? OFFSET ?
  `).bind(
    detailScope ? 1 : 0, ...detailPredicate.values,
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
    limit, offset,
  ).all<{
    id: string; branch_id: string; first_name: string; last_name: string | null; preferred_name: string | null;
    phone_e164: string | null; phone_display: string | null; email_normalized: string | null;
    age_range: string | null; preferred_language: string | null;
    contact_status: string; created_at: string; updated_at: string;
  }>();
  return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
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
  const respondWithContact = async (
    id: string,
    status: 200 | 201,
    idempotentReplay: boolean,
  ): Promise<Response> => {
    const contact = await env.DB.prepare(`
      SELECT id, branch_id, first_name, last_name, preferred_name,
             contact_status, created_at, updated_at
      FROM contact
      WHERE id = ? AND branch_id = ?
      LIMIT 1
    `).bind(id, access.activeBranch.branchId).first<{
      id: string;
      branch_id: string;
      first_name: string;
      last_name: string | null;
      preferred_name: string | null;
      contact_status: string;
      created_at: string;
      updated_at: string;
    }>();
    if (!contact) {
      return json(500, { ok: false, error: { code: "CONTACT_CAPTURE_READBACK_FAILED" } }, requestId, origin);
    }
    return json(status, {
      ok: true,
      data: {
        ...contact,
        phone_e164: null,
        phone_display: null,
        email_normalized: null,
        age_range: null,
        preferred_language: null,
        identity_redacted: true,
      },
      idempotent_replay: idempotentReplay,
    }, requestId, origin);
  };
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
    return respondWithContact(existing.contact_id, 200, true);
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
      return respondWithContact(raced.contact_id, 200, true);
    }
    return json(409, { ok: false, error: { code: "CONTACT_CAPTURE_CONFLICT" } }, requestId, origin);
  }
  return respondWithContact(contactId, 201, false);
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
  const privateFields = await authorizeRequestCapability(request, env, "contacts.private_fields.read", {
    type: "contact", recordId: contactId, teamId: resource.teamId,
  });
  const includePrivate = privateFields.state === "authorized";
  const privatePredicate = contactScopePredicate(
    includePrivate ? privateFields.decision.scopeMode as ContactScopeMode : null,
    "c", access.staff.userId, access.activeBranch.branchId, now,
  );
  const detailPredicate = contactScopePredicate(
    includeDetails ? details.decision.scopeMode as ContactScopeMode : null,
    "c", access.staff.userId, access.activeBranch.branchId, now,
  );
  const row = await env.DB.prepare(`
    SELECT c.id, c.branch_id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email_normalized,
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
  return json(200, {
    ok: true,
    data: { ...row, identity_redacted: !includeDetails },
  }, requestId, origin);
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
  const predicate = contactScopePredicate(access.decision.scopeMode as ContactScopeMode, "contact", access.staff.userId, access.activeBranch.branchId, now);
  const additionalPredicates: string[] = [];
  const additionalValues: unknown[] = [];
  if (privateFieldAccess?.state === "authorized") {
    const privatePredicate = contactScopePredicate(
      privateFieldAccess.decision.scopeMode as ContactScopeMode, "contact",
      access.staff.userId, access.activeBranch.branchId, now,
    );
    additionalPredicates.push(privatePredicate.sql);
    additionalValues.push(...privatePredicate.values);
  }
  if (detailFieldAccess?.state === "authorized") {
    const detailPredicate = contactScopePredicate(
      detailFieldAccess.decision.scopeMode as ContactScopeMode, "contact",
      access.staff.userId, access.activeBranch.branchId, now,
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
  return getContact(request, env, contactId, requestId, origin);
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
    access.staff.userId,
    access.activeBranch.branchId,
    now,
  );
  const rows = await env.DB.prepare(`
    SELECT i.id, i.interaction_type, i.occurred_at, i.outcome_code,
           i.summary, i.next_action_at, i.created_at
    FROM contact_interaction i
    JOIN contact c ON c.id = i.contact_id AND c.branch_id = i.branch_id
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
    interaction_type: "call" | "visit" | "message" | "meeting" | "other";
    occurred_at: string;
    outcome_code: string | null;
    summary: string | null;
    next_action_at: string | null;
    created_at: string;
  }>();

  return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
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
  const created = await env.DB.prepare(`
    SELECT id, interaction_type, occurred_at, outcome_code, summary, next_action_at, created_at
    FROM contact_interaction
    WHERE id = ? AND contact_id = ? AND branch_id = ?
    LIMIT 1
  `).bind(interactionId, contactId, access.activeBranch.branchId).first<{
    id: string; interaction_type: "call" | "visit" | "message" | "meeting" | "other";
    occurred_at: string; outcome_code: string | null; summary: string | null;
    next_action_at: string | null; created_at: string;
  }>();
  if (!created) return json(500, { ok: false, error: { code: "CONTACT_INTERACTION_READBACK_FAILED" } }, requestId, origin);
  return json(201, { ok: true, data: created }, requestId, origin);
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
      access.decision.scopeMode as ContactScopeMode, "c", access.staff.userId,
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
      access.decision.scopeMode as ContactScopeMode, "c", access.staff.userId,
      access.activeBranch.branchId, now,
    ).values,
    access.staff.userId, scope,
    access.staff.userId, now, now,
    access.staff.profileId, now, now,
  ).all<{
    id: string; author_user_id: string; author_name: string; body: string;
    visibility: string; team_id: string | null; created_at: string; updated_at: string;
  }>();
  const notes = (rows.results ?? []).map(({ id, body, created_at, updated_at }) => ({ id, body, created_at, updated_at }));
  return json(200, { ok: true, data: notes }, requestId, origin);
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
  const predicate = contactScopePredicate(scope as ContactScopeMode, "c", access.staff.userId, access.activeBranch.branchId, now);
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
  return json(201, { ok: true, data: { id: noteId, body: noteBody, created_at: now, updated_at: now } }, requestId, origin);
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
  const rawOffset = url.searchParams.get("offset");
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  if (!["open","in_progress","completed","cancelled","all"].includes(status) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 10000 ||
      [...url.searchParams.keys()].some((key) => !["status","limit","offset"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_QUERY" } }, requestId, origin);
  }
  const statusPredicate = status === "all" ? "1 = 1" : "ft.status = ?";
  const rows = await env.DB.prepare(`
    SELECT ft.id, ft.branch_id, ft.contact_id, c.first_name, c.last_name, c.preferred_name,
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
    LIMIT ? OFFSET ?
  `).bind(
    detailScope ? 1 : 0, ...detailPredicate.values,
    detailScope ? 1 : 0, ...detailPredicate.values,
    context.activeBranch.branchId,
    ...(status === "all" ? [] : [status]),
    ...readPredicate.values,
    limit, offset,
  ).all<Record<string, unknown>>();
  return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
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
    contact_id?: unknown; assignee_user_id?: unknown; assignee_profile_id?: unknown; team_id?: unknown;
    list_id?: unknown; priority?: unknown; due_at?: unknown; task_note?: unknown;
  };
  const allowed = new Set(["contact_id","assignee_user_id","assignee_profile_id","team_id","list_id","priority","due_at","task_note"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_BODY" } }, requestId, origin);
  }
  const contactId = typeof payload.contact_id === "string" ? payload.contact_id.trim() : "";
  const assigneeAuthUserId = typeof payload.assignee_user_id === "string" ? payload.assignee_user_id.trim() : "";
  const requestedAssigneeProfileId = typeof payload.assignee_profile_id === "string" ? payload.assignee_profile_id.trim() : "";
  const requestedTeamId = typeof payload.team_id === "string" ? payload.team_id.trim() : "";
  const hasAssignmentTargets = Number(Boolean(assigneeAuthUserId)) +
    Number(Boolean(requestedAssigneeProfileId)) + Number(Boolean(requestedTeamId));
  const listId = typeof payload.list_id === "string" ? payload.list_id.trim() || null : null;
  const priority = payload.priority === undefined ? 3 : payload.priority;
  const dueAt = payload.due_at === undefined || payload.due_at === null || payload.due_at === ""
    ? null : parseIsoTimestamp(payload.due_at, "");
  const taskNote = typeof payload.task_note === "string" ? payload.task_note.trim() || null : null;
  if (
    !contactId || contactId.length > 128 ||
    hasAssignmentTargets !== 1 ||
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
  if (assigneeAuthUserId || requestedAssigneeProfileId) {
    const assigneeLookup = assigneeAuthUserId ? "sp.auth_user_id = ?" : "sp.id = ?";
    const assigneeLookupValue = assigneeAuthUserId || requestedAssigneeProfileId;
    const target = await env.DB.prepare(`
      SELECT sp.id AS profile_id, sp.auth_user_id
      FROM staff_profile sp
      WHERE ${assigneeLookup} AND sp.account_status = 'active'
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          WHERE ra.staff_profile_id = sp.id AND ra.branch_id = ?
            AND ra.revoked_at IS NULL AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        )
      LIMIT 1
    `).bind(assigneeLookupValue, context.activeBranch.branchId, now, now)
      .first<{ profile_id: string; auth_user_id: string }>();
    if (!target) return json(400, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_NOT_ACTIVE" } }, requestId, origin);
    assigneeUserId = target.auth_user_id;
    if (assignScope === "team") {
      const member = await env.DB.prepare(`
        SELECT 1 FROM staff_team_membership tm
        WHERE tm.team_id = ? AND tm.branch_id = ? AND tm.staff_profile_id = ?
          AND tm.revoked_at IS NULL AND tm.starts_at <= ?
          AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        LIMIT 1
      `).bind(teamIdForScope, context.activeBranch.branchId, target.profile_id, now, now).first();
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
  const respondWithTask = async (id: string, status: 200 | 201, idempotentReplay: boolean): Promise<Response> => {
    const task = await env.DB.prepare(`
      SELECT id, branch_id, contact_id, assignee_user_id, team_id, priority,
             due_at, status, task_note, created_at, updated_at
      FROM followup_task
      WHERE id = ? AND branch_id = ?
      LIMIT 1
    `).bind(id, context.activeBranch!.branchId).first<{
      id: string; branch_id: string; contact_id: string; assignee_user_id: string | null;
      team_id: string | null; priority: number; due_at: string | null; status: "open" | "in_progress" | "completed" | "cancelled";
      task_note: string | null; created_at: string; updated_at: string;
    }>();
    if (!task) return json(500, { ok: false, error: { code: "FOLLOWUP_TASK_READBACK_FAILED" } }, requestId, origin);
    return json(status, { ok: true, data: task, idempotent_replay: idempotentReplay }, requestId, origin);
  };

  const existing = await env.DB.prepare(`
    SELECT id, hex(request_digest) AS digest_hex
    FROM followup_task
    WHERE branch_id = ? AND client_request_id = ? LIMIT 1
  `).bind(context.activeBranch.branchId, idempotencyKey).first<{ id: string; digest_hex: string }>();
  if (existing) {
    if (existing.digest_hex.toLowerCase() !== digestHex) {
      return json(409, { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" } }, requestId, origin);
    }
    return respondWithTask(existing.id, 200, true);
  }

  const taskId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const digestBytes = new Uint8Array(digestHex.match(/.{2}/g)!.map((pair) => parseInt(pair, 16)));
  const contactPredicate = contactScopePredicate(
    createScope, "c", context.staff.userId, context.activeBranch.branchId, now,
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
    const statements: D1PreparedStatement[] = [
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
    ];
    if (assigneeUserId !== null) {
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO staff_notification
          (id, branch_id, recipient_user_id, category, title, body, target_type, target_id, idempotency_key, created_at)
        SELECT ?, ?, ?, 'followup_assigned', 'New follow-up task',
               'A follow-up task has been assigned to you.', 'followup_task', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM followup_task WHERE id = ? AND branch_id = ?)
      `).bind(
        crypto.randomUUID(), context.activeBranch.branchId, assigneeUserId,
        taskId, `followup-task:${taskId}:assigned:${assigneeUserId}`, now,
        taskId, context.activeBranch.branchId,
      ));
    }
    const results = await env.DB.batch(statements);
    if (results.some((result) => !result.success) ||
        results.slice(0, 2).some((result) => (result.meta?.changes ?? 0) !== 1) ||
        (assigneeUserId !== null && (results[2]?.meta?.changes ?? 0) !== 1)) {
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
  return respondWithTask(taskId, 201, false);
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
  const updatedTask = await env.DB.prepare(`
    SELECT id, branch_id, contact_id, assignee_user_id, team_id, priority,
           due_at, status, task_note, created_at, updated_at
    FROM followup_task
    WHERE id = ? AND branch_id = ?
    LIMIT 1
  `).bind(taskId, access.activeBranch.branchId).first<Record<string, unknown>>();
  if (!updatedTask) {
    return json(500, { ok: false, error: { code: "FOLLOWUP_TASK_READBACK_FAILED" } }, requestId, origin);
  }
  return json(200, { ok: true, data: updatedTask }, requestId, origin);
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
    const statements: D1PreparedStatement[] = [
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
    ];
    if (nextAssignee !== null) {
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO staff_notification
          (id, branch_id, recipient_user_id, category, title, body, target_type, target_id, idempotency_key, created_at)
        SELECT ?, ?, ?, 'followup_assigned', 'Follow-up task reassigned',
               'A follow-up task has been assigned to you.', 'followup_task', ?, ?, ?
        FROM followup_task
        WHERE id = ? AND branch_id = ? AND assignee_user_id = ? AND changes() = 1
      `).bind(
        crypto.randomUUID(), context.activeBranch.branchId, nextAssignee,
        taskId, `followup-task:${taskId}:assignment:${eventId}`, now,
        taskId, context.activeBranch.branchId, nextAssignee,
      ));
    }
    const results = await env.DB.batch(statements);
    if (results.some((result) => !result.success) ||
        (results[0]?.meta?.changes ?? 0) !== 1 ||
        (results[1]?.meta?.changes ?? 0) !== 1 ||
        (nextAssignee !== null && (results[2]?.meta?.changes ?? 0) !== 1)) {
      return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "FOLLOWUP_REASSIGNMENT_CONFLICT" } }, requestId, origin);
  }
  const updatedTask = await env.DB.prepare(`
    SELECT id, branch_id, contact_id, assignee_user_id, team_id, priority,
           due_at, status, task_note, created_at, updated_at
    FROM followup_task
    WHERE id = ? AND branch_id = ?
    LIMIT 1
  `).bind(taskId, context.activeBranch.branchId).first<Record<string, unknown>>();
  if (!updatedTask) {
    return json(500, { ok: false, error: { code: "FOLLOWUP_TASK_READBACK_FAILED" } }, requestId, origin);
  }
  return json(200, { ok: true, data: updatedTask }, requestId, origin);
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


async function listTeamOperationsCollection(
  request: Request,
  env: Env,
  requestId: string,
  origin: string | undefined,
  resource: "teams" | "areas",
): Promise<Response> {
  const url = new URL(request.url);
  const branchIds = url.searchParams.getAll("branch_id");
  const branchId = branchIds[0] ?? "";
  if (
    branchIds.length !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)
  ) {
    return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
  }

  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") {
    return mapCapabilityFailure(context.state, requestId, origin);
  }
  if (!context.activeBranch) {
    return mapCapabilityFailure("branch_required", requestId, origin);
  }
  if (context.activeBranch.branchId !== branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_SCOPE_MISMATCH" } }, requestId, origin);
  }

  const readCapability = resource === "teams" ? "team.read" : "area.read";
  const grants = context.activeBranch.capabilities.filter((item) => item.code === readCapability);
  const branchRead = grants.some((item) => item.scopeMode === "branch");
  const teamRead = grants.some((item) => item.scopeMode === "team");
  if (!branchRead && !teamRead) {
    return mapCapabilityFailure("capability_denied", requestId, origin);
  }

  // Staff names are an independent, branch-scoped permission. Team Leaders can
  // inspect their own team directory without receiving the wider staff directory.
  const includeStaffNames = context.activeBranch.capabilities.some(
    (item) => item.code === "staff.directory.read" && item.scopeMode === "branch",
  );
  const now = new Date().toISOString();

  try {
    if (resource === "teams") {
      const teamsResult = await env.DB.prepare(`
        SELECT t.id, t.branch_id, t.name, t.description, t.is_active, t.created_at, t.updated_at
        FROM team t
        WHERE t.branch_id = ?
          AND (? = 1 OR t.is_active = 1)
          AND (
            ? = 1
            OR EXISTS (
              SELECT 1
              FROM staff_team_membership actor_membership
              WHERE actor_membership.team_id = t.id
                AND actor_membership.branch_id = t.branch_id
                AND actor_membership.staff_profile_id = ?
                AND actor_membership.membership_role = 'leader'
                AND actor_membership.starts_at <= ?
                AND actor_membership.revoked_at IS NULL
                AND (actor_membership.ends_at IS NULL OR actor_membership.ends_at > ?)
            )
          )
        ORDER BY t.is_active DESC, t.name ASC
      `).bind(branchId, branchRead ? 1 : 0, branchRead ? 1 : 0, context.staff.profileId, now, now)
        .all<Record<string, unknown>>();
      const membershipsResult = await env.DB.prepare(`
        SELECT stm.id, stm.team_id, stm.staff_profile_id, stm.membership_role,
               stm.starts_at, stm.ends_at, stm.created_at
        FROM staff_team_membership stm
        WHERE stm.branch_id = ?
          AND stm.starts_at <= ?
          AND stm.revoked_at IS NULL
          AND (stm.ends_at IS NULL OR stm.ends_at > ?)
          AND EXISTS (
            SELECT 1
            FROM staff_profile active_member
            WHERE active_member.id = stm.staff_profile_id
              AND active_member.account_status = 'active'
              AND active_member.deactivated_at IS NULL
          )
          AND (
            ? = 1
            OR EXISTS (
              SELECT 1
              FROM staff_team_membership actor_membership
              JOIN team active_team
                ON active_team.id = actor_membership.team_id
               AND active_team.branch_id = actor_membership.branch_id
               AND active_team.is_active = 1
              WHERE actor_membership.team_id = stm.team_id
                AND actor_membership.branch_id = stm.branch_id
                AND actor_membership.staff_profile_id = ?
                AND actor_membership.membership_role = 'leader'
                AND actor_membership.starts_at <= ?
                AND actor_membership.revoked_at IS NULL
                AND (actor_membership.ends_at IS NULL OR actor_membership.ends_at > ?)
            )
          )
        ORDER BY stm.created_at ASC
      `).bind(branchId, now, now, branchRead ? 1 : 0, context.staff.profileId, now, now)
        .all<Record<string, unknown>>();
      const memberships = membershipsResult.results ?? [];
      const profileIds = includeStaffNames
        ? [...new Set(memberships.map((item) => String(item.staff_profile_id)))]
        : [];
      let profiles: Record<string, unknown>[] = [];
      if (profileIds.length) {
        const placeholders = profileIds.map(() => "?").join(", ");
        const result = await env.DB.prepare(`
          SELECT id, full_name, account_status
          FROM staff_profile
          WHERE id IN (${placeholders})
        `).bind(...profileIds).all<Record<string, unknown>>();
        profiles = result.results ?? [];
      }
      const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));
      const teams = (teamsResult.results ?? []).map((team) => {
        const teamMembers = memberships.filter((membership) => membership.team_id === team.id);
        return {
          ...team,
          is_active: Boolean(team.is_active),
          member_count: teamMembers.length,
          members: includeStaffNames ? teamMembers.map((membership) => ({
            ...membership,
            staff: profileById.get(String(membership.staff_profile_id)) ?? null,
          })) : [],
        };
      });
      return json(200, { ok: true, data: { teams } }, requestId, origin);
    }

    // Branch readers see the branch directory. Team-scoped readers see only
    // service areas with active coverage assigned to a current member of one
    // of their own teams; team membership never widens to the whole branch.
    const areasResult = await env.DB.prepare(`
      SELECT sa.id, sa.branch_id, sa.name, sa.code, sa.is_active, sa.created_at, sa.updated_at
      FROM service_area sa
      WHERE sa.branch_id = ?
        AND (
          ? = 1
          OR EXISTS (
            SELECT 1
            FROM staff_area_coverage sac
            JOIN staff_team_membership covered_member
              ON covered_member.staff_profile_id = sac.staff_profile_id
             AND covered_member.branch_id = sac.branch_id
            JOIN staff_profile covered_profile
              ON covered_profile.id = covered_member.staff_profile_id
             AND covered_profile.account_status = 'active'
             AND covered_profile.deactivated_at IS NULL
            JOIN team covered_team
              ON covered_team.id = covered_member.team_id
             AND covered_team.branch_id = covered_member.branch_id
             AND covered_team.is_active = 1
            WHERE sac.service_area_id = sa.id
              AND sac.branch_id = sa.branch_id
              AND sac.starts_at <= ?
              AND sac.revoked_at IS NULL
              AND (sac.ends_at IS NULL OR sac.ends_at > ?)
              AND covered_member.starts_at <= ?
              AND covered_member.revoked_at IS NULL
              AND (covered_member.ends_at IS NULL OR covered_member.ends_at > ?)
              AND EXISTS (
                SELECT 1
                FROM staff_team_membership actor_membership
                WHERE actor_membership.team_id = covered_member.team_id
                  AND actor_membership.branch_id = covered_member.branch_id
                  AND actor_membership.staff_profile_id = ?
                  AND actor_membership.membership_role = 'leader'
                  AND actor_membership.starts_at <= ?
                  AND actor_membership.revoked_at IS NULL
                  AND (actor_membership.ends_at IS NULL OR actor_membership.ends_at > ?)
              )
          )
        )
      ORDER BY sa.is_active DESC, sa.name ASC
    `).bind(
      branchId, branchRead ? 1 : 0, now, now, now, now,
      context.staff.profileId, now, now,
    ).all<Record<string, unknown>>();
    const accessibleAreas = areasResult.results ?? [];
    const areaIds = accessibleAreas.map((area) => String(area.id));
    let coverage: Record<string, unknown>[] = [];
    if (areaIds.length) {
      const placeholders = areaIds.map(() => "?").join(", ");
      const coverageResult = await env.DB.prepare(`
        SELECT id, service_area_id, staff_profile_id, starts_at, ends_at, created_at
        FROM staff_area_coverage
        WHERE branch_id = ?
          AND service_area_id IN (${placeholders})
          AND starts_at <= ?
          AND revoked_at IS NULL
          AND (ends_at IS NULL OR ends_at > ?)
          AND (
            ? = 1
            OR EXISTS (
              SELECT 1
              FROM staff_team_membership covered_member
              JOIN staff_profile active_member
                ON active_member.id = covered_member.staff_profile_id
               AND active_member.account_status = 'active'
               AND active_member.deactivated_at IS NULL
              JOIN team covered_team
                ON covered_team.id = covered_member.team_id
               AND covered_team.branch_id = covered_member.branch_id
               AND covered_team.is_active = 1
              WHERE covered_member.staff_profile_id = staff_area_coverage.staff_profile_id
                AND covered_member.branch_id = staff_area_coverage.branch_id
                AND covered_member.starts_at <= ?
                AND covered_member.revoked_at IS NULL
                AND (covered_member.ends_at IS NULL OR covered_member.ends_at > ?)
                AND EXISTS (
                  SELECT 1
                  FROM staff_team_membership actor_membership
                  WHERE actor_membership.team_id = covered_member.team_id
                    AND actor_membership.branch_id = covered_member.branch_id
                    AND actor_membership.staff_profile_id = ?
                    AND actor_membership.membership_role = 'leader'
                    AND actor_membership.starts_at <= ?
                    AND actor_membership.revoked_at IS NULL
                    AND (actor_membership.ends_at IS NULL OR actor_membership.ends_at > ?)
                )
            )
          )
        ORDER BY starts_at DESC
      `).bind(
        branchId, ...areaIds, now, now,
        branchRead ? 1 : 0, now, now, context.staff.profileId, now, now,
      ).all<Record<string, unknown>>();
      coverage = coverageResult.results ?? [];
    }
    const profileIds = includeStaffNames
      ? [...new Set(coverage.map((item) => String(item.staff_profile_id)))]
      : [];
    let profiles: Record<string, unknown>[] = [];
    if (profileIds.length) {
      const placeholders = profileIds.map(() => "?").join(", ");
      const result = await env.DB.prepare(`
        SELECT id, full_name, account_status
        FROM staff_profile
        WHERE id IN (${placeholders})
      `).bind(...profileIds).all<Record<string, unknown>>();
      profiles = result.results ?? [];
    }
    const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));
    const areas = accessibleAreas.map((area) => {
      const areaCoverage = coverage.filter((item) => item.service_area_id === area.id);
      return {
        ...area,
        is_active: Boolean(area.is_active),
        coverage_count: areaCoverage.length,
        coverage: includeStaffNames ? areaCoverage.map((item) => ({
          ...item,
          staff: profileById.get(String(item.staff_profile_id)) ?? null,
        })) : [],
      };
    });
    return json(200, { ok: true, data: { areas } }, requestId, origin);
  } catch {
    return json(500, {
      ok: false,
      error: { code: resource === "teams" ? "TEAM_LIST_FAILED" : "SERVICE_AREA_LIST_FAILED" },
    }, requestId, origin);
  }
}


function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isUuidValue(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseTeamAreaName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 2 && normalized.length <= 160 ? normalized : null;
}

function parseTeamDescription(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 1000) return undefined;
  return value.trim() || null;
}

function parseAreaCode(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized.length < 2 || normalized.length > 24 || !/^[A-Z0-9_-]+$/.test(normalized)) return undefined;
  return normalized;
}


async function handleTeamMembershipOrCoverageMutation(
  request: Request,
  env: Env,
  requestId: string,
  origin: string | undefined,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean).slice(2);
  const resource = segments[0] ?? "";
  const isTeam = resource === "teams";
  const isArea = resource === "areas";
  const teamMemberCreate = isTeam && segments.length === 3 && segments[2] === "members" && request.method === "POST";
  const teamMemberRoleUpdate = isTeam && segments.length === 4 && segments[2] === "members" && request.method === "PATCH";
  const teamMemberRevoke = isTeam && segments.length === 5 && segments[2] === "members" && segments[4] === "revoke" && request.method === "POST";
  const areaCoverageCreate = isArea && segments.length === 3 && segments[2] === "coverage" && request.method === "POST";
  const areaCoverageRevoke = isArea && segments.length === 5 && segments[2] === "coverage" && segments[4] === "revoke" && request.method === "POST";
  if (!(teamMemberCreate || teamMemberRoleUpdate || teamMemberRevoke || areaCoverageCreate || areaCoverageRevoke)) {
    return json(404, { ok: false, error: { code: "ROUTE_NOT_FOUND" } }, requestId, origin);
  }

  const parentId = segments[1] ?? "";
  const childId = teamMemberRoleUpdate || teamMemberRevoke || areaCoverageRevoke ? segments[3] ?? "" : "";
  if (!isUuidValue(parentId) || (childId && !isUuidValue(childId))) {
    return json(400, { ok: false, error: { code: "INVALID_RESOURCE_ID" } }, requestId, origin);
  }
  const branchIds = url.searchParams.getAll("branch_id");
  const branchId = branchIds[0] ?? "";
  if (branchIds.length !== 1 || !isUuidValue(branchId)) {
    return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
  }

  let body: Record<string, unknown> = {};
  if (!teamMemberRevoke && !areaCoverageRevoke) {
    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) {
      return json(bodyResult.status, { ok: false, error: { code: bodyResult.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
    }
    if (!isPlainObject(bodyResult.value)) {
      return json(422, { ok: false, error: { code: "VALIDATION_ERROR" } }, requestId, origin);
    }
    body = bodyResult.value;
    const allowed = teamMemberCreate
      ? ["staff_profile_id", "membership_role"]
      : teamMemberRoleUpdate
        ? ["membership_role"]
        : ["staff_profile_id"];
    if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowed.includes(key))) {
      return json(422, { ok: false, error: { code: "VALIDATION_ERROR" } }, requestId, origin);
    }
  }

  const capability = isTeam ? "team.manage" : "area.manage";
  const access = await authorizeRequestCapability(request, env, capability);
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (access.activeBranch.branchId !== branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_SCOPE_MISMATCH" } }, requestId, origin);
  }

  const now = new Date().toISOString();
  const actorProfileId = access.staff.profileId;
  const staffProfileId = body.staff_profile_id;
  const membershipRole = body.membership_role ?? "member";
  if ((teamMemberCreate || areaCoverageCreate) && !isUuidValue(staffProfileId)) {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "A valid staff profile is required." } }, requestId, origin);
  }
  if ((teamMemberCreate || teamMemberRoleUpdate) && membershipRole !== "member" && membershipRole !== "leader") {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "membership_role must be member or leader." } }, requestId, origin);
  }

  try {
    if (isTeam) {
      const parent = await env.DB.prepare("SELECT id FROM team WHERE id = ? AND branch_id = ? LIMIT 1")
        .bind(parentId, branchId).first<{ id: string }>();
      if (!parent) return json(404, { ok: false, error: { code: "TEAM_NOT_FOUND" } }, requestId, origin);
    } else {
      const parent = await env.DB.prepare("SELECT id FROM service_area WHERE id = ? AND branch_id = ? LIMIT 1")
        .bind(parentId, branchId).first<{ id: string }>();
      if (!parent) return json(404, { ok: false, error: { code: "SERVICE_AREA_NOT_FOUND" } }, requestId, origin);
    }

    if (teamMemberCreate || areaCoverageCreate) {
      const staff = await env.DB.prepare(`
        SELECT sp.id
        FROM staff_profile sp
        WHERE sp.id = ?
          AND sp.account_status = 'active'
          AND sp.deactivated_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM staff_role_assignment assignment
            WHERE assignment.staff_profile_id = sp.id
              AND assignment.branch_id = ?
              AND assignment.revoked_at IS NULL
              AND assignment.starts_at <= ?
              AND (assignment.ends_at IS NULL OR assignment.ends_at > ?)
          )
        LIMIT 1
      `).bind(staffProfileId, branchId, now, now).first<{ id: string }>();
      if (!staff) return json(422, { ok: false, error: { code: "STAFF_NOT_ACTIVE_IN_BRANCH" } }, requestId, origin);
    }

    if (teamMemberCreate) {
      const duplicate = await env.DB.prepare(`
        SELECT id FROM staff_team_membership
        WHERE team_id = ? AND branch_id = ? AND staff_profile_id = ?
          AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > ?)
        LIMIT 1
      `).bind(parentId, branchId, staffProfileId, now).first<{ id: string }>();
      if (duplicate) return json(409, { ok: false, error: { code: "TEAM_MEMBER_ALREADY_ACTIVE" } }, requestId, origin);
      const id = crypto.randomUUID();
      const auditId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO staff_team_membership (id, staff_profile_id, team_id, branch_id, membership_role, starts_at, ends_at, revoked_at, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        `).bind(id, staffProfileId, parentId, branchId, membershipRole, now, actorProfileId, now),
        env.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'team_membership', ?, 'team.member.added', ?, ?)
        `).bind(auditId, branchId, actorProfileId, id, JSON.stringify({ team_id: parentId, staff_profile_id: staffProfileId, membership_role: membershipRole }), now),
      ]);
      if (results.some((result) => !result.success)) throw new Error("TEAM_MEMBER_CREATE_FAILED");
      return json(201, { ok: true, data: { id, team_id: parentId, staff_profile_id: staffProfileId, membership_role: membershipRole, starts_at: now, ends_at: null, created_at: now } }, requestId, origin);
    }

    if (teamMemberRoleUpdate) {
      const current = await env.DB.prepare(`
        SELECT id FROM staff_team_membership
        WHERE id = ? AND team_id = ? AND branch_id = ? AND revoked_at IS NULL
        LIMIT 1
      `).bind(childId, parentId, branchId).first<{ id: string }>();
      if (!current) return json(404, { ok: false, error: { code: "TEAM_MEMBERSHIP_NOT_FOUND" } }, requestId, origin);
      const auditId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE staff_team_membership SET membership_role = ? WHERE id = ? AND team_id = ? AND branch_id = ? AND revoked_at IS NULL")
          .bind(membershipRole, childId, parentId, branchId),
        env.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'team_membership', ?, 'team.member.role_changed', ?, ?)
        `).bind(auditId, branchId, actorProfileId, childId, JSON.stringify({ team_id: parentId, membership_role: membershipRole }), now),
      ]);
      if (results.some((result) => !result.success)) throw new Error("TEAM_MEMBER_UPDATE_FAILED");
      const updated = await env.DB.prepare(`
        SELECT id, team_id, staff_profile_id, membership_role, starts_at, ends_at, created_at
        FROM staff_team_membership WHERE id = ? LIMIT 1
      `).bind(childId).first<Record<string, unknown>>();
      return json(200, { ok: true, data: updated }, requestId, origin);
    }

    if (teamMemberRevoke) {
      const current = await env.DB.prepare(`
        SELECT id FROM staff_team_membership
        WHERE id = ? AND team_id = ? AND branch_id = ? AND revoked_at IS NULL
        LIMIT 1
      `).bind(childId, parentId, branchId).first<{ id: string }>();
      if (!current) return json(404, { ok: false, error: { code: "TEAM_MEMBERSHIP_NOT_FOUND" } }, requestId, origin);
      const auditId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE staff_team_membership SET revoked_at = ? WHERE id = ? AND team_id = ? AND branch_id = ? AND revoked_at IS NULL")
          .bind(now, childId, parentId, branchId),
        env.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'team_membership', ?, 'team.member.revoked', ?, ?)
        `).bind(auditId, branchId, actorProfileId, childId, JSON.stringify({ team_id: parentId }), now),
      ]);
      if (results.some((result) => !result.success)) throw new Error("TEAM_MEMBER_REVOKE_FAILED");
      const updated = await env.DB.prepare(`
        SELECT id, team_id, staff_profile_id, membership_role, starts_at, ends_at, created_at
        FROM staff_team_membership WHERE id = ? LIMIT 1
      `).bind(childId).first<Record<string, unknown>>();
      return json(200, { ok: true, data: updated }, requestId, origin);
    }

    if (areaCoverageCreate) {
      const duplicate = await env.DB.prepare(`
        SELECT id FROM staff_area_coverage
        WHERE service_area_id = ? AND branch_id = ? AND staff_profile_id = ?
          AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > ?)
        LIMIT 1
      `).bind(parentId, branchId, staffProfileId, now).first<{ id: string }>();
      if (duplicate) return json(409, { ok: false, error: { code: "AREA_COVERAGE_ALREADY_ACTIVE" } }, requestId, origin);
      const id = crypto.randomUUID();
      const auditId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO staff_area_coverage (id, staff_profile_id, service_area_id, branch_id, starts_at, ends_at, created_by, created_at, revoked_at, revoked_by)
          VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL)
        `).bind(id, staffProfileId, parentId, branchId, now, actorProfileId, now),
        env.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'area_coverage', ?, 'area.coverage.added', ?, ?)
        `).bind(auditId, branchId, actorProfileId, id, JSON.stringify({ service_area_id: parentId, staff_profile_id: staffProfileId }), now),
      ]);
      if (results.some((result) => !result.success)) throw new Error("AREA_COVERAGE_CREATE_FAILED");
      return json(201, { ok: true, data: { id, service_area_id: parentId, staff_profile_id: staffProfileId, starts_at: now, ends_at: null, created_at: now } }, requestId, origin);
    }

    const current = await env.DB.prepare(`
      SELECT id FROM staff_area_coverage
      WHERE id = ? AND service_area_id = ? AND branch_id = ? AND revoked_at IS NULL
      LIMIT 1
    `).bind(childId, parentId, branchId).first<{ id: string }>();
    if (!current) return json(404, { ok: false, error: { code: "AREA_COVERAGE_NOT_FOUND" } }, requestId, origin);
    const auditId = crypto.randomUUID();
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE staff_area_coverage SET revoked_at = ?, revoked_by = ? WHERE id = ? AND service_area_id = ? AND branch_id = ? AND revoked_at IS NULL")
        .bind(now, actorProfileId, childId, parentId, branchId),
      env.DB.prepare(`
        INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
        VALUES (?, ?, ?, 'area_coverage', ?, 'area.coverage.revoked', ?, ?)
      `).bind(auditId, branchId, actorProfileId, childId, JSON.stringify({ service_area_id: parentId }), now),
    ]);
    if (results.some((result) => !result.success)) throw new Error("AREA_COVERAGE_REVOKE_FAILED");
    const updated = await env.DB.prepare(`
      SELECT id, service_area_id, staff_profile_id, starts_at, ends_at, created_at
      FROM staff_area_coverage WHERE id = ? LIMIT 1
    `).bind(childId).first<Record<string, unknown>>();
    return json(200, { ok: true, data: updated }, requestId, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const conflict = message.includes("UNIQUE") || message.includes("constraint");
    return json(conflict ? 409 : 500, {
      ok: false,
      error: { code: conflict ? "TEAM_OR_AREA_ASSIGNMENT_CONFLICT" : "TEAM_OR_AREA_ASSIGNMENT_FAILED" },
    }, requestId, origin);
  }
}

async function handleTeamOperationsMutation(
  request: Request,
  env: Env,
  requestId: string,
  origin: string | undefined,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean).slice(2);
  const resource = segments[0] ?? "";
  const isTeam = resource === "teams";
  const isArea = resource === "areas";
  const isCreate = segments.length === 1 && request.method === "POST";
  const isUpdate = segments.length === 2 && request.method === "PATCH";
  if ((!isTeam && !isArea) || (!isCreate && !isUpdate)) {
    return json(404, { ok: false, error: { code: "ROUTE_NOT_FOUND" } }, requestId, origin);
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return json(bodyResult.status, { ok: false, error: { code: bodyResult.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  if (!isPlainObject(bodyResult.value)) {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "A JSON object is required." } }, requestId, origin);
  }
  const body = bodyResult.value;
  const allowedKeys = isTeam
    ? (isCreate ? ["branch_id", "name", "description"] : ["name", "description", "is_active"])
    : (isCreate ? ["branch_id", "name", "code"] : ["name", "code", "is_active"]);
  if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "The request contains missing or unsupported fields." } }, requestId, origin);
  }

  const queryBranchIds = url.searchParams.getAll("branch_id");
  const branchId = isCreate ? body.branch_id : queryBranchIds[0];
  if (
    !isUuidValue(branchId) ||
    (isCreate && (url.search || Object.hasOwn(body, "branch_id") === false)) ||
    (isUpdate && queryBranchIds.length !== 1)
  ) {
    return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
  }

  const capability = isTeam ? "team.manage" : "area.manage";
  const access = await authorizeRequestCapability(request, env, capability);
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (access.activeBranch.branchId !== branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_SCOPE_MISMATCH" } }, requestId, origin);
  }

  const name = Object.hasOwn(body, "name") ? parseTeamAreaName(body.name) : undefined;
  if (Object.hasOwn(body, "name") && name === null) {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Name must contain 2 to 160 characters." } }, requestId, origin);
  }
  const now = new Date().toISOString();
  const actorProfileId = access.staff.profileId;
  const recordId = isCreate ? crypto.randomUUID() : segments[1];
  if (!isUuidValue(recordId)) {
    return json(400, { ok: false, error: { code: "INVALID_RESOURCE_ID" } }, requestId, origin);
  }

  try {
    if (isCreate) {
      if (isTeam) {
        const description = parseTeamDescription(body.description);
        if (description === undefined || name === undefined) {
          return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid team name or description." } }, requestId, origin);
        }
        const auditId = crypto.randomUUID();
        const results = await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO team (id, branch_id, name, description, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
          `).bind(recordId, branchId, name, description, now, now),
          env.DB.prepare(`
            INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
            VALUES (?, ?, ?, 'team', ?, 'team.created', ?, ?)
          `).bind(auditId, branchId, actorProfileId, recordId, JSON.stringify({ name }), now),
        ]);
        if (results.some((result) => !result.success)) throw new Error("TEAM_CREATE_FAILED");
        return json(201, { ok: true, data: { id: recordId, branch_id: branchId, name, description, is_active: true, created_at: now, updated_at: now } }, requestId, origin);
      }

      const code = parseAreaCode(body.code);
      if (code === undefined || name === undefined) {
        return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid service-area name or code." } }, requestId, origin);
      }
      const auditId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO service_area (id, branch_id, name, code, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `).bind(recordId, branchId, name, code, now, now),
        env.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'service_area', ?, 'service_area.created', ?, ?)
        `).bind(auditId, branchId, actorProfileId, recordId, JSON.stringify({ name, code }), now),
      ]);
      if (results.some((result) => !result.success)) throw new Error("AREA_CREATE_FAILED");
      return json(201, { ok: true, data: { id: recordId, branch_id: branchId, name, code, is_active: true, created_at: now, updated_at: now } }, requestId, origin);
    }

    const table = isTeam ? "team" : "service_area";
    const current = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND branch_id = ? LIMIT 1`)
      .bind(recordId, branchId).first<{ id: string }>();
    if (!current) return json(404, { ok: false, error: { code: isTeam ? "TEAM_NOT_FOUND" : "SERVICE_AREA_NOT_FOUND" } }, requestId, origin);

    const updates: Array<{ column: string; value: unknown }> = [];
    if (Object.hasOwn(body, "name")) {
      if (name === undefined || name === null) return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid name." } }, requestId, origin);
      updates.push({ column: "name", value: name });
    }
    if (isTeam && Object.hasOwn(body, "description")) {
      const description = parseTeamDescription(body.description);
      if (description === undefined) return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid description." } }, requestId, origin);
      updates.push({ column: "description", value: description });
    }
    if (isArea && Object.hasOwn(body, "code")) {
      const code = parseAreaCode(body.code);
      if (code === undefined) return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid service-area code." } }, requestId, origin);
      updates.push({ column: "code", value: code });
    }
    if (Object.hasOwn(body, "is_active")) {
      if (typeof body.is_active !== "boolean") return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "is_active must be a boolean." } }, requestId, origin);
      updates.push({ column: "is_active", value: body.is_active ? 1 : 0 });
    }
    if (updates.length === 0) return json(422, { ok: false, error: { code: "VALIDATION_ERROR" } }, requestId, origin);

    const setClause = updates.map((item) => `${item.column} = ?`).join(", ");
    const values = updates.map((item) => item.value);
    const auditId = crypto.randomUUID();
    const targetType = isTeam ? "team" : "service_area";
    const action = isTeam ? "team.updated" : "service_area.updated";
    const auditMetadata = JSON.stringify({ changed_fields: updates.map((item) => item.column) });
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE ${table} SET ${setClause}, updated_at = ? WHERE id = ? AND branch_id = ?`)
        .bind(...values, now, recordId, branchId),
      env.DB.prepare(`
        INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(auditId, branchId, actorProfileId, targetType, recordId, action, auditMetadata, now),
    ]);
    if (results.some((result) => !result.success)) throw new Error(isTeam ? "TEAM_UPDATE_FAILED" : "AREA_UPDATE_FAILED");

    const updated = await env.DB.prepare(`SELECT id, branch_id, name, ${isTeam ? "description" : "code"}, is_active, created_at, updated_at FROM ${table} WHERE id = ? AND branch_id = ? LIMIT 1`)
      .bind(recordId, branchId).first<Record<string, unknown>>();
    if (!updated) return json(404, { ok: false, error: { code: isTeam ? "TEAM_NOT_FOUND" : "SERVICE_AREA_NOT_FOUND" } }, requestId, origin);
    return json(200, { ok: true, data: { ...updated, is_active: Boolean(updated.is_active) } }, requestId, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const conflict = message.includes("UNIQUE") || message.includes("constraint");
    return json(conflict ? 409 : 500, {
      ok: false,
      error: { code: conflict ? (isTeam ? "TEAM_CONFLICT" : "SERVICE_AREA_CODE_EXISTS") : "TEAM_AREA_OPERATION_FAILED" },
    }, requestId, origin);
  }
}


type ReportType = "daily_evangelism" | "event_evangelism" | "weekly_ministry";
type ReportDecision = "approved" | "returned" | "comment";
const REPORT_FIELDS = [
  "contacts_captured", "gospel_presentations", "decisions_for_christ",
  "followup_required", "followup_completed", "visits_completed",
  "calls_completed", "events_supported", "attendance_count",
] as const;
const REPORT_COLUMNS = "id,branch_id,report_type,period_start,period_end,author_profile_id,team_id,event_id,contacts_captured,gospel_presentations,decisions_for_christ,followup_required,followup_completed,visits_completed,calls_completed,events_supported,attendance_count,status,submitted_at,created_at,updated_at";

function reportInput(value: unknown, correction = false): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const allowed = new Set([
    ...(correction ? [] : ["branch_id", "report_type", "period_start", "period_end", "team_id", "event_id"]),
    ...REPORT_FIELDS,
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  const output: Record<string, unknown> = {};
  for (const key of REPORT_FIELDS) {
    const raw = value[key];
    if (raw === undefined && correction) continue;
    const number = raw === undefined ? 0 : raw;
    if (!Number.isSafeInteger(number) || (number as number) < 0 || (number as number) > 100000) return null;
    output[key] = number;
  }
  if ((output.decisions_for_christ as number) > (output.gospel_presentations as number) ||
      (output.followup_completed as number) > (output.followup_required as number)) return null;
  if (!correction) {
    if (!isUuidValue(value.branch_id) ||
        !["daily_evangelism", "event_evangelism", "weekly_ministry"].includes(String(value.report_type)) ||
        typeof value.period_start !== "string" || typeof value.period_end !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.period_start) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.period_end) ||
        value.period_end < value.period_start) return null;
    const start = Date.parse(value.period_start + "T00:00:00Z");
    const end = Date.parse(value.period_end + "T00:00:00Z");
    if (!Number.isFinite(start) || !Number.isFinite(end) ||
        new Date(start).toISOString().slice(0,10) !== value.period_start ||
        new Date(end).toISOString().slice(0,10) !== value.period_end) return null;
    if (value.report_type === "weekly_ministry" && end - start !== 6 * 86400000) return null;
    if (value.report_type !== "weekly_ministry" && value.period_start !== value.period_end) return null;
    if (value.report_type === "event_evangelism" ? !isUuidValue(value.event_id) : value.event_id != null) return null;
    if (value.team_id != null && !isUuidValue(value.team_id)) return null;
    output.branch_id = value.branch_id;
    output.report_type = value.report_type;
    output.period_start = value.period_start;
    output.period_end = value.period_end;
    output.team_id = value.team_id ?? null;
    output.event_id = value.event_id ?? null;
  }
  return output;
}

async function reportTeamIds(env: Env, profileId: string, branchId: string, now: string): Promise<string[]> {
  const rows = await env.DB.prepare(`
    SELECT stm.team_id
    FROM staff_team_membership stm
    JOIN team t ON t.id=stm.team_id AND t.branch_id=stm.branch_id AND t.is_active=1
    WHERE stm.staff_profile_id=? AND stm.branch_id=? AND stm.revoked_at IS NULL
      AND stm.starts_at<=? AND (stm.ends_at IS NULL OR stm.ends_at>?)
  `).bind(profileId, branchId, now, now).all<{team_id:string}>();
  return [...new Set((rows.results ?? []).map(row=>row.team_id))];
}

function reportForbidden(access: Awaited<ReturnType<typeof authorizeRequestCapability>>, requestId: string, origin?: string): Response {
  return mapCapabilityFailure(access.state, requestId, origin);
}

async function handleReportOperations(request: Request, env: Env, requestId: string, origin?: string): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const reportsCollection = url.pathname === "/api/v1/reports";
  const optionCollection = url.pathname === "/api/v1/reports/teams" || url.pathname === "/api/v1/reports/events";
  const reportId = parts[3] ?? "";
  const review = parts.length === 5 && parts[2] === "reports" && parts[4] === "review";
  const resubmit = parts.length === 5 && parts[2] === "reports" && parts[4] === "resubmit";
  const item = parts.length === 4 && parts[2] === "reports" && isUuidValue(reportId);
  const branchId = request.headers.get("x-branch-id") ?? url.searchParams.get("branch_id") ?? "";

  if (optionCollection || reportsCollection || item) {
    if (!isUuidValue(branchId)) return json(400, {ok:false,error:{code:"INVALID_QUERY"}}, requestId, origin);
  }

  if (optionCollection && request.method === "GET") {
    const context = await resolveStaffContext(request, env);
    if (context.state !== "authenticated") return mapCapabilityFailure(context.state, requestId, origin);
    if (!context.activeBranch || context.activeBranch.branchId !== branchId) return json(403,{ok:false,error:{code:"BRANCH_NOT_AUTHORIZED"}},requestId,origin);
    const caps = context.activeBranch.capabilities;
    const canSubmit = caps.some(c=>c.code==="report.submit.own" && c.scopeMode==="self");
    const canReviewBranch = caps.some(c=>c.code==="report.review.branch" && c.scopeMode==="branch");
    const canReviewTeam = caps.some(c=>c.code==="report.review.team" && c.scopeMode==="team");
    if (!canSubmit && !canReviewBranch && !canReviewTeam) return json(403,{ok:false,error:{code:"CAPABILITY_DENIED"}},requestId,origin);
    if (url.pathname.endsWith("/teams")) {
      const teams = await reportTeamIds(env,context.staff.profileId,branchId,new Date().toISOString());
      if (!teams.length) return json(200,{data:[]},requestId,origin);
      const marks=teams.map(()=>"?").join(",");
      const rows=await env.DB.prepare(`SELECT id,name FROM team WHERE branch_id=? AND is_active=1 AND id IN (${marks}) ORDER BY name COLLATE NOCASE`).bind(branchId,...teams).all();
      return json(200,{data:rows.results??[]},requestId,origin);
    }
    if (!canSubmit) return json(403,{ok:false,error:{code:"CAPABILITY_DENIED"}},requestId,origin);
    const now=new Date().toISOString();
    const staffEvents=await env.DB.prepare(`SELECT e.id,e.title,e.starts_at FROM event e JOIN event_staff_assignment a ON a.event_id=e.id AND a.branch_id=e.branch_id WHERE e.branch_id=? AND a.staff_auth_user_id=? AND a.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?) AND a.assignment_role IN ('owner','organizer','check_in','usher') ORDER BY e.starts_at DESC LIMIT 100`).bind(branchId,context.staff.userId,now,now).all();
    const teamIds=canReviewTeam?await reportTeamIds(env,context.staff.profileId,branchId,now):[];
    let teamEvents:{results?:Record<string,unknown>[]}={results:[]};
    if(teamIds.length){
      const marks=teamIds.map(()=>"?").join(",");
      teamEvents=await env.DB.prepare(`SELECT DISTINCT e.id,e.title,e.starts_at FROM event e JOIN event_team_assignment a ON a.event_id=e.id AND a.branch_id=e.branch_id WHERE e.branch_id=? AND a.team_id IN (${marks}) AND a.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?) AND a.assignment_role IN ('owner','organizer','check_in','usher') ORDER BY e.starts_at DESC LIMIT 100`).bind(branchId,...teamIds,now,now).all();
    }
    const map=new Map<string,Record<string,unknown>>();
    for(const row of [...(staffEvents.results??[]),...(teamEvents.results??[])]) map.set(String(row.id),row);
    return json(200,{data:[...map.values()]},requestId,origin);
  }

  if (reportsCollection && request.method === "GET") {
    const allowed=new Set(["branch_id","report_type","status","limit","offset"]);
    if ([...url.searchParams.keys()].some(k=>!allowed.has(k))) return json(400,{ok:false,error:{code:"INVALID_QUERY"}},requestId,origin);
    const reportType=url.searchParams.get("report_type");
    const status=url.searchParams.get("status");
    const limitRaw=Number(url.searchParams.get("limit")??25), offsetRaw=Number(url.searchParams.get("offset")??0);
    if ((reportType && !["daily_evangelism","event_evangelism","weekly_ministry"].includes(reportType)) ||
        (status && !["submitted","returned","approved"].includes(status)) ||
        !Number.isInteger(limitRaw)||limitRaw<1||limitRaw>100||!Number.isInteger(offsetRaw)||offsetRaw<0||offsetRaw>100000) return json(400,{ok:false,error:{code:"INVALID_QUERY"}},requestId,origin);
    const context=await resolveStaffContext(request,env);
    if(context.state!=="authenticated") return mapCapabilityFailure(context.state,requestId,origin);
    if(!context.activeBranch || context.activeBranch.branchId!==branchId) return json(403,{ok:false,error:{code:"BRANCH_NOT_AUTHORIZED"}},requestId,origin);
    const caps=context.activeBranch.capabilities;
    const own=caps.some(c=>c.code==="report.read.own"&&c.scopeMode==="self");
    const branch=caps.some(c=>c.code==="report.review.branch"&&c.scopeMode==="branch");
    const team=caps.some(c=>c.code==="report.review.team"&&c.scopeMode==="team");
    if(!own&&!branch&&!team) return json(403,{ok:false,error:{code:"CAPABILITY_DENIED"}},requestId,origin);
    const teamIds=team?await reportTeamIds(env,context.staff.profileId,branchId,new Date().toISOString()):[];
    const where=["branch_id=?"]; const values:unknown[]=[branchId];
    if(reportType){where.push("report_type=?");values.push(reportType);}
    if(status){where.push("status=?");values.push(status);}
    if(!branch){
      const visibility:string[]=[];
      if(own){visibility.push("author_profile_id=?");values.push(context.staff.profileId);}
      if(team&&teamIds.length){visibility.push("team_id IN ("+teamIds.map(()=>"?").join(",")+")");values.push(...teamIds);}
      if(!visibility.length) return json(200,{data:[],total:0},requestId,origin);
      where.push("("+visibility.join(" OR ")+")");
    }
    const whereSql=where.join(" AND ");
    const rows=await env.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE ${whereSql} ORDER BY period_start DESC,created_at DESC LIMIT ? OFFSET ?`).bind(...values,limitRaw,offsetRaw).all();
    const total=await env.DB.prepare(`SELECT COUNT(*) AS total FROM ministry_report WHERE ${whereSql}`).bind(...values).first<{total:number}>();
    return json(200,{data:rows.results??[],total:total?.total??0},requestId,origin);
  }

  if ((item || review || resubmit) && request.method === "GET") {
    const context=await resolveStaffContext(request,env);
    if(context.state!=="authenticated") return mapCapabilityFailure(context.state,requestId,origin);
    if(!context.activeBranch || context.activeBranch.branchId!==branchId) return json(403,{ok:false,error:{code:"BRANCH_NOT_AUTHORIZED"}},requestId,origin);
    const row=await env.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE id=? AND branch_id=?`).bind(reportId,branchId).first<Record<string,unknown>>();
    if(!row) return json(404,{ok:false,error:{code:"NOT_FOUND"}},requestId,origin);
    const caps=context.activeBranch.capabilities;
    const own=caps.some(c=>c.code==="report.read.own"&&c.scopeMode==="self") && row.author_profile_id===context.staff.profileId;
    const branch=caps.some(c=>c.code==="report.review.branch"&&c.scopeMode==="branch");
    const team=caps.some(c=>c.code==="report.review.team"&&c.scopeMode==="team");
    const teamIds=team?await reportTeamIds(env,context.staff.profileId,branchId,new Date().toISOString()):[];
    if(!own&&!branch&&!(team&&row.team_id&&teamIds.includes(String(row.team_id)))) return json(404,{ok:false,error:{code:"NOT_FOUND"}},requestId,origin);
    const history=await env.DB.prepare("SELECT id,actor_profile_id,decision,comment,created_at FROM report_review_event WHERE report_id=? ORDER BY created_at ASC").bind(reportId).all();
    return json(200,{data:{...row,review_history:history.results??[]}},requestId,origin);
  }

  if (reportsCollection && request.method === "POST") {
    const parsed=await readJsonBody(request,8192);
    if(!parsed.ok||!isPlainObject(parsed.value)) return json(parsed.ok?400:parsed.status,{ok:false,error:{code:"INVALID_REPORT"}},requestId,origin);
    const input=reportInput(parsed.value);
    if(!input) return json(400,{ok:false,error:{code:"INVALID_REPORT"}},requestId,origin);
    const access=await authorizeRequestCapability(request,env,"report.submit.own");
    if(access.state!=="authorized") return reportForbidden(access,requestId,origin);
    if(access.activeBranch.branchId!==input.branch_id) return json(403,{ok:false,error:{code:"BRANCH_NOT_AUTHORIZED"}},requestId,origin);
    const now=new Date().toISOString();
    if(input.team_id){
      const teams=await reportTeamIds(env,access.staff.profileId,String(input.branch_id),now);
      if(!teams.includes(String(input.team_id))) return json(403,{ok:false,error:{code:"TEAM_SCOPE_REQUIRED"}},requestId,origin);
    }
    if(input.event_id){
      const event=await env.DB.prepare(`SELECT e.id FROM event e WHERE e.id=? AND e.branch_id=? AND (
        EXISTS(SELECT 1 FROM event_staff_assignment a WHERE a.event_id=e.id AND a.staff_auth_user_id=? AND a.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?))
        OR EXISTS(SELECT 1 FROM event_team_assignment a JOIN staff_team_membership stm ON stm.team_id=a.team_id AND stm.branch_id=a.branch_id WHERE a.event_id=e.id AND stm.staff_profile_id=? AND a.revoked_at IS NULL AND stm.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?) AND stm.starts_at<=? AND (stm.ends_at IS NULL OR stm.ends_at>?))
      ) LIMIT 1`).bind(input.event_id,input.branch_id,access.staff.userId,now,now,access.staff.profileId,now,now,now,now).first();
      if(!event) return json(403,{ok:false,error:{code:"EVENT_SCOPE_REQUIRED"}},requestId,origin);
    }
    const id=crypto.randomUUID();
    try{
      await env.DB.prepare(`INSERT INTO ministry_report (
        id,branch_id,report_type,period_start,period_end,author_profile_id,team_id,event_id,
        contacts_captured,gospel_presentations,decisions_for_christ,followup_required,followup_completed,
        visits_completed,calls_completed,events_supported,attendance_count,status,submitted_at,created_at,updated_at,created_by,updated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted',?,?,?,?,?)`).bind(
        id,input.branch_id,input.report_type,input.period_start,input.period_end,access.staff.profileId,
        input.team_id,input.event_id,input.contacts_captured,input.gospel_presentations,input.decisions_for_christ,
        input.followup_required,input.followup_completed,input.visits_completed,input.calls_completed,
        input.events_supported,input.attendance_count,now,now,now,access.staff.userId,access.staff.userId
      ).run();
    }catch(error){
      const message=error instanceof Error?error.message:"";
      if(message.includes("UNIQUE")) return json(409,{ok:false,error:{code:"REPORT_ALREADY_EXISTS"}},requestId,origin);
      if(message.includes("REPORT_")) return json(400,{ok:false,error:{code:message.split(":").pop()??"INVALID_REPORT_SCOPE"}},requestId,origin);
      throw error;
    }
    const created=await env.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE id=?`).bind(id).first();
    return json(201,{data:created},requestId,origin);
  }

  if (review && request.method === "POST") {
    const reportIdForReview=parts[3]??"";
    if(!isUuidValue(reportIdForReview)) return json(400,{ok:false,error:{code:"INVALID_REPORT_ID"}},requestId,origin);
    const parsed=await readJsonBody(request,4096);
    if(!parsed.ok||!isPlainObject(parsed.value)||Object.keys(parsed.value).some(k=>!["decision","comment"].includes(k))) return json(parsed.ok?400:parsed.status,{ok:false,error:{code:"INVALID_REVIEW"}},requestId,origin);
    const decision=parsed.value.decision;
    const comment=typeof parsed.value.comment==="string"?parsed.value.comment.trim():"";
    if(!["approved","returned","comment"].includes(String(decision))||comment.length>2000||(decision==="returned"&&comment.length===0)) return json(400,{ok:false,error:{code:"INVALID_REVIEW"}},requestId,origin);
    const row=await env.DB.prepare("SELECT id,branch_id,author_profile_id,team_id,status FROM ministry_report WHERE id=?").bind(reportIdForReview).first<Record<string,unknown>>();
    if(!row) return json(404,{ok:false,error:{code:"NOT_FOUND"}},requestId,origin);
    const scopedHeaders=new Headers(request.headers); scopedHeaders.set("x-branch-id",String(row.branch_id));
    const scopedRequest=new Request(request.url,{headers:scopedHeaders});
    const context=await resolveStaffContext(scopedRequest,env);
    if(context.state!=="authenticated") return mapCapabilityFailure(context.state,requestId,origin);
    if(!context.activeBranch||context.activeBranch.branchId!==row.branch_id) return json(403,{ok:false,error:{code:"BRANCH_NOT_AUTHORIZED"}},requestId,origin);
    if(row.author_profile_id===context.staff.profileId) return json(403,{ok:false,error:{code:"SELF_REVIEW_FORBIDDEN"}},requestId,origin);
    const caps=context.activeBranch.capabilities;
    const branch=caps.some(c=>c.code==="report.review.branch"&&c.scopeMode==="branch");
    const team=caps.some(c=>c.code==="report.review.team"&&c.scopeMode==="team");
    const teamIds=team?await reportTeamIds(env,context.staff.profileId,String(row.branch_id),new Date().toISOString()):[];
    if(!branch&&!(team&&row.team_id&&teamIds.includes(String(row.team_id)))) return json(403,{ok:false,error:{code:"CAPABILITY_DENIED"}},requestId,origin);
    if(row.status!=="submitted") return json(409,{ok:false,error:{code:"REPORT_NOT_SUBMITTED"}},requestId,origin);
    const now=new Date().toISOString();
    const update=await env.DB.prepare(`UPDATE ministry_report SET status=?,last_action_id=?,last_action_by=?,last_action_decision=?,last_action_comment=?,last_action_at=?,updated_at=?,updated_by=? WHERE id=? AND status='submitted'`).bind(
      decision==="comment"?"submitted":decision,crypto.randomUUID(),context.staff.userId,decision,comment||null,now,now,context.staff.userId,reportIdForReview
    ).run();
    if((update.meta?.changes??0)!==1) return json(409,{ok:false,error:{code:"REPORT_NOT_SUBMITTED"}},requestId,origin);
    const report=await env.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE id=?`).bind(reportIdForReview).first();
    const history=await env.DB.prepare("SELECT id,actor_profile_id,decision,comment,created_at FROM report_review_event WHERE report_id=? ORDER BY created_at ASC").bind(reportIdForReview).all();
    return json(200,{data:{report,review_history:history.results??[]}},requestId,origin);
  }

  if (resubmit && request.method === "POST") {
    const reportIdForSubmit=parts[3]??"";
    if(!isUuidValue(reportIdForSubmit)) return json(400,{ok:false,error:{code:"INVALID_REPORT_ID"}},requestId,origin);
    const parsed=await readJsonBody(request,8192);
    if(!parsed.ok||!isPlainObject(parsed.value)) return json(parsed.ok?400:parsed.status,{ok:false,error:{code:"INVALID_REPORT_CORRECTION"}},requestId,origin);
    const correction=reportInput(parsed.value,true);
    if(!correction) return json(400,{ok:false,error:{code:"INVALID_REPORT_CORRECTION"}},requestId,origin);
    const row=await env.DB.prepare(`SELECT id,branch_id,author_profile_id,status,${REPORT_FIELDS.join(",")} FROM ministry_report WHERE id=?`).bind(reportIdForSubmit).first<Record<string,unknown>>();
    if(!row) return json(404,{ok:false,error:{code:"NOT_FOUND"}},requestId,origin);
    const scopedHeaders=new Headers(request.headers); scopedHeaders.set("x-branch-id",String(row.branch_id));
    const scopedRequest=new Request(request.url,{headers:scopedHeaders});
    const context=await resolveStaffContext(scopedRequest,env);
    if(context.state!=="authenticated") return mapCapabilityFailure(context.state,requestId,origin);
    if(row.author_profile_id!==context.staff.profileId) return json(404,{ok:false,error:{code:"NOT_FOUND"}},requestId,origin);
    if(!context.activeBranch||context.activeBranch.branchId!==row.branch_id) return json(403,{ok:false,error:{code:"BRANCH_NOT_AUTHORIZED"}},requestId,origin);
    if(row.status!=="returned") return json(409,{ok:false,error:{code:"REPORT_NOT_RETURNED"}},requestId,origin);
    const now=new Date().toISOString();
    const sets=[...REPORT_FIELDS.map(k=>`${k}=?`),"status='submitted'","submitted_at=?","last_action_id=?","last_action_by=?","last_action_decision='resubmitted'","last_action_comment=NULL","last_action_at=?","updated_at=?","updated_by=?"];
    const values=[...REPORT_FIELDS.map(k=>correction[k]===undefined?row[k]:correction[k]),now,crypto.randomUUID(),context.staff.userId,now,now,context.staff.userId,reportIdForSubmit];
    const updated=await env.DB.prepare(`UPDATE ministry_report SET ${sets.join(",")} WHERE id=? AND status='returned' AND author_profile_id=?`).bind(...values,context.staff.profileId).run();
    if((updated.meta?.changes??0)!==1) return json(409,{ok:false,error:{code:"REPORT_NOT_RETURNED"}},requestId,origin);
    const report=await env.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE id=?`).bind(reportIdForSubmit).first();
    const history=await env.DB.prepare("SELECT id,actor_profile_id,decision,comment,created_at FROM report_review_event WHERE report_id=? ORDER BY created_at ASC").bind(reportIdForSubmit).all();
    return json(200,{data:{report,review_history:history.results??[]}},requestId,origin);
  }
  return json(404,{ok:false,error:{code:"NOT_FOUND"}},requestId,origin);
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

    // Sign-in, refresh, recovery, and logout stay on the existing Pages-to-Supabase Auth proxy.

function hasScopedGrant(
  context: Extract<Awaited<ReturnType<typeof resolveStaffContext>>, { state: "authenticated" }>,
  code: string,
  scopeMode: string,
): boolean {
  return !!context.activeBranch?.capabilities.some(
    (grant) => grant.code === code && grant.scopeMode === scopeMode,
  );
}


type NotificationActor = { actorUserId: string; profileId: string };

async function resolveNotificationActor(
  request: Request,
  env: Env,
  branchId: string,
  requestId: string,
  origin?: string,
): Promise<NotificationActor | Response> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") {
    return mapCapabilityFailure(context.state, requestId, origin);
  }
  if (!context.staff.branches.some((branch) => branch.id === branchId)) {
    return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const profile = await env.DB.prepare(
    "SELECT must_change_password FROM staff_profile WHERE id = ? LIMIT 1",
  ).bind(context.staff.profileId).first<{ must_change_password: number }>();
  if (!profile) {
    return json(403, { ok: false, error: { code: "STAFF_ACCOUNT_NOT_ACTIVE" } }, requestId, origin);
  }
  if (profile.must_change_password === 1) {
    return json(403, { ok: false, error: { code: "PASSWORD_CHANGE_REQUIRED" } }, requestId, origin);
  }
  return { actorUserId: context.staff.userId, profileId: context.staff.profileId };
}

async function listStaffNotifications(
  request: Request,
  env: Env,
  requestId: string,
  origin?: string,
): Promise<Response> {
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branch_id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) {
    return json(400, { ok: false, error: { code: "INVALID_BRANCH" } }, requestId, origin);
  }
  const actor = await resolveNotificationActor(request, env, branchId, requestId, origin);
  if (actor instanceof Response) return actor;
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? 30 : Number(rawLimit);
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : 30;
  const [items, unread] = await Promise.all([
    env.DB.prepare(`
      SELECT id, category, title, body, target_type, target_id, created_at, read_at
      FROM staff_notification
      WHERE recipient_user_id = ? AND branch_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).bind(actor.actorUserId, branchId, limit).all<{
      id: string; category: string; title: string; body: string;
      target_type: string | null; target_id: string | null;
      created_at: string; read_at: string | null;
    }>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS unread_count
      FROM staff_notification
      WHERE recipient_user_id = ? AND branch_id = ? AND read_at IS NULL
    `).bind(actor.actorUserId, branchId).first<{ unread_count: number }>(),
  ]);
  return json(200, {
    ok: true,
    data: { notifications: items.results ?? [], unread_count: unread?.unread_count ?? 0 },
  }, requestId, origin);
}

async function markStaffNotificationsRead(
  request: Request,
  env: Env,
  branchId: string,
  notificationId: string | null,
  requestId: string,
  origin?: string,
): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) {
    return json(400, { ok: false, error: { code: "INVALID_BRANCH" } }, requestId, origin);
  }
  const actor = await resolveNotificationActor(request, env, branchId, requestId, origin);
  if (actor instanceof Response) return actor;
  const now = new Date().toISOString();
  if (notificationId === null) {
    const result = await env.DB.prepare(`
      UPDATE staff_notification
      SET read_at = ?
      WHERE recipient_user_id = ? AND branch_id = ? AND read_at IS NULL
    `).bind(now, actor.actorUserId, branchId).run();
    return json(200, {
      ok: true,
      data: { updated_count: result.meta?.changes ?? 0 },
    }, requestId, origin);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
    return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
  }
  const result = await env.DB.prepare(`
    UPDATE staff_notification
    SET read_at = ?
    WHERE id = ? AND recipient_user_id = ? AND branch_id = ? AND read_at IS NULL
  `).bind(now, notificationId, actor.actorUserId, branchId).run();
  return json(200, {
    ok: true,
    data: { updated: (result.meta?.changes ?? 0) === 1 },
  }, requestId, origin);
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



    if (url.pathname.startsWith("/api/v1/reports") && ["GET","POST"].includes(request.method)) {
      return handleReportOperations(request, env, requestId, origin);
    }

    if (url.pathname === "/api/v1/notifications" && request.method === "GET") {
      return listStaffNotifications(request, env, requestId, origin);
    }
    if (url.pathname === "/api/v1/notifications/read-all" && request.method === "POST") {
      const body = await readJsonBody(request, 1024);
      if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
        return json(body.ok ? 400 : body.status, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
      }
      const payload = body.value as Record<string, unknown>;
      if (Object.keys(payload).some((key) => key !== "branch_id") || typeof payload.branch_id !== "string") {
        return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
      }
      return markStaffNotificationsRead(request, env, payload.branch_id, null, requestId, origin);
    }
    const notificationReadParts = url.pathname.split("/").filter(Boolean);
    if (notificationReadParts.length === 5 && notificationReadParts[0] === "api" && notificationReadParts[1] === "v1" && notificationReadParts[2] === "notifications" && notificationReadParts[4] === "read" && request.method === "POST") {
      const body = await readJsonBody(request, 1024);
      if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
        return json(body.ok ? 400 : body.status, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
      }
      const payload = body.value as Record<string, unknown>;
      if (Object.keys(payload).some((key) => key !== "branch_id") || typeof payload.branch_id !== "string") {
        return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
      }
      let notificationId: string;
      try { notificationId = decodeURIComponent(notificationReadParts[3]); }
      catch { return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin); }
      return markStaffNotificationsRead(request, env, payload.branch_id, notificationId, requestId, origin);
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
    if (interactionMatch && (request.method === "GET" || request.method === "POST")) {
      let contactId: string;
      try { contactId = decodeURIComponent(interactionMatch[1]); }
      catch { return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin); }
      if (request.method === "GET") return listContactInteractions(request, env, contactId, requestId, origin);
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

    if (url.pathname === "/api/v1/teams" && request.method === "GET") {
      return listTeamOperationsCollection(request, env, requestId, origin, "teams");
    }
    if (url.pathname === "/api/v1/areas" && request.method === "GET") {
      return listTeamOperationsCollection(request, env, requestId, origin, "areas");
    }

    if (
      /^\/api\/v1\/(teams|areas)(\/[^/]+)?$/.test(url.pathname) &&
      (request.method === "POST" || request.method === "PATCH")
    ) {
      return handleTeamOperationsMutation(request, env, requestId, origin);
    }
    if (
      (url.pathname.startsWith("/api/v1/teams/") || url.pathname.startsWith("/api/v1/areas/")) &&
      (request.method === "POST" || request.method === "PATCH")
    ) {
      return handleTeamMembershipOrCoverageMutation(request, env, requestId, origin);
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

        const expectedEnvironment = env.APP_ENV;
        if (
          !result ||
          (expectedEnvironment !== "non-production" && expectedEnvironment !== "production") ||
          result.environment !== expectedEnvironment
        ) {
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
        if (context.state === "auth_unavailable") {
          return json(503, { ok: false, error: { code: "AUTH_SERVICE_UNAVAILABLE" } }, requestId, origin);
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
        if (context.state !== "authenticated") {
          return json(403, { ok: false, error: { code: "STAFF_CONTEXT_UNAVAILABLE" } }, requestId, origin);
        }
        if (context.staff.branches.length === 0 && !context.staff.mustChangePassword) {
          return json(403, { ok: false, error: { code: "NO_ACTIVE_BRANCH_ASSIGNMENT" } }, requestId, origin);
        }
        return json(200, {
          ok: true,
          data: {
            user: { id: context.staff.userId, email: context.staff.email || null },
            staff: {
              id: context.staff.profileId,
              auth_user_id: context.staff.userId,
              full_name: context.staff.fullName,
              email: context.staff.email || null,
              account_status: "active",
            },
            branches: context.staff.branches,
            roles: context.staff.roles,
            capabilities: context.staff.capabilities,
            must_change_password: context.staff.mustChangePassword,
            password_setup_expires_at: context.staff.passwordSetupExpiresAt,
          },
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
