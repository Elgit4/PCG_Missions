import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

function section(startMarker, endMarker) {
  const start = worker.indexOf(startMarker);
  const end = worker.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}`);
  return worker.slice(start, end);
}

test("standard role revocation writes its audit row only for the exact revoked assignment", () => {
  const revoke = section("async function revokeStaffRole(", "async function listAdminElevationRequests(");
  assert.doesNotMatch(revoke, /changes\(\)\s*=\s*1/);
  assert.match(revoke, /a\.id = \? AND a\.branch_id = \? AND a\.revoked_at = \? AND a\.revoked_by = \?/);
  assert.match(revoke, /results\[0\].*changes/s);
});

test("Admin/Pastor elevation applies only to the exact request reviewed by this actor at this time", () => {
  const review = section("async function reviewAdminElevationRequest(", "async function sha256Hex(");
  assert.doesNotMatch(review, /changes\(\)\s*=\s*1/);
  assert.match(review, /req\.status = 'approved' AND req\.reviewed_by = \?/);
  assert.match(review, /req\.reviewed_at = \? AND req\.review_reason = \?/);
  assert.match(review, /results\[0\].*changes/s);
  assert.match(review, /results\[1\].*changes/s);
});

test("Admin/Pastor revocation marks a request applied only after its linked assignment is revoked", () => {
  const review = section("async function reviewAdminRevocationRequest(", "type ContactScopeMode");
  assert.doesNotMatch(review, /changes\(\)\s*=\s*1/);
  assert.match(review, /reviewed_at = \?/);
  assert.match(review, /a\.revocation_request_id = staff_role_revocation_request\.id/);
  assert.match(review, /a\.revoked_at = \? AND a\.revoked_by = \?/);
  assert.match(review, /results\[0\].*changes/s);
  assert.match(review, /results\[1\].*changes/s);
  assert.match(review, /results\[2\].*changes/s);
});
