import { spawn, execFileSync } from "node:child_process";
import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hash as bcryptHash } from "bcryptjs";

const port = 8787;
const baseUrl = "http://127.0.0.1:" + port;
const stateDir = path.resolve(".wrangler/test-state");
const allowedOrigin = "https://pcg-missions-api-nonprod.pcg-missions-nonprod.workers.dev";
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url");
const bootstrapToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const testEmail = "cloudflare-worker-test@example.test";
const testUserId = "cloudflare-worker-test-user";
const testPassword = "Worker-Test-" + crypto.randomUUID() + "-Password!";
// Supabase GoTrue uses bcrypt ($2a$, cost 10); exercise that exact legacy format.
const passwordHash = await bcryptHash(testPassword, 10);
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
    "--port", String(port), "--persist-to", stateDir, "--log-level", "info",
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
  "from datetime import datetime, timezone",
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
  "now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')",
  "db.execute('INSERT INTO church (id,name,timezone,created_at,updated_at) VALUES (?,?,?,?,?)', ('test-church', 'Cloudflare Test Church', 'Africa/Accra', now, now))",
  "db.execute('INSERT INTO branch (id,church_id,name,code,timezone,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', ('00000000-0000-4000-8000-000000000001', 'test-church', 'Cloudflare Test Branch', 'TEST', 'Africa/Accra', 1, now, now))",
  "db.execute('INSERT INTO staff_profile (id,auth_user_id,full_name,email,account_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', ('test-staff-profile', user_id, 'Cloudflare Test User', email, 'active', now, now))",
  "role_id = db.execute(\"SELECT id FROM role WHERE code='admin_pastor' AND is_active=1\").fetchone()[0]",
  "db.execute('INSERT INTO staff_role_assignment (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at,reason) VALUES (?,?,?,?,?,?,?,?)', ('test-admin-assignment', 'test-staff-profile', role_id, '00000000-0000-4000-8000-000000000001', 'test-staff-profile', now, now, 'Automated non-production integration fixture'))",
  "db.execute('INSERT INTO \"user\" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)', ('cloudflare-worker-team-leader', 'Cloudflare Team Leader', 'cloudflare-team-leader@example.test', 1, created_at, created_at))",
  "db.execute('INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)', ('cloudflare-team-leader-account', 'cloudflare-worker-team-leader', 'credential', 'cloudflare-worker-team-leader', password_hash, created_at, created_at))",
  "db.execute('INSERT INTO staff_profile (id,auth_user_id,full_name,email,account_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', ('00000000-0000-4000-8000-000000000099', 'cloudflare-worker-team-leader', 'Cloudflare Team Leader', 'cloudflare-team-leader@example.test', 'active', now, now))",
  "team_leader_role_id = db.execute(\"SELECT id FROM role WHERE code='team_leader' AND is_active=1\").fetchone()[0]",
  "db.execute('INSERT INTO staff_role_assignment (id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at,reason) VALUES (?,?,?,?,?,?,?,?)', ('test-team-leader-assignment', '00000000-0000-4000-8000-000000000099', team_leader_role_id, '00000000-0000-4000-8000-000000000001', 'test-staff-profile', now, now, 'Automated non-production team scope fixture'))",
  "db.execute('INSERT INTO branch (id,church_id,name,code,timezone,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', ('00000000-0000-4000-8000-000000000002', 'test-church', 'Other Branch', 'OTHER', 'Africa/Accra', 1, now, now))",
  "db.commit()",
  "version = db.execute(\"SELECT schema_version FROM app_meta WHERE id=1 AND environment='non-production'\").fetchone()",
  "if not version or version[0] != 31:",
  "    raise SystemExit('Expected non-production schema 31, got ' + str(version))",
  "violations = db.execute('PRAGMA foreign_key_check').fetchall()",
  "if violations:",
  "    raise SystemExit('Foreign key violations: ' + str(len(violations)))",
  "db.close()",
  "print('Seeded local D1 schema version 31 and one Better Auth test identity')",
].join("\n");

