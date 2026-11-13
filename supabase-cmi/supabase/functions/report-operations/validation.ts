const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_TYPES = new Set(["daily_evangelism", "event_evangelism", "weekly_ministry"]);
const COUNT_FIELDS = [
  "contacts_captured", "gospel_presentations", "decisions_for_christ",
  "followup_required", "followup_completed", "visits_completed",
  "calls_completed", "events_supported", "attendance_count",
] as const;

type CountField = typeof COUNT_FIELDS[number];
export type ReportInput = {
  branch_id: string;
  report_type: "daily_evangelism" | "event_evangelism" | "weekly_ministry";
  period_start: string;
  period_end: string;
  team_id: string | null;
  event_id: string | null;
} & Record<CountField, number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseReportCreate(value: unknown):
  | { ok: true; value: ReportInput }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  const allowed = new Set([
    "branch_id", "report_type", "period_start", "period_end", "team_id", "event_id",
    ...COUNT_FIELDS,
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported report field." };
  }
  if (typeof value.branch_id !== "string" || !isUuid(value.branch_id)) {
    return { ok: false, error: "Invalid branch_id." };
  }
  if (typeof value.report_type !== "string" || !REPORT_TYPES.has(value.report_type)) {
    return { ok: false, error: "Invalid report_type." };
  }
  if (!validDate(value.period_start) || !validDate(value.period_end)) {
    return { ok: false, error: "Report dates must be valid YYYY-MM-DD dates." };
  }
  const start = Date.parse(`${value.period_start}T00:00:00Z`);
  const end = Date.parse(`${value.period_end}T00:00:00Z`);
  const day = 86400000;
  const span = (end - start) / day;
  if (span < 0 ||
    (value.report_type !== "weekly_ministry" && span !== 0) ||
    (value.report_type === "weekly_ministry" && span !== 6)) {
    return { ok: false, error: "Daily and event reports cover one day; weekly reports cover seven days." };
  }
  const teamId = value.team_id === undefined || value.team_id === null || value.team_id === ""
    ? null : value.team_id;
  const eventId = value.event_id === undefined || value.event_id === null || value.event_id === ""
    ? null : value.event_id;
  if (teamId !== null && (typeof teamId !== "string" || !isUuid(teamId))) {
    return { ok: false, error: "Invalid team_id." };
  }
  if (eventId !== null && (typeof eventId !== "string" || !isUuid(eventId))) {
    return { ok: false, error: "Invalid event_id." };
  }
  if ((value.report_type === "event_evangelism") !== (eventId !== null)) {
    return { ok: false, error: "Event evangelism requires an event; other report types must not include one." };
  }

  const counts = {} as Record<CountField, number>;
  for (const field of COUNT_FIELDS) {
    const count = value[field] === undefined ? 0 : value[field];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 100000) {
      return { ok: false, error: `${field} must be a whole number from 0 to 100000.` };
    }
    counts[field] = count;
  }
  if (counts.decisions_for_christ > counts.gospel_presentations) {
    return { ok: false, error: "Decisions for Christ cannot exceed gospel presentations." };
  }
  if (counts.followup_completed > counts.followup_required) {
    return { ok: false, error: "Completed follow-ups cannot exceed follow-ups required." };
  }
  return {
    ok: true,
    value: {
      branch_id: value.branch_id,
      report_type: value.report_type as ReportInput["report_type"],
      period_start: value.period_start,
      period_end: value.period_end,
      team_id: teamId as string | null,
      event_id: eventId as string | null,
      ...counts,
    },
  };
}

export function parseReportListQuery(url: URL):
  | { ok: true; value: { branch_id: string; report_type: string | null; status: string | null; limit: number; offset: number } }
  | { ok: false; error: string } {
  const allowed = new Set(["branch_id", "report_type", "status", "limit", "offset"]);
  const seen = new Set<string>();
  for (const [key] of url.searchParams) {
    if (!allowed.has(key)) return { ok: false, error: "Unsupported query parameter." };
    if (seen.has(key)) return { ok: false, error: "Duplicate query parameter." };
    seen.add(key);
  }
  const branchId = url.searchParams.get("branch_id") ?? "";
  if (!isUuid(branchId)) return { ok: false, error: "Invalid branch_id." };
  const type = url.searchParams.get("report_type");
  if (type !== null && !REPORT_TYPES.has(type)) return { ok: false, error: "Invalid report_type." };
  const status = url.searchParams.get("status");
  if (status !== null && !["submitted", "returned", "approved"].includes(status)) {
    return { ok: false, error: "Invalid report status." };
  }
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : 25;
  const offset = url.searchParams.has("offset") ? Number(url.searchParams.get("offset")) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { ok: false, error: "Limit must be an integer from 1 to 50." };
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) return { ok: false, error: "Offset must be an integer from 0 to 5000." };
  return { ok: true, value: { branch_id: branchId, report_type: type, status, limit, offset } };
}

export function parseReview(value: unknown):
  | { ok: true; value: { decision: "approved" | "returned" | "comment"; comment: string | null } }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  if (Object.keys(value).some((key) => !["decision", "comment"].includes(key))) {
    return { ok: false, error: "Unsupported review field." };
  }
  if (!["approved", "returned", "comment"].includes(String(value.decision))) {
    return { ok: false, error: "Invalid review decision." };
  }
  let comment: string | null = null;
  if (value.comment !== undefined && value.comment !== null) {
    if (typeof value.comment !== "string" || value.comment.trim().length > 2000) {
      return { ok: false, error: "Review comment must be 2000 characters or fewer." };
    }
    comment = value.comment.trim() || null;
  }
  if (value.decision === "returned" && !comment) {
    return { ok: false, error: "A reason is required when returning a report." };
  }
  return { ok: true, value: { decision: value.decision as "approved" | "returned" | "comment", comment } };
}
