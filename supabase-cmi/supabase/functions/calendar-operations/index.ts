import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  isUuid,
  parseCalendarCreate,
  parseCalendarListQuery,
  parseCalendarPatch,
} from "./validation.ts";
import { readJson } from "../_shared/request_body.ts";
import {
  createAllowedOrigins,
  createPreflightResponse,
  isAllowedOrigin,
} from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const allowedOrigins = createAllowedOrigins(
  Deno.env.get("CMI_ALLOWED_ORIGINS"),
);

function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Application-Name": "pcg-missions-calendar-operations" },
    },
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;
const CALENDAR_COLUMNS =
  "id,branch_id,entry_type,title,starts_at,ends_at,scope_type,created_by,created_at,updated_at";

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
      "Authorization, apikey, Content-Type",
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
  return response(
    { error: { code, message }, request_id: id },
    status,
    origin,
    id,
  );
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  const match = value
    ? /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim())
    : null;
  return match?.[1] ?? null;
}

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
  if (!branch || !branch.is_active) return false;

  const { data: assignments, error: assignmentError } = await service
    .from("staff_role_assignment")
    .select("role_id,role:role!inner(is_active)")
    .eq("role.is_active", true)
    .eq("staff_profile_id", profileId)
    .eq("branch_id", branchId)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .is("revoked_at", null);
  if (assignmentError) throw new Error("ROLE_ASSIGNMENT_LOOKUP_FAILED");

  const roleIds = [
    ...new Set(
      (assignments ?? []).map((item: { role_id: string }) => item.role_id),
    ),
  ];
  if (roleIds.length === 0) return false;

  const { data: grants, error: grantError } = await service
    .from("role_capability")
    .select("scope_mode,capability:capability!inner(code,is_active)")
    .in("role_id", roleIds)
    .eq("capability.code", capabilityCode)
    .eq("scope_mode", "branch");
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

function hasSingleBranchParameter(url: URL): string | null {
  const values = url.searchParams.getAll("branch_id");
  if (
    values.length !== 1 ||
    [...url.searchParams.keys()].some((key) => key !== "branch_id") ||
    !isUuid(values[0])
  ) {
    return null;
  }
  return values[0];
}

async function readRequestBody(
  request: Request,
  origin: string | null,
  id: string,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await readJson(request) };
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

