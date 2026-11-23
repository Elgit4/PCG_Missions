import test from "node:test";
import assert from "node:assert/strict";
import { readPublicContent, PublicContentRequestError } from "../src/public-content.ts";

function database(result = []) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { calls.push({ sql, values, mode: "first" }); return result[0] ?? null; },
            async all() { calls.push({ sql, values, mode: "all" }); return { results: result }; },
          };
        },
      };
    },
  };
}

test("public sermons return only published projection fields with bounded pagination", async () => {
  const db = database([{ id: "sermon-1", title: "Hope", body: "A public message" }]);
  const url = new URL("https://example.test/api/v1/public-content?resource=sermons&limit=20&offset=0&slug=hope");
  const result = await readPublicContent(db, url);
  assert.deepEqual(result, [{ id: "sermon-1", title: "Hope", body: "A public message" }]);
  assert.match(db.calls[0].sql, /status = 'published'/);
  assert.match(db.calls[0].sql, /public_slug = \?/);
  assert.doesNotMatch(db.calls[0].sql, /staff_profile|auth_user_id|flyer_key/);
  assert.deepEqual(db.calls[0].values, ["hope", 20, 0]);
});

test("public event projection excludes flyer keys and filters private or unpublished events", async () => {
  const db = database([{ id: "event-1", title: "Sunday service", visibility: "public" }]);
  await readPublicContent(db, new URL("https://example.test/api/v1/public-content?resource=events&limit=10&offset=0"));
  assert.match(db.calls[0].sql, /visibility = 'public'/);
  assert.match(db.calls[0].sql, /status = 'published'/);
  assert.doesNotMatch(db.calls[0].sql, /flyer_key|flyer_content_type|event_registration/);
  assert.deepEqual(db.calls[0].values, [10, 0]);
});

test("church profile parses stored social links JSON", async () => {
  const db = database([{ public_name: "PCG", social_links: "{\"facebook\":\"https://example.test\"}" }]);
  const result = await readPublicContent(db, new URL("https://example.test/api/v1/public-content?resource=church-profile"));
  assert.deepEqual(result, { public_name: "PCG", social_links: { facebook: "https://example.test" } });
  assert.deepEqual(db.calls[0].values, []);
});

test("invalid resource and pagination fail before database access", async () => {
  const db = database();
  await assert.rejects(
    readPublicContent(db, new URL("https://example.test/api/v1/public-content?resource=unknown")),
    (error) => error instanceof PublicContentRequestError && error.status === 404,
  );
  await assert.rejects(
    readPublicContent(db, new URL("https://example.test/api/v1/public-content?resource=events&limit=999")),
    (error) => error instanceof PublicContentRequestError && error.status === 400,
  );
  assert.equal(db.calls.length, 0);
});
