import { createAuth } from "./auth";
import { resolveStaffContext, type StaffEnvironment } from "./staff-context";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env extends StaffEnvironment {
  DB: D1Database & StaffEnvironment["DB"];
  APP_ENV?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
}

function json(status: number, body: Record<string, unknown>, requestId: string, origin?: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "X-Request-Id": requestId,
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify({ ...body, request_id: requestId }), { status, headers });
}

function allowedOrigins(env: Env): Set<string> {
  const values = [
    env.BETTER_AUTH_URL ?? "",
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
  ].map((value) => value.trim()).filter(Boolean);
  return new Set(values.map((value) => new URL(value).origin));
}

function requestOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return allowedOrigins(env).has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function authCorsHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Branch-Id",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  });
}

function withSecurityHeaders(response: Response, origin?: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.append("Vary", "Origin");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isAuthPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const origin = request.headers.get("Origin") ?? undefined;

    if (!requestOriginAllowed(request, env)) {
      return json(403, {
        ok: false,
        error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." },
      }, requestId);
    }

    if (isAuthPath(url.pathname)) {
      if (request.method === "OPTIONS") {
        if (!origin) return new Response(null, { status: 204 });
        return new Response(null, { status: 204, headers: authCorsHeaders(origin) });
      }
      if (request.method !== "GET" && request.method !== "POST") {
        return json(405, {
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
        }, requestId, origin);
      }
      try {
        const auth = createAuth(env);
        return withSecurityHeaders(await auth.handler(request), origin);
      } catch {
        return json(503, {
          ok: false,
          error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured for this environment." },
        }, requestId, origin);
      }
    }

    if (request.method !== "GET") {
      return json(405, {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "This endpoint is read-only." },
      }, requestId, origin);
    }

    if (url.pathname === "/health" || url.pathname === "/api/v1/health") {
      try {
        const result = await env.DB.prepare(
          "SELECT schema_version, environment FROM app_meta WHERE id = 1 LIMIT 1",
        ).first<{ schema_version: number; environment: string }>();

        if (!result || result.environment !== "non-production") {
          return json(503, {
            ok: false,
            service: "pcg-missions-cloudflare-api",
            state: "database_not_initialized",
          }, requestId, origin);
        }

        return json(200, {
          ok: true,
          service: "pcg-missions-cloudflare-api",
          state: "ready",
          environment: result.environment,
          schema_version: result.schema_version,
          authentication: "configured_at_runtime",
        }, requestId, origin);
      } catch {
        return json(503, {
          ok: false,
          service: "pcg-missions-cloudflare-api",
          state: "database_unavailable_or_migrations_missing",
        }, requestId, origin);
      }
    }

    if (url.pathname === "/api/v1/me") {
      try {
        const context = await resolveStaffContext(request, env);
        if (context.state === "unauthenticated") {
          return json(401, { ok: false, error: { code: "UNAUTHENTICATED" } }, requestId, origin);
        }
        if (context.state === "staff_not_provisioned") {
          return json(403, { ok: false, error: { code: "STAFF_NOT_PROVISIONED" } }, requestId, origin);
        }
        if (context.state === "staff_inactive") {
          return json(403, { ok: false, error: { code: "STAFF_ACCOUNT_INACTIVE" } }, requestId, origin);
        }
        return json(200, {
          ok: true,
          staff: context.staff,
          active_branch: context.activeBranch,
          branch_selection_required: context.activeBranch === null && context.staff.branches.length > 0,
        }, requestId, origin);
      } catch {
        return json(503, {
          ok: false,
          error: { code: "STAFF_CONTEXT_UNAVAILABLE", message: "The staff session could not be verified." },
        }, requestId, origin);
      }
    }

    return json(404, {
      ok: false,
      error: { code: "ROUTE_NOT_FOUND", message: "This API route has not been implemented." },
    }, requestId, origin);
  },
};
