import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  type CanonicalJson,
  createRequestDigest,
  deriveIdempotencySecret,
} from "../_shared/idempotency.ts";
import {
  isUuid,
  parseEventCheckin,
  parseEventCreate,
  parseEventListQuery,
  parseEventPatch,
  parseEventRegistrationCancel,
  parseEventStaffAssignment,
  parseEventStaffRegistration,
  parseEventTeamAssignment,
} from "./validation.ts";
import { readJson } from "../_shared/request_body.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const SUPABASE_PUBLIC_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const EVENT_IDEMPOTENCY_HMAC_KEY =
  Deno.env.get("CMI_EVENT_IDEMPOTENCY_HMAC_KEY") ?? "";
const EVENT_IDEMPOTENCY_KEY_VERSION = Number(
  Deno.env.get("CMI_EVENT_IDEMPOTENCY_KEY_VERSION") ?? "1",
);
const allowedOrigins = new Set([
  "https://pcg-missions.vercel.app",
  ...(Deno.env.get("CMI_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

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
  "id,branch_id,title,description,starts_at,ends_at,timezone,location,capacity,status,visibility,registration_state,flyer_mime_type,flyer_size_bytes,flyer_updated_at,created_at,updated_at";

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

function parseBranchQuery(url: URL): string | null {
  const keys = [...url.searchParams.keys()];
  const branchId = url.searchParams.get("branch_id") ?? "";
  if (
    keys.length !== 1 || keys[0] !== "branch_id" ||
    url.searchParams.getAll("branch_id").length !== 1 || !isUuid(branchId)
  ) return null;
  return branchId;
}

async function loadEventForManagement(
  service: ServiceClient,
  profileId: string,
  eventId: string,
  branchId: string,
): Promise<
  { ok: true; status: string; starts_at: string; ends_at: string } | {
    ok: false;
    responseCode: "FORBIDDEN" | "NOT_FOUND";
    statusCode: 403 | 404;
  }
> {
  const scopes = await resolveScopes(
    service,
    profileId,
    branchId,
    "event.manage.scoped",
  );
  if (!scopes.includes("branch")) {
    return { ok: false, responseCode: "FORBIDDEN", statusCode: 403 };
  }
  const { data, error } = await service.from("event")
    .select("id,status,starts_at,ends_at")
    .eq("id", eventId)
    .eq("branch_id", branchId)
    .maybeSingle();
  if (error) throw new Error("EVENT_MANAGEMENT_LOOKUP_FAILED");
  if (!data) return { ok: false, responseCode: "NOT_FOUND", statusCode: 404 };
  return {
    ok: true,
    status: data.status,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
  };
}

function resolveEventAssignmentEnd(
  startsAt: string,
  requestedEndsAt: string | null,
  eventStartsAt: string,
  eventEndsAt: string,
): string | null {
  const start = Date.parse(startsAt);
  const eventStart = Date.parse(eventStartsAt);
  const eventEnd = Date.parse(eventEndsAt);
  const end = requestedEndsAt ? Date.parse(requestedEndsAt) : eventEnd;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(eventStart) ||
    !Number.isFinite(eventEnd) ||
    !Number.isFinite(end) ||
    start < eventStart ||
    start >= eventEnd ||
    end <= start ||
    end > eventEnd
  ) return null;
  return new Date(end).toISOString();
}

async function listEventAssignmentWorkspace(
  service: ServiceClient,
  eventId: string,
  branchId: string,
): Promise<{
  staff_assignments: Record<string, unknown>[];
  team_assignments: Record<string, unknown>[];
  staff_candidates: { auth_user_id: string; full_name: string }[];
  team_candidates: { id: string; name: string }[];
}> {
  const now = new Date().toISOString();
  const [staffRows, teamRows, memberships, teams] = await Promise.all([
    service.from("event_staff_assignment")
      .select(
        "id,event_id,branch_id,staff_auth_user_id,assignment_role,starts_at,ends_at,revoked_at,created_at",
      )
      .eq("event_id", eventId).eq("branch_id", branchId)
      .order("starts_at", { ascending: true }),
    service.from("event_team_assignment")
      .select(
        "id,event_id,branch_id,team_id,assignment_role,starts_at,ends_at,revoked_at,created_at",
      )
      .eq("event_id", eventId).eq("branch_id", branchId)
      .order("starts_at", { ascending: true }),
    service.from("staff_role_assignment")
      .select("staff_profile_id,role:role!inner(is_active)")
      .eq("branch_id", branchId).eq("role.is_active", true)
      .lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`)
      .is("revoked_at", null),
    service.from("team").select("id,name,is_active")
      .eq("branch_id", branchId).eq("is_active", true)
      .order("name", { ascending: true }).limit(200),
  ]);
  if (staffRows.error || teamRows.error || memberships.error || teams.error) {
    throw new Error("EVENT_ASSIGNMENT_LIST_FAILED");
  }

  const profileIds = [
    ...new Set(
      (memberships.data ?? []).map((row: { staff_profile_id: string }) =>
        row.staff_profile_id
      ),
    ),
  ];
  const assignedStaffIds = [
    ...new Set(
      (staffRows.data ?? []).map((row: { staff_auth_user_id: string }) =>
        row.staff_auth_user_id
      ),
    ),
  ];
  const assignedTeamIds = [
    ...new Set(
      (teamRows.data ?? []).map((row: { team_id: string }) => row.team_id),
    ),
  ];
  const historicalTeamIds = [
    ...new Set([
      ...(teams.data ?? []).map((row: { id: string }) => row.id),
      ...assignedTeamIds,
    ]),
  ];
  const [profiles, assignedProfiles, historicalTeams] = await Promise.all([
    service.from("staff_profile")
      .select("id,auth_user_id,full_name,account_status")
      .in(
        "id",
        profileIds.length
          ? profileIds
          : ["00000000-0000-4000-8000-000000000000"],
      )
      .eq("account_status", "active")
      .order("full_name", { ascending: true }).limit(200),
    assignedStaffIds.length
      ? service.from("staff_profile").select("auth_user_id,full_name").in(
        "auth_user_id",
        assignedStaffIds,
      )
      : Promise.resolve({ data: [], error: null }),
    historicalTeamIds.length
      ? service.from("team").select("id,name,is_active").eq(
        "branch_id",
        branchId,
      ).in("id", historicalTeamIds).limit(250)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error || assignedProfiles.error || historicalTeams.error) {
    throw new Error("EVENT_ASSIGNMENT_DIRECTORY_FAILED");
  }

  const staffNames = new Map<string, string>();
  for (
    const row of [...(assignedProfiles.data ?? []), ...(profiles.data ?? [])]
  ) {
    staffNames.set(row.auth_user_id, row.full_name);
  }
  const teamNames = new Map<string, string>();
  for (const row of [...(historicalTeams.data ?? [])]) {
    teamNames.set(row.id, row.name);
  }
  const candidates = [...(profiles.data ?? [])].map((row) => ({
    auth_user_id: row.auth_user_id,
    full_name: row.full_name,
  }));
  const teamCandidates = [...(teams.data ?? [])].map((
    row: { id: string; name: string },
  ) => ({
    id: row.id,
    name: row.name,
  }));
  return {
    staff_assignments: (staffRows.data ?? []).map((
      row: Record<string, unknown>,
    ) => ({
      ...row,
      staff_name: staffNames.get(String(row.staff_auth_user_id)) ??
        "Inactive or unavailable staff",
    })),
    team_assignments: (teamRows.data ?? []).map((
      row: Record<string, unknown>,
    ) => ({
      ...row,
      team_name: teamNames.get(String(row.team_id)) ?? "Inactive team",
    })),
    staff_candidates: candidates,
    team_candidates: teamCandidates,
  };
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

    const eventsIndex = path.lastIndexOf("events");
    const nestedEventId = eventsIndex >= 0 ? (path[eventsIndex + 1] ?? "") : "";
    const eventSuffix = eventsIndex >= 0 ? path.slice(eventsIndex + 2) : [];
    const assignmentKind = eventSuffix[0] === "staff-assignments"
      ? "staff"
      : eventSuffix[0] === "team-assignments"
      ? "team"
      : null;
    const isAssignmentWorkspace = isUuid(nestedEventId) &&
      eventSuffix.length === 1 && eventSuffix[0] === "assignments";
    const isAssignmentCollection = isUuid(nestedEventId) &&
      eventSuffix.length === 1 && assignmentKind !== null;
    const isAssignmentRevoke = isUuid(nestedEventId) &&
      eventSuffix.length === 3 && assignmentKind !== null &&
      isUuid(eventSuffix[1]) && eventSuffix[2] === "revoke";
    const isRegistrationCollection = isUuid(nestedEventId) &&
      eventSuffix.length === 1 && eventSuffix[0] === "registrations";
    const isRegistrationCancel = isUuid(nestedEventId) &&
      eventSuffix.length === 3 && eventSuffix[0] === "registrations" &&
      isUuid(eventSuffix[1]) && eventSuffix[2] === "cancel";
    const isRegistrationCheckin = isUuid(nestedEventId) &&
      eventSuffix.length === 3 && eventSuffix[0] === "registrations" &&
      isUuid(eventSuffix[1]) && eventSuffix[2] === "check-in";
    const isStaffRegistrationStateChange = isUuid(nestedEventId) &&
      eventSuffix.length === 2 && eventSuffix[0] === "staff-registration" &&
      (eventSuffix[1] === "open" || eventSuffix[1] === "close");

    if (request.method === "POST" && isStaffRegistrationStateChange) {
      const branchId = parseBranchQuery(url);
      if (!branchId) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }
      const managed = await loadEventForManagement(
        auth.service,
        auth.profileId,
        nestedEventId,
        branchId,
      );
      if (!managed.ok) {
        return fail(
          managed.responseCode,
          managed.responseCode === "NOT_FOUND"
            ? "Event not found."
            : "The operation is not permitted.",
          managed.statusCode,
          origin,
          id,
        );
      }
      const { data: current, error: currentError } = await auth.service
        .from("event")
        .select("id,status,visibility,registration_state,capacity,starts_at")
        .eq("id", nestedEventId)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (currentError) {
        throw new Error("EVENT_REGISTRATION_STATE_LOOKUP_FAILED");
      }
      if (!current) {
        return fail("NOT_FOUND", "Event not found.", 404, origin, id);
      }

      const action = eventSuffix[1];
      if (action === "open") {
        if (
          current.status !== "draft" ||
          current.visibility !== "private" ||
          current.registration_state !== "closed"
        ) {
          return fail(
            "EVENT_NOT_OPENABLE",
            "Only a private draft with registration closed can be opened for staff registration.",
            409,
            origin,
            id,
          );
        }
        if (!Number.isSafeInteger(current.capacity) || current.capacity < 1) {
          return fail(
            "EVENT_CAPACITY_REQUIRED",
            "Set a finite capacity before opening staff registration.",
            422,
            origin,
            id,
          );
        }
        if (Date.parse(current.starts_at) <= Date.now()) {
          return fail(
            "EVENT_ALREADY_STARTED",
            "Staff registration can only be opened before the event starts.",
            422,
            origin,
            id,
          );
        }
        const { data, error } = await auth.service
          .from("event")
          .update({
            status: "published",
            visibility: "staff",
            registration_state: "open",
          })
          .eq("id", nestedEventId)
          .eq("branch_id", branchId)
          .eq("status", "draft")
          .eq("visibility", "private")
          .eq("registration_state", "closed")
          .select(EVENT_COLUMNS)
          .maybeSingle();
        if (error) throw new Error("EVENT_STAFF_REGISTRATION_OPEN_FAILED");
        if (!data) {
          return fail(
            "EVENT_STATE_CHANGED",
            "The event changed. Refresh and try again.",
            409,
            origin,
            id,
          );
        }
        return response({ data, request_id: id }, 200, origin, id);
      }

      if (
        current.status !== "published" ||
        current.visibility !== "staff" ||
        current.registration_state !== "open"
      ) {
        return fail(
          "EVENT_REGISTRATION_NOT_OPEN",
          "This event does not have staff registration open.",
          409,
          origin,
          id,
        );
      }
      const { data, error } = await auth.service
        .from("event")
        .update({ registration_state: "closed" })
        .eq("id", nestedEventId)
        .eq("branch_id", branchId)
        .eq("status", "published")
        .eq("visibility", "staff")
        .eq("registration_state", "open")
        .select(EVENT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error("EVENT_STAFF_REGISTRATION_CLOSE_FAILED");
      if (!data) {
        return fail(
          "EVENT_STATE_CHANGED",
          "The event changed. Refresh and try again.",
          409,
          origin,
          id,
        );
      }
      return response({ data, request_id: id }, 200, origin, id);
    }



    if (request.method === "POST" && isRegistrationCheckin) {
      const branchId = parseBranchQuery(url);
      if (!branchId) {
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
        "event.checkin.scoped",
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
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INVALID_JSON";
        return fail(
          code,
          code === "CONTENT_TYPE_REQUIRED"
            ? "Content-Type must be application/json."
            : code === "BODY_TOO_LARGE"
            ? "Request body is too large."
            : "A valid JSON request body is required.",
          code === "BODY_TOO_LARGE" ? 413 : 400,
          origin,
          id,
        );
      }
      const parsed = parseEventCheckin(body);
      if (!parsed.ok) {
        return fail(
          "INVALID_EVENT_CHECKIN",
          parsed.error,
          400,
          origin,
          id,
        );
      }
      if (
        !Number.isSafeInteger(EVENT_IDEMPOTENCY_KEY_VERSION) ||
        EVENT_IDEMPOTENCY_KEY_VERSION < 1
      ) {
        throw new Error("EVENT_IDEMPOTENCY_KEY_VERSION_INVALID");
      }

      const secret = EVENT_IDEMPOTENCY_HMAC_KEY ||
        await deriveIdempotencySecret(SUPABASE_SERVICE_ROLE_KEY, "event");
      const digest = await createRequestDigest(
        {
          operation: "event_checkin",
          event_id: nestedEventId,
          branch_id: branchId,
          actor_user_id: auth.actorId,
          registration_id: eventSuffix[1],
        } as CanonicalJson,
        secret,
        EVENT_IDEMPOTENCY_KEY_VERSION,
      );
      const { data, error } = await auth.service.rpc(
        "cmi_staff_checkin_event_registration",
        {
          p_actor_auth_user_id: auth.actorId,
          p_event_id: nestedEventId,
          p_branch_id: branchId,
          p_registration_id: eventSuffix[1],
          p_idempotency_key: parsed.value.idempotency_key,
          p_digest_key_version: digest.keyVersion,
          p_request_digest_hex: digest.digestHex,
        },
      );
      if (error) {
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "You do not have permission to check in attendees for this event.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "P0002") {
          return fail(
            "NOT_FOUND",
            "Event or registration not found.",
            404,
            origin,
            id,
          );
        }
        if (error.code === "23505") {
          return fail(
            "CHECKIN_CONFLICT",
            "This attendee has already been checked in.",
            409,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "INVALID_EVENT_CHECKIN",
            "The check-in request is invalid.",
            422,
            origin,
            id,
          );
        }
        if (error.code === "P0001") {
          const message = error.message ?? "";
          const known = new Map([
            [
              "EVENT_CHECKIN_CLOSED",
              "Check-in is closed for this event.",
            ],
            [
              "EVENT_REGISTRATION_NOT_ACTIVE",
              "Only an active registration can be checked in.",
            ],
            [
              "EVENT_REGISTRATION_ALREADY_CHECKED_IN",
              "This attendee has already been checked in.",
            ],
          ]);
          return fail(
            known.has(message) ? message : "EVENT_CHECKIN_REJECTED",
            known.get(message) ?? "The check-in could not be completed.",
            409,
            origin,
            id,
          );
        }
        throw new Error("EVENT_STAFF_CHECKIN_FAILED");
      }
      const replayed = Boolean(
        (data as { replayed?: boolean } | null)?.replayed,
      );
      return response(
        { data, request_id: id, replayed },
        replayed ? 200 : 201,
        origin,
        id,
      );
    }

    if (request.method === "POST" && isRegistrationCancel) {
      const branchId = parseBranchQuery(url);
      if (!branchId) {
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
        "event.registration.manage.scoped",
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
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INVALID_JSON";
        return fail(
          code,
          code === "CONTENT_TYPE_REQUIRED"
            ? "Content-Type must be application/json."
            : code === "BODY_TOO_LARGE"
            ? "Request body is too large."
            : "A valid JSON request body is required.",
          code === "BODY_TOO_LARGE" ? 413 : 400,
          origin,
          id,
        );
      }
      const parsed = parseEventRegistrationCancel(body);
      if (!parsed.ok) {
        return fail(
          "INVALID_REGISTRATION_CANCEL",
          parsed.error,
          400,
          origin,
          id,
        );
      }
      if (
        !Number.isSafeInteger(EVENT_IDEMPOTENCY_KEY_VERSION) ||
        EVENT_IDEMPOTENCY_KEY_VERSION < 1
      ) {
        throw new Error("EVENT_IDEMPOTENCY_KEY_VERSION_INVALID");
      }

      const secret = EVENT_IDEMPOTENCY_HMAC_KEY ||
        await deriveIdempotencySecret(SUPABASE_SERVICE_ROLE_KEY, "event");
      const digest = await createRequestDigest(
        {
          operation: "registration_cancel",
          event_id: nestedEventId,
          branch_id: branchId,
          actor_user_id: auth.actorId,
          registration_id: eventSuffix[1],
        } as CanonicalJson,
        secret,
        EVENT_IDEMPOTENCY_KEY_VERSION,
      );
      const { data, error } = await auth.service.rpc(
        "cmi_staff_cancel_event_registration",
        {
          p_actor_auth_user_id: auth.actorId,
          p_event_id: nestedEventId,
          p_branch_id: branchId,
          p_registration_id: eventSuffix[1],
          p_idempotency_key: parsed.value.idempotency_key,
          p_digest_key_version: digest.keyVersion,
          p_request_digest_hex: digest.digestHex,
        },
      );
      if (error) {
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "You do not have permission to cancel registrations for this event.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "P0002") {
          return fail(
            "NOT_FOUND",
            "Event or registration not found.",
            404,
            origin,
            id,
          );
        }
        if (error.code === "23505") {
          return fail(
            "IDEMPOTENCY_CONFLICT",
            "This request key has already been used for a different cancellation.",
            409,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "INVALID_REGISTRATION_CANCEL",
            "The cancellation request is invalid.",
            422,
            origin,
            id,
          );
        }
        if (error.code === "P0001") {
          const message = error.message ?? "";
          const known = new Map([
            [
              "EVENT_REGISTRATION_ALREADY_CHECKED_IN",
              "A checked-in attendee cannot be cancelled.",
            ],
            [
              "EVENT_REGISTRATION_NOT_CANCELLABLE",
              "Only an active registration can be cancelled.",
            ],
            [
              "EVENT_REGISTRATION_CANCELLATION_CLOSED",
              "Registration cancellation is closed because the event has started.",
            ],
          ]);
          return fail(
            known.has(message) ? message : "REGISTRATION_CANCELLATION_REJECTED",
            known.get(message) ?? "The registration could not be cancelled.",
            409,
            origin,
            id,
          );
        }
        if (error.code === "40001") {
          return fail(
            "REGISTRATION_CHANGED",
            "The registration changed. Refresh and try again.",
            409,
            origin,
            id,
          );
        }
        throw new Error("EVENT_STAFF_REGISTRATION_CANCEL_FAILED");
      }
      const replayed = Boolean(
        (data as { replayed?: boolean } | null)?.replayed,
      );
      return response(
        { data, request_id: id, replayed },
        200,
        origin,
        id,
      );
    }

    if (
      (request.method === "GET" || request.method === "POST") &&
      isRegistrationCollection
    ) {
      const branchId = parseBranchQuery(url);
      if (!branchId) {
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
        "event.registration.manage.scoped",
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
      const { data: event, error: eventError } = await auth.service
        .from("event")
        .select("id,status,visibility,registration_state,capacity,starts_at")
        .eq("id", nestedEventId)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (eventError) throw new Error("EVENT_REGISTRATION_EVENT_LOOKUP_FAILED");
      if (!event) {
        return fail("NOT_FOUND", "Event not found.", 404, origin, id);
      }

      if (request.method === "GET") {
        const [registrations, checkins] = await Promise.all([
          auth.service
            .from("event_registration")
            .select(
              "id,event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,status,registered_at",
            )
            .eq("event_id", nestedEventId)
            .eq("branch_id", branchId)
            .order("registered_at", { ascending: false })
            .limit(100),
          auth.service
            .from("event_checkin")
            .select("registration_id,checked_in_at")
            .eq("event_id", nestedEventId)
            .eq("branch_id", branchId),
        ]);
        if (registrations.error || checkins.error) {
          throw new Error("EVENT_REGISTRATION_LIST_FAILED");
        }
        const checkedInAt = new Map(
          (checkins.data ?? []).map((row) => [
            row.registration_id,
            row.checked_in_at,
          ]),
        );
        const data = (registrations.data ?? []).map((registration) => ({
          ...registration,
          checked_in_at: checkedInAt.get(registration.id) ?? null,
        }));
        return response({ data, request_id: id }, 200, origin, id);
      }

      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        const code = error instanceof Error ? error.message : "INVALID_JSON";
        return fail(
          code,
          code === "CONTENT_TYPE_REQUIRED"
            ? "Content-Type must be application/json."
            : code === "BODY_TOO_LARGE"
            ? "Request body is too large."
            : "A valid JSON request body is required.",
          code === "BODY_TOO_LARGE" ? 413 : 400,
          origin,
          id,
        );
      }
      const parsed = parseEventStaffRegistration(body);
      if (!parsed.ok) {
        return fail("INVALID_REGISTRATION", parsed.error, 400, origin, id);
      }
      if (
        !Number.isSafeInteger(EVENT_IDEMPOTENCY_KEY_VERSION) ||
        EVENT_IDEMPOTENCY_KEY_VERSION < 1
      ) {
        throw new Error("EVENT_IDEMPOTENCY_KEY_VERSION_INVALID");
      }

      const secret = EVENT_IDEMPOTENCY_HMAC_KEY ||
        await deriveIdempotencySecret(SUPABASE_SERVICE_ROLE_KEY, "event");
      const digest = await createRequestDigest(
        {
          operation: "staff_registration",
          event_id: nestedEventId,
          branch_id: branchId,
          actor_user_id: auth.actorId,
          attendee_name_snapshot: parsed.value.attendee_name,
          attendee_phone_snapshot: parsed.value.attendee_phone,
        } as CanonicalJson,
        secret,
        EVENT_IDEMPOTENCY_KEY_VERSION,
      );

      const { data, error } = await auth.service.rpc(
        "cmi_staff_register_event_attendee",
        {
          p_actor_auth_user_id: auth.actorId,
          p_event_id: nestedEventId,
          p_branch_id: branchId,
          p_idempotency_key: parsed.value.idempotency_key,
          p_digest_key_version: digest.keyVersion,
          p_request_digest_hex: digest.digestHex,
          p_attendee_name: parsed.value.attendee_name,
          p_attendee_phone: parsed.value.attendee_phone,
        },
      );
      if (error) {
        if (error.code === "42501") {
          return fail(
            "FORBIDDEN",
            "You do not have permission to register attendees for this event.",
            403,
            origin,
            id,
          );
        }
        if (error.code === "P0002") {
          return fail("NOT_FOUND", "Event not found.", 404, origin, id);
        }
        if (error.code === "23505") {
          return fail(
            "IDEMPOTENCY_CONFLICT",
            "This request key has already been used with different registration details.",
            409,
            origin,
            id,
          );
        }
        if (error.code === "22023") {
          return fail(
            "INVALID_REGISTRATION",
            "The registration details are invalid.",
            422,
            origin,
            id,
          );
        }
        if (error.code === "P0001") {
          const message = error.message ?? "";
          const known = new Map([
            [
              "EVENT_REGISTRATION_CLOSED",
              "Registration is not open for this event.",
            ],
            [
              "EVENT_CAPACITY_REQUIRED",
              "Set a finite event capacity before accepting registrations.",
            ],
            [
              "EVENT_CAPACITY_REACHED",
              "This event has reached its registration capacity.",
            ],
          ]);
          return fail(
            known.has(message) ? message : "REGISTRATION_REJECTED",
            known.get(message) ?? "The registration could not be completed.",
            message === "EVENT_CAPACITY_REACHED" ? 409 : 422,
            origin,
            id,
          );
        }
        throw new Error("EVENT_STAFF_REGISTRATION_FAILED");
      }
      const replayed = Boolean(
        (data as { replayed?: boolean } | null)?.replayed,
      );
      return response(
        { data, request_id: id, replayed },
        replayed ? 200 : 201,
        origin,
        id,
      );
    }

    if (
      (request.method === "GET" && isAssignmentWorkspace) ||
      (request.method === "POST" && isAssignmentCollection) ||
      (request.method === "POST" && isAssignmentRevoke)
    ) {
      const branchId = parseBranchQuery(url);
      if (!branchId) {
        return fail(
          "INVALID_QUERY",
          "A single valid branch_id is required.",
          400,
          origin,
          id,
        );
      }
      const managed = await loadEventForManagement(
        auth.service,
        auth.profileId,
        nestedEventId,
        branchId,
      );
      if (!managed.ok) {
        return fail(
          managed.responseCode,
          managed.responseCode === "NOT_FOUND"
            ? "Event not found."
            : "The operation is not permitted.",
          managed.statusCode,
          origin,
          id,
        );
      }

      if (request.method === "GET" && isAssignmentWorkspace) {
        const data = await listEventAssignmentWorkspace(
          auth.service,
          nestedEventId,
          branchId,
        );
        return response({ data, request_id: id }, 200, origin, id);
      }

      if (request.method === "POST" && isAssignmentCollection) {
        if (managed.status === "cancelled" || managed.status === "completed") {
          return fail(
            "EVENT_NOT_ASSIGNABLE",
            "Assignments cannot be changed for a cancelled or completed event.",
            409,
            origin,
            id,
          );
        }
        let body: unknown;
        try {
          body = await readJson(request);
        } catch (error) {
          const code = error instanceof Error ? error.message : "INVALID_JSON";
          return fail(
            code,
            code === "CONTENT_TYPE_REQUIRED"
              ? "Content-Type must be application/json."
              : code === "BODY_TOO_LARGE"
              ? "Request body is too large."
              : "A valid JSON request body is required.",
            code === "BODY_TOO_LARGE" ? 413 : 400,
            origin,
            id,
          );
        }

        if (assignmentKind === "staff") {
          const parsed = parseEventStaffAssignment(body);
          if (!parsed.ok) {
            return fail("INVALID_ASSIGNMENT", parsed.error, 400, origin, id);
          }
          const assignmentEndsAt = resolveEventAssignmentEnd(
            parsed.value.starts_at,
            parsed.value.ends_at,
            managed.starts_at,
            managed.ends_at,
          );
          if (!assignmentEndsAt) {
            return fail(
              "INVALID_ASSIGNMENT_WINDOW",
              "Assignments must start and end within the event's scheduled window.",
              422,
              origin,
              id,
            );
          }

          const { data: profile, error: profileError } = await auth.service
            .from("staff_profile")
            .select("id,account_status")
            .eq("auth_user_id", parsed.value.staff_auth_user_id)
            .maybeSingle();
          if (profileError) throw new Error("EVENT_ASSIGNEE_LOOKUP_FAILED");
          if (!profile || profile.account_status !== "active") {
            return fail(
              "STAFF_NOT_ASSIGNABLE",
              "Choose an active staff member assigned to this branch.",
              422,
              origin,
              id,
            );
          }
          const { data: membership, error: membershipError } = await auth
            .service
            .from("staff_role_assignment")
            .select("id,role:role!inner(is_active)")
            .eq("staff_profile_id", profile.id)
            .eq("branch_id", branchId)
            .eq("role.is_active", true)
            .lte("starts_at", parsed.value.starts_at)
            .or(`ends_at.is.null,ends_at.gt.${assignmentEndsAt}`)
            .is("revoked_at", null)
            .limit(1)
            .maybeSingle();
          if (membershipError) {
            throw new Error("EVENT_ASSIGNEE_SCOPE_LOOKUP_FAILED");
          }
          if (!membership) {
            return fail(
              "STAFF_NOT_IN_BRANCH",
              "The selected staff member is not active in this branch for the assignment period.",
              422,
              origin,
              id,
            );
          }
          const { data, error } = await auth.service
            .from("event_staff_assignment")
            .insert({
              event_id: nestedEventId,
              branch_id: branchId,
              staff_auth_user_id: parsed.value.staff_auth_user_id,
              assignment_role: parsed.value.assignment_role,
              starts_at: parsed.value.starts_at,
              ends_at: assignmentEndsAt,
              assigned_by: auth.actorId,
            })
            .select(
              "id,event_id,branch_id,staff_auth_user_id,assignment_role,starts_at,ends_at,revoked_at,created_at",
            )
            .single();
          if (error) {
            if (error.code === "23505" || error.code === "23P01") {
              return fail(
                "ASSIGNMENT_CONFLICT",
                "This staff member already has an overlapping assignment for that role.",
                409,
                origin,
                id,
              );
            }
            throw new Error("EVENT_STAFF_ASSIGNMENT_CREATE_FAILED");
          }
          return response({ data, request_id: id }, 201, origin, id);
        }

        const parsed = parseEventTeamAssignment(body);
        if (!parsed.ok) {
          return fail("INVALID_ASSIGNMENT", parsed.error, 400, origin, id);
        }
        const assignmentEndsAt = resolveEventAssignmentEnd(
          parsed.value.starts_at,
          parsed.value.ends_at,
          managed.starts_at,
          managed.ends_at,
        );
        if (!assignmentEndsAt) {
          return fail(
            "INVALID_ASSIGNMENT_WINDOW",
            "Assignments must start and end within the event's scheduled window.",
            422,
            origin,
            id,
          );
        }
        const { data: team, error: teamError } = await auth.service
          .from("team")
          .select("id")
          .eq("id", parsed.value.team_id)
          .eq("branch_id", branchId)
          .eq("is_active", true)
          .maybeSingle();
        if (teamError) throw new Error("EVENT_TEAM_LOOKUP_FAILED");
        if (!team) {
          return fail(
            "TEAM_NOT_ASSIGNABLE",
            "Choose an active team in this branch.",
            422,
            origin,
            id,
          );
        }
        const { data, error } = await auth.service
          .from("event_team_assignment")
          .insert({
            event_id: nestedEventId,
            branch_id: branchId,
            team_id: parsed.value.team_id,
            assignment_role: parsed.value.assignment_role,
            starts_at: parsed.value.starts_at,
            ends_at: assignmentEndsAt,
            assigned_by: auth.actorId,
          })
          .select(
            "id,event_id,branch_id,team_id,assignment_role,starts_at,ends_at,revoked_at,created_at",
          )
          .single();
        if (error) {
          if (error.code === "23505" || error.code === "23P01") {
            return fail(
              "ASSIGNMENT_CONFLICT",
              "This team already has an overlapping assignment for that role.",
              409,
              origin,
              id,
            );
          }
          throw new Error("EVENT_TEAM_ASSIGNMENT_CREATE_FAILED");
        }
        return response({ data, request_id: id }, 201, origin, id);
      }

      if (request.method === "POST" && isAssignmentRevoke && assignmentKind) {
        const table = assignmentKind === "staff"
          ? "event_staff_assignment"
          : "event_team_assignment";
        const { data: existing, error: lookupError } = await auth.service
          .from(table)
          .select("id,event_id,branch_id,starts_at,ends_at,revoked_at")
          .eq("id", eventSuffix[1])
          .eq("event_id", nestedEventId)
          .eq("branch_id", branchId)
          .maybeSingle();
        if (lookupError) {
          throw new Error("EVENT_ASSIGNMENT_REVOKE_LOOKUP_FAILED");
        }
        if (!existing) {
          return fail("NOT_FOUND", "Assignment not found.", 404, origin, id);
        }
        if (existing.revoked_at) {
          return response(
            { data: existing, already_revoked: true, request_id: id },
            200,
            origin,
            id,
          );
        }
        const revokedAt = new Date(
          Math.max(Date.now(), Date.parse(existing.starts_at)),
        ).toISOString();
        const { data, error } = await auth.service.from(table)
          .update({ revoked_at: revokedAt })
          .eq("id", eventSuffix[1])
          .eq("event_id", nestedEventId)
          .eq("branch_id", branchId)
          .is("revoked_at", null)
          .select("id,event_id,branch_id,starts_at,ends_at,revoked_at")
          .maybeSingle();
        if (error) throw new Error("EVENT_ASSIGNMENT_REVOKE_FAILED");
        if (!data) {
          return fail(
            "ASSIGNMENT_CHANGED",
            "The assignment changed. Refresh and try again.",
            409,
            origin,
            id,
          );
        }
        return response(
          { data, already_revoked: false, request_id: id },
          200,
          origin,
          id,
        );
      }
    }

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
