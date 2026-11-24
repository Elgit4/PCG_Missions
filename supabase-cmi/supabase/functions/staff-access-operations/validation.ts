const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set([
  "admin_pastor",
  "coordinator",
  "team_leader",
  "field_worker",
  "follow_up_volunteer",
  "prayer_intercessor",
]);
function obj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" &&
    (Object.getPrototypeOf(v) === Object.prototype ||
      Object.getPrototypeOf(v) === null);
}
function time(v: unknown): v is string {
  return typeof v === "string" && v.length <= 64 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i
      .test(v) &&
    Number.isFinite(Date.parse(v));
}
export interface RoleAssignmentInput {
  branch_id: string;
  staff_profile_id: string;
  role_code: string;
  starts_at: string;
  ends_at: string | null;
  reason: string;
}
export function parseRoleAssignment(
  v: unknown,
): { ok: true; value: RoleAssignmentInput } | { ok: false; error: string } {
  if (!obj(v)) return { ok: false, error: "A JSON object is required." };
  const allowed = new Set([
    "branch_id",
    "staff_profile_id",
    "role_code",
    "starts_at",
    "ends_at",
    "reason",
  ]);
  if (Object.keys(v).some((k) => !allowed.has(k))) {
    return { ok: false, error: "Unsupported role-assignment field." };
  }
  for (const k of ["branch_id", "staff_profile_id"]) {
    if (typeof v[k] !== "string" || !UUID.test(v[k] as string)) {
      return { ok: false, error: "Invalid " + k + "." };
    }
  }
  if (typeof v.role_code !== "string" || !ROLES.has(v.role_code)) {
    return { ok: false, error: "Invalid role_code." };
  }
  if (!time(v.starts_at)) {
    return { ok: false, error: "starts_at must include an explicit timezone." };
  }
  let ends: string | null = null;
  if (v.ends_at !== undefined && v.ends_at !== null && v.ends_at !== "") {
    if (!time(v.ends_at) || Date.parse(v.ends_at) <= Date.parse(v.starts_at)) {
      return {
        ok: false,
        error: "ends_at must be later than starts_at and include a timezone.",
      };
    }
    ends = new Date(Date.parse(v.ends_at)).toISOString();
  }
  const reason = typeof v.reason === "string" ? v.reason.trim() : "";
  if (reason.length < 10 || reason.length > 500) {
    return { ok: false, error: "reason must contain 10 to 500 characters." };
  }
  return {
    ok: true,
    value: {
      branch_id: v.branch_id as string,
      staff_profile_id: v.staff_profile_id as string,
      role_code: v.role_code,
      starts_at: new Date(Date.parse(v.starts_at)).toISOString(),
      ends_at: ends,
      reason,
    },
  };
}
export function parseAccessMutation(
  v: unknown,
): { ok: true; value: { branch_id: string; reason: string } } | {
  ok: false;
  error: string;
} {
  if (!obj(v)) return { ok: false, error: "A JSON object is required." };
  if (Object.keys(v).length !== 2 || !("branch_id" in v) || !("reason" in v)) {
    return { ok: false, error: "Only branch_id and reason are accepted." };
  }
  if (typeof v.branch_id !== "string" || !UUID.test(v.branch_id)) {
    return { ok: false, error: "Invalid branch_id." };
  }
  const reason = typeof v.reason === "string" ? v.reason.trim() : "";
  if (reason.length < 10 || reason.length > 500) {
    return { ok: false, error: "reason must contain 10 to 500 characters." };
  }
  return { ok: true, value: { branch_id: v.branch_id, reason } };
}
export function parsePathUuid(v: string): string | null {
  return UUID.test(v) ? v : null;
}
