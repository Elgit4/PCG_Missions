import { describe, expect, it, vi } from "vitest";
import { AuthClientError, PcgAuthClient } from "./auth";

function sessionPayload() {
  return { user: { id: "staff-user-1", email: "staff@example.test", name: "Staff Member" },
    session: { id: "session-1", expiresAt: "2026-12-01T00:00:00.000Z" } };
}

describe("Cloudflare Better Auth browser client", () => {
  it("signs in through the same-origin Worker and uses HttpOnly cookies", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify(sessionPayload()), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    const session = await client.signIn(" Staff@Example.Test ", "A-valid-password");
    expect(session.user.email).toBe("staff@example.test");
    expect(await client.getAccessToken()).toBeNull();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ email: "staff@example.test", password: "A-valid-password" });
  });

  it("restores session through the cookie endpoint", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify(sessionPayload()), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    expect((await client.getSession())?.user.id).toBe("staff-user-1");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/auth/get-session");
  });

  it("returns null when there is no active session", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("null", { status: 200 }));
    await expect(new PcgAuthClient(fetcher as typeof fetch).getSession()).resolves.toBeNull();
  });

  it("submits password resets to the audited Worker workflow", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await expect(client.requestPasswordReset(" Staff@Example.Test ")).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/password-reset-requests");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ email: "staff@example.test" });
  });

  it("completes forced password changes without exposing session tokens", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ ok: true, data: { password_changed: true } }), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await expect(client.completePasswordChange("New-Strong-Password-2026!")).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/password/change");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ password: "New-Strong-Password-2026!" });
  });

  it("signs out through Better Auth", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ success: true }), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await client.signOut();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/auth/sign-out");
  });

  it("surfaces a failed server sign-out instead of pretending the HttpOnly session was cleared", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(
      JSON.stringify({ error: { code: "AUTH_SERVICE_UNAVAILABLE", message: "Sign-out could not be confirmed." } }),
      { status: 503 },
    ));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await expect(client.signOut()).rejects.toMatchObject({
      status: 503,
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Sign-out could not be confirmed.",
    });
  });

  it("rejects weak forced-password replacements before a request", async () => {
    const fetcher = vi.fn();
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await expect(client.completePasswordChange("weak")).rejects.toMatchObject({ code: "PASSWORD_POLICY_INVALID", status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports Cloudflare Worker health and never tries Supabase", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ ok: true, schema_version: 44 }), { status: 200 }));
    await expect(new PcgAuthClient(fetcher as typeof fetch).testConnection()).resolves.toContain("schema version 44");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/health");
  });

  it("never stores or exposes a bearer token", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify(sessionPayload()), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await client.signIn("staff@example.test", "password");
    expect(await client.getAccessToken()).toBeNull();
    expect(fetcher.mock.calls.length).toBe(1);
  });

  it("surfaces a rejected reset request as a useful authentication error", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } }), { status: 401 }));
    await expect(new PcgAuthClient(fetcher as typeof fetch).requestPasswordReset("staff@example.test")).rejects.toBeInstanceOf(AuthClientError);
  });
  it("binds the native fetch receiver for session and health requests", async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = vi.fn(function (this: unknown, input: RequestInfo | URL) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      const url = String(input);
      return Promise.resolve(new Response(
        url.endsWith("/health") ? JSON.stringify({ ok: true, schema_version: 45 }) : "null",
        { status: 200 },
      ));
    });
    globalThis.fetch = fetcher as unknown as typeof fetch;
    try {
      const client = new PcgAuthClient();
      await expect(client.getSession()).resolves.toBeNull();
      await expect(client.testConnection()).resolves.toContain("schema version 45");
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

});
