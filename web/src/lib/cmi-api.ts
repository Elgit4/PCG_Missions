/**
 * PCG Missions browser API adapter.
 * Business authorization and record scoping are enforced by the Cloudflare Worker.
 * Authentication is carried by Better Auth HttpOnly cookies; this client never
 * reads or stores session tokens in JavaScript-accessible storage.
 */
export interface CmiApiConfig {
  apiUrl?: string;
}
export type AccessTokenProvider = () => Promise<string | null>;
export interface ApiEnvelope<T> {
  data: T;
  request_id: string;
  /** Exact matching record count returned by paginated list endpoints. */
  total?: number;
}
export interface ApiErrorBody { error?: { code?: string; message?: string }; request_id?: string }

export class CmiApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, requestId: string | null) {
    super(message);
    this.name = "CmiApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface StaffSession {
  user: { id: string; email: string | null };
  staff: {
    id: string;
    auth_user_id: string;
    full_name: string;
    email: string | null;
    account_status: "active";
  };
  branches: Array<{ id: string; name: string; timezone: string }>;
  roles: Array<{ code: string; name: string; branch_id: string }>;
  capabilities: Array<{ code: string; scope_mode: string; branch_id: string }>;
  must_change_password: boolean;
  password_setup_expires_at: string | null;
}

export interface StaffDirectoryEntry {
  id: string;
  full_name: string;
  account_status: "active" | "inactive";
  roles: Array<{ code: string; name: string }>;
}

export interface StaffAccountCreateInput {
  branch_id: string;
  full_name: string;
  email: string;
  role_code: "admin_pastor" | "coordinator" | "team_leader" | "field_worker" | "follow_up_volunteer" | "prayer_intercessor";
  reason: string;
}

export interface StaffPasswordResetRequest {
  id: string;
  email: string;
  full_name: string;
  requested_at: string;
  expires_at: string;
  status: "pending" | "processing";
}

export interface EventDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
  status: "draft";
  visibility: "private";
  registration_state: "closed";
  created_at: string;
  updated_at: string;
  flyer_url: string | null;
  flyer_content_type?: string | null;
  flyer_size?: number | null;
}
export interface EventDraftCreateInput {
  branch_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
}
export type EventDraftPatchInput = Partial<Omit<EventDraftCreateInput, "branch_id">>;

