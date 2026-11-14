interface PagesEnv {
  PCG_MISSIONS_API_ORIGIN?: string;
}

interface PagesMiddlewareContext {
  request: Request;
  env: PagesEnv;
  next: () => Promise<Response>;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]);
const FORWARDED_HEADERS = [
  "accept",
  "content-type",
  "cookie",
  "origin",
  "user-agent",
  "authorization",
  "x-branch-id",
  "idempotency-key",
];

function json(status: number, code: string, message: string, requestId: string): Response {
  return new Response(JSON.stringify({
    ok: false,
    error: { code, message },
    request_id: requestId,
  }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Request-ID": requestId,
    },
  });
}

/**
 * API gateway middleware for every /api/* request.
 *
 * Using a literal /api/_middleware route avoids relying on the generated
 * optional multi-segment catch-all route for the critical authentication
 * and health endpoints. All API requests remain same-origin in the browser.
 */
export const onRequest = async (context: PagesMiddlewareContext): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const requestId = crypto.randomUUID();

  if (!ALLOWED_METHODS.has(request.method)) {
    return json(405, "METHOD_NOT_ALLOWED", "This request method is not supported.", requestId);
  }

  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) {
        return json(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.", requestId);
      }
    } catch {
      return json(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.", requestId);
    }
  }

  let upstreamOrigin: URL;
  try {
    upstreamOrigin = new URL(String(env.PCG_MISSIONS_API_ORIGIN ?? ""));
    if (
      upstreamOrigin.protocol !== "https:" &&
      upstreamOrigin.hostname !== "localhost" &&
      upstreamOrigin.hostname !== "127.0.0.1"
    ) {
      return json(500, "INVALID_WORKER_ORIGIN", "The configured API origin must use HTTPS.", requestId);
    }
  } catch {
    return json(503, "WORKER_PROXY_NOT_CONFIGURED", "The PCG Missions API origin is not configured.", requestId);
  }

  const target = new URL(url.pathname + url.search, upstreamOrigin);
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("X-Request-ID", requestId);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: request.body }),
      redirect: "manual",
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    for (const name of [
      "content-type",
      "cache-control",
      "pragma",
      "location",
      "x-request-id",
      "x-content-type-options",
      "referrer-policy",
      "set-cookie",
    ]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("Cache-Control", "no-store, max-age=0");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-Request-ID", requestId);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // Keep request details out of the response, but retain enough context in
    // Pages Function logs to identify DNS, TLS, timeout, or upstream failures.
    console.error("PCG Missions API proxy failed", {
      requestId,
      path: url.pathname,
      method: request.method,
      upstreamHost: upstreamOrigin.host,
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      502,
      "WORKER_UPSTREAM_UNAVAILABLE",
      "The PCG Missions API could not be reached. Please retry.",
      requestId,
    );
  }
};
