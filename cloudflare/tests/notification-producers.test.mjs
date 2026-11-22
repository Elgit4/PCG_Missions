import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("report review writes author notification in the same D1 batch as the review", () => {
  const reviewStart = worker.indexOf('if (review && request.method === "POST")');
  const resubmitStart = worker.indexOf('if (resubmit && request.method === "POST")', reviewStart);
  assert.ok(reviewStart >= 0 && resubmitStart > reviewStart);
  const review = worker.slice(reviewStart, resubmitStart);

  assert.match(review, /const reviewStatements\s*=\s*\[/);
  assert.match(review, /UPDATE ministry_report SET status=.*last_action_id/s);
  assert.match(review, /INSERT OR IGNORE INTO staff_notification/);
  assert.match(review, /JOIN staff_profile author ON author\.id=mr\.author_profile_id/);
  assert.match(review, /'report_reviewed'/);
  assert.match(review, /ministry-report:/);
  assert.match(review, /await env\.DB\.batch\(reviewStatements\)/);
  assert.match(review, /reviewResults\[0\].*changes/s);
  assert.match(review, /reviewResults\[1\].*changes/s);
  assert.doesNotMatch(review, /SMS|sendEmail|pushNotification/i);
});

test("event staff and team assignment writes recipient-scoped in-app notifications atomically", () => {
  const start = worker.indexOf('if(isAssignmentCollection&&request.method==="POST")');
  const end = worker.indexOf('if(isAssignmentRevoke&&request.method==="POST")', start);
  assert.ok(start >= 0 && end > start);
  const assignment = worker.slice(start, end);

  assert.match(assignment, /const statements:D1PreparedStatement\[\]=\[statement\]/);
  assert.match(assignment, /INSERT OR IGNORE INTO staff_notification/g);
  assert.match(assignment, /'event_assigned'/);
  assert.match(assignment, /JOIN event_staff_assignment a ON a\.id=\?/);
  assert.match(assignment, /FROM staff_team_membership stm/);
  assert.match(assignment, /JOIN staff_profile sp ON sp\.id=stm\.staff_profile_id AND sp\.account_status='active'/);
  assert.match(assignment, /event-assignment:/);
  assert.match(assignment, /event-team-assignment:/);
  assert.match(assignment, /await env\.DB\.batch\(statements\)/);
  assert.match(assignment, /results\[0\].*changes/s);
});

test("follow-up creation and reassignment retain their existing notification producers", () => {
  assert.match(worker, /followup-task:\$\{taskId\}:assigned:/);
  assert.match(worker, /followup-task:\$\{taskId\}:assignment:/);
  assert.match(worker, /INSERT OR IGNORE INTO staff_notification/);
});
