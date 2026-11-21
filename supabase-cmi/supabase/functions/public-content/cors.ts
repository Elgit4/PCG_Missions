const FIRST_PARTY_ORIGINS = [
  "https://pcg-missions.vercel.app",
  "https://pcg-missions.pages.dev",
  "https://pcg-missions-git-feat-cmi-pcg-missions-final-review-v6-eltech.vercel.app",
] as const;

export const PUBLIC_CONTENT_CORS_ALLOWED_METHODS = "GET, OPTIONS";
export const PUBLIC_CONTENT_CORS_ALLOWED_HEADERS =
  "authorization, apikey, x-client-info, content-type";

export function createPublicContentAllowedOrigins(
  configuredOrigins: string | null | undefined,
): ReadonlySet<string> {
  const additionalOrigins = (configuredOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...FIRST_PARTY_ORIGINS, ...additionalOrigins]);
}

export function createPublicContentCorsHeaders(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": PUBLIC_CONTENT_CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": PUBLIC_CONTENT_CORS_ALLOWED_HEADERS,
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function createPublicContentPreflightResponse(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): Response {
  const headers = createPublicContentCorsHeaders(origin, allowedOrigins);
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return new Response(null, { status: 204, headers });
}
