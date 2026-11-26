export interface ArkeselSandboxEnvironment {
  ARKESEL_API_KEY?: string;
  ARKESEL_API_URL?: string;
}

export interface ArkeselSandboxRequest {
  sender: string;
  message: string;
  recipients: string[];
}

export type ArkeselSandboxResult =
  | { ok: true; provider: "arkesel"; messageIds: string[]; sandbox: true }
  | { ok: false; code: "CONFIGURATION_MISSING" | "INVALID_REQUEST" | "PROVIDER_REJECTED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_RESPONSE_INVALID"; retryable: boolean };

const DEFAULT_API_URL = "https://sms.arkesel.com/api/v2/sms/send";
const MAX_RECIPIENTS = 100;

export function normalizeGhanaPhoneNumber(input: string): string | null {
  const value = input.trim().replace(/[\s().-]/g, "");
  if (/^\+233[1-9]\d{8}$/.test(value)) return value;
  if (/^233[1-9]\d{8}$/.test(value)) return `+${value}`;
  if (/^0[1-9]\d{8}$/.test(value)) return `+233${value.slice(1)}`;
  return null;
}

function validSender(sender: string): boolean {
  return /^[A-Za-z0-9]{1,11}$/.test(sender);
}

function extractMessageIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const candidates = [record.message_id, record.messageId, record.id];
  const ids = candidates.filter((value): value is string | number =>
    typeof value === "string" || typeof value === "number",
  ).map(String);
  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const id = row.message_id ?? row.messageId ?? row.id;
        if (typeof id === "string" || typeof id === "number") ids.push(String(id));
      }
    }
  } else if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    const id = data.message_id ?? data.messageId ?? data.id;
    if (typeof id === "string" || typeof id === "number") ids.push(String(id));
  }
  return [...new Set(ids)].slice(0, MAX_RECIPIENTS);
}

/**
 * Sandbox-only transport. This deliberately has no live-send mode.
 * Do not automatically retry a failed/ambiguous provider response: the provider
 * may have accepted a request before the connection failed.
 */
export async function sendArkeselSandbox(
  env: ArkeselSandboxEnvironment,
  input: ArkeselSandboxRequest,
  fetcher: typeof fetch = fetch,
): Promise<ArkeselSandboxResult> {
  const apiKey = env.ARKESEL_API_KEY?.trim();
  if (!apiKey) return { ok: false, code: "CONFIGURATION_MISSING", retryable: false };

  if (
    !input || !validSender(input.sender) ||
    typeof input.message !== "string" || input.message.trim().length === 0 ||
    input.message.length > 1600 ||
    !Array.isArray(input.recipients) ||
    input.recipients.length === 0 || input.recipients.length > MAX_RECIPIENTS
  ) return { ok: false, code: "INVALID_REQUEST", retryable: false };

  const recipients = input.recipients.map(normalizeGhanaPhoneNumber);
  if (recipients.some((recipient) => recipient === null)) {
    return { ok: false, code: "INVALID_REQUEST", retryable: false };
  }

  const endpoint = env.ARKESEL_API_URL ?? DEFAULT_API_URL;
  let url: URL;
  try {
    url = new URL(endpoint);
    if (url.protocol !== "https:" || url.hostname !== "sms.arkesel.com") {
      return { ok: false, code: "CONFIGURATION_MISSING", retryable: false };
    }
  } catch {
    return { ok: false, code: "CONFIGURATION_MISSING", retryable: false };
  }

  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: input.sender,
        message: input.message,
        recipients,
        sandbox: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, code: "PROVIDER_UNAVAILABLE", retryable: false };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: response.status >= 500 || response.status === 429
        ? "PROVIDER_UNAVAILABLE"
        : "PROVIDER_REJECTED",
      retryable: false,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, code: "PROVIDER_RESPONSE_INVALID", retryable: false };
  }

  if (!payload || typeof payload !== "object") {
    return { ok: false, code: "PROVIDER_RESPONSE_INVALID", retryable: false };
  }

  const record = payload as Record<string, unknown>;
  const providerSaysSuccess =
    record.status === "success" ||
    record.success === true ||
    record.status === true ||
    record.code === "ok" ||
    record.code === 200 ||
    record.code === "200";

  if (!providerSaysSuccess) {
    return { ok: false, code: "PROVIDER_REJECTED", retryable: false };
  }

  return {
    ok: true,
    provider: "arkesel",
    messageIds: extractMessageIds(payload),
    sandbox: true,
  };
}
