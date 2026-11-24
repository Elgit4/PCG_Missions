import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { readJson } from "./request_body.ts";

function makeRequest(
  body: Uint8Array | string | null,
  headers: Record<string, string> = { "Content-Type": "application/json" },
): Request {
  const requestBody: BodyInit | null = body === null
    ? null
    : typeof body === "string"
    ? body
    : (() => {
      const bytes = new Uint8Array(body.byteLength);
      bytes.set(body);
      return bytes.buffer;
    })();
  return new Request("https://example.test/operations", {
    method: "POST",
    headers,
    body: requestBody,
  });
}

Deno.test("accepts JSON with an optional charset parameter", async () => {
  const request = makeRequest(
    '{"ok":true}',
    { "Content-Type": "application/json; charset=utf-8" },
  );
  assertEquals(await readJson(request), { ok: true });
});

Deno.test("rejects missing and incorrect content types", async () => {
  await assertRejects(
    () => readJson(makeRequest("{}", {})),
    Error,
    "CONTENT_TYPE_REQUIRED",
  );
  await assertRejects(
    () => readJson(makeRequest("{}", { "Content-Type": "text/plain" })),
    Error,
    "CONTENT_TYPE_REQUIRED",
  );
});

Deno.test("rejects an empty body and malformed JSON", async () => {
  await assertRejects(
    () => readJson(makeRequest(null)),
    Error,
    "REQUEST_BODY_REQUIRED",
  );
  await assertRejects(() => readJson(makeRequest("{")), Error, "INVALID_JSON");
});

Deno.test("accepts a payload exactly at the configured byte limit", async () => {
  const body = '{"a":1}';
  assertEquals(await readJson(makeRequest(body), 7), { a: 1 });
});

Deno.test("rejects an oversized payload without Content-Length", async () => {
  await assertRejects(
    () => readJson(makeRequest('{"a":123456}'), 7),
    Error,
    "BODY_TOO_LARGE",
  );
});

Deno.test("rejects a declared oversized payload before reading", async () => {
  await assertRejects(
    () =>
      readJson(
        makeRequest("{}", {
          "Content-Type": "application/json",
          "Content-Length": "100",
        }),
        16,
      ),
    Error,
    "BODY_TOO_LARGE",
  );
});

Deno.test("rejects malformed Content-Length", async () => {
  await assertRejects(
    () =>
      readJson(
        makeRequest("{}", {
          "Content-Type": "application/json",
          "Content-Length": "not-a-number",
        }),
      ),
    Error,
    "INVALID_CONTENT_LENGTH",
  );
});

Deno.test("rejects invalid UTF-8 rather than silently replacing bytes", async () => {
  const invalidUtf8 = new Uint8Array([0x7b, 0xff, 0x7d]);
  await assertRejects(
    () => readJson(makeRequest(invalidUtf8)),
    Error,
    "INVALID_JSON",
  );
});

Deno.test("enforces the streaming limit when Content-Length is absent", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"a":'));
      controller.enqueue(new TextEncoder().encode('"long-value"}'));
      controller.close();
    },
  });
  const request = new Request("https://example.test/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
  });
  await assertRejects(() => readJson(request, 8), Error, "BODY_TOO_LARGE");
});
