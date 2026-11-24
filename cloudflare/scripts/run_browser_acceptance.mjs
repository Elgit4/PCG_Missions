import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const credentialsPath = process.env.PCG_BROWSER_CREDENTIALS_PATH;
const baseUrl = process.env.PCG_BROWSER_BASE_URL || "http://localhost:8788";
const databaseId = process.env.DB_ID;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!credentialsPath || !databaseId || !accountId || !apiToken) {
  throw new Error("Browser acceptance requires the temporary credentials file and isolated D1 access.");
}

const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
if (!credentials.email || !credentials.password || !credentials.userId) {
  throw new Error("The temporary browser credentials file is incomplete.");
}

async function d1(sql, params = []) {
  const response = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/d1/database/" + databaseId + "/query",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params: params.map((value) => String(value)) }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error("Temporary D1 browser-acceptance query failed: " + response.status + " " + JSON.stringify(payload));
  }
  return payload.result?.[0]?.results ?? [];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const initialResponse = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert(initialResponse?.ok(), "The Pages application did not load successfully.");
  await page.getByLabel("Staff email address").waitFor({ state: "visible", timeout: 20_000 });

  const signInResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/sign-in/email") && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  const staffSessionResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/v1/me") && response.status() === 200,
    { timeout: 30_000 },
  );

  await page.getByLabel("Staff email address").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  const [signInResponse, staffSessionResponse] = await Promise.all([
    signInResponsePromise,
    staffSessionResponsePromise,
  ]);
  assert(signInResponse.status() === 200, "The browser sign-in request did not succeed.");
  assert(staffSessionResponse.status() === 200, "The browser could not load the authenticated staff session.");
  await page.getByRole("button", { name: "Sign out" }).first().waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("Overview", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!mobileOverflow, "The authenticated mobile workspace has horizontal overflow.");

  const initialCookies = await context.cookies(baseUrl);
  assert(
    initialCookies.some((cookie) => cookie.name.includes("session_token") && cookie.httpOnly && cookie.value),
    "The browser did not receive an HttpOnly Better Auth session cookie.",
  );

  const sessionRows = await d1(
    "SELECT id,expiresAt FROM session WHERE userId=? ORDER BY createdAt DESC LIMIT 1", [credentials.userId],
  );
  const sessionId = sessionRows[0]?.id;
  assert(sessionId, "The browser-created Better Auth session was not found in temporary D1.");

  const dueExpiry = Date.now() + 5 * 24 * 60 * 60 * 1000;
  await d1("UPDATE session SET expiresAt=? WHERE id=?", [dueExpiry, sessionId]);

  const refreshResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/get-session") && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  const refreshResponse = await refreshResponsePromise;
  assert(refreshResponse.status() === 200, "The browser's deferred Better Auth session refresh failed.");
  await page.getByRole("button", { name: "Sign out" }).first().waitFor({ state: "visible", timeout: 30_000 });

  const refreshedRows = await d1("SELECT expiresAt FROM session WHERE id=?", [sessionId]);
  assert(
    Number(refreshedRows[0]?.expiresAt) > dueExpiry,
    "The browser client did not extend the server-side session expiry after refresh.",
  );
  const refreshedCookies = await context.cookies(baseUrl);
  assert(
    refreshedCookies.some((cookie) => cookie.name.includes("session_token") && cookie.httpOnly && cookie.value),
    "The refreshed browser session cookie is missing.",
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!desktopOverflow, "The authenticated desktop workspace has horizontal overflow.");

  const signOutResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/sign-out") && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Sign out" }).first().click();
  const signOutResponse = await signOutResponsePromise;
  assert(signOutResponse.status() === 200, "The browser sign-out request did not succeed.");
  await page.getByLabel("Staff email address").waitFor({ state: "visible", timeout: 20_000 });

  const cookiesAfterSignOut = await context.cookies(baseUrl);
  assert(
    !cookiesAfterSignOut.some((cookie) => cookie.name.includes("session_token") && cookie.value),
    "The server did not clear the browser's authenticated session cookie on sign-out.",
  );
  assert(pageErrors.length === 0, "The authenticated browser session raised page errors: " + pageErrors.join(" | "));

  console.log("BROWSER_LOGIN_RESPONSIVE_SESSION_REFRESH_AND_LOGOUT_PASSED");
  await context.close();
} finally {
  await browser.close();
}
