import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { readJson } from "../_shared/request_body.ts";
import {
  isUuid,
  parseAreaCoverageCreate,
  parseServiceAreaCreate,
  parseServiceAreaPatch,
  parseTeamCreate,
  parseTeamMemberCreate,
  parseTeamMemberRole,
  parseTeamPatch,
} from "./validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const allowedOrigins = new Set(
  (Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "https://pcg-missions.vercel.app")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function requestId(): string {
  return crypto.randomUUID();
}

function response(
  body: unknown,
  status: number,
  origin: string | null,
  id: string,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Request-Id": id,
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, apikey, Content-Type, x-client-info",
    );
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(
  code: string,
  message: string,
  status: number,
  origin: string | null,
  id: string,
): Response {
  return response({ error: { code, message }, request_id: id }, status, origin, id);
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  const match = value
    ? /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim())
    : null;
  return match?.[1] ?? null;
}

function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Application-Name": "pcg-missions-team-operations" },
    },
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

type StaffResult =
  | {
    ok: true;
    actorId: string;
    profileId: string;
    service: ServiceClient;
  }
  | { ok: false; status: number; code: string; message: string };

async function resolveStaff(token: string): Promise<StaffResult> {
  const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const service = createServiceClient();
  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth.user) {
    return {
      ok: false,
      status: 401,
      code: "INVALID_SESSION",
      message: "A valid staff session is required.",
    };
  }

  const { data: profile, error } = await service
    .from("staff_profile")
    .select("id,account_status,must_change_password")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (error) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
  if (!profile) {
    return {
      ok: false,
      status: 403,
      code: "STAFF_PROFILE_NOT_FOUND",
      message: "This account is not provisioned as staff.",
    };
  }
  if (profile.must_change_password) {
    return {
      ok: false,
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Change the temporary password before using staff operations.",
    };
  }
  if (profile.account_status !== "active") {
    return {
      ok: false,
      status: 403,
      code: "STAFF_ACCOUNT_NOT_ACTIVE",
      message: "This staff account is not active.",
    };
  }

  return {
    ok: true,
    actorId: auth.user.id,
    profileId: profile.id,
    service,
  };
}

async function hasBranchCapability(
  service: ServiceClient,
  profileId: string,
  branchId: string,
  capabilityCode: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: branch, error: branchError } = await service
    .from("branch")
    .select("id,is_active")
    .eq("id", branchId)
    .maybeSingle();
  if (branchError) throw new Error("BRANCH_LOOKUP_FAILED");
  if (!branch?.is_active) return false;

  const { data: assignments, error: assignmentError } = await service
    .from("staff_role_assignment")
    .select("role_id,role:role!inner(is_active)")
    .eq("role.is_active", true)
    .eq("staff_profile_id", profileId)
    .eq("branch_id", branchId)
    .lte("starts_at", now)
    .or("ends_at.is.null,ends_at.gt." + now)
    .is("revoked_at", null);
  if (assignmentError) throw new Error("ROLE_ASSIGNMENT_LOOKUP_FAILED");

  const roleIds = [
    ...new Set((assignments ?? []).map((item: { role_id: string }) => item.role_id)),
  ];
  if (!roleIds.length) return false;

  const { data: grants, error: grantError } = await service
    .from("role_capability")
    .select("scope_mode,capability:capability!inner(code,is_active)")
    .in("role_id", roleIds)
    .eq("scope_mode", "branch")
    .eq("capability.code", capabilityCode);
  if (grantError) throw new Error("CAPABILITY_LOOKUP_FAILED");

  return (grants ?? []).some((grant: {
    capability?:
      | { code: string; is_active: boolean }
      | Array<{ code: string; is_active: boolean }>
      | null;
  }) => {
    const capability = Array.isArray(grant.capability)
      ? grant.capability[0]
      : grant.capability;
    return capability?.is_active === true;
  });
}

