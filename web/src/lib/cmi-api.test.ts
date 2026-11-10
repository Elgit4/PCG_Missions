import { describe, expect, it, vi } from "vitest";
import { CmiApiClient, CmiApiError } from "./cmi-api";

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
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    const result = await client.getStaffSession();
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://example.supabase.co/functions/v1/staff-session");
    expect(new Headers(init.headers).get("apikey")).toBe("public-test-key");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-token");
    expect(result.request_id).toBe("request-1");
    expect(new Headers(init.headers).get("Cache-Control")).toBe("no-store");
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
    await expect(client.createFollowUpTask({ ...common, assignee_user_id: "", team_id: "" } as never))
      .rejects.toThrow(/Exactly one/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects task reassignment with both targets", async () => {
    const fetcher = vi.fn();
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);
    await expect(client.reassignFollowUpTask("branch", "task", {
      assignee_user_id: "user", team_id: "team",
    } as never)).rejects.toThrow(/Exactly one/);
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
});
