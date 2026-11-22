import { describe, expect, it, vi } from "vitest";
import { CmiApiClient } from "./cmi-api";

const config = {
  supabaseUrl: "https://example.supabase.co/",
  publishableKey: "public-test-key",
};

describe("CmiApiClient", () => {
  it("does not send a staff request without an access token", async () => {
    const fetcher = vi.fn();
    const client = new CmiApiClient(config, async () => null, fetcher as typeof fetch);
    await expect(client.getStaffSession()).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the publishable key and bearer token to the staff session function", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { staff: { account_status: "active" } }, request_id: "request-1" }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.getStaffSession();
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://example.supabase.co/functions/v1/staff-session");
    expect(new Headers(init.headers).get("apikey")).toBe("public-test-key");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
    expect(result.request_id).toBe("request-1");
    expect(new Headers(init.headers).has("Cache-Control")).toBe(false);
  });

  it("preserves safe backend error codes and request IDs", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ error: { code: "FORBIDDEN", message: "The operation is not permitted." }, request_id: "request-403" }),
      { status: 403 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await expect(client.getStaffSession()).rejects.toMatchObject({
      status: 403, code: "FORBIDDEN", requestId: "request-403",
    });
  });

  it("rejects malformed successful responses", async () => {
    const fetcher = vi.fn(async () => new Response("not-json", { status: 200 }));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await expect(client.getStaffSession()).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("requires HTTPS outside local development", () => {
    expect(() => new CmiApiClient(
      { supabaseUrl: "http://example.supabase.co", publishableKey: "key" },
      async () => "token",
    )).toThrow(/HTTPS/);
  });

  it("rejects task creation without exactly one assignment target", async () => {
    const fetcher = vi.fn();
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const common = {
      branch_id: "branch", contact_id: "contact", client_request_id: "request",
      priority: 2,
    };
    expect(() => client.createFollowUpTask({ ...common, assignee_user_id: "", team_id: "" } as never))
      .toThrow(/Exactly one/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects task reassignment with both targets", async () => {
    const fetcher = vi.fn();
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    expect(() => client.reassignFollowUpTask("branch", "task", {
      assignee_profile_id: "profile", team_id: "team", reason: "Move workload safely",
    } as never)).toThrow(/Exactly one/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("encodes record identifiers in API paths and always includes branch scope", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], request_id: "request-2" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.listContacts("branch-a", { search: "Ama Mensah", limit: 10 });
    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(url.searchParams.get("search")).toBe("Ama Mensah");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("routes visitor contact capture to the Worker with the idempotency contract", async () => {
    const created = {
      id: "contact-123",
      branch_id: "branch-abc",
      first_name: "Ama",
      last_name: "Mensah",
      preferred_name: null,
      contact_status: "active",
      identity_redacted: true,
    };
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: created, idempotent_replay: false, request_id: "worker-contact-create" }),
      { status: 201 },
    ));
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    const result = await client.createContact({
      branch_id: "branch-abc",
      client_request_id: "contact-request-123456",
      first_name: "Ama",
      last_name: "Mensah",
      phone_e164: "+233241234567",
      phone_display: "+233 24 123 4567",
      email_normalized: "ama@example.com",
      preferred_language: "English",
      source_metadata: { device_type: "web" },
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];

    expect(url.pathname).toBe("/api/v1/contacts");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("contact-request-123456");
    expect(new Headers(init.headers).has("apikey")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({
      first_name: "Ama",
      last_name: "Mensah",
      phone_e164: "+233241234567",
      preferred_language: "English",
      source_metadata: { device_type: "web" },
      email: "ama@example.com",
    });
    expect(result.data.identity_redacted).toBe(true);
  });

  it("does not allow team routing to be smuggled into visitor capture", async () => {
    const fetcher = vi.fn();
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    expect(() => client.createContact({
      branch_id: "branch-abc",
      client_request_id: "contact-request-123456",
      first_name: "Ama",
      team_id: "team-123",
    })).toThrow(/Team assignment/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("lists contact notes through the authenticated, branch-scoped staff API", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ id: "note-1", body: "Called after service", created_at: "2026-11-12T10:00:00Z" }], request_id: "note-list" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.listContactNotes("branch-a", "contact/a");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/staff-operations/contacts/contact%2Fa/notes");
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
    expect(result.data[0]?.body).toBe("Called after service");
  });

  it("creates only the note body and never accepts browser-supplied note visibility", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "note-2", body: "Will call tomorrow", created_at: "2026-11-12T11:00:00Z" }, request_id: "note-create" }),
      { status: 201 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.createContactNote("branch-a", "contact-1", { body: "Will call tomorrow" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ body: "Will call tomorrow" });
  });

  it("lists the scoped operational interaction history through the preview Worker", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: [{ id: "interaction-1", interaction_type: "visit", occurred_at: "2026-11-12T09:00:00Z" }], request_id: "interaction-list" }),
      { status: 200 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    const result = await client.listContactInteractions("branch-a", "contact-2");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/contacts/contact-2/interactions");
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-a");
    expect(result.data[0]?.interaction_type).toBe("visit");
  });

  it("routes contact interaction creation through the authorized Worker contract", async () => {
    const interaction = {
      id: "interaction-1",
      interaction_type: "call",
      occurred_at: "2026-11-21T12:00:00Z",
      outcome_code: "answered",
      summary: "Spoke with visitor",
      next_action_at: null,
      created_at: "2026-11-21T12:00:01Z",
    };
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: interaction, request_id: "worker-contact-interaction" }),
      { status: 201 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    const result = await client.createContactInteraction("branch-abc", "contact-123", {
      interaction_type: "call",
      occurred_at: "2026-11-21T12:00:00Z",
      outcome_code: "answered",
      summary: "Spoke with visitor",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];

    expect(url.pathname).toBe("/api/v1/contacts/contact-123/interactions");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      interaction_type: "call",
      occurred_at: "2026-11-21T12:00:00Z",
      outcome_code: "answered",
      summary: "Spoke with visitor",
    });
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(result.data.id).toBe("interaction-1");
  });

  it("lists event drafts through the authenticated branch-scoped function", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], request_id: "event-list" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.listEventDrafts("branch-a", { limit: 20, offset: 40 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/event-operations/events");
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("offset")).toBe("40");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("creates only a private event draft payload through the server function", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "event-1" }, request_id: "event-create" }), { status: 201 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const input = {
      branch_id: "branch-a",
      title: "Sunday outreach",
      description: null,
      starts_at: "2026-11-15T08:00:00.000Z",
      ends_at: "2026-11-15T10:00:00.000Z",
      timezone: "Africa/Accra",
      location: null,
        capacity: null,
    };
    await client.createEventDraft(input);
    const [, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(input);
    expect(JSON.stringify(init.body)).not.toContain("visibility");
  });

  it("uses the calendar and announcement draft endpoints with branch scope", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], request_id: "draft-list" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.listCalendarEntries("branch-a");
    await client.listAnnouncementDrafts("branch-a");
    const first = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    const second = fetcher.mock.calls[1] as unknown as [URL, RequestInit];
    expect(first[0].pathname).toBe("/functions/v1/calendar-operations/entries");
    expect(first[0].searchParams.get("branch_id")).toBe("branch-a");
    expect(second[0].pathname).toBe("/functions/v1/announcement-operations/announcements");
    expect(second[0].searchParams.get("branch_id")).toBe("branch-a");
  });

  it("routes branch calendar list, create and update operations through the Cloudflare Worker in preview", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "calendar-1" }, request_id: "calendar-worker" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );

    await client.listCalendarEntries("branch-a");
    await client.createCalendarEntry({
      branch_id: "branch-a",
      entry_type: "service",
      title: "Sunday service",
      starts_at: "2026-11-29T09:00:00.000Z",
      ends_at: null,
    });
    await client.updateCalendarEntry("branch-a", "calendar-1", { title: "Updated service" });
    await client.listAnnouncementDrafts("branch-a");
    await client.createAnnouncementDraft({
      branch_id: "branch-a",
      title: "Sunday notice",
      body: "The service begins at 9:00 AM.",
    });
    await client.updateAnnouncementDraft("branch-a", "announcement-1", { title: "Updated notice" });

    const calls = fetcher.mock.calls as unknown as Array<[URL, RequestInit]>;
    expect(calls.map(([url, init]) => [url.pathname, init.method ?? "GET"])).toEqual([
      ["/api/v1/calendar/entries", "GET"],
      ["/api/v1/calendar/entries", "POST"],
      ["/api/v1/calendar/entries/calendar-1", "PATCH"],
      ["/api/v1/announcements", "GET"],
      ["/api/v1/announcements", "POST"],
      ["/api/v1/announcements/announcement-1", "PATCH"],
    ]);
    for (const [url, init] of calls) {
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer access-token");
      expect(headers.get("X-Branch-Id")).toBe("branch-a");
      expect(headers.get("apikey")).toBeNull();
      expect(url.origin).toBe("https://worker.example.com");
    }
  });

  it("routes sermon and welcome-message drafts through the authenticated content function", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], request_id: "content-list" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.listSermonDrafts("branch-a");
    await client.listWelcomeMessageDrafts("branch-a");
    const sermon = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    const welcome = fetcher.mock.calls[1] as unknown as [URL, RequestInit];
    expect(sermon[0].pathname).toBe("/functions/v1/content-operations/sermons");
    expect(welcome[0].pathname).toBe("/functions/v1/content-operations/welcome-messages");
    expect(sermon[0].searchParams.get("branch_id")).toBe("branch-a");
    expect(welcome[0].searchParams.get("branch_id")).toBe("branch-a");
  });

  it("lists teams through the authenticated branch-scoped team function", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { teams: [] }, request_id: "team-list" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.listTeams("branch-a");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/team-operations/teams");
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("creates teams with only client-editable fields", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "team-1" }, request_id: "team-create" }), { status: 201 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.createTeam({
      branch_id: "branch-a",
      name: "Welcome Team",
      description: null,
    });
    const [, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      branch_id: "branch-a",
      name: "Welcome Team",
      description: null,
    });
  });

  it("uses branch-scoped routes for membership assignment and revocation", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "membership-1" }, request_id: "membership-change" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.addTeamMember("branch-a", "team-1", {
      staff_profile_id: "staff-1",
      membership_role: "leader",
    });
    await client.revokeTeamMember("branch-a", "team-1", "membership-1");
    const add = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    const revoke = fetcher.mock.calls[1] as unknown as [URL, RequestInit];
    expect(add[0].pathname).toBe("/functions/v1/team-operations/teams/team-1/members");
    expect(add[0].searchParams.get("branch_id")).toBe("branch-a");
    expect(JSON.parse(String(add[1].body))).toEqual({
      staff_profile_id: "staff-1",
      membership_role: "leader",
    });
    expect(revoke[0].pathname).toBe("/functions/v1/team-operations/teams/team-1/members/membership-1/revoke");
    expect(revoke[1].method).toBe("POST");
  });

  it("lists and assigns service-area coverage through the protected team function", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { areas: [] }, request_id: "area-change" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.listServiceAreas("branch-a");
    await client.addAreaCoverage("branch-a", "area-1", { staff_profile_id: "staff-1" });
    const list = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    const add = fetcher.mock.calls[1] as unknown as [URL, RequestInit];
    expect(list[0].pathname).toBe("/functions/v1/team-operations/areas");
    expect(list[0].searchParams.get("branch_id")).toBe("branch-a");
    expect(add[0].pathname).toBe("/functions/v1/team-operations/areas/area-1/coverage");
    expect(add[0].searchParams.get("branch_id")).toBe("branch-a");
    expect(JSON.parse(String(add[1].body))).toEqual({ staff_profile_id: "staff-1" });
  });

  it("records an allowlisted interaction payload", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "interaction-2", interaction_type: "call" }, request_id: "interaction-create" }),
      { status: 201 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.createContactInteraction("branch-a", "contact-2", {
      interaction_type: "call",
      outcome_code: "answered",
      summary: "Agreed to attend service.",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      interaction_type: "call",
      outcome_code: "answered",
      summary: "Agreed to attend service.",
    });
  });


  it("routes all private event, calendar, announcement and content draft CRUD operations", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "draft-1" }, request_id: "draft-operation" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);

    await client.listEventDrafts("branch-a");
    await client.createEventDraft({
      branch_id: "branch-a", title: "Outreach", description: null,
      starts_at: "2026-11-14T08:00:00.000Z", ends_at: "2026-11-14T10:00:00.000Z",
      timezone: "Africa/Accra", location: null,
        capacity: null,
    });
    await client.updateEventDraft("branch-a", "event-1", { title: "Updated outreach" });

    await client.listCalendarEntries("branch-a");
    await client.createCalendarEntry({
      branch_id: "branch-a", entry_type: "service", title: "Sunday service",
      starts_at: "2026-11-15T09:00:00.000Z", ends_at: null,
    });
    await client.updateCalendarEntry("branch-a", "calendar-1", { title: "Updated service" });

    await client.listAnnouncementDrafts("branch-a");
    await client.createAnnouncementDraft({ branch_id: "branch-a", title: "Notice", body: "Service begins at 9." });
    await client.updateAnnouncementDraft("branch-a", "announcement-1", { body: "Updated notice" });

    await client.listSermonDrafts("branch-a");
    await client.createSermonDraft({ branch_id: "branch-a", title: "Faith", body: "Sermon notes", public_slug: "faith" });
    await client.updateSermonDraft("branch-a", "sermon-1", { title: "Faith renewed" });

    await client.listWelcomeMessageDrafts("branch-a");
    await client.createWelcomeMessageDraft({ branch_id: "branch-a", title: "Welcome", body: "Welcome to church", display_order: 1 });
    await client.updateWelcomeMessageDraft("branch-a", "welcome-1", { display_order: 2 });

    const calls = fetcher.mock.calls as unknown as Array<[URL, RequestInit]>;
    expect(calls.map(([url, init]) => [url.pathname, init.method ?? "GET"])).toEqual([
      ["/functions/v1/event-operations/events", "GET"],
      ["/functions/v1/event-operations/events", "POST"],
      ["/functions/v1/event-operations/events/event-1", "PATCH"],
      ["/functions/v1/calendar-operations/entries", "GET"],
      ["/functions/v1/calendar-operations/entries", "POST"],
      ["/functions/v1/calendar-operations/entries/calendar-1", "PATCH"],
      ["/functions/v1/announcement-operations/announcements", "GET"],
      ["/functions/v1/announcement-operations/announcements", "POST"],
      ["/functions/v1/announcement-operations/announcements/announcement-1", "PATCH"],
      ["/functions/v1/content-operations/sermons", "GET"],
      ["/functions/v1/content-operations/sermons", "POST"],
      ["/functions/v1/content-operations/sermons/sermon-1", "PATCH"],
      ["/functions/v1/content-operations/welcome-messages", "GET"],
      ["/functions/v1/content-operations/welcome-messages", "POST"],
      ["/functions/v1/content-operations/welcome-messages/welcome-1", "PATCH"],
    ]);
    for (const [url, init] of calls) {
      expect(url.searchParams.get("branch_id") ?? JSON.parse(String(init.body ?? "{}")).branch_id).toBe("branch-a");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
    }
  });

  it("lists ministry reports through the scoped report operations function", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], total: 0, request_id: "reports-list" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.listMinistryReports("branch-a", { report_type: "weekly_ministry", limit: 10 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/report-operations/reports");
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(url.searchParams.get("report_type")).toBe("weekly_ministry");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("submits typed report counts without accepting actor or status fields", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "report-1", status: "submitted" }, request_id: "report-create" }),
      { status: 201 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.createMinistryReport({
      branch_id: "branch-a", report_type: "daily_evangelism",
      period_start: "2026-11-13", period_end: "2026-11-13",
      contacts_captured: 4, gospel_presentations: 3, decisions_for_christ: 1,
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/report-operations/reports");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      branch_id: "branch-a", contacts_captured: 4, decisions_for_christ: 1,
    });
    expect(JSON.stringify(init.body)).not.toContain("author_profile_id");
    expect(JSON.stringify(init.body)).not.toContain("status");
  });

  it("preserves the exact total count from paginated report lists", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], total: 73, request_id: "report-page" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.listMinistryReports("branch-a", { limit: 50, offset: 50 });
    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/report-operations/reports");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("offset")).toBe("50");
    expect(result.data).toEqual([]);
    expect(result.total).toBe(73);
  });

  it("submits report reviews through the atomic review endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { report: { id: "report-1" }, review_history: [] }, request_id: "report-review" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.reviewMinistryReport("report/1", {
      decision: "returned",
      comment: "Please verify the totals.",
    });
    expect(result.data.report.id).toBe("report-1");
    expect(result.data.review_history).toEqual([]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/report-operations/reports/report%2F1/review");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ decision: "returned", comment: "Please verify the totals." });
  });

  it("loads safe report team and event selectors", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], request_id: "report-options" }), { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.listReportTeams("branch-a");
    await client.listReportEvents("branch-a");
    const team = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    const events = fetcher.mock.calls[1] as unknown as [URL, RequestInit];
    expect(team[0].pathname).toBe("/functions/v1/report-operations/teams");
    expect(events[0].pathname).toBe("/functions/v1/report-operations/events");
  });

  it("resubmits a corrected returned report through the protected endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({
        data: {
          report: { id: "report-1", status: "submitted" },
          review_history: [{
            id: "history-1",
            actor_profile_id: "author-1",
            decision: "resubmitted",
            comment: null,
            created_at: "2026-11-13T09:00:00Z",
          }],
        },
        request_id: "report-resubmit",
      }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.resubmitMinistryReport("report-1", {
      contacts_captured: 4, gospel_presentations: 3, decisions_for_christ: 1,
      followup_required: 2, followup_completed: 1, visits_completed: 1,
      calls_completed: 0, events_supported: 0, attendance_count: 0,
    });
    expect(result.data.report.id).toBe("report-1");
    expect(result.data.review_history[0]?.actor_profile_id).toBe("author-1");
    expect(result.data.review_history[0]?.decision).toBe("resubmitted");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/report-operations/reports/report-1/resubmit");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toHaveProperty("contacts_captured", 4);
  });

  it("checks in an event registration through the branch-scoped idempotent endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({
        data: {
          checkin: { id: "checkin-1", registration_id: "registration-1" },
          replayed: false,
          response_status: 201,
        },
        request_id: "checkin-create",
      }),
      { status: 201 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.checkinEventRegistration(
      "branch-a",
      "event-1",
      "registration-1",
      "61000000-0000-4000-8000-000000000104",
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe(
      "/functions/v1/event-operations/events/event-1/registrations/registration-1/check-in",
    );
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      idempotency_key: "61000000-0000-4000-8000-000000000104",
    });
    expect(result.data.replayed).toBe(false);
  });

  it("cancels an event registration through the idempotent capacity-release endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({
        data: {
          registration: { id: "registration-1", status: "cancelled" },
          replayed: false,
          response_status: 200,
        },
        request_id: "registration-cancel",
      }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.cancelEventRegistration(
      "branch-a",
      "event-1",
      "registration-1",
      "61000000-0000-4000-8000-000000000105",
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe(
      "/functions/v1/event-operations/events/event-1/registrations/registration-1/cancel",
    );
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      idempotency_key: "61000000-0000-4000-8000-000000000105",
    });
    expect(result.data.registration.status).toBe("cancelled");
  });


  it("routes staff-session lookup to the opt-in Cloudflare Worker endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({
        data: {
          user: { id: "auth-user-1", email: "staff@example.com" },
          staff: { id: "staff-1", auth_user_id: "auth-user-1", full_name: "Staff Member", email: "staff@example.com", account_status: "active" },
          branches: [{ id: "branch-1", name: "Main", timezone: "Africa/Accra" }],
          roles: [{ code: "coordinator", name: "Coordinator", branch_id: "branch-1" }],
          capabilities: [{ code: "contacts.read", scope_mode: "branch", branch_id: "branch-1" }],
          must_change_password: false,
          password_setup_expires_at: null,
        },
        request_id: "worker-session-1",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://pcg-missions-api-preview.example.workers.dev" }, async () => "supabase-access-token", fetcher as typeof fetch);
    const result = await client.getStaffSession();
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://pcg-missions-api-preview.example.workers.dev/api/v1/me");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer supabase-access-token");
    expect(result.data.staff.id).toBe("staff-1");
    expect(result.data.roles[0]?.code).toBe("coordinator");
  });
  it("routes branch-scoped contact requests through the Worker when configured", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], request_id: "worker-contacts-1" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    await client.listContacts("branch-abc", { limit: 10 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://worker.example.com/api/v1/contacts?branch_id=branch-abc&limit=10&offset=0");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
    expect(new Headers(init.headers).has("apikey")).toBe(false);
  });

  it("routes single-contact reads through the Worker data envelope", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({
        data: {
          id: "contact-123",
          branch_id: "branch-abc",
          first_name: "Ama",
          last_name: "Mensah",
          preferred_name: null,
          phone_e164: null,
          email_normalized: null,
          age_range: null,
          preferred_language: null,
          contact_status: "active",
          identity_redacted: true,
          created_at: "2026-11-21T10:00:00Z",
          updated_at: "2026-11-21T10:00:00Z",
        },
        request_id: "worker-contact-detail",
      }),
      { status: 200 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    const result = await client.getContact("branch-abc", "contact-123");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];

    expect(url.pathname).toBe("/api/v1/contacts/contact-123");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
    expect(new Headers(init.headers).has("apikey")).toBe(false);
    expect(result.data.identity_redacted).toBe(true);
    expect(result.data.email_normalized).toBeNull();
  });

  it("routes privacy-aware contact edits through the Worker with its field contract", async () => {
    const updated = {
      id: "contact-123",
      branch_id: "branch-abc",
      first_name: "Ama",
      last_name: "Mensah",
      preferred_name: "Ama",
      phone_e164: null,
      email_normalized: null,
      age_range: null,
      preferred_language: null,
      contact_status: "active",
      identity_redacted: true,
      created_at: "2026-11-21T10:00:00Z",
      updated_at: "2026-11-21T10:30:00Z",
    };
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: updated, request_id: "worker-contact-update" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    const result = await client.updateContact("branch-abc", "contact-123", {
      first_name: "Ama",
      preferred_name: "Ama",
      email_normalized: "ama@example.com",
      phone_e164: "+233241234567",
      phone_display: "+233 24 123 4567",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];

    expect(url.pathname).toBe("/api/v1/contacts/contact-123");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("PATCH");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(new Headers(init.headers).has("apikey")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({
      first_name: "Ama",
      preferred_name: "Ama",
      phone_e164: "+233241234567",
      email: "ama@example.com",
    });
    expect(result.data.identity_redacted).toBe(true);
  });

  it("does not send unsupported service-area changes through contact edits", async () => {
    const fetcher = vi.fn();
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    expect(() => client.updateContact("branch-abc", "contact-123", {
      service_area_id: "area-123",
    })).toThrow(/dedicated service-area assignment/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("routes branch-scoped follow-up task reads through the Worker contract", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [], request_id: "followup-worker" }), { status: 200 }));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    await client.listFollowUpTasks("branch-abc", { limit: 25, offset: 50, status: "open" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/followup/tasks");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("offset")).toBe("50");
    expect(url.searchParams.get("status")).toBe("open");
    expect(url.searchParams.has("branch_id")).toBe(false);
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(new Headers(init.headers).has("apikey")).toBe(false);
  });

  it("routes follow-up task creation to the Worker with auth-user assignment and idempotency header", async () => {
    const task = {
      id: "task-123",
      branch_id: "branch-abc",
      contact_id: "contact-123",
      assignee_user_id: "auth-user-9",
      team_id: null,
      priority: 2,
      due_at: null,
      task_note: "Call the visitor",
      status: "open",
      created_at: "2026-11-21T12:00:00Z",
      updated_at: "2026-11-21T12:00:00Z",
    };
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: task, request_id: "worker-followup-create" }),
      { status: 201 },
    ));
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    const result = await client.createFollowUpTask({
      branch_id: "branch-abc",
      contact_id: "contact-123",
      client_request_id: "request-key-123456",
      assignee_user_id: "auth-user-9",
      priority: 2,
      due_at: null,
      task_note: "Call the visitor",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];

    expect(url.pathname).toBe("/api/v1/followup/tasks");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("request-key-123456");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(JSON.parse(String(init.body))).toEqual({
      contact_id: "contact-123",
      assignee_user_id: "auth-user-9",
      priority: 2,
      due_at: null,
      task_note: "Call the visitor",
    });
    expect(result.data.id).toBe("task-123");
  });

  it("routes follow-up task status updates to the Worker and returns the updated task", async () => {
    const updatedTask = {
      id: "task-123",
      branch_id: "branch-abc",
      contact_id: "contact-123",
      assignee_user_id: "auth-user-9",
      team_id: null,
      priority: 2,
      due_at: null,
      task_note: "Call the visitor",
      status: "completed",
      created_at: "2026-11-21T12:00:00Z",
      updated_at: "2026-11-21T12:30:00Z",
    };
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: updatedTask, request_id: "worker-followup-update" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    const result = await client.updateFollowUpTask("branch-abc", "task-123", { status: "completed" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];

    expect(url.pathname).toBe("/api/v1/followup/tasks/task-123");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("PATCH");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(JSON.parse(String(init.body))).toEqual({ status: "completed" });
    expect(result.data.status).toBe("completed");
  });

  it("routes follow-up reassignment to the Worker assignment route with a reason", async () => {
    const updatedTask = {
      id: "task-123",
      branch_id: "branch-abc",
      contact_id: "contact-123",
      assignee_user_id: "auth-user-22",
      team_id: null,
      priority: 2,
      due_at: null,
      task_note: "Call the visitor",
      status: "open",
      created_at: "2026-11-21T12:00:00Z",
      updated_at: "2026-11-21T12:30:00Z",
    };
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: updatedTask, request_id: "worker-followup-reassign" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    const result = await client.reassignFollowUpTask("branch-abc", "task-123", {
      assignee_profile_id: "staff-profile-22",
      reason: "Rebalance the follow-up workload",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];

    expect(url.pathname).toBe("/api/v1/followup/tasks/task-123/assign");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(JSON.parse(String(init.body))).toEqual({
      assignee_profile_id: "staff-profile-22",
      reason: "Rebalance the follow-up workload",
    });
    expect(result.data.id).toBe("task-123");
  });

  it("routes contact note reads through the Worker using the compatible data envelope", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ id: "note-1", body: "Followed up", created_at: "2026-11-21T10:00:00Z", updated_at: "2026-11-21T10:00:00Z" }], request_id: "worker-note-list" }),
      { status: 200 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    const result = await client.listContactNotes("branch-abc", "contact-123");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/contacts/contact-123/notes");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(new Headers(init.headers).has("apikey")).toBe(false);
    expect(result.data[0]?.id).toBe("note-1");
  });
  it("routes contact note creation through the Worker contract", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "note-2", body: "Called visitor", created_at: "2026-11-21T11:00:00Z", updated_at: "2026-11-21T11:00:00Z" }, request_id: "worker-note-create" }),
      { status: 201 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    const result = await client.createContactNote("branch-abc", "contact-123", { body: "Called visitor" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/contacts/contact-123/notes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ body: "Called visitor" });
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(result.data.id).toBe("note-2");
  });

  it("routes branch-scoped team lists through the Worker contract", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { teams: [] }, request_id: "worker-teams" }),
      { status: 200 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    const result = await client.listTeams("branch-abc");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/teams");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(result.data.teams).toEqual([]);
  });

  it("routes branch-scoped service-area lists through the Worker contract", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { areas: [] }, request_id: "worker-areas" }),
      { status: 200 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    const result = await client.listServiceAreas("branch-abc");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/areas");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(result.data.areas).toEqual([]);
  });

  it("routes team creation through the Worker and sends its body branch as context", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "00000000-0000-4000-8000-000000000002", branch_id: "branch-abc", name: "Welcome", description: null, is_active: true, created_at: "2026-11-21T12:00:00Z", updated_at: "2026-11-21T12:00:00Z" }, request_id: "worker-team-create" }),
      { status: 201 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    await client.createTeam({ branch_id: "branch-abc", name: "Welcome", description: null });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/teams");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
  });

  it("routes service-area updates through the Worker with branch-scoped context", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "00000000-0000-4000-8000-000000000003", branch_id: "branch-abc", name: "Tema West", code: "TEMA-W", is_active: false, created_at: "2026-11-21T12:00:00Z", updated_at: "2026-11-21T12:05:00Z" }, request_id: "worker-area-update" }),
      { status: 200 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    await client.updateServiceArea("branch-abc", "00000000-0000-4000-8000-000000000003", { is_active: false });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/areas/00000000-0000-4000-8000-000000000003");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("PATCH");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
  });

  it("routes team membership creation through the Worker", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "00000000-0000-4000-8000-000000000004", team_id: "00000000-0000-4000-8000-000000000002", staff_profile_id: "00000000-0000-4000-8000-000000000005", membership_role: "member", starts_at: "2026-11-21T12:00:00Z", ends_at: null, created_at: "2026-11-21T12:00:00Z" }, request_id: "worker-team-member" }),
      { status: 201 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    await client.addTeamMember("branch-abc", "00000000-0000-4000-8000-000000000002", { staff_profile_id: "00000000-0000-4000-8000-000000000005", membership_role: "member" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/teams/00000000-0000-4000-8000-000000000002/members");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
  });

  it("routes service-area coverage creation through the Worker", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { id: "00000000-0000-4000-8000-000000000006", service_area_id: "00000000-0000-4000-8000-000000000003", staff_profile_id: "00000000-0000-4000-8000-000000000005", starts_at: "2026-11-21T12:00:00Z", ends_at: null, created_at: "2026-11-21T12:00:00Z" }, request_id: "worker-area-coverage" }),
      { status: 201 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    await client.addAreaCoverage("branch-abc", "00000000-0000-4000-8000-000000000003", { staff_profile_id: "00000000-0000-4000-8000-000000000005" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/areas/00000000-0000-4000-8000-000000000003/coverage");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
  });

  it("keeps other Worker-unsupported reads on their existing Supabase function", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [], request_id: "supabase-fallback-1" }),
      { status: 200 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    await client.listEventDrafts("branch-abc");
    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/event-operations/events");
  });
  it("blocks Worker-unsupported business writes in preview instead of mutating the shared Supabase project", async () => {
    const fetcher = vi.fn();
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    await expect(client.createEventDraft({
      branch_id: "branch-abc",
      title: "Preview test event",
      description: null,
      starts_at: "2026-11-22T08:00:00.000Z",
      ends_at: "2026-11-22T10:00:00.000Z",
      timezone: "Africa/Accra",
      location: null,
      capacity: null,
    })).rejects.toMatchObject({ status: 503, code: "PREVIEW_OPERATION_NOT_MIGRATED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("routes preview event-flyer uploads through the authenticated Worker", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, data: { object_path: "events/branch-abc/event-123/flyer.png", mime_type: "image/png", size_bytes: 20, signed_url: "https://project.supabase.co/storage/v1/object/sign/pcg-missions-event-media/events/branch-abc/event-123/flyer.png?token=abc", signed_url_expires_in: 900 }, request_id: "worker-flyer-1" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const client = new CmiApiClient(
      { ...config, workerApiUrl: "https://worker.example.com", previewMode: true },
      async () => "access-token",
      fetcher as typeof fetch,
    );
    const file = new Blob(["01234567890123456789"], { type: "image/png" }) as File;

    const result = await client.uploadEventFlyer("branch-abc", "event-123", file);
    expect(result.data.signed_url).toContain("/storage/v1/object/sign/pcg-missions-event-media/");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://worker.example.com/api/v1/events/event-123/flyer");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer access-token");
    expect((init.headers as Headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("routes staff notifications through the Worker API", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { notifications: [], unread_count: 0 }, request_id: "worker-notifications-1" }),
      { status: 200 },
    ));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    await client.listStaffNotifications("branch-abc");
    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/notifications");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
  });
  it("routes paginated staff directory reads to the Worker", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: "staff-1", full_name: "Staff Member", account_status: "active", roles: [{ code: "coordinator", name: "Coordinator" }] }],
      request_id: "worker-staff-directory-1",
    }), { status: 200 }));
    const client = new CmiApiClient({ ...config, workerApiUrl: "https://worker.example.com" }, async () => "access-token", fetcher as typeof fetch);
    const result = await client.listStaffDirectory("branch-abc", { limit: 10, offset: 20, search: "Staff" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/staff");
    expect(url.searchParams.get("branch_id")).toBe("branch-abc");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("search")).toBe("Staff");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-abc");
    expect(result.data[0]?.roles[0]?.code).toBe("coordinator");
  });
});
