import { spawn, execFileSync } from "node:child_process";
import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";

const port = 8787;
const baseUrl = "http://127.0.0.1:" + port;
const stateDir = path.resolve(".wrangler/test-state");
const allowedOrigin = "https://pcg-missions-api-nonprod.pcg-missions-nonprod.workers.dev";
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url");
const testEmail = "cloudflare-worker-test@example.test";
const testUserId = "cloudflare-worker-test-user";
const testPassword = "Worker-Test-" + crypto.randomUUID() + "-Password!";
const passwordHash = await hashPassword(testPassword);
const env = {
  ...process.env,
  APP_ENV: "non-production",
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: baseUrl,
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
  ], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  child.testLogs = () => logs;
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
    if (child.exitCode !== null) throw new Error("wrangler dev exited early: " + child.exitCode + "\n" + child.testLogs());
    try {
      const response = await fetch(baseUrl + "/health");
      return response.status;
    } catch (error) {
      lastError = String(error);
    }
    await delay(500);
  }
  throw new Error("Wrangler Worker did not start: " + lastError + "\n" + child.testLogs());
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

const pythonSeed = [
  "import pathlib, sqlite3, sys",
  "db_path = pathlib.Path(sys.argv[1])",
  "migration_dir = pathlib.Path(sys.argv[2])",
  "user_id, email, password_hash, created_at = sys.argv[3], sys.argv[4], sys.argv[5], int(sys.argv[6])",
  "db = sqlite3.connect(db_path)",
  "db.execute('PRAGMA foreign_keys=ON')",
  "for migration in sorted(migration_dir.glob('*.sql')):",
  "    db.executescript(migration.read_text(encoding='utf-8'))",
  "db.execute('INSERT INTO \"user\" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',",
  "           (user_id, 'Cloudflare Test User', email, 1, created_at, created_at))",
  "db.execute('INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',",
  "           ('cloudflare-test-account', user_id, 'credential', user_id, password_hash, created_at, created_at))",
  "db.commit()",
  "version = db.execute(\"SELECT schema_version FROM app_meta WHERE id=1 AND environment='non-production'\").fetchone()",
  "if not version or version[0] != 24:",
  "    raise SystemExit('Expected non-production schema 24, got ' + str(version))",
  "violations = db.execute('PRAGMA foreign_key_check').fetchall()",
  "if violations:",
  "    raise SystemExit('Foreign key violations: ' + str(len(violations)))",
  "db.close()",
  "print('Seeded local D1 schema version 24 and one Better Auth test identity')",
].join("\n");

await rm(stateDir, { recursive: true, force: true });
await writeFile(".dev.vars", "BETTER_AUTH_SECRET=" + secret + "\nAUTH_DB_DEBUG=true\nBETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8787," + allowedOrigin + "\n", { mode: 0o600 });
let worker = startWorker();
try {
  await waitForListener(worker);
  await stopWorker(worker);
  worker = null;

  const sqliteFiles = await findSqliteFiles(stateDir);
  assert(sqliteFiles.length === 1, "expected one local D1 SQLite file, found " + sqliteFiles.length);
  execFileSync("python", ["-c", pythonSeed, sqliteFiles[0], path.resolve("migrations"), testUserId, testEmail, passwordHash, String(Date.now())], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  worker = startWorker();
  await waitForListener(worker);

  const health = await fetch(baseUrl + "/health");
  const healthBody = await health.json();
  assert(health.status === 200 && healthBody.ok === true, "Worker health endpoint failed");
  assert(healthBody.schema_version === 24, "expected D1 schema 24, got " + healthBody.schema_version);

  const authSession = await fetch(baseUrl + "/api/auth/get-session");
  const authSessionBody = await authSession.text();
  assert(authSession.status === 200, "Better Auth get-session failed: " + authSession.status + ": " + authSessionBody);
  assert(authSession.headers.get("cache-control")?.includes("no-store"), "auth response must not be cacheable");

  const signIn = await fetch(baseUrl + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const signInBody = await signIn.text();
  assert(signIn.status === 200, "Better Auth sign-in failed: " + signIn.status + ": " + signInBody);
  const setCookies = typeof signIn.headers.getSetCookie === "function"
    ? signIn.headers.getSetCookie()
    : [signIn.headers.get("set-cookie") ?? ""];
  const cookie = setCookies.map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  assert(cookie.includes("session_token"), "Better Auth sign-in did not issue a session cookie");

  const signedInSession = await fetch(baseUrl + "/api/auth/get-session", { headers: { Cookie: cookie } });
  const signedInBody = await signedInSession.text();
  assert(signedInSession.status === 200 && signedInBody.includes(testEmail),
    "Better Auth session lookup failed: " + signedInSession.status + ": " + signedInBody);

  const signOut = await fetch(baseUrl + "/api/auth/sign-out", {
    method: "POST",
    headers: { Cookie: cookie, Origin: baseUrl },
  });
  assert(signOut.status === 200, "Better Auth sign-out failed: " + signOut.status);
  const signedOutSession = await fetch(baseUrl + "/api/auth/get-session", { headers: { Cookie: cookie } });
  const signedOutBody = await signedOutSession.text();
  assert(signedOutSession.status === 200 && (signedOutBody.trim() === "null" || signedOutBody.trim() === ""),
    "Better Auth session should be revoked after sign-out: " + signedOutBody);

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
    const response = await fetch(baseUrl + route);
    assert(response.status === 401, "unauthenticated request to " + route + " should be 401, got " + response.status);
    assert(response.headers.get("x-content-type-options") === "nosniff", "security headers missing on " + route);
  }

  const allowedPreflight = await fetch(baseUrl + "/api/v1/me", {
    method: "OPTIONS",
    headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "GET" },
  });
  assert(allowedPreflight.status === 204, "allowed CORS preflight should return 204");
  assert(allowedPreflight.headers.get("access-control-allow-origin") === allowedOrigin,
    "allowed CORS preflight must echo the configured origin");

  const deniedOrigin = await fetch(baseUrl + "/api/v1/me", {
    headers: { Origin: "https://attacker.example" },
  });
  assert(deniedOrigin.status === 403, "untrusted origin must be rejected");

  console.log("Worker/D1 integration checks passed: all migrations, Better Auth sign-in/session/sign-out, protected route gates, security headers and CORS.");
} catch (error) {
  console.error(error);
  if (worker) console.error(worker.testLogs());
  process.exitCode = 1;
} finally {
  if (worker) await stopWorker(worker);
  await rm(".dev.vars", { force: true });
}
