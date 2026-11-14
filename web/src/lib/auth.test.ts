import { describe, expect, it, vi } from "vitest";
import { AuthClientError, PcgAuthClient } from "./auth";

describe("PcgAuthClient — Better Auth cookie sessions", () => {
  it("signs in with normalized email and relies on HttpOnly cookies", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      user: { id: "staff-user", email: "staff@example.test" },
      session: { id: "session-1", expiresAt: "2026-11-20T00:00:00.000Z" },
    }), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    const result = await client.signIn(" Staff@Example.Test ", "a-strong-password");
    expect(result.user.email).toBe("staff@example.test");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ email: "staff@example.test", password: "a-strong-password" });
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("restores the server session without reading browser storage", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      user: { id: "staff-user", email: "staff@example.test" },
      session: { id: "session-1", expiresAt: "2026-11-20T00:00:00.000Z" },
    }), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await expect(client.getSession()).resolves.toMatchObject({ user: { id: "staff-user" } });
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/auth/get-session");
    expect((fetcher.mock.calls[0]?.[1] as unknown as RequestInit).credentials).toBe("include");
  });

  it("returns null when there is no signed-in session", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("null", { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await expect(client.getSession()).resolves.toBeNull();
  });

  it("signs out through Better Auth", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("{}", { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await client.signOut();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/auth/sign-out");
    expect((fetcher.mock.calls[0]?.[1] as unknown as RequestInit).method).toBe("POST");
  });

  it("tests API readiness without sending fake credentials", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      ok: true, schema_version: 24,
    }), { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await expect(client.testConnection()).resolves.toContain("schema version 24");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/health");
  });

  it("sends password rotation through the authenticated same-origin endpoint", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("{}", { status: 200 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    const currentSecret = "Current-" + "Value-" + "2026!";
    const nextSecret = "Next-" + "Value-" + "2026!Strong";
    await expect(client.changePassword(currentSecret, nextSecret)).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/change-password");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual({
      currentPassword: currentSecret,
      newPassword: nextSecret,
      revokeOtherSessions: true,
    });
  });

  it("rejects weak replacements before sending the request", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const client = new PcgAuthClient(fetcher);
    await expect(client.changePassword("Current-" + "Value-" + "2026!", "weak-only-123"))
      .rejects.toMatchObject({ status: 400, code: "PASSWORD_POLICY_INVALID" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not silently bypass the not-yet-migrated admin recovery workflow", async () => {
    const client = new PcgAuthClient(vi.fn() as typeof fetch);
    await expect(client.requestPasswordReset("staff@example.test")).rejects.toMatchObject({
      code: "ADMIN_APPROVED_RECOVERY_NOT_MIGRATED",
      status: 501,
    });
  });

  it("reports failed sign-in responses with a stable error code", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password",
    }), { status: 401 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    await expect(client.signIn("staff@example.test", "wrong"))
      .rejects.toMatchObject({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" });
  });

  it("surfaces network errors without exposing secrets", async () => {
    const client = new PcgAuthClient(vi.fn(async (..._args: Parameters<typeof fetch>) => { throw new TypeError("offline"); }) as typeof fetch);
    await expect(client.getSession()).rejects.toBeInstanceOf(AuthClientError);
  });

  it("accepts a valid invitation through the same-origin Worker endpoint", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
      ok: true, staff_profile_id: "staff-1", account_status: "active", sign_in_required: true,
    }), { status: 201 }));
    const client = new PcgAuthClient(fetcher as typeof fetch);
    const token = "A".repeat(43);
    const password = "Strong-" + "Invite-" + "2026!";
    await expect(client.acceptInvitation(token, password)).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/staff/invitations/accept");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ invitation_token: token, password });
  });

  it("rejects invalid invitation credentials before contacting the Worker", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const client = new PcgAuthClient(fetcher);
    await expect(client.acceptInvitation("bad-token", "weak")).rejects.toMatchObject({
      status: 400, code: "INVALID_INVITATION_TOKEN",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

});
