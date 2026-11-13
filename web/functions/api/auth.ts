const MAX_BODY_BYTES = 8 * 1024;

interface PagesEnv {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: PagesEnv;
}

type JsonRecord = Record<string, unknown>;

function json(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function error(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } });
}

function isSameOrigin(request: Request, requestUrl: URL): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === requestUrl.host;
  } catch {
    return false;
  }
}

async function readJsonBody(request: Request): Promise<JsonRecord | null> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as JsonRecord
      : null;
  } catch {
    return null;
  }
}

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  const requestUrl = new URL(request.url);
  if (!isSameOrigin(request, requestUrl)) {
    return error(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
  }

  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = String(
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "",
  );

  if (!supabaseUrl || !publishableKey) {
    if (requestUrl.searchParams.get("health") === "1") {
      return json(503, {
        ok: false,
        service: "pcg-missions-auth-proxy",
        configuration: {
          supabaseUrlPresent: Boolean(supabaseUrl),
          publishableKeyPresent: Boolean(publishableKey),
          upstreamReachable: false,
        },
      });
    }
    return error(503, "AUTH_PROXY_NOT_CONFIGURED", "The secure sign-in service is not configured on the server.");
  }

  if (requestUrl.searchParams.get("health") === "1") {
    try {
      const upstream = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: publishableKey, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      await upstream.body?.cancel().catch(() => undefined);
      const reachable = upstream.ok;
      return json(reachable ? 200 : 503, {
        ok: reachable,
        service: "pcg-missions-auth-proxy",
        configuration: {
          supabaseUrlPresent: true,
          publishableKeyPresent: true,
          upstreamReachable: reachable,
          upstreamStatus: upstream.status,
        },
      });
    } catch {
      return json(503, {
        ok: false,
        service: "pcg-missions-auth-proxy",
        configuration: {
          supabaseUrlPresent: true,
          publishableKeyPresent: true,
          upstreamReachable: false,
        },
      });
    }
  }

  const grantType = requestUrl.searchParams.get("grant_type");
  const resource = requestUrl.searchParams.get("resource");
  let expectedMethod = "";
  let upstreamPath = "";
  let requiresBearer = false;
  let outgoingBody: JsonRecord | undefined;

  if (grantType === "password" || grantType === "refresh_token") {
    expectedMethod = "POST";
    upstreamPath = `/auth/v1/token?grant_type=${grantType}`;
    const body = await readJsonBody(request);
    if (!body) return error(400, "INVALID_REQUEST", "Sign-in details are required.");

    if (grantType === "password") {
      if (
        typeof body.email !== "string" ||
        body.email.length > 254 ||
        typeof body.password !== "string" ||
        body.password.length < 1 ||
        body.password.length > 128
      ) return error(400, "INVALID_CREDENTIALS_FORMAT", "Enter a valid email address and password.");
      outgoingBody = { email: body.email.trim().toLowerCase(), password: body.password };
    } else {
      if (
        typeof body.refresh_token !== "string" ||
        body.refresh_token.length < 1 ||
        body.refresh_token.length > 4096
      ) return error(400, "INVALID_SESSION", "The session could not be refreshed.");
      outgoingBody = { refresh_token: body.refresh_token };
    }
  } else {
    const resources: Record<string, { method: string; path: string; bearer: boolean }> = {
      user: { method: "GET", path: "/auth/v1/user", bearer: true },
      logout: { method: "POST", path: "/auth/v1/logout?scope=global", bearer: true },
      "staff-session": { method: "GET", path: "/functions/v1/staff-session", bearer: true },
      "complete-password-change": {
        method: "POST",
        path: "/functions/v1/staff-auth/complete-password-change",
        bearer: true,
      },
      "request-password-reset": {
        method: "POST",
        path: "/functions/v1/staff-auth/request-password-reset",
        bearer: false,
      },
    };
    const selected = resource ? resources[resource] : undefined;
    if (!selected) return error(404, "AUTH_ROUTE_NOT_FOUND", "The requested authentication operation does not exist.");

    expectedMethod = selected.method;
    upstreamPath = selected.path;
    requiresBearer = selected.bearer;

    if (resource === "complete-password-change" || resource === "request-password-reset") {
      const body = await readJsonBody(request);
      if (!body) return error(400, "INVALID_REQUEST", "The request body is invalid.");
      if (resource === "request-password-reset" &&
        (typeof body.email !== "string" || body.email.length > 254)
      ) return error(400, "INVALID_EMAIL", "Enter a valid staff email address.");
      if (resource === "complete-password-change" &&
        (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128)
      ) return error(400, "WEAK_PASSWORD", "Use a strong new password of at least 12 characters.");
      outgoingBody = body;
    }
  }

  if (request.method !== expectedMethod) {
    return new Response(JSON.stringify({
      error: { code: "METHOD_NOT_ALLOWED", message: "The request method is not allowed." },
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        Allow: expectedMethod,
      },
    });
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (requiresBearer && !/^Bearer\s+\S+/i.test(authorization)) {
    return error(401, "AUTH_REQUIRED", "A valid sign-in session is required.");
  }

  const headers = new Headers({
    apikey: publishableKey,
    Accept: "application/json",
  });
  if (requiresBearer) headers.set("Authorization", authorization);
  if (outgoingBody) headers.set("Content-Type", "application/json");

  try {
    const upstream = await fetch(`${supabaseUrl}${upstreamPath}`, {
      method: expectedMethod,
      headers,
      ...(outgoingBody ? { body: JSON.stringify(outgoingBody) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const responseHeaders = new Headers({
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    const contentType = upstream.headers.get("Content-Type");
    if (contentType) responseHeaders.set("Content-Type", contentType);
    if (upstream.status === 204 || upstream.status === 205) {
      return new Response(null, { status: upstream.status, headers: responseHeaders });
    }
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return error(502, "AUTH_UPSTREAM_UNAVAILABLE", "The authentication service could not be reached. Please retry.");
  }
};
