const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AnnouncementCreateInput {
  branch_id: string;
  title: string;
  body: string;
}

export type AnnouncementPatchInput = Partial<
  Pick<AnnouncementCreateInput, "title" | "body">
>;

export interface AnnouncementListQuery {
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

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseAnnouncementCreate(
  value: unknown,
): { ok: true; value: AnnouncementCreateInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }

  const allowed = new Set(["branch_id", "title", "body"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported announcement field." };
  }
  if (
    typeof value.branch_id !== "string" ||
    !UUID_PATTERN.test(value.branch_id)
  ) {
    return { ok: false, error: "Invalid branch_id." };
  }

  const title = parseText(value.title, "title", 2, 220);
  if (!title.ok) return title;

  const body = parseText(value.body, "body", 1, 20_000);
  if (!body.ok) return body;

  return {
    ok: true,
    value: {
      branch_id: value.branch_id,
      title: title.value,
      body: body.value,
    },
  };
}

export function parseAnnouncementPatch(
  value: unknown,
): { ok: true; value: AnnouncementPatchInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }

  const allowed = new Set(["title", "body"]);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return {
      ok: false,
      error: "Unsupported or empty announcement update.",
    };
  }

  const result: AnnouncementPatchInput = {};
  if ("title" in value) {
    const title = parseText(value.title, "title", 2, 220);
    if (!title.ok) return title;
    result.title = title.value;
  }
  if ("body" in value) {
    const body = parseText(value.body, "body", 1, 20_000);
    if (!body.ok) return body;
    result.body = body.value;
  }

  return { ok: true, value: result };
}

export function parseAnnouncementListQuery(
  url: URL,
): { ok: true; value: AnnouncementListQuery } | {
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

  const branchId = url.searchParams.get("branch_id") ?? "";
  if (!UUID_PATTERN.test(branchId)) {
    return { ok: false, error: "Invalid branch_id." };
  }

  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, error: "Limit must be an integer from 1 to 50." };
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) {
    return { ok: false, error: "Offset must be an integer from 0 to 5000." };
  }

  return {
    ok: true,
    value: { branch_id: branchId, limit, offset },
  };
}
