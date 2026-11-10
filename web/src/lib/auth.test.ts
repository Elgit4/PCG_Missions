import { describe, expect, it, vi } from "vitest";
import { SupabaseAuthClient, SupabaseAuthError } from "./auth";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const config = { supabaseUrl: "https://example.supabase.co/", publishableKey: "public-test-key" };
const session = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  token_type: "bearer",
  expires_in: 3600,
  user: { id: "user-1", email: "staff@example.org" },
};

describe("SupabaseAuthClient", () => {
  it("authenticates a staff email and PIN through Supabase Auth", async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn(async () => new Response(JSON.stringify(session), { status: 200 }));
    const auth = new SupabaseAuthClient(config, storage, fetcher as typeof fetch);
    await auth.signInWithPin(" Staff@Example.org ", "123456");
    expect(await auth.getAccessToken()).toBe("access-1");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/auth/v1/token?grant_type=password");
    expect(JSON.parse(String(init.body))).toEqual({ email: "staff@example.org", password: "123456" });
    expect(storage.getItem("pcg-missions.auth-session.v1")).toContain("refresh-1");
  });

  it("refreshes an expired session and rotates the refresh token", async () => {
    const storage = new MemoryStorage();
    storage.setItem("pcg-missions.auth-session.v1", JSON.stringify({
      ...session, expires_at: Math.floor(Date.now() / 1000) - 1,
    }));
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ...session, access_token: "access-2", refresh_token: "refresh-2",
    }), { status: 200 }));
    const auth = new SupabaseAuthClient(config, storage, fetcher as typeof fetch);
    expect(await auth.restoreSession()).toBe(true);
    expect(await auth.getAccessToken()).toBe("access-2");
    expect(storage.getItem("pcg-missions.auth-session.v1")).toContain("refresh-2");
  });

  it("clears an invalid stored session", async () => {
    const storage = new MemoryStorage();
    storage.setItem("pcg-missions.auth-session.v1", JSON.stringify({ access_token: "bad" }));
    const auth = new SupabaseAuthClient(config, storage);
    expect(await auth.restoreSession()).toBe(false);
    expect(storage.getItem("pcg-missions.auth-session.v1")).toBeNull();
  });

  it("returns a safe credential error for failed sign-in", async () => {
    const auth = new SupabaseAuthClient(
      config,
      new MemoryStorage(),
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof fetch,
    );
    await expect(auth.signInWithPin("staff@example.org", "wrong")).rejects.toBeInstanceOf(SupabaseAuthError);
    await expect(auth.getAccessToken()).resolves.toBeNull();
  });
});
