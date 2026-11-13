interface D1PreparedStatement {
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB: D1Database;
  APP_ENV?: string;
}

function json(status: number, body: Record<string, unknown>, requestId: string): Response {
  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    },
  });
}

function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    if (!isSameOrigin(request, url)) {
      return json(403, {
        ok: false,
        error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." },
      }, requestId);
    }

    if (request.method !== "GET") {
      return json(405, {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "This endpoint is read-only." },
      }, requestId);
    }

    if (url.pathname !== "/health" && url.pathname !== "/api/v1/health") {
      return json(404, {
        ok: false,
        error: { code: "ROUTE_NOT_FOUND", message: "This API route has not been implemented." },
      }, requestId);
    }

    try {
      const result = await env.DB.prepare(
        "SELECT schema_version, environment FROM app_meta WHERE id = 1 LIMIT 1",
      ).first<{ schema_version: number; environment: string }>();

      if (!result || result.environment !== "non-production") {
        return json(503, {
          ok: false,
          service: "pcg-missions-cloudflare-api",
          state: "database_not_initialized",
        }, requestId);
      }

      return json(200, {
        ok: true,
        service: "pcg-missions-cloudflare-api",
        state: "ready",
        environment: result.environment,
        schema_version: result.schema_version,
      }, requestId);
    } catch {
      return json(503, {
        ok: false,
        service: "pcg-missions-cloudflare-api",
        state: "database_unavailable_or_migrations_missing",
      }, requestId);
    }
  },
};
