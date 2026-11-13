const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function text(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
  allowEmpty = false,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Invalid " + field + "." };
  }
  const normalized = value.trim();
  if (
    normalized.length > maxLength ||
    (!allowEmpty && normalized.length < minLength)
  ) return { ok: false, error: "Invalid " + field + "." };
  return { ok: true, value: normalized };
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  const parsed = text(value, field, 0, maxLength, true);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value || null };
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export interface TeamCreateInput {
  branch_id: string;
  name: string;
  description: string | null;
}
export function parseTeamCreate(
  value: unknown,
): { ok: true; value: TeamCreateInput } | { ok: false; error: string } {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["branch_id", "name", "description"])
  ) {
    return { ok: false, error: "A team name and valid branch are required." };
  }
  if (!isUuid(value.branch_id)) {
    return { ok: false, error: "Invalid branch_id." };
  }
  const name = text(value.name, "name", 2, 160);
  if (!name.ok) return name;
  const description = optionalText(value.description, "description", 1000);
  if (!description.ok) return description;
  return {
    ok: true,
    value: {
      branch_id: value.branch_id,
      name: name.value,
      description: description.value,
    },
  };
}

export interface TeamPatchInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}
export function parseTeamPatch(
  value: unknown,
): { ok: true; value: TeamPatchInput } | { ok: false; error: string } {
  if (
    !isRecord(value) || Object.keys(value).length === 0 ||
    !hasOnlyKeys(value, ["name", "description", "is_active"])
  ) {
    return { ok: false, error: "Provide at least one valid team update." };
  }
  const result: TeamPatchInput = {};
  if (Object.hasOwn(value, "name")) {
    const name = text(value.name, "name", 2, 160);
    if (!name.ok) return name;
    result.name = name.value;
  }
  if (Object.hasOwn(value, "description")) {
    const description = optionalText(value.description, "description", 1000);
    if (!description.ok) return description;
    result.description = description.value;
  }
  if (Object.hasOwn(value, "is_active")) {
    if (typeof value.is_active !== "boolean") {
      return { ok: false, error: "is_active must be a boolean." };
    }
    result.is_active = value.is_active;
  }
  return { ok: true, value: result };
}

export type MembershipRole = "member" | "leader";
export interface TeamMemberCreateInput {
  staff_profile_id: string;
  membership_role: MembershipRole;
}
export function parseTeamMemberCreate(
  value: unknown,
): { ok: true; value: TeamMemberCreateInput } | { ok: false; error: string } {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["staff_profile_id", "membership_role"])
  ) {
    return { ok: false, error: "Choose a staff member and membership role." };
  }
  if (!isUuid(value.staff_profile_id)) {
    return { ok: false, error: "Invalid staff profile." };
  }
  const membershipRole = value.membership_role ?? "member";
  if (membershipRole !== "member" && membershipRole !== "leader") {
    return { ok: false, error: "Membership role must be member or leader." };
  }
  return {
    ok: true,
    value: {
      staff_profile_id: value.staff_profile_id,
      membership_role: membershipRole,
    },
  };
}

export interface TeamMemberRoleInput {
  membership_role: MembershipRole;
}
export function parseTeamMemberRole(
  value: unknown,
): { ok: true; value: TeamMemberRoleInput } | { ok: false; error: string } {
  if (
    !isRecord(value) || Object.keys(value).length !== 1 ||
    !hasOnlyKeys(value, ["membership_role"])
  ) {
    return { ok: false, error: "A membership role is required." };
  }
  if (
    value.membership_role !== "member" && value.membership_role !== "leader"
  ) {
    return { ok: false, error: "Membership role must be member or leader." };
  }
  return { ok: true, value: { membership_role: value.membership_role } };
}

export interface ServiceAreaCreateInput {
  branch_id: string;
  name: string;
  code: string | null;
}
export function parseServiceAreaCreate(
  value: unknown,
): { ok: true; value: ServiceAreaCreateInput } | { ok: false; error: string } {
  if (!isRecord(value) || !hasOnlyKeys(value, ["branch_id", "name", "code"])) {
    return {
      ok: false,
      error: "A service-area name and valid branch are required.",
    };
  }
  if (!isUuid(value.branch_id)) {
    return { ok: false, error: "Invalid branch_id." };
  }
  const name = text(value.name, "name", 2, 160);
  if (!name.ok) return name;
  const code = optionalText(value.code, "code", 24);
  if (!code.ok) return code;
  const normalizedCode = code.value?.toUpperCase() ?? null;
  if (normalizedCode !== null && !/^[A-Z0-9_-]{2,24}$/.test(normalizedCode)) {
    return {
      ok: false,
      error:
        "Code must contain 2–24 uppercase letters, numbers, hyphens or underscores.",
    };
  }
  return {
    ok: true,
    value: {
      branch_id: value.branch_id,
      name: name.value,
      code: normalizedCode,
    },
  };
}

export interface ServiceAreaPatchInput {
  name?: string;
  code?: string | null;
  is_active?: boolean;
}
export function parseServiceAreaPatch(
  value: unknown,
): { ok: true; value: ServiceAreaPatchInput } | { ok: false; error: string } {
  if (
    !isRecord(value) || Object.keys(value).length === 0 ||
    !hasOnlyKeys(value, ["name", "code", "is_active"])
  ) {
    return {
      ok: false,
      error: "Provide at least one valid service-area update.",
    };
  }
  const result: ServiceAreaPatchInput = {};
  if (Object.hasOwn(value, "name")) {
    const name = text(value.name, "name", 2, 160);
    if (!name.ok) return name;
    result.name = name.value;
  }
  if (Object.hasOwn(value, "code")) {
    const code = optionalText(value.code, "code", 24);
    if (!code.ok) return code;
    const normalizedCode = code.value?.toUpperCase() ?? null;
    if (normalizedCode !== null && !/^[A-Z0-9_-]{2,24}$/.test(normalizedCode)) {
      return {
        ok: false,
        error:
          "Code must contain 2–24 uppercase letters, numbers, hyphens or underscores.",
      };
    }
    result.code = normalizedCode;
  }
  if (Object.hasOwn(value, "is_active")) {
    if (typeof value.is_active !== "boolean") {
      return { ok: false, error: "is_active must be a boolean." };
    }
    result.is_active = value.is_active;
  }
  return { ok: true, value: result };
}

export interface AreaCoverageCreateInput {
  staff_profile_id: string;
}
export function parseAreaCoverageCreate(
  value: unknown,
): { ok: true; value: AreaCoverageCreateInput } | { ok: false; error: string } {
  if (
    !isRecord(value) || Object.keys(value).length !== 1 ||
    !hasOnlyKeys(value, ["staff_profile_id"]) || !isUuid(value.staff_profile_id)
  ) {
    return { ok: false, error: "Choose an active staff member." };
  }
  return { ok: true, value: { staff_profile_id: value.staff_profile_id } };
}
