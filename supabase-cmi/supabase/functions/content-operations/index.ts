import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  isUuid,
  parseContentListQuery,
  parseSermonCreate,
  parseSermonPatch,
  parseWelcomeMessageCreate,
  parseWelcomeMessagePatch,
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
      headers: { "X-Application-Name": "pcg-missions-content-operations" },
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

type ContentResource = "sermons" | "welcome-messages";

const SERMON_COLUMNS =
  "id,branch_id,title,body,public_slug,status,published_at,created_at,updated_at";
const WELCOME_COLUMNS =
  "id,branch_id,title,body,display_order,status,published_at,created_at,updated_at";

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
    headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, OPTIONS",
    );
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

async function resolveBranchScope(
  service: ServiceClient,
  profileId: string,
  branchId: string,
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
    .eq("capability.code", "content.manage.draft")
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

function parseResource(
  value: string,
): ContentResource | null {
  return value === "sermons" || value === "welcome-messages" ? value : null;
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
      "Content operations service is not configured.",
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
    const resource = parseResource(path[path.length - 1] ?? "");
    const itemId = path[path.length - 1] ?? "";
    const itemResource = parseResource(path[path.length - 2] ?? "");
    const functionIndex = path.lastIndexOf("content-operations");
    const isCollection = functionIndex >= 0 &&
      path.length === functionIndex + 2 && resource !== null;
    const isItem = functionIndex >= 0 &&
      path.length === functionIndex + 3 && itemResource !== null &&
      isUuid(itemId);

    if (!isCollection && !isItem) {
      return fail(
        "NOT_FOUND",
        "The requested content operation does not exist.",
        404,
        origin,
        id,
      );
    }

    if (request.method === "GET" && isCollection) {
      const parsed = parseContentListQuery(url);
      if (!parsed.ok) {
        return fail("INVALID_QUERY", parsed.error, 400, origin, id);
      }

      const { branch_id, limit, offset } = parsed.value;
      if (
        !(await resolveBranchScope(
          auth.service,
          auth.profileId,
          branch_id,
        ))
      ) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const table = resource === "sermons" ? "sermon" : "welcome_message";
      const columns = resource === "sermons" ? SERMON_COLUMNS : WELCOME_COLUMNS;

      const { data, error } = await auth.service
        .from(table)
        .select(columns)
        .eq("branch_id", branch_id)
        .eq("status", "draft")
        .eq("created_by", auth.actorId)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error("CONTENT_LIST_FAILED");
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

      if (
        !(await resolveBranchScope(auth.service, auth.profileId, branchId))
      ) {
        return fail("NOT_FOUND", "Content item not found.", 404, origin, id);
      }

      const table = itemResource === "sermons" ? "sermon" : "welcome_message";
      const columns = itemResource === "sermons"
        ? SERMON_COLUMNS
        : WELCOME_COLUMNS;

      const { data, error } = await auth.service
        .from(table)
        .select(columns)
        .eq("id", itemId)
        .eq("branch_id", branchId)
        .eq("status", "draft")
        .eq("created_by", auth.actorId)
        .maybeSingle();

      if (error) throw new Error("CONTENT_DETAIL_FAILED");
      if (!data) {
        return fail("NOT_FOUND", "Content item not found.", 404, origin, id);
      }
      return response({ data, request_id: id }, 200, origin, id);
    }

    if (request.method === "POST" && isCollection) {
      const body = await readRequestBody(request, origin, id);
      if (!body.ok) return body.response;

      if (resource === "sermons") {
        const parsed = parseSermonCreate(body.value);
        if (!parsed.ok) {
          return fail("INVALID_CONTENT", parsed.error, 400, origin, id);
        }
        if (
          !(await resolveBranchScope(
            auth.service,
            auth.profileId,
            parsed.value.branch_id,
          ))
        ) {
          return fail(
            "FORBIDDEN",
            "The operation is not permitted.",
            403,
            origin,
            id,
          );
        }

        const { data, error } = await auth.service
          .from("sermon")
          .insert({
            ...parsed.value,
            status: "draft",
            published_at: null,
            created_by: auth.actorId,
          })
          .select(SERMON_COLUMNS)
          .single();

        if (error) {
          if (error.code === "23505") {
            return fail(
              "CONTENT_SLUG_CONFLICT",
              "The public slug is already in use.",
              409,
              origin,
              id,
            );
          }
          throw new Error("SERMON_CREATE_FAILED");
        }
        return response({ data, request_id: id }, 201, origin, id);
      }

      const parsed = parseWelcomeMessageCreate(body.value);
      if (!parsed.ok) {
        return fail("INVALID_CONTENT", parsed.error, 400, origin, id);
      }
      if (
        !(await resolveBranchScope(
          auth.service,
          auth.profileId,
          parsed.value.branch_id,
        ))
      ) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const { data, error } = await auth.service
        .from("welcome_message")
        .insert({
          ...parsed.value,
          status: "draft",
          published_at: null,
          created_by: auth.actorId,
        })
        .select(WELCOME_COLUMNS)
        .single();

      if (error) throw new Error("WELCOME_MESSAGE_CREATE_FAILED");
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

      if (
        !(await resolveBranchScope(auth.service, auth.profileId, branchId))
      ) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      if (itemResource === "sermons") {
        const parsed = parseSermonPatch(body.value);
        if (!parsed.ok) {
          return fail("INVALID_CONTENT", parsed.error, 400, origin, id);
        }

        const { data, error } = await auth.service
          .from("sermon")
          .update(parsed.value)
          .eq("id", itemId)
          .eq("branch_id", branchId)
          .eq("created_by", auth.actorId)
          .eq("status", "draft")
          .select(SERMON_COLUMNS)
          .maybeSingle();

        if (error) {
          if (error.code === "23505") {
            return fail(
              "CONTENT_SLUG_CONFLICT",
              "The public slug is already in use.",
              409,
              origin,
              id,
            );
          }
          throw new Error("SERMON_UPDATE_FAILED");
        }
        if (!data) {
          return fail(
            "CONTENT_NOT_EDITABLE",
            "The content item is not an editable draft owned by this account.",
            409,
            origin,
            id,
          );
        }
        return response({ data, request_id: id }, 200, origin, id);
      }

      const parsed = parseWelcomeMessagePatch(body.value);
      if (!parsed.ok) {
        return fail("INVALID_CONTENT", parsed.error, 400, origin, id);
      }

      const { data, error } = await auth.service
        .from("welcome_message")
        .update(parsed.value)
        .eq("id", itemId)
        .eq("branch_id", branchId)
        .eq("created_by", auth.actorId)
        .eq("status", "draft")
        .select(WELCOME_COLUMNS)
        .maybeSingle();

      if (error) throw new Error("WELCOME_MESSAGE_UPDATE_FAILED");
      if (!data) {
        return fail(
          "CONTENT_NOT_EDITABLE",
          "The content item is not an editable draft owned by this account.",
          409,
          origin,
          id,
        );
      }
      return response({ data, request_id: id }, 200, origin, id);
    }

    return fail(
      "NOT_FOUND",
      "The requested content operation does not exist.",
      404,
      origin,
      id,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("content-operations failure", { request_id: id, code });
    return fail(
      "CONTENT_OPERATION_FAILED",
      "Unable to complete the content operation.",
      500,
      origin,
      id,
    );
  }
});
