import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  notificationBranchAccess,
  notificationPageLimit,
  notificationProfileDenial,
  notificationReadScope,
  notificationRecipientScope,
} from "./access.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const allowedOrigins = new Set([
  "https://pcg-missions.vercel.app",
  ...(Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean),
]);

type ServiceClient = ReturnType<typeof createServiceClient>;
function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Application-Name": "pcg-missions-staff-notifications" },
    },
  });
}
function requestId() {
  return crypto.randomUUID();
}
function bearer(request: Request): string | null {
  const value = request.headers.get("Authorization") ?? "";
  return /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim())?.[1] ?? null;
}
function respond(
  body: unknown,
  status: number,
  origin: string | null,
  id: string,
) {
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
) {
  return respond(
    { error: { code, message }, request_id: id },
    status,
    origin,
    id,
  );
}
async function resolveStaff(token: string): Promise<
  | { ok: true; actorId: string; profileId: string; service: ServiceClient }
  | { ok: false; status: number; code: string; message: string }
> {
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
  const { data: profile, error } = await service.from("staff_profile")
    .select("id,account_status,must_change_password")
    .eq("auth_user_id", auth.user.id).maybeSingle();
  if (error) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
  if (!profile) {
    return {
      ok: false,
      status: 403,
      code: "STAFF_ACCOUNT_NOT_ACTIVE",
      message:
        "Your staff account is not active. Contact an authorised administrator.",
    };
  }
  const profileDenial = notificationProfileDenial(profile);
  if (profileDenial === "not_active") {
    return {
      ok: false,
      status: 403,
      code: "STAFF_ACCOUNT_NOT_ACTIVE",
      message:
        "Your staff account is not active. Contact an authorised administrator.",
    };
  }
  if (profileDenial === "password_change_required") {
    return {
      ok: false,
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Change your temporary password before opening notifications.",
    };
  }
  return { ok: true, actorId: auth.user.id, profileId: profile.id, service };
}
async function hasActiveBranch(
  service: ServiceClient,
  profileId: string,
  branchId: string,
) {
  const { data: branch, error: branchError } = await service.from("branch")
    .select("id,is_active").eq("id", branchId).maybeSingle();
  if (branchError) throw new Error("BRANCH_LOOKUP_FAILED");
  if (!branch?.is_active) return false;
  const now = new Date().toISOString();
  const { data, error } = await service.from("staff_role_assignment")
    .select("id,role:role!inner(is_active)")
    .eq("staff_profile_id", profileId).eq("branch_id", branchId)
    .eq("role.is_active", true).lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`).is("revoked_at", null)
    .limit(1).maybeSingle();
  if (error) throw new Error("BRANCH_ASSIGNMENT_LOOKUP_FAILED");
  return notificationBranchAccess(Boolean(branch?.is_active), Boolean(data));
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
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, apikey, Content-Type, x-client-info",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }
  if (!["GET", "POST"].includes(request.method)) {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed.", 405, origin, id);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Notifications are temporarily unavailable.",
      503,
      origin,
      id,
    );
  }
  const token = bearer(request);
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
    if (!auth.ok) return fail(auth.code, auth.message, auth.status, origin, id);
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branch_id") ??
      (request.method === "POST"
        ? String(
          (await request.clone().json().catch(() => ({}))).branch_id ?? "",
        )
        : "");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(branchId)
    ) {
      return fail(
        "INVALID_BRANCH",
        "Select a valid ministry workspace.",
        400,
        origin,
        id,
      );
    }
    if (!await hasActiveBranch(auth.service, auth.profileId, branchId)) {
      return fail(
        "FORBIDDEN",
        "You no longer have access to this ministry workspace.",
        403,
        origin,
        id,
      );
    }
    if (request.method === "GET") {
      const limit = notificationPageLimit(url.searchParams.get("limit"));
      const [items, unread] = await Promise.all([
        auth.service.from("staff_notification")
          .select(
            "id,category,title,body,target_type,target_id,created_at,read_at",
          )
          .match(notificationRecipientScope(auth.actorId, branchId))
          .order("created_at", { ascending: false }).limit(limit),
        auth.service.from("staff_notification")
          .select("id", { count: "exact", head: true })
          .match(notificationRecipientScope(auth.actorId, branchId))
          .is("read_at", null),
      ]);
      if (items.error || unread.error) {
        throw new Error("NOTIFICATION_LIST_FAILED");
      }
      return respond(
        {
          data: {
            notifications: items.data ?? [],
            unread_count: unread.count ?? 0,
          },
          request_id: id,
        },
        200,
        origin,
        id,
      );
    }
    const path = url.pathname.split("/").filter(Boolean);
    if (path[path.length - 1] === "read-all") {
      const { data, error } = await auth.service.from("staff_notification")
        .update({ read_at: new Date().toISOString() })
        .match(notificationRecipientScope(auth.actorId, branchId))
        .is("read_at", null).select("id");
      if (error) throw new Error("NOTIFICATION_UPDATE_FAILED");
      return respond(
        { data: { updated_count: data?.length ?? 0 }, request_id: id },
        200,
        origin,
        id,
      );
    }
    const notificationId = path[path.length - 1] === "read"
      ? path[path.length - 2]
      : "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(notificationId)
    ) {
      return fail(
        "NOT_FOUND",
        "The requested notification action was not found.",
        404,
        origin,
        id,
      );
    }
    const { data, error } = await auth.service.from("staff_notification")
      .update({ read_at: new Date().toISOString() })
      .match(notificationReadScope(
        auth.actorId,
        branchId,
        notificationId,
      ))
      .is("read_at", null).select("id").maybeSingle();
    if (error) throw new Error("NOTIFICATION_UPDATE_FAILED");
    return respond(
      { data: { updated: Boolean(data) }, request_id: id },
      200,
      origin,
      id,
    );
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "UNKNOWN_ERROR";
    console.error("staff-notifications failure", { request_id: id, code });
    return fail(
      "NOTIFICATIONS_UNAVAILABLE",
      "We couldn't load or update notifications. Please try again.",
      500,
      origin,
      id,
    );
  }
});
