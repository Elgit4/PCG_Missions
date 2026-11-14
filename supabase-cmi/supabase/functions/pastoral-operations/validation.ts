export type PastoralRecordKind = "prayer_request" | "care_record";

export type PastoralAccessMode = "assigned" | "oversight";

export interface PastoralReadPath {
  kind: PastoralRecordKind;
  recordId: string;
}

export interface PastoralReadInput {
  branch_id: string;
  access_mode: PastoralAccessMode;
  reason_code: string | null;
}

export interface PastoralListQuery {
  branch_id: string;
  limit: number;
  offset: number;
}

export type PastoralListParseResult =
  | { ok: true; value: PastoralListQuery }
  | { ok: false; error: string };

export function parsePastoralListQuery(
  params: URLSearchParams,
): PastoralListParseResult {
  const allowed = new Set(["branch_id", "limit", "offset"]);
  const keys = [...params.keys()];
  if (
    keys.some((key) => !allowed.has(key)) ||
    new Set(keys).size !== keys.length
  ) {
    return {
      ok: false,
      error: "Unsupported or duplicate query parameter.",
    };
  }

  const branchId = params.get("branch_id") ?? "";
  const rawLimit = params.get("limit") ?? "25";
  const rawOffset = params.get("offset") ?? "0";
  if (
    !isUuid(branchId) ||
    !/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit) ||
    !/^(?:0|[1-9][0-9]{0,3}|5000)$/.test(rawOffset)
  ) {
    return {
      ok: false,
      error: "A valid branch_id, limit (1–50), and offset (0–5000) are required.",
    };
  }

  const limit = Number(rawLimit);
  const offset = Number(rawOffset);
  if (offset > 5000) {
    return {
      ok: false,
      error: "A valid branch_id, limit (1–50), and offset (0–5000) are required.",
    };
  }
  return { ok: true, value: { branch_id: branchId, limit, offset } };
}


export type PastoralReadParseResult =
  | { ok: true; value: PastoralReadInput }
  | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OVERSIGHT_REASON_CODES = new Set([
  "pastoral_review",
  "continuity_of_care",
  "safeguarding_concern",
  "complaint_review",
  "administrative_review",
]);

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parsePastoralReadPath(
  pathname: string,
): PastoralReadPath | null {
  const segments = pathname.split("/").filter(Boolean);
  const functionIndex = segments.lastIndexOf("pastoral-operations");
  const route = functionIndex >= 0
    ? segments.slice(functionIndex + 1)
    : segments;

  if (route.length !== 4 || route[3] !== "read") return null;

  const [domain, collection, recordId] = route;
  if (!isUuid(recordId)) return null;

  if (domain === "prayer" && collection === "requests") {
    return { kind: "prayer_request", recordId };
  }
  if (domain === "care" && collection === "records") {
    return { kind: "care_record", recordId };
  }
  return null;
}

export function parsePastoralReadInput(
  value: unknown,
): PastoralReadParseResult {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return { ok: false, error: "A JSON object is required." };
  }

  const input = value as Record<string, unknown>;
  const allowed = new Set(["branch_id", "access_mode", "reason_code"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported pastoral read field." };
  }

  if (typeof input.branch_id !== "string" || !isUuid(input.branch_id)) {
    return { ok: false, error: "A valid branch_id is required." };
  }

  if (input.access_mode !== "assigned" && input.access_mode !== "oversight") {
    return { ok: false, error: "access_mode must be assigned or oversight." };
  }

  if (input.access_mode === "assigned") {
    if (input.reason_code !== undefined && input.reason_code !== null) {
      return {
        ok: false,
        error: "Assigned reads must not include an oversight reason_code.",
      };
    }
    return {
      ok: true,
      value: {
        branch_id: input.branch_id,
        access_mode: "assigned",
        reason_code: null,
      },
    };
  }

  if (
    typeof input.reason_code !== "string" ||
    !OVERSIGHT_REASON_CODES.has(input.reason_code)
  ) {
    return {
      ok: false,
      error: "A supported oversight reason_code is required.",
    };
  }

  return {
    ok: true,
    value: {
      branch_id: input.branch_id,
      access_mode: "oversight",
      reason_code: input.reason_code,
    },
  };
}
