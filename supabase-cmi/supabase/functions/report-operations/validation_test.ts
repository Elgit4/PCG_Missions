import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isUuid, parseReportCreate, parseReportListQuery, parseReview } from "./validation.ts";

const branch = "10000000-0000-4000-8000-000000000001";
const event = "20000000-0000-4000-8000-000000000002";
const base = {
  branch_id: branch,
  report_type: "daily_evangelism",
  period_start: "2026-11-13",
  period_end: "2026-11-13",
};

Deno.test("accepts a typed daily report and defaults all counts to zero", () => {
  const result = parseReportCreate(base);
  assert(result.ok);
  assertEquals(result.value.contacts_captured, 0);
  assertEquals(result.value.attendance_count, 0);
  assertEquals(result.value.team_id, null);
});

Deno.test("accepts event evangelism only with an event ID", () => {
  const result = parseReportCreate({ ...base, report_type: "event_evangelism", event_id: event });
  assert(result.ok);
  assertEquals(result.value.event_id, event);
  assertEquals(parseReportCreate({ ...base, report_type: "event_evangelism" }).ok, false);
  assertEquals(parseReportCreate({ ...base, event_id: event }).ok, false);
});

Deno.test("accepts exactly seven days for weekly ministry", () => {
  assert(parseReportCreate({
    ...base, report_type: "weekly_ministry", period_end: "2026-11-19",
  }).ok);
  assertEquals(parseReportCreate({
    ...base, report_type: "weekly_ministry", period_end: "2026-11-18",
  }).ok, false);
});

Deno.test("rejects malformed dates, negative and fractional counts", () => {
  assertEquals(parseReportCreate({ ...base, period_start: "2026-02-30" }).ok, false);
  assertEquals(parseReportCreate({ ...base, contacts_captured: -1 }).ok, false);
  assertEquals(parseReportCreate({ ...base, contacts_captured: 1.5 }).ok, false);
});

Deno.test("rejects inconsistent follow-up and decision totals", () => {
  assertEquals(parseReportCreate({ ...base, gospel_presentations: 2, decisions_for_christ: 3 }).ok, false);
  assertEquals(parseReportCreate({ ...base, followup_required: 1, followup_completed: 2 }).ok, false);
});

Deno.test("rejects caller-controlled author, status and unknown fields", () => {
  for (const field of ["author_profile_id", "status", "submitted_at", "created_at", "branchId"]) {
    assertEquals(parseReportCreate({ ...base, [field]: "forged" }).ok, false);
  }
});

Deno.test("validates UUID and report list query bounds", () => {
  assertEquals(isUuid(branch), true);
  assertEquals(isUuid("not-a-uuid"), false);
  assert(parseReportListQuery(new URL(`https://example.test/reports?branch_id=${branch}&limit=50`)).ok);
  assertEquals(parseReportListQuery(new URL(`https://example.test/reports?branch_id=${branch}&limit=51`)).ok, false);
  assertEquals(parseReportListQuery(new URL(`https://example.test/reports?branch_id=${branch}&author_id=${branch}`)).ok, false);
});

Deno.test("requires a reason when a report is returned", () => {
  assertEquals(parseReview({ decision: "returned" }).ok, false);
  assertEquals(parseReview({ decision: "returned", comment: "Please correct totals." }).ok, true);
  assertEquals(parseReview({ decision: "approved", comment: "Looks good." }).ok, true);
  assertEquals(parseReview({ decision: "approved", status: "approved" }).ok, false);
});
