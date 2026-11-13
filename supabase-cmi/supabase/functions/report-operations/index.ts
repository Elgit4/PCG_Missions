import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { readJson } from "../_shared/request_body.ts";
import { isUuid, parseReportCreate, parseReportListQuery, parseReview } from "./validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const allowedOrigins = new Set((Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "https://pcg-missions.vercel.app")
  .split(",").map((item) => item.trim()).filter(Boolean));

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Application-Name": "pcg-missions-report-operations" } },
  });
}
type Service = ReturnType<typeof serviceClient>;
type Scope = "branch" | "team" | "assigned" | "self" | "event" | "explicit_share" | "oversight";
const REPORT_COLUMNS = "id,branch_id,report_type,period_start,period_end,author_profile_id,team_id,event_id,contacts_captured,gospel_presentations,decisions_for_christ,followup_required,followup_completed,visits_completed,calls_completed,events_supported,attendance_count,status,submitted_at,created_at,updated_at";

function response(body: unknown, status: number, origin: string | null, requestId: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Request-Id": requestId, "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, apikey, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(JSON.stringify(body), { status, headers });
}
function fail(code: string, message: string, status: number, origin: string | null, requestId: string) {
  return response({ error: { code, message }, request_id: requestId }, status, origin, requestId);
}
function bearer(request: Request): string | null {
  const value = request.headers.get("Authorization");
  const match = value ? /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim()) : null;
  return match?.[1] ?? null;
}

async function resolveStaff(token: string): Promise<
  | { ok: true; actorId: string; profileId: string; service: Service }
  | { ok: false; status: number; code: string; message: string }
> {
  const authClient = createClient(SUPABASE_URL, PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const service = serviceClient();
  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth.user) return { ok: false, status: 401, code: "INVALID_SESSION", message: "A valid staff session is required." };
  const { data: profile, error } = await service.from("staff_profile")
    .select("id,account_status,must_change_password").eq("auth_user_id", auth.user.id).maybeSingle();
  if (error) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
  if (!profile) return { ok: false, status: 403, code: "STAFF_PROFILE_NOT_FOUND", message: "This account is not provisioned as staff." };
  if (profile.must_change_password) return { ok: false, status: 403, code: "PASSWORD_CHANGE_REQUIRED", message: "Change the temporary password before using staff operations." };
  if (profile.account_status !== "active") return { ok: false, status: 403, code: "STAFF_ACCOUNT_NOT_ACTIVE", message: "This staff account is not active." };
  return { ok: true, actorId: auth.user.id, profileId: profile.id, service };
}

async function scopes(service: Service, profileId: string, branchId: string, capabilityCode: string): Promise<Scope[]> {
  const now = new Date().toISOString();
  const { data: branch, error: branchError } = await service.from("branch").select("id,is_active").eq("id", branchId).maybeSingle();
  if (branchError) throw new Error("BRANCH_LOOKUP_FAILED");
  if (!branch?.is_active) return [];
  const { data: assignments, error: assignmentError } = await service.from("staff_role_assignment")
    .select("role_id,role:role!inner(is_active)").eq("role.is_active", true)
    .eq("staff_profile_id", profileId).eq("branch_id", branchId).lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`).is("revoked_at", null);
  if (assignmentError) throw new Error("ROLE_ASSIGNMENT_LOOKUP_FAILED");
  const roleIds = [...new Set((assignments ?? []).map((row: { role_id: string }) => row.role_id))];
  if (!roleIds.length) return [];
  const { data: grants, error: grantError } = await service.from("role_capability")
    .select("scope_mode,capability:capability!inner(code,is_active)").in("role_id", roleIds)
    .eq("capability.code", capabilityCode);
  if (grantError) throw new Error("CAPABILITY_LOOKUP_FAILED");
  return [...new Set((grants ?? []).flatMap((grant: {
    scope_mode: Scope;
    capability?: { code: string; is_active: boolean } | Array<{ code: string; is_active: boolean }> | null;
  }) => {
    const capability = Array.isArray(grant.capability) ? grant.capability[0] : grant.capability;
    return capability?.is_active ? [grant.scope_mode] : [];
  }))];
}

async function activeTeamIds(service: Service, profileId: string, branchId: string): Promise<string[]> {
  const now = new Date().toISOString();
  const { data, error } = await service.from("staff_team_membership")
    .select("team_id,team:team!inner(is_active)").eq("staff_profile_id", profileId)
    .eq("branch_id", branchId).eq("team.is_active", true).lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`).is("revoked_at", null);
  if (error) throw new Error("TEAM_MEMBERSHIP_LOOKUP_FAILED");
  return [...new Set((data ?? []).map((row: { team_id: string }) => row.team_id))];
}

