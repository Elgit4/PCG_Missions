export interface SupabaseAuthEnvironment {
  DB: {
    prepare(sql: string): {
      bind(...values: unknown[]): {
        first<T = Record<string, unknown>>(): Promise<T | null>;
      };
    };
  };
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface SupabaseAuthUser {
  id: string;
  email: string;
}

/** Validate the caller's access token against Supabase Auth. Never trust JWT claims
 * decoded locally: the Auth service is the identity authority. */
export type SupabaseTokenVerification =
  | { state: "valid"; user: SupabaseAuthUser }
  | { state: "unauthenticated" }
  | { state: "unavailable" };

export async function verifySupabaseAccessToken(
  request: Request,
  env: SupabaseAuthEnvironment,
): Promise<SupabaseTokenVerification> {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/i);
  if (!match) return { state: "unauthenticated" };
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return { state: "unavailable" };

  let base: URL;
  try {
    base = new URL(env.SUPABASE_URL);
    if (base.protocol !== "https:" && base.hostname !== "localhost") return { state: "unavailable" };
  } catch {
    return { state: "unavailable" };
  }

  try {
    const response = await fetch(new URL("/auth/v1/user", base), {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${match[1]}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) return { state: "unauthenticated" };
    if (!response.ok) return { state: "unavailable" };
    const user = await response.json() as { id?: unknown; email?: unknown };
    if (typeof user.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)) {
      return { state: "unavailable" };
    }
    return { state: "valid", user: { id: user.id, email: typeof user.email === "string" ? user.email : "" } };
  } catch {
    return { state: "unavailable" };
  }
}
async function supabaseAdminRequest(
  env: SupabaseAuthEnvironment,
  path: string,
  init: RequestInit,
): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_ADMIN_AUTH_NOT_CONFIGURED");
  }
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("SUPABASE_URL_MUST_USE_HTTPS");
  }
  return fetch(new URL(path, base), {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
}

/** Create an Auth identity only from a server-authorized Admin provisioning workflow. */
export async function createSupabaseAuthUser(
  env: SupabaseAuthEnvironment,
  input: { email: string; password: string; fullName: string },
): Promise<string> {
  const response = await supabaseAdminRequest(env, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    id?: unknown;
    user?: { id?: unknown };
    msg?: string;
    message?: string;
  };
  const id = typeof payload.id === "string" ? payload.id :
    typeof payload.user?.id === "string" ? payload.user.id : null;
  if (!response.ok || !id) {
    throw new Error(`SUPABASE_AUTH_USER_CREATE_FAILED:${response.status}`);
  }
  return id;
}

/** Compensating action when D1 staff provisioning does not commit. */
export async function deleteSupabaseAuthUser(
  env: SupabaseAuthEnvironment,
  userId: string,
): Promise<void> {
  const response = await supabaseAdminRequest(
    env,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`SUPABASE_AUTH_USER_DELETE_FAILED:${response.status}`);
  }
}
