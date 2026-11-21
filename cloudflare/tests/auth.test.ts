import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseAuthUser,
  deleteSupabaseAuthUser,
  verifySupabaseAccessToken,
  type SupabaseAuthEnvironment,
} from "../src/auth";

const USER_ID = "3c4f4f8d-7d3b-4a9c-8f1a-5a5f4a4b7c21";
const BASE_ENV: SupabaseAuthEnvironment = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-secret",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Supabase access-token verification", () => {
  it("rejects a missing bearer token without calling Supabase", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await verifySupabaseAccessToken(new Request("https://worker.test/api/v1/me"), BASE_ENV);
    expect(result).toEqual({ state: "unauthenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts only the identity returned by Supabase Auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: USER_ID, email: "staff@example.com" }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://worker.test/api/v1/me", {
      headers: { Authorization: "Bearer valid-access-token" },
    });
    const result = await verifySupabaseAccessToken(request, BASE_ENV);
    expect(result).toEqual({
      state: "valid",
      user: { id: USER_ID, email: "staff@example.com" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/user",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          apikey: "sb_publishable_test",
          Authorization: "Bearer valid-access-token",
        }),
      }),
    );
  });

  it("rejects expired or revoked tokens returned as 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const result = await verifySupabaseAccessToken(
      new Request("https://worker.test", { headers: { Authorization: "Bearer expired-token" } }),
      BASE_ENV,
    );
    expect(result).toEqual({ state: "unauthenticated" });
  });

  it("fails closed with an unavailable state on upstream 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const result = await verifySupabaseAccessToken(
      new Request("https://worker.test", { headers: { Authorization: "Bearer token" } }),
      BASE_ENV,
    );
    expect(result).toEqual({ state: "unavailable" });
  });

  it("fails closed when the Auth service cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    const result = await verifySupabaseAccessToken(
      new Request("https://worker.test", { headers: { Authorization: "Bearer token" } }),
      BASE_ENV,
    );
    expect(result).toEqual({ state: "unavailable" });
  });

  it("treats a malformed successful Auth response as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "not-a-uuid" })));
    const result = await verifySupabaseAccessToken(
      new Request("https://worker.test", { headers: { Authorization: "Bearer token" } }),
      BASE_ENV,
    );
    expect(result).toEqual({ state: "unavailable" });
  });
});

describe("Supabase Auth Admin adapter", () => {
  it("creates an invited user through the server-only Admin API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: USER_ID }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createSupabaseAuthUser(BASE_ENV, {
      email: "staff@example.com",
      password: "a-long-temporary-password",
      fullName: "Staff Member",
    })).resolves.toBe(USER_ID);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/auth/v1/admin/users");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer server-only-service-role-secret");
    expect(String(init.body)).toContain('"email_confirm":true');
  });

  it("deletes a newly created identity for D1 compensation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteSupabaseAuthUser(BASE_ENV, USER_ID)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://example.supabase.co/auth/v1/admin/users/${USER_ID}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("does not call Admin APIs without a service-role secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createSupabaseAuthUser(
      { ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined },
      { email: "staff@example.com", password: "temporary-password", fullName: "Staff" },
    )).rejects.toThrow("SUPABASE_ADMIN_AUTH_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
