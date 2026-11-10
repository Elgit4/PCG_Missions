export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: AuthUser;
}

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: AuthUser;
  msg?: string;
  message?: string;
  error_description?: string;
  error?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

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

const SESSION_KEY = "pcg-missions.auth.v1";

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function parseSession(value: string | null): AuthSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuthSession>;
    if (
      typeof parsed.access_token !== "string" ||
      typeof parsed.refresh_token !== "string" ||
      typeof parsed.expires_at !== "number" ||
      !parsed.user || typeof parsed.user.id !== "string"
    ) return null;
    return parsed as AuthSession;
  } catch {
    return null;
  }
}

function safeMessage(body: AuthResponse | null, fallback: string): string {
  const message = body?.message ?? body?.msg ?? body?.error_description ?? body?.error;
  return typeof message === "string" && message.length < 220 ? message : fallback;
}

export class PcgAuthClient {
  private readonly baseUrl: string;
  private session: AuthSession | null = null;
  private refreshPromise: Promise<AuthSession | null> | null = null;

  constructor(
    supabaseUrl: string,
    private readonly publishableKey: string,
    private readonly storage: StorageLike | null = browserStorage(),
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const normalizedUrl = supabaseUrl.trim().replace(/\/+$/, "");
    if (!normalizedUrl || !publishableKey.trim()) {
      throw new Error("Supabase URL and publishable key are required.");
    }
    const parsed = new URL(normalizedUrl);
    if (
      parsed.protocol !== "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) throw new Error("Supabase URL must use HTTPS outside local development.");
    this.baseUrl = normalizedUrl;
  }

  private saveSession(session: AuthSession | null): void {
    this.session = session;
    if (!this.storage) return;
    try {
      if (session) this.storage.setItem(SESSION_KEY, JSON.stringify(session));
      else this.storage.removeItem(SESSION_KEY);
    } catch {
      throw new AuthClientError(0, "SESSION_STORAGE_UNAVAILABLE", "Secure browser session storage is unavailable.");
    }
  }

  private readSession(): AuthSession | null {
    if (this.session) return this.session;
    try {
      this.session = parseSession(this.storage?.getItem(SESSION_KEY) ?? null);
    } catch {
      this.session = null;
    }
    return this.session;
  }

  private async requestAuth<T extends AuthResponse>(
    path: string,
    init: RequestInit,
    fallback: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/auth/v1/${path}`, {
        ...init,
        headers: new Headers({
          apikey: this.publishableKey,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string> | undefined),
        }),
        cache: "no-store",
      });
    } catch {
      throw new AuthClientError(0, "NETWORK_ERROR", "Unable to reach the secure sign-in service.");
    }
    const raw = await response.text();
    let payload: T | null = null;
    try {
      payload = raw ? JSON.parse(raw) as T : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const code = payload?.error ?? "AUTH_REQUEST_FAILED";
      throw new AuthClientError(response.status, code, safeMessage(payload, fallback));
    }
    if (!payload) throw new AuthClientError(502, "INVALID_AUTH_RESPONSE", "The sign-in service returned an invalid response.");
    return payload;
  }

  private toSession(payload: AuthResponse): AuthSession {
    if (
      typeof payload.access_token !== "string" ||
      typeof payload.refresh_token !== "string" ||
      !payload.user || typeof payload.user.id !== "string"
    ) throw new AuthClientError(502, "INVALID_AUTH_RESPONSE", "The sign-in service returned an incomplete session.");
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      token_type: payload.token_type ?? "bearer",
      user: payload.user,
    };
  }

  async restoreRecoveryFromUrl(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (fragment.get("type") !== "recovery") return false;
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (!accessToken || !refreshToken) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      throw new AuthClientError(400, "INVALID_RECOVERY_LINK", "This password-reset link is invalid or has expired.");
    }
    const expiresIn = Number(fragment.get("expires_in") ?? "3600");
    const user = await this.getUser(accessToken);
    this.saveSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + (Number.isFinite(expiresIn) ? expiresIn : 3600),
      token_type: fragment.get("token_type") ?? "bearer",
      user,
    });
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return true;
  }

  private async getUser(accessToken: string): Promise<AuthUser> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/auth/v1/user`, {
        method: "GET",
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch {
      throw new AuthClientError(0, "NETWORK_ERROR", "Unable to validate the recovery link.");
    }
    const payload = await response.json().catch(() => null) as AuthUser | null;
    if (!response.ok || !payload || typeof payload.id !== "string") {
      throw new AuthClientError(response.status || 502, "INVALID_RECOVERY_LINK", "This password-reset link is invalid or has expired.");
    }
    return { id: payload.id, email: payload.email ?? null };
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const normalizedEmail = email.trim().toLowerCase();
    const payload = await this.requestAuth<AuthResponse>(
      "token?grant_type=password",
      { method: "POST", body: JSON.stringify({ email: normalizedEmail, password }) },
      "Email or password was not accepted.",
    );
    const session = this.toSession(payload);
    this.saveSession(session);
    return session;
  }

  async refresh(): Promise<AuthSession | null> {
    if (this.refreshPromise) return this.refreshPromise;
    const current = this.readSession();
    if (!current?.refresh_token) return null;
    this.refreshPromise = (async () => {
      try {
        const payload = await this.requestAuth<AuthResponse>(
          "token?grant_type=refresh_token",
          { method: "POST", body: JSON.stringify({ refresh_token: current.refresh_token }) },
          "Your session has expired. Sign in again.",
        );
        const next = this.toSession(payload);
        this.saveSession(next);
        return next;
      } catch {
        this.saveSession(null);
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  async getAccessToken(): Promise<string | null> {
    const current = this.readSession();
    if (!current) return null;
    if (current.expires_at <= Math.floor(Date.now() / 1000) + 60) {
      const refreshed = await this.refresh();
      return refreshed?.access_token ?? null;
    }
    return current.access_token;
  }

  async getSession(): Promise<AuthSession | null> {
    const token = await this.getAccessToken();
    return token ? this.readSession() : null;
  }

  async updatePassword(password: string): Promise<void> {
    if (password.length < 12) {
      throw new AuthClientError(400, "WEAK_PASSWORD", "Use at least 12 characters for your new password.");
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw new AuthClientError(400, "WEAK_PASSWORD", "Use uppercase and lowercase letters, a number and a symbol.");
    }
    const token = await this.getAccessToken();
    if (!token) throw new AuthClientError(401, "AUTH_REQUIRED", "Sign in again before changing your password.");
    await this.requestAuth<AuthResponse>(
      "user",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      },
      "The new password could not be saved.",
    );
  }

  async completePasswordChange(): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) throw new AuthClientError(401, "AUTH_REQUIRED", "Sign in again before completing password setup.");
    const result = await this.fetcher(`${this.baseUrl}/functions/v1/staff-auth/complete-password-change`, {
      method: "POST",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    });
    if (!result.ok) {
      throw new AuthClientError(result.status, "PASSWORD_CHANGE_COMPLETION_FAILED", "Your password was changed, but account setup could not be confirmed. Sign in again or contact an administrator.");
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    let result: Response;
    try {
      result = await this.fetcher(`${this.baseUrl}/functions/v1/staff-auth/request-password-reset`, {
        method: "POST",
        headers: {
          apikey: this.publishableKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        cache: "no-store",
      });
    } catch {
      throw new AuthClientError(0, "NETWORK_ERROR", "Unable to send the password-reset request.");
    }
    if (!result.ok) {
      throw new AuthClientError(result.status, "RESET_REQUEST_FAILED", "The password-reset request could not be sent. Try again later.");
    }
  }

  async signOut(): Promise<void> {
    const token = await this.getAccessToken();
    this.saveSession(null);
    if (!token) return;
    try {
      await this.fetcher(`${this.baseUrl}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
    } catch {
      // Local tokens are already removed; server-side expiration remains authoritative.
    }
  }
}
