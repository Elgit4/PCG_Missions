import assert from "node:assert/strict";
import test from "node:test";
import * as authModule from "../src/auth.ts";
const { createAuth, createBetterAuthUser, deleteBetterAuthUser, updateBetterAuthUserPassword, verifyLegacyBcryptPassword } = authModule;
import { rateLimit } from "../src/auth-schema.ts";

function fakeDatabase() {
  const statements = [];
  const DB = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { this.values = values; return this; },
        async first() { return null; }, async run() { return { success: true, meta: { changes: 1 } }; } };
      statements.push(statement);
      return statement;
    },
    async batch(items) { return items.map(() => ({ success: true, meta: { changes: 1 } })); },
  };
  return { DB, statements };
}

test("Better Auth session polling bypasses D1 rate-limit writes while sensitive endpoints stay throttled", () => {
  const config = authModule.betterAuthRateLimitOptions;
  assert.ok(config, "the shared Better Auth rate-limit configuration must be exported for regression testing");
  assert.equal(config.storage, "database");
  assert.equal(config.customRules["/get-session"], false);
  assert.equal(config.customRules["/api/auth/get-session"], false);
  assert.deepEqual(config.customRules["/sign-in/email"], { window: 60, max: 5 });
  assert.deepEqual(config.customRules["/forget-password"], { window: 60, max: 3 });
  assert.deepEqual(config.customRules["/reset-password"], { window: 60, max: 5 });
});

test("Better Auth defers session refresh writes until an explicit POST", () => {
  const sessionOptions = authModule.betterAuthSessionOptions;
  assert.ok(sessionOptions, "shared session options must be exported for regression testing");
  assert.equal(sessionOptions.deferSessionRefresh, true);
  assert.deepEqual(sessionOptions.cookieCache, { enabled: false });
  assert.equal(sessionOptions.expiresIn, 60 * 60 * 24 * 7);
  assert.equal(sessionOptions.updateAge, 60 * 60 * 24);
});

test("D1 rate-limit records receive an application-generated primary key", () => {
  assert.equal(typeof rateLimit.id.defaultFn, "function");
  assert.match(rateLimit.id.defaultFn(), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test("Better Auth initializes its session API with the D1 Drizzle adapter", () => {
  const { DB } = fakeDatabase();
  const auth = createAuth({
    DB,
    BETTER_AUTH_SECRET: "test-only-secret-that-is-long-enough-for-better-auth",
    BETTER_AUTH_URL: "https://pcg-missions-api-preview.example.workers.dev",
    BETTER_AUTH_TRUSTED_ORIGINS: "https://pcg-missions-preview.example.pages.dev",
  });
  assert.equal(typeof auth.api.getSession, "function");
});

test("Better Auth creates a D1 user and credential without an external Auth API", async () => {
  const { DB, statements } = fakeDatabase();
  const id = await createBetterAuthUser({ DB }, {
    email: " Staff@Example.Test ", password: "A-Strong-Temporary-Password-2026!", fullName: "Staff Member",
  });
  assert.match(id, /^[0-9a-f-]{36}$/i);
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /INSERT INTO "user"/);
  assert.equal(statements[0].values[2], "staff@example.test");
  assert.match(statements[1].sql, /INSERT INTO account/);
  assert.match(statements[1].values[3], /^\$2[aby]\$12\$/);
});

test("Better Auth verifies imported bcrypt password hashes", async () => {
  const { hash } = await import("bcryptjs");
  const password = "Legacy-Staff-Password-2026!";
  const hashValue = await hash(password, 10);
  assert.ok(await verifyLegacyBcryptPassword(password, hashValue));
  assert.equal(await verifyLegacyBcryptPassword("wrong-password", hashValue), false);
  assert.equal(await verifyLegacyBcryptPassword(password, "not-a-bcrypt-hash"), false);
});

test("Admin-approved password reset rotates a credential and revokes existing sessions", async () => {
  const { DB, statements } = fakeDatabase();
  await updateBetterAuthUserPassword({ DB }, "staff-user-id", "New-Strong-Password-2026!", true);
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /UPDATE account SET password/);
  assert.match(statements[1].sql, /DELETE FROM session WHERE userId/);
  assert.equal(statements[1].values[0], "staff-user-id");
});

test("forced first-login password replacement retains the active browser session", async () => {
  const { DB, statements } = fakeDatabase();
  await updateBetterAuthUserPassword({ DB }, "staff-user-id", "New-Strong-Password-2026!", false);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /UPDATE account SET password/);
});

test("credential update fails closed when no active password account exists", async () => {
  const DB = {
    prepare(sql) { return { sql, bind() { return this; }, async run() { return { success: true, meta: { changes: 0 } }; } }; },
    async batch(items) { return items.map(() => ({ success: true, meta: { changes: 0 } })); },
  };
  await assert.rejects(updateBetterAuthUserPassword({ DB }, "missing-user", "New-Strong-Password-2026!"), /BETTER_AUTH_PASSWORD_UPDATE_FAILED/);
});

test("compensating cleanup deletes a D1 Better Auth user", async () => {
  const { DB, statements } = fakeDatabase();
  await deleteBetterAuthUser({ DB }, "staff-user-id");
  assert.match(statements[0].sql, /DELETE FROM "user"/);
});
