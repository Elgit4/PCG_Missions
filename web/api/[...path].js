const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]);

function sendError(res, status, code, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify({ ok: false, error: { code, message } }));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!ALLOWED_METHODS.has(req.method || "GET")) {
    res.setHeader("Allow", [...ALLOWED_METHODS].join(", "));
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "This request method is not supported.");
  }

  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    } catch {
      return sendError(res, 403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
    }
  }

  const configuredOrigin = String(process.env.PCG_MISSIONS_API_ORIGIN || "").replace(/\/+$/, "");
  if (!configuredOrigin) return sendError(res, 503, "WORKER_PROXY_NOT_CONFIGURED", "The PCG Missions API origin is not configured.");
  let upstreamOrigin;
  try {
    upstreamOrigin = new URL(configuredOrigin);
    if (upstreamOrigin.protocol !== "https:" && upstreamOrigin.hostname !== "localhost" && upstreamOrigin.hostname !== "127.0.0.1") {
      return sendError(res, 500, "INVALID_WORKER_ORIGIN", "The configured API origin must use HTTPS.");
    }
  } catch {
    return sendError(res, 500, "INVALID_WORKER_ORIGIN", "The configured API origin is invalid.");
  }

  const requestUrl = new URL(req.url || "/api", "https://" + (host || "localhost"));
  const target = new URL(requestUrl.pathname + requestUrl.search, upstreamOrigin);
  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "origin", "user-agent", "authorization", "x-branch-id", "idempotency-key"]) {
    const value = req.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: req }),
      // Node fetch requires duplex when streaming a request body.
      ...(req.method === "GET" || req.method === "HEAD" ? {} : { duplex: "half" }),
      redirect: "manual",
      cache: "no-store",
    });

    res.statusCode = upstream.status;
    for (const name of ["content-type", "cache-control", "pragma", "location", "x-request-id", "x-content-type-options", "referrer-policy"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    const cookieHeaders = typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie")] : []);
    if (cookieHeaders.length) res.setHeader("Set-Cookie", cookieHeaders);
    if (upstream.status === 204 || upstream.status === 205 || req.method === "HEAD") return res.end();
    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Length", String(body.byteLength));
    return res.end(body);
  } catch {
    return sendError(res, 502, "WORKER_UPSTREAM_UNAVAILABLE", "The PCG Missions API could not be reached. Please retry.");
  }
}
