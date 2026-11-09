import {
  createHubtelSmsProvider,
  HubtelSmsError,
  validateHubtelSmsConfig,
} from "./hubtel.ts";

const config = {
  clientId: "test-client",
  clientSecret: "test-secret",
  senderId: "PCGMISSIONS",
  liveEnabled: true,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Hubtel config accepts a valid sender ID", () => {
  validateHubtelSmsConfig(config);
});

Deno.test("Hubtel config rejects an invalid sender ID", () => {
  for (const senderId of ["", "PCG Missions", "THIS-SENDER-ID-IS-LONG"]) {
    let rejected = false;
    try {
      validateHubtelSmsConfig({ ...config, senderId });
    } catch (error) {
      rejected = error instanceof HubtelSmsError &&
        error.code === "HUBTEL_SMS_CONFIGURATION_INVALID";
    }
    assert(rejected, `Invalid sender ID accepted: ${senderId}`);
  }
});

Deno.test(
  "live dispatch is disabled by default and never calls provider",
  async () => {
    let called = false;
    const provider = createHubtelSmsProvider(
      { ...config, liveEnabled: false },
      () => {
        called = true;
        return Promise.resolve(new Response("{}"));
      },
    );
    let rejected = false;
    try {
      await provider.send({ toE164: "+233241234567", content: "Test" });
    } catch (error) {
      rejected = error instanceof HubtelSmsError &&
        error.code === "HUBTEL_SMS_LIVE_DISPATCH_DISABLED";
    }
    assert(rejected, "Disabled live dispatch must fail closed.");
    assert(!called, "Provider must not be called while dispatch is disabled.");
  },
);

Deno.test(
  "invalid phone and empty message are rejected before network call",
  async () => {
    let calls = 0;
    const provider = createHubtelSmsProvider(config, () => {
      calls++;
      return Promise.resolve(new Response("{}"));
    });
    for (
      const input of [
        { toE164: "0241234567", content: "Test" },
        { toE164: "+233241234567", content: " " },
      ]
    ) {
      let rejected = false;
      try {
        await provider.send(input);
      } catch (error) {
        rejected = error instanceof HubtelSmsError;
      }
      assert(rejected, "Invalid SMS payload must be rejected.");
    }
    assert(calls === 0, "Invalid payloads must not reach Hubtel.");
  },
);

Deno.test(
  "Hubtel business send uses POST, Basic auth and normalized Ghana number",
  async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const provider = createHubtelSmsProvider(config, (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return Promise.resolve(Response.json({
        rate: 0.03,
        messageId: "fab43849-6c5b-4334-a88b-d06520b1ace8",
        status: 0,
        networkId: "62001",
      }));
    });
    const result = await provider.send({
      toE164: "+233241234567",
      content: "Hello",
    });
    assert(
      requestUrl === "https://sms.hubtel.com/v1/messages/send",
      "Wrong endpoint.",
    );
    assert(requestInit?.method === "POST", "POST must be used.");
    const headers = new Headers(requestInit?.headers);
    assert(
      headers.get("Authorization") ===
        `Basic ${btoa("test-client:test-secret")}`,
      "Basic authorization was not set.",
    );
    const body = JSON.parse(String(requestInit?.body));
    assert(body.From === "PCGMISSIONS", "Sender ID missing.");
    assert(
      body.To === "233241234567",
      "Recipient must be normalized without plus.",
    );
    assert(body.Content === "Hello", "Message body was not normalized.");
    assert(result.state === "accepted", "Expected provider acceptance.");
    assert(
      result.providerMessageId ===
        "fab43849-6c5b-4334-a88b-d06520b1ace8",
      "Message ID missing.",
    );
  },
);

Deno.test("Hubtel status lookup maps delivery states", async () => {
  const statuses = [
    ["Delivered", "delivered"],
    ["Sent", "pending"],
    ["Pending", "pending"],
    ["Blacklisted", "suppressed"],
    ["Undeliverable", "failed"],
    ["Rejected", "failed"],
    ["new-provider-state", "unknown"],
  ] as const;
  for (const [providerStatus, expected] of statuses) {
    const provider = createHubtelSmsProvider(
      config,
      () => Promise.resolve(Response.json({ status: providerStatus })),
    );
    const result = await provider.getStatus(
      "fab43849-6c5b-4334-a88b-d06520b1ace8",
    );
    assert(
      result.state === expected,
      `Incorrect mapping for ${providerStatus}`,
    );
  }
});

Deno.test("provider acceptance status must be zero", async () => {
  const provider = createHubtelSmsProvider(
    config,
    () =>
      Promise.resolve(Response.json({
        rate: 0.03,
        messageId: "fab43849-6c5b-4334-a88b-d06520b1ace8",
        status: 2,
      })),
  );
  let rejected = false;
  try {
    await provider.send({ toE164: "+233241234567", content: "Hello" });
  } catch (error) {
    rejected = error instanceof HubtelSmsError &&
      error.code === "HUBTEL_SMS_SUBMISSION_NOT_ACCEPTED";
  }
  assert(rejected, "Non-zero provider status must not be treated as accepted.");
});

Deno.test(
  "HTTP 429 and 5xx status lookups are retryable; auth errors are not",
  async () => {
    for (
      const [status, retryable] of [
        [429, true],
        [503, true],
        [401, false],
      ] as const
    ) {
      const provider = createHubtelSmsProvider(
        config,
        () => Promise.resolve(new Response("{}", { status })),
      );
      let actual: boolean | null = null;
      try {
        await provider.getStatus(
          "fab43849-6c5b-4334-a88b-d06520b1ace8",
        );
      } catch (error) {
        if (error instanceof HubtelSmsError) actual = error.retryable;
      }
      assert(
        actual === retryable,
        `Retry classification mismatch for ${status}`,
      );
    }
  },
);

Deno.test(
  "ambiguous send transport failure is not automatically retryable",
  async () => {
    const provider = createHubtelSmsProvider(config, () =>
      Promise.reject(
        new Error("simulated connection reset after request transmission"),
      )
    );
    let actual: HubtelSmsError | null = null;
    try {
      await provider.send({ toE164: "+233241234567", content: "Hello" });
    } catch (error) {
      if (error instanceof HubtelSmsError) actual = error;
    }
    assert(
      actual?.code === "HUBTEL_SMS_SUBMISSION_UNCERTAIN",
      "Ambiguous send must be marked uncertain.",
    );
    assert(
      actual.retryable === false,
      "Ambiguous send must not be auto-retried.",
    );
  },
);
