import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}`);
  return source.slice(start, end);
}

test("contact capture and follow-up updates accept D1 trigger side effects without false conflicts", () => {
  const capture = section("async function createContact(", "async function updateContact(");
  assert.match(capture, /results\.some\(\(result\) => \(result\.meta\?\.changes \?\? 0\) < 1\)/);
  const contact = section("async function updateContact(", "async function assignContact(");
  assert.match(contact, /result\.meta\?\.changes \?\? 0\) < 1/);
  const updateTask = section("async function updateFollowupTask(", "async function reassignFollowupTask(");
  assert.match(updateTask, /results\[0\]\?\.meta\?\.changes \?\? 0\) < 1/);
  const reassignTask = section("async function reassignFollowupTask(", "async function handleAnnouncementCollection(");
  assert.match(reassignTask, /results\[0\]\?\.meta\?\.changes \?\? 0\) < 1/);
});

test("calendar and event audit triggers do not turn successful updates into conflicts", () => {
  const calendar = section("async function handleCalendarEntry(", "async function eventOperationContext(");
  assert.match(calendar, /result\.meta\?\.changes \?\? 0\) < 1/);
  const eventItem = section("async function handleEventItem(", "async function handleEventWorkspaceOperations(");
  assert.match(eventItem, /result\.meta\?\.changes\?\?0\)<1/);
  const flyer = section("async function handleEventFlyer(", "async function handleEventCollection(");
  assert.match(flyer, /updated\.meta\?\.changes\?\?0\)<1/);
  const eventOps = section("async function handleEventWorkspaceOperations(", "async function handleReportOperations(");
  assert.match(eventOps, /result\.meta\?\.changes\?\?0\)<1/);
});

test("staff role review and account-status audit triggers are accepted as additional writes", () => {
  const elevation = section("async function reviewAdminElevationRequest(", "async function requestStaffPasswordReset(");
  assert.match(elevation, /results\[0\]\?\.meta\?\.changes \?\? 0\) < 1/);
  assert.match(elevation, /results\[1\]\?\.meta\?\.changes \?\? 0\) < 1/);
  const status = section("async function changeStaffAccountStatus(", "async function createAdminRevocationRequest(");
  assert.match(status, /result\.meta\?\.changes \?\? 0\) < 1/);
  const revocation = section("async function reviewAdminRevocationRequest(", "function bestScope(");
  assert.match(revocation, /results\[0\]\?\.meta\?\.changes \?\? 0\) < 1/);
  assert.match(revocation, /results\[2\]\?\.meta\?\.changes \?\? 0\) < 1/);
});

test("report resubmission and prayer sharing accept audit-triggered writes", () => {
  const reports = section("async function handleReportOperations(", "async function listPrayerQueue(");
  assert.match(reports, /updated\.meta\?\.changes\?\?0\)<1/);
  const share = section("async function sharePrayerRequest(", "async function revokePrayerShare(");
  assert.match(share, /results\[0\]\?\.meta\?\.changes \?\? 0\) < 1/);
  assert.match(share, /results\[1\]\?\.meta\?\.changes \?\? 0\) < 1/);
  const revoke = section("async function revokePrayerShare(", "async function updatePrayerRequestStatus(");
  assert.match(revoke, /results\[0\]\?\.meta\?\.changes \?\? 0\) < 1/);
});
