const MAX_BODY_BYTES = 8 * 1024;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function requestBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isSameOrigin(req, requestUrl) {
  const origin = headerValue(req.headers.origin);
  if (!origin) return true;
  const forwardedHost = headerValue(req.headers["x-forwarded-host"]);
  const requestHost = forwardedHost || headerValue(req.headers.host) || requestUrl.host;
  try {
    return new URL(origin).host === String(requestHost).split(",")[0].trim();
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const host = headerValue(req.headers.host) || "localhost";
  let requestUrl;
  try {
    requestUrl = new URL(req.url || "/api/auth", `https://${host}`);
  } catch {
    return sendJson(res, 400, {
      error: { code: "INVALID_REQUEST", message: "The request could not be read." },
    });
  }

  if (!isSameOrigin(req, requestUrl)) {
    return sendJson(res, 403, {
      error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." },
    });
  }

  const supabaseUrl = String(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  ).replace(/\/+$/, "");
  const publishableKey = String(
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "",
  );

  if (!supabaseUrl || !publishableKey) {
    return sendJson(res, 503, {
      error: {
        code: "AUTH_PROXY_NOT_CONFIGURED",
        message: "The secure sign-in service is not configured on the server.",
      },
    });
  }

  const grantType = requestUrl.searchParams.get("grant_type");
  const resource = requestUrl.searchParams.get("resource");
  const body = requestBody(req);
  let upstreamPath = "";
  let expectedMethod = "";
  let requiresBearer = false;
  let outgoingBody;

  if (grantType === "password" || grantType === "refresh_token") {
    expectedMethod = "POST";
    upstreamPath = `/auth/v1/token?grant_type=${grantType}`;
    if (!body) {
      return sendJson(res, 400, {
        error: { code: "INVALID_REQUEST", message: "Sign-in details are required." },
      });
    }
    if (grantType === "password") {
      if (
        typeof body.email !== "string" ||
        body.email.length > 254 ||
        typeof body.password !== "string" ||
        body.password.length < 1 ||
        body.password.length > 128
      ) {
        return sendJson(res, 400, {
          error: { code: "INVALID_CREDENTIALS_FORMAT", message: "Enter a valid email address and password." },
        });
      }
      outgoingBody = { email: body.email.trim().toLowerCase(), password: body.password };
    } else {
      if (
        typeof body.refresh_token !== "string" ||
        body.refresh_token.length < 1 ||
        body.refresh_token.length > 4096
      ) {
        return sendJson(res, 400, {
          error: { code: "INVALID_SESSION", message: "The session could not be refreshed." },
        });
      }
      outgoingBody = { refresh_token: body.refresh_token };
    }
  } else {
    const resources = {
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
    const selected = resources[resource];
    if (!selected) {
      return sendJson(res, 404, {
        error: { code: "AUTH_ROUTE_NOT_FOUND", message: "The requested authentication operation does not exist." },
      });
    }
    expectedMethod = selected.method;
    upstreamPath = selected.path;
    requiresBearer = selected.bearer;
    if (
      (resource === "complete-password-change" || resource === "request-password-reset") &&
      !body
    ) {
      return sendJson(res, 400, {
        error: { code: "INVALID_REQUEST", message: "The request body is invalid." },
      });
    }
    if (resource === "request-password-reset" &&
      (typeof body.email !== "string" || body.email.length > 254)
    ) {
      return sendJson(res, 400, {
        error: { code: "INVALID_EMAIL", message: "Enter a valid staff email address." },
      });
    }
    if (resource === "complete-password-change" &&
      (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128)
    ) {
      return sendJson(res, 400, {
        error: { code: "WEAK_PASSWORD", message: "Use a strong new password of at least 12 characters." },
      });
    }
    if (resource === "complete-password-change" || resource === "request-password-reset") {
      outgoingBody = body;
    }
  }

  if (req.method !== expectedMethod) {
    res.setHeader("Allow", expectedMethod);
    return sendJson(res, 405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "The request method is not allowed." },
    });
  }

  const authorization = headerValue(req.headers.authorization);
  if (requiresBearer && (
    typeof authorization !== "string" ||
    !authorization.trim().toLowerCase().startsWith("bearer ") ||
    authorization.trim().slice(7).length === 0
  )) {
    return sendJson(res, 401, {
      error: { code: "AUTH_REQUIRED", message: "A valid sign-in session is required." },
    });
  }

  if (outgoingBody !== undefined && Buffer.byteLength(JSON.stringify(outgoingBody)) > MAX_BODY_BYTES) {
    return sendJson(res, 413, {
      error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." },
    });
  }

  const headers = {
    apikey: publishableKey,
    Accept: "application/json",
  };
  if (requiresBearer) headers.Authorization = authorization;
  if (outgoingBody !== undefined) headers["Content-Type"] = "application/json";

  try {
    const upstream = await fetch(`${supabaseUrl}${upstreamPath.startsWith("/") ? upstreamPath : `/${upstreamPath}`}`, {
      method: expectedMethod,
      headers,
      ...(outgoingBody !== undefined ? { body: JSON.stringify(outgoingBody) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const responseText = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8",
    );
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    if (upstream.status === 204 || upstream.status === 205 || !responseText) {
      return res.end();
    }
    return res.end(responseText);
  } catch {
    return sendJson(res, 502, {
      error: {
        code: "AUTH_UPSTREAM_UNAVAILABLE",
        message: "The authentication service could not be reached. Please retry.",
      },
    });
  }
}
