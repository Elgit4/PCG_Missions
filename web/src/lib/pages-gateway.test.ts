import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/[[path]]";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cloudflare Pages same-origin API gateway", () => {
  it("forwards the session cookie and Origin, and returns every upstream Set-Cookie unchanged", async () => {
    const upstreamHeaders = new Headers({
      "content-type": "application/json",
      "cache-control": "private, no-store",
    });
    upstreamHeaders.append("set-cookie", "better-auth.session_token=opaque-session; Path=/; HttpOnly; Secure; SameSite=Lax");
    upstreamHeaders.append("set-cookie", "better-auth.session_token_expires_at=opaque-expiry; Path=/; HttpOnly; Secure; SameSite=Lax");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: upstreamHeaders,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://pcg-missions.pages.dev/api/auth/get-session", {
      method: "GET",
      headers: {
        cookie: "better-auth.session_token=opaque-session",
        origin: "https://pcg-missions.pages.dev",
        accept: "application/json",
        "user-agent": "PCG-Missions-Test",
        "cf-connecting-ip": "203.0.113.9",
      },
    });

    const response = await onRequest({
      request,
      env: { PCG_MISSIONS_API_ORIGIN: "https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev" },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(target)).toBe("https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev/api/auth/get-session");
    const forwarded = new Headers(init.headers);
    expect(forwarded.get("cookie")).toBe("better-auth.session_token=opaque-session");
    expect(forwarded.get("origin")).toBe("https://pcg-missions.pages.dev");
    expect(forwarded.get("accept")).toBe("application/json");
    expect(forwarded.get("cf-connecting-ip")).toBe("203.0.113.9");
    expect(forwarded.get("x-request-id")).toBeTruthy();

    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === "function"
      ? getSetCookie.call(response.headers)
      : [response.headers.get("set-cookie") ?? ""];
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain("better-auth.session_token=opaque-session");
    expect(setCookies[0]).toContain("HttpOnly");
    expect(setCookies[1]).toContain("better-auth.session_token_expires_at=opaque-expiry");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("rejects a cross-origin browser request before calling the API Worker", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      request: new Request("https://pcg-missions.pages.dev/api/v1/me", {
        method: "GET",
        headers: { origin: "https://attacker.example" },
      }),
      env: { PCG_MISSIONS_API_ORIGIN: "https://pcg-missions-api-production.pcg-missions-nonprod.workers.dev" },
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the Pages-to-Worker origin is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      request: new Request("https://pcg-missions.pages.dev/api/v1/me"),
      env: {},
    });

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("WORKER_PROXY_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
