import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 8787;
const baseUrl = `http://127.0.0.1:${port}`;
const allowedOrigin = "https://pcg-missions-api-nonprod.pcg-missions-nonprod.workers.dev";
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url");
const env = {
  ...process.env,
  BETTER_AUTH_SECRET: secret,
  APP_ENV: "non-production",
  WRANGLER_SEND_METRICS: "false",
  CI: "true",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForWorker(child) {
  const deadline = Date.now() + 60000;
  let lastError = "not started";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early: ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();
      if (response.status === 200 && body.ok === true && body.environment === "non-production") return body;
      lastError = `HTTP ${response.status}: ${JSON.stringify(body)}`;
    } catch (error) {
      lastError = String(error);
    }
    await delay(500);
  }
  throw new Error(`Worker did not become healthy: ${lastError}`);
}

const migrate = spawn("npx", ["wrangler", "d1", "migrations", "apply", "pcg-missions-dev", "--local"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});
const migrateCode = await new Promise((resolve) => migrate.on("exit", resolve));
assert(migrateCode === 0, "local D1 migrations did not apply");

const worker = spawn("npx", ["wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--log-level", "error"], {
  cwd: process.cwd(),
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
worker.stdout.on("data", (chunk) => { logs += chunk.toString(); });
worker.stderr.on("data", (chunk) => { logs += chunk.toString(); });

try {
  const health = await waitForWorker(worker);
  assert(health.schema_version === 24, `expected D1 schema 24, got ${health.schema_version}`);

  const authSession = await fetch(`${baseUrl}/api/auth/get-session`);
  assert(authSession.status === 200, `Better Auth get-session failed: ${authSession.status}`);
  assert(authSession.headers.get("cache-control")?.includes("no-store"), "auth response must not be cacheable");

  const badSignIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
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
  for (const path of protectedPaths) {
    const response = await fetch(`${baseUrl}${path}`);
    assert(response.status === 401,
      `unauthenticated request to ${path} should be 401, got ${response.status}`);
    assert(response.headers.get("x-content-type-options") === "nosniff",
      `security headers missing on ${path}`);
  }

  const allowedPreflight = await fetch(`${baseUrl}/api/v1/me`, {
    method: "OPTIONS",
    headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "GET" },
  });
  assert(allowedPreflight.status === 204, "allowed CORS preflight should return 204");
  assert(allowedPreflight.headers.get("access-control-allow-origin") === allowedOrigin,
    "allowed CORS preflight must echo the configured origin");

  const deniedOrigin = await fetch(`${baseUrl}/api/v1/me`, {
    headers: { Origin: "https://attacker.example" },
  });
  assert(deniedOrigin.status === 403, "untrusted origin must be rejected");

  console.log("Worker/D1 integration checks passed: schema health, Better Auth D1 session/sign-in, protected route gates, security headers and CORS.");
} catch (error) {
  console.error(error);
  console.error(logs);
  process.exitCode = 1;
} finally {
  worker.kill("SIGTERM");
}
