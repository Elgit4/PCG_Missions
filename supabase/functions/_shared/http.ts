export type ApiErrorCode =
  | "BAD_REQUEST"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

const requestId = (): string => crypto.randomUUID();

const allowedOrigins = (): Set<string> =>
  new Set(
    (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

export function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Vary": "Origin",
  });

  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

export function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Request-Id", requestId());

  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(
  request: Request,
  code: ApiErrorCode,
  message: string,
  status: number,
): Response {
  return jsonResponse(
    request,
    {
      error: {
        code,
        message,
      },
    },
    status,
  );
}

export function handlePreflight(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function methodNotAllowed(request: Request): Response {
  return errorResponse(
    request,
    "METHOD_NOT_ALLOWED",
    "The requested HTTP method is not supported.",
    405,
  );
}
