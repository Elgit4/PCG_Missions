/**
 * PCG Missions CMI v2.1 browser API adapter.
 *
 * This client only calls approved Edge Function routes. It never connects to
 * Postgres directly and never accepts service-role/provider credentials.
 * Supply an access-token provider backed by the approved Supabase Auth client.
 */
export interface CmiApiConfig {
  supabaseUrl: string;
  publishableKey: string;
}

export type AccessTokenProvider = () => Promise<string | null>;

export interface ApiEnvelope<T> {
  data: T;
  request_id: string;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
  request_id?: string;
}

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

export interface TaskCreateInput {
  branch_id: string;
  contact_id: string;
  client_request_id: string;
  list_id?: string | null;
  assignee_user_id?: string | null;
  team_id?: string | null;
  priority: number;
  due_at?: string | null;
  task_note?: string | null;
}

export interface TaskUpdateInput {
  priority?: number;
  due_at?: string | null;
  task_note?: string | null;
  status?: "open" | "in_progress" | "completed" | "cancelled";
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
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export class CmiApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: CmiApiConfig,
    private readonly getAccessToken: AccessTokenProvider,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = `${normalizeBaseUrl(config.supabaseUrl)}/functions/v1`;
    if (!config.supabaseUrl.trim() || !config.publishableKey.trim()) {
      throw new Error("PCG Missions API configuration is incomplete.");
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
    const url = new URL(`${this.baseUrl}/${functionName}${suffix}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    const headers = new Headers({
      apikey: this.config.publishableKey,
      Accept: "application/json",
      "Cache-Control": "no-store",
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

    const payload = parseJson(await response.text()) as ApiEnvelope<T> & ApiErrorBody | null;
    const requestId = payload?.request_id ?? response.headers.get("X-Request-Id");
    if (!response.ok) {
      const code = payload?.error?.code ?? `HTTP_${response.status}`;
      const message = payload?.error?.message ?? "The request could not be completed.";
      throw new CmiApiError(response.status, code, message, requestId ?? null);
    }
    if (!payload || !("data" in payload)) {
      throw new CmiApiError(502, "INVALID_RESPONSE", "The server returned an unexpected response.", requestId ?? null);
    }
    return payload;
  }

  getStaffSession(): Promise<ApiEnvelope<StaffSession>> {
    return this.request<StaffSession>("staff-session", "");
  }

  listContacts(branchId: string, options: { limit?: number; offset?: number; search?: string } = {}) {
    return this.request<ContactRecord[]>("staff-operations", "/contacts", {
      query: { branch_id: branchId, limit: options.limit ?? 25, offset: options.offset ?? 0, search: options.search },
    });
  }

  getContact(branchId: string, contactId: string) {
    return this.request<ContactRecord>("staff-operations", `/contacts/${encodeURIComponent(contactId)}`, {
      query: { branch_id: branchId },
    });
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
    return this.request<FollowUpTask>("staff-operations", "/followup/tasks", { method: "POST", body: input });
  }

  updateFollowUpTask(branchId: string, taskId: string, input: TaskUpdateInput) {
    return this.request<FollowUpTask>("staff-operations", `/followup/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  reassignFollowUpTask(
    branchId: string,
    taskId: string,
    input: { assignee_user_id?: string | null; team_id?: string | null },
  ) {
    return this.request<FollowUpTask>("staff-operations", `/followup/tasks/${encodeURIComponent(taskId)}/reassign`, {
      method: "POST", query: { branch_id: branchId }, body: input,
    });
  }

  listStaffDirectory(branchId: string, options: { limit?: number; offset?: number; search?: string } = {}) {
    return this.request<unknown[]>("staff-operations", "/staff", {
      query: { branch_id: branchId, limit: options.limit ?? 25, offset: options.offset ?? 0, search: options.search },
    });
  }

  readPrayerRequest(branchId: string, requestId: string, accessMode: "assigned" | "oversight", reasonCode?: string) {
    return this.request<unknown>("pastoral-operations", `/prayer/requests/${encodeURIComponent(requestId)}/read`, {
      method: "POST",
      body: { branch_id: branchId, access_mode: accessMode, ...(reasonCode ? { reason_code: reasonCode } : {}) },
    });
  }

  readCareRecord(branchId: string, recordId: string, accessMode: "assigned" | "oversight", reasonCode?: string) {
    return this.request<unknown>("pastoral-operations", `/care/records/${encodeURIComponent(recordId)}/read`, {
      method: "POST",
      body: { branch_id: branchId, access_mode: accessMode, ...(reasonCode ? { reason_code: reasonCode } : {}) },
    });
  }

  getPublicContent<T = unknown>(resource: string, query: Record<string, string | number | undefined> = {}) {
    return this.request<T>("public-content", "", {
      authenticated: false,
      query: { resource, ...query },
    });
  }
}


/** Build a configured client from browser-safe Vite variables. */
export function createConfiguredCmiApiClient(getAccessToken: AccessTokenProvider): CmiApiClient {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before connecting the staff API.");
  }
  return new CmiApiClient({ supabaseUrl, publishableKey }, getAccessToken);
}
