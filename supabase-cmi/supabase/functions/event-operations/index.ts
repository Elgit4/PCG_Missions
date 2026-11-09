import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  isUuid,
  parseEventCreate,
  parseEventListQuery,
  parseEventPatch,
} from "./validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const allowedOrigins = new Set(
  (Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Application-Name": "pcg-missions-event-operations" },
    },
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;
type ScopeMode =
  | "branch"
  | "team"
  | "assigned"
  | "self"
  | "event"
  | "explicit_share"
  | "oversight";

const EVENT_COLUMNS =
  "id,branch_id,title,description,starts_at,ends_at,timezone,location,status,visibility,registration_state,created_at,updated_at";

function newRequestId(): string {
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

function getBearer(request: Request): string | null {
  const value = request.headers.get("Authorization");
  const match = value
    ? /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim())
    : null;
  return match?.[1] ?? null;
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("CONTENT_TYPE_REQUIRED");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 32_768) {
    throw new Error("BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
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
    .select("id,account_status")
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

async function resolveScopes(
  service: ServiceClient,
  profileId: string,
  branchId: string,
  capabilityCode: string,
): Promise<ScopeMode[]> {
  const now = new Date().toISOString();
  const { data: branch, error: branchError } = await service
    .from("branch")
    .select("id,is_active")
    .eq("id", branchId)
    .maybeSingle();
  if (branchError) throw new Error("BRANCH_LOOKUP_FAILED");
  if (!branch || !branch.is_active) return [];

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
  if (roleIds.length === 0) return [];

  const { data: grants, error: grantError } = await service
    .from("role_capability")
    .select("scope_mode,capability:capability!inner(code,is_active)")
    .in("role_id", roleIds)
    .eq("capability.code", capabilityCode);
  if (grantError) throw new Error("CAPABILITY_LOOKUP_FAILED");

  const scopes = (grants ?? []).flatMap((grant: {
    scope_mode: ScopeMode;
    capability?:
      | { code: string; is_active: boolean }
      | Array<{ code: string; is_active: boolean }>
      | null;
  }) => {
    const capability = Array.isArray(grant.capability)
      ? grant.capability[0]
      : grant.capability;
    return capability?.is_active ? [grant.scope_mode] : [];
  });
  return [...new Set(scopes)];
}

async function isAssignedEvent(
  service: ServiceClient,
  eventId: string,
  branchId: string,
  actorId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("event_staff_assignment")
    .select("id")
    .eq("event_id", eventId)
    .eq("branch_id", branchId)
    .eq("staff_auth_user_id", actorId)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("EVENT_ASSIGNMENT_LOOKUP_FAILED");
  return Boolean(data);
}

async function eventIsVisible(
  service: ServiceClient,
  eventId: string,
  branchId: string,
  actorId: string,
  scopes: ScopeMode[],
): Promise<boolean> {
  if (scopes.includes("branch")) return true;
  if (!scopes.includes("event")) return false;
  return await isAssignedEvent(service, eventId, branchId, actorId);
}

Deno.serve(async (request: Request) => {
  const id = newRequestId();
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
        "Access-Control-Allow-Headers":
          "Authorization, apikey, Content-Type, x-client-info",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  if (!["GET", "POST", "PATCH"].includes(request.method)) {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed.", 405, origin, id);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Event operations service is not configured.",
      503,
      origin,
      id,
    );
  }

  const token = getBearer(request);
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
    const path = url.pathname.split("/").filter(Boolean);
    const last = path[path.length - 1] ?? "";
    const previous = path[path.length - 2] ?? "";
    const isCollection = previous === "event-operations" && last === "events";
    const isItem = path[path.length - 3] === "event-operations" &&
      previous === "events" && isUuid(last);

    if (request.method === "GET" && isCollection) {
      const parsed = parseEventListQuery(url);
      if (!parsed.ok) {
        return fail("INVALID_QUERY", parsed.error, 400, origin, id);
      }
      const { branch_id, limit, offset } = parsed.value;
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branch_id,
        "event.read.scoped",
      );
      if (scopes.length === 0) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      let query = auth.service.from("event").select(EVENT_COLUMNS)
        .eq("branch_id", branch_id);
      if (!scopes.includes("branch")) {
        if (!scopes.includes("event")) {
          return fail(
            "FORBIDDEN",
            "The operation is not permitted.",
            403,
            origin,
            id,
          );
        }
        const now = new Date().toISOString();
        const { data: assignments, error: assignmentError } = await auth.service
          .from("event_staff_assignment")
          .select("event_id")
          .eq("branch_id", branch_id)
          .eq("staff_auth_user_id", auth.actorId)
          .lte("starts_at", now)
          .or(`ends_at.is.null,ends_at.gt.${now}`)
          .is("revoked_at", null);
        if (assignmentError) throw new Error("EVENT_ASSIGNMENT_LIST_FAILED");
        const eventIds = [
          ...new Set((assignments ?? []).map((row) => row.event_id)),
        ];
        if (eventIds.length === 0) {
          return response({ data: [], request_id: id }, 200, origin, id);
        }
        query = query.in("id", eventIds);
      }

      const { data, error } = await query
        .order("starts_at", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw new Error("EVENT_LIST_FAILED");
      return response({ data: data ?? [], request_id: id }, 200, origin, id);
    }

    if (request.method === "GET" && isItem) {
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (
        !isUuid(branchId) || [...url.searchParams.keys()].some((key) =>
          key !== "branch_id"
        ) || url.searchParams.getAll("branch_id").length !== 1
      ) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "event.read.scoped",
      );
      if (
        !(await eventIsVisible(
          auth.service,
          last,
          branchId,
          auth.actorId,
          scopes,
        ))
      ) {
        return fail("NOT_FOUND", "Event not found.", 404, origin, id);
      }
      const { data, error } = await auth.service
        .from("event")
        .select(EVENT_COLUMNS)
        .eq("id", last)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (error) throw new Error("EVENT_DETAIL_FAILED");
      if (!data) {
        return fail("NOT_FOUND", "Event not found.", 404, origin, id);
      }
      return response({ data, request_id: id }, 200, origin, id);
    }

    if (request.method === "POST" && isCollection) {
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INVALID_JSON";
        const status = code === "BODY_TOO_LARGE" ? 413 : 400;
        return fail(
          code,
          code === "CONTENT_TYPE_REQUIRED"
            ? "Content-Type must be application/json."
            : code === "BODY_TOO_LARGE"
            ? "Request body is too large."
            : "A valid JSON request body is required.",
          status,
          origin,
          id,
        );
      }
      const parsed = parseEventCreate(body);
      if (!parsed.ok) {
        return fail("INVALID_EVENT", parsed.error, 400, origin, id);
      }
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        parsed.value.branch_id,
        "event.manage.scoped",
      );
      if (!scopes.includes("branch")) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const { data, error } = await auth.service
        .from("event")
        .insert({
          ...parsed.value,
          status: "draft",
          visibility: "private",
          registration_state: "closed",
          created_by: auth.actorId,
        })
        .select(EVENT_COLUMNS)
        .single();
      if (error) throw new Error("EVENT_CREATE_FAILED");
      return response({ data, request_id: id }, 201, origin, id);
    }

    if (request.method === "PATCH" && isItem) {
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (!isUuid(branchId) || [...url.searchParams.keys()].some((key) =>
        key !== "branch_id"
      ) || url.searchParams.getAll("branch_id").length !== 1) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }

      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INVALID_JSON";
        const status = code === "BODY_TOO_LARGE" ? 413 : 400;
        return fail(
          code,
          code === "CONTENT_TYPE_REQUIRED"
            ? "Content-Type must be application/json."
            : code === "BODY_TOO_LARGE"
            ? "Request body is too large."
            : "A valid JSON request body is required.",
          status,
          origin,
          id,
        );
      }
      const parsed = parseEventPatch(body);
      if (!parsed.ok) {
        return fail("INVALID_EVENT", parsed.error, 400, origin, id);
      }
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "event.manage.scoped",
      );
      if (!scopes.includes("branch")) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const { data: current, error: currentError } = await auth.service
        .from("event")
        .select("id,status,visibility,registration_state")
        .eq("id", last)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (currentError) throw new Error("EVENT_LOOKUP_FAILED");
      if (!current) {
        return fail("NOT_FOUND", "Event not found.", 404, origin, id);
      }
      if (
        current.status !== "draft" || current.visibility !== "private" ||
        current.registration_state !== "closed"
      ) {
        return fail(
          "EVENT_NOT_EDITABLE",
          "Only private draft events with registration closed can be edited.",
          409,
          origin,
          id,
        );
      }

      const { data, error } = await auth.service
        .from("event")
        .update(parsed.value)
        .eq("id", last)
        .eq("branch_id", branchId)
        .eq("status", "draft")
        .eq("visibility", "private")
        .eq("registration_state", "closed")
        .select(EVENT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error("EVENT_UPDATE_FAILED");
      if (!data) {
        return fail(
          "EVENT_NOT_EDITABLE",
          "The event changed and is no longer an editable draft.",
          409,
          origin,
          id,
        );
      }
      return response({ data, request_id: id }, 200, origin, id);
    }

    return fail(
      "NOT_FOUND",
      "The requested event operation does not exist.",
      404,
      origin,
      id,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("event-operations failure", { request_id: id, code });
    return fail(
      "EVENT_OPERATION_FAILED",
      "Unable to complete the event operation.",
      500,
      origin,
      id,
    );
  }
});
