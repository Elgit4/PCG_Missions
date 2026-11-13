/**
 * PCG Missions CMI v2.1 browser API adapter.
 *
 * Browser clients use a publishable key and a Supabase Auth access token only.
 * All business authorization is performed by the Edge Functions; this adapter
 * never talks directly to Postgres or carries service-role/provider secrets.
 */
export interface CmiApiConfig {
  supabaseUrl: string;
  publishableKey: string;
}
export type AccessTokenProvider = () => Promise<string | null>;
export interface ApiEnvelope<T> { data: T; request_id: string }
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

export interface AnnouncementDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  body: string;
  is_public: false;
  status: "draft";
  created_at: string;
  updated_at: string;
}
export interface AnnouncementDraftCreateInput {
  branch_id: string;
  title: string;
  body: string;
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

function xhrRequest(url: string | URL, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === "undefined") {
      reject(new TypeError("XMLHttpRequest is unavailable in this browser."));
      return;
    }
    const request = new XMLHttpRequest();
    request.open(init.method ?? "GET", String(url), true);
    request.timeout = 15000;
    new Headers(init.headers).forEach((value, key) => request.setRequestHeader(key, value));
    request.onload = () => {
      try {
        if (request.status === 0) {
          reject(new TypeError("XMLHttpRequest completed without an HTTP response."));
          return;
        }
        const responseHeaders = new Headers();
        // XHR exposes response headers separated by CRLF. Split on actual
        // line breaks, not the literal characters "\\r" and "\\n".
        for (const line of request.getAllResponseHeaders().split(/\r?\n/)) {
          const separator = line.indexOf(":");
          if (separator <= 0) continue;
          const name = line.slice(0, separator).trim();
          const value = line.slice(separator + 1).trim();
          if (!name) continue;
          try {
            responseHeaders.append(name, value);
          } catch {
            // Ignore browser-restricted response headers; preserve status/body.
          }
        }
        resolve(new Response(request.responseText, {
          status: request.status,
          statusText: request.statusText,
          headers: responseHeaders,
        }));
      } catch (error) {
        reject(error instanceof Error ? error : new TypeError("Unable to read the XHR response."));
      }
    };
    request.onerror = () => reject(new TypeError("XMLHttpRequest network error."));
    request.ontimeout = () => reject(new TypeError("XMLHttpRequest timed out."));
    request.onabort = () => reject(new TypeError("XMLHttpRequest was aborted."));
    if (init.body === undefined || init.body === null) request.send();
    else request.send(init.body as XMLHttpRequestBodyInit);
  });
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
    private readonly config: CmiApiConfig,
    private readonly getAccessToken: AccessTokenProvider,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const supabaseUrl = normalizeBaseUrl(config.supabaseUrl);
    if (!supabaseUrl || !config.publishableKey.trim()) {
      throw new Error("PCG Missions API configuration is incomplete.");
    }
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
      throw new Error("The Supabase URL must use HTTPS outside local development.");
    }
    this.baseUrl = `${supabaseUrl}/functions/v1`;
  }

  private async sendWithBrowserFallback(url: string | URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let fetchError: unknown;
    try {
      return await this.fetcher(url, { ...init, signal: controller.signal });
    } catch (error) {
      fetchError = error;
    } finally {
      clearTimeout(timeout);
    }

    // Do not let a browser fetch hang the staff portal indefinitely.
    try {
      return await xhrRequest(url, init);
    } catch (xhrError) {
      throw new CmiApiError(
        0,
        "NETWORK_ERROR",
        `Browser request failed or timed out. Fetch: ${requestErrorDetail(fetchError)}; XMLHttpRequest: ${requestErrorDetail(xhrError)}.`,
        null,
      );
    }
  }

  private async request<T>(
    functionName: string,
    path: string,
    options: CmiRequestOptions = {},
  ): Promise<ApiEnvelope<T>> {
    const authenticated = options.authenticated !== false;
    const token = authenticated ? await this.getAccessToken() : null;
    if (authenticated && !token) {
      throw new CmiApiError(401, "AUTH_REQUIRED", "Sign in to continue.", null);
    }
    const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
    const useSameOriginSessionProxy = functionName === "staff-session" &&
      typeof window !== "undefined" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1";
    const url = useSameOriginSessionProxy
      ? new URL("/api/auth?resource=staff-session", window.location.origin)
      : new URL(`${this.baseUrl}/${functionName}${suffix}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    const headers = new Headers({
      apikey: this.config.publishableKey,
      Accept: "application/json",
    });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    const requestInit: RequestInit = {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    };
    let response: Response;
    try {
      response = await this.sendWithBrowserFallback(url, requestInit);
    } catch (proxyError) {
      if (!useSameOriginSessionProxy) throw proxyError;
      // Keep session lookup available through the project's own HTTPS endpoint
      // if the same-origin Vercel path is unavailable to this browser.
      const directUrl = new URL(`${this.baseUrl}/${functionName}${suffix}`);
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined && value !== "") directUrl.searchParams.set(key, String(value));
      }
      try {
        response = await this.sendWithBrowserFallback(directUrl, requestInit);
      } catch (directError) {
        throw new CmiApiError(
          0,
          "NETWORK_ERROR",
          `Unable to reach PCG Missions. Proxy: ${requestErrorDetail(proxyError)}; Supabase: ${requestErrorDetail(directError)}.`,
          null,
        );
      }
    }

    const payload = parseJson(await response.text()) as (ApiEnvelope<T> & ApiErrorBody) | null;
    const requestId = payload?.request_id ?? response.headers.get("X-Request-Id");
    if (!response.ok) {
      throw new CmiApiError(
        response.status,
        payload?.error?.code ?? `HTTP_${response.status}`,
        payload?.error?.message ?? "The request could not be completed.",
        requestId ?? null,
      );
    }
    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      throw new CmiApiError(502, "INVALID_RESPONSE", "The server returned an unexpected response.", requestId ?? null);
    }
    return payload;
  }

  getStaffSession() { return this.request<StaffSession>("staff-session", ""); }

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
    return this.request<MinistryReportRecord>(
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

  listEventDrafts(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<EventDraftRecord[]>("event-operations", "/events", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createEventDraft(input: EventDraftCreateInput) {
    return this.request<EventDraftRecord>("event-operations", "/events", { method: "POST", body: input });
  }
  updateEventDraft(branchId: string, eventId: string, input: EventDraftPatchInput) {
    return this.request<EventDraftRecord>("event-operations", "/events/" + encodeURIComponent(eventId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listCalendarEntries(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<CalendarEntryRecord[]>("calendar-operations", "/entries", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createCalendarEntry(input: CalendarEntryCreateInput) {
    return this.request<CalendarEntryRecord>("calendar-operations", "/entries", { method: "POST", body: input });
  }
  updateCalendarEntry(branchId: string, entryId: string, input: CalendarEntryPatchInput) {
    return this.request<CalendarEntryRecord>("calendar-operations", "/entries/" + encodeURIComponent(entryId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listAnnouncementDrafts(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<AnnouncementDraftRecord[]>("announcement-operations", "/announcements", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createAnnouncementDraft(input: AnnouncementDraftCreateInput) {
    return this.request<AnnouncementDraftRecord>("announcement-operations", "/announcements", { method: "POST", body: input });
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
    return this.request<TeamMutationResult>("team-operations", "/teams", {
      method: "POST",
      body: input,
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
    return this.request<ServiceAreaMutationResult>("team-operations", "/areas", {
      method: "POST",
      body: input,
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
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before connecting the staff API.");
  }
  return new CmiApiClient({ supabaseUrl, publishableKey }, getAccessToken);
}
