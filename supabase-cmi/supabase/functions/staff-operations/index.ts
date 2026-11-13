import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  type CanonicalJson,
  createRequestDigest,
} from "../_shared/idempotency.ts";
import {
  canReadContactNote,
  type ContactNoteVisibilityRow,
  deriveContactNotePlacement,
  isUuid,
  parseContactCreate,
  parseContactInteractionCreate,
  parseContactNoteCreate,
  parseContactPatch,
  parseFollowupTaskAssignment,
  parseFollowupTaskCreate,
  parseFollowupTaskPatch,
  parseStaffDirectoryQuery,
  projectStaffDirectoryRows,
} from "./validation.ts";
import { readJson } from "../_shared/request_body.ts";
import {
  createAllowedOrigins,
  isAllowedOrigin,
} from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CONTACT_IDEMPOTENCY_HMAC_KEY =
  Deno.env.get("CMI_CONTACT_IDEMPOTENCY_HMAC_KEY") ?? "";
const CONTACT_IDEMPOTENCY_KEY_VERSION = Number(
  Deno.env.get("CMI_CONTACT_IDEMPOTENCY_KEY_VERSION") ?? "1",
);
const FOLLOWUP_IDEMPOTENCY_HMAC_KEY =
  Deno.env.get("CMI_FOLLOWUP_IDEMPOTENCY_HMAC_KEY") ?? "";
const FOLLOWUP_IDEMPOTENCY_KEY_VERSION = Number(
  Deno.env.get("CMI_FOLLOWUP_IDEMPOTENCY_KEY_VERSION") ?? "1",
);
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
      headers: { "X-Application-Name": "pcg-missions-staff-operations" },
    },
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

const CONTACT_COLUMNS =
  "id,branch_id,first_name,last_name,preferred_name,phone_e164,phone_display,email_normalized,age_range,preferred_language,contact_status,created_by,created_at,updated_at";

type ScopeMode =
  | "branch"
  | "team"
  | "assigned"
  | "self"
  | "event"
  | "explicit_share"
  | "oversight";

type ContactRow = Record<string, unknown> & { id: string };

