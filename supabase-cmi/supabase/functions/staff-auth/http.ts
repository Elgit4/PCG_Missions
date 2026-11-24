export function createPreflightResponse(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
  requestId: string,
): Response {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, apikey, Content-Type, x-client-info",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Vary": "Origin",
    "X-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return new Response(null, { status: 204, headers });
}
