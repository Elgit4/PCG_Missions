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

export interface StaffPasswordResetRequest {
  id: string;
  email: string;
  full_name: string;
  requested_at: string;
  expires_at: string;
  status: "pending" | "processing";
}

export interface ContactRecord {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
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
  last_name: string;
  preferred_name?: string | null;
  phone_e164?: string | null;
  phone_display?: string | null;
  email_normalized?: string | null;
  age_range?: string | null;
  preferred_language?: string;
  service_area_id?: string | null;
  team_id?: string | null;
  source_metadata?: Record<string, unknown>;
}

export interface ContactUpdateInput {
  first_name?: string;
  last_name?: string;
  preferred_name?: string | null;
  age_range?: string | null;
  preferred_language?: string | null;
  service_area_id?: string | null;
  phone_e164?: string | null;
  phone_display?: string | null;
  email_normalized?: string | null;
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
    const url = new URL(`${this.baseUrl}/${functionName}${suffix}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    const headers = new Headers({
      apikey: this.config.publishableKey,
      Accept: "application/json",
    });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
      });
    } catch {
      throw new CmiApiError(0, "NETWORK_ERROR", "Unable to reach PCG Missions. Check your connection and try again.", null);
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
    return this.request<unknown[]>("staff-operations", "/staff", {
      query: { branch_id: branchId, limit: options.limit ?? 25, offset: options.offset ?? 0, search: options.search },
    });
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
