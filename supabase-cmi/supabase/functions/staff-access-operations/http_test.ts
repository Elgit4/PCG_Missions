import { createPreflightResponse } from "./http.ts";

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

Deno.test("staff-access preflight is a valid empty 204 response", async () => {
  const origin = "https://staff.example.org";
  const requestId = "request-123";
  const response = createPreflightResponse(
    origin,
    new Set([origin]),
    requestId,
  );

  assertEquals(response.status, 204, "status");
  assertEquals(response.body, null, "response body");
  assertEquals(await response.text(), "", "response text");
  assertEquals(
    response.headers.get("Access-Control-Allow-Origin"),
    origin,
    "allowed origin",
  );
  assertEquals(
    response.headers.get("Access-Control-Allow-Methods"),
    "POST, OPTIONS",
    "allowed methods",
  );
  assertEquals(
    response.headers.get("Access-Control-Allow-Headers"),
    "Authorization, apikey, Content-Type, x-client-info",
    "allowed headers",
  );
  assertEquals(response.headers.get("X-Request-Id"), requestId, "request ID");
  assertEquals(response.headers.get("Cache-Control"), "no-store", "cache policy");
});

Deno.test("staff-access preflight never reflects an unapproved origin", () => {
  const response = createPreflightResponse(
    "https://attacker.example",
    new Set(["https://staff.example.org"]),
    "request-456",
  );

  assertEquals(response.status, 204, "status");
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), null, "origin header");
  assertEquals(response.headers.get("Vary"), "Origin", "vary header");
});
