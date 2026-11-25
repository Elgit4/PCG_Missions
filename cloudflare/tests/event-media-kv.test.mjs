import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const rehearsal = readFileSync(new URL("../../.github/workflows/cloudflare-d1-restore-rehearsal.yml", import.meta.url), "utf8");

test("event flyer media uses the EU Cloudflare KV binding without Supabase runtime dependencies", () => {
  assert.doesNotMatch(worker, /SUPABASE_(?:URL|SERVICE_ROLE_KEY)/);
  assert.doesNotMatch(worker, /storage\/v1\/object/);
  assert.match(worker, /EVENT_MEDIA\.put\(key,bytes/);
  assert.match(worker, /EVENT_MEDIA\.delete\(/);
  assert.match(wrangler, /binding = "EVENT_MEDIA"[\s\S]*?jurisdiction = "eu"|binding = "EVENT_MEDIA"[\s\S]*?id = "4c1b4d0c6066440ebdabfa75fd935dfe"/);
  assert.doesNotMatch(rehearsal, /SUPABASE_(?:URL|SERVICE_ROLE_KEY)/);
  assert.match(rehearsal, /binding = "EVENT_MEDIA"/);
});

test("event flyer media links are HMAC-signed, short-lived, scoped to a validated object key, and private", () => {
  assert.match(worker, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(worker, /crypto\.subtle\.verify\("HMAC"/);
  assert.match(worker, /EVENT_MEDIA_URL_TTL_SECONDS=900/);
  assert.match(worker, /expires<=Math\.floor\(Date\.now\(\)\/1000\)/);
  assert.match(worker, /EVENT_MEDIA_URL_INVALID_OR_EXPIRED/);
  assert.match(worker, /Cache-Control":"private, no-store, max-age=0"/);
  assert.match(worker, /X-Content-Type-Options":"nosniff"/);
  assert.match(worker, /Content-Security-Policy":"default-src 'none'; sandbox"/);
  assert.match(worker, /url\.pathname\.startsWith\(eventMediaPrefix\)/);
});

test("flyer replacement and removal update D1 and clean up the previous KV object", () => {
  assert.match(worker, /UPDATE event SET flyer_key=\?,flyer_content_type=\?,flyer_size=\?,flyer_updated_at=\?,last_modified_by=\?/);
  assert.match(worker, /if\(event\.flyer_key\) await env\.EVENT_MEDIA\.delete\(event\.flyer_key\)/);
  assert.match(worker, /await env\.EVENT_MEDIA\.delete\(current\.flyer_key\)/);
  assert.match(worker, /if\(!updated\.success\|\|\(updated\.meta\?\.changes\?\?0\)<1\)\{[\s\S]*?EVENT_MEDIA\.delete\(key\)/);
});