Deno.serve(async (request: Request) => {
  const id = requestId();
  const origin = request.headers.get("Origin");

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return fail("ORIGIN_NOT_ALLOWED", "Origin not allowed.", 403, null, id);
  }

  if (request.method === "OPTIONS") {
    return createPreflightResponse(origin, allowedOrigins);
  }

  if (!["GET", "POST", "PATCH"].includes(request.method)) {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed.", 405, origin, id);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Calendar operations service is not configured.",
      503,
      origin,
      id,
    );
  }

  const token = bearerToken(request);
  if (!token) {
    return fail(
      "AUTH_REQUIRED",
      "A valid staff session is required.",
      401,
      origin,
      id,
    );
  }

  try {
    const auth = await resolveStaff(token);
    if (!auth.ok) {
      return fail(auth.code, auth.message, auth.status, origin, id);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const last = path[path.length - 1] ?? "";
    const previous = path[path.length - 2] ?? "";
    const functionIndex = path.lastIndexOf("calendar-operations");
    const isCollection = functionIndex >= 0 &&
      path.length === functionIndex + 2 && last === "entries";
    const isItem = functionIndex >= 0 &&
      path.length === functionIndex + 3 && previous === "entries" &&
      isUuid(last);

    if (!isCollection && !isItem) {
      return fail(
        "NOT_FOUND",
        "The requested calendar operation does not exist.",
        404,
        origin,
        id,
      );
    }

    if (request.method === "GET" && isCollection) {
      const parsed = parseCalendarListQuery(url);
      if (!parsed.ok) {
        return fail("INVALID_QUERY", parsed.error, 400, origin, id);
      }
      const { branch_id, limit, offset } = parsed.value;
      const permitted = await hasBranchCapability(
        auth.service,
        auth.profileId,
        branch_id,
        "calendar.read.scoped",
      );
      if (!permitted) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const { data, error } = await auth.service
        .from("calendar_entry")
        .select(CALENDAR_COLUMNS)
        .eq("branch_id", branch_id)
        .eq("scope_type", "branch")
        .order("starts_at", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw new Error("CALENDAR_LIST_FAILED");
      return response({ data: data ?? [], request_id: id }, 200, origin, id);
    }

    if (request.method === "GET" && isItem) {
      const branchId = hasSingleBranchParameter(url);
      if (!branchId) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }
      const permitted = await hasBranchCapability(
        auth.service,
        auth.profileId,
        branchId,
        "calendar.read.scoped",
      );
      if (!permitted) {
        return fail("NOT_FOUND", "Calendar entry not found.", 404, origin, id);
      }

      const { data, error } = await auth.service
        .from("calendar_entry")
        .select(CALENDAR_COLUMNS)
        .eq("id", last)
        .eq("branch_id", branchId)
        .eq("scope_type", "branch")
        .maybeSingle();
      if (error) throw new Error("CALENDAR_DETAIL_FAILED");
      if (!data) {
        return fail("NOT_FOUND", "Calendar entry not found.", 404, origin, id);
      }
      return response({ data, request_id: id }, 200, origin, id);
    }

    if (request.method === "POST" && isCollection) {
      const body = await readRequestBody(request, origin, id);
      if (!body.ok) return body.response;
      const parsed = parseCalendarCreate(body.value);
      if (!parsed.ok) {
        return fail("INVALID_CALENDAR_ENTRY", parsed.error, 400, origin, id);
      }

      const permitted = await hasBranchCapability(
        auth.service,
        auth.profileId,
        parsed.value.branch_id,
        "calendar.manage.scoped",
      );
      if (!permitted) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const { data, error } = await auth.service
        .from("calendar_entry")
        .insert({
          ...parsed.value,
          scope_type: "branch",
          team_id: null,
          event_id: null,
          owner_user_id: null,
          created_by: auth.actorId,
        })
        .select(CALENDAR_COLUMNS)
        .single();
      if (error) throw new Error("CALENDAR_CREATE_FAILED");
      return response({ data, request_id: id }, 201, origin, id);
    }

    if (request.method === "PATCH" && isItem) {
      const branchId = hasSingleBranchParameter(url);
      if (!branchId) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }

      const body = await readRequestBody(request, origin, id);
      if (!body.ok) return body.response;

      const permitted = await hasBranchCapability(
        auth.service,
        auth.profileId,
        branchId,
        "calendar.manage.scoped",
      );
      if (!permitted) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const { data: current, error: currentError } = await auth.service
        .from("calendar_entry")
        .select("id,starts_at,ends_at,updated_at")
        .eq("id", last)
        .eq("branch_id", branchId)
        .eq("scope_type", "branch")
        .maybeSingle();
      if (currentError) throw new Error("CALENDAR_LOOKUP_FAILED");
      if (!current) {
        return fail("NOT_FOUND", "Calendar entry not found.", 404, origin, id);
      }

      const parsed = parseCalendarPatch(
        body.value,
        current.starts_at,
        current.ends_at,
      );
      if (!parsed.ok) {
        return fail("INVALID_CALENDAR_ENTRY", parsed.error, 400, origin, id);
      }

      const { data, error } = await auth.service
        .from("calendar_entry")
        .update(parsed.value)
        .eq("id", last)
        .eq("branch_id", branchId)
        .eq("scope_type", "branch")
        .eq("updated_at", current.updated_at)
        .select(CALENDAR_COLUMNS)
        .maybeSingle();

      if (error) throw new Error("CALENDAR_UPDATE_FAILED");
      if (!data) {
        return fail(
          "CALENDAR_CONFLICT",
          "The calendar entry changed before the update completed. Reload it and try again.",
          409,
          origin,
          id,
        );
      }
      return response({ data, request_id: id }, 200, origin, id);
    }

    return fail(
      "NOT_FOUND",
      "The requested calendar operation does not exist.",
      404,
      origin,
      id,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("calendar-operations failure", { request_id: id, code });
    return fail(
      "CALENDAR_OPERATION_FAILED",
      "Unable to complete the calendar operation.",
      500,
      origin,
      id,
    );
  }
});
