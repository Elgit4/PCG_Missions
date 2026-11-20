import { describe, expect, it, vi } from "vitest";
import {
  createPublicContentClient,
  getUpcomingEvents,
  loadPublicSiteContent,
  publicPhoneHref,
  safeExternalUrl,
  type PublicEvent,
} from "./public-content";

describe("public content client", () => {
  it("uses the public-content function and sends only the publishable key", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "sermon-1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;
    const client = createPublicContentClient({
      supabaseUrl: "https://example.supabase.co/",
      publishableKey: "public-key",
    }, fetcher);

    const result = await client.listSermons();

    expect(result).toEqual([{ id: "sermon-1" }]);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(String(url)).toContain("/functions/v1/public-content?");
    expect(String(url)).toContain("resource=sermons");
    expect(String(url)).toContain("limit=20");
    expect(new Headers(init?.headers).get("apikey")).toBe("public-key");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
  });

  it("does not add list pagination to the church profile request", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ data: null }), { status: 200 })
    ) as unknown as typeof fetch;
    const client = createPublicContentClient({
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "public-key",
    }, fetcher);

    await client.getChurchProfile();

    const [url] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(String(url)).toContain("resource=church-profile");
    expect(String(url)).not.toContain("limit=");
  });

  it("returns a safe service error without leaking transport details", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Unable to retrieve public content." }), {
        status: 503,
      })
    ) as unknown as typeof fetch;
    const client = createPublicContentClient({
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "public-key",
    }, fetcher);

    await expect(client.listEvents()).rejects.toMatchObject({
      name: "PublicContentError",
      status: 503,
      message: "Unable to retrieve public content.",
    });
  });

  it("loads available sections when one public resource is unavailable", async () => {
    const client = {
      getChurchProfile: vi.fn().mockResolvedValue(null),
      listSermons: vi.fn().mockResolvedValue([]),
      listDailyWords: vi.fn().mockResolvedValue([]),
      listTracts: vi.fn().mockRejectedValue(new Error("internal database detail")),
      listWelcomeMessages: vi.fn().mockResolvedValue([]),
      listAnnouncements: vi.fn().mockResolvedValue([]),
      listEvents: vi.fn().mockResolvedValue([]),
    };

    const result = await loadPublicSiteContent(client);

    expect(result.tracts).toEqual([]);
    expect(result.failedResources).toEqual(["tracts"]);
    expect(JSON.stringify(result)).not.toContain("internal database detail");
  });
});

describe("public visitor data helpers", () => {
  const event = (id: string, startsAt: string, endsAt: string): PublicEvent => ({
    id,
    title: id,
    description: null,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: "Africa/Accra",
    location: null,
    registration_state: "closed",
    transport_enabled: false,
  });

  it("filters expired events and sorts remaining events chronologically", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    const events = [
      event("later", "2026-11-22T09:00:00Z", "2026-11-22T11:00:00Z"),
      event("expired", "2026-11-19T09:00:00Z", "2026-11-19T11:00:00Z"),
      event("soon", "2026-11-20T13:00:00Z", "2026-11-20T14:00:00Z"),
    ];

    expect(getUpcomingEvents(events, now).map((item) => item.id)).toEqual([
      "soon",
      "later",
    ]);
  });

  it("accepts only HTTP(S) public links", () => {
    expect(safeExternalUrl("https://example.org/path")).toBe(
      "https://example.org/path",
    );
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("not a URL")).toBeNull();
  });

  it("normalizes public phone links without inventing numbers", () => {
    expect(publicPhoneHref("+233 24 123 4567")).toBe("tel:+233241234567");
    expect(publicPhoneHref("")).toBeNull();
    expect(publicPhoneHref("123")).toBeNull();
  });
});
