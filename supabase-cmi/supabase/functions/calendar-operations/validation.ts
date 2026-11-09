const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
const ENTRY_TYPES = new Set(["service", "event", "other"]);

export interface CalendarListQuery {
  branch_id: string;
  limit: number;
  offset: number;
}

export interface CalendarCreateInput {
  branch_id: string;
  entry_type: "service" | "event" | "other";
  title: string;
  starts_at: string;
  ends_at: string | null;
}

export type CalendarPatchInput = Partial<
  Pick<CalendarCreateInput, "entry_type" | "title" | "starts_at" | "ends_at">
>;

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
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: `Invalid ${field}.` };
  }
  const normalized = value.trim();
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

function validEntryType(value: unknown): value is "service" | "event" | "other" {
  return typeof value === "string" && ENTRY_TYPES.has(value);
}

function parseBranchId(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return { ok: false, error: "Invalid branch_id." };
  }
  return { ok: true, value };
}

function validTimeRange(
  startsAt: string,
  endsAt: string | null,
): boolean {
  return endsAt === null || Date.parse(endsAt) > Date.parse(startsAt);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseCalendarListQuery(
  url: URL,
): { ok: true; value: CalendarListQuery } | {
  ok: false;
  error: string;
} {
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

  const branch = parseBranchId(url.searchParams.get("branch_id"));
  if (!branch.ok) return branch;

  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "Limit must be an integer from 1 to 100." };
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) {
    return { ok: false, error: "Offset must be an integer from 0 to 10000." };
  }

  return {
    ok: true,
    value: { branch_id: branch.value, limit, offset },
  };
}

export function parseCalendarCreate(
  value: unknown,
): { ok: true; value: CalendarCreateInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set([
    "branch_id",
    "entry_type",
    "title",
    "starts_at",
    "ends_at",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported calendar field." };
  }

  const branch = parseBranchId(value.branch_id);
  if (!branch.ok) return branch;
  if (!validEntryType(value.entry_type)) {
    return {
      ok: false,
      error: "entry_type must be service, event or other.",
    };
  }
  const title = parseText(value.title, "title", 2, 220);
  if (!title.ok) return title;
  const starts = parseTimestamp(value.starts_at, "starts_at");
  if (!starts.ok) return starts;

  let endsAt: string | null = null;
  if (value.ends_at !== undefined && value.ends_at !== null) {
    const ends = parseTimestamp(value.ends_at, "ends_at");
    if (!ends.ok) return ends;
    endsAt = ends.value;
  }
  if (!validTimeRange(starts.value, endsAt)) {
    return { ok: false, error: "ends_at must be later than starts_at." };
  }

  return {
    ok: true,
    value: {
      branch_id: branch.value,
      entry_type: value.entry_type,
      title: title.value,
      starts_at: starts.value,
      ends_at: endsAt,
    },
  };
}

export function parseCalendarPatch(
  value: unknown,
  currentStartsAt: string,
  currentEndsAt: string | null,
): { ok: true; value: CalendarPatchInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set(["entry_type", "title", "starts_at", "ends_at"]);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported or empty calendar update." };
  }

  const result: CalendarPatchInput = {};
  if ("entry_type" in value) {
    if (!validEntryType(value.entry_type)) {
      return {
        ok: false,
        error: "entry_type must be service, event or other.",
      };
    }
    result.entry_type = value.entry_type;
  }
  if ("title" in value) {
    const title = parseText(value.title, "title", 2, 220);
    if (!title.ok) return title;
    result.title = title.value;
  }

  let startsAt = currentStartsAt;
  let endsAt = currentEndsAt;
  if ("starts_at" in value) {
    const starts = parseTimestamp(value.starts_at, "starts_at");
    if (!starts.ok) return starts;
    startsAt = starts.value;
    result.starts_at = starts.value;
  }
  if ("ends_at" in value) {
    if (value.ends_at === null) {
      endsAt = null;
      result.ends_at = null;
    } else {
      const ends = parseTimestamp(value.ends_at, "ends_at");
      if (!ends.ok) return ends;
      endsAt = ends.value;
      result.ends_at = ends.value;
    }
  }
  if (!validTimeRange(startsAt, endsAt)) {
    return { ok: false, error: "ends_at must be later than starts_at." };
  }

  return { ok: true, value: result };
}