function readJsonError(error: unknown): { code: string; message: string; status: number } {
  const code = error instanceof Error ? error.message : "INVALID_JSON";
  return {
    code,
    message: code === "CONTENT_TYPE_REQUIRED" ? "Content-Type must be application/json."
      : code === "BODY_TOO_LARGE" ? "Request body is too large." : "A valid JSON request body is required.",
    status: code === "BODY_TOO_LARGE" ? 413 : 400,
  };
}

Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return fail("ORIGIN_NOT_ALLOWED", "Origin not allowed.", 403, null, requestId);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, apikey, Content-Type, x-client-info",
      "Access-Control-Max-Age": "600", "Vary": "Origin",
    } });
  }
  if (!["GET", "POST"].includes(request.method)) return fail("METHOD_NOT_ALLOWED", "Method not allowed.", 405, origin, requestId);
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY) return fail("SERVICE_NOT_CONFIGURED", "Report operations service is not configured.", 503, origin, requestId);
  const token = bearer(request);
  if (!token) return fail("AUTH_REQUIRED", "A valid staff session is required.", 401, origin, requestId);

  try {
    const auth = await resolveStaff(token);
    if (!auth.ok) return fail(auth.code, auth.message, auth.status, origin, requestId);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const last = path[path.length - 1] ?? "";
    const previous = path[path.length - 2] ?? "";
    const collection = previous === "report-operations" && last === "reports";
    const item = path[path.length - 3] === "report-operations" && previous === "reports" && isUuid(last);
    const review = path[path.length - 4] === "report-operations" && path[path.length - 3] === "reports" && isUuid(path[path.length - 2]) && last === "review";

    if (request.method === "GET" && collection) {
      const parsed = parseReportListQuery(url);
      if (!parsed.ok) return fail("INVALID_QUERY", parsed.error, 400, origin, requestId);
      const { branch_id, report_type, status, limit, offset } = parsed.value;
      const ownScopes = await scopes(auth.service, auth.profileId, branch_id, "report.read.own");
      const branchReview = await scopes(auth.service, auth.profileId, branch_id, "report.review.branch");
      const teamReview = await scopes(auth.service, auth.profileId, branch_id, "report.review.team");
      const ids = new Set<string>();
      const filters = (query: any) => {
        let result = query.eq("branch_id", branch_id);
        if (report_type) result = result.eq("report_type", report_type);
        if (status) result = result.eq("status", status);
        return result;
      };
      let rows: Record<string, unknown>[] = [];
      if (branchReview.includes("branch")) {
        const { data, error } = await filters(auth.service.from("ministry_report").select(REPORT_COLUMNS))
          .order("period_start", { ascending: false }).limit(250);
        if (error) throw new Error("REPORT_BRANCH_LIST_FAILED");
        rows = data ?? [];
      } else {
        if (ownScopes.includes("self")) {
          const { data, error } = await filters(auth.service.from("ministry_report").select(REPORT_COLUMNS))
            .eq("author_profile_id", auth.profileId).order("period_start", { ascending: false }).limit(250);
          if (error) throw new Error("REPORT_OWN_LIST_FAILED");
          rows.push(...(data ?? []));
        }
        if (teamReview.includes("team")) {
          const teamIds = await activeTeamIds(auth.service, auth.profileId, branch_id);
          if (teamIds.length) {
            const { data, error } = await filters(auth.service.from("ministry_report").select(REPORT_COLUMNS))
              .in("team_id", teamIds).order("period_start", { ascending: false }).limit(250);
            if (error) throw new Error("REPORT_TEAM_LIST_FAILED");
            rows.push(...(data ?? []));
          }
        }
      }
      const unique = [...new Map(rows.map((row) => [String(row.id), row])).values()]
        .sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)));
      if (!unique.length && !ownScopes.includes("self") && !branchReview.includes("branch") && !teamReview.includes("team")) {
        return fail("FORBIDDEN", "The operation is not permitted.", 403, origin, requestId);
      }
      return response({ data: unique.slice(offset, offset + limit), total: unique.length, request_id: requestId }, 200, origin, requestId);
    }

    if (request.method === "GET" && item) {
      const branchValues = url.searchParams.getAll("branch_id");
      if (branchValues.length !== 1 || [...url.searchParams.keys()].some((key) => key !== "branch_id") || !isUuid(branchValues[0])) {
        return fail("INVALID_QUERY", "A single valid branch_id is required.", 400, origin, requestId);
      }
      const branchId = branchValues[0];
      const { data: report, error } = await auth.service.from("ministry_report")
        .select(REPORT_COLUMNS).eq("id", last).eq("branch_id", branchId).maybeSingle();
      if (error) throw new Error("REPORT_DETAIL_FAILED");
      if (!report) return fail("NOT_FOUND", "Report not found.", 404, origin, requestId);
      const own = report.author_profile_id === auth.profileId &&
        (await scopes(auth.service, auth.profileId, branchId, "report.read.own")).includes("self");
      const branchRead = (await scopes(auth.service, auth.profileId, branchId, "report.review.branch")).includes("branch");
      const teamIds = (await scopes(auth.service, auth.profileId, branchId, "report.review.team")).includes("team")
        ? await activeTeamIds(auth.service, auth.profileId, branchId) : [];
      if (!own && !branchRead && !(report.team_id && teamIds.includes(report.team_id))) {
        return fail("NOT_FOUND", "Report not found.", 404, origin, requestId);
      }
      const { data: history, error: historyError } = await auth.service.from("report_review_event")
        .select("id,reviewer_profile_id,decision,comment,created_at").eq("report_id", last)
        .order("created_at", { ascending: true });
      if (historyError) throw new Error("REPORT_REVIEW_HISTORY_FAILED");
      return response({ data: { ...report, review_history: history ?? [] }, request_id: requestId }, 200, origin, requestId);
    }

    if (request.method === "POST" && collection) {
      let body: unknown;
      try { body = await readJson(request); } catch (error) {
        const parsed = readJsonError(error);
        return fail(parsed.code, parsed.message, parsed.status, origin, requestId);
      }
      const parsed = parseReportCreate(body);
      if (!parsed.ok) return fail("INVALID_REPORT", parsed.error, 400, origin, requestId);
      const { value } = parsed;
      if (!(await scopes(auth.service, auth.profileId, value.branch_id, "report.submit.own")).includes("self")) {
        return fail("FORBIDDEN", "The operation is not permitted.", 403, origin, requestId);
      }
      if (value.team_id) {
        const memberships = await activeTeamIds(auth.service, auth.profileId, value.branch_id);
        if (!memberships.includes(value.team_id)) return fail("TEAM_SCOPE_REQUIRED", "Select a team you actively belong to.", 403, origin, requestId);
      }
      const now = new Date().toISOString();
      const { data, error } = await auth.service.from("ministry_report").insert({
        ...value, author_profile_id: auth.profileId, status: "submitted", submitted_at: now,
      }).select(REPORT_COLUMNS).single();
      if (error) {
        const message = error.message ?? "";
        if (message.includes("REPORT_TEAM_BRANCH_MISMATCH")) return fail("INVALID_TEAM_SCOPE", "The selected team does not belong to this branch.", 400, origin, requestId);
        if (message.includes("REPORT_EVENT_BRANCH_MISMATCH")) return fail("INVALID_EVENT_SCOPE", "The selected event does not belong to this branch.", 400, origin, requestId);
        throw new Error("REPORT_CREATE_FAILED");
      }
      return response({ data, request_id: requestId }, 201, origin, requestId);
    }

    if (request.method === "POST" && review) {
      if ([...url.searchParams.keys()].length) return fail("INVALID_QUERY", "Review requests do not accept query parameters.", 400, origin, requestId);
      let body: unknown;
      try { body = await readJson(request); } catch (error) {
        const parsed = readJsonError(error);
        return fail(parsed.code, parsed.message, parsed.status, origin, requestId);
      }
      const parsed = parseReview(body);
      if (!parsed.ok) return fail("INVALID_REVIEW", parsed.error, 400, origin, requestId);
      const reportId = path[path.length - 2];
      const { data: report, error } = await auth.service.from("ministry_report")
        .select("id,branch_id,author_profile_id,team_id,status").eq("id", reportId).maybeSingle();
      if (error) throw new Error("REPORT_REVIEW_LOOKUP_FAILED");
      if (!report) return fail("NOT_FOUND", "Report not found.", 404, origin, requestId);
      if (report.author_profile_id === auth.profileId) return fail("SELF_REVIEW_FORBIDDEN", "You cannot review your own report.", 403, origin, requestId);
      const branchReview = (await scopes(auth.service, auth.profileId, report.branch_id, "report.review.branch")).includes("branch");
      const teamReview = (await scopes(auth.service, auth.profileId, report.branch_id, "report.review.team")).includes("team");
      let allowed = branchReview;
      if (!allowed && teamReview && report.team_id) {
        allowed = (await activeTeamIds(auth.service, auth.profileId, report.branch_id)).includes(report.team_id);
      }
      if (!allowed) return fail("FORBIDDEN", "The operation is not permitted.", 403, origin, requestId);
      const { data: reviewed, error: reviewError } = await auth.service.rpc("cmi_review_ministry_report", {
        p_report_id: reportId, p_reviewer_profile_id: auth.profileId,
        p_decision: parsed.value.decision, p_comment: parsed.value.comment,
      });
      if (reviewError) {
        const message = reviewError.message ?? "";
        if (message.includes("REPORT_NOT_SUBMITTED")) return fail("REPORT_NOT_SUBMITTED", "Only submitted reports can be reviewed.", 409, origin, requestId);
        if (message.includes("REPORT_SELF_REVIEW_FORBIDDEN")) return fail("SELF_REVIEW_FORBIDDEN", "You cannot review your own report.", 403, origin, requestId);
        throw new Error("REPORT_REVIEW_FAILED");
      }
      const { data: history, error: historyError } = await auth.service.from("report_review_event")
        .select("id,reviewer_profile_id,decision,comment,created_at").eq("report_id", reportId)
        .order("created_at", { ascending: true });
      if (historyError) throw new Error("REPORT_REVIEW_HISTORY_FAILED");
      return response({ data: { report: reviewed, review_history: history ?? [] }, request_id: requestId }, 200, origin, requestId);
    }

    return fail("NOT_FOUND", "The requested report operation does not exist.", 404, origin, requestId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("report-operations failure", { request_id: requestId, code });
    return fail("REPORT_OPERATION_FAILED", "Unable to complete the report operation.", 500, origin, requestId);
  }
});