export interface CalendarEntryRecord {
  id: string;
  branch_id: string;
  entry_type: "service" | "event" | "other";
  title: string;
  starts_at: string;
  ends_at: string | null;
  scope_type: "branch";
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface CalendarEntryCreateInput {
  branch_id: string;
  entry_type: CalendarEntryRecord["entry_type"];
  title: string;
  starts_at: string;
  ends_at: string | null;
}
export type CalendarEntryPatchInput = Partial<Omit<CalendarEntryCreateInput, "branch_id">>;

export interface AnnouncementInboxRecord {
  delivery_id: string;
  announcement_id: string;
  branch_id: string;
  title: string;
  body: string;
  audience_type: string;
  published_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  is_read: number;
}
export interface PrayerRoomMessage {
  id: string;
  branch_id: string;
  author_profile_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface AnnouncementDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  body: string;
  is_public: false;
  audience_type: "branch" | "staff" | "team" | "event" | "public";
  status: "draft" | "scheduled" | "published" | "archived";
  created_at: string;
  updated_at: string;
}
export interface AnnouncementDraftCreateInput {
  branch_id: string;
  title: string;
  body: string;
  audience_type: "branch" | "staff";
}
export type AnnouncementDraftPatchInput = Partial<Pick<AnnouncementDraftCreateInput, "title" | "body">>;

export interface SermonDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  body: string;
  public_slug: string;
  status: "draft";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface SermonDraftCreateInput {
  branch_id: string;
  title: string;
  body: string;
  public_slug: string;
}
export type SermonDraftPatchInput = Partial<Pick<SermonDraftCreateInput, "title" | "body" | "public_slug">>;

export interface WelcomeMessageDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  body: string;
  display_order: number;
  status: "draft";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface WelcomeMessageDraftCreateInput {
  branch_id: string;
  title: string;
  body: string;
  display_order: number;
}
export type WelcomeMessageDraftPatchInput = Partial<Pick<WelcomeMessageDraftCreateInput, "title" | "body" | "display_order">>;

export interface TeamMemberRecord {
  id: string;
  team_id: string;
  staff_profile_id: string;
  membership_role: "member" | "leader";
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  staff: Pick<StaffDirectoryEntry, "id" | "full_name" | "account_status"> | null;
}
export interface TeamRecord {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  members: TeamMemberRecord[];
}
export interface TeamWorkspaceData { teams: TeamRecord[] }
export interface TeamCreateInput {
  branch_id: string;
  name: string;
  description: string | null;
}
export type TeamPatchInput = Partial<Pick<TeamCreateInput, "name" | "description">> & { is_active?: boolean };
export interface TeamMemberCreateInput {
  staff_profile_id: string;
  membership_role: "member" | "leader";
}
export interface TeamMemberRoleInput { membership_role: "member" | "leader" }

export interface AreaCoverageRecord {
  id: string;
  service_area_id: string;
  staff_profile_id: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  staff: Pick<StaffDirectoryEntry, "id" | "full_name" | "account_status"> | null;
}
export interface ServiceAreaRecord {
  id: string;
  branch_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  coverage: AreaCoverageRecord[];
}
export interface ServiceAreaWorkspaceData { areas: ServiceAreaRecord[] }
export type TeamMutationResult = Omit<TeamRecord, "members">;
export type TeamMembershipMutationResult = Omit<TeamMemberRecord, "staff">;
export type ServiceAreaMutationResult = Omit<ServiceAreaRecord, "coverage">;
export type AreaCoverageMutationResult = Omit<AreaCoverageRecord, "staff">;
export interface ServiceAreaCreateInput {
  branch_id: string;
  name: string;
  code: string | null;
}
export type ServiceAreaPatchInput = Partial<Pick<ServiceAreaCreateInput, "name" | "code">> & { is_active?: boolean };
export interface AreaCoverageCreateInput { staff_profile_id: string }

export interface ContactRecord {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name?: string | null;
  phone_e164?: string | null;
  phone_display?: string | null;
  email_normalized?: string | null;
  age_range?: string | null;
  preferred_language?: string | null;
  service_area_id?: string | null;
  contact_status: string;
  identity_redacted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ContactCreateInput {
  branch_id: string;
  client_request_id: string;
  first_name: string;
  last_name?: string | null;
  preferred_name?: string | null;
  phone_e164?: string | null;
  phone_display?: string | null;
  email_normalized?: string | null;
  age_range?: string | null;
  preferred_language?: string | null;
  service_area_id?: string | null;
  team_id?: string | null;
  source_metadata?: Record<string, unknown>;
}

export interface ContactUpdateInput {
  first_name?: string;
  last_name?: string | null;
  preferred_name?: string | null;
  age_range?: string | null;
  preferred_language?: string | null;
  service_area_id?: string | null;
  phone_e164?: string | null;
  phone_display?: string | null;
  email_normalized?: string | null;
}

export interface ContactNote {
  id: string;
  body: string;
  created_at: string;
  updated_at?: string;
}

export interface ContactInteraction {
  id: string;
  interaction_type: "call" | "visit" | "message" | "meeting" | "other";
  occurred_at: string;
  outcome_code: string | null;
  summary: string | null;
  next_action_at: string | null;
  created_at: string;
}

export interface ContactNoteCreateInput {
  body: string;
}

export interface ContactInteractionCreateInput {
  interaction_type: ContactInteraction["interaction_type"];
  occurred_at?: string | null;
  outcome_code?: string | null;
  summary?: string | null;
  next_action_at?: string | null;
}

export interface FollowUpTask {
  id: string;
  branch_id: string;
  contact_id: string;
  assignee_user_id?: string | null;
  team_id?: string | null;
  priority: number;
  due_at: string | null;
  task_note: string | null;
  status: "open" | "in_progress" | "completed" | "cancelled";
  created_at?: string;
  updated_at?: string;
}

interface TaskCreateBase {
  branch_id: string;
  contact_id: string;
  client_request_id: string;
  list_id?: string | null;
  priority: number;
  due_at?: string | null;
  task_note?: string | null;
}
export type TaskAssignmentTarget =
  | { assignee_user_id: string; team_id?: never }
  | { team_id: string; assignee_user_id?: never };
export type TaskCreateInput = TaskCreateBase & TaskAssignmentTarget;
export type TaskReassignmentInput = TaskAssignmentTarget;
export interface TaskUpdateInput {
  priority?: number;
  due_at?: string | null;
  task_note?: string | null;
  status?: FollowUpTask["status"];
}
export interface CmiRequestOptions {
  method?: "GET" | "POST" | "PATCH";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  authenticated?: boolean;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
function parseJson(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}
function assertExactlyOneTaskTarget(
  input: { assignee_user_id?: unknown; team_id?: unknown },
): asserts input is TaskReassignmentInput {
  const hasAssignee = typeof input.assignee_user_id === "string" && input.assignee_user_id.trim().length > 0;
  const hasTeam = typeof input.team_id === "string" && input.team_id.trim().length > 0;
  if (hasAssignee === hasTeam) {
    throw new TypeError("Exactly one non-empty task assignment target is required.");
  }
}

function requestErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/[\\r\\n]+/g, " ").slice(0, 140);
    return message ? `${error.name}: ${message}` : error.name;
  }
  return "Unknown network error";
}

