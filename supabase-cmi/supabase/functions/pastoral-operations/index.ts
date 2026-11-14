import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

import {
  isUuid,
  parsePastoralReadInput,
  parsePastoralReadPath,
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

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Vary": "Origin",
};

function requestId(): string {
  return crypto.randomUUID();
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  id: string,
): Response {
  const headers = new Headers(baseHeaders);
  headers.set("X-Request-Id", id);
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
  return jsonResponse(
    { error: { code, message }, request_id: id },
    status,
    origin,
    id,
  );
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new Error("CONTENT_TYPE_REQUIRED");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON_SIZE");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 4096) {
        await reader.cancel();
        throw new Error("INVALID_JSON_SIZE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) throw new Error("INVALID_JSON_SIZE");
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

Deno.serve(async (request: Request) => {
  const id = requestId();
  const origin = request.headers.get("Origin");

  if (origin && !allowedOrigins.has(origin)) {
    return fail(
      "ORIGIN_NOT_ALLOWED",
      "Origin not allowed.",
      403,
      null,
      id,
    );
  }

  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, apikey, Content-Type, x-client-info",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin",
    });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response(null, { status: 204, headers });
  }

  const requestUrl = new URL(request.url);
  const requestPath = requestUrl.pathname.split("/").filter(Boolean);
  const functionIndex = requestPath.lastIndexOf("pastoral-operations");
  const pastoralRoute = functionIndex >= 0
    ? requestPath.slice(functionIndex + 1)
    : requestPath;
  const isPrayerCollection = pastoralRoute.length === 2 &&
    pastoralRoute[0] === "prayer" && pastoralRoute[1] === "requests";
  const isCareCollection = pastoralRoute.length === 2 &&
    pastoralRoute[0] === "care" && pastoralRoute[1] === "records";

  // Return workflow metadata only. Prayer narratives remain available solely
  // through the audited single-record RPC below.
  if (request.method === "GET" && (isPrayerCollection || isCareCollection)) {
    const allowedQuery = new Set(["branch_id", "limit", "offset"]);
    const keys = [...requestUrl.searchParams.keys()];
    if (
      keys.some((key) => !allowedQuery.has(key)) ||
      new Set(keys).size !== keys.length
    ) {
      return fail(
        "INVALID_QUERY",
        "Unsupported or duplicate query parameter.",
        400,
        origin,
        id,
      );
    }
    const branchId = requestUrl.searchParams.get("branch_id") ?? "";
    const limit = Number(requestUrl.searchParams.get("limit") ?? "25");
    const offset = Number(requestUrl.searchParams.get("offset") ?? "0");
    if (
      !isUuid(branchId) ||
      !Number.isInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isInteger(offset) || offset < 0 || offset > 5000
    ) {
      return fail(
        "INVALID_QUERY",
        "A valid branch_id, limit (1–50), and offset (0–5000) are required.",
        400,
        origin,
        id,
      );
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
      return fail(
        "SERVICE_NOT_CONFIGURED",
        "Pastoral operations are not configured.",
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
      const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            "X-Application-Name": "pcg-missions-pastoral-operations",
          },
        },
      });
      const { data: authData, error: authError } = await authClient.auth
        .getUser(token);
      if (authError || !authData.user) {
        return fail(
          "INVALID_SESSION",
          "A valid staff session is required.",
          401,
          origin,
          id,
        );
      }

      const { data: staffProfile, error: profileError } = await service
        .from("staff_profile")
        .select("id,account_status,must_change_password")
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();
      if (profileError) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
      if (!staffProfile || staffProfile.account_status !== "active") {
        return fail(
          "STAFF_ACCOUNT_NOT_ACTIVE",
          "An active staff account is required.",
          403,
          origin,
          id,
        );
      }
      if (staffProfile.must_change_password) {
        return fail(
          "PASSWORD_CHANGE_REQUIRED",
          "Change the temporary password before using staff operations.",
          403,
          origin,
          id,
        );
      }

      const { data: branch, error: branchError } = await service
        .from("branch")
        .select("id,is_active")
        .eq("id", branchId)
        .maybeSingle();
      if (branchError) throw new Error("BRANCH_LOOKUP_FAILED");
      if (!branch?.is_active) {
        return fail("NOT_FOUND", "Branch not found.", 404, origin, id);
      }

      const now = new Date().toISOString();
      const { data: assignments, error: assignmentError } = await service
        .from("staff_role_assignment")
        .select("role_id,role:role!inner(is_active)")
        .eq("role.is_active", true)
        .eq("staff_profile_id", staffProfile.id)
        .eq("branch_id", branchId)
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .is("revoked_at", null);
      if (assignmentError) {
        throw new Error("ROLE_ASSIGNMENT_LOOKUP_FAILED");
      }
      const roleIds = [
        ...new Set(
          (assignments ?? []).map((item: { role_id: string }) => item.role_id),
        ),
      ];
      if (roleIds.length === 0) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const assignedCapability = isPrayerCollection
        ? "prayer.request.read.assigned"
        : "care.record.read.assigned";
      const oversightCapability = isPrayerCollection
        ? "prayer.oversight.read"
        : "care.oversight.read";
      const { data: grants, error: grantError } = await service
        .from("role_capability")
        .select("scope_mode,capability:capability!inner(code,is_active)")
        .in("role_id", roleIds)
        .in("scope_mode", ["assigned", "oversight"])
        .in("capability.code", [assignedCapability, oversightCapability]);
      if (grantError) throw new Error("CAPABILITY_LOOKUP_FAILED");
      const scopes = (grants ?? []).flatMap((grant: {
        scope_mode: string;
        capability?:
          | { code: string; is_active: boolean }
          | Array<{ code: string; is_active: boolean }>
          | null;
      }) => {
        const capability = Array.isArray(grant.capability)
          ? grant.capability[0]
          : grant.capability;
        if (!capability?.is_active) return [];
        if (
          grant.scope_mode === "assigned" &&
          capability.code === assignedCapability
        ) return ["assigned"];
        if (
          grant.scope_mode === "oversight" &&
          capability.code === oversightCapability
        ) return ["oversight"];
        return [];
      });
      const accessMode = scopes.includes("oversight")
        ? "oversight"
        : scopes.includes("assigned")
        ? "assigned"
        : null;
      if (!accessMode) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      let requestIds: string[] | null = null;
      if (accessMode === "assigned") {
        const { data: activeAssignments, error: activeAssignmentError } =
          isPrayerCollection
            ? await service
              .from("prayer_assignment")
              .select("prayer_request_id")
              .eq("branch_id", branchId)
              .eq("intercessor_user_id", authData.user.id)
              .lte("starts_at", now)
              .or(`ends_at.is.null,ends_at.gt.${now}`)
              .is("revoked_at", null)
            : await service
              .from("care_assignment")
              .select("care_record_id")
              .eq("branch_id", branchId)
              .eq("assignee_user_id", authData.user.id)
              .lte("starts_at", now)
              .or(`ends_at.is.null,ends_at.gt.${now}`)
              .is("revoked_at", null);
        if (activeAssignmentError) {
          throw new Error("PRAYER_ASSIGNMENT_LOOKUP_FAILED");
        }
        requestIds = [
          ...new Set(
            (activeAssignments ?? []).map((item: {
              prayer_request_id?: string;
              care_record_id?: string;
            }) => isPrayerCollection
              ? item.prayer_request_id
              : item.care_record_id).filter((value): value is string => !!value),
          ),
        ];
        if (requestIds.length === 0) {
          return jsonResponse(
            { data: [], access_mode: accessMode, request_id: id },
            200,
            origin,
            id,
          );
        }
      }

      const metadataTable = isPrayerCollection
        ? "prayer_request"
        : "care_record";
      const metadataColumns = isPrayerCollection
        ? "id,status,sensitivity,expires_at,answered_at,created_at,updated_at"
        : "id,status,care_group_id,created_at,updated_at";
      let query = (service as any).from(metadataTable)
        .select(metadataColumns)
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (requestIds) query = query.in("id", requestIds);
      const { data, error } = await query;
      if (error) throw new Error("PRAYER_REQUEST_LIST_FAILED");
      return jsonResponse(
        { data: data ?? [], access_mode: accessMode, request_id: id },
        200,
        origin,
        id,
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      console.error("pastoral-operations list failure", {
        request_id: id,
        code,
      });
      return fail(
        "PASTORAL_OPERATION_FAILED",
        isPrayerCollection
          ? "Unable to load prayer request metadata."
          : "Unable to load pastoral care metadata.",
        500,
        origin,
        id,
      );
    }
  }

  if (requestUrl.search !== "") {
    return fail(
      "INVALID_QUERY",
      "Query parameters are not accepted for pastoral reads.",
      400,
      origin,
      id,
    );
  }

  const route = parsePastoralReadPath(requestUrl.pathname);
  if (!route) {
    return fail(
      "NOT_FOUND",
      "The requested pastoral operation does not exist.",
      404,
      origin,
      id,
    );
  }

  if (request.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed.", 405, origin, id);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Pastoral operations are not configured.",
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

  let raw: unknown;
  try {
    raw = await readJson(request);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_JSON";
    return fail(
      code === "CONTENT_TYPE_REQUIRED" ? code : "INVALID_JSON",
      code === "CONTENT_TYPE_REQUIRED"
        ? "Content-Type must be application/json."
        : "A valid JSON body of at most 4 KB is required.",
      400,
      origin,
      id,
    );
  }

  const parsed = parsePastoralReadInput(raw);
  if (!parsed.ok) {
    return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
  }

  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "X-Application-Name": "pcg-missions-pastoral-operations" },
      },
    });

    // Validate the access token with Supabase Auth; never trust decoded JWT claims.
    const { data: authData, error: authError } = await authClient.auth.getUser(
      token,
    );
    if (authError || !authData.user) {
      return fail(
        "INVALID_SESSION",
        "A valid staff session is required.",
        401,
        origin,
        id,
      );
    }

    const { data: staffProfile, error: staffProfileError } = await service
      .from("staff_profile")
      .select("account_status,must_change_password")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (staffProfileError) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
    if (!staffProfile || staffProfile.account_status !== "active") {
      return fail(
        "STAFF_ACCOUNT_NOT_ACTIVE",
        "An active staff account is required.",
        403,
        origin,
        id,
      );
    }
    if (staffProfile.must_change_password) {
      return fail(
        "PASSWORD_CHANGE_REQUIRED",
        "Change the temporary password before using staff operations.",
        403,
        origin,
        id,
      );
    }

    const rpcName = route.kind === "prayer_request"
      ? "cmi_read_prayer_request"
      : "cmi_read_care_record";
    const recordParameter = route.kind === "prayer_request"
      ? "p_prayer_request_id"
      : "p_care_record_id";
    const parameters: Record<string, unknown> = {
      p_actor_auth_user_id: authData.user.id,
      p_branch_id: parsed.value.branch_id,
      p_access_mode: parsed.value.access_mode,
      p_reason: parsed.value.reason_code,
      p_request_id: id,
      [recordParameter]: route.recordId,
    };

    const { data, error } = await service.rpc(rpcName, parameters);
    if (error) {
      if (error.code === "42501") {
        return fail(
          "FORBIDDEN",
          "You do not have permission to access this pastoral record.",
          403,
          origin,
          id,
        );
      }
      if (error.code === "P0002") {
        return fail(
          "NOT_FOUND",
          "Pastoral record not found.",
          404,
          origin,
          id,
        );
      }
      if (error.code === "22023") {
        return fail(
          "VALIDATION_ERROR",
          "The pastoral read request is invalid.",
          422,
          origin,
          id,
        );
      }
      throw new Error("PASTORAL_READ_TRANSACTION_FAILED");
    }

    return jsonResponse({ data, request_id: id }, 200, origin, id);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    // Log only an internal error code and correlation ID, never narratives or credentials.
    console.error("pastoral-operations failure", { request_id: id, code });
    return fail(
      "PASTORAL_OPERATION_FAILED",
      "Unable to complete the pastoral record read.",
      500,
      origin,
      id,
    );
  }
});
