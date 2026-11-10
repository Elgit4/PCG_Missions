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

    await expect(client.getStaffSession()).rejects.toMatchObject({
      status: 401,
      code: "AUTH_REQUIRED",
    });
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
  });

  it("preserves safe backend error codes and request IDs", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({
        error: { code: "FORBIDDEN", message: "The operation is not permitted." },
        request_id: "request-403",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ));
    const client = new CmiApiClient(config, async () => "access-token", fetcher as typeof fetch);

    try {
      await client.getStaffSession();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CmiApiError);
      expect(error).toMatchObject({ status: 403, code: "FORBIDDEN", requestId: "request-403" });
    }
  });
});