export type MinistryReportType = "daily_evangelism" | "event_evangelism" | "weekly_ministry";
export type MinistryReportStatus = "draft" | "submitted" | "returned" | "approved";
export interface MinistryReportRecord {
  id: string;
  branch_id: string;
  report_type: MinistryReportType;
  period_start: string;
  period_end: string;
  author_profile_id: string;
  team_id: string | null;
  event_id: string | null;
  contacts_captured: number;
  gospel_presentations: number;
  decisions_for_christ: number;
  followup_required: number;
  followup_completed: number;
  visits_completed: number;
  calls_completed: number;
  events_supported: number;
  attendance_count: number;
  status: MinistryReportStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  review_history?: MinistryReportReviewEvent[];
}
export interface MinistryReportReviewEvent {
  id: string;
  actor_profile_id: string;
  decision: "approved" | "returned" | "comment" | "resubmitted";
  comment: string | null;
  created_at: string;
}
export interface MinistryReportCreateInput {
  branch_id: string;
  report_type: MinistryReportType;
  period_start: string;
  period_end: string;
  team_id?: string | null;
  event_id?: string | null;
  contacts_captured?: number;
  gospel_presentations?: number;
  decisions_for_christ?: number;
  followup_required?: number;
  followup_completed?: number;
  visits_completed?: number;
  calls_completed?: number;
  events_supported?: number;
  attendance_count?: number;
}
export interface MinistryReportReviewInput {
  decision: "approved" | "returned" | "comment";
  comment?: string | null;
}
export interface MinistryReportReviewResult {
  report: MinistryReportRecord;
  review_history: MinistryReportReviewEvent[];
}

export class CmiApiClient {
  private readonly baseUrl: string;

