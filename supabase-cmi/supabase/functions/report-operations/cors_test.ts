import {
  CMI_CORS_ALLOWED_HEADERS,
  CMI_CORS_ALLOWED_METHODS,
  createAllowedOrigins,
  createPreflightResponse,
  isAllowedOrigin,
} from "../_shared/cors.ts";

Deno.test("production origin is allowed without optional environment config", () => {
  const allowed = createAllowedOrigins(undefined);
  if (!isAllowedOrigin("https://pcg-missions.vercel.app", allowed)) {
    throw new Error("production origin must be included by default");
  }
});

Deno.test("configured origins are additive", () => {
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

Deno.test("production OPTIONS response includes required CORS headers", async () => {
  const origin = "https://pcg-missions.vercel.app";
  const response = createPreflightResponse(
    origin,
    createAllowedOrigins(undefined),
  );
  if (response.status !== 204 || response.body !== null) {
    throw new Error("preflight must be an empty 204 response");
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
    throw new Error("Supabase request headers are incomplete");
  }
  if (
    response.headers.get("Access-Control-Allow-Methods") !==
      CMI_CORS_ALLOWED_METHODS
  ) {
    throw new Error("allowed methods are incomplete");
  }
});
