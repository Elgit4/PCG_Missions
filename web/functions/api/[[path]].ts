interface PagesEnv {
  PCG_MISSIONS_API_ORIGIN?: string;
}

interface PagesContext {
  request: Request;
  env: PagesEnv;
}

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]);
const FORWARDED_HEADERS = [
  "accept",
  "content-type",
  "cookie",
  "origin",
  "user-agent",
  "x-branch-id",
  "idempotency-key",
  "authorization",
];

function json(status: number, code: string, message: string, requestId: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message }, request_id: requestId }), {
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
 * This must be a real Pages route, not middleware alone.
 * The [[path]] segment makes every /api/* request match this function,
 * after which the same-origin gateway forwards it to the Cloudflare API Worker.
 */
export const onRequest = async (context: PagesContext): Promise<Response> => {
  const request = context.request;
  const url = new URL(request.url);
  const requestId = crypto.randomUUID();

  if (!ALLOWED_METHODS.has(request.method)) {
    return json(405, "METHOD_NOT_ALLOWED", "This request method is not supported.", requestId);
  }

  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) {
        return json(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.", requestId);
      }
    } catch {
      return json(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.", requestId);
    }
  }

  let upstreamOrigin: URL;
  try {
    upstreamOrigin = new URL(String(context.env.PCG_MISSIONS_API_ORIGIN ?? ""));
    if (
      upstreamOrigin.protocol !== "https:" &&
      upstreamOrigin.hostname !== "localhost" &&
      upstreamOrigin.hostname !== "127.0.0.1"
    ) {
      return json(500, "INVALID_WORKER_ORIGIN", "The configured API origin must use HTTPS.", requestId);
    }
  } catch {
    return json(503, "WORKER_PROXY_NOT_CONFIGURED", "The PCG Missions Cloudflare API origin is not configured.", requestId);
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
    ]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    const cookieHeaders = typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie")] : []);
    for (const cookie of cookieHeaders) responseHeaders.append("Set-Cookie", cookie);

    responseHeaders.set("Cache-Control", "no-store, max-age=0");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-Request-ID", requestId);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("PCG Missions Cloudflare API gateway failed", {
      requestId,
      path: url.pathname,
      method: request.method,
      upstreamHost: upstreamOrigin.host,
      error: error instanceof Error ? error.message : String(error),
    });
    return json(502, "WORKER_UPSTREAM_UNAVAILABLE", "The PCG Missions Cloudflare API could not be reached. Please retry.", requestId);
  }
};
