import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGhanaPhoneNumber, sendArkeselSandbox } from "../src/arkesel.ts";

test("normalizes Ghana mobile numbers to E.164", () => {
  assert.equal(normalizeGhanaPhoneNumber("024 123 4567"), "+233241234567");
  assert.equal(normalizeGhanaPhoneNumber("233241234567"), "+233241234567");
  assert.equal(normalizeGhanaPhoneNumber("+233241234567"), "+233241234567");
  assert.equal(normalizeGhanaPhoneNumber("12345"), null);
});

test("refuses to send without a server-side API key", async () => {
  const result = await sendArkeselSandbox({}, {
    sender: "PCGMISSIONS", message: "Test", recipients: ["0241234567"],
  }, async () => { throw new Error("fetch must not run"); });
  assert.deepEqual(result, { ok: false, code: "CONFIGURATION_MISSING", retryable: false });
});

test("rejects invalid sender and recipients before making a request", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return new Response("{}"); };
  const result = await sendArkeselSandbox({ ARKESEL_API_KEY: "test-key" }, {
    sender: "sender-name-too-long",
    message: "Test",
    recipients: ["0241234567"],
  }, fetcher);
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("always sends sandbox=true and keeps the API key in the request header", async () => {
  let captured;
  const fetcher = async (url, init) => {
    captured = { url, init };
    return Response.json({ status: "success", data: [{ message_id: "sandbox-123" }] });
  };
  const result = await sendArkeselSandbox({ ARKESEL_API_KEY: "secret-test-key" }, {
    sender: "PCGMISSIONS",
    message: "Synthetic sandbox test",
    recipients: ["0241234567"],
  }, fetcher);

  assert.deepEqual(result, {
    ok: true, provider: "arkesel", messageIds: ["sandbox-123"], sandbox: true,
  });
  assert.equal(captured.url, "https://sms.arkesel.com/api/v2/sms/send");
  assert.equal(captured.init.headers["api-key"], "secret-test-key");
  assert.equal(captured.init.headers.Authorization, undefined);
  const body = JSON.parse(captured.init.body);
  assert.equal(body.sandbox, true);
  assert.deepEqual(body.recipients, ["+233241234567"]);
  assert.equal(body.message, "Synthetic sandbox test");
});

test("does not automatically retry ambiguous provider failures", async () => {
  let calls = 0;
  const result = await sendArkeselSandbox({ ARKESEL_API_KEY: "test-key" }, {
    sender: "PCGMISSIONS", message: "Test", recipients: ["0241234567"],
  }, async () => { calls++; return new Response("temporary error", { status: 503 }); });
  assert.deepEqual(result, { ok: false, code: "PROVIDER_UNAVAILABLE", retryable: false });
  assert.equal(calls, 1);
});

test("rejects non-Arkesel endpoints to prevent accidental credential exfiltration", async () => {
  let calls = 0;
  const result = await sendArkeselSandbox({
    ARKESEL_API_KEY: "test-key",
    ARKESEL_API_URL: "https://attacker.example/send",
  }, {
    sender: "PCGMISSIONS", message: "Test", recipients: ["0241234567"],
  }, async () => { calls++; return Response.json({ status: "success" }); });
  assert.deepEqual(result, { ok: false, code: "CONFIGURATION_MISSING", retryable: false });
  assert.equal(calls, 0);
});
