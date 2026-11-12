import { describe, expect, it, vi } from "vitest";
import { PcgAuthClient } from "./auth";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    has: (key: string) => values.has(key),
  };
}

const config = {
  url: "https://pcg-test.supabase.co",
  key: "sb_publishable_test",
};

function sessionPayload() {
  return {
    access_token: "access-test",
    refresh_token: "refresh-test",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "auth-user-1", email: "staff@example.test" },
  };
}

describe("PcgAuthClient", () => {
  it("signs in through Supabase Auth and stores the session in session storage", async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(sessionPayload()), { status: 200 }));
    const client = new PcgAuthClient(config.url, config.key, storage, fetcher as typeof fetch);

    const session = await client.signIn(" Staff@Example.Test ", "temporary-password");
    expect(session.user.email).toBe("staff@example.test");
    expect(await client.getAccessToken()).toBe("access-test");
    expect(storage.has("pcg-missions.auth.v1")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth?grant_type=password");
    expect(new Headers(init.headers).get("apikey")).toBe(config.key);
    expect(JSON.parse(String(init.body))).toEqual({
      email: "staff@example.test",
      password: "temporary-password",
    });
  });

  it("keeps the authenticated session in memory when browser storage is blocked", async () => {
    const blockedStorage = {
      getItem: () => { throw new DOMException("Storage disabled", "SecurityError"); },
      setItem: () => { throw new DOMException("Storage disabled", "SecurityError"); },
      removeItem: () => { throw new DOMException("Storage disabled", "SecurityError"); },
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(sessionPayload()), { status: 200 }));
    const client = new PcgAuthClient(config.url, config.key, blockedStorage, fetcher as typeof fetch);

    const session = await client.signIn("staff@example.test", "temporary-password");

    expect(session.access_token).toBe("access-test");
    expect(await client.getAccessToken()).toBe("access-test");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("tests the browser sign-in POST without using real credentials", async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      code: 400,
      error_code: "invalid_credentials",
      msg: "Invalid login credentials",
    }), { status: 400 }));
    const client = new PcgAuthClient(config.url, config.key, storage, fetcher as typeof fetch);

    await expect(client.testConnection()).resolves.toContain("Connection test passed");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth?grant_type=password");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).email).toBe("pcg-connection-check@invalid.example");
    expect(storage.has("pcg-missions.auth.v1")).toBe(false);
  });

  it("falls back to the configured Supabase origin during the connection test", async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 400,
        error_code: "invalid_credentials",
        msg: "Invalid login credentials",
      }), { status: 400 }));
    const client = new PcgAuthClient(config.url, config.key, storage, fetcher as typeof fetch);

    await expect(client.testConnection()).resolves.toContain("Supabase Auth directly");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://pcg-test.supabase.co/auth/v1/token?grant_type=password");
  });

  it("refreshes an expired session and replaces its refresh token", async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...sessionPayload(),
        expires_in: -1,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-refreshed",
        refresh_token: "refresh-rotated",
        expires_in: 3600,
        user: { id: "auth-user-1", email: "staff@example.test" },
      }), { status: 200 }));
    const client = new PcgAuthClient(config.url, config.key, storage, fetcher as typeof fetch);

    await client.signIn("staff@example.test", "password");
    expect(await client.getAccessToken()).toBe("access-refreshed");
    expect(JSON.parse(storage.getItem("pcg-missions.auth.v1") ?? "{}").refresh_token).toBe("refresh-rotated");
  });

  it("sends a recovery request without revealing whether the email exists", async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: { accepted: true, message: "If this address belongs to an active staff account, the church administrators have been notified." },
    }), { status: 202 }));
    const client = new PcgAuthClient(config.url, config.key, storage, fetcher as typeof fetch);

    await expect(client.requestPasswordReset("staff@example.test")).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth?resource=request-password-reset");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ email: "staff@example.test" });
  });

  it("changes the Auth password and clears the forced-change gate through one authenticated server operation", async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(sessionPayload()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { password_change_required: false } }), { status: 200 }));
    const client = new PcgAuthClient(config.url, config.key, storage, fetcher as typeof fetch);

    await client.signIn("staff@example.test", "temporary-password");
    await client.completePasswordChange("A-strong-New-Password-2026!");

    const [url, init] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth?resource=complete-password-change");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-test");
    expect(JSON.parse(String(init.body))).toEqual({ password: "A-strong-New-Password-2026!" });
  });

  it("rejects weak passwords before making an Auth request", async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(sessionPayload()), { status: 200 }));
    const client = new PcgAuthClient(config.url, config.key, storage, fetcher as typeof fetch);

    await client.signIn("staff@example.test", "temporary-password");
    await expect(client.completePasswordChange("password")).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("clears the browser session before requesting global sign-out", async () => {
    const storage = createMemoryStorage();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(sessionPayload()), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new PcgAuthClient(config.url, config.key, storage, fetcher as typeof fetch);

    await client.signIn("staff@example.test", "password");
    await client.signOut();

    expect(storage.has("pcg-missions.auth.v1")).toBe(false);
    const [url, init] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth?resource=logout");
    expect(init.method).toBe("POST");
  });

  it("refuses non-HTTPS hosted Supabase endpoints", () => {
    expect(() => new PcgAuthClient("http://pcg-test.supabase.co", config.key, createMemoryStorage()))
      .toThrow(/HTTPS/);
  });
});
