/**
 * Shared CMI browser-origin policy.
 * The production origin is always included; configured preview/dev origins
 * are additive. Unknown origins are never reflected.
 */
const FIRST_PARTY_ORIGINS = ["https://pcg-missions.vercel.app"] as const;

export const CMI_CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
export const CMI_CORS_ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-retry-count",
  "traceparent",
  "tracestate",
  "baggage",
].join(", ");

export function createAllowedOrigins(
  configuredOrigins: string | null | undefined,
): ReadonlySet<string> {
  const additionalOrigins = (configuredOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...FIRST_PARTY_ORIGINS, ...additionalOrigins]);
}

export function isAllowedOrigin(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  return origin === null || allowedOrigins.has(origin);
}

export function createCorsHeaders(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": CMI_CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CMI_CORS_ALLOWED_HEADERS,
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function createPreflightResponse(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): Response {
  const headers = createCorsHeaders(origin, allowedOrigins);
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return new Response(null, { status: 204, headers });
}
