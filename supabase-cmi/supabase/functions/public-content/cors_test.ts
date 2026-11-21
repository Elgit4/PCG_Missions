import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createPublicContentAllowedOrigins,
  createPublicContentCorsHeaders,
  createPublicContentPreflightResponse,
  PUBLIC_CONTENT_CORS_ALLOWED_HEADERS,
} from "./cors.ts";

Deno.test("production public site origin is allowed by default", () => {
  const allowed = createPublicContentAllowedOrigins(undefined);
  assert(allowed.has("https://pcg-missions.vercel.app"));
  assert(allowed.has("https://pcg-missions.pages.dev"));
  assert(
    allowed.has(
      "https://pcg-missions-git-feat-cmi-pcg-missions-final-review-v6-eltech.vercel.app",
    ),
  );
  assert(!allowed.has("https://attacker.example"));
});

Deno.test("configured preview origins are additive to production", () => {
  const allowed = createPublicContentAllowedOrigins(
    "https://preview.example, http://localhost:5173",
  );
  assert(allowed.has("https://pcg-missions.vercel.app"));
  assert(allowed.has("https://preview.example"));
  assert(allowed.has("http://localhost:5173"));
});

Deno.test("browser SDK request headers include apikey and client info", () => {
  const origin = "https://pcg-missions.pages.dev";
  const headers = createPublicContentCorsHeaders(
    origin,
    createPublicContentAllowedOrigins(undefined),
  );
  assertEquals(headers.get("Access-Control-Allow-Origin"), origin);
  assertEquals(
    headers.get("Access-Control-Allow-Headers"),
    PUBLIC_CONTENT_CORS_ALLOWED_HEADERS,
  );
  assert(headers.get("Access-Control-Allow-Headers")?.includes("apikey"));
  assert(
    headers.get("Access-Control-Allow-Headers")?.includes("x-client-info"),
  );
  assertEquals(headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
});

Deno.test("unknown origins are not reflected in CORS headers", () => {
  const headers = createPublicContentCorsHeaders(
    "https://attacker.example",
    createPublicContentAllowedOrigins(undefined),
  );
  assertEquals(headers.has("Access-Control-Allow-Origin"), false);
});

Deno.test("public content preflight returns an empty 204 response", async () => {
  const origin = "https://pcg-missions.pages.dev";
  const response = createPublicContentPreflightResponse(
    origin,
    createPublicContentAllowedOrigins(undefined),
  );
  assertEquals(response.status, 204);
  assertEquals(await response.text(), "");
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), origin);
});