  constructor(
    config: CmiApiConfig,
    _getAccessToken: AccessTokenProvider = async () => null,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const configured = normalizeBaseUrl(config.apiUrl ?? "");
    this.baseUrl = configured || (typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const parsed = new URL(this.baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("The PCG Missions API URL must use HTTPS outside local development.");
    }
  }

  private workerPath(service: string, path: string): string {
    if (service === "staff-session") return "/api/v1/me";
    let route = path || "/";
    if (service === "calendar-operations") route = route.replace(/^\/entries(?=\/|$)/, "/calendar");
    if (service === "content-operations") {
      route = route.replace(/^\/(sermons|welcome-messages|daily-words|digital-tracts)(?=\/|$)/, "/content/$1");
    }
    if (service === "staff-access-operations") {
      route = route.replace(/^\/staff\/([^/]+)\/accounts\/(reactivate|deactivate|suspend)$/, "/staff/$1/$2");
    }
    if (service === "pastoral-operations") {
      route = route.replace(/^\/care\/records(?=\/|$)/, "/care");
      route = route.replace(/^\//, "/pastoral/");
      if (/^\/pastoral\/care\/[^/]+\/read$/.test(route)) {
        throw new CmiApiError(501, "CARE_NARRATIVE_READ_DISABLED", "Pastoral-care narrative reads remain disabled until the explicit-share audit flow is accepted.", null);
      }
    }
    if (service === "public-content") return "/api/public/content";
    if (service === "staff-auth") {
      route = route.replace(/^\/admin\/staff(?=\/|$)/, "/staff/invitations");
      if (route.startsWith("/admin/password-reset-requests")) {
        throw new CmiApiError(501, "ADMIN_APPROVED_RECOVERY_NOT_MIGRATED", "Administrator-approved password recovery is not yet available on the Cloudflare Worker.", null);
      }
    }
    return `/api/v1${route.startsWith("/") ? route : `/${route}`}`;
  }

  private async send(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      return await this.fetcher(url, { ...init, credentials: "include", signal: controller.signal });
    } catch (error) {
      throw new CmiApiError(0, "NETWORK_ERROR", requestErrorDetail(error), null);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request<T>(
    functionName: string,
    path: string,
    options: CmiRequestOptions = {},
  ): Promise<ApiEnvelope<T>> {
    const url = new URL(this.workerPath(functionName, path), this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (key === "branch_id" && (functionName === "event-operations" || functionName === "calendar-operations")) continue; // these Worker list handlers accept branch scope only through X-Branch-Id
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ Accept: "application/json" });
    const branchId = options.query?.branch_id;
    if (typeof branchId === "string" && branchId) headers.set("X-Branch-Id", branchId);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await this.send(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof CmiApiError) throw error;
      throw new CmiApiError(0, "NETWORK_ERROR", "Unable to reach PCG Missions.", null);
    }

    const payload = parseJson(await response.text()) as (ApiEnvelope<T> & ApiErrorBody & Record<string, unknown>) | null;
    const requestId = payload?.request_id ?? response.headers.get("X-Request-Id");
    if (!response.ok || payload?.ok === false || payload?.error) {
      throw new CmiApiError(
        response.status || 500,
        payload?.error && typeof payload.error === "object" ? payload.error.code ?? `HTTP_${response.status}` : `HTTP_${response.status}`,
        payload?.error && typeof payload.error === "object" ? payload.error.message ?? "The request could not be completed." : "The request could not be completed.",
        requestId ?? null,
      );
    }
    if (!payload || typeof payload !== "object") {
      throw new CmiApiError(502, "INVALID_RESPONSE", "The server returned an unexpected response.", requestId ?? null);
    }
    const data = "data" in payload ? payload.data as T : payload as unknown as T;
    return { data, request_id: requestId ?? "worker-request", ...(typeof payload.total === "number" ? { total: payload.total } : {}) };
  }

  async getStaffSession(): Promise<ApiEnvelope<StaffSession>> {
    const first = await this.request<Record<string, unknown>>("staff-session", "");
    const context = first.data as Record<string, unknown>;
    const staff = context.staff as Record<string, unknown> | undefined;
    const branches = Array.isArray(staff?.branches) ? staff.branches as StaffSession["branches"] : [];
    let active = context;
    if (branches[0]?.id) {
      const selected = await this.fetcher(new URL("/api/v1/me", this.baseUrl), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json", "X-Branch-Id": branches[0].id },
      });
      const parsed = parseJson(await selected.text()) as (Record<string, unknown> & ApiErrorBody) | null;
      if (!selected.ok || !parsed) {
        const code = parsed?.error?.code ?? `HTTP_${selected.status}`;
        const message = parsed?.error?.message ?? "The selected branch context could not be loaded.";
        throw new CmiApiError(selected.status || 502, code, message, parsed?.request_id ?? null);
      }
      active = parsed;
    }
    const activeBranch = active.active_branch as Record<string, unknown> | null | undefined;
    const userId = String(staff?.userId ?? "");
    const profileId = String(staff?.profileId ?? "");
    const roleCodes = Array.isArray(activeBranch?.roles) ? activeBranch.roles as string[] : [];
    const capabilities = Array.isArray(activeBranch?.capabilities) ? activeBranch.capabilities as Array<Record<string, unknown>> : [];
    const data: StaffSession = {
      user: { id: userId, email: typeof staff?.email === "string" ? staff.email : null },
      staff: {
        id: profileId,
        auth_user_id: userId,
        full_name: String(staff?.fullName ?? ""),
        email: typeof staff?.email === "string" ? staff.email : null,
        account_status: "active",
      },
      branches,
      roles: roleCodes.map((code) => ({
        code,
        name: code.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        branch_id: String(activeBranch?.branchId ?? branches[0]?.id ?? ""),
      })),
      capabilities: capabilities.map((item) => ({
        code: String(item.code ?? ""),
        scope_mode: String(item.scopeMode ?? ""),
        branch_id: String(activeBranch?.branchId ?? branches[0]?.id ?? ""),
      })),
      must_change_password: false,
      password_setup_expires_at: null,
    };
    return { data, request_id: String(active.request_id ?? first.request_id) };
  }

