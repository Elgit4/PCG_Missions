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
      assignee_user_id: "user", team_id: "team",
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

  it("lists the scoped operational interaction history", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: [{ id: "interaction-1", interaction_type: "visit", occurred_at: "2026-11-12T09:00:00Z" }], request_id: "interaction-list" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.listContactInteractions("branch-a", "contact-2");
    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/staff-operations/contacts/contact-2/interactions");
    expect(url.searchParams.get("branch_id")).toBe("branch-a");
    expect(result.data[0]?.interaction_type).toBe("visit");
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

  it("submits report reviews through the atomic review endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ data: { report: { id: "report-1" }, review_history: [] }, request_id: "report-review" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.reviewMinistryReport("report/1", { decision: "returned", comment: "Please verify the totals." });
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
      JSON.stringify({ data: { id: "report-1", status: "submitted" }, request_id: "report-resubmit" }),
      { status: 200 },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await client.resubmitMinistryReport("report-1", {
      contacts_captured: 4, gospel_presentations: 3, decisions_for_christ: 1,
      followup_required: 2, followup_completed: 1, visits_completed: 1,
      calls_completed: 0, events_supported: 0, attendance_count: 0,
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/functions/v1/report-operations/reports/report-1/resubmit");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toHaveProperty("contacts_captured", 4);
  });
});
