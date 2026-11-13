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
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError("Only plain JSON arrays are supported.");
    }
    if (ancestors.has(value)) throw new TypeError("Circular values are not supported.");

    ancestors.add(value);
    try {
      const keys = Reflect.ownKeys(value);
      for (const key of keys) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) {
          throw new TypeError("JSON arrays cannot contain extra or symbol properties.");
        }

        const index = Number(key);
        if (!Number.isSafeInteger(index) || index >= value.length) {
          throw new TypeError("JSON arrays cannot contain extra properties.");
        }

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("JSON arrays must contain enumerable data properties.");
        }
      }

      const items: string[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("Sparse arrays and accessor properties are not supported.");
        }
        items.push(canonicalize(descriptor.value, ancestors));
      }
      return `[${items.join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Only plain JSON objects are supported.");
    }
    if (ancestors.has(record)) throw new TypeError("Circular values are not supported.");

    ancestors.add(record);
    try {
      const ownKeys = Reflect.ownKeys(record);
      const entries: Array<{ key: string; value: unknown }> = [];
      const normalizedKeys = new Set<string>();

      for (const ownKey of ownKeys) {
        if (typeof ownKey !== "string") {
          throw new TypeError("Symbol properties are not supported.");
        }

        const descriptor = Object.getOwnPropertyDescriptor(record, ownKey);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("JSON objects must contain enumerable data properties.");
        }

        const normalizedKey = ownKey.normalize("NFC");
        if (normalizedKeys.has(normalizedKey)) {
          throw new TypeError("Object keys collide after Unicode normalization.");
        }
        normalizedKeys.add(normalizedKey);

        if (
          normalizedKey === "__proto__" ||
          normalizedKey === "constructor" ||
          normalizedKey === "prototype"
        ) {
          throw new TypeError("Unsafe object key.");
        }

        entries.push({ key: normalizedKey, value: descriptor.value });
      }

      // Sort after normalization so canonically equivalent keys yield one digest.
      entries.sort((left, right) =>
        left.key < right.key ? -1 : left.key > right.key ? 1 : 0
      );

      const fields = entries.map(({ key, value: fieldValue }) =>
        `${JSON.stringify(key)}:${canonicalize(fieldValue, ancestors)}`
      );
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(record);
    }
  }

  throw new TypeError("Value is not canonical JSON.");
}

/** Stable JSON serialization: normalized object keys are sorted; array order is retained. */
export function canonicalJson(value: CanonicalJson): string {
  return canonicalize(value);
}

/**
 * Derives a purpose-separated idempotency HMAC key from an existing server-only
 * master secret. Dedicated CMI_*_IDEMPOTENCY_HMAC_KEY values remain preferred;
 * this fallback lets existing installations use the already-required Supabase
 * service-role secret without introducing another manual secret dependency.
 *
 * The purpose string is part of HKDF info, so contact and follow-up digests
 * cannot be correlated or substituted. If the master secret is rotated, bump
 * the corresponding persisted key version before accepting new writes.
 */
export async function deriveIdempotencySecret(
  masterSecret: string,
  purpose: "contact" | "followup",
): Promise<string> {
  const masterBytes = new TextEncoder().encode(masterSecret);
  if (masterBytes.byteLength < 32) {
    throw new TypeError("Idempotency master secret must contain at least 32 UTF-8 bytes.");
  }

  const material = await crypto.subtle.importKey(
    "raw",
    masterBytes,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("PCG-Missions-CMI-idempotency-v1"),
      info: new TextEncoder().encode("staff-operations:" + purpose),
    },
    material,
    256,
  );
  return Array.from(new Uint8Array(bits), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
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