  listContacts(branchId: string, options: { limit?: number; offset?: number; search?: string } = {}) {
    return this.request<ContactRecord[]>("staff-operations", "/contacts", {
      query: { branch_id: branchId, limit: options.limit ?? 25, offset: options.offset ?? 0, search: options.search },
    });
  }
  getContact(branchId: string, contactId: string) {
    return this.request<ContactRecord>("staff-operations", `/contacts/${encodeURIComponent(contactId)}`, { query: { branch_id: branchId } });
  }
  createContact(input: ContactCreateInput) {
    return this.request<ContactRecord>("staff-operations", "/contacts", { method: "POST", body: input });
  }
  updateContact(branchId: string, contactId: string, input: ContactUpdateInput) {
    return this.request<ContactRecord>("staff-operations", `/contacts/${encodeURIComponent(contactId)}`, {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listContactNotes(branchId: string, contactId: string) {
    return this.request<ContactNote[]>(
      "staff-operations",
      `/contacts/${encodeURIComponent(contactId)}/notes`,
      { query: { branch_id: branchId } },
    );
  }
  createContactNote(branchId: string, contactId: string, input: ContactNoteCreateInput) {
    return this.request<ContactNote>(
      "staff-operations",
      `/contacts/${encodeURIComponent(contactId)}/notes`,
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }
  listContactInteractions(branchId: string, contactId: string) {
    return this.request<ContactInteraction[]>(
      "staff-operations",
      `/contacts/${encodeURIComponent(contactId)}/interactions`,
      { query: { branch_id: branchId } },
    );
  }
  createContactInteraction(
    branchId: string,
    contactId: string,
    input: ContactInteractionCreateInput,
  ) {
    return this.request<ContactInteraction>(
      "staff-operations",
      `/contacts/${encodeURIComponent(contactId)}/interactions`,
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }

  listFollowUpTasks(branchId: string, options: { limit?: number; offset?: number; status?: FollowUpTask["status"] } = {}) {
    return this.request<FollowUpTask[]>("staff-operations", "/followup/tasks", {
      query: { branch_id: branchId, limit: options.limit ?? 25, offset: options.offset ?? 0, status: options.status },
    });
  }
  createFollowUpTask(input: TaskCreateInput) {
    assertExactlyOneTaskTarget(input);
    return this.request<FollowUpTask>("staff-operations", "/followup/tasks", { method: "POST", body: input });
  }
  updateFollowUpTask(branchId: string, taskId: string, input: TaskUpdateInput) {
    return this.request<FollowUpTask>("staff-operations", `/followup/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }
  reassignFollowUpTask(branchId: string, taskId: string, input: TaskReassignmentInput) {
    assertExactlyOneTaskTarget(input);
    return this.request<FollowUpTask>("staff-operations", `/followup/tasks/${encodeURIComponent(taskId)}/reassign`, {
      method: "POST", query: { branch_id: branchId }, body: input,
    });
  }

  listStaffDirectory(branchId: string, options: { limit?: number; offset?: number; search?: string } = {}) {
    return this.request<StaffDirectoryEntry[]>("staff-operations", "/staff", {
      query: { branch_id: branchId, limit: options.limit ?? 25, offset: options.offset ?? 0, search: options.search },
    });
  }

  createStaffAccount(input: StaffAccountCreateInput) {
    return this.request<{
      staff_profile_id: string;
      email: string;
      role_code: StaffAccountCreateInput["role_code"];
      invitation_email_sent: boolean;
      must_change_password: boolean;
    }>("staff-auth", "/admin/staff", { method: "POST", body: input });
  }

    setStaffAccountStatus(
    staffProfileId: string,
    branchId: string,
    status: "active" | "inactive",
    reason: string,
  ) {
    const action = status === "active" ? "reactivate" : "deactivate";
    return this.request<{
      staff_profile_id: string;
      branch_id: string;
      account_status: "active" | "inactive";
      no_change?: boolean;
    }>(
      "staff-access-operations",
      `/staff/${encodeURIComponent(staffProfileId)}/accounts/${action}`,
      { method: "POST", body: { branch_id: branchId, reason } },
    );
  }

  listStaffPasswordResetRequests(branchId: string) {
    return this.request<StaffPasswordResetRequest[]>(
      "staff-auth",
      "/admin/password-reset-requests",
      { query: { branch_id: branchId } },
    );
  }
  approveStaffPasswordResetRequest(branchId: string, requestId: string, reason: string) {
    return this.request<{ status: string; temporary_password_sent: boolean; must_change_password: boolean }>(
      "staff-auth",
      `/admin/password-reset-requests/${encodeURIComponent(requestId)}/approve`,
      { method: "POST", body: { branch_id: branchId, reason } },
    );
  }
  denyStaffPasswordResetRequest(branchId: string, requestId: string, reason: string) {
    return this.request<{ status: string }>(
      "staff-auth",
      `/admin/password-reset-requests/${encodeURIComponent(requestId)}/deny`,
      { method: "POST", body: { branch_id: branchId, reason } },
    );
  }
  listReportTeams(branchId: string) {
    return this.request<Array<{ id: string; name: string }>>("report-operations", "/teams", {
      query: { branch_id: branchId },
    });
  }
  listReportEvents(branchId: string) {
    return this.request<Array<{ id: string; title: string; starts_at: string }>>("report-operations", "/events", {
      query: { branch_id: branchId },
    });
  }
  listMinistryReports(branchId: string, options: {
    report_type?: MinistryReportType;
    status?: Exclude<MinistryReportStatus, "draft">;
    limit?: number;
    offset?: number;
  } = {}) {
    return this.request<MinistryReportRecord[]>("report-operations", "/reports", {
      query: { branch_id: branchId, ...options },
    });
  }
  getMinistryReport(branchId: string, reportId: string) {
    return this.request<MinistryReportRecord>("report-operations", "/reports/" + encodeURIComponent(reportId), {
      query: { branch_id: branchId },
    });
  }
  createMinistryReport(input: MinistryReportCreateInput) {
    return this.request<MinistryReportRecord>("report-operations", "/reports", {
      method: "POST", body: input,
    });
  }
  resubmitMinistryReport(reportId: string, counts: Omit<MinistryReportCreateInput,
    "branch_id" | "report_type" | "period_start" | "period_end" | "team_id" | "event_id"
  >) {
    return this.request<MinistryReportReviewResult>(
      "report-operations",
      "/reports/" + encodeURIComponent(reportId) + "/resubmit",
      { method: "POST", body: counts },
    );
  }
  reviewMinistryReport(reportId: string, input: MinistryReportReviewInput) {
    return this.request<MinistryReportReviewResult>(
      "report-operations",
      "/reports/" + encodeURIComponent(reportId) + "/review",
      { method: "POST", body: input },
    );
  }

  listEventDrafts(branchId: string, options: { limit?: number } = {}) {
    return this.request<{events:EventDraftRecord[]}>("event-operations", "/events", {
      query: { branch_id: branchId, status:"draft", limit: options.limit ?? 50 },
    }).then(result=>({...result,data:result.data.events}));
  }
  createEventDraft(input: EventDraftCreateInput) {
    const {branch_id,...body}=input;
    return this.request<{event:EventDraftRecord}>("event-operations", "/events", { method: "POST", query:{branch_id}, body });
  }
  uploadEventFlyer(branchId:string,eventId:string,file:File) {
    const url=new URL(this.workerPath("event-operations","/events/"+encodeURIComponent(eventId)+"/flyer"),this.baseUrl);
    const headers=new Headers({Accept:"application/json","X-Branch-Id":branchId});
    const form=new FormData(); form.set("file",file);
    return this.send(url,{method:"POST",headers,body:form,cache:"no-store"}).then(async response=>{
      const payload=parseJson(await response.text()) as (ApiEnvelope<{flyer_url:string}> & ApiErrorBody & Record<string,unknown>)|null;
      if(!response.ok||payload?.ok===false||payload?.error) throw new CmiApiError(response.status||500,payload?.error?.code??"EVENT_FLYER_UPLOAD_FAILED",payload?.error?.message??"The event image could not be uploaded.",payload?.request_id??response.headers.get("X-Request-Id"));
      if(!payload||typeof payload!=="object") throw new CmiApiError(502,"INVALID_RESPONSE","The server returned an unexpected response.",null);
      return {data:("data" in payload?payload.data:payload) as {flyer_url:string},request_id:payload.request_id??"worker-request"};
    });
  }
  updateEventDraft(branchId: string, eventId: string, input: EventDraftPatchInput) {
    return this.request<EventDraftRecord>("event-operations", "/events/" + encodeURIComponent(eventId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listCalendarEntries(branchId: string, options: { limit?: number } = {}) {
    return this.request<{entries:CalendarEntryRecord[]}>("calendar-operations", "/entries", {
      query: { branch_id: branchId, limit: options.limit ?? 50 },
    }).then(result=>({...result,data:result.data.entries}));
  }
  createCalendarEntry(input: CalendarEntryCreateInput) {
    const {branch_id,...body}=input;
    return this.request<{entry_id:string}>("calendar-operations", "/entries", { method: "POST", query:{branch_id}, body:{...body,scope_type:"branch"} });
  }
  updateCalendarEntry(branchId: string, entryId: string, input: CalendarEntryPatchInput) {
    return this.request<CalendarEntryRecord>("calendar-operations", "/entries/" + encodeURIComponent(entryId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listAnnouncementInbox(branchId: string) {
    return this.request<{ announcements: AnnouncementInboxRecord[] }>("announcement-operations", "/announcements/inbox", {
      query: { branch_id: branchId },
    });
  }
  markAnnouncementRead(branchId: string, announcementId: string) {
    return this.request<unknown>("announcement-operations", "/announcements/" + encodeURIComponent(announcementId) + "/read", {
      method: "POST", query: { branch_id: branchId },
    });
  }

  getPushPublicKey(branchId: string) {
    return this.request<{ public_key: string }>("notification-push", "/notifications/push/public-key", {
      query: { branch_id: branchId },
    });
  }
  savePushSubscription(branchId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.request<{ subscribed: boolean }>("notification-push", "/notifications/push/subscriptions", {
      method: "POST", query: { branch_id: branchId }, body: subscription,
    });
  }
  removePushSubscription(branchId: string, endpoint: string) {
    return this.request<{ unsubscribed: boolean }>("notification-push", "/notifications/push/unsubscribe", {
      method: "POST", query: { branch_id: branchId }, body: { endpoint },
    });
  }

  listPrayerRoomMessages(branchId: string, limit = 80) {
    return this.request<{ messages: PrayerRoomMessage[] }>("prayer-room", "/prayer-room/messages", {
      query: { branch_id: branchId, limit },
    });
  }
  postPrayerRoomMessage(branchId: string, body: string) {
    return this.request<{ message: PrayerRoomMessage }>("prayer-room", "/prayer-room/messages", {
      method: "POST", query: { branch_id: branchId }, body: { body },
    });
  }

  listAnnouncementDrafts(branchId: string, options: { limit?: number; offset?: number; status?: "published" | "all" } = {}) {
    return this.request<{announcements:AnnouncementDraftRecord[]}>("announcement-operations", "/announcements", {
      query: { branch_id:branchId, limit: options.limit ?? 50, offset:options.offset??0, status: options.status ?? "published" },
    }).then(result=>({...result,data:result.data.announcements}));
  }
  createAnnouncementDraft(input: AnnouncementDraftCreateInput) {
    const { branch_id, ...body } = input;
    return this.request<AnnouncementDraftRecord>("announcement-operations", "/announcements", {
      method: "POST", query: { branch_id }, body,
    });
  }
  publishAnnouncementDraft(branchId: string, announcementId: string) {
    return this.request<{ announcement_id: string; published_at?: string }>("announcement-operations", "/announcements/" + encodeURIComponent(announcementId) + "/publish", {
      method: "POST", query: { branch_id: branchId },
    });
  }
  updateAnnouncementDraft(branchId: string, announcementId: string, input: AnnouncementDraftPatchInput) {
    return this.request<AnnouncementDraftRecord>("announcement-operations", "/announcements/" + encodeURIComponent(announcementId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listSermonDrafts(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<SermonDraftRecord[]>("content-operations", "/sermons", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createSermonDraft(input: SermonDraftCreateInput) {
    return this.request<SermonDraftRecord>("content-operations", "/sermons", { method: "POST", body: input });
  }
  updateSermonDraft(branchId: string, sermonId: string, input: SermonDraftPatchInput) {
    return this.request<SermonDraftRecord>("content-operations", "/sermons/" + encodeURIComponent(sermonId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listWelcomeMessageDrafts(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<WelcomeMessageDraftRecord[]>("content-operations", "/welcome-messages", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createWelcomeMessageDraft(input: WelcomeMessageDraftCreateInput) {
    return this.request<WelcomeMessageDraftRecord>("content-operations", "/welcome-messages", { method: "POST", body: input });
  }
  updateWelcomeMessageDraft(branchId: string, messageId: string, input: WelcomeMessageDraftPatchInput) {
    return this.request<WelcomeMessageDraftRecord>("content-operations", "/welcome-messages/" + encodeURIComponent(messageId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listTeams(branchId: string) {
    return this.request<TeamWorkspaceData>("team-operations", "/teams", {
      query: { branch_id: branchId },
    });
  }
  createTeam(input: TeamCreateInput) {
    const {branch_id,...body}=input;
    return this.request<{team:TeamMutationResult}>("team-operations", "/teams", {
      method: "POST", query:{branch_id}, body,
    });
  }
  updateTeam(branchId: string, teamId: string, input: TeamPatchInput) {
    return this.request<TeamMutationResult>("team-operations", "/teams/" + encodeURIComponent(teamId), {
      method: "PATCH",
      query: { branch_id: branchId },
      body: input,
    });
  }
  addTeamMember(branchId: string, teamId: string, input: TeamMemberCreateInput) {
    return this.request<TeamMembershipMutationResult>("team-operations", "/teams/" + encodeURIComponent(teamId) + "/members", {
      method: "POST",
      query: { branch_id: branchId },
      body: input,
    });
  }
  updateTeamMemberRole(branchId: string, teamId: string, membershipId: string, input: TeamMemberRoleInput) {
    return this.request<TeamMembershipMutationResult>("team-operations", "/teams/" + encodeURIComponent(teamId) + "/members/" + encodeURIComponent(membershipId), {
      method: "PATCH",
      query: { branch_id: branchId },
      body: input,
    });
  }
  revokeTeamMember(branchId: string, teamId: string, membershipId: string) {
    return this.request<TeamMembershipMutationResult>("team-operations", "/teams/" + encodeURIComponent(teamId) + "/members/" + encodeURIComponent(membershipId) + "/revoke", {
      method: "POST",
      query: { branch_id: branchId },
    });
  }

  listServiceAreas(branchId: string) {
    return this.request<ServiceAreaWorkspaceData>("team-operations", "/areas", {
      query: { branch_id: branchId },
    });
  }
  createServiceArea(input: ServiceAreaCreateInput) {
    const {branch_id,...body}=input;
    return this.request<{area:ServiceAreaMutationResult}>("team-operations", "/areas", {
      method: "POST", query:{branch_id}, body,
    });
  }
  updateServiceArea(branchId: string, areaId: string, input: ServiceAreaPatchInput) {
    return this.request<ServiceAreaMutationResult>("team-operations", "/areas/" + encodeURIComponent(areaId), {
      method: "PATCH",
      query: { branch_id: branchId },
      body: input,
    });
  }
  addAreaCoverage(branchId: string, areaId: string, input: AreaCoverageCreateInput) {
    return this.request<AreaCoverageMutationResult>("team-operations", "/areas/" + encodeURIComponent(areaId) + "/coverage", {
      method: "POST",
      query: { branch_id: branchId },
      body: input,
    });
  }
  revokeAreaCoverage(branchId: string, areaId: string, coverageId: string) {
    return this.request<AreaCoverageMutationResult>("team-operations", "/areas/" + encodeURIComponent(areaId) + "/coverage/" + encodeURIComponent(coverageId) + "/revoke", {
      method: "POST",
      query: { branch_id: branchId },
    });
  }

  readPrayerRequest(branchId: string, requestId: string, accessMode: "assigned" | "oversight", reasonCode?: string) {
    return this.request<unknown>("pastoral-operations", `/prayer/requests/${encodeURIComponent(requestId)}/read`, {
      method: "POST", body: { branch_id: branchId, access_mode: accessMode, ...(reasonCode ? { reason_code: reasonCode } : {}) },
    });
  }
  readCareRecord(branchId: string, recordId: string, accessMode: "assigned" | "oversight", reasonCode?: string) {
    return this.request<unknown>("pastoral-operations", `/care/records/${encodeURIComponent(recordId)}/read`, {
      method: "POST", body: { branch_id: branchId, access_mode: accessMode, ...(reasonCode ? { reason_code: reasonCode } : {}) },
    });
  }
  getPublicContent<T = unknown>(resource: string, query: Record<string, string | number | undefined> = {}) {
    return this.request<T>("public-content", "", { authenticated: false, query: { resource, ...query } });
  }
}

export function createConfiguredCmiApiClient(getAccessToken: AccessTokenProvider): CmiApiClient {
  const apiUrl = import.meta.env.VITE_CMI_API_URL ?? "";
  return new CmiApiClient({ apiUrl }, getAccessToken);
}
