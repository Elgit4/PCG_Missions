const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 6 || normalized.length > 254 ||
    !EMAIL.test(normalized)
  ) return null;
  return normalized;
}

export function parseResetRequest(
  value: unknown,
): { ok: true; email: string } | { ok: false; error: string } {
  if (!object(value) || Object.keys(value).length !== 1 || !("email" in value)) {
    return { ok: false, error: "Enter the email address on the staff account." };
  }
  const email = normalizeEmail(value.email);
  if (!email) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, email };
}

export function parseBranchId(value: string | null): string | null {
  return value && UUID.test(value) ? value : null;
}

export function parseResetReview(
  value: unknown,
): { ok: true; branch_id: string; reason: string } | {
  ok: false;
  error: string;
} {
  if (!object(value)) return { ok: false, error: "A JSON object is required." };
  if (
    Object.keys(value).some((key) => key !== "branch_id" && key !== "reason")
  ) {
    return { ok: false, error: "Unsupported password-reset review field." };
  }
  if (typeof value.branch_id !== "string" || !UUID.test(value.branch_id)) {
    return { ok: false, error: "A valid branch_id is required." };
  }
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (reason.length < 10 || reason.length > 300) {
    return { ok: false, error: "Enter a review reason between 10 and 300 characters." };
  }
  return { ok: true, branch_id: value.branch_id, reason };
}

export function parseResetRequestId(value: string): string | null {
  return UUID.test(value) ? value : null;
}
