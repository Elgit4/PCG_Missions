import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0046_restore_report_and_event_capabilities.sql", import.meta.url), "utf8");

test("typed report routes consume the canonical scoped capability catalogue", () => {
  const start = worker.indexOf("async function handleReportOperations(");
  assert.ok(start >= 0);
  const report = worker;
  assert.match(report, /report\.submit\.scoped/);
  assert.match(report, /report\.read\.scoped/);
  assert.match(report, /report\.review\.scoped/);
  assert.doesNotMatch(report, /report\.(?:submit\.own|read\.own|review\.branch|review\.team)/);
});

test("event closeout routes use active canonical submit and review capabilities", () => {
  const start = worker.indexOf("async function handleEventWorkspaceOperations(");
  const end = worker.indexOf("\nasync function handleReportOperations", start + 1);
  assert.ok(start >= 0 && end > start);
  const events = worker.slice(start, end);
  assert.match(events, /event\.closeout\.submit/);
  assert.match(events, /event\.closeout\.review/);
  assert.doesNotMatch(events, /events\.closeout\.review|events\.checkin/);
});

test("event check-in database authorization follows explicit event assignments", () => {
  assert.match(migration, /CREATE TRIGGER event_checkin_authorize_insert[\s\S]*event_staff_assignment[\s\S]*event_team_assignment/);
  assert.match(migration, /actor\.must_change_password=0/);
  assert.match(migration, /EVENT_CHECKIN_NOT_AUTHORIZED/);
  assert.doesNotMatch(migration, /c\.code IN \('events\.checkin','events\.manage'\)/);
});

test("migration restores least-privilege report and closeout grants", () => {
  for (const grant of [
    "('admin_pastor','report.review.scoped','branch')",
    "('coordinator','report.review.scoped','branch')",
    "('team_leader','report.review.scoped','team')",
    "('field_worker','report.submit.scoped','self')",
    "('follow_up_volunteer','report.submit.scoped','self')",
    "('admin_pastor','event.closeout.submit','branch')",
    "('admin_pastor','event.closeout.review','branch')",
    "('coordinator','event.closeout.review','branch')",
  ]) assert.ok(migration.includes(grant), "Missing grant " + grant);
  assert.match(migration, /schema_version=46/);
});
