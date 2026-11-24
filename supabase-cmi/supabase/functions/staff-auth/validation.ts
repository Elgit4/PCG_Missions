const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (
    !object(value) || Object.keys(value).length !== 1 || !("email" in value)
  ) {
    return {
      ok: false,
      error: "Enter the email address on the staff account.",
    };
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
    return {
      ok: false,
      error: "Enter a review reason between 10 and 300 characters.",
    };
  }
  return { ok: true, branch_id: value.branch_id, reason };
}

export function parseResetRequestId(value: string): string | null {
  return UUID.test(value) ? value : null;
}

export function parsePasswordChange(
  value: unknown,
): { ok: true; password: string } | { ok: false; error: string } {
  if (
    !object(value) || Object.keys(value).length !== 1 || !("password" in value)
  ) {
    return { ok: false, error: "A new password is required." };
  }
  if (
    typeof value.password !== "string" ||
    value.password.length < 12 ||
    value.password.length > 128 ||
    !/[a-z]/.test(value.password) ||
    !/[A-Z]/.test(value.password) ||
    !/[0-9]/.test(value.password)
  ) {
    return {
      ok: false,
      error: "Use 12–128 characters with uppercase, lowercase and a number.",
    };
  }
  return { ok: true, password: value.password };
}

const STAFF_ROLES = new Set([
  "admin_pastor",
  "coordinator",
  "team_leader",
  "field_worker",
  "follow_up_volunteer",
  "prayer_intercessor",
]);

export interface StaffAccountCreateInput {
  branch_id: string;
  full_name: string;
  email: string;
  role_code: string;
  reason: string;
}

export function parseStaffAccountCreate(
  value: unknown,
): { ok: true; value: StaffAccountCreateInput } | { ok: false; error: string } {
  if (!object(value)) return { ok: false, error: "A JSON object is required." };
  const allowed = new Set([
    "branch_id",
    "full_name",
    "email",
    "role_code",
    "reason",
  ]);
  if (
    Object.keys(value).length !== allowed.size ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    return {
      ok: false,
      error: "Provide branch, name, email, role and reason.",
    };
  }
  const branchId = parseBranchId(
    typeof value.branch_id === "string" ? value.branch_id : null,
  );
  const email = normalizeEmail(value.email);
  const fullName = typeof value.full_name === "string"
    ? value.full_name.trim()
    : "";
  const roleCode = typeof value.role_code === "string" ? value.role_code : "";
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (!branchId) return { ok: false, error: "A valid branch_id is required." };
  if (fullName.length < 2 || fullName.length > 180) {
    return { ok: false, error: "full_name must contain 2 to 180 characters." };
  }
  if (!email) return { ok: false, error: "Enter a valid email address." };
  if (!STAFF_ROLES.has(roleCode)) {
    return { ok: false, error: "Choose one of the six approved staff roles." };
  }
  if (reason.length < 10 || reason.length > 500) {
    return { ok: false, error: "reason must contain 10 to 500 characters." };
  }
  return {
    ok: true,
    value: {
      branch_id: branchId,
      full_name: fullName,
      email,
      role_code: roleCode,
      reason,
    },
  };
}
