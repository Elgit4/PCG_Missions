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

export type PastoralReadParseResult =
  | { ok: true; value: PastoralReadInput }
  | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (input.reason !== undefined && input.reason !== null) {
      return {
        ok: false,
        error: "Assigned reads must not include an oversight reason.",
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

  if (typeof input.reason !== "string") {
    return { ok: false, error: "An oversight reason is required." };
  }

  const reasonCode = input.reason_code;
  const allowedReasons = new Set([
    "pastoral_review",
    "continuity_of_care",
    "safeguarding_concern",
    "complaint_review",
    "administrative_review",
  ]);
  if (
    typeof reasonCode !== "string" ||
    !allowedReasons.has(reasonCode)
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
      reason,
    },
  };
}
