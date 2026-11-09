const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ContentListQuery {
  branch_id: string;
  limit: number;
  offset: number;
}

export interface SermonCreateInput {
  branch_id: string;
  title: string;
  body: string;
  public_slug: string;
}

export interface WelcomeMessageCreateInput {
  branch_id: string;
  title: string;
  body: string;
  display_order: number;
}

export type SermonPatchInput = Partial<
  Pick<SermonCreateInput, "title" | "body" | "public_slug">
>;
export type WelcomeMessagePatchInput = Partial<
  Pick<WelcomeMessageCreateInput, "title" | "body" | "display_order">
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
  if (
    normalized.length < minLength ||
    normalized.length > maxLength
  ) {
    return { ok: false, error: `Invalid ${field}.` };
  }
  return { ok: true, value: normalized };
}

function parseBranchId(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return { ok: false, error: "Invalid branch_id." };
  }
  return { ok: true, value };
}

function parseDisplayOrder(
  value: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10000
  ) {
    return {
      ok: false,
      error: "display_order must be an integer from 0 to 10000.",
    };
  }
  return { ok: true, value };
}

function parseSlug(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const parsed = parseText(value, "public_slug", 1, 120);
  if (!parsed.ok) return parsed;
  if (!SLUG_PATTERN.test(parsed.value)) {
    return {
      ok: false,
      error:
        "public_slug must contain lowercase letters, numbers and single hyphens.",
    };
  }
  return parsed;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseContentListQuery(
  url: URL,
): { ok: true; value: ContentListQuery } | {
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

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, error: "Limit must be an integer from 1 to 50." };
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) {
    return { ok: false, error: "Offset must be an integer from 0 to 5000." };
  }

  return {
    ok: true,
    value: { branch_id: branch.value, limit, offset },
  };
}

export function parseSermonCreate(
  value: unknown,
): { ok: true; value: SermonCreateInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set(["branch_id", "title", "body", "public_slug"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported sermon field." };
  }

  const branch = parseBranchId(value.branch_id);
  if (!branch.ok) return branch;
  const title = parseText(value.title, "title", 2, 220);
  if (!title.ok) return title;
  const body = parseText(value.body, "body", 1, 30000);
  if (!body.ok) return body;
  const slug = parseSlug(value.public_slug);
  if (!slug.ok) return slug;

  return {
    ok: true,
    value: {
      branch_id: branch.value,
      title: title.value,
      body: body.value,
      public_slug: slug.value,
    },
  };
}

export function parseSermonPatch(
  value: unknown,
): { ok: true; value: SermonPatchInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set(["title", "body", "public_slug"]);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported or empty sermon update." };
  }

  const result: SermonPatchInput = {};
  if ("title" in value) {
    const title = parseText(value.title, "title", 2, 220);
    if (!title.ok) return title;
    result.title = title.value;
  }
  if ("body" in value) {
    const body = parseText(value.body, "body", 1, 30000);
    if (!body.ok) return body;
    result.body = body.value;
  }
  if ("public_slug" in value) {
    const slug = parseSlug(value.public_slug);
    if (!slug.ok) return slug;
    result.public_slug = slug.value;
  }

  return { ok: true, value: result };
}

export function parseWelcomeMessageCreate(
  value: unknown,
): { ok: true; value: WelcomeMessageCreateInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set([
    "branch_id",
    "title",
    "body",
    "display_order",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported welcome-message field." };
  }

  const branch = parseBranchId(value.branch_id);
  if (!branch.ok) return branch;
  const title = parseText(value.title, "title", 2, 220);
  if (!title.ok) return title;
  const body = parseText(value.body, "body", 1, 12000);
  if (!body.ok) return body;
  const order = value.display_order === undefined
    ? { ok: true as const, value: 0 }
    : parseDisplayOrder(value.display_order);
  if (!order.ok) return order;

  return {
    ok: true,
    value: {
      branch_id: branch.value,
      title: title.value,
      body: body.value,
      display_order: order.value,
    },
  };
}

export function parseWelcomeMessagePatch(
  value: unknown,
): { ok: true; value: WelcomeMessagePatchInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set(["title", "body", "display_order"]);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return {
      ok: false,
      error: "Unsupported or empty welcome-message update.",
    };
  }

  const result: WelcomeMessagePatchInput = {};
  if ("title" in value) {
    const title = parseText(value.title, "title", 2, 220);
    if (!title.ok) return title;
    result.title = title.value;
  }
  if ("body" in value) {
    const body = parseText(value.body, "body", 1, 12000);
    if (!body.ok) return body;
    result.body = body.value;
  }
  if ("display_order" in value) {
    const order = parseDisplayOrder(value.display_order);
    if (!order.ok) return order;
    result.display_order = order.value;
  }

  return { ok: true, value: result };
}
