interface PagesEnv {
  PCG_MISSIONS_API_ORIGIN?: string;
}
interface PagesContext {
  request: Request;
  env: PagesEnv;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]);

function json(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  const url = new URL(request.url);
  if (!ALLOWED_METHODS.has(request.method)) return json(405, "METHOD_NOT_ALLOWED", "This request method is not supported.");
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) return json(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    } catch {
      return json(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    }
  }
  let upstreamOrigin: URL;
  try {
    upstreamOrigin = new URL(String(env.PCG_MISSIONS_API_ORIGIN ?? ""));
    if (upstreamOrigin.protocol !== "https:" && upstreamOrigin.hostname !== "localhost" && upstreamOrigin.hostname !== "127.0.0.1") {
      return json(500, "INVALID_WORKER_ORIGIN", "The configured API origin must use HTTPS.");
    }
  } catch {
    return json(503, "WORKER_PROXY_NOT_CONFIGURED", "The PCG Missions API origin is not configured.");
  }

  const target = new URL(url.pathname + url.search, upstreamOrigin);
  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "origin", "user-agent", "authorization", "x-branch-id", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: request.body }),
      redirect: "manual",
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "cache-control", "pragma", "location", "x-request-id", "x-content-type-options", "referrer-policy", "set-cookie"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("Cache-Control", "no-store, max-age=0");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return json(502, "WORKER_UPSTREAM_UNAVAILABLE", "The PCG Missions API could not be reached. Please retry.");
  }
};
