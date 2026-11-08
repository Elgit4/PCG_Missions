import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  isUuid,
  parseContactCreate,
  parseContactPatch,
} from "./validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const allowedOrigins = new Set(
  (Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const CONTACT_COLUMNS =
  "id,branch_id,first_name,last_name,preferred_name,phone_e164,phone_display,email_normalized,age_range,preferred_language,contact_status,created_by,created_at,updated_at";

type ScopeMode = "branch" | "team" | "assigned" | "self" | "event" | "explicit_share" | "oversight";

type ContactRow = Record<string, unknown> & { id: string };

function redactContactIdentity<T extends ContactRow>(row: T, canRead: boolean): T {
  if (canRead) return row;
  return {
    ...row,
    phone_e164: null,
    phone_display: null,
    email_normalized: null,
    identity_redacted: true,
  } as T;
}

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
    headers.set("Access-Control-Allow-Headers", "Authorization, apikey, Content-Type");
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

function getBearer(request: Request): string | null {
  const value = request.headers.get("Authorization");
  const match = value ? /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(value.trim()) : null;
  return match?.[1] ?? null;
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("CONTENT_TYPE_REQUIRED");
  }
  return await request.json();
}

async function resolveStaff(
  token: string,
): Promise<
  | { ok: true; actorId: string; profileId: string; service: ReturnType<typeof createClient> }
  | { ok: false; status: number; code: string; message: string }
> {
  const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Application-Name": "pcg-missions-staff-operations" } },
  });

  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth.user) {
    return { ok: false, status: 401, code: "INVALID_SESSION", message: "A valid staff session is required." };
  }

  const { data: profile, error } = await service
    .from("staff_profile")
    .select("id,account_status")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (error) throw new Error("STAFF_PROFILE_LOOKUP_FAILED");
  if (!profile) {
    return { ok: false, status: 403, code: "STAFF_PROFILE_NOT_FOUND", message: "This account is not provisioned as staff." };
  }
  if (profile.account_status !== "active") {
    return { ok: false, status: 403, code: "STAFF_ACCOUNT_NOT_ACTIVE", message: "This staff account is not active." };
  }

  return { ok: true, actorId: auth.user.id, profileId: profile.id, service };
}

async function resolveScopes(
  service: ReturnType<typeof createClient>,
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
    .is("ends_at", null)
    .is("revoked_at", null);
  if (assignmentError) throw new Error("ROLE_ASSIGNMENT_LOOKUP_FAILED");
  const roleIds = [...new Set((assignments ?? []).map((item: { role_id: string }) => item.role_id))];
  if (roleIds.length === 0) return [];

  const { data: grants, error: grantError } = await service
    .from("role_capability")
    .select("scope_mode,capability:capability!inner(code,is_active)")
    .in("role_id", roleIds)
    .eq("capability.code", capabilityCode);
  if (grantError) throw new Error("CAPABILITY_LOOKUP_FAILED");

  const scopes = (grants ?? []).flatMap((grant: {
    scope_mode: ScopeMode;
    capability?: { code: string; is_active: boolean } | Array<{ code: string; is_active: boolean }> | null;
  }) => {
    const capability = Array.isArray(grant.capability) ? grant.capability[0] : grant.capability;
    return capability?.is_active ? [grant.scope_mode] : [];
  });
  return [...new Set(scopes)];
}

