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


function xhrRequest(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === "undefined") {
      reject(new TypeError("XMLHttpRequest is unavailable in this browser."));
      return;
    }
    const request = new XMLHttpRequest();
    request.open(init.method ?? "GET", url, true);
    request.timeout = 15000;
    new Headers(init.headers).forEach((value, key) => request.setRequestHeader(key, value));
    request.onload = () => {
      if (request.status === 0) {
        reject(new TypeError("XMLHttpRequest completed without an HTTP response."));
        return;
      }
      const responseHeaders = new Headers();
      for (const line of request.getAllResponseHeaders().trim().split(/[\\r\\n]+/)) {
        const separator = line.indexOf(":");
        if (separator > 0) {
          responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
        }
      }
      resolve(new Response(request.responseText, {
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
      }));
    };
    request.onerror = () => reject(new TypeError("XMLHttpRequest network error."));
    request.ontimeout = () => reject(new TypeError("XMLHttpRequest timed out."));
    request.onabort = () => reject(new TypeError("XMLHttpRequest was aborted."));
    if (init.body === undefined || init.body === null) request.send();
    else request.send(init.body as XMLHttpRequestBodyInit);
  });
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/[\\r\\n]+/g, " ").slice(0, 160);
    return message ? `${error.name}: ${message}` : error.name;
  }
  return "Unknown network error";
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

  private isLocalDevelopment(): boolean {
    return typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");
  }

  private async sendWithBrowserFallback(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, init);
    } catch (fetchError) {
      try {
        return await xhrRequest(url, init);
      } catch (xhrError) {
        throw new AuthClientError(
          0,
          "NETWORK_ERROR",
          `Browser request failed. Fetch: ${errorDetail(fetchError)}; XMLHttpRequest: ${errorDetail(xhrError)}.`,
        );
      }
    }
  }

  private authEndpoint(proxyQuery: string, directPath: string): string {
    return this.isLocalDevelopment()
      ? `${this.baseUrl}${directPath}`
      : `/api/auth?${proxyQuery}`;
  }

  private saveSession(session: AuthSession | null): void {
    this.session = session;
    if (!this.storage) return;
    try {
      if (session) this.storage.setItem(SESSION_KEY, JSON.stringify(session));
      else this.storage.removeItem(SESSION_KEY);
    } catch {
      // Keep the authenticated session in memory when browser storage is
      // disabled by privacy settings, sandboxing, or an extension. This tab
      // can continue securely; a page reload will simply require sign-in again.
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
    const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    const requestInit: RequestInit = {
      ...init,
      headers: new Headers({
        apikey: this.publishableKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      }),
      cache: "no-store",
    };
    try {
      response = await this.sendWithBrowserFallback(
        this.authEndpoint(query, `/auth/v1/${path}`),
        requestInit,
      );
    } catch (proxyError) {
      // Retry the same configured project directly only after both browser
      // transports failed against the same-origin proxy.
      if (this.isLocalDevelopment()) throw proxyError;
      try {
        response = await this.sendWithBrowserFallback(`${this.baseUrl}/auth/v1/${path}`, requestInit);
      } catch (directError) {
        throw new AuthClientError(
          0,
          "NETWORK_ERROR",
          `Unable to reach the secure sign-in service. Proxy: ${errorDetail(proxyError)}; Supabase: ${errorDetail(directError)}.`,
        );
      }
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
      response = await this.sendWithBrowserFallback(this.authEndpoint("resource=user", "/auth/v1/user"), {
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

  async testConnection(): Promise<string> {
    const requestInit: RequestInit = {
      method: "POST",
      headers: {
        apikey: this.publishableKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "pcg-connection-check@invalid.example",
        password: "not-a-real-password-for-connectivity-testing",
      }),
      cache: "no-store",
    };

    let response: Response;
    let endpoint = "the PCG sign-in proxy";
    try {
      response = await this.fetcher(
        this.authEndpoint("grant_type=password", "/auth/v1/token?grant_type=password"),
        requestInit,
      );
    } catch (proxyError) {
      // Some browser/network configurations reject fetch() even for same-origin
      // POST requests. Probe the exact same proxy route with XMLHttpRequest before
      // falling back to the cross-origin Supabase endpoint.
      try {
        response = await xhrRequest(
          this.authEndpoint("grant_type=password", "/auth/v1/token?grant_type=password"),
          requestInit,
        );
        endpoint = "PCG sign-in proxy via XMLHttpRequest";
      } catch (xhrError) {
        if (this.isLocalDevelopment()) {
          throw new AuthClientError(
            0,
            "AUTH_PROXY_UNREACHABLE",
            `Browser POST transports failed. Fetch: ${errorDetail(proxyError)}; XMLHttpRequest: ${errorDetail(xhrError)}.`,
          );
        }
        endpoint = "Supabase Auth directly";
        try {
          response = await this.fetcher(
            `${this.baseUrl}/auth/v1/token?grant_type=password`,
            requestInit,
          );
        } catch (directError) {
          throw new AuthClientError(
            0,
            "AUTH_POST_UNREACHABLE",
            `Browser could not send the sign-in POST. PCG proxy fetch: ${errorDetail(proxyError)}; PCG proxy XHR: ${errorDetail(xhrError)}; Supabase fetch: ${errorDetail(directError)}.`,
          );
        }
      }
    }

    const raw = await response.text().catch(() => "");
    type DiagnosticPayload = { error_code?: string; code?: string; error?: string; msg?: string };
    let payload: DiagnosticPayload | null = null;
    try {
      payload = raw ? JSON.parse(raw) as DiagnosticPayload : null;
    } catch {
      payload = null;
    }
    const errorCode = payload?.error_code ?? payload?.code ?? payload?.error ?? "";
    const message = payload?.msg ?? "";
    if (
      response.status === 400 &&
      (errorCode === "invalid_credentials" || message.toLowerCase().includes("invalid login credentials"))
    ) {
      return `Connection test passed: your browser reached ${endpoint}, and Supabase Auth returned the expected response to a fake test account. This test did not sign you in.`;
    }
    if (response.status >= 500) {
      return `Your browser reached ${endpoint}, but the authentication service returned HTTP ${response.status}.`;
    }
    return `Your browser reached ${endpoint} and received HTTP ${response.status}, but it was not the expected test response. Response code: ${String(errorCode || "not provided")}.`;
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

  async completePasswordChange(password: string): Promise<void> {
    if (
      password.length < 12 || password.length > 128 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)
    ) {
      throw new AuthClientError(400, "WEAK_PASSWORD", "Use 12–128 characters with uppercase and lowercase letters, a number and a symbol.");
    }
    const token = await this.getAccessToken();
    if (!token) throw new AuthClientError(401, "AUTH_REQUIRED", "Sign in again before changing your password.");
    let result: Response;
    try {
      result = await this.sendWithBrowserFallback(
        this.authEndpoint("resource=complete-password-change", "/functions/v1/staff-auth/complete-password-change"),
        {
          method: "POST",
          headers: {
            apikey: this.publishableKey,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ password }),
          cache: "no-store",
        },
      );
    } catch {
      throw new AuthClientError(0, "NETWORK_ERROR", "Unable to save the new password.");
    }
    if (!result.ok) {
      const payload = await result.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      throw new AuthClientError(
        result.status,
        payload?.error?.code ?? "PASSWORD_CHANGE_FAILED",
        payload?.error?.message ?? "The new password could not be saved. Please try again.",
      );
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    let result: Response;
    try {
      result = await this.sendWithBrowserFallback(
        this.authEndpoint("resource=request-password-reset", "/functions/v1/staff-auth/request-password-reset"),
        {
          method: "POST",
          headers: {
            apikey: this.publishableKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
          cache: "no-store",
        },
      );
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
      await this.sendWithBrowserFallback(this.authEndpoint("resource=logout", "/auth/v1/logout?scope=global"), {
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
