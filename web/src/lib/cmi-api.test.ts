import { describe, expect, it, vi } from "vitest";
import { CmiApiClient } from "./cmi-api";

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, request_id: "cloudflare-test" }), {
    status, headers: { "Content-Type": "application/json" },
  });
}

describe("Cloudflare Worker API client", () => {
  it("uses same-origin HttpOnly cookie sessions for staff context", async () => {
    const fetcher = vi.fn(async () => response({ user: { id: "staff-user" }, branches: [] }));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    const result = await api.getStaffSession();
    expect(result.data.user.id).toBe("staff-user");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/v1/me");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(new Headers(init.headers).has("apikey")).toBe(false);
  });

  it("scopes contact reads by branch and sends no bearer token", async () => {
    const fetcher = vi.fn(async () => response([{ id: "contact-1" }]));
    const api = new CmiApiClient({}, async () => "ignored-token-provider", fetcher as typeof fetch);
    const result = await api.listContacts("branch-1");
    expect(result.data).toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/contacts");
    expect(parsed.searchParams.get("branch_id")).toBe("branch-1");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(init.credentials).toBe("include");
  });

  it("preserves idempotency keys and branch context for writes", async () => {
    const fetcher = vi.fn(async () => response({ id: "contact-2" }, 201));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await api.createContact({
      branch_id: "branch-1",
      first_name: "Alex",
      last_name: "Staff",
      preferred_name: null,
      phone_e164: null,
      email_normalized: null,
      age_range: null,
      preferred_language: null,
      service_area_id: null,
      source_metadata: null,
      client_request_id: "capture-idempotency-key",
    } as never);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/v1/contacts");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("capture-idempotency-key");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(init.credentials).toBe("include");
  });

  it("sends follow-up branch scope in the header without an unsupported branch_id query parameter", async () => {
    const fetcher = vi.fn(async () => response([]));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);

    await api.listFollowUpTasks("branch-1", { limit: 50, offset: 0 });

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/followup/tasks");
    expect(parsed.searchParams.get("limit")).toBe("50");
    expect(parsed.searchParams.get("offset")).toBe("0");
    expect([...parsed.searchParams.keys()]).toEqual(["limit", "offset"]);
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(init.credentials).toBe("include");
  });

  it("assigns a contact through the branch-scoped Worker route with a required reason", async () => {
    const fetcher = vi.fn(async () => response({
      assignment_id: "assignment-1",
      assignee_profile_id: "staff-profile-2",
      team_id: null,
      starts_at: "2026-11-23T12:00:00.000Z",
    }, 201));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    const result = await api.assignContact("branch-1", "contact-1", {
      assignee_profile_id: "staff-profile-2",
      reason: "Missions leader assigned this visitor for follow-up.",
    });
    expect(result.data.assignment_id).toBe("assignment-1");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/v1/contacts/contact-1/assign");
    expect(new URL(url).searchParams.get("branch_id")).toBe("branch-1");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(JSON.parse(String(init.body))).toEqual({
      assignee_profile_id: "staff-profile-2",
      reason: "Missions leader assigned this visitor for follow-up.",
    });
    expect(init.credentials).toBe("include");
  });

  it("rejects contact assignments without a valid reason before sending a request", async () => {
    const fetcher = vi.fn(async () => response({}));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    expect(() => api.assignContact("branch-1", "contact-1", {
      assignee_profile_id: "staff-profile-2",
      reason: "short",
    })).toThrow(/reason of 10–500 characters/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads only server-authorized follow-up team assignment targets", async () => {
    const fetcher = vi.fn(async () => response([{ id: "team-1", name: "Welcome Team" }]));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    const result = await api.listFollowUpAssignmentTeams("branch-1");
    expect(result.data).toEqual([{ id: "team-1", name: "Welcome Team" }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/v1/followup/assignment-teams");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(init.credentials).toBe("include");
  });

  it("routes follow-up handoffs through the branch-scoped Worker assignment endpoint", async () => {
    const fetcher = vi.fn(async () => response({ id: "task-1", assignee_user_id: "staff-user-2" }));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await api.reassignFollowUpTask("branch-1", "task-1", {
      assignee_profile_id: "staff-profile-2",
      reason: "Transfer to the assigned field worker for continuity.",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/v1/followup/tasks/task-1/assign");
    expect(new URL(url).searchParams.get("branch_id")).toBe("branch-1");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(JSON.parse(String(init.body))).toEqual({
      assignee_profile_id: "staff-profile-2",
      reason: "Transfer to the assigned field worker for continuity.",
    });
  });

  it("supports team-targeted follow-up handoffs without accepting both target types", async () => {
    const fetcher = vi.fn(async () => response({ id: "task-1", team_id: "team-2", assignee_user_id: null }));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await api.reassignFollowUpTask("branch-1", "task-1", {
      team_id: "team-2",
      reason: "Transfer responsibility to the active Welcome Team.",
    });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      team_id: "team-2",
      reason: "Transfer responsibility to the active Welcome Team.",
    });
    expect(() => api.reassignFollowUpTask("branch-1", "task-1", {
      team_id: "team-2",
      assignee_profile_id: "staff-2",
      reason: "Invalid dual assignment target.",
    } as never)).toThrow(/Exactly one task reassignment target/);
  });

  it("routes calendar cancellation through the branch-scoped Cloudflare Worker endpoint", async () => {
    const fetcher = vi.fn(async () => response({ entry_id: "entry-1", status: "cancelled" }));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await api.cancelCalendarEntry("branch-1", "entry-1", "Service moved to a different venue.");

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/calendar/entries/entry-1/cancel");
    expect(parsed.searchParams.get("branch_id")).toBe("branch-1");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ reason: "Service moved to a different venue." });
  });

  it("sends assigned Prayer inbox branch scope only in the trusted header", async () => {
    const fetcher = vi.fn(async () => response({ requests: [], total: 0, limit: 25, offset: 0 }));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);

    await api.listAssignedPrayerRequests("branch-1", { limit: 25, offset: 0 });

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/pastoral/prayer/assigned");
    expect([...parsed.searchParams.keys()]).toEqual(["limit", "offset"]);
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(init.credentials).toBe("include");
  });

  it("routes event-flyer uploads through the Worker using cookie credentials", async () => {
    const data = {
      object_path: "events/branch-1/event-1/flyer.png", mime_type: "image/png", size_bytes: 20,
      signed_url: "https://storage.example/private-flyer", signed_url_expires_in: 900,
    };
    const fetcher = vi.fn(async () => response(data));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    const file = new Blob(["01234567890123456789"], { type: "image/png" }) as File;
    const result = await api.uploadEventFlyer("branch-1", "event-1", file);
    expect(result.data.object_path).toContain("event-1");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/v1/events/event-1/flyer");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("routes notifications and event assignment reads to Cloudflare Worker endpoints", async () => {
    const fetcher = vi.fn(async () => response([]));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await api.listStaffNotifications("branch-1");
    await api.getEventAssignments("branch-1", "event-1");
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(new URL(calls[0][0]).pathname).toBe("/api/v1/notifications");
    expect(new URL(calls[1][0]).pathname).toBe("/api/v1/events/event-1/assignments");
    for (const [, init] of calls) {
      expect(init.credentials).toBe("include");
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
    }
  });

  it("rejects insecure hosted API origins", () => {
    expect(() => new CmiApiClient({ apiUrl: "http://api.example.com" })).toThrow(/HTTPS/);
  });

  it("routes public published content to the anonymous Worker projection", async () => {
    const fetcher = vi.fn(async () => response({ profile: {}, welcome_messages: [] }));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await api.getPublicContent("church-profile", { branch_id: "branch-1" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/public-content");
    expect(parsed.searchParams.get("resource")).toBe("church-profile");
    expect(parsed.searchParams.get("branch_id")).toBe("branch-1");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });
  it("binds the native fetch receiver when using the default browser fetch", async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(response({ user: { id: "staff-user" }, branches: [] }));
    });
    globalThis.fetch = fetcher as unknown as typeof fetch;
    try {
      const api = new CmiApiClient();
      await expect(api.getStaffSession()).resolves.toMatchObject({
        data: { user: { id: "staff-user" } },
      });
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });


  it("routes private sermon and welcome-message draft operations to Cloudflare", async () => {
    const fetcher = vi.fn(async () => response([]));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);

    await api.listSermonDrafts("branch-1");
    await api.listWelcomeMessageDrafts("branch-1");
    await api.createSermonDraft({
      branch_id: "branch-1", title: "Faith and Service", body: "A private draft.", public_slug: "faith-and-service",
    } as never);
    await api.createWelcomeMessageDraft({
      branch_id: "branch-1", title: "Welcome", body: "A private welcome message.", display_order: 0,
    } as never);
    await api.updateSermonDraft("branch-1", "sermon-1", { title: "Updated title" });

    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/v1/content/sermons",
      "/api/v1/content/welcome-messages",
      "/api/v1/content/sermons",
      "/api/v1/content/welcome-messages",
      "/api/v1/content/sermons/sermon-1",
    ]);
    for (const [, init] of calls) {
      expect(init.credentials).toBe("include");
      expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
    }
  });


  it("routes staff role assignment and dual-control reviews through the Worker", async () => {
    const fetcher = vi.fn(async () => response([]));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await api.assignStaffRole("branch-1", "staff-1", "coordinator", "Approved ministry appointment.");
    await api.revokeStaffRole("branch-1", "assignment-1", "Role no longer required.");
    await api.listAdminElevationRequests("branch-1");
    await api.requestAdminElevation("branch-1", "staff-2", "Approved pastoral appointment.");
    await api.reviewAdminElevation("branch-1", "elevation-1", "approve", "Second administrator verified.");
    await api.listAdminRevocationRequests("branch-1");
    await api.requestAdminRevocation("branch-1", "admin-assignment-1", "Role holder is leaving office.");
    await api.reviewAdminRevocation("branch-1", "revocation-1", "reject", "The request lacks supporting evidence.");

    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => [new URL(url).pathname, init.method ?? "GET"])).toEqual([
      ["/api/v1/staff/roles", "POST"],
      ["/api/v1/staff/roles/assignment-1", "DELETE"],
      ["/api/v1/staff/role-elevations", "GET"],
      ["/api/v1/staff/role-elevations", "POST"],
      ["/api/v1/staff/role-elevations/elevation-1/approve", "POST"],
      ["/api/v1/staff/role-revocations", "GET"],
      ["/api/v1/staff/role-revocations", "POST"],
      ["/api/v1/staff/role-revocations/revocation-1/reject", "POST"],
    ]);
    for (const [, init] of calls) {
      expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
      expect(init.credentials).toBe("include");
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
    }
  });

});