async function visibleContactIds(
  service: ReturnType<typeof createClient>,
  branchId: string,
  actorId: string,
  profileId: string,
  scopes: ScopeMode[],
): Promise<string[] | null> {
  if (scopes.includes("branch")) return null;

  const ids = new Set<string>();
  if (scopes.includes("assigned")) {
    const { data, error } = await service
      .from("contact_assignment")
      .select("contact_id")
      .eq("branch_id", branchId)
      .eq("assignee_user_id", actorId)
      .lte("starts_at", new Date().toISOString())
      .is("ends_at", null);
    if (error) throw new Error("CONTACT_ASSIGNMENT_LOOKUP_FAILED");
    for (const item of data ?? []) ids.add(item.contact_id);
  }

  if (scopes.includes("team")) {
    const { data: memberships, error: membershipError } = await service
      .from("staff_team_membership")
      .select("team_id,team:team!inner(is_active)")
      .eq("staff_profile_id", profileId)
      .eq("branch_id", branchId)
      .lte("starts_at", new Date().toISOString())
      .is("ends_at", null)
      .is("revoked_at", null)
      .eq("team.is_active", true);
    if (membershipError) throw new Error("TEAM_MEMBERSHIP_LOOKUP_FAILED");
    const teamIds = [...new Set((memberships ?? []).map((item: { team_id: string }) => item.team_id))];
    if (teamIds.length > 0) {
      const { data, error } = await service
        .from("contact_assignment")
        .select("contact_id")
        .eq("branch_id", branchId)
        .in("team_id", teamIds)
        .lte("starts_at", new Date().toISOString())
        .is("ends_at", null);
      if (error) throw new Error("TEAM_CONTACT_LOOKUP_FAILED");
      for (const item of data ?? []) ids.add(item.contact_id);
    }
  }

  if (scopes.includes("self")) {
    const { data, error } = await service
      .from("contact")
      .select("id")
      .eq("branch_id", branchId)
      .eq("created_by", actorId);
    if (error) throw new Error("OWN_CONTACT_LOOKUP_FAILED");
    for (const item of data ?? []) ids.add(item.id);
  }

  return [...ids];
}

