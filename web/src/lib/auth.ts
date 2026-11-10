export interface SupabaseAuthConfig {
  supabaseUrl: string;
  publishableKey: string;
}

export interface AuthUser {
  id: string;
  email?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
  user: AuthUser;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface AuthResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  expires_at?: unknown;
  expires_in?: unknown;
  user?: unknown;
}

export class SupabaseAuthError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

const SESSION_KEY = "pcg-missions.auth-session.v1";
const EXPIRY_SKEW_SECONDS = 60;

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const result: unknown = JSON.parse(value);
    return result && typeof result === "object" && !Array.isArray(result)
      ? result as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === "string" && user.id.length > 0 &&
    (user.email === undefined || user.email === null || typeof user.email === "string");
}

function normalizeSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as AuthResponse;
  if (
    typeof candidate.access_token !== "string" ||
    typeof candidate.refresh_token !== "string" ||
    typeof candidate.token_type !== "string" ||
    !isAuthUser(candidate.user)
  ) return null;

  const expiresAt = typeof candidate.expires_at === "number"
    ? candidate.expires_at
    : typeof candidate.expires_in === "number"
    ? Math.floor(Date.now() / 1000) + candidate.expires_in
    : 0;

  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return {
    access_token: candidate.access_token,
    refresh_token: candidate.refresh_token,
    token_type: candidate.token_type,
    expires_at: expiresAt,
    user: candidate.user,
  };
}

export class SupabaseAuthClient {
  private session: AuthSession | null = null;
  private refreshInFlight: Promise<AuthSession | null> | null = null;
  private readonly baseUrl: string;

  constructor(
    private readonly config: SupabaseAuthConfig,
    private readonly storage: StorageLike = window.sessionStorage,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = config.supabaseUrl.trim().replace(/\/+$/, "");
    if (!this.baseUrl || !config.publishableKey.trim()) {
      throw new Error("Supabase Auth configuration is incomplete.");
    }
  }

  private async authRequest<T>(
    path: string,
    body?: unknown,
    accessToken?: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/auth/v1/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          apikey: this.config.publishableKey,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new SupabaseAuthError("NETWORK_ERROR", "Unable to reach the sign-in service. Check your connection.");
    }

    if (!response.ok) {
      const payload = parseObject(await response.text());
      const rawCode = payload?.error_code ?? payload?.code ?? payload?.error;
      const code = typeof rawCode === "string" ? rawCode : `AUTH_HTTP_${response.status}`;
      if (response.status === 400 || response.status === 401) {
        throw new SupabaseAuthError("INVALID_CREDENTIALS", "The email address or staff PIN is incorrect.");
      }
      if (response.status === 429) {
        throw new SupabaseAuthError("RATE_LIMITED", "Too many sign-in attempts. Please wait before trying again.");
      }
      throw new SupabaseAuthError(code, "The sign-in service could not complete the request.");
    }
    return await response.json() as T;
  }

  private save(session: AuthSession): void {
    this.session = session;
    this.storage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  private clear(): void {
    this.session = null;
    this.storage.removeItem(SESSION_KEY);
  }

  async signInWithPin(email: string, pin: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !pin) {
      throw new SupabaseAuthError("VALIDATION_ERROR", "Enter your staff email and PIN.");
    }

    const response = await this.authRequest<AuthResponse>("token?grant_type=password", {
      email: normalizedEmail,
      password: pin,
    });
    const session = normalizeSession(response);
    if (!session) {
      throw new SupabaseAuthError("INVALID_AUTH_RESPONSE", "The sign-in service returned an invalid session.");
    }
    this.save(session);
  }

  async restoreSession(): Promise<boolean> {
    const stored = parseObject(this.storage.getItem(SESSION_KEY) ?? "");
    const restored = normalizeSession(stored);
    if (!restored) {
      this.clear();
      return false;
    }

    this.session = restored;
    if (restored.expires_at <= Math.floor(Date.now() / 1000) + EXPIRY_SKEW_SECONDS) {
      return (await this.refreshSession()) !== null;
    }

    try {
      await this.authRequest("user", undefined, restored.access_token);
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.session) return null;
    if (this.session.expires_at > Math.floor(Date.now() / 1000) + EXPIRY_SKEW_SECONDS) {
      return this.session.access_token;
    }
    const refreshed = await this.refreshSession();
    return refreshed?.access_token ?? null;
  }

  async refreshSession(): Promise<AuthSession | null> {
    if (this.refreshInFlight) return await this.refreshInFlight;
    const current = this.session;
    if (!current?.refresh_token) {
      this.clear();
      return null;
    }

    this.refreshInFlight = (async () => {
      try {
        const response = await this.authRequest<AuthResponse>("token?grant_type=refresh_token", {
          refresh_token: current.refresh_token,
        });
        const refreshed = normalizeSession(response);
        if (!refreshed) {
          this.clear();
          return null;
        }
        this.save(refreshed);
        return refreshed;
      } catch (error) {
        if (error instanceof SupabaseAuthError && error.code !== "NETWORK_ERROR") this.clear();
        throw error;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return await this.refreshInFlight;
  }

  async signOut(): Promise<void> {
    const token = this.session?.access_token;
    try {
      if (token) await this.authRequest("logout", undefined, token);
    } finally {
      this.clear();
    }
  }

  getCurrentUser(): AuthUser | null {
    return this.session?.user ?? null;
  }
}