await rm(stateDir, { recursive: true, force: true });
await writeFile(".dev.vars", "BETTER_AUTH_SECRET=" + secret + "\nBETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8787," + allowedOrigin + "\nFIRST_ADMIN_BOOTSTRAP_TOKEN=" + bootstrapToken + "\n", { mode: 0o600 });
let worker = startWorker();
try {
  await waitForListener(worker);
  await stopWorker(worker);
  worker = null;

  // Wrangler v4 stores several SQLite-backed local services (cache, KV,
  // observability, R2 metadata). Seed only the actual D1 database file.
  const sqliteFiles = (await findSqliteFiles(stateDir)).filter((file) =>
    file.includes(path.join("d1", "miniflare-D1DatabaseObject")) &&
    path.basename(file) !== "metadata.sqlite"
  );
  assert(sqliteFiles.length === 1, "expected one local D1 database file, found " + sqliteFiles.length + ": " + JSON.stringify(sqliteFiles));
  execFileSync("python", ["-c", pythonSeed, sqliteFiles[0], path.resolve("migrations"), testUserId, testEmail, passwordHash, String(Date.now())], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  worker = startWorker();
  await waitForListener(worker);

  const bootstrapPage = await fetch(baseUrl + "/bootstrap");
  const bootstrapHtml = await bootstrapPage.text();
  assert(bootstrapPage.status === 200, "configured non-production bootstrap page should return 200");
  assert((bootstrapPage.headers.get("content-type") || "").includes("text/html"),
    "bootstrap page must explicitly return HTML");
  assert(bootstrapHtml.includes("Secure account setup"), "bootstrap page content missing");
  assert(bootstrapHtml.includes("unexpected response"), "bootstrap page must safely handle non-JSON API responses");

  const bootstrapApi = await fetch(baseUrl + "/api/v1/bootstrap/first-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Elvis", email: "elviskwakuboateng63@gmail.com", password: "NotARealPassword123!" }),
  });
  const bootstrapApiContentType = bootstrapApi.headers.get("content-type") || "";
  const bootstrapApiBody = await bootstrapApi.json();
  assert(bootstrapApi.status === 404, "bootstrap API must reject missing token with 404");
  assert(bootstrapApiContentType.includes("application/json"), "bootstrap API errors must return JSON");
  assert(bootstrapApiBody.error?.code === "BOOTSTRAP_UNAVAILABLE", "bootstrap API missing-token response was unexpected");

  const health = await fetch(baseUrl + "/health");
  const healthBody = await health.json();
  assert(health.status === 200 && healthBody.ok === true, "Worker health endpoint failed");
  assert(healthBody.schema_version === 31, "expected D1 schema 31, got " + healthBody.schema_version);

  const scheduledTick = await fetch(baseUrl + "/cdn-cgi/local/scheduled");
  assert(scheduledTick.status === 200, "local scheduled announcement tick failed: " + scheduledTick.status);

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
  let currentSessionCookie = cookie;
  assert(cookie.includes("session_token"), "Better Auth sign-in did not issue a session cookie");

  const signedInSession = await fetch(baseUrl + "/api/auth/get-session", { headers: { Cookie: cookie } });
  const signedInBody = await signedInSession.text();
  assert(signedInSession.status === 200 && signedInBody.includes(testEmail),
    "Better Auth session lookup failed: " + signedInSession.status + ": " + signedInBody);
  const me = await fetch(baseUrl + "/api/v1/me", { headers: { Cookie: cookie, "X-Branch-Id": "00000000-0000-4000-8000-000000000001" } });
  const meBody = await me.text();
  assert(me.status === 200 && meBody.includes("00000000-0000-4000-8000-000000000001"),
    "authenticated staff context failed: " + me.status + ": " + meBody);

  const contacts = await fetch(baseUrl + "/api/v1/contacts", { headers: { Cookie: cookie, "X-Branch-Id": "00000000-0000-4000-8000-000000000001" } });
  const contactsBody = await contacts.text();
  assert(contacts.status === 200, "authorized branch-scoped contacts read failed: " + contacts.status + ": " + contactsBody);

  // Establish a second device session so the password-rotation test can
  // prove that only the initiating session survives.
  const secondSignIn = await fetch(baseUrl + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const secondSignInBody = await secondSignIn.text();
  assert(secondSignIn.status === 200, "second Better Auth sign-in failed: " + secondSignIn.status + ": " + secondSignInBody);
  const secondSetCookies = typeof secondSignIn.headers.getSetCookie === "function"
    ? secondSignIn.headers.getSetCookie()
    : [secondSignIn.headers.get("set-cookie") ?? ""];
  const secondCookie = secondSetCookies.map((value) => value.split(";")[0]).filter(Boolean).join("; ");
  assert(secondCookie.includes("session_token"), "second Better Auth sign-in did not issue a session cookie");

  const weakPasswordChange = await fetch(baseUrl + "/api/auth/change-password", {
    method: "POST",
    headers: { Cookie: cookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: testPassword, newPassword: "lowercase-only-123" , revokeOtherSessions: true }),
  });
  const weakPasswordBody = await weakPasswordChange.json();
  assert(weakPasswordChange.status === 400 && weakPasswordBody.error?.code === "PASSWORD_POLICY_INVALID",
    "Worker must reject a password that fails the composition policy");
  const originalSessionAfterRejectedChange = await fetch(baseUrl + "/api/auth/get-session", { headers: { Cookie: cookie } });
  assert(originalSessionAfterRejectedChange.status === 200 && (await originalSessionAfterRejectedChange.text()).includes(testEmail),
    "a rejected password change must not end the initiating session");

  const changedPassword = "Changed-" + crypto.randomUUID() + "-Secure!";
  const passwordChange = await fetch(baseUrl + "/api/auth/change-password", {
    method: "POST",
    headers: { Cookie: cookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: testPassword, newPassword: changedPassword, revokeOtherSessions: true }),
  });
  const passwordChangeBody = await passwordChange.text();
  assert(passwordChange.status === 200,
    "authenticated password change failed: " + passwordChange.status + ": " + passwordChangeBody);
  const passwordChangeCookies = typeof passwordChange.headers.getSetCookie === "function"
    ? passwordChange.headers.getSetCookie()
    : [passwordChange.headers.get("set-cookie") ?? ""];
  const refreshedSessionCookie = passwordChangeCookies
    .map((value) => value.split(";")[0])
    .find((value) => (value.split("=")[0] ?? "").includes("session_token"));
  if (refreshedSessionCookie) currentSessionCookie = refreshedSessionCookie;

  const preservedSession = await fetch(baseUrl + "/api/auth/get-session", { headers: { Cookie: currentSessionCookie } });
  const preservedSessionBody = await preservedSession.text();
  assert(preservedSession.status === 200 && preservedSessionBody.includes(testEmail),
    "password change must preserve the session that initiated it: " + preservedSessionBody);

  const eventStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const eventEnd = new Date(Date.parse(eventStart) + 60 * 60 * 1000).toISOString();
  const eventHeaders = { Cookie: currentSessionCookie, Origin: baseUrl, "X-Branch-Id": "00000000-0000-4000-8000-000000000001", "Content-Type": "application/json" };
  const createdEventResponse = await fetch(baseUrl + "/api/v1/events", {
    method:"POST",headers:eventHeaders,
    body:JSON.stringify({title:"Flyer upload integration",starts_at:eventStart,ends_at:eventEnd,timezone:"Africa/Accra",location:"Test venue",capacity:1}),
  });
  const createdEventBody = await createdEventResponse.json();
  assert(createdEventResponse.status===201 && createdEventBody.event?.id,
    "authorized event draft creation failed: "+JSON.stringify(createdEventBody));
  const createdEventId=createdEventBody.event.id;
  const publishWithoutFlyer=await fetch(baseUrl+"/api/v1/events/"+encodeURIComponent(createdEventId)+"/publish",{
    method:"POST",headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"},
  });
  const publishWithoutFlyerBody=await publishWithoutFlyer.json();
  assert(publishWithoutFlyer.status===409 && publishWithoutFlyerBody.error?.code==="EVENT_FLYER_REQUIRED",
    "event publishing must require an uploaded flyer: "+JSON.stringify(publishWithoutFlyerBody));
  const flyerForm=new FormData();
  flyerForm.set("file",new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])],{type:"image/png"}),"integration-flyer.png");
  const flyerUpload=await fetch(baseUrl+"/api/v1/events/"+encodeURIComponent(createdEventId)+"/flyer",{
    method:"POST",headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"},body:flyerForm,
  });
  const flyerUploadBody=await flyerUpload.json();
  assert(flyerUpload.status===200 && flyerUploadBody.flyer_url,
    "authenticated event flyer upload failed: "+JSON.stringify(flyerUploadBody));
  const flyerRead=await fetch(baseUrl+flyerUploadBody.flyer_url,{
    headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"},
  });
  assert(flyerRead.status===200 && flyerRead.headers.get("content-type")==="image/png",
    "uploaded event flyer could not be read back with its safe content type");
  const publishWithFlyer=await fetch(baseUrl+"/api/v1/events/"+encodeURIComponent(createdEventId)+"/publish",{
    method:"POST",headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"},
  });
  assert(publishWithFlyer.status===200,
    "event with a stored flyer should publish successfully: "+await publishWithFlyer.text());

  const openRegistration=await fetch(baseUrl+"/api/v1/events/"+encodeURIComponent(createdEventId)+"/registration/open",{
    method:"POST",headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"},
  });
  assert(openRegistration.status===200,"event registration could not be opened: "+await openRegistration.text());
  const registrationA={attendee_name:"Capacity Test A",attendee_phone:null,attendee_email:"capacity-a@example.test"};
  const registrationB={attendee_name:"Capacity Test B",attendee_phone:null,attendee_email:"capacity-b@example.test"};
  const [registrationResponseA,registrationResponseB]=await Promise.all([
    fetch(baseUrl+"/api/v1/events/"+encodeURIComponent(createdEventId)+"/registrations",{
      method:"POST",headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001","Content-Type":"application/json","Idempotency-Key":"capacity-race-a"},
      body:JSON.stringify(registrationA),
    }),
    fetch(baseUrl+"/api/v1/events/"+encodeURIComponent(createdEventId)+"/registrations",{
      method:"POST",headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001","Content-Type":"application/json","Idempotency-Key":"capacity-race-b"},
      body:JSON.stringify(registrationB),
    }),
  ]);
  const registrationResults=await Promise.all([registrationResponseA.json(),registrationResponseB.json()]);
  const successCount=[registrationResponseA,registrationResponseB].filter(response=>response.status===201).length;
  const capacityFailure=[registrationResponseA,registrationResponseB].find(response=>response.status===409);
  const losingIndex=registrationResponseA.status===409?0:1;
  assert(successCount===1&&capacityFailure&&registrationResults[losingIndex].error?.code==="EVENT_CAPACITY_REACHED",
    "concurrent registrations must never exceed event capacity: "+JSON.stringify({statuses:[registrationResponseA.status,registrationResponseB.status],bodies:registrationResults}));
  const winningIndex=registrationResponseA.status===201?0:1;
  const winningKey=winningIndex===0?"capacity-race-a":"capacity-race-b";
  const winningBody=winningIndex===0?registrationA:registrationB;
  const replay=await fetch(baseUrl+"/api/v1/events/"+encodeURIComponent(createdEventId)+"/registrations",{
    method:"POST",headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001","Content-Type":"application/json","Idempotency-Key":winningKey},
    body:JSON.stringify(winningBody),
  });
  const replayBody=await replay.json();
  assert(replay.status===201&&replayBody.registration_id===registrationResults[winningIndex].registration_id,
    "idempotent registration retry must return the original registration: "+JSON.stringify(replayBody));

  const calendarHeaders={Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001","Content-Type":"application/json"};
  const springSeriesResponse=await fetch(baseUrl+"/api/v1/calendar/series",{
    method:"POST",headers:calendarHeaders,body:JSON.stringify({
      entry_type:"service",title:"DST Spring Forward Integration",starts_at:"2027-03-13T06:30:00.000Z",
      ends_at:"2027-03-13T07:30:00.000Z",timezone:"America/New_York",scope_type:"branch",
      recurrence:{frequency:"daily",interval:1,count:3},
    }),
  });
  const springSeries=await springSeriesResponse.json();
  assert(springSeriesResponse.status===201&&springSeries.occurrence_count===3,
    "daily calendar series across spring DST should be created: "+JSON.stringify(springSeries));
  const springEntriesResponse=await fetch(baseUrl+"/api/v1/calendar?from=2027-03-13T00%3A00%3A00.000Z&to=2027-03-17T00%3A00%3A00.000Z",{
    headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"},
  });
  const springEntries=(await springEntriesResponse.json()).entries?.filter(entry=>entry.series_id===springSeries.series_id)??[];
  const localClock=(value)=>new Intl.DateTimeFormat("en-GB",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
  assert(springEntriesResponse.status===200&&springEntries.length===3&&springEntries.every(entry=>localClock(entry.starts_at)==="01:30"),
    "spring DST recurrence must preserve the 01:30 local wall-clock time: "+JSON.stringify(springEntries));
  assert(springEntries.map(entry=>entry.starts_at).join(",")==="2027-03-13T06:30:00.000Z,2027-03-14T06:30:00.000Z,2027-03-15T05:30:00.000Z",
    "spring DST recurrence must adjust UTC offsets without shifting local time");

  const nonexistentSeries=await fetch(baseUrl+"/api/v1/calendar/series",{
    method:"POST",headers:calendarHeaders,body:JSON.stringify({
      entry_type:"service",title:"DST Nonexistent Time Integration",starts_at:"2027-03-13T07:30:00.000Z",
      ends_at:"2027-03-13T08:30:00.000Z",timezone:"America/New_York",scope_type:"branch",
      recurrence:{frequency:"daily",interval:1,count:3},
    }),
  });
  const nonexistentBody=await nonexistentSeries.json();
  assert(nonexistentSeries.status===400&&nonexistentBody.error?.code==="CALENDAR_RECURRENCE_TIME_INVALID",
    "nonexistent local times during spring-forward must be rejected, not silently shifted");

  const fallSeriesResponse=await fetch(baseUrl+"/api/v1/calendar/series",{
    method:"POST",headers:calendarHeaders,body:JSON.stringify({
      entry_type:"service",title:"DST Fall Back Integration",starts_at:"2027-11-06T05:30:00.000Z",
      ends_at:"2027-11-06T06:30:00.000Z",timezone:"America/New_York",scope_type:"branch",
      recurrence:{frequency:"daily",interval:1,count:3},
    }),
  });
  const fallSeries=await fallSeriesResponse.json();
  assert(fallSeriesResponse.status===201&&fallSeries.occurrence_count===3,
    "daily calendar series across fall DST should be created: "+JSON.stringify(fallSeries));
  const fallEntriesResponse=await fetch(baseUrl+"/api/v1/calendar?from=2027-11-06T00%3A00%3A00.000Z&to=2027-11-10T00%3A00%3A00.000Z",{
    headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"},
  });
  const fallEntries=(await fallEntriesResponse.json()).entries?.filter(entry=>entry.series_id===fallSeries.series_id)??[];
  assert(fallEntriesResponse.status===200&&fallEntries.length===3&&fallEntries.every(entry=>localClock(entry.starts_at)==="01:30"),
    "fall DST recurrence must preserve the 01:30 local wall-clock time: "+JSON.stringify(fallEntries));
  assert(fallEntries.map(entry=>entry.starts_at).join(",")==="2027-11-06T05:30:00.000Z,2027-11-07T05:30:00.000Z,2027-11-08T06:30:00.000Z",
    "ambiguous fall-back times must resolve deterministically and remain strictly increasing");

  const teamQuery="?branch_id=00000000-0000-4000-8000-000000000001";
  const adminBranchHeaders={Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001","Content-Type":"application/json"};
  const createTeamResponse=await fetch(baseUrl+"/api/v1/teams"+teamQuery,{
    method:"POST",headers:adminBranchHeaders,body:JSON.stringify({name:"Integration Team",description:"Worker acceptance team"}),
  });
  const createTeamBody=await createTeamResponse.json();
  assert(createTeamResponse.status===201&&createTeamBody.data?.team?.id,
    "branch manager should create a team: "+JSON.stringify(createTeamBody));
  const teamId=createTeamBody.data.team.id;

  const addMemberResponse=await fetch(baseUrl+"/api/v1/teams/"+encodeURIComponent(teamId)+"/members"+teamQuery,{
    method:"POST",headers:adminBranchHeaders,body:JSON.stringify({staff_profile_id:"00000000-0000-4000-8000-000000000099",membership_role:"leader"}),
  });
  const addMemberBody=await addMemberResponse.json();
  assert(addMemberResponse.status===201&&addMemberBody.data?.id,
    "branch manager should add an eligible Team Leader: "+JSON.stringify(addMemberBody));
  const membershipId=addMemberBody.data.id;

  const listTeamsResponse=await fetch(baseUrl+"/api/v1/teams"+teamQuery,{
    headers:{Cookie:currentSessionCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"},
  });
  const listTeamsBody=await listTeamsResponse.json();
  assert(listTeamsResponse.status===200&&listTeamsBody.data?.teams?.some(team=>
    team.id===teamId&&team.members?.some(member=>member.staff?.full_name==="Cloudflare Team Leader")),
    "branch-scoped team list should include the authorized member roster: "+JSON.stringify(listTeamsBody));

  const updateMemberResponse=await fetch(baseUrl+"/api/v1/teams/"+encodeURIComponent(teamId)+"/members/"+encodeURIComponent(membershipId)+teamQuery,{
    method:"PATCH",headers:adminBranchHeaders,body:JSON.stringify({membership_role:"member"}),
  });
  assert(updateMemberResponse.status===200,"team membership role update failed: "+await updateMemberResponse.text());
  const promoteMemberResponse=await fetch(baseUrl+"/api/v1/teams/"+encodeURIComponent(teamId)+"/members/"+encodeURIComponent(membershipId)+teamQuery,{
    method:"PATCH",headers:adminBranchHeaders,body:JSON.stringify({membership_role:"leader"}),
  });
  assert(promoteMemberResponse.status===200,"eligible Team Leader promotion failed: "+await promoteMemberResponse.text());

  const updateTeamResponse=await fetch(baseUrl+"/api/v1/teams/"+encodeURIComponent(teamId)+teamQuery,{
    method:"PATCH",headers:adminBranchHeaders,body:JSON.stringify({description:"Updated integration team"}),
  });
  assert(updateTeamResponse.status===200,"team update failed: "+await updateTeamResponse.text());
  const blockedTeamDeactivation=await fetch(baseUrl+"/api/v1/teams/"+encodeURIComponent(teamId)+teamQuery,{
    method:"PATCH",headers:adminBranchHeaders,body:JSON.stringify({is_active:false}),
  });
  assert(blockedTeamDeactivation.status===409,"team with active members must not be deactivated");
  
  const unassignedTeamResponse=await fetch(baseUrl+"/api/v1/teams"+teamQuery,{
    method:"POST",headers:adminBranchHeaders,body:JSON.stringify({name:"Unassigned Integration Team",description:null}),
  });
  assert(unassignedTeamResponse.status===201,"branch manager should create a second unassigned team");

  const createAreaResponse=await fetch(baseUrl+"/api/v1/areas"+teamQuery,{
    method:"POST",headers:adminBranchHeaders,body:JSON.stringify({name:"Integration Area",code:"TEST-AREA"}),
  });
  const createAreaBody=await createAreaResponse.json();
  assert(createAreaResponse.status===201&&createAreaBody.data?.area?.id,
    "branch manager should create a service area: "+JSON.stringify(createAreaBody));
  const areaId=createAreaBody.data.area.id;

  const addCoverageResponse=await fetch(baseUrl+"/api/v1/areas/"+encodeURIComponent(areaId)+"/coverage"+teamQuery,{
    method:"POST",headers:adminBranchHeaders,body:JSON.stringify({staff_profile_id:"00000000-0000-4000-8000-000000000099"}),
  });
  const addCoverageBody=await addCoverageResponse.json();
  assert(addCoverageResponse.status===201&&addCoverageBody.data?.id,
    "branch manager should assign service-area coverage: "+JSON.stringify(addCoverageBody));
  const coverageId=addCoverageBody.data.id;

  const blockedAreaDeactivation=await fetch(baseUrl+"/api/v1/areas/"+encodeURIComponent(areaId)+teamQuery,{
    method:"PATCH",headers:adminBranchHeaders,body:JSON.stringify({is_active:false}),
  });
  assert(blockedAreaDeactivation.status===409,"service area with active coverage must not be deactivated");

  const teamLeaderSignIn=await fetch(baseUrl+"/api/auth/sign-in/email",{
    method:"POST",headers:{"Content-Type":"application/json",Origin:baseUrl},
    body:JSON.stringify({email:"cloudflare-team-leader@example.test",password:testPassword}),
  });
  const leaderSetCookies=typeof teamLeaderSignIn.headers.getSetCookie==="function"
    ? teamLeaderSignIn.headers.getSetCookie()
    : [teamLeaderSignIn.headers.get("set-cookie")??""];
  const teamLeaderCookie=leaderSetCookies.map(value=>value.split(";")[0])
    .find(value=>(value.split("=")[0]??"").includes("session_token"))??"";
  assert(teamLeaderSignIn.status===200&&teamLeaderCookie,
    "Team Leader Better Auth sign-in failed: "+teamLeaderSignIn.status);
  const leaderHeaders={Cookie:teamLeaderCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000001"};
  const leaderTeamsResponse=await fetch(baseUrl+"/api/v1/teams"+teamQuery,{headers:leaderHeaders});
  const leaderTeamsBody=await leaderTeamsResponse.json();
  assert(leaderTeamsResponse.status===200&&leaderTeamsBody.data?.teams?.length===1&&leaderTeamsBody.data.teams[0].id===teamId,
    "team-scoped Team Leader should see only their assigned team: "+JSON.stringify(leaderTeamsBody));
  const leaderAreasResponse=await fetch(baseUrl+"/api/v1/areas"+teamQuery,{headers:leaderHeaders});
  const leaderAreasBody=await leaderAreasResponse.json();
  assert(leaderAreasResponse.status===200&&leaderAreasBody.data?.areas?.some(area=>
    area.id===areaId&&area.coverage?.some(item=>item.staff?.full_name==="Cloudflare Team Leader")),
    "team-scoped Team Leader should see their team's service-area coverage: "+JSON.stringify(leaderAreasBody));
  const leaderCreateTeam=await fetch(baseUrl+"/api/v1/teams"+teamQuery,{
    method:"POST",headers:{...leaderHeaders,"Content-Type":"application/json"},body:JSON.stringify({name:"Forbidden Team"}),
  });
  assert(leaderCreateTeam.status===403,"Team Leader must not receive branch-wide team management privileges");
  const leaderOtherBranch=await fetch(baseUrl+"/api/v1/teams?branch_id=00000000-0000-4000-8000-000000000002",{
    headers:{Cookie:teamLeaderCookie,Origin:baseUrl,"X-Branch-Id":"00000000-0000-4000-8000-000000000002"},
  });
  assert(leaderOtherBranch.status===403,"Team Leader must not read teams from an unassigned branch");

  const revokeCoverageResponse=await fetch(baseUrl+"/api/v1/areas/"+encodeURIComponent(areaId)+"/coverage/"+encodeURIComponent(coverageId)+"/revoke"+teamQuery,{
    method:"POST",headers:adminBranchHeaders,
  });
  assert(revokeCoverageResponse.status===200,"service-area coverage revocation failed: "+await revokeCoverageResponse.text());
  const deactivateAreaResponse=await fetch(baseUrl+"/api/v1/areas/"+encodeURIComponent(areaId)+teamQuery,{
    method:"PATCH",headers:adminBranchHeaders,body:JSON.stringify({is_active:false}),
  });
  assert(deactivateAreaResponse.status===200,"service area should deactivate after coverage revocation: "+await deactivateAreaResponse.text());

  const revokeMemberResponse=await fetch(baseUrl+"/api/v1/teams/"+encodeURIComponent(teamId)+"/members/"+encodeURIComponent(membershipId)+"/revoke"+teamQuery,{
    method:"POST",headers:adminBranchHeaders,
  });
  assert(revokeMemberResponse.status===200,"team membership revocation failed: "+await revokeMemberResponse.text());
  const deactivateTeamResponse=await fetch(baseUrl+"/api/v1/teams/"+encodeURIComponent(teamId)+teamQuery,{
    method:"PATCH",headers:adminBranchHeaders,body:JSON.stringify({is_active:false}),
  });
  assert(deactivateTeamResponse.status===200,"team should deactivate after membership revocation: "+await deactivateTeamResponse.text());

  const revokedOtherSession = await fetch(baseUrl + "/api/auth/get-session", { headers: { Cookie: secondCookie } });
  const revokedOtherSessionBody = await revokedOtherSession.text();
  assert(revokedOtherSession.status === 200 &&
    (revokedOtherSessionBody.trim() === "null" || revokedOtherSessionBody.trim() === ""),
    "password change must revoke other active sessions: " + revokedOtherSessionBody);

  const oldPasswordSignIn = await fetch(baseUrl + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert(oldPasswordSignIn.status >= 400,
    "the previous password must stop authenticating after a successful password change");

  const newPasswordSignIn = await fetch(baseUrl + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email: testEmail, password: changedPassword }),
  });
  const newPasswordSignInBody = await newPasswordSignIn.text();
  assert(newPasswordSignIn.status === 200,
    "new password sign-in failed: " + newPasswordSignIn.status + ": " + newPasswordSignInBody);


  const signOut = await fetch(baseUrl + "/api/auth/sign-out", {
    method: "POST",
    headers: { Cookie: currentSessionCookie, Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(signOut.status === 200, "Better Auth sign-out failed: " + signOut.status);
  const signedOutSession = await fetch(baseUrl + "/api/auth/get-session", { headers: { Cookie: currentSessionCookie } });
  const signedOutBody = await signedOutSession.text();
  assert(signedOutSession.status === 200 && (signedOutBody.trim() === "null" || signedOutBody.trim() === ""),
    "Better Auth session should be revoked after sign-out: " + signedOutBody);

  const protectedPaths = [
    "/api/v1/me",
    "/api/v1/staff",
    "/api/v1/contacts",
    "/api/v1/followup/tasks",
    "/api/v1/pastoral/prayer/queue",
    "/api/v1/pastoral/care",
    "/api/v1/events",
    "/api/v1/events/test-event/flyer",
    "/api/v1/teams",
    "/api/v1/areas",
    "/api/v1/calendar",
    "/api/v1/announcements",
    "/api/v1/reports",
    "/api/v1/reports/export",
  ];
  for (const route of protectedPaths) {
    const response = await fetch(baseUrl + route);
    assert(response.status === 401, "unauthenticated request to " + route + " should be 401, got " + response.status);
    assert(response.headers.get("x-content-type-options") === "nosniff", "security headers missing on " + route);
  }

  const scheduledAnnouncement = await fetch(baseUrl + "/api/v1/announcements/test-announcement/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publish_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }),
  });
  assert(scheduledAnnouncement.status === 401,
    "unauthenticated POST to announcement schedule should be 401, got " + scheduledAnnouncement.status);
  assert(scheduledAnnouncement.headers.get("x-content-type-options") === "nosniff",
    "security headers missing on announcement schedule");

  const protectedFlyerUpload = await fetch(baseUrl + "/api/v1/events/test-event/flyer", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data" },
    body: new FormData(),
  });
  assert(protectedFlyerUpload.status === 401,
    "unauthenticated event flyer upload must be rejected before parsing or storing media, got " + protectedFlyerUpload.status);

  const protectedTeamCreates = [
    ["/api/v1/teams", { name:"Test team", description:null }],
    ["/api/v1/areas", { name:"Test area", code:null }],
  ];
  const testBranchId = "00000000-0000-4000-8000-000000000001";
  for (const [route, body] of protectedTeamCreates) {
    const response = await fetch(baseUrl + route + "?branch_id=" + testBranchId, {
      method:"POST",headers:{"Content-Type":"application/json","X-Branch-Id":testBranchId},body:JSON.stringify(body),
    });
    assert(response.status===401,"unauthenticated team/service-area create must return 401 for "+route+", got "+response.status);
  }

  const protectedPosts = [
    ["/api/v1/calendar/series", { title:"Weekly service", entry_type:"service", starts_at:"2026-11-16T10:00:00.000Z", timezone:"Africa/Accra", scope_type:"branch", recurrence:{frequency:"weekly",interval:1,count:4} }],
    ["/api/v1/calendar/series/test-series/cancel", { reason:"Cancelled for integration test" }],
    ["/api/v1/pastoral/care", { contact_id:"test-contact" }],
    ["/api/v1/pastoral/care/test-case/assignments", { assignee_profile_id:"test-profile", purpose:"Authorized case assignment test" }],
    ["/api/v1/pastoral/care/test-case/interactions", { interaction_type:"call", restricted_note:"test" }],
  ];
  for (const [route, body] of protectedPosts) {
    const response = await fetch(baseUrl + route, {
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
    });
    assert(response.status===401,"unauthenticated POST to "+route+" should be 401, got "+response.status);
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
