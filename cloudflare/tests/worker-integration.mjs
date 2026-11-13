import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";

const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url");
const allowedOrigin = "https://pcg-missions-api-nonprod.pcg-missions-nonprod.workers.dev";
const migrationDir = path.resolve("migrations");
const scriptPath = path.resolve("build/index.js");
const mf = new Miniflare({
  modules: true,
  scriptPath,
  compatibilityDate: "2026-11-13",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "pcg-missions-dev" },
  bindings: {
    APP_ENV: "non-production",
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: allowedOrigin,
    BETTER_AUTH_TRUSTED_ORIGINS: allowedOrigin,
  },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const db = await mf.getD1Database("DB");
  const migrationFiles = (await readdir(migrationDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const file of migrationFiles) {
    const sql = await readFile(path.join(migrationDir, file), "utf8");
    await db.exec(sql);
  }

  const health = await mf.dispatchFetch("http://localhost/health");
  const healthBody = await health.json();
  assert(health.status === 200 && healthBody.ok === true, "Worker health endpoint failed");
  assert(healthBody.schema_version === 24, `expected D1 schema 24, got ${healthBody.schema_version}`);

  const authSession = await mf.dispatchFetch("http://localhost/api/auth/get-session");
  assert(authSession.status === 200, `Better Auth get-session failed: ${authSession.status}`);
  assert(authSession.headers.get("cache-control")?.includes("no-store"), "auth response must not be cacheable");

  const badSignIn = await mf.dispatchFetch("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "missing-user@example.test", password: "not-a-real-password" }),
  });
  assert(badSignIn.status >= 400 && badSignIn.status < 500,
    `Better Auth invalid sign-in should be rejected with 4xx, got ${badSignIn.status}`);

  const protectedPaths = [
    "/api/v1/me",
    "/api/v1/staff",
    "/api/v1/contacts",
    "/api/v1/followup/tasks",
    "/api/v1/pastoral/prayer/queue",
    "/api/v1/events",
    "/api/v1/calendar",
    "/api/v1/announcements",
    "/api/v1/reports",
  ];
  for (const route of protectedPaths) {
    const response = await mf.dispatchFetch(`http://localhost${route}`);
    assert(response.status === 401,
      `unauthenticated request to ${route} should be 401, got ${response.status}`);
    assert(response.headers.get("x-content-type-options") === "nosniff",
      `security headers missing on ${route}`);
  }

  const allowedPreflight = await mf.dispatchFetch("http://localhost/api/v1/me", {
    method: "OPTIONS",
    headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "GET" },
  });
  assert(allowedPreflight.status === 204, "allowed CORS preflight should return 204");
  assert(allowedPreflight.headers.get("access-control-allow-origin") === allowedOrigin,
    "allowed CORS preflight must echo the configured origin");

  const deniedOrigin = await mf.dispatchFetch("http://localhost/api/v1/me", {
    headers: { Origin: "https://attacker.example" },
  });
  assert(deniedOrigin.status === 403, "untrusted origin must be rejected");

  console.log(`Worker/D1 integration checks passed: ${migrationFiles.length} migrations, Better Auth D1 session/sign-in, protected route gates, security headers and CORS.`);
} finally {
  await mf.dispose();
}
