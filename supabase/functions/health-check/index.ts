import {
  corsHeaders,
  errorResponse,
  handlePreflight,
  jsonResponse,
  methodNotAllowed,
} from "../_shared/http.ts";

Deno.serve((request: Request): Response => {
  if (request.method === "OPTIONS") {
    return handlePreflight(request);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(request);
  }

  if (request.method === "HEAD") {
    const headers = corsHeaders(request);
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: 204, headers });
  }

  try {
    return jsonResponse(request, {
      data: {
        service: "cmi-follow-up-api",
        status: "ok",
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    return errorResponse(
      request,
      "INTERNAL_ERROR",
      "The service could not complete the request.",
      500,
    );
  }
});
