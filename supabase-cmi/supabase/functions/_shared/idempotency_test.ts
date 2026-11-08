import {
  canonicalJson,
  createRequestDigest,
  equalDigestHex,
} from "../_shared/idempotency.ts";
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";

Deno.test("canonical JSON sorts object keys recursively", () => {
  assertEquals(
    canonicalJson({ z: 1, nested: { b: 2, a: 1 }, a: true }),
    '{"a":true,"nested":{"a":1,"b":2},"z":1}',
  );
});

Deno.test("canonical JSON preserves array order and normalizes Unicode", () => {
  assertEquals(canonicalJson(["e\u0301", "second"]), '["é","second"]');
  assertEquals(canonicalJson([1, 2]), "[1,2]");
  assertEquals(canonicalJson([2, 1]), "[2,1]");
});

Deno.test("canonical JSON normalizes negative zero", () => {
  assertEquals(canonicalJson(-0), "0");
});

Deno.test("canonical JSON rejects non-finite numbers", () => {
  assertThrows(() => canonicalJson(Number.NaN));
  assertThrows(() => canonicalJson(Number.POSITIVE_INFINITY));
});

Deno.test("canonical JSON rejects undefined and unsupported values", () => {
  assertThrows(() => canonicalJson({ value: undefined } as never));
  assertThrows(() => canonicalJson(BigInt(1) as never));
});

Deno.test("canonical JSON rejects circular references", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assertThrows(() => canonicalJson(circular as never));
});

Deno.test("canonical JSON rejects non-plain objects", () => {
  assertThrows(() => canonicalJson(new Date() as never));
});

Deno.test("canonical JSON rejects sparse arrays and normalized key collisions", () => {
  const sparse = new Array(2) as never;
  assertThrows(() => canonicalJson(sparse));
  const collision = { "é": 1, "e\\u0301": 2 } as never;
  assertThrows(() => canonicalJson(collision));
});

Deno.test("digest is stable for equivalent object key order", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const left = await createRequestDigest({ event: "e1", body: { b: 2, a: 1 } }, secret, 1);
  const right = await createRequestDigest({ body: { a: 1, b: 2 }, event: "e1" }, secret, 1);
  assertEquals(left, right);
});

Deno.test("digest changes when payload or secret changes", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const payload = { event: "e1", attendee: "c1" };
  const original = await createRequestDigest(payload, secret, 1);
  const changedPayload = await createRequestDigest({ ...payload, attendee: "c2" }, secret, 1);
  const changedSecret = await createRequestDigest(payload, "abcdef0123456789abcdef0123456789", 1);
  assertEquals(equalDigestHex(original.digestHex, changedPayload.digestHex), false);
  assertEquals(equalDigestHex(original.digestHex, changedSecret.digestHex), false);
});

Deno.test("digest requires a strong secret and a positive key version", async () => {
  await assertRejects(() => createRequestDigest({ ok: true }, "short", 1));
  await assertRejects(() => createRequestDigest({ ok: true }, "0123456789abcdef0123456789abcdef", 0));
});

Deno.test("digest comparison validates shape and compares matching values", () => {
  const digest = "a".repeat(64);
  assertEquals(equalDigestHex(digest, digest.toUpperCase()), true);
  assertEquals(equalDigestHex(digest, "b".repeat(64)), false);
  assertEquals(equalDigestHex("invalid", digest), false);
});