function validateOptionalQuery(url: URL): { limit: number; offset: number; search: string } | null {
  const allowed = new Set(["branch_id", "limit", "offset", "search"]);
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  const limit = Number(url.searchParams.get("limit") ?? "25");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const search = (url.searchParams.get("search") ?? "").trim();
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return null;
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) return null;
  if (search.length > 80) return null;
  return { limit, offset, search };
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
        "Access-Control-Allow-Headers": "Authorization, apikey, Content-Type, x-client-info",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail("SERVICE_NOT_CONFIGURED", "Staff operations service is not configured.", 503, origin, id);
  }

  const token = getBearer(request);
  if (!token) return fail("AUTH_REQUIRED", "A valid staff session is required.", 401, origin, id);

  try {
    const auth = await resolveStaff(token);
    if (!auth.ok) return fail(auth.code, auth.message, auth.status, origin, id);

    const path = new URL(request.url).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const last = path[path.length - 1] ?? "";
    const previous = path[path.length - 2] ?? "";
    const url = new URL(request.url);

    if (request.method === "GET" && last === "contacts") {
      const params = validateOptionalQuery(url);
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (!params || !isUuid(branchId)) {
        return fail("INVALID_QUERY", "Invalid contact query parameters.", 400, origin, id);
      }
      const scopes = await resolveScopes(auth.service, auth.profileId, branchId, "contact.read.scoped");
      if (scopes.length === 0) {
        return fail("FORBIDDEN", "You do not have permission to read contacts in this branch.", 403, origin, id);
      }
      const ids = await visibleContactIds(auth.service, branchId, auth.actorId, auth.profileId, scopes);
      const identityScopes = await resolveScopes(auth.service, auth.profileId, branchId, "contact.identity.read.scoped");
      const identityIds = await visibleContactIds(auth.service, branchId, auth.actorId, auth.profileId, identityScopes);
      if (ids !== null && ids.length === 0) {
        return response({ data: [], page: { limit: params.limit, offset: params.offset }, request_id: id }, 200, origin, id);
      }

      let query = auth.service
        .from("contact")
        .select(CONTACT_COLUMNS, { count: "exact" })
        .eq("branch_id", branchId)
        .neq("contact_status", "merged")
        .order("created_at", { ascending: false })
        .range(params.offset, params.offset + params.limit - 1);
      if (ids !== null) query = query.in("id", ids);
      if (params.search) {
        const safeSearch = params.search.replace(/[%,()_]/g, " ").trim();
        if (safeSearch) query = query.ilike("first_name", `%${safeSearch}%`);
      }
      const { data, error, count } = await query;
      if (error) throw new Error("CONTACT_LIST_FAILED");
      return response({
        data: (data ?? []).map((row: ContactRow) =>
          redactContactIdentity(row, identityIds === null || identityIds.includes(row.id))
        ),
        page: { limit: params.limit, offset: params.offset, total: count ?? 0 },
        request_id: id,
      }, 200, origin, id);
    }

    if (request.method === "GET" && previous === "contacts" && isUuid(last)) {
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (!isUuid(branchId)) return fail("INVALID_QUERY", "Invalid branch_id.", 400, origin, id);
      const scopes = await resolveScopes(auth.service, auth.profileId, branchId, "contact.read.scoped");
      if (scopes.length === 0) return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      const ids = await visibleContactIds(auth.service, branchId, auth.actorId, auth.profileId, scopes);
      if (ids !== null && !ids.includes(last)) return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      const identityScopes = await resolveScopes(auth.service, auth.profileId, branchId, "contact.identity.read.scoped");
      const identityIds = await visibleContactIds(auth.service, branchId, auth.actorId, auth.profileId, identityScopes);

      const { data, error } = await auth.service
        .from("contact")
        .select(CONTACT_COLUMNS)
        .eq("id", last)
        .eq("branch_id", branchId)
        .neq("contact_status", "merged")
        .maybeSingle();
      if (error) throw new Error("CONTACT_DETAIL_FAILED");
      if (!data) return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      return response({ data: redactContactIdentity(data as ContactRow, identityIds === null || identityIds.includes(last)), request_id: id }, 200, origin, id);
    }

    if (request.method === "POST" && last === "contacts") {
      let raw: unknown;
      try {
        raw = await readJson(request);
      } catch (error) {
        return fail(
          error instanceof Error && error.message === "CONTENT_TYPE_REQUIRED" ? "CONTENT_TYPE_REQUIRED" : "INVALID_JSON",
          "A valid JSON request body is required.",
          400,
          origin,
          id,
        );
      }
      const parsed = parseContactCreate(raw);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);

      const input = parsed.value;
      const scopes = await resolveScopes(auth.service, auth.profileId, input.branch_id, "contact.capture.create");
      if (
        scopes.length === 0 ||
        !scopes.some((scope) => scope === "branch" || scope === "assigned" || scope === "team")
      ) {
        return fail("FORBIDDEN", "You cannot capture contacts in this branch.", 403, origin, id);
      }

      if (
        input.team_id === null &&
        scopes.includes("team") &&
        !scopes.includes("branch") &&
        !scopes.includes("assigned")
      ) {
        return fail("TEAM_REQUIRED", "Choose one of your active teams for this contact.", 422, origin, id);
      }
      if (
        input.phone_e164 !== null || input.phone_display !== null ||
        input.email_normalized !== null
      ) {
        const identityCaptureScopes = await resolveScopes(
          auth.service,
          auth.profileId,
          input.branch_id,
          "contact.identity.capture",
        );
        if (identityCaptureScopes.length === 0) {
          return fail(
            "IDENTITY_CAPTURE_NOT_APPROVED",
            "Phone and email capture are not enabled for this account.",
            403,
            origin,
            id,
          );
        }
      }

      const { data, error } = await auth.service.rpc("cmi_create_contact", {
        p_actor_auth_user_id: auth.actorId,
        p_branch_id: input.branch_id,
        p_client_request_id: input.client_request_id,
        p_first_name: input.first_name,
        p_last_name: input.last_name,
        p_preferred_name: input.preferred_name,
        p_phone_e164: input.phone_e164,
        p_phone_display: input.phone_display,
        p_email_normalized: input.email_normalized,
        p_age_range: input.age_range,
        p_preferred_language: input.preferred_language,
        p_service_area_id: input.service_area_id,
        p_team_id: input.team_id,
        p_source_metadata: input.source_metadata,
      });
      if (error) {
        if (error.code === "42501") return fail("FORBIDDEN", "Contact capture is not authorized.", 403, origin, id);
        if (error.code === "23505") return fail("IDEMPOTENCY_CONFLICT", "This capture request has already been used.", 409, origin, id);
        if (error.code === "22023") return fail("VALIDATION_ERROR", "The contact data is invalid.", 422, origin, id);
        throw new Error("CONTACT_CREATE_FAILED");
      }
      const result = data as { contact?: unknown; replayed?: boolean } | null;
      const identityReadScopes = await resolveScopes(
        auth.service,
        auth.profileId,
        input.branch_id,
        "contact.identity.read.scoped",
      );
      const identityReadIds = await visibleContactIds(
        auth.service,
        input.branch_id,
        auth.actorId,
        auth.profileId,
        identityReadScopes,
      );
      const resultContact = result?.contact && typeof result.contact === "object"
        ? redactContactIdentity(result.contact as ContactRow, identityReadIds === null || identityReadIds.includes(String((result.contact as Record<string, unknown>).id)))
        : null;
      return response({
        data: resultContact,
        replayed: result?.replayed ?? false,
        request_id: id,
      }, result?.replayed ? 200 : 201, origin, id);
    }

    if (request.method === "PATCH" && previous === "contacts" && isUuid(last)) {
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (!isUuid(branchId)) return fail("INVALID_QUERY", "Invalid branch_id.", 400, origin, id);
      let raw: unknown;
      try {
        raw = await readJson(request);
      } catch {
        return fail("INVALID_JSON", "A valid JSON request body is required.", 400, origin, id);
      }
      const parsed = parseContactPatch(raw);
      if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      if (
        "phone_e164" in parsed.value ||
        "phone_display" in parsed.value ||
        "email_normalized" in parsed.value
      ) {
        const identityUpdateScopes = await resolveScopes(
          auth.service,
          auth.profileId,
          branchId,
          "contact.identity.update.scoped",
        );
        if (identityUpdateScopes.length === 0) {
          return fail(
            "IDENTITY_UPDATE_NOT_APPROVED",
            "Phone and email updates are not enabled for this account.",
            403,
            origin,
            id,
          );
        }
      }

      const scopes = await resolveScopes(auth.service, auth.profileId, branchId, "contact.update.scoped");
      if (scopes.length === 0) return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      const ids = await visibleContactIds(auth.service, branchId, auth.actorId, auth.profileId, scopes);
      if (ids !== null && !ids.includes(last)) return fail("NOT_FOUND", "Contact not found.", 404, origin, id);

      const { data, error } = await auth.service
        .from("contact")
        .update(parsed.value)
        .eq("id", last)
        .eq("branch_id", branchId)
        .neq("contact_status", "merged")
        .select(CONTACT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error("CONTACT_UPDATE_FAILED");
      if (!data) return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      const identityReadScopes = await resolveScopes(auth.service, auth.profileId, branchId, "contact.identity.read.scoped");
      const identityReadIds = await visibleContactIds(auth.service, branchId, auth.actorId, auth.profileId, identityReadScopes);
      return response({
        data: redactContactIdentity(data as ContactRow, identityReadIds === null || identityReadIds.includes(last)),
        request_id: id,
      }, 200, origin, id);
    }

    return fail("NOT_FOUND", "The requested staff operation does not exist.", 404, origin, id);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("staff-operations failure", { request_id: id, code });
    return fail("STAFF_OPERATION_FAILED", "Unable to complete the staff operation.", 500, origin, id);
  }
});
