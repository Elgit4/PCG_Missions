import {
  CMI_CORS_ALLOWED_HEADERS,
  createAllowedOrigins,
  createCorsHeaders,
  createPreflightResponse,
  isAllowedOrigin,
} from "./cors.ts";

Deno.test("production origin remains allowed when optional config is unset or blank", () => {
  for (const configured of [undefined, "", " , "]) {
    const allowed = createAllowedOrigins(configured);
    if (!isAllowedOrigin("https://pcg-missions.vercel.app", allowed)) {
      throw new Error("production origin must be included by default");
    }
  }
});

Deno.test("configured exact origins are additive to the production origin", () => {
  const allowed = createAllowedOrigins(
    "https://preview.example, http://localhost:5173",
  );
  for (
    const origin of [
      "https://pcg-missions.vercel.app",
      "https://preview.example",
      "http://localhost:5173",
    ]
  ) {
    if (!isAllowedOrigin(origin, allowed)) {
      throw new Error(`expected origin to be allowed: ${origin}`);
    }
  }
});

Deno.test("unknown origins remain denied and are never reflected", () => {
  const allowed = createAllowedOrigins(undefined);
  const origin = "https://attacker.example";
  if (isAllowedOrigin(origin, allowed)) {
    throw new Error("unknown origin must remain denied");
  }
  const response = createPreflightResponse(origin, allowed);
  if (response.headers.has("Access-Control-Allow-Origin")) {
    throw new Error("unapproved origin was reflected");
  }
});

Deno.test("allowed-origin error responses retain CORS visibility", () => {
  const origin = "https://pcg-missions.vercel.app";
  const headers = createCorsHeaders(origin, createAllowedOrigins(undefined));
  if (headers.get("Access-Control-Allow-Origin") !== origin) {
    throw new Error(
      "allowed origin must be present on normal and error responses",
    );
  }
  if (!headers.get("Access-Control-Allow-Headers")?.includes("authorization")) {
    throw new Error("authorization must be allowed on browser responses");
  }
  const allowedHeaders = headers.get("Access-Control-Allow-Headers") ?? "";
  for (const required of [
    "authorization",
    "apikey",
    "content-type",
    "x-client-info",
  ]) {
    if (!allowedHeaders.includes(required)) {
      throw new Error(`${required} must be allowed on browser responses`);
    }
  }
});

Deno.test("production OPTIONS preflight returns complete Supabase CORS headers", async () => {
  const origin = "https://pcg-missions.vercel.app";
  const response = createPreflightResponse(
    origin,
    createAllowedOrigins(undefined),
  );

  if (response.status !== 204 || response.body !== null) {
    throw new Error("preflight must return an empty 204 response");
  }
  if (await response.text() !== "") {
    throw new Error("preflight body must be empty");
  }
  if (response.headers.get("Access-Control-Allow-Origin") !== origin) {
    throw new Error("production origin was not reflected");
  }
  if (
    response.headers.get("Access-Control-Allow-Headers") !==
      CMI_CORS_ALLOWED_HEADERS
  ) {
    throw new Error("Supabase SDK request headers are incomplete");
  }
  if (
    response.headers.get("Access-Control-Allow-Methods") !==
      "GET, POST, PATCH, OPTIONS"
  ) {
    throw new Error("allowed methods are incomplete");
  }
});
