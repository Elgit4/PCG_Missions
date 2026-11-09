const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;

export interface EventCreateInput {
  branch_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
}

export type EventPatchInput = Partial<
  Pick<
    EventCreateInput,
    "title" | "description" | "starts_at" | "ends_at" | "timezone" | "location"
  >
>;

export interface EventListQuery {
  branch_id: string;
  limit: number;
  offset: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

function parseText(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
  nullable = false,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return nullable
      ? { ok: true, value: null }
      : { ok: false, error: `Invalid ${field}.` };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `Invalid ${field}.` };
  }
  const normalized = value.trim();
  if (normalized === "" && nullable) return { ok: true, value: null };
  if (normalized.length < minLength || normalized.length > maxLength) {
    return { ok: false, error: `Invalid ${field}.` };
  }
  return { ok: true, value: normalized };
}

function parseTimestamp(
  value: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !ISO_WITH_OFFSET.test(value)) {
    return {
      ok: false,
      error: `${field} must be an ISO timestamp with an explicit timezone.`,
    };
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, error: `Invalid ${field}.` };
  }
  return { ok: true, value: new Date(timestamp).toISOString() };
}

function parseTimezone(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const parsed = parseText(value, "timezone", 3, 64);
  if (!parsed.ok || parsed.value === null) {
    return { ok: false, error: "Invalid timezone." };
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.value });
    return { ok: true, value: parsed.value };
  } catch {
    return { ok: false, error: "Invalid timezone." };
  }
}

function parseEventFields(
  value: Record<string, unknown>,
  requireDates: boolean,
): { ok: true; value: EventPatchInput } | { ok: false; error: string } {
  const result: EventPatchInput = {};

  if ("title" in value) {
    const parsed = parseText(value.title, "title", 2, 220);
    if (!parsed.ok || parsed.value === null) {
      return { ok: false, error: "Invalid title." };
    }
    result.title = parsed.value;
  } else if (requireDates) {
    return { ok: false, error: "A title is required." };
  }

  if ("description" in value) {
    const parsed = parseText(value.description, "description", 0, 12000, true);
    if (!parsed.ok) return parsed;
    result.description = parsed.value;
  }

  if ("starts_at" in value) {
    const parsed = parseTimestamp(value.starts_at, "starts_at");
    if (!parsed.ok) return parsed;
    result.starts_at = parsed.value;
  } else if (requireDates) {
    return { ok: false, error: "starts_at is required." };
  }

  if ("ends_at" in value) {
    const parsed = parseTimestamp(value.ends_at, "ends_at");
    if (!parsed.ok) return parsed;
    result.ends_at = parsed.value;
  } else if (requireDates) {
    return { ok: false, error: "ends_at is required." };
  }

  if ("timezone" in value) {
    const parsed = parseTimezone(value.timezone);
    if (!parsed.ok) return parsed;
    result.timezone = parsed.value;
  } else if (requireDates) {
    result.timezone = "Africa/Accra";
  }

  if ("location" in value) {
    const parsed = parseText(value.location, "location", 0, 250, true);
    if (!parsed.ok) return parsed;
    result.location = parsed.value;
  }

  if (
    result.starts_at && result.ends_at &&
    Date.parse(result.ends_at) <= Date.parse(result.starts_at)
  ) {
    return { ok: false, error: "ends_at must be later than starts_at." };
  }

  return { ok: true, value: result };
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseEventCreate(
  value: unknown,
): { ok: true; value: EventCreateInput } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }

  const allowed = new Set([
    "branch_id",
    "title",
    "description",
    "starts_at",
    "ends_at",
    "timezone",
    "location",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported event field." };
  }
  if (typeof value.branch_id !== "string" || !UUID_PATTERN.test(value.branch_id)) {
    return { ok: false, error: "Invalid branch_id." };
  }

  const parsed = parseEventFields(value, true);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    value: {
      branch_id: value.branch_id,
      title: parsed.value.title!,
      description: parsed.value.description ?? null,
      starts_at: parsed.value.starts_at!,
      ends_at: parsed.value.ends_at!,
      timezone: parsed.value.timezone ?? "Africa/Accra",
      location: parsed.value.location ?? null,
    },
  };
}

export function parseEventPatch(
  value: unknown,
): { ok: true; value: EventPatchInput } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set([
    "title",
    "description",
    "starts_at",
    "ends_at",
    "timezone",
    "location",
  ]);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported or empty event update." };
  }
  return parseEventFields(value, false);
}

export function parseEventListQuery(
  url: URL,
): { ok: true; value: EventListQuery } | { ok: false; error: string } {
  const allowed = new Set(["branch_id", "limit", "offset"]);
  const seen = new Set<string>();
  for (const [key] of url.searchParams) {
    if (!allowed.has(key)) {
      return { ok: false, error: "Unsupported query parameter." };
    }
    if (seen.has(key)) {
      return { ok: false, error: "Duplicate query parameter." };
    }
    seen.add(key);
  }

  const branchId = url.searchParams.get("branch_id") ?? "";
  if (!UUID_PATTERN.test(branchId)) {
    return { ok: false, error: "Invalid branch_id." };
  }

  const limitValue = url.searchParams.get("limit");
  const offsetValue = url.searchParams.get("offset");
  const limit = limitValue === null ? 25 : Number(limitValue);
  const offset = offsetValue === null ? 0 : Number(offsetValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, error: "Limit must be an integer from 1 to 50." };
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) {
    return { ok: false, error: "Offset must be an integer from 0 to 5000." };
  }

  return { ok: true, value: { branch_id: branchId, limit, offset } };
}
