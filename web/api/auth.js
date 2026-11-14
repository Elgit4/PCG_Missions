export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: { code: "ORIGIN_NOT_ALLOWED" } }));
      }
    } catch {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: { code: "ORIGIN_NOT_ALLOWED" } }));
    }
  }
  const configuredOrigin = String(process.env.PCG_MISSIONS_API_ORIGIN || "").replace(/\/+$/, "");
  let target;
  try {
    target = new URL(configuredOrigin);
    if (target.protocol !== "https:" && target.hostname !== "localhost" && target.hostname !== "127.0.0.1") throw new Error("HTTPS required");
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: { code: "WORKER_PROXY_NOT_CONFIGURED" } }));
  }
  const requestUrl = new URL(req.url || "/api/auth", "https://" + (host || "localhost"));
  const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, target);
  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "origin", "user-agent", "authorization", "x-branch-id", "idempotency-key"]) {
    const value = req.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method || "GET",
      headers,
      ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: req, duplex: "half" }),
      redirect: "manual",
      cache: "no-store",
    });
    res.statusCode = upstream.status;
    for (const name of ["content-type", "cache-control", "pragma", "location", "x-request-id", "x-content-type-options", "referrer-policy"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    const cookies = typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie")] : []);
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    if (upstream.status === 204 || upstream.status === 205 || req.method === "HEAD") return res.end();
    return res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: { code: "WORKER_UPSTREAM_UNAVAILABLE" } }));
  }
}