function redactContactIdentity<T extends ContactRow>(
  row: T,
  canRead: boolean,
): T {
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

async function resolveStaff(
  token: string,
): Promise<
  | {
    ok: true;
    actorId: string;
    profileId: string;
    service: ServiceClient;
  }
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

  return { ok: true, actorId: auth.user.id, profileId: profile.id, service };
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

async function visibleContactIds(
  service: ServiceClient,
  branchId: string,
  actorId: string,
  profileId: string,
  scopes: ScopeMode[],
): Promise<string[] | null> {
  if (scopes.includes("branch")) return null;
  const now = new Date().toISOString();

  const ids = new Set<string>();
  if (scopes.includes("assigned")) {
    const { data, error } = await service
      .from("contact_assignment")
      .select("contact_id")
      .eq("branch_id", branchId)
      .eq("assignee_user_id", actorId)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`);
    if (error) throw new Error("CONTACT_ASSIGNMENT_LOOKUP_FAILED");
    for (const item of data ?? []) ids.add(item.contact_id);
  }

  if (scopes.includes("team")) {
    const { data: memberships, error: membershipError } = await service
      .from("staff_team_membership")
      .select("team_id,team:team!inner(is_active)")
      .eq("staff_profile_id", profileId)
      .eq("branch_id", branchId)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .is("revoked_at", null)
      .eq("team.is_active", true);
    if (membershipError) throw new Error("TEAM_MEMBERSHIP_LOOKUP_FAILED");
    const teamIds = [
      ...new Set(
        (memberships ?? []).map((item: { team_id: string }) => item.team_id),
      ),
    ];
    if (teamIds.length > 0) {
      const { data, error } = await service
        .from("contact_assignment")
        .select("contact_id")
        .eq("branch_id", branchId)
        .in("team_id", teamIds)
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gt.${now}`);
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

// Returns only active team memberships for this authenticated staff profile.
async function activeContactTeamIds(
  service: ServiceClient,
  profileId: string,
  branchId: string,
): Promise<string[]> {
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("staff_team_membership")
    .select("team_id,team:team!inner(is_active)")
    .eq("staff_profile_id", profileId)
    .eq("branch_id", branchId)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .is("revoked_at", null)
    .eq("team.is_active", true);
  if (error) throw new Error("CONTACT_NOTE_TEAM_MEMBERSHIP_LOOKUP_FAILED");
  return [
    ...new Set((data ?? []).map((row: { team_id: string }) => row.team_id)),
  ];
}

// Returns teams with a current assignment to the selected contact.
async function assignedContactTeamIds(
  service: ServiceClient,
  contactId: string,
  branchId: string,
): Promise<string[]> {
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("contact_assignment")
    .select("team_id")
    .eq("contact_id", contactId)
    .eq("branch_id", branchId)
    .not("team_id", "is", null)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`);
  if (error) throw new Error("CONTACT_NOTE_ASSIGNMENT_LOOKUP_FAILED");
  return [
    ...new Set(
      (data ?? []).flatMap((row: { team_id: string | null }) =>
        row.team_id ? [row.team_id] : []
      ),
    ),
  ];
}

async function visibleFollowupTaskIds(
  service: ServiceClient,
  branchId: string,
  actorId: string,
  profileId: string,
  scopes: ScopeMode[],
): Promise<string[] | null> {
  if (scopes.includes("branch")) return null;
  const ids = new Set<string>();

  if (scopes.includes("assigned")) {
    const { data, error } = await service
      .from("followup_task")
      .select("id")
      .eq("branch_id", branchId)
      .eq("assignee_user_id", actorId);
    if (error) throw new Error("FOLLOWUP_ASSIGNED_TASK_LOOKUP_FAILED");
    for (const item of data ?? []) ids.add(item.id);
  }

  if (scopes.includes("team")) {
    const now = new Date().toISOString();
    const { data: memberships, error: membershipError } = await service
      .from("staff_team_membership")
      .select("team_id,team:team!inner(is_active)")
      .eq("staff_profile_id", profileId)
      .eq("branch_id", branchId)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .is("revoked_at", null)
      .eq("team.is_active", true);
    if (membershipError) {
      throw new Error("FOLLOWUP_TEAM_MEMBERSHIP_LOOKUP_FAILED");
    }
    const teamIds = [
      ...new Set(
        (memberships ?? []).map((item: { team_id: string }) => item.team_id),
      ),
    ];
    if (teamIds.length > 0) {
      const { data, error } = await service
        .from("followup_task")
        .select("id")
        .eq("branch_id", branchId)
        .in("team_id", teamIds);
      if (error) throw new Error("FOLLOWUP_TEAM_TASK_LOOKUP_FAILED");
      for (const item of data ?? []) ids.add(item.id);
    }
  }

  if (scopes.includes("self")) {
    const { data, error } = await service
      .from("followup_task")
      .select("id")
      .eq("branch_id", branchId)
      .eq("created_by", actorId);
    if (error) throw new Error("FOLLOWUP_SELF_TASK_LOOKUP_FAILED");
    for (const item of data ?? []) ids.add(item.id);
  }

  return [...ids];
}

function validateFollowupTaskQuery(
  url: URL,
): { limit: number; offset: number; status: string | null } | null {
  const allowed = new Set(["branch_id", "limit", "offset", "status"]);
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  const limit = Number(url.searchParams.get("limit") ?? "25");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const status = url.searchParams.get("status");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return null;
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) return null;
  if (
    status !== null &&
    !["open", "in_progress", "completed", "cancelled"].includes(status)
  ) return null;
  return { limit, offset, status };
}

function validateOptionalQuery(
  url: URL,
): { limit: number; offset: number; search: string } | null {
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

  if (!isAllowedOrigin(origin, allowedOrigins)) {
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLIC_KEY) {
    return fail(
      "SERVICE_NOT_CONFIGURED",
      "Staff operations service is not configured.",
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
    if (!auth.ok) return fail(auth.code, auth.message, auth.status, origin, id);

    const path = new URL(request.url).pathname.replace(/\/+$/, "").split("/")
      .filter(Boolean);
    const last = path[path.length - 1] ?? "";
    const previous = path[path.length - 2] ?? "";
    const url = new URL(request.url);

    const isFollowupTaskCollection = previous === "followup" &&
      last === "tasks";
    const isFollowupTaskItem = previous === "tasks" &&
      path[path.length - 3] === "followup" &&
      isUuid(last);
    const reassignmentTaskId = path[path.length - 2] ?? "";
    const isFollowupTaskReassign = last === "reassign" &&
      path[path.length - 3] === "tasks" &&
      path[path.length - 4] === "followup" &&
      isUuid(reassignmentTaskId);
    const isStaffDirectoryCollection = previous === "staff-operations" &&
      last === "staff";
    const contactRecordId = path[path.length - 2] ?? "";
    const isContactNotesCollection = path[path.length - 3] === "contacts" &&
      last === "notes" && isUuid(contactRecordId);
    const isContactInteractionsCollection =
      path[path.length - 3] === "contacts" &&
      last === "interactions" && isUuid(contactRecordId);

    if (request.method === "GET" && isStaffDirectoryCollection) {
      const parsed = parseStaffDirectoryQuery(url);
      if (!parsed.ok) {
        return fail("INVALID_QUERY", parsed.error, 400, origin, id);
      }
      const { branch_id, limit, offset, search } = parsed.value;
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branch_id,
        "staff.directory.read",
      );
      // The directory is deliberately branch-only. Team/event/self scopes do
      // not imply permission to enumerate staff across a wider workspace.
      if (!scopes.includes("branch")) {
        return fail(
          "FORBIDDEN",
          "The operation is not permitted.",
          403,
          origin,
          id,
        );
      }

      const now = new Date().toISOString();
      let query = auth.service
        .from("staff_profile")
        .select(
          "id,full_name,account_status,staff_role_assignment!staff_role_assignment_staff_profile_id_fkey!inner(role:role!inner(code,name,is_active))",
          { count: "exact" },
        )
        .in("account_status", ["active", "inactive"])
        .eq("staff_role_assignment.branch_id", branch_id)
        .lte("staff_role_assignment.starts_at", now)
        .or(
          `ends_at.is.null,ends_at.gt.${now}`,
          { referencedTable: "staff_role_assignment" },
        )
        .is("staff_role_assignment.revoked_at", null)
        .eq("staff_role_assignment.role.is_active", true);

      if (search) {
        const safeSearch = search.replace(
          /[\\%_]/g,
          (character) => "\\" + character,
        );
        query = query.ilike("full_name", "%" + safeSearch + "%");
      }

      const { data, error, count } = await query
        .order("full_name", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw new Error("STAFF_DIRECTORY_LOOKUP_FAILED");

      const members = projectStaffDirectoryRows(data ?? []);
      return response(
        {
          data: members,
          total: count ?? members.length,
          limit,
          offset,
          request_id: id,
        },
        200,
        origin,
        id,
      );
    }

    if (request.method === "GET" && isFollowupTaskCollection) {
      const params = validateFollowupTaskQuery(url);
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (!params || !isUuid(branchId)) {
        return fail(
          "INVALID_QUERY",
          "Invalid follow-up task query parameters.",
          400,
          origin,
          id,
        );
      }
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "followup.task.read.scoped",
      );
      if (scopes.length === 0) {
        return fail(
          "FORBIDDEN",
          "You do not have permission to read follow-up tasks in this branch.",
          403,
          origin,
          id,
        );
      }
      const ids = await visibleFollowupTaskIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        scopes,
      );
      if (ids !== null && ids.length === 0) {
        return response(
          {
            data: [],
            page: { limit: params.limit, offset: params.offset, total: 0 },
            request_id: id,
          },
          200,
          origin,
          id,
        );
      }

      let query = auth.service
        .from("followup_task")
        .select(
          "id,branch_id,contact_id,list_id,assignee_user_id,team_id,priority,due_at,status,task_note,created_by,completed_at,created_at,updated_at",
          { count: "exact" },
        )
        .eq("branch_id", branchId)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(params.offset, params.offset + params.limit - 1);
      if (ids !== null) query = query.in("id", ids);
      if (params.status !== null) query = query.eq("status", params.status);
      const { data, error, count } = await query;
      if (error) throw new Error("FOLLOWUP_TASK_LIST_FAILED");
      return response(
        {
          data: data ?? [],
          page: {
            limit: params.limit,
            offset: params.offset,
            total: count ?? 0,
          },
          request_id: id,
        },
        200,
        origin,
        id,
      );
    }

    if (
      request.method === "GET" &&
      isFollowupTaskItem
    ) {
      const taskBranchIds = url.searchParams.getAll("branch_id");
      const taskQueryKeys = [...url.searchParams.keys()];
      const branchId = taskBranchIds[0] ?? "";
      if (
        taskQueryKeys.length !== 1 ||
        taskQueryKeys[0] !== "branch_id" ||
        taskBranchIds.length !== 1 ||
        !isUuid(branchId)
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
        "followup.task.read.scoped",
      );
      if (scopes.length === 0) {
        return fail(
          "NOT_FOUND",
          "Follow-up task not found.",
          404,
          origin,
          id,
        );
      }
      const ids = await visibleFollowupTaskIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        scopes,
      );
      if (ids !== null && !ids.includes(last)) {
        return fail("NOT_FOUND", "Follow-up task not found.", 404, origin, id);
      }
      const { data, error } = await auth.service
        .from("followup_task")
        .select(
          "id,branch_id,contact_id,list_id,assignee_user_id,team_id,priority,due_at,status,task_note,created_by,completed_at,created_at,updated_at",
        )
        .eq("id", last)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (error) throw new Error("FOLLOWUP_TASK_DETAIL_FAILED");
      if (!data) {
        return fail("NOT_FOUND", "Follow-up task not found.", 404, origin, id);
      }
      const { data: events, error: eventError } = await auth.service
        .from("followup_task_event")
        .select("id,event_type,from_status,to_status,details,created_at")
        .eq("task_id", last)
        .order("created_at", { ascending: true });
      if (eventError) throw new Error("FOLLOWUP_TASK_HISTORY_FAILED");
      return response(
        { data, events: events ?? [], request_id: id },
        200,
        origin,
        id,
      );
    }

    if (request.method === "POST" && isFollowupTaskReassign) {
      const queryKeys = [...url.searchParams.keys()];
      const branchIds = url.searchParams.getAll("branch_id");
      const branchId = branchIds[0] ?? "";
      if (
        queryKeys.length !== 1 ||
        queryKeys[0] !== "branch_id" ||
        branchIds.length !== 1 ||
        !isUuid(branchId)
      ) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }

      let raw: unknown;
      try {
        raw = await readJson(request, 16 * 1024);
      } catch (error) {
        const tooLarge = error instanceof Error &&
          error.message === "BODY_TOO_LARGE";
        return fail(
          tooLarge ? "BODY_TOO_LARGE" : "INVALID_JSON",
          tooLarge
            ? "The request body exceeds the 16 KB limit."
            : "A valid JSON request body is required.",
          tooLarge ? 413 : 400,
          origin,
          id,
        );
      }
      const parsed = parseFollowupTaskAssignment(raw);
      if (!parsed.ok) {
        return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      }

      const assignmentScopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "followup.task.assign.scoped",
      );
      if (!assignmentScopes.includes("branch")) {
        return fail(
          "FORBIDDEN",
          "Branch-level follow-up task reassignment is not permitted.",
          403,
          origin,
          id,
        );
      }

      const { data, error } = await auth.service.rpc(
        "cmi_reassign_followup_task",
        {
          p_actor_auth_user_id: auth.actorId,
          p_branch_id: branchId,
          p_task_id: reassignmentTaskId,
          p_assignee_user_id: parsed.value.assignee_user_id,
          p_team_id: parsed.value.team_id,
        },
      );
      if (error) {
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "Task reassignment or target selection is not authorized.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "P0002") {
          return fail(
            "NOT_FOUND",
            "Follow-up task not found.",
            404,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "VALIDATION_ERROR",
            "Only active follow-up tasks can be reassigned.",
            422,
            origin,
            id,
          );
        }
        throw new Error("FOLLOWUP_TASK_REASSIGN_FAILED");
      }
      const result = data as { task?: unknown; changed?: boolean } | null;
      return response(
        {
          data: result?.task ?? null,
          changed: result?.changed ?? false,
          request_id: id,
        },
        200,
        origin,
        id,
      );
    }

    if (request.method === "POST" && isFollowupTaskCollection) {
      let raw: unknown;
      try {
        raw = await readJson(request, 16 * 1024);
      } catch (error) {
        return fail(
          error instanceof Error && error.message === "CONTENT_TYPE_REQUIRED"
            ? "CONTENT_TYPE_REQUIRED"
            : error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? "BODY_TOO_LARGE"
            : "INVALID_JSON",
          error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? "The request body exceeds the 16 KB limit."
            : "A valid JSON request body is required.",
          error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? 413
            : 400,
          origin,
          id,
        );
      }
      const parsed = parseFollowupTaskCreate(raw);
      if (!parsed.ok) {
        return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      }
      const input = parsed.value;
      const createScopes = await resolveScopes(
        auth.service,
        auth.profileId,
        input.branch_id,
        "followup.task.create",
      );
      if (
        createScopes.length === 0 ||
        !createScopes.some((scope) =>
          ["branch", "team", "assigned"].includes(scope)
        )
      ) {
        return fail(
          "FORBIDDEN",
          "You cannot create follow-up tasks in this branch.",
          403,
          origin,
          id,
        );
      }
      if (
        FOLLOWUP_IDEMPOTENCY_HMAC_KEY.length < 32 ||
        !Number.isSafeInteger(FOLLOWUP_IDEMPOTENCY_KEY_VERSION) ||
        FOLLOWUP_IDEMPOTENCY_KEY_VERSION < 1
      ) {
        return fail(
          "IDEMPOTENCY_NOT_CONFIGURED",
          "Follow-up task creation is not configured.",
          503,
          origin,
          id,
        );
      }
      const digest = await createRequestDigest(
        {
          operation: "followup.task.create",
          actor_id: auth.actorId,
          branch_id: input.branch_id,
          client_request_id: input.client_request_id,
          contact_id: input.contact_id,
          list_id: input.list_id,
          assignee_user_id: input.assignee_user_id,
          team_id: input.team_id,
          priority: input.priority,
          due_at: input.due_at,
          task_note: input.task_note,
        } as CanonicalJson,
        FOLLOWUP_IDEMPOTENCY_HMAC_KEY,
        FOLLOWUP_IDEMPOTENCY_KEY_VERSION,
      );

      const { data, error } = await auth.service.rpc(
        "cmi_create_followup_task",
        {
          p_actor_auth_user_id: auth.actorId,
          p_branch_id: input.branch_id,
          p_client_request_id: input.client_request_id,
          p_digest_key_version: digest.keyVersion,
          p_request_digest: "\\x" + digest.digestHex,
          p_contact_id: input.contact_id,
          p_list_id: input.list_id,
          p_assignee_user_id: input.assignee_user_id,
          p_team_id: input.team_id,
          p_priority: input.priority,
          p_due_at: input.due_at,
          p_task_note: input.task_note,
        },
      );
      if (error) {
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "Follow-up task creation or assignment is not authorized.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "23505") {
          return fail(
            "IDEMPOTENCY_CONFLICT",
            "This follow-up task request has already been used.",
            409,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "VALIDATION_ERROR",
            "The task data is invalid.",
            422,
            origin,
            id,
          );
        }
        throw new Error("FOLLOWUP_TASK_CREATE_FAILED");
      }
      const result = data as { task?: unknown; replayed?: boolean } | null;
      return response(
        {
          data: result?.task ?? null,
          replayed: result?.replayed ?? false,
          request_id: id,
        },
        result?.replayed ? 200 : 201,
        origin,
        id,
      );
    }

    if (request.method === "PATCH" && isFollowupTaskItem) {
      const taskBranchIds = url.searchParams.getAll("branch_id");
      const taskQueryKeys = [...url.searchParams.keys()];
      const branchId = taskBranchIds[0] ?? "";
      if (
        taskQueryKeys.length !== 1 ||
        taskQueryKeys[0] !== "branch_id" ||
        taskBranchIds.length !== 1 ||
        !isUuid(branchId)
      ) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }
      let raw: unknown;
      try {
        raw = await readJson(request, 16 * 1024);
      } catch (error) {
        const tooLarge = error instanceof Error &&
          error.message === "BODY_TOO_LARGE";
        return fail(
          tooLarge ? "BODY_TOO_LARGE" : "INVALID_JSON",
          tooLarge
            ? "The request body exceeds the 16 KB limit."
            : "A valid JSON request body is required.",
          tooLarge ? 413 : 400,
          origin,
          id,
        );
      }
      const parsed = parseFollowupTaskPatch(raw);
      if (!parsed.ok) {
        return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      }
      const { data, error } = await auth.service.rpc(
        "cmi_update_followup_task",
        {
          p_actor_auth_user_id: auth.actorId,
          p_branch_id: branchId,
          p_task_id: last,
          p_patch: parsed.value,
        },
      );
      if (error) {
        if (error.code === "42501" || error.code === "P0002") {
          return fail(
            "NOT_FOUND",
            "Follow-up task not found.",
            404,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "VALIDATION_ERROR",
            "The task update is invalid.",
            422,
            origin,
            id,
          );
        }
        throw new Error("FOLLOWUP_TASK_UPDATE_FAILED");
      }
      const result = data as { task?: unknown } | null;
      return response(
        { data: result?.task ?? null, request_id: id },
        200,
        origin,
        id,
      );
    }

    if (
      (request.method === "GET" || request.method === "POST") &&
      (isContactNotesCollection || isContactInteractionsCollection)
    ) {
      const queryKeys = [...url.searchParams.keys()];
      const branchIds = url.searchParams.getAll("branch_id");
      const branchId = branchIds[0] ?? "";
      if (
        queryKeys.some((key) => key !== "branch_id") ||
        branchIds.length !== 1 ||
        !isUuid(branchId)
      ) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }

      const contactScopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "contact.read.scoped",
      );
      if (contactScopes.length === 0) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }
      const visibleIds = await visibleContactIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        contactScopes,
      );
      if (visibleIds !== null && !visibleIds.includes(contactRecordId)) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }
      const { data: contact, error: contactError } = await auth.service
        .from("contact")
        .select("id")
        .eq("id", contactRecordId)
        .eq("branch_id", branchId)
        .neq("contact_status", "merged")
        .maybeSingle();
      if (contactError) throw new Error("CONTACT_HISTORY_OWNER_LOOKUP_FAILED");
      if (!contact) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }

      if (isContactNotesCollection && request.method === "GET") {
        const noteScopes = await resolveScopes(
          auth.service,
          auth.profileId,
          branchId,
          "contact.note.read.scoped",
        );
        const effectiveNoteScopes = noteScopes.filter((scope) =>
          contactScopes.includes(scope)
        );
        if (effectiveNoteScopes.length === 0) {
          return fail(
            "FORBIDDEN",
            "Contact notes are not available to this account.",
            403,
            origin,
            id,
          );
        }
        const [actorTeamIds, contactTeamIds] =
          effectiveNoteScopes.includes("team")
            ? await Promise.all([
              activeContactTeamIds(auth.service, auth.profileId, branchId),
              assignedContactTeamIds(auth.service, contactRecordId, branchId),
            ])
            : [[], []];
        const { data, error } = await auth.service
          .from("contact_note")
          .select(
            "id,body,visibility,team_id,author_user_id,created_at,updated_at",
          )
          .eq("contact_id", contactRecordId)
          .eq("branch_id", branchId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw new Error("CONTACT_NOTE_LIST_FAILED");
        const visibleNotes = (data ?? [])
          .filter((note) =>
            canReadContactNote(
              note as ContactNoteVisibilityRow,
              auth.actorId,
              effectiveNoteScopes,
              actorTeamIds,
              contactTeamIds,
            )
          )
          .map((note) => ({
            id: note.id,
            body: note.body,
            created_at: note.created_at,
            updated_at: note.updated_at,
          }));
        return response(
          { data: visibleNotes, request_id: id },
          200,
          origin,
          id,
        );
      }

      if (isContactNotesCollection && request.method === "POST") {
        const noteScopes = await resolveScopes(
          auth.service,
          auth.profileId,
          branchId,
          "contact.note.create",
        );
        const effectiveNoteScopes = noteScopes.filter((scope) =>
          contactScopes.includes(scope)
        );
        if (effectiveNoteScopes.length === 0) {
          return fail(
            "FORBIDDEN",
            "You cannot add a note to this contact.",
            403,
            origin,
            id,
          );
        }
        let raw: unknown;
        try {
          raw = await readJson(request, 16 * 1024);
        } catch (error) {
          const tooLarge = error instanceof Error &&
            error.message === "BODY_TOO_LARGE";
          return fail(
            tooLarge ? "BODY_TOO_LARGE" : "INVALID_JSON",
            tooLarge
              ? "The request body exceeds the 16 KB limit."
              : "A valid JSON request body is required.",
            tooLarge ? 413 : 400,
            origin,
            id,
          );
        }
        const parsed = parseContactNoteCreate(raw);
        if (!parsed.ok) {
          return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
        }
        const [actorTeamIds, contactTeamIds] =
          effectiveNoteScopes.includes("team")
            ? await Promise.all([
              activeContactTeamIds(auth.service, auth.profileId, branchId),
              assignedContactTeamIds(auth.service, contactRecordId, branchId),
            ])
            : [[], []];
        const placement = deriveContactNotePlacement(
          effectiveNoteScopes,
          actorTeamIds,
          contactTeamIds,
        );
        if (!placement) {
          return fail(
            "FORBIDDEN",
            "A valid note visibility scope is not available for this contact.",
            403,
            origin,
            id,
          );
        }
        const { data, error } = await auth.service
          .from("contact_note")
          .insert({
            contact_id: contactRecordId,
            branch_id: branchId,
            author_user_id: auth.actorId,
            body: parsed.value.body,
            visibility: placement.visibility,
            team_id: placement.team_id,
          })
          .select("id,body,created_at,updated_at")
          .single();
        if (error) throw new Error("CONTACT_NOTE_CREATE_FAILED");
        return response({ data, request_id: id }, 201, origin, id);
      }

      if (isContactInteractionsCollection && request.method === "GET") {
        const { data, error } = await auth.service
          .from("contact_interaction")
          .select(
            "id,interaction_type,occurred_at,outcome_code,summary,next_action_at,created_at",
          )
          .eq("contact_id", contactRecordId)
          .eq("branch_id", branchId)
          .order("occurred_at", { ascending: false })
          .limit(100);
        if (error) throw new Error("CONTACT_INTERACTION_LIST_FAILED");
        return response({ data: data ?? [], request_id: id }, 200, origin, id);
      }

      if (isContactInteractionsCollection && request.method === "POST") {
        const scopes = await resolveScopes(
          auth.service,
          auth.profileId,
          branchId,
          "contact.interaction.record",
        );
        const interactionScopes = scopes.filter((scope) =>
          contactScopes.includes(scope)
        );
        if (interactionScopes.length === 0) {
          return fail(
            "FORBIDDEN",
            "You cannot record an interaction for this contact.",
            403,
            origin,
            id,
          );
        }
        const interactionContactIds = await visibleContactIds(
          auth.service,
          branchId,
          auth.actorId,
          auth.profileId,
          interactionScopes,
        );
        if (
          interactionContactIds !== null &&
          !interactionContactIds.includes(contactRecordId)
        ) {
          return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
        }
        let raw: unknown;
        try {
          raw = await readJson(request, 16 * 1024);
        } catch (error) {
          const tooLarge = error instanceof Error &&
            error.message === "BODY_TOO_LARGE";
          return fail(
            tooLarge ? "BODY_TOO_LARGE" : "INVALID_JSON",
            tooLarge
              ? "The request body exceeds the 16 KB limit."
              : "A valid JSON request body is required.",
            tooLarge ? 413 : 400,
            origin,
            id,
          );
        }
        const parsed = parseContactInteractionCreate(raw);
        if (!parsed.ok) {
          return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
        }
        const input = parsed.value;
        const { data, error } = await auth.service
          .from("contact_interaction")
          .insert({
            contact_id: contactRecordId,
            branch_id: branchId,
            actor_user_id: auth.actorId,
            interaction_type: input.interaction_type,
            ...(input.occurred_at ? { occurred_at: input.occurred_at } : {}),
            outcome_code: input.outcome_code,
            summary: input.summary,
            next_action_at: input.next_action_at,
          })
          .select(
            "id,interaction_type,occurred_at,outcome_code,summary,next_action_at,created_at",
          )
          .single();
        if (error) throw new Error("CONTACT_INTERACTION_CREATE_FAILED");
        return response({ data, request_id: id }, 201, origin, id);
      }
    }

    if (request.method === "GET" && last === "contacts") {
      const params = validateOptionalQuery(url);
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (!params || !isUuid(branchId)) {
        return fail(
          "INVALID_QUERY",
          "Invalid contact query parameters.",
          400,
          origin,
          id,
        );
      }
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "contact.read.scoped",
      );
      if (scopes.length === 0) {
        return fail(
          "FORBIDDEN",
          "You do not have permission to read contacts in this branch.",
          403,
          origin,
          id,
        );
      }
      const ids = await visibleContactIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        scopes,
      );
      const identityScopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "contact.identity.read.scoped",
      );
      const identityIds = await visibleContactIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        identityScopes,
      );
      if (ids !== null && ids.length === 0) {
        return response(
          {
            data: [],
            page: { limit: params.limit, offset: params.offset },
            request_id: id,
          },
          200,
          origin,
          id,
        );
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
      return response(
        {
          data: (data ?? []).map((row: ContactRow) =>
            redactContactIdentity(
              row,
              identityIds === null || identityIds.includes(row.id),
            )
          ),
          page: {
            limit: params.limit,
            offset: params.offset,
            total: count ?? 0,
          },
          request_id: id,
        },
        200,
        origin,
        id,
      );
    }

    if (request.method === "GET" && previous === "contacts" && isUuid(last)) {
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (!isUuid(branchId)) {
        return fail("INVALID_QUERY", "Invalid branch_id.", 400, origin, id);
      }
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "contact.read.scoped",
      );
      if (scopes.length === 0) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }
      const ids = await visibleContactIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        scopes,
      );
      if (ids !== null && !ids.includes(last)) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }
      const identityScopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "contact.identity.read.scoped",
      );
      const identityIds = await visibleContactIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        identityScopes,
      );

      const { data, error } = await auth.service
        .from("contact")
        .select(CONTACT_COLUMNS)
        .eq("id", last)
        .eq("branch_id", branchId)
        .neq("contact_status", "merged")
        .maybeSingle();
      if (error) throw new Error("CONTACT_DETAIL_FAILED");
      if (!data) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }
      return response(
        {
          data: redactContactIdentity(
            data as ContactRow,
            identityIds === null || identityIds.includes(last),
          ),
          request_id: id,
        },
        200,
        origin,
        id,
      );
    }

    if (request.method === "POST" && last === "contacts") {
      let raw: unknown;
      try {
        raw = await readJson(request, 16 * 1024);
      } catch (error) {
        return fail(
          error instanceof Error && error.message === "CONTENT_TYPE_REQUIRED"
            ? "CONTENT_TYPE_REQUIRED"
            : error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? "BODY_TOO_LARGE"
            : "INVALID_JSON",
          error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? "The request body exceeds the 16 KB limit."
            : "A valid JSON request body is required.",
          error instanceof Error && error.message === "BODY_TOO_LARGE"
            ? 413
            : 400,
          origin,
          id,
        );
      }
      const parsed = parseContactCreate(raw);
      if (!parsed.ok) {
        return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      }

      const input = parsed.value;
      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        input.branch_id,
        "contact.capture.create",
      );
      if (
        scopes.length === 0 ||
        !scopes.some((scope) =>
          scope === "branch" || scope === "assigned" || scope === "team"
        )
      ) {
        return fail(
          "FORBIDDEN",
          "You cannot capture contacts in this branch.",
          403,
          origin,
          id,
        );
      }

      if (
        input.team_id === null &&
        scopes.includes("team") &&
        !scopes.includes("branch") &&
        !scopes.includes("assigned")
      ) {
        return fail(
          "TEAM_REQUIRED",
          "Choose one of your active teams for this contact.",
          422,
          origin,
          id,
        );
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
        const identityCaptureAllowed =
          identityCaptureScopes.includes("branch") ||
          (
            input.team_id !== null &&
            scopes.includes("team") &&
            identityCaptureScopes.includes("team")
          ) ||
          (
            input.team_id === null &&
            scopes.includes("assigned") &&
            identityCaptureScopes.includes("assigned")
          );
        if (!identityCaptureAllowed) {
          return fail(
            "IDENTITY_CAPTURE_NOT_APPROVED",
            "Phone and email capture are not enabled for this record scope.",
            403,
            origin,
            id,
          );
        }
      }

      if (
        CONTACT_IDEMPOTENCY_HMAC_KEY.length < 32 ||
        !Number.isSafeInteger(CONTACT_IDEMPOTENCY_KEY_VERSION) ||
        CONTACT_IDEMPOTENCY_KEY_VERSION < 1
      ) {
        return fail(
          "IDEMPOTENCY_NOT_CONFIGURED",
          "Contact capture is not configured.",
          503,
          origin,
          id,
        );
      }

      const digest = await createRequestDigest(
        {
          operation: "contact.create",
          actor_id: auth.actorId,
          branch_id: input.branch_id,
          client_request_id: input.client_request_id,
          first_name: input.first_name,
          last_name: input.last_name,
          preferred_name: input.preferred_name,
          phone_e164: input.phone_e164,
          phone_display: input.phone_display,
          email_normalized: input.email_normalized,
          age_range: input.age_range,
          preferred_language: input.preferred_language,
          service_area_id: input.service_area_id,
          team_id: input.team_id,
          source_metadata: input.source_metadata,
        } as CanonicalJson,
        CONTACT_IDEMPOTENCY_HMAC_KEY,
        CONTACT_IDEMPOTENCY_KEY_VERSION,
      );

      const { data, error } = await auth.service.rpc("cmi_create_contact", {
        p_actor_auth_user_id: auth.actorId,
        p_branch_id: input.branch_id,
        p_client_request_id: input.client_request_id,
        p_digest_key_version: digest.keyVersion,
        p_request_digest: "\\x" + digest.digestHex,
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
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "Contact capture is not authorized.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "23505") {
          return fail(
            "IDEMPOTENCY_CONFLICT",
            "This capture request has already been used.",
            409,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "VALIDATION_ERROR",
            "The contact data is invalid.",
            422,
            origin,
            id,
          );
        }
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
      const resultContact =
        result?.contact && typeof result.contact === "object"
          ? redactContactIdentity(
            result.contact as ContactRow,
            identityReadIds === null ||
              identityReadIds.includes(
                String((result.contact as Record<string, unknown>).id),
              ),
          )
          : null;
      return response(
        {
          data: resultContact,
          replayed: result?.replayed ?? false,
          request_id: id,
        },
        result?.replayed ? 200 : 201,
        origin,
        id,
      );
    }

    if (request.method === "PATCH" && previous === "contacts" && isUuid(last)) {
      const branchId = url.searchParams.get("branch_id") ?? "";
      if (!isUuid(branchId)) {
        return fail("INVALID_QUERY", "Invalid branch_id.", 400, origin, id);
      }
      let raw: unknown;
      try {
        raw = await readJson(request, 16 * 1024);
      } catch (error) {
        const tooLarge = error instanceof Error &&
          error.message === "BODY_TOO_LARGE";
        return fail(
          tooLarge ? "BODY_TOO_LARGE" : "INVALID_JSON",
          tooLarge
            ? "The request body exceeds the 16 KB limit."
            : "A valid JSON request body is required.",
          tooLarge ? 413 : 400,
          origin,
          id,
        );
      }
      const parsed = parseContactPatch(raw);
      if (!parsed.ok) {
        return fail("VALIDATION_ERROR", parsed.error, 422, origin, id);
      }
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
        const identityUpdateIds = await visibleContactIds(
          auth.service,
          branchId,
          auth.actorId,
          auth.profileId,
          identityUpdateScopes,
        );
        if (identityUpdateIds !== null && !identityUpdateIds.includes(last)) {
          return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
        }
      }

      const scopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "contact.update.scoped",
      );
      if (scopes.length === 0) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }
      const ids = await visibleContactIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        scopes,
      );
      if (ids !== null && !ids.includes(last)) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }

      const { data, error } = await auth.service
        .from("contact")
        .update(parsed.value)
        .eq("id", last)
        .eq("branch_id", branchId)
        .neq("contact_status", "merged")
        .select(CONTACT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error("CONTACT_UPDATE_FAILED");
      if (!data) {
        return fail("NOT_FOUND", "Contact not found.", 404, origin, id);
      }
      const identityReadScopes = await resolveScopes(
        auth.service,
        auth.profileId,
        branchId,
        "contact.identity.read.scoped",
      );
      const identityReadIds = await visibleContactIds(
        auth.service,
        branchId,
        auth.actorId,
        auth.profileId,
        identityReadScopes,
      );
      return response(
        {
          data: redactContactIdentity(
            data as ContactRow,
            identityReadIds === null || identityReadIds.includes(last),
          ),
          request_id: id,
        },
        200,
        origin,
        id,
      );
    }

    return fail(
      "NOT_FOUND",
      "The requested staff operation does not exist.",
      404,
      origin,
      id,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("staff-operations failure", { request_id: id, code });
    return fail(
      "STAFF_OPERATION_FAILED",
      "Unable to complete the staff operation.",
      500,
      origin,
      id,
    );
  }
});
