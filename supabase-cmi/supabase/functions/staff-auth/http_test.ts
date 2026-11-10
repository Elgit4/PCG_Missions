import { createPreflightResponse } from "./http.ts";

Deno.test("OPTIONS returns an empty 204 response", async () => {
  const response = createPreflightResponse(
    "https://pcg.example",
    new Set(["https://pcg.example"]),
    "request-123",
  );
  if (response.status !== 204 || await response.text() !== "") {
    throw new Error("preflight response must have an empty 204 body");
  }
  if (
    response.headers.get("Access-Control-Allow-Origin") !==
      "https://pcg.example"
  ) {
    throw new Error("approved origin was not reflected");
  }
  if (response.headers.get("X-Request-Id") !== "request-123") {
    throw new Error("request ID missing");
  }
});

Deno.test("unapproved origins are never reflected", () => {
  const response = createPreflightResponse(
    "https://attacker.example",
    new Set(["https://pcg.example"]),
    "request-456",
  );
  if (response.headers.has("Access-Control-Allow-Origin")) {
    throw new Error("unapproved origin was reflected");
  }
});
