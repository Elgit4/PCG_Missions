import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
} from "./http.ts";

Deno.test("CORS does not allow arbitrary origins", () => {
  const request = new Request("https://api.example.test/health", {
    headers: { Origin: "https://attacker.example" },
  });
  const headers = corsHeaders(request);
  if (headers.has("Access-Control-Allow-Origin")) {
    throw new Error("An unconfigured origin must not be allowed.");
  }
});

Deno.test("CORS allows only an explicitly configured origin", () => {
  const request = new Request("https://api.example.test/health", {
    headers: { Origin: "https://staff.example.test" },
  });
  const original = Deno.env.get("APP_ALLOWED_ORIGINS");
  Deno.env.set("APP_ALLOWED_ORIGINS", "https://staff.example.test");
  try {
    const headers = corsHeaders(request);
    if (
      headers.get("Access-Control-Allow-Origin") !==
        "https://staff.example.test"
    ) {
      throw new Error("The configured origin should be allowed.");
    }
  } finally {
    if (original === undefined) Deno.env.delete("APP_ALLOWED_ORIGINS");
    else Deno.env.set("APP_ALLOWED_ORIGINS", original);
  }
});

Deno.test("JSON responses are not cacheable and carry a request id", async () => {
  const request = new Request("https://api.example.test/health");
  const response = jsonResponse(request, { data: { status: "ok" } });
  if (response.headers.get("Cache-Control") !== "no-store") {
    throw new Error("API responses must not be cached by default.");
  }
  if (!response.headers.get("X-Request-Id")) {
    throw new Error("A request correlation id is required.");
  }
  const body = await response.json();
  if (body.data.status !== "ok") throw new Error("Unexpected JSON response.");
});

Deno.test("Method errors use a stable error envelope", async () => {
  const request = new Request("https://api.example.test/health", {
    method: "POST",
  });
  const response = methodNotAllowed(request);
  if (response.status !== 405) throw new Error("Expected HTTP 405.");
  const body = await response.json();
  if (body.error.code !== "METHOD_NOT_ALLOWED") {
    throw new Error("Expected a stable METHOD_NOT_ALLOWED error.");
  }
});

Deno.test("Error responses do not expose stack traces", async () => {
  const request = new Request("https://api.example.test/health");
  const response = errorResponse(
    request,
    "INTERNAL_ERROR",
    "Request failed.",
    500,
  );
  const body = await response.json();
  if ("stack" in body || "stackTrace" in body) {
    throw new Error("Error response leaked implementation details.");
  }
});
