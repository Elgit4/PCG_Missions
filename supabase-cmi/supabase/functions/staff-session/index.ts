import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

import { buildStaffSession } from "./session.ts";
import type {
  BranchRow,
  RoleAssignmentRow,
  RoleCapabilityRow,
  StaffProfile,
} from "./session.ts";

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

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  requestId: string,
): Response {
  const headers = new Headers(baseHeaders);
  headers.set("X-Request-Id", requestId);
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, apikey, Content-Type",
    );
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function requestId(): string {
  return crypto.randomUUID();
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function errorResponse(
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

Deno.serve(async (request: Request) => {
  const id = requestId();
  const origin = request.headers.get("Origin");

  if (origin && !allowedOrigins.has(origin)) {
    return errorResponse(
      "ORIGIN_NOT_ALLOWED",
      "Origin not allowed.",
      403,
      null,
      id,
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, apikey, Content-Type, x-client-info",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  if (request.method !== "GET") {
    return errorResponse(
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
      405,
      origin,
      id,
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return errorResponse(
      "SERVICE_NOT_CONFIGURED",
      "Staff session service is not configured.",
      503,
      origin,
      id,
    );
  }

  const token = bearerToken(request);
  if (!token) {
    return errorResponse(
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
        headers: { "X-Application-Name": "pcg-missions-staff-session" },
      },
    });

    // Validate the access token with Supabase Auth; never trust decoded JWT claims.
    const { data: authData, error: authError } = await authClient.auth.getUser(
      token,
    );
    if (authError || !authData.user) {
      return errorResponse(
        "INVALID_SESSION",
        "A valid staff session is required.",
        401,
        origin,
        id,
      );
    }

    const { data: profile, error: profileError } = await service
      .from("staff_profile")
      .select(
        "id,auth_user_id,full_name,email,account_status,must_change_password,password_setup_expires_at",
      )
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (profileError) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
    if (!profile) {
      return errorResponse(
        "STAFF_PROFILE_NOT_FOUND",
        "This account has not been provisioned as staff.",
        403,
        origin,
        id,
      );
    }

    if (profile.account_status !== "active") {
      return errorResponse(
        "STAFF_ACCOUNT_NOT_ACTIVE",
        "This staff account is not active.",
        403,
        origin,
        id,
      );
    }

    if (profile.must_change_password) {
      const expiresAt = Date.parse(profile.password_setup_expires_at ?? "");
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        return errorResponse(
          "PASSWORD_SETUP_EXPIRED",
          "The temporary password or recovery window has expired. Request an administrator-assisted reset.",
          403,
          origin,
          id,
        );
      }
    }

    const now = new Date().toISOString();
    const { data: assignments, error: assignmentError } = await service
      .from("staff_role_assignment")
      .select(
        "role_id,branch_id,starts_at,ends_at,revoked_at,role:role!inner(code,name,is_active)",
      )
      .eq("role.is_active", true)
      .eq("staff_profile_id", profile.id)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .is("revoked_at", null);

    if (assignmentError) throw new Error("STAFF_ROLE_LOOKUP_FAILED");

    const assignmentRows =
      (assignments ?? []) as unknown as RoleAssignmentRow[];
    const branchIds = [
      ...new Set(assignmentRows.map((item) => item.branch_id)),
    ];

    let branchRows: BranchRow[] = [];
    let capabilityRows: RoleCapabilityRow[] = [];

    if (branchIds.length > 0) {
      const { data: branches, error: branchError } = await service
        .from("branch")
        .select("id,name,timezone,is_active")
        .in("id", branchIds);

      if (branchError) throw new Error("STAFF_BRANCH_LOOKUP_FAILED");
      branchRows = (branches ?? []) as BranchRow[];

      const roleIds = [...new Set(assignmentRows.map((item) => item.role_id))];
      const { data: grants, error: grantError } = await service
        .from("role_capability")
        .select(
          "role_id,scope_mode,capability:capability!inner(code,is_active)",
        )
        .in("role_id", roleIds);

      if (grantError) throw new Error("STAFF_CAPABILITY_LOOKUP_FAILED");
      capabilityRows = (grants ?? []) as unknown as RoleCapabilityRow[];
    }

    const session = buildStaffSession(
      profile as StaffProfile,
      assignmentRows,
      capabilityRows,
      branchRows,
    );

    return jsonResponse(
      {
        data: {
          user: { id: authData.user.id, email: authData.user.email ?? null },
          ...session,
        },
        request_id: id,
      },
      200,
      origin,
      id,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    // Log only an internal error code and correlation ID. Do not log tokens or PII.
    console.error("staff-session failure", { request_id: id, code });
    return errorResponse(
      "STAFF_SESSION_UNAVAILABLE",
      "Unable to retrieve the staff session.",
      500,
      origin,
      id,
    );
  }
});
