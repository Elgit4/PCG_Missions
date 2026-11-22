import { describe, expect, it, vi } from "vitest";
import { CmiApiClient, CmiApiError } from "./cmi-api";

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

  it("fails closed rather than falling back when a route has not been migrated", async () => {
    const fetcher = vi.fn();
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    await expect(api.listCalendarEntries("branch-1")).rejects.toMatchObject({ code: "CLOUDFLARE_ROUTE_NOT_MIGRATED", status: 501 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects insecure hosted API origins", () => {
    expect(() => new CmiApiClient({ apiUrl: "http://api.example.com" })).toThrow(/HTTPS/);
  });

  it("surfaces Worker errors and request IDs", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { code: "CAPABILITY_DENIED", message: "You do not have permission." }, request_id: "denied-request",
    }), { status: 403 }));
    const api = new CmiApiClient({}, async () => null, fetcher as typeof fetch);
    try {
      await api.getStaffSession();
      throw new Error("Expected request rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CmiApiError);
      expect((error as CmiApiError).code).toBe("CAPABILITY_DENIED");
      expect((error as CmiApiError).requestId).toBe("denied-request");
    }
  });
});
