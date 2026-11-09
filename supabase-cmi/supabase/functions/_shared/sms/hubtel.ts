/**
 * Hubtel Business SMS adapter for the CMI transactional outbox.
 *
 * This module is deliberately not an HTTP endpoint. Only a trusted server-side
 * dispatcher may import it after it has completed database authorization,
 * recipient eligibility, campaign approval, consent/suppression and budget
 * checks. Credentials are read only from Edge Function secrets.
 */
export type SmsDeliveryState =
  | "accepted"
  | "pending"
  | "delivered"
  | "failed"
  | "suppressed"
  | "unknown";

export interface HubtelSmsConfig {
  clientId: string;
  clientSecret: string;
  senderId: string;
  liveEnabled: boolean;
}

export interface HubtelSmsSubmission {
  toE164: string;
  content: string;
}

export interface HubtelSmsSubmissionResult {
  state: "accepted";
  provider: "hubtel";
  providerMessageId: string;
  providerStatus: number;
  providerRate: number | null;
  providerNetworkId: string | null;
  acceptedAt: string;
}

export interface HubtelSmsStatusResult {
  provider: "hubtel";
  providerMessageId: string;
  state: SmsDeliveryState;
  providerStatus: string;
  checkedAt: string;
}

export class HubtelSmsError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus: number | null;

  constructor(
    code: string,
    retryable: boolean,
    httpStatus: number | null = null,
  ) {
    super(code);
    this.name = "HubtelSmsError";
    this.code = code;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

const BASE_URL = "https://sms.hubtel.com/v1/messages";
const E164 = /^\+[1-9][0-9]{7,14}$/;
const SENDER = /^[A-Za-z0-9]{1,11}$/;
const MESSAGE_ID = /^[A-Za-z0-9-]{8,80}$/;

function basicAuthorization(config: HubtelSmsConfig): string {
  return `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  return value as Record<string, unknown>;
}

function mapDeliveryState(value: string): SmsDeliveryState {
  switch (value.trim().toLowerCase()) {
    case "delivered":
      return "delivered";
    case "pending":
    case "sent":
      return "pending";
    case "blacklisted":
      return "suppressed";
    case "undeliverable":
    case "failed":
    case "unrouteable":
    case "error":
    case "rejected":
    case "expired":
      return "failed";
    default:
      return "unknown";
  }
}

export function validateHubtelSmsConfig(
  config: HubtelSmsConfig,
): void {
  if (
    !config.clientId.trim() || !config.clientSecret.trim() ||
    !SENDER.test(config.senderId)
  ) {
    throw new HubtelSmsError("HUBTEL_SMS_CONFIGURATION_INVALID", false);
  }
}

export function hubtelSmsConfigFromEnvironment(): HubtelSmsConfig {
  return {
    clientId: Deno.env.get("HUBTEL_SMS_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("HUBTEL_SMS_CLIENT_SECRET") ?? "",
    senderId: Deno.env.get("HUBTEL_SMS_SENDER_ID") ?? "",
    // Live transmission is opt-in at deployment time. Missing/other values
    // always leave the provider in disabled mode.
    liveEnabled: Deno.env.get("CMI_SMS_LIVE_ENABLED") === "true",
  };
}

export function createHubtelSmsProvider(
  config: HubtelSmsConfig,
  fetcher: typeof fetch = fetch,
) {
  validateHubtelSmsConfig(config);

  async function request(
    url: string,
    init: RequestInit,
    safeToRetry: boolean,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(12_000),
        headers: {
          Authorization: basicAuthorization(config),
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch {
      throw new HubtelSmsError(
        safeToRetry
          ? "HUBTEL_SMS_STATUS_LOOKUP_NETWORK_ERROR"
          : "HUBTEL_SMS_SUBMISSION_UNCERTAIN",
        safeToRetry,
      );
    }

    if (!response.ok) {
      // A failed send may have reached the provider even when the response
      // was lost. Never auto-retry a submission without a provider idempotency
      // contract; status lookups are safe to retry.
      const retryable = safeToRetry && (
        response.status === 408 || response.status === 425 ||
        response.status === 429 || response.status >= 500
      );
      const code = response.status === 401
        ? "HUBTEL_SMS_AUTHENTICATION_FAILED"
        : response.status === 402
        ? "HUBTEL_SMS_INSUFFICIENT_CREDIT"
        : response.status === 403
        ? "HUBTEL_SMS_RECIPIENT_OR_ACCOUNT_FORBIDDEN"
        : response.status === 404
        ? "HUBTEL_SMS_MESSAGE_NOT_FOUND"
        : !safeToRetry && response.status >= 500
        ? "HUBTEL_SMS_SUBMISSION_UNCERTAIN"
        : retryable
        ? "HUBTEL_SMS_PROVIDER_TEMPORARY_FAILURE"
        : "HUBTEL_SMS_PROVIDER_REJECTED";
      throw new HubtelSmsError(code, retryable, response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HubtelSmsError(
        "HUBTEL_SMS_INVALID_PROVIDER_RESPONSE",
        safeToRetry,
      );
    }
    const object = parseObject(payload);
    if (!object) {
      throw new HubtelSmsError("HUBTEL_SMS_INVALID_PROVIDER_RESPONSE", true);
    }
    return object;
  }

  return {
    async send(
      input: HubtelSmsSubmission,
    ): Promise<HubtelSmsSubmissionResult> {
      if (!config.liveEnabled) {
        throw new HubtelSmsError("HUBTEL_SMS_LIVE_DISPATCH_DISABLED", false);
      }
      if (!E164.test(input.toE164)) {
        throw new HubtelSmsError("HUBTEL_SMS_INVALID_RECIPIENT", false);
      }
      const content = input.content.trim();
      if (!content) {
        throw new HubtelSmsError("HUBTEL_SMS_INVALID_CONTENT", false);
      }

      // Hubtel's business API expects digits without the leading plus.
      const payload = await request(
        `${BASE_URL}/send`,
        {
        method: "POST",
        body: JSON.stringify({
          From: config.senderId,
          To: input.toE164.slice(1),
          Content: content,
        }),
        },
        false,
      );

      const status = Number(payload.status);
      const messageId = typeof payload.messageId === "string"
        ? payload.messageId
        : "";
      if (status !== 0 || !MESSAGE_ID.test(messageId)) {
        throw new HubtelSmsError(
        "HUBTEL_SMS_SUBMISSION_NOT_ACCEPTED",
        false,
      );
      }

      const rate = typeof payload.rate === "number" &&
          Number.isFinite(payload.rate) && payload.rate >= 0
        ? payload.rate
        : null;
      const networkId = typeof payload.networkId === "string"
        ? payload.networkId.slice(0, 32)
        : null;

      return {
        state: "accepted",
        provider: "hubtel",
        providerMessageId: messageId,
        providerStatus: status,
        providerRate: rate,
        providerNetworkId: networkId,
        acceptedAt: new Date().toISOString(),
      };
    },

    async getStatus(
      providerMessageId: string,
    ): Promise<HubtelSmsStatusResult> {
      if (!MESSAGE_ID.test(providerMessageId)) {
        throw new HubtelSmsError(
          "HUBTEL_SMS_INVALID_MESSAGE_ID",
          false,
        );
      }
      const payload = await request(
        `${BASE_URL}/${encodeURIComponent(providerMessageId)}`,
        { method: "GET" },
        true,
      );
      const rawStatus = typeof payload.status === "string"
        ? payload.status
        : typeof payload.statusDescription === "string"
        ? payload.statusDescription
        : "unknown";
      return {
        provider: "hubtel",
        providerMessageId,
        state: mapDeliveryState(rawStatus),
        providerStatus: rawStatus.slice(0, 48),
        checkedAt: new Date().toISOString(),
      };
    },
  };
}
