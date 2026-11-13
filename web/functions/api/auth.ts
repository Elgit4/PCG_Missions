interface PagesEnv { PCG_MISSIONS_API_ORIGIN?: string }
interface PagesContext { request: Request; env: PagesEnv }

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) {
        return new Response(JSON.stringify({ error: { code: "ORIGIN_NOT_ALLOWED" } }), { status: 403 });
      }
    } catch {
      return new Response(JSON.stringify({ error: { code: "ORIGIN_NOT_ALLOWED" } }), { status: 403 });
    }
  }
  let upstreamOrigin: URL;
  try {
    upstreamOrigin = new URL(String(env.PCG_MISSIONS_API_ORIGIN ?? ""));
    if (upstreamOrigin.protocol !== "https:" && upstreamOrigin.hostname !== "localhost" && upstreamOrigin.hostname !== "127.0.0.1") throw new Error("HTTPS required");
  } catch {
    return new Response(JSON.stringify({ error: { code: "WORKER_PROXY_NOT_CONFIGURED" } }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const target = new URL(url.pathname + url.search, upstreamOrigin);
  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "origin", "user-agent", "authorization"]) {
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
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response(JSON.stringify({ error: { code: "WORKER_UPSTREAM_UNAVAILABLE" } }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
};
