import { describe, expect, it, vi } from "vitest";
import { CmiApiClient } from "./cmi-api";

const mePayload = {
  ok: true,
  staff: {
    userId: "auth-user-1",
    profileId: "staff-1",
    fullName: "Test Staff",
    email: "staff@example.test",
    branches: [{ id: "branch-1", name: "Main Branch", timezone: "Africa/Accra" }],
  },
  active_branch: {
    branchId: "branch-1",
    roles: ["coordinator"],
    capabilities: [{ code: "contacts.read", scopeMode: "branch", sensitivity: "normal" }],
  },
  request_id: "request-me",
};

describe("CmiApiClient — Cloudflare Worker", () => {
  it("loads the authenticated staff context using same-origin cookie credentials", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify(mePayload), { status: 200 }));
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    const result = await client.getStaffSession();
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/me");
    expect(init.credentials).toBe("include");
    expect(result.data.staff.full_name).toBe("Test Staff");
    expect(result.data.roles[0]?.code).toBe("coordinator");
    expect(result.data.capabilities[0]?.code).toBe("contacts.read");
  });

  it("uses the selected branch as a server-validated header", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ data: [], request_id: "contacts" }), { status: 200 }));
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await client.listContacts("branch-1", { limit: 10 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/contacts");
    expect(url.searchParams.get("branch_id")).toBe("branch-1");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(init.credentials).toBe("include");
  });

  it("maps legacy calendar operations to the Worker calendar resource", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ data: [], request_id: "calendar" }), { status: 200 }));
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await client.listCalendarEntries("branch-1");
    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/calendar");
  });

  it("preserves Worker authorization errors and request IDs", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      ok: false,
      error: { code: "CAPABILITY_DENIED", message: "Not permitted" },
      request_id: "request-denied",
    }), { status: 403 }));
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await expect(client.listContacts("branch-1")).rejects.toMatchObject({
      status: 403, code: "CAPABILITY_DENIED", requestId: "request-denied",
    });
  });

  it("rejects malformed successful responses", async () => {
    const client = new CmiApiClient({}, async () => null, vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("not-json", { status: 200 })) as typeof fetch);
    await expect(client.listContacts("branch-1")).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });
  it("maps staff account lifecycle actions to the Worker governance routes", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ data: { account_status: "inactive" }, request_id: "staff-status" }), { status: 200 }));
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await client.setStaffAccountStatus("staff-2", "branch-1", "inactive", "No longer serving");
    const [url] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/staff/staff-2/deactivate");
  });

  it("loads recipient-scoped in-app announcement notifications", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      ok: true, announcements: [{ announcement_id: "notice-1", title: "Service update", is_read: 0 }], request_id: "inbox",
    }), { status: 200 }));
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    const result = await client.listAnnouncementInbox("branch-1");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/announcements/inbox");
    expect(url.searchParams.get("branch_id")).toBe("branch-1");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(result.data.announcements[0]?.announcement_id).toBe("notice-1");
  });

  it("keeps announcement branch scope in the validated header, not the JSON payload", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      ok: true, announcement_id: "announcement-1", status: "draft", request_id: "announcement",
    }), { status: 201 }));
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await client.createAnnouncementDraft({
      branch_id: "branch-1", title: "Service update", body: "Service begins at 9am.", audience_type: "branch",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/announcements");
    expect(url.searchParams.get("branch_id")).toBe("branch-1");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Service update", body: "Service begins at 9am.", audience_type: "branch",
    });
  });

  it("posts prayer-room messages only to the dedicated branch conversation route", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      ok: true, message: { id: "message-1", body: "Praying for the team" }, request_id: "prayer-room",
    }), { status: 201 }));
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    const result = await client.postPrayerRoomMessage("branch-1", "Praying for the team");
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/prayer-room/messages");
    expect(url.searchParams.get("branch_id")).toBe("branch-1");
    expect(new Headers(init.headers).get("X-Branch-Id")).toBe("branch-1");
    expect(JSON.parse(String(init.body))).toEqual({ body: "Praying for the team" });
    expect(result.data.message.id).toBe("message-1");
  });

  it("fails explicitly for team administration until its Worker handlers are implemented", async () => {
    const fetcher = vi.fn();
    const client = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await expect(client.listTeams("branch-1")).rejects.toMatchObject({
      status: 501, code: "TEAM_ADMINISTRATION_NOT_MIGRATED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

});