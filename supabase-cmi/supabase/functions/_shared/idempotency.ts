/**
 * Server-only helpers for event mutation idempotency.
 *
 * Callers must pass an already validated, normalized request envelope that
 * includes operation, event, branch, caller class, trusted actor (when staff),
 * and every field that can change the mutation. Never pass raw request bodies.
 */

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

export interface RequestDigest {
  algorithm: "hmac-sha-256";
  keyVersion: number;
  digestHex: string;
}

function canonicalize(value: unknown, ancestors = new WeakSet<object>()): string {
  if (value === null) return "null";

  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "boolean") return value ? "true" : "false";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not allow non-finite numbers.");
    }
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Circular values are not supported.");
    ancestors.add(value);
    const result = `[${Array.from(value, (item) => canonicalize(item, ancestors)).join(",")}]`;
    ancestors.delete(value);
    return result;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Only plain JSON objects are supported.");
    }
    if (ancestors.has(record)) throw new TypeError("Circular values are not supported.");
    ancestors.add(record);

    const keys = Object.keys(record).sort();
    const normalizedKeys = new Set<string>();
    for (const key of keys) {
      const normalizedKey = key.normalize("NFC");
      if (normalizedKeys.has(normalizedKey)) {
        throw new TypeError("Object keys collide after Unicode normalization.");
      }
      normalizedKeys.add(normalizedKey);
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new TypeError("Unsafe object key.");
      }
      if (record[key] === undefined) {
        throw new TypeError("Undefined values are not supported.");
      }
    }

    const result = `{${keys.map((key) =>
      `${JSON.stringify(key.normalize("NFC"))}:${canonicalize(record[key], ancestors)}`
    ).join(",")}}`;
    ancestors.delete(record);
    return result;
  }

  throw new TypeError("Value is not canonical JSON.");
}

/** Stable JSON serialization: object keys are sorted; array order is retained. */
export function canonicalJson(value: CanonicalJson): string {
  return canonicalize(value);
}

/**
 * HMAC-SHA-256 over a validated canonical request envelope.
 * The secret must be supplied from server-side secret management.
 */
export async function createRequestDigest(
  payload: CanonicalJson,
  secret: string,
  keyVersion: number,
): Promise<RequestDigest> {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new TypeError("HMAC key version must be a positive safe integer.");
  }

  const secretBytes = new TextEncoder().encode(secret);
  if (secretBytes.byteLength < 32) {
    throw new TypeError("HMAC secret must contain at least 32 UTF-8 bytes.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonicalJson(payload)),
  );

  const digestHex = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return { algorithm: "hmac-sha-256", keyVersion, digestHex };
}

/** Compares two SHA-256 hex digests without an early exit on differing bytes. */
export function equalDigestHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  let difference = 0;
  for (let index = 0; index < 64; index++) {
    difference |= normalizedLeft.charCodeAt(index) ^ normalizedRight.charCodeAt(index);
  }
  return difference === 0;
}
