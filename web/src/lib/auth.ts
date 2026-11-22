export interface AuthUser { id: string; email: string | null; name?: string | null; }
export interface AuthSession { user: AuthUser; session: { id: string; expiresAt: string }; }
interface AuthErrorPayload { message?: string; code?: string; error?: { message?: string; code?: string }; }

export class AuthClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AuthClientError";
    this.status = status;
    this.code = code;
  }
}

async function readPayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export class PcgAuthClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async request(path: string, method = "GET", body?: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    let response: Response;
    try {
      response = await this.fetcher("/api/auth/" + path.replace(/^\/+/, ""), {
        method,
        credentials: "include",
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new AuthClientError(0, "AUTH_NETWORK_ERROR", "The secure sign-in service could not be reached. Check your connection and retry.");
    }
    const payload = await readPayload(response);
    if (!response.ok) {
      const detail = payload as AuthErrorPayload | null;
      throw new AuthClientError(response.status, detail?.code ?? detail?.error?.code ?? "AUTH_HTTP_" + response.status,
        detail?.message ?? detail?.error?.message ?? "The sign-in request could not be completed.");
    }
    return payload;
  }

  private async workerRequest(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    let response: Response;
    try {
      response = await this.fetcher(path, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthClientError(0, "AUTH_NETWORK_ERROR", "The secure account service could not be reached. Check your connection and retry.");
    }
    const payload = await readPayload(response);
    if (!response.ok) {
      const detail = payload as AuthErrorPayload | null;
      throw new AuthClientError(response.status, detail?.code ?? detail?.error?.code ?? "AUTH_HTTP_" + response.status,
        detail?.message ?? detail?.error?.message ?? "The account request could not be completed.");
    }
    return payload;
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const payload = await this.request("sign-in/email", "POST", { email: email.trim().toLowerCase(), password });
    const user = payload?.user as AuthUser | undefined;
    const session = payload?.session as AuthSession["session"] | undefined;
    if (!user || typeof user.id !== "string") throw new AuthClientError(502, "INVALID_AUTH_RESPONSE", "The sign-in service did not return a valid staff session.");
    return { user: { id: user.id, email: user.email ?? null, name: user.name ?? null }, session: session ?? { id: "cookie-session", expiresAt: "" } };
  }

  async getSession(): Promise<AuthSession | null> {
    const payload = await this.request("get-session");
    if (!payload) return null;
    const user = payload.user as AuthUser | undefined;
    const session = payload.session as AuthSession["session"] | undefined;
    if (!user || typeof user.id !== "string") return null;
    return { user: { id: user.id, email: user.email ?? null, name: user.name ?? null }, session: session ?? { id: "cookie-session", expiresAt: "" } };
  }

  async getAccessToken(): Promise<string | null> {
    // Better Auth uses HttpOnly cookies. Session tokens never enter JavaScript or browser storage.
    return null;
  }

  async signOut(): Promise<void> {
    try { await this.request("sign-out", "POST"); } catch { /* Server-side cookie expiry remains authoritative. */ }
  }

  async testConnection(): Promise<string> {
    let response: Response;
    try { response = await this.fetcher("/api/v1/health", { credentials: "include", cache: "no-store" }); }
    catch { throw new AuthClientError(0, "API_UNREACHABLE", "The PCG Missions API could not be reached."); }
    const payload = await readPayload(response);
    if (!response.ok || payload?.ok !== true) throw new AuthClientError(response.status || 503, "API_NOT_READY", "The PCG Missions API is not ready yet. Please retry later.");
    return "Connection test passed: the Cloudflare API is reachable (schema version " + String(payload.schema_version ?? "unknown") + ").";
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!currentPassword || currentPassword.length > 128) throw new AuthClientError(400, "CURRENT_PASSWORD_REQUIRED", "Enter your current password.");
    this.validatePassword(newPassword);
    await this.request("change-password", "POST", { currentPassword, newPassword, revokeOtherSessions: true });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const payload = await this.workerRequest("/api/v1/auth/password-reset-requests", { email: email.trim().toLowerCase() });
    if (payload?.ok !== true) throw new AuthClientError(502, "INVALID_RESET_RESPONSE", "The reset request could not be confirmed.");
  }

  async completePasswordChange(password: string): Promise<void> {
    this.validatePassword(password);
    const payload = await this.workerRequest("/api/v1/auth/password/change", { password });
    if (payload?.ok !== true) throw new AuthClientError(502, "PASSWORD_CHANGE_CONFIRMATION_FAILED", "The server did not confirm the password change.");
  }

  async acceptInvitation(token: string, password: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthClientError(400, "INVALID_INVITATION_TOKEN", "This invitation link is invalid. Ask an administrator to issue a new invitation.");
    this.validatePassword(password);
    const payload = await this.workerRequest("/api/v1/staff/invitations/accept", { invitation_token: token, password });
    if (payload?.ok !== true) throw new AuthClientError(502, "INVALID_INVITATION_RESPONSE", "The invitation service did not confirm account creation.");
  }

  async restoreRecoveryFromUrl(): Promise<boolean> { return false; }

  private validatePassword(password: string): void {
    if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw new AuthClientError(400, "PASSWORD_POLICY_INVALID", "Use 12–128 characters with uppercase and lowercase letters, a number and a symbol.");
    }
  }
}
