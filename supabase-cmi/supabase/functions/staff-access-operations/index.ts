import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { createPreflightResponse } from "./http.ts";
import {
  parseAccessMutation,
  parsePathUuid,
  parseRoleAssignment,
} from "./validation.ts";
import { readJson } from "../_shared/request_body.ts";
import { createAllowedOrigins, isAllowedOrigin } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "",
  SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  PUBLIC = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const origins = createAllowedOrigins(
  Deno.env.get("CMI_ALLOWED_ORIGINS"),
);
function res(body: unknown, status: number, origin: string | null, id: string) {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Request-Id": id,
    "Vary": "Origin",
  });
  if (origin && origins.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    h.set(
      "Access-Control-Allow-Headers",
      "Authorization, apikey, Content-Type",
    );
    h.set("Access-Control-Max-Age", "600");
  }
  return new Response(JSON.stringify(body), { status, headers: h });
}
function fail(
  code: string,
  msg: string,
  status: number,
  o: string | null,
  id: string,
) {
  return res({ error: { code, message: msg }, request_id: id }, status, o, id);
}
Deno.serve(async (req: Request) => {
  const id = crypto.randomUUID(), origin = req.headers.get("Origin");
  if (!isAllowedOrigin(origin, origins)) {
    return fail("ORIGIN_NOT_ALLOWED", "Origin not allowed.", 403, null, id);
  }
  if (req.method === "OPTIONS") {
    return createPreflightResponse(origin, origins, id);
  }
  if (req.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed.", 405, origin, id);
  }
  if (!SUPABASE_URL || !SERVICE || !PUBLIC) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Staff access service is not configured.",
      503,
      origin,
      id,
    );
  }
  if (
    !(req.headers.get("Content-Type") ?? "").toLowerCase().includes(
      "application/json",
    )
  ) {
    return fail(
      "CONTENT_TYPE_REQUIRED",
      "Content-Type application/json is required.",
      415,
      origin,
      id,
    );
  }
  const token = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(
    (req.headers.get("Authorization") ?? "").trim(),
  )?.[1];
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
    const authClient = createClient(SUPABASE_URL, PUBLIC, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const service = createClient(SUPABASE_URL, SERVICE, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: auth, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !auth.user) {
      return fail(
        "INVALID_SESSION",
        "A valid staff session is required.",
        401,
        origin,
        id,
      );
    }
    const { data: actor, error: actorErr } = await service.from("staff_profile")
      .select("id,account_status,must_change_password").eq(
        "auth_user_id",
        auth.user.id,
      )
      .maybeSingle();
    if (actorErr) throw new Error("ACTOR_LOOKUP_FAILED");
    if (actor?.must_change_password) {
      return fail(
        "PASSWORD_CHANGE_REQUIRED",
        "Change the temporary password before using staff operations.",
        403,
        origin,
        id,
      );
    }
    if (!actor || actor.account_status !== "active") {
      return fail(
        "STAFF_ACCOUNT_NOT_ACTIVE",
        "An active staff account is required.",
        403,
        origin,
        id,
      );
    }
    const path = new URL(req.url).pathname.replace(/\/+$/, "").split("/")
        .filter(Boolean),
      action = path.at(-1) ?? "";
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_JSON";
      const tooLarge = code === "BODY_TOO_LARGE";
      return fail(
        tooLarge ? "BODY_TOO_LARGE" : "INVALID_REQUEST",
        tooLarge
          ? "Request body is too large."
          : "A valid JSON request body is required.",
        tooLarge ? 413 : 400,
        origin,
        id,
      );
    }
    if (path.at(-2) === "roles" && action === "assign") {
      const p = parseRoleAssignment(body);
      if (!p.ok) return fail("INVALID_REQUEST", p.error, 400, origin, id);
      const { data, error } = await service.rpc("cmi_assign_staff_role", {
        p_actor_auth_user_id: auth.user.id,
        p_target_profile_id: p.value.staff_profile_id,
        p_branch_id: p.value.branch_id,
        p_role_code: p.value.role_code,
        p_starts_at: p.value.starts_at,
        p_ends_at: p.value.ends_at,
        p_reason: p.value.reason,
      });
      if (error) {
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "The operation is not permitted.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "23505") {
          return fail(
            "ROLE_ASSIGNMENT_EXISTS",
            "An active assignment for this role already exists.",
            409,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "INVALID_REQUEST",
            "The role assignment is invalid.",
            400,
            origin,
            id,
          );
        }
        throw new Error("ROLE_ASSIGNMENT_FAILED");
      }
      return res({ data, request_id: id }, 200, origin, id);
    }
    const revokeId = path.at(-3) === "roles" && action === "revoke"
      ? parsePathUuid(path.at(-2) ?? "")
      : null;
    if (revokeId) {
      const p = parseAccessMutation(body);
      if (!p.ok) return fail("INVALID_REQUEST", p.error, 400, origin, id);
      const { data, error } = await service.rpc("cmi_revoke_staff_role", {
        p_actor_auth_user_id: auth.user.id,
        p_assignment_id: revokeId,
        p_branch_id: p.value.branch_id,
        p_reason: p.value.reason,
      });
      if (error) {
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "The operation is not permitted.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "P0002") {
          return fail(
            "NOT_FOUND",
            "Role assignment not found.",
            404,
            origin,
            id,
          );
        }
        throw new Error("ROLE_REVOCATION_FAILED");
      }
      return res({ data, request_id: id }, 200, origin, id);
    }
    const mode = action === "deactivate" || action === "reactivate"
        ? action
        : null,
      profileId = path.at(-3) === "accounts" && mode
        ? parsePathUuid(path.at(-2) ?? "")
        : null;
    if (profileId && mode) {
      const p = parseAccessMutation(body);
      if (!p.ok) return fail("INVALID_REQUEST", p.error, 400, origin, id);
      const desired = mode === "deactivate" ? "inactive" : "active";
      const { data, error } = await service.rpc(
        "cmi_set_staff_account_status",
        {
          p_actor_auth_user_id: auth.user.id,
          p_target_profile_id: profileId,
          p_branch_id: p.value.branch_id,
          p_target_status: desired,
          p_reason: p.value.reason,
        },
      );
      if (error) {
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "The operation is not permitted.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "P0002") {
          return fail(
            "NOT_FOUND",
            "Staff account not found in this branch.",
            404,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "INVALID_STATE",
            "The account state transition is invalid.",
            409,
            origin,
            id,
          );
        }
        throw new Error("ACCOUNT_STATUS_UPDATE_FAILED");
      }
      if (
        !data || typeof data !== "object" ||
        typeof data.auth_user_id !== "string"
      ) {
        throw new Error("ACCOUNT_AUTH_REFERENCE_MISSING");
      }
      const { auth_user_id: authUserId, ...publicData } = data;
      const { error: banErr } = await service.auth.admin.updateUserById(
        authUserId,
        { ban_duration: desired === "inactive" ? "876000h" : "none" },
      );
      if (banErr) {
        console.error("staff Auth ban-state update failed", {
          request_id: id,
          code: "AUTH_BAN_STATE_UPDATE_FAILED",
        });
        return fail(
          "AUTH_SESSION_UPDATE_PENDING",
          "Application access state was updated, but the Auth session restriction could not be confirmed. Retry this operation.",
          503,
          origin,
          id,
        );
      }
      return res({ data: publicData, request_id: id }, 200, origin, id);
    }
    return fail(
      "NOT_FOUND",
      "Staff access operation not found.",
      404,
      origin,
      id,
    );
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    console.error("staff-access-operations failure", { request_id: id, code });
    return fail(
      "STAFF_ACCESS_OPERATION_FAILED",
      "Unable to complete the staff access operation.",
      500,
      origin,
      id,
    );
  }
});