function branchParameter(url: URL): string | null {
  const values = url.searchParams.getAll("branch_id");
  if (
    values.length !== 1 ||
    [...url.searchParams.keys()].some((key) => key !== "branch_id") ||
    !isUuid(values[0])
  ) return null;
  return values[0];
}

async function readBody(
  request: Request,
  origin: string | null,
  id: string,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await readJson(request, 16 * 1024) };
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_JSON";
    const status = code === "BODY_TOO_LARGE" ? 413 : 400;
    return {
      ok: false,
      response: fail(
        code,
        code === "CONTENT_TYPE_REQUIRED"
          ? "Content-Type must be application/json."
          : code === "BODY_TOO_LARGE"
          ? "Request body is too large."
          : "A valid JSON request body is required.",
        status,
        origin,
        id,
      ),
    };
  }
}

function rpcError(error: { code?: string; message?: string }): {
  code: string;
  message: string;
  status: number;
} {
  const message = error.message ?? "";
  const code = error.code ?? "";
  if (code === "42501" || /AUTH_REQUIRED|ACTIVE_STAFF_REQUIRED|BRANCH_CAPABILITY_REQUIRED|STAFF_NOT_ACTIVE_IN_BRANCH|TEAM_LEADER_ROLE_REQUIRED/.test(message)) {
    if (message.includes("TEAM_LEADER_ROLE_REQUIRED")) {
      return { code: "TEAM_LEADER_ROLE_REQUIRED", message: "Assign the Team Leader role to this staff account in this branch before making them a team leader.", status: 403 };
    }
    if (message.includes("STAFF_NOT_ACTIVE_IN_BRANCH")) {
      return { code: "STAFF_NOT_ACTIVE_IN_BRANCH", message: "Only active staff assigned to this branch can be added.", status: 422 };
    }
    return { code: code || "FORBIDDEN", message: "Your account is not authorised to manage this branch.", status: 403 };
  }
  if (code === "P0002" || /TEAM_NOT_FOUND|SERVICE_AREA_NOT_FOUND|ACTIVE_TEAM_NOT_FOUND|ACTIVE_MEMBERSHIP_NOT_FOUND|ACTIVE_SERVICE_AREA_NOT_FOUND|ACTIVE_AREA_COVERAGE_NOT_FOUND/.test(message)) {
    return { code: "RECORD_NOT_FOUND", message: "The selected team, member or service area could not be found in this branch.", status: 404 };
  }
  if (code === "23505") {
    return { code: "DUPLICATE_RECORD", message: "A team, service-area code or membership with these details already exists.", status: 409 };
  }
  if (code === "23P01") {
    return {
      code: "ACTIVE_ASSIGNMENT_EXISTS",
      message: "This staff member already has an overlapping active membership or service-area coverage assignment.",
      status: 409,
    };
  }
  if (code === "23514" || /TEAM_HAS_ACTIVE_MEMBERS|AREA_HAS_ACTIVE_COVERAGE/.test(message)) {
    return {
      code: "ACTIVE_ASSIGNMENTS_EXIST",
      message: message.includes("AREA_HAS_ACTIVE_COVERAGE")
        ? "End all active staff coverage before deactivating this service area."
        : "Remove all active team members before deactivating this team.",
      status: 409,
    };
  }
  if (code === "22023") {
    return { code: "VALIDATION_ERROR", message: "The submitted team or service-area details are invalid.", status: 422 };
  }
  return { code: "TEAM_OPERATION_FAILED", message: "The team operation could not be completed.", status: 500 };
}

