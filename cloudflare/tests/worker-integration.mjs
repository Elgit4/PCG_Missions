import { spawn, execFileSync } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = 8787;
const baseUrl = `http://127.0.0.1:${port}`;
const stateDir = path.resolve(".wrangler/test-state");
const allowedOrigin = "https://pcg-missions-api-nonprod.pcg-missions-nonprod.workers.dev";
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url");
const env = {
  ...process.env,
  APP_ENV: "non-production",
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: allowedOrigin,
  BETTER_AUTH_TRUSTED_ORIGINS: allowedOrigin,
  WRANGLER_SEND_METRICS: "false",
  CI: "true",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startWorker() {
  const child = spawn("npx", [
    "wrangler", "dev", "--local", "--ip", "127.0.0.1",
    "--port", String(port), "--persist-to", stateDir, "--log-level", "error",
  ], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  child.testLogs = () => logs;
  child.detached = true;
  return child;
}

async function stopWorker(child) {
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(10000),
  ]);
}

async function waitForListener(child) {
  const deadline = Date.now() + 60000;
  let lastError = "not started";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early: ${child.exitCode}\n${child.testLogs()}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      return response.status;
    } catch (error) {
      lastError = String(error);
    }
    await delay(500);
  }
  throw new Error(`Wrangler Worker did not start: ${lastError}\n${child.testLogs()}`);
}

async function findSqliteFiles(directory) {
  const found = [];
  async function visit(current) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && entry.name.endsWith(".sqlite")) found.push(full);
    }
  }
  await visit(directory);
  return found;
}

const pythonSeed = String.raw`
import pathlib, sqlite3, sys
db_path = pathlib.Path(sys.argv[1])
migration_dir = pathlib.Path(sys.argv[2])
db = sqlite3.connect(db_path)
db.execute("PRAGMA foreign_keys=ON")
for migration in sorted(migration_dir.glob("*.sql")):
    db.executescript(migration.read_text(encoding="utf-8"))
db.commit()
version = db.execute("SELECT schema_version FROM app_meta WHERE id=1 AND environment='non-production'").fetchone()
if not version or version[0] != 24:
    raise SystemExit(f"Expected non-production schema 24, got {version}")
violations = db.execute("PRAGMA foreign_key_check").fetchall()
if violations:
    raise SystemExit(f"Foreign key violations: {len(violations)}")
db.close()
print("Seeded local D1 schema version 24")
`;

await rm(stateDir, { recursive: true, force: true });
let worker = startWorker();
try {
  await waitForListener(worker);
  await stopWorker(worker);
  worker = null;

  const sqliteFiles = await findSqliteFiles(stateDir);
  assert(sqliteFiles.length === 1, `expected one local D1 SQLite file, found ${sqliteFiles.length}`);
  execFileSync("python", ["-c", pythonSeed, sqliteFiles[0], path.resolve("migrations")], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  worker = startWorker();
  await waitForListener(worker);

  const health = await fetch(`${baseUrl}/health`);
  const healthBody = await health.json();
  assert(health.status === 200 && healthBody.ok === true, "Worker health endpoint failed");
  assert(healthBody.schema_version === 24, `expected D1 schema 24, got ${healthBody.schema_version}`);

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
  for (const route of protectedPaths) {
    const response = await fetch(`${baseUrl}${route}`);
    assert(response.status === 401,
      `unauthenticated request to ${route} should be 401, got ${response.status}`);
    assert(response.headers.get("x-content-type-options") === "nosniff",
      `security headers missing on ${route}`);
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

  console.log("Worker/D1 integration checks passed: all migrations, Better Auth D1 session/sign-in, protected route gates, security headers and CORS.");
} catch (error) {
  console.error(error);
  if (worker) console.error(worker.testLogs());
  process.exitCode = 1;
} finally {
  if (worker) await stopWorker(worker);
}