async function listTeams(
  service: ServiceClient,
  branchId: string,
  includeStaffNames: boolean,
): Promise<{ teams: Array<Record<string, unknown>> }> {
  const { data: teams, error: teamError } = await service
    .from("team")
    .select("id,branch_id,name,description,is_active,created_at,updated_at")
    .eq("branch_id", branchId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (teamError) throw new Error("TEAM_LIST_FAILED");

  const now = new Date().toISOString();
  const { data: memberships, error: memberError } = await service
    .from("staff_team_membership")
    .select("id,team_id,staff_profile_id,membership_role,starts_at,ends_at,created_at")
    .eq("branch_id", branchId)
    .lte("starts_at", now)
    .is("revoked_at", null)
    .or("ends_at.is.null,ends_at.gt." + now)
    .order("created_at", { ascending: true });
  if (memberError) throw new Error("TEAM_MEMBERSHIP_LIST_FAILED");

  const profileIds = [...new Set((memberships ?? []).map((item) => item.staff_profile_id))];
  let profiles: Array<{ id: string; full_name: string; account_status: string }> = [];
  if (includeStaffNames && profileIds.length) {
    const result = await service
      .from("staff_profile")
      .select("id,full_name,account_status")
      .in("id", profileIds);
    if (result.error) throw new Error("TEAM_MEMBER_PROFILE_LOOKUP_FAILED");
    profiles = result.data ?? [];
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const teamRows = (teams ?? []).map((team) => ({
    ...team,
    members: (memberships ?? [])
      .filter((membership) => membership.team_id === team.id)
      .map((membership) => ({
        ...membership,
        staff: profileById.get(membership.staff_profile_id) ?? null,
      }))
      .filter((membership) => membership.staff !== null),
  }));
  return { teams: teamRows };
}

async function listAreas(
  service: ServiceClient,
  branchId: string,
  includeStaffNames: boolean,
): Promise<{ areas: Array<Record<string, unknown>> }> {
  const { data: areas, error: areaError } = await service
    .from("service_area")
    .select("id,branch_id,name,code,is_active,created_at,updated_at")
    .eq("branch_id", branchId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (areaError) throw new Error("SERVICE_AREA_LIST_FAILED");

  const now = new Date().toISOString();
  const { data: coverage, error: coverageError } = await service
    .from("staff_area_coverage")
    .select("id,service_area_id,staff_profile_id,starts_at,ends_at,created_at")
    .eq("branch_id", branchId)
    .lte("starts_at", now)
    .or("ends_at.is.null,ends_at.gt." + now)
    .order("starts_at", { ascending: false });
  if (coverageError) throw new Error("AREA_COVERAGE_LIST_FAILED");

  const profileIds = [...new Set((coverage ?? []).map((item) => item.staff_profile_id))];
  let profiles: Array<{ id: string; full_name: string; account_status: string }> = [];
  if (includeStaffNames && profileIds.length) {
    const result = await service
      .from("staff_profile")
      .select("id,full_name,account_status")
      .in("id", profileIds);
    if (result.error) throw new Error("AREA_COVERAGE_PROFILE_LOOKUP_FAILED");
    profiles = result.data ?? [];
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const areaRows = (areas ?? []).map((area) => ({
    ...area,
    coverage: (coverage ?? [])
      .filter((item) => item.service_area_id === area.id)
      .map((item) => ({
        ...item,
        staff: profileById.get(item.staff_profile_id) ?? null,
      }))
      .filter((item) => item.staff !== null),
  }));
  return { areas: areaRows };
}

async function performRpc(
  auth: Extract<StaffResult, { ok: true }>,
  action: string,
  payload: Record<string, unknown>,
): Promise<{ data: unknown; error: null } | { data: null; error: { code?: string; message?: string } }> {
  const result = await auth.service.rpc("cmi_manage_team_operations", {
    p_actor_auth_user_id: auth.actorId,
    p_action: action,
    p_payload: payload,
  });
  if (result.error) return { data: null, error: result.error };
  return { data: result.data, error: null };
}

Deno.serve(async (request: Request) => {
  const id = requestId();
  const origin = request.headers.get("Origin");

  if (origin && !allowedOrigins.has(origin)) {
    return fail("ORIGIN_NOT_ALLOWED", "Origin not allowed.", 403, null, id);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, apikey, Content-Type, x-client-info",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  if (!["GET", "POST", "PATCH"].includes(request.method)) {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed.", 405, origin, id);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail("SERVICE_NOT_CONFIGURED", "Team operations service is not configured.", 503, origin, id);
  }

  const token = bearerToken(request);
  if (!token) {
    return fail("AUTH_REQUIRED", "A valid staff session is required.", 401, origin, id);
  }

  try {
    const auth = await resolveStaff(token);
    if (!auth.ok) return fail(auth.code, auth.message, auth.status, origin, id);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const functionIndex = path.lastIndexOf("team-operations");
    if (functionIndex < 0) return fail("NOT_FOUND", "The requested operation does not exist.", 404, origin, id);
    const segments = path.slice(functionIndex + 1);
    const resource = segments[0] ?? "";
    const branchFromQuery = branchParameter(url);

    if (request.method === "GET") {
      if (segments.length !== 1 || (resource !== "teams" && resource !== "areas") || !branchFromQuery) {
        return fail("INVALID_QUERY", "A single valid branch_id and collection path are required.", 400, origin, id);
      }
      const capability = resource === "teams" ? "team.manage" : "area.manage";
      if (!(await hasBranchCapability(auth.service, auth.profileId, branchFromQuery, capability))) {
        return fail("FORBIDDEN", "Your account does not have management access to this branch.", 403, origin, id);
      }
      const canReadStaffDirectory = await hasBranchCapability(
        auth.service,
        auth.profileId,
        branchFromQuery,
        "staff.directory.read",
      );
      const data = resource === "teams"
        ? await listTeams(auth.service, branchFromQuery, canReadStaffDirectory)
        : await listAreas(auth.service, branchFromQuery, canReadStaffDirectory);
      return response({ data, request_id: id }, 200, origin, id);
    }

    if (request.method === "POST" && resource === "teams" && segments.length === 1) {
      if (url.search) return fail("INVALID_QUERY", "Do not include query parameters when creating a team.", 400, origin, id);
      const body = await readBody(request, origin, id);
      if (!body.ok) return body.response;
      const parsed = parseTeamCreate(body.value);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, parsed.value.branch_id, "team.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have team management access to this branch.", 403, origin, id);
      const result = await performRpc(auth, "team.create", { ...parsed.value });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 201, origin, id);
    }

    if (resource === "teams" && segments.length === 2 && isUuid(segments[1]) && request.method === "PATCH") {
      if (!branchFromQuery) return fail("INVALID_QUERY", "A single valid branch_id is required.", 400, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, branchFromQuery, "team.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have team management access to this branch.", 403, origin, id);
      const body = await readBody(request, origin, id);
      if (!body.ok) return body.response;
      const parsed = parseTeamPatch(body.value);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      const result = await performRpc(auth, "team.update", { ...parsed.value, branch_id: branchFromQuery, team_id: segments[1] });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 200, origin, id);
    }

    if (resource === "teams" && segments.length === 3 && isUuid(segments[1]) && segments[2] === "members" && request.method === "POST") {
      if (!branchFromQuery) return fail("INVALID_QUERY", "A single valid branch_id is required.", 400, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, branchFromQuery, "team.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have team management access to this branch.", 403, origin, id);
      const body = await readBody(request, origin, id);
      if (!body.ok) return body.response;
      const parsed = parseTeamMemberCreate(body.value);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      const result = await performRpc(auth, "team.member.add", { ...parsed.value, branch_id: branchFromQuery, team_id: segments[1] });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 201, origin, id);
    }

    if (resource === "teams" && segments.length === 4 && isUuid(segments[1]) && segments[2] === "members" && isUuid(segments[3]) && request.method === "PATCH") {
      if (!branchFromQuery) return fail("INVALID_QUERY", "A single valid branch_id is required.", 400, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, branchFromQuery, "team.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have team management access to this branch.", 403, origin, id);
      const body = await readBody(request, origin, id);
      if (!body.ok) return body.response;
      const parsed = parseTeamMemberRole(body.value);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      const result = await performRpc(auth, "team.member.update_role", { ...parsed.value, branch_id: branchFromQuery, team_id: segments[1], membership_id: segments[3] });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 200, origin, id);
    }

    if (resource === "teams" && segments.length === 5 && isUuid(segments[1]) && segments[2] === "members" && isUuid(segments[3]) && segments[4] === "revoke" && request.method === "POST") {
      if (!branchFromQuery) return fail("INVALID_QUERY", "A single valid branch_id is required.", 400, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, branchFromQuery, "team.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have team management access to this branch.", 403, origin, id);
      const result = await performRpc(auth, "team.member.revoke", { branch_id: branchFromQuery, team_id: segments[1], membership_id: segments[3] });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 200, origin, id);
    }

    if (request.method === "POST" && resource === "areas" && segments.length === 1) {
      if (url.search) return fail("INVALID_QUERY", "Do not include query parameters when creating a service area.", 400, origin, id);
      const body = await readBody(request, origin, id);
      if (!body.ok) return body.response;
      const parsed = parseServiceAreaCreate(body.value);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, parsed.value.branch_id, "area.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have service-area management access to this branch.", 403, origin, id);
      const result = await performRpc(auth, "area.create", { ...parsed.value });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 201, origin, id);
    }

    if (resource === "areas" && segments.length === 2 && isUuid(segments[1]) && request.method === "PATCH") {
      if (!branchFromQuery) return fail("INVALID_QUERY", "A single valid branch_id is required.", 400, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, branchFromQuery, "area.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have service-area management access to this branch.", 403, origin, id);
      const body = await readBody(request, origin, id);
      if (!body.ok) return body.response;
      const parsed = parseServiceAreaPatch(body.value);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      const result = await performRpc(auth, "area.update", { ...parsed.value, branch_id: branchFromQuery, area_id: segments[1] });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 200, origin, id);
    }

    if (resource === "areas" && segments.length === 3 && isUuid(segments[1]) && segments[2] === "coverage" && request.method === "POST") {
      if (!branchFromQuery) return fail("INVALID_QUERY", "A single valid branch_id is required.", 400, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, branchFromQuery, "area.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have service-area management access to this branch.", 403, origin, id);
      const body = await readBody(request, origin, id);
      if (!body.ok) return body.response;
      const parsed = parseAreaCoverageCreate(body.value);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      const result = await performRpc(auth, "area.coverage.add", { ...parsed.value, branch_id: branchFromQuery, area_id: segments[1] });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 201, origin, id);
    }

    if (resource === "areas" && segments.length === 5 && isUuid(segments[1]) && segments[2] === "coverage" && isUuid(segments[3]) && segments[4] === "revoke" && request.method === "POST") {
      if (!branchFromQuery) return fail("INVALID_QUERY", "A single valid branch_id is required.", 400, origin, id);
      const allowed = await hasBranchCapability(auth.service, auth.profileId, branchFromQuery, "area.manage");
      if (!allowed) return fail("FORBIDDEN", "Your account does not have service-area management access to this branch.", 403, origin, id);
      const result = await performRpc(auth, "area.coverage.revoke", { branch_id: branchFromQuery, area_id: segments[1], coverage_id: segments[3] });
      if (result.error) {
        const mapped = rpcError(result.error);
        return fail(mapped.code, mapped.message, mapped.status, origin, id);
      }
      return response({ data: result.data, request_id: id }, 200, origin, id);
    }

    return fail("NOT_FOUND", "The requested team or service-area operation does not exist.", 404, origin, id);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("team-operations failure", { request_id: id, code });
    return fail("TEAM_OPERATION_FAILED", "Unable to complete the team operation.", 500, origin, id);
  }
});
