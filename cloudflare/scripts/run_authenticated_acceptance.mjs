import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hash } from "bcryptjs";
import { processDueFollowupReminders } from "../src/scheduled-followup-reminders.ts";

const databaseId = process.env.DB_ID;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const workerUrl = (process.env.WORKER_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const origin = "http://localhost:8787";
const runId = process.env.GITHUB_RUN_ID || "local";
const fetchWithTimeout = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });

if (!databaseId || !accountId || !apiToken) {
  throw new Error("Missing Cloudflare D1 acceptance credentials");
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function bindSql(sql, params) {
  let index = 0;
  const bound = sql.replace(/\?/g, () => {
    if (index >= params.length) throw new Error("Missing SQL bind parameter");
    return sqlLiteral(params[index++]);
  });
  if (index !== params.length) throw new Error("Unused SQL bind parameter");
  return bound;
}

async function d1(sql, params = []) {
  const response = await fetchWithTimeout(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: bindSql(sql, params) }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error(`Cloudflare D1 acceptance query failed (${response.status}): ${JSON.stringify(payload?.errors ?? payload).slice(0, 600)}`);
  }
  return payload.result?.[0]?.results ?? [];
}

async function insertUser(roleCode, label, assignerProfileId, bootstrapAdmin = false, targetBranchId = branchId) {
  const userId = randomUUID();
  const profileId = randomUUID();
  const email = `qa-${runId}-${label}@example.test`;
  const password = `PcgQa-${randomBytes(24).toString("base64url")}-9!`;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const passwordHash = await hash(password, 12);
  await d1(
    'INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
    [userId, `PCG QA ${label}`, email, 1, nowMs, nowMs],
  );
  await d1(
    "INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,'credential',?,?,?,?)",
    [randomUUID(), userId, userId, passwordHash, nowMs, nowMs],
  );
  await d1(
    "INSERT INTO staff_profile(id,auth_user_id,full_name,email,account_status,created_at,updated_at,must_change_password) VALUES(?,?,?,?,'active',?,?,0)",
    [profileId, userId, `PCG QA ${label}`, email, now, now],
  );
  const roleRows = await d1("SELECT id FROM role WHERE code=? AND is_active=1", [roleCode]);
  if (roleRows.length !== 1) throw new Error(`Missing active role: ${roleCode}`);
  const assignedBy = bootstrapAdmin ? profileId : assignerProfileId;
  await d1(
    "INSERT INTO staff_role_assignment(id,staff_profile_id,role_id,branch_id,assigned_by,starts_at,created_at) VALUES(?,?,?,?,?,?,?)",
    [randomUUID(), profileId, roleRows[0].id, targetBranchId, assignedBy, new Date(nowMs - 3600000).toISOString(), now],
  );
  return { userId, profileId, email, password };
}

let lastSignInAttemptAt = 0;
// Thirty seconds between starts keeps the shared local IP well below Better Auth's five-per-minute ceiling.
async function waitForSignInRateLimitSlot() {
  // Better Auth limits /sign-in/email per client IP. This isolated rehearsal
  // uses many synthetic accounts from one local Worker IP, so pace every
  // positive and negative attempt without weakening the production policy.
  if (lastSignInAttemptAt > 0) {
    const remaining = 30_000 - (Date.now() - lastSignInAttemptAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  lastSignInAttemptAt = Date.now();
}

async function signIn(identity, label, rememberMe = false) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForSignInRateLimitSlot();
    console.log("AUTH_SIGNIN_ATTEMPT", label, new Date().toISOString(), attempt + 1);
    const response = await fetchWithTimeout(workerUrl + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email: identity.email, password: identity.password, rememberMe }),
    });
    const bodyText = await response.text();
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.max(65_000, retryAfter * 1000)
        : 65_000;
      console.warn("AUTH_SIGNIN_RATE_LIMITED", label, "retry_ms=" + backoff);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      lastSignInAttemptAt = 0;
      continue;
    }
    if (!response.ok) {
      throw new Error(label + " Better Auth sign-in failed (" + response.status + "): " + bodyText.slice(0, 500));
    }
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
    const cookie = setCookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
    if (!cookie) throw new Error(label + " sign-in did not return a session cookie");
    return cookie;
  }
  throw new Error(label + " Better Auth sign-in exceeded the retry limit");
}

async function api(cookie, path, method = "GET", body = undefined, idempotencyKey = undefined, selectedBranchId = branchId) {
  const response = await fetchWithTimeout(`${workerUrl}${path}`, {
    method,
    headers: {
      origin,
      cookie,
      "x-branch-id": selectedBranchId,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { status: response.status, payload };
}

const now = new Date();
const nowIso = now.toISOString();
const startsAt = new Date(now.getTime() - 5 * 60_000).toISOString();
const endsAt = new Date(now.getTime() + 2 * 60 * 60_000).toISOString();
const today = nowIso.slice(0, 10);
const churchId = randomUUID();
const branchId = randomUUID();
const otherBranchId = randomUUID();
const eventId = randomUUID();

await d1(
  "INSERT INTO church(id,name,timezone,is_configured_instance,created_at,updated_at) VALUES(?,?,'Africa/Accra',1,?,?)",
  [churchId, "PCG Automated Acceptance Church", nowIso, nowIso],
);
await d1(
  "INSERT INTO branch(id,church_id,name,timezone,is_active,created_at,updated_at) VALUES(?,?,?,'Africa/Accra',1,?,?)",
  [branchId, churchId, "Automated Acceptance Branch", nowIso, nowIso],
);
await d1(
  "INSERT INTO branch(id,church_id,name,timezone,is_active,created_at,updated_at) VALUES(?,?,?,'Africa/Accra',1,?,?)",
  [otherBranchId, churchId, "Automated Acceptance Isolation Branch", nowIso, nowIso],
);

const admin = await insertUser("admin_pastor", "admin", null, true);
if (process.env.PCG_BROWSER_CREDENTIALS_PATH) {
  writeFileSync(
    process.env.PCG_BROWSER_CREDENTIALS_PATH,
    JSON.stringify({ email: admin.email, password: admin.password, userId: admin.userId }),
    { mode: 0o600 },
  );
}
// These bootstrap-slot resets exist only in this disposable D1 fixture. They
// create a second synthetic reviewer and a second-branch administrator so the
// two-person-control and cross-branch tests exercise real database triggers.
await d1("UPDATE staff_admin_bootstrap_state SET remaining_slots=1 WHERE id=1");
const secondAdmin = await insertUser("admin_pastor", "second-admin", null, true);
await d1("UPDATE staff_admin_bootstrap_state SET remaining_slots=1 WHERE id=1");
const otherBranchAdmin = await insertUser("admin_pastor", "other-branch-admin", null, true, otherBranchId);
const worker = await insertUser("field_worker", "worker", admin.profileId);
const elevationTarget = await insertUser("field_worker", "elevation-target", admin.profileId);
const otherBranchWorker = await insertUser("field_worker", "other-branch-worker", otherBranchAdmin.profileId, false, otherBranchId);
const reviewer = await insertUser("coordinator", "reviewer", admin.profileId);
const unassigned = await insertUser("field_worker", "unassigned", admin.profileId);
const teamLeader = await insertUser("team_leader", "team-leader", admin.profileId);
const followupVolunteer = await insertUser("follow_up_volunteer", "followup-volunteer", admin.profileId);
const prayerIntercessor = await insertUser("prayer_intercessor", "prayer-intercessor", admin.profileId);
const firstLoginUser = await insertUser("field_worker", "first-login", admin.profileId);
await d1(
  "UPDATE staff_profile SET must_change_password=1, password_setup_expires_at=? WHERE id=?",
  [new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), firstLoginUser.profileId],
);
const resetTarget = await insertUser("field_worker", "reset-target", admin.profileId);
const teamId = randomUUID();
const outsideTeamId = randomUUID();
await d1(
  "INSERT INTO team(id,branch_id,name,description,is_active,created_at,updated_at) VALUES(?,?,?,NULL,1,?,?)",
  [teamId, branchId, "QA Follow-up Team", nowIso, nowIso],
);
await d1(
  "INSERT INTO team(id,branch_id,name,description,is_active,created_at,updated_at) VALUES(?,?,?,NULL,1,?,?)",
  [outsideTeamId, branchId, "QA Outside Team", nowIso, nowIso],
);
await d1(
  "INSERT INTO staff_team_membership(id,staff_profile_id,team_id,branch_id,membership_role,starts_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
  [randomUUID(), teamLeader.profileId, teamId, branchId, "leader", nowIso, admin.profileId, nowIso],
);
await d1(
  "INSERT INTO staff_team_membership(id,staff_profile_id,team_id,branch_id,membership_role,starts_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
  [randomUUID(), followupVolunteer.profileId, teamId, branchId, "member", nowIso, admin.profileId, nowIso],
);
console.log("SYNTHETIC_IDENTITIES_SEEDED");

const unauthenticated = await fetchWithTimeout(`${workerUrl}/api/v1/me`);
if (unauthenticated.status !== 401) throw new Error(`Unauthenticated /api/v1/me expected 401, got ${unauthenticated.status}`);

let adminCookie = await signIn(admin, "Admin/Pastor", true);
const secondAdminCookie = await signIn(secondAdmin, "Second Admin/Pastor");
const elevationTargetCookie = await signIn(elevationTarget, "Admin/Pastor elevation target");
const otherBranchWorkerCookie = await signIn(otherBranchWorker, "Other-branch Field Worker");
const workerCookie = await signIn(worker, "Field Worker");
const reviewerCookie = await signIn(reviewer, "Coordinator");
const unassignedCookie = await signIn(unassigned, "Unassigned Field Worker");
const teamLeaderCookie = await signIn(teamLeader, "Team Leader");
const followupVolunteerCookie = await signIn(followupVolunteer, "Follow-up Volunteer");
const prayerIntercessorCookie = await signIn(prayerIntercessor, "Prayer Intercessor");
console.log("BETTER_AUTH_SESSIONS_CREATED");

const flyerStart = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
const flyerEnd = new Date(Date.now() + 25 * 60 * 60_000).toISOString();
const flyerEventCreate = await api(adminCookie, "/api/v1/events", "POST", {
  title: "Synthetic Event Flyer Storage Acceptance",
  description: "Temporary storage integration fixture.",
  starts_at: flyerStart,
  ends_at: flyerEnd,
  timezone: "Africa/Accra",
  location: "Synthetic QA",
  capacity: 5,
});
if (flyerEventCreate.status !== 201 || !flyerEventCreate.payload?.data?.id) {
  throw new Error("Could not create the temporary draft event for flyer-storage acceptance: " + flyerEventCreate.status);
}
const flyerEventId = flyerEventCreate.payload.data.id;
const flyerBytes = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const flyerForm = new FormData();
flyerForm.append("file", new Blob([flyerBytes], { type: "image/png" }), "synthetic-acceptance.png");
let flyerUploadPayload;
let flyerDownloadVerified = false;
let flyerRemovePayload;
try {
  const flyerUploadResponse = await fetchWithTimeout(
    `${workerUrl}/api/v1/events/${flyerEventId}/flyer`,
    {
      method: "POST",
      headers: { origin, cookie: adminCookie, "x-branch-id": branchId },
      body: flyerForm,
    },
  );
  const flyerUploadText = await flyerUploadResponse.text();
  try { flyerUploadPayload = flyerUploadText ? JSON.parse(flyerUploadText) : {}; }
  catch { flyerUploadPayload = { raw: flyerUploadText }; }
  if (flyerUploadResponse.status !== 200 || typeof flyerUploadPayload?.data?.signed_url !== "string") {
    throw new Error("Private event flyer upload/signing failed: " + flyerUploadResponse.status + " " + JSON.stringify(flyerUploadPayload));
  }

  const flyerRead = await api(adminCookie, `/api/v1/events/${flyerEventId}/flyer`);
  if (flyerRead.status !== 200 || flyerRead.payload?.data?.object_path !== flyerUploadPayload.data.object_path) {
    throw new Error("Private event flyer metadata readback failed: " + flyerRead.status);
  }
  const flyerDownload = await fetchWithTimeout(flyerRead.payload.data.signed_url);
  const downloadedFlyerBytes = Buffer.from(await flyerDownload.arrayBuffer());
  flyerDownloadVerified = flyerDownload.ok && downloadedFlyerBytes.equals(flyerBytes);
  if (!flyerDownloadVerified) throw new Error("Signed event flyer URL did not return the uploaded bytes.");
} finally {
  flyerRemovePayload = await api(adminCookie, `/api/v1/events/${flyerEventId}/flyer/remove`, "POST");
  if (flyerRemovePayload.status !== 200) {
    throw new Error("Temporary event flyer cleanup failed: " + flyerRemovePayload.status);
  }
}
const flyerAfterRemoval = await api(adminCookie, `/api/v1/events/${flyerEventId}/flyer`);
if (!flyerDownloadVerified || flyerAfterRemoval.status !== 404) {
  throw new Error("Event flyer upload/read/delete lifecycle did not complete cleanly.");
}
console.log("PRIVATE_EVENT_FLYER_STORAGE_LIFECYCLE_PASSED");

for (const [cookie, label] of [
  [adminCookie, "Admin/Pastor"],
  [secondAdminCookie, "Second Admin/Pastor"],
  [elevationTargetCookie, "Admin/Pastor elevation target"],
  [reviewerCookie, "Coordinator"],
  [teamLeaderCookie, "Team Leader"],
  [workerCookie, "Field Worker"],
  [followupVolunteerCookie, "Follow-up Volunteer"],
  [prayerIntercessorCookie, "Prayer Intercessor"],
]) {
  const me = await api(cookie, "/api/v1/me");
  if (me.status !== 200 || me.payload.ok !== true) throw new Error(`${label} authenticated /api/v1/me failed: ${me.status} ${JSON.stringify(me.payload)}`);
}

await d1(
  "INSERT INTO event(id,branch_id,title,description,starts_at,ends_at,timezone,location,capacity,registration_state,visibility,status,transport_enabled,created_by,created_at,updated_at,last_modified_by) VALUES(?,?,?,NULL,?,?,?,'QA Acceptance Venue',50,'open','staff','published',0,?,?,?,?)",
  [eventId, branchId, "Authenticated Acceptance Event", startsAt, endsAt, "Africa/Accra", admin.userId, nowIso, nowIso, admin.userId],
);

const otherBranchWorkerMe = await api(otherBranchWorkerCookie, "/api/v1/me", "GET", undefined, undefined, otherBranchId);
if (otherBranchWorkerMe.status !== 200 || otherBranchWorkerMe.payload?.ok !== true) {
  throw new Error("Other-branch Field Worker could not establish its own branch context.");
}
console.log("AUTHENTICATED_ME_ENDPOINTS_PASSED");

const standardRoleAssignment = await api(adminCookie, "/api/v1/staff/roles", "POST", {
  target_profile_id: elevationTarget.profileId,
  role_code: "follow_up_volunteer",
  reason: "Synthetic acceptance verifies standard role assignment and revocation.",
});
if (standardRoleAssignment.status !== 201 || !standardRoleAssignment.payload?.data?.id) {
  throw new Error("Admin/Pastor standard role assignment failed: " + standardRoleAssignment.status + " " + JSON.stringify(standardRoleAssignment.payload));
}
const standardRoleAssignmentId = standardRoleAssignment.payload.data.id;
const coordinatorRoleAssignmentDenied = await api(reviewerCookie, "/api/v1/staff/roles", "POST", {
  target_profile_id: elevationTarget.profileId,
  role_code: "team_leader",
  reason: "This coordinator attempt must be denied by role authorization.",
});
if (coordinatorRoleAssignmentDenied.status !== 403) {
  throw new Error("Coordinator unexpectedly gained the staff role-assignment capability.");
}
const standardRoleRevocation = await api(adminCookie, "/api/v1/staff/roles/" + standardRoleAssignmentId, "DELETE", {
  reason: "Synthetic acceptance verifies standard role revocation and its audit record.",
});
if (standardRoleRevocation.status !== 200) {
  throw new Error("Admin/Pastor standard role revocation failed: " + standardRoleRevocation.status + " " + JSON.stringify(standardRoleRevocation.payload));
}
const standardRoleState = (await d1(
  "SELECT revoked_at,revoked_by FROM staff_role_assignment WHERE id=?",
  [standardRoleAssignmentId],
))[0];
const standardRoleAudit = await d1(
  "SELECT action FROM staff_access_audit WHERE target_profile_id=? AND json_extract(metadata,'$.assignment_id')=? ORDER BY created_at",
  [elevationTarget.profileId, standardRoleAssignmentId],
);
if (!standardRoleState?.revoked_at || standardRoleState.revoked_by !== admin.profileId ||
    !standardRoleAudit.some((row) => row.action === "role_assigned") ||
    !standardRoleAudit.some((row) => row.action === "role_revoked")) {
  throw new Error("Standard role assignment/revocation did not persist its exact assignment and audit trail.");
}

const elevationRequest = await api(adminCookie, "/api/v1/staff/role-elevations", "POST", {
  target_profile_id: elevationTarget.profileId,
  reason: "Synthetic acceptance verifies two-person Admin/Pastor elevation approval.",
});
if (elevationRequest.status !== 201 || !elevationRequest.payload?.data?.id) {
  throw new Error("Admin/Pastor elevation request creation failed: " + elevationRequest.status + " " + JSON.stringify(elevationRequest.payload));
}
const elevationRequestId = elevationRequest.payload.data.id;
const selfElevationApproval = await api(adminCookie, "/api/v1/staff/role-elevations/" + elevationRequestId + "/approve", "POST", {
  review_reason: "The requesting administrator must not approve their own elevation request.",
});
if (selfElevationApproval.status !== 409) {
  throw new Error("Admin/Pastor elevation self-approval was not rejected.");
}
const secondAdminPendingElevations = await api(secondAdminCookie, "/api/v1/staff/role-elevations");
const pendingElevations = secondAdminPendingElevations.payload?.data ?? secondAdminPendingElevations.payload?.requests ?? [];
if (secondAdminPendingElevations.status !== 200 ||
    !pendingElevations.some((item) => item.id === elevationRequestId)) {
  throw new Error("A distinct Admin/Pastor reviewer could not see the pending elevation request.");
}
const elevationApproval = await api(secondAdminCookie, "/api/v1/staff/role-elevations/" + elevationRequestId + "/approve", "POST", {
  review_reason: "Distinct Admin/Pastor reviewer approves the synthetic role elevation.",
});
if (elevationApproval.status !== 200) {
  throw new Error("Distinct Admin/Pastor elevation approval failed: " + elevationApproval.status + " " + JSON.stringify(elevationApproval.payload));
}
const elevationState = (await d1(
  "SELECT status,requested_by,reviewed_by FROM staff_role_elevation_request WHERE id=?",
  [elevationRequestId],
))[0];
const elevatedAdminAssignment = (await d1(
  "SELECT a.id FROM staff_role_assignment a JOIN role r ON r.id=a.role_id WHERE a.staff_profile_id=? AND a.branch_id=? AND r.code='admin_pastor' AND a.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?)",
  [elevationTarget.profileId, branchId, new Date().toISOString(), new Date().toISOString()],
))[0];
if (elevationState?.status !== "applied" ||
    elevationState.requested_by !== admin.profileId ||
    elevationState.reviewed_by !== secondAdmin.profileId ||
    !elevatedAdminAssignment?.id) {
  throw new Error("Admin/Pastor elevation was not applied by a distinct reviewer.");
}

const secondAdminAssignment = (await d1(
  "SELECT a.id FROM staff_role_assignment a JOIN role r ON r.id=a.role_id WHERE a.staff_profile_id=? AND a.branch_id=? AND r.code='admin_pastor' AND a.revoked_at IS NULL",
  [secondAdmin.profileId, branchId],
))[0];
if (!secondAdminAssignment?.id) throw new Error("Second synthetic Admin/Pastor assignment was not found for revocation acceptance.");
const adminRevocationRequest = await api(adminCookie, "/api/v1/staff/role-revocations", "POST", {
  assignment_id: secondAdminAssignment.id,
  reason: "Synthetic acceptance verifies two-person Admin/Pastor revocation approval.",
});
if (adminRevocationRequest.status !== 201 || !adminRevocationRequest.payload?.data?.id) {
  throw new Error("Admin/Pastor revocation request creation failed: " + adminRevocationRequest.status + " " + JSON.stringify(adminRevocationRequest.payload));
}
const adminRevocationRequestId = adminRevocationRequest.payload.data.id;
const selfRevocationApproval = await api(adminCookie, "/api/v1/staff/role-revocations/" + adminRevocationRequestId + "/approve", "POST", {
  review_reason: "The requesting administrator must not approve their own revocation request.",
});
if (selfRevocationApproval.status !== 409) {
  throw new Error("Admin/Pastor revocation self-approval was not rejected.");
}
const adminRevocationApproval = await api(elevationTargetCookie, "/api/v1/staff/role-revocations/" + adminRevocationRequestId + "/approve", "POST", {
  review_reason: "A distinct elevated Admin/Pastor approves the synthetic revocation.",
});
if (adminRevocationApproval.status !== 200) {
  throw new Error("Distinct Admin/Pastor revocation approval failed: " + adminRevocationApproval.status + " " + JSON.stringify(adminRevocationApproval.payload));
}
const adminRevocationState = (await d1(
  "SELECT status,requested_by,reviewed_by FROM staff_role_revocation_request WHERE id=?",
  [adminRevocationRequestId],
))[0];
const revokedAdminAssignment = (await d1(
  "SELECT revoked_at,revoked_by,revocation_request_id FROM staff_role_assignment WHERE id=?",
  [secondAdminAssignment.id],
))[0];
if (adminRevocationState?.status !== "applied" ||
    adminRevocationState.requested_by !== admin.profileId ||
    adminRevocationState.reviewed_by !== elevationTarget.profileId ||
    !revokedAdminAssignment?.revoked_at ||
    revokedAdminAssignment.revoked_by !== elevationTarget.profileId ||
    revokedAdminAssignment.revocation_request_id !== adminRevocationRequestId) {
  throw new Error("Admin/Pastor revocation was not applied with distinct request/reviewer identities and an audit link.");
}
console.log("STAFF_ROLE_LIFECYCLE_AND_DUAL_CONTROL_PASSED");



const contactCapture = await api(workerCookie, "/api/v1/contacts", "POST", {
  first_name: "Synthetic",
  last_name: "Acceptance",
  preferred_name: null,
  phone_e164: null,
  email: null,
  age_range: null,
  preferred_language: null,
  service_area_id: null,
  source_metadata: { device_type: "automated-test" },
}, "qa-contact-" + runId);
if (contactCapture.status !== 201) throw new Error("Field Worker contact capture failed: " + contactCapture.status + " " + JSON.stringify(contactCapture.payload));
const contactId = contactCapture.payload?.data?.id;
if (!contactId) throw new Error("Contact capture response did not include a contact id");

const followupCreate = await api(workerCookie, "/api/v1/followup/tasks", "POST", {
  contact_id: contactId,
  assignee_user_id: worker.userId,
  priority: 2,
  due_at: endsAt,
  task_note: "Synthetic authenticated acceptance follow-up",
}, "qa-followup-" + runId);
if (followupCreate.status !== 201) throw new Error("Field Worker self-assigned follow-up creation failed: " + followupCreate.status + " " + JSON.stringify(followupCreate.payload));
const followupTaskId = followupCreate.payload?.data?.id;
if (!followupTaskId) throw new Error("Follow-up creation response did not include a task id");

const initialReminderDueAt = new Date(Date.now() - 60_000).toISOString();
const scheduledReminderTaskCreate = await api(workerCookie, "/api/v1/followup/tasks", "POST", {
  contact_id: contactId,
  assignee_user_id: worker.userId,
  priority: 2,
  due_at: initialReminderDueAt,
  task_note: "Synthetic due-reminder acceptance task",
}, "qa-scheduled-reminder-" + runId);
if (scheduledReminderTaskCreate.status !== 201) {
  throw new Error("Scheduled reminder fixture creation failed: " + scheduledReminderTaskCreate.status + " " + JSON.stringify(scheduledReminderTaskCreate.payload));
}
const scheduledReminderTaskId = scheduledReminderTaskCreate.payload?.data?.id;
if (!scheduledReminderTaskId) throw new Error("Scheduled reminder fixture did not return a task id");

const followupList = await api(workerCookie, "/api/v1/followup/tasks?limit=50&offset=0&status=open");
if (followupList.status !== 200 || !followupList.payload?.data?.some((task) => task.id === followupTaskId)) {
  throw new Error("Assigned follow-up list did not return the new task: " + followupList.status + " " + JSON.stringify(followupList.payload));
}
const followupStarted = await api(workerCookie, "/api/v1/followup/tasks/" + followupTaskId, "PATCH", { status: "in_progress" });
if (followupStarted.status !== 200) throw new Error("Follow-up start failed: " + followupStarted.status + " " + JSON.stringify(followupStarted.payload));
const followupCompleted = await api(workerCookie, "/api/v1/followup/tasks/" + followupTaskId, "PATCH", { status: "completed" });
if (followupCompleted.status !== 200) throw new Error("Follow-up completion failed: " + followupCompleted.status + " " + JSON.stringify(followupCompleted.payload));
console.log("CONTACT_AND_FOLLOWUP_LIFECYCLE_PASSED");

const otherBranchContactCapture = await api(otherBranchWorkerCookie, "/api/v1/contacts", "POST", {
  first_name: "Other",
  last_name: "Branch",
  preferred_name: null,
  phone_e164: null,
  email: null,
  age_range: null,
  preferred_language: null,
  service_area_id: null,
  source_metadata: { device_type: "automated-cross-branch-test" },
}, "qa-other-branch-contact-" + runId, otherBranchId);
if (otherBranchContactCapture.status !== 201 || !otherBranchContactCapture.payload?.data?.id) {
  throw new Error("Other-branch contact capture failed: " + otherBranchContactCapture.status + " " + JSON.stringify(otherBranchContactCapture.payload));
}
const otherBranchContactId = otherBranchContactCapture.payload.data.id;
const otherBranchTaskCreate = await api(otherBranchWorkerCookie, "/api/v1/followup/tasks", "POST", {
  contact_id: otherBranchContactId,
  assignee_user_id: otherBranchWorker.userId,
  priority: 2,
  due_at: endsAt,
  task_note: "Synthetic other-branch follow-up for isolation acceptance.",
}, "qa-other-branch-followup-" + runId, otherBranchId);
if (otherBranchTaskCreate.status !== 201 || !otherBranchTaskCreate.payload?.data?.id) {
  throw new Error("Other-branch follow-up creation failed: " + otherBranchTaskCreate.status + " " + JSON.stringify(otherBranchTaskCreate.payload));
}
const otherBranchTaskId = otherBranchTaskCreate.payload.data.id;
const otherBranchContactRead = await api(otherBranchWorkerCookie, "/api/v1/contacts/" + otherBranchContactId, "GET", undefined, undefined, otherBranchId);
if (otherBranchContactRead.status !== 200) {
  throw new Error("Other-branch worker could not read its own branch contact.");
}
const otherBranchTaskList = await api(otherBranchWorkerCookie, "/api/v1/followup/tasks?limit=50&offset=0&status=open", "GET", undefined, undefined, otherBranchId);
if (otherBranchTaskList.status !== 200 || !otherBranchTaskList.payload?.data?.some((task) => task.id === otherBranchTaskId)) {
  throw new Error("Other-branch worker could not read its own branch follow-up task.");
}
const branchOneCannotReadOtherContact = await api(adminCookie, "/api/v1/contacts/" + otherBranchContactId, "GET", undefined, undefined, branchId);
if (![403, 404].includes(branchOneCannotReadOtherContact.status)) {
  throw new Error("Branch-one Admin/Pastor read a contact from another branch.");
}
const branchTwoCannotReadBranchOneContact = await api(otherBranchWorkerCookie, "/api/v1/contacts/" + contactId, "GET", undefined, undefined, otherBranchId);
if (![403, 404].includes(branchTwoCannotReadBranchOneContact.status)) {
  throw new Error("Other-branch worker read a contact from the primary branch.");
}
const branchOneCannotReadOtherTask = await api(workerCookie, "/api/v1/followup/tasks?limit=50&offset=0&status=open", "GET");
if (branchOneCannotReadOtherTask.status !== 200 ||
    branchOneCannotReadOtherTask.payload?.data?.some((task) => task.id === otherBranchTaskId)) {
  throw new Error("Primary-branch follow-up listing exposed an other-branch task.");
}
const branchOneCrossContactAssign = await api(adminCookie, "/api/v1/contacts/" + otherBranchContactId + "/assign", "POST", {
  assignee_profile_id: worker.profileId,
  reason: "This cross-branch contact assignment must be denied.",
});
if (![403, 404].includes(branchOneCrossContactAssign.status)) {
  throw new Error("Primary-branch Admin/Pastor assigned a contact from another branch.");
}
const branchOneCrossTaskMutation = await api(adminCookie, "/api/v1/followup/tasks/" + otherBranchTaskId, "PATCH", {
  status: "in_progress",
});
if (![403, 404].includes(branchOneCrossTaskMutation.status)) {
  throw new Error("Primary-branch Admin/Pastor modified a follow-up task from another branch.");
}
const otherBranchContactAfterDeniedMutation = (await d1("SELECT branch_id,first_name FROM contact WHERE id=?", [otherBranchContactId]))[0];
const otherBranchTaskAfterDeniedMutation = (await d1("SELECT status FROM followup_task WHERE id=?", [otherBranchTaskId]))[0];
if (otherBranchContactAfterDeniedMutation?.branch_id !== otherBranchId ||
    otherBranchContactAfterDeniedMutation?.first_name !== "Other" ||
    otherBranchTaskAfterDeniedMutation?.status !== "open") {
  throw new Error("A denied cross-branch mutation changed business data.");
}
console.log("CROSS_BRANCH_CONTACT_AND_FOLLOWUP_READ_MUTATION_ISOLATION_PASSED");



// Record only aggregate state before the handoff so a D1 trigger conflict can be diagnosed
// without logging visitor identity, staff credentials, or contact details.
const assignmentPrecheck = await d1(
  `SELECT
     (SELECT COUNT(*) FROM contact_assignment WHERE contact_id=? AND branch_id=?) AS assignment_count,
     (SELECT COUNT(*) FROM contact_assignment WHERE contact_id=? AND branch_id=?
       AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)) AS current_assignments,
     (SELECT COUNT(*) FROM contact_assignment WHERE contact_id=? AND branch_id=?
       AND starts_at>? AND (ends_at IS NULL OR ends_at>?)) AS future_assignments,
     (SELECT COUNT(*) FROM team WHERE id=? AND branch_id=? AND is_active=1) AS target_team_active,
     (SELECT COUNT(*) FROM staff_role_assignment ra
       JOIN role r ON r.id=ra.role_id AND r.code='admin_pastor'
       JOIN role_capability rc ON rc.role_id=r.id
       JOIN capability c ON c.id=rc.capability_id AND c.code='contacts.assign' AND c.is_active=1
       WHERE ra.staff_profile_id=? AND ra.branch_id=? AND ra.revoked_at IS NULL
         AND ra.starts_at<=? AND (ra.ends_at IS NULL OR ra.ends_at>?)) AS admin_assign_grants,
     (SELECT COUNT(*) FROM staff_profile WHERE id=? AND auth_user_id=? AND account_status='active') AS admin_identity_active,
     (SELECT COUNT(*) FROM contact WHERE id=? AND branch_id=? AND contact_status='active') AS contact_active,
     (SELECT COUNT(*) FROM branch WHERE id=? AND is_active=1) AS branch_active`,
  [contactId, branchId, contactId, branchId, new Date().toISOString(), new Date().toISOString(),
   contactId, branchId, new Date().toISOString(), new Date().toISOString(),
   teamId, branchId, admin.profileId, branchId, new Date().toISOString(), new Date().toISOString(),
   admin.profileId, admin.userId, contactId, branchId, branchId],
);
console.log("CONTACT_ASSIGNMENT_PRECHECK", JSON.stringify(assignmentPrecheck[0] ?? {}));

// Verify team-scoped allocation, handoff, and assigned-only privacy across all six roles.
const adminTeamAssign = await api(adminCookie, `/api/v1/contacts/${contactId}/assign`, "POST", {
  team_id: teamId,
  reason: "Admin routes the captured visitor to the responsible ministry team.",
});
if (adminTeamAssign.status !== 201 || adminTeamAssign.payload?.data?.team_id !== teamId) {
  const assignmentFailureState = await d1(
    `SELECT
       COUNT(*) AS assignment_count,
       SUM(CASE WHEN team_id=? THEN 1 ELSE 0 END) AS assignments_for_target_team,
       SUM(CASE WHEN assignee_user_id IS NOT NULL THEN 1 ELSE 0 END) AS assignments_with_user,
       SUM(CASE WHEN ends_at IS NULL THEN 1 ELSE 0 END) AS open_ended_assignments,
       SUM(CASE WHEN ended_by IS NOT NULL THEN 1 ELSE 0 END) AS assignments_with_end_actor,
       (SELECT COUNT(*) FROM contact_assignment_audit WHERE contact_id=? AND branch_id=?) AS audit_rows
     FROM contact_assignment WHERE contact_id=? AND branch_id=?`,
    [teamId, contactId, branchId, contactId, branchId],
  );
  console.log("CONTACT_ASSIGNMENT_FAILURE_STATE", JSON.stringify(assignmentFailureState[0] ?? {}));
  throw new Error("Admin/Pastor could not assign the contact to a branch team: " + adminTeamAssign.status + " " + JSON.stringify(adminTeamAssign.payload));
}
await new Promise((resolve) => setTimeout(resolve, 1250));
const teamLeaderContacts = await api(teamLeaderCookie, "/api/v1/contacts?limit=50&offset=0");
if (teamLeaderContacts.status !== 200 || !teamLeaderContacts.payload?.data?.some((contact) => contact.id === contactId)) {
  throw new Error("Team Leader could not read a contact assigned to their active team.");
}
const crossTeamContactAssign = await api(teamLeaderCookie, `/api/v1/contacts/${contactId}/assign`, "POST", {
  team_id: outsideTeamId,
  reason: "Attempted to assign a visitor outside the Team Leader's own team.",
});
if (crossTeamContactAssign.status !== 403 || crossTeamContactAssign.payload?.error?.code !== "TEAM_OUTSIDE_SCOPE") {
  throw new Error("Team Leader was not blocked from assigning a contact outside their team.");
}
const teamLeaderStaffAssign = await api(teamLeaderCookie, `/api/v1/contacts/${contactId}/assign`, "POST", {
  assignee_profile_id: followupVolunteer.profileId,
  reason: "Team Leader hands this visitor to the assigned Follow-up Volunteer.",
});
if (teamLeaderStaffAssign.status !== 201) {
  throw new Error("Team Leader could not hand off a contact to an active member of their team: " + teamLeaderStaffAssign.status + " " + JSON.stringify(teamLeaderStaffAssign.payload));
}
await new Promise((resolve) => setTimeout(resolve, 1250));
const volunteerContacts = await api(followupVolunteerCookie, "/api/v1/contacts?limit=50&offset=0");
if (volunteerContacts.status !== 200 || !volunteerContacts.payload?.data?.some((contact) => contact.id === contactId)) {
  throw new Error("Follow-up Volunteer could not read the contact currently assigned to them.");
}
const fieldWorkerAfterHandoff = await api(workerCookie, "/api/v1/contacts?limit=50&offset=0");
if (fieldWorkerAfterHandoff.status !== 200 || fieldWorkerAfterHandoff.payload?.data?.some((contact) => contact.id === contactId)) {
  throw new Error("Previous Field Worker retained contact access after responsibility was transferred.");
}
const prayerContactBoundary = await api(prayerIntercessorCookie, "/api/v1/contacts?limit=50&offset=0");
if (prayerContactBoundary.status !== 403) {
  throw new Error("Prayer Intercessor unexpectedly received ordinary visitor-contact access.");
}
const volunteerTask = await api(adminCookie, "/api/v1/followup/tasks", "POST", {
  contact_id: contactId,
  team_id: teamId,
  priority: 2,
  due_at: endsAt,
  task_note: "Synthetic team-assigned follow-up for authenticated role acceptance.",
}, "qa-team-followup-" + runId);
if (volunteerTask.status !== 201) {
  throw new Error("Admin/Pastor could not create a team-assigned follow-up task: " + volunteerTask.status + " " + JSON.stringify(volunteerTask.payload));
}
const teamTaskId = volunteerTask.payload?.data?.id;
const teamLeaderTasks = await api(teamLeaderCookie, "/api/v1/followup/tasks?limit=50&offset=0&status=open");
if (teamLeaderTasks.status !== 200 || !teamLeaderTasks.payload?.data?.some((task) => task.id === teamTaskId)) {
  throw new Error("Team Leader could not read a task assigned to their active team.");
}
const outOfTeamHandoff = await api(teamLeaderCookie, `/api/v1/followup/tasks/${teamTaskId}/assign`, "POST", {
  assignee_profile_id: worker.profileId,
  reason: "Attempted handoff to a Field Worker outside the leader's team.",
});
if (outOfTeamHandoff.status !== 403 || outOfTeamHandoff.payload?.error?.code !== "FOLLOWUP_ASSIGNEE_OUTSIDE_TEAM") {
  throw new Error("Team Leader was not blocked from handing off a task outside their team.");
}
const teamHandoffPrecheck = await d1(
  `SELECT
     (SELECT COUNT(*) FROM followup_task WHERE id=? AND branch_id=? AND team_id=? AND assignee_user_id IS NULL) AS task_on_team,
     (SELECT COUNT(*) FROM staff_profile WHERE id=? AND account_status='active' AND deactivated_at IS NULL) AS target_active,
     (SELECT COUNT(*) FROM staff_team_membership WHERE staff_profile_id=? AND team_id=? AND branch_id=?
       AND revoked_at IS NULL AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)) AS target_membership,
     (SELECT COUNT(*) FROM staff_role_assignment ra JOIN role r ON r.id=ra.role_id
       WHERE ra.staff_profile_id=? AND ra.branch_id=? AND r.is_active=1 AND ra.revoked_at IS NULL
       AND ra.starts_at<=? AND (ra.ends_at IS NULL OR ra.ends_at>?)) AS target_role,
     (SELECT COUNT(*) FROM staff_profile actor
       JOIN staff_role_assignment aa ON aa.staff_profile_id=actor.id
       JOIN role ar ON ar.id=aa.role_id AND ar.is_active=1
       JOIN role_capability ac ON ac.role_id=ar.id
       JOIN capability cap ON cap.id=ac.capability_id AND cap.code='followup.assign' AND cap.is_active=1
       WHERE actor.auth_user_id=? AND actor.account_status='active'
         AND aa.branch_id=? AND aa.revoked_at IS NULL AND aa.starts_at<=?
         AND (aa.ends_at IS NULL OR aa.ends_at>?) AND ac.scope_mode='team') AS actor_team_assign_grant`,
  [teamTaskId, branchId, teamId, followupVolunteer.profileId, followupVolunteer.profileId,
   teamId, branchId, new Date().toISOString(), new Date().toISOString(),
   followupVolunteer.profileId, branchId, new Date().toISOString(), new Date().toISOString(),
   teamLeader.userId, branchId, new Date().toISOString(), new Date().toISOString()],
);
console.log("FOLLOWUP_REASSIGNMENT_PRECHECK", JSON.stringify(teamHandoffPrecheck[0] ?? {}));

const teamTaskHandoff = await api(teamLeaderCookie, `/api/v1/followup/tasks/${teamTaskId}/assign`, "POST", {
  assignee_profile_id: followupVolunteer.profileId,
  reason: "Team Leader transfers this task to the responsible Follow-up Volunteer.",
});
if (teamTaskHandoff.status !== 200) {
  throw new Error("Team Leader could not hand off a team task to an active team member: " + teamTaskHandoff.status + " " + JSON.stringify(teamTaskHandoff.payload));
}
const volunteerTasks = await api(followupVolunteerCookie, "/api/v1/followup/tasks?limit=50&offset=0&status=open");
if (volunteerTasks.status !== 200 || !volunteerTasks.payload?.data?.some((task) => task.id === teamTaskId)) {
  throw new Error("Follow-up Volunteer could not read the task handed off to them.");
}
const volunteerHandoffDenied = await api(followupVolunteerCookie, `/api/v1/followup/tasks/${teamTaskId}/assign`, "POST", {
  team_id: teamId,
  reason: "Attempted a handoff without the assignment capability.",
});
if (volunteerHandoffDenied.status !== 403) {
  throw new Error("Follow-up Volunteer unexpectedly gained the task-assignment capability.");
}
const prayerTaskBoundary = await api(prayerIntercessorCookie, "/api/v1/followup/tasks?limit=50&offset=0");
if (prayerTaskBoundary.status !== 403) {
  throw new Error("Prayer Intercessor unexpectedly received ordinary follow-up task access.");
}
console.log("SIX_ROLE_CONTACT_AND_TEAM_HANDOFF_BOUNDARIES_PASSED");

const assignment = await api(adminCookie, `/api/v1/events/${eventId}/staff-assignments`, "POST", {
  staff_auth_user_id: worker.userId,
  assignment_role: "owner",
  starts_at: startsAt,
  ends_at: endsAt,
});
if (assignment.status !== 201) throw new Error(`Event assignment failed: ${assignment.status} ${JSON.stringify(assignment.payload)}`);

const crossBranchEventRegistration = await api(
  otherBranchWorkerCookie,
  "/api/v1/events/" + eventId + "/registrations",
  "POST",
  {
    idempotency_key: "qa-cross-branch-register-" + runId,
    attendee_name: "Cross-branch unauthorized guest",
    attendee_phone: null,
  },
  "qa-cross-branch-register-" + runId,
  otherBranchId,
);
if (![403, 404].includes(crossBranchEventRegistration.status)) {
  throw new Error("Other-branch worker registered an attendee for an event outside their branch.");
}
const crossBranchEventRegistrationCount = (await d1(
  "SELECT COUNT(*) AS count FROM event_registration WHERE event_id=?",
  [eventId],
))[0]?.count;
if (Number(crossBranchEventRegistrationCount) !== 0) {
  throw new Error("Cross-branch event registration denial still created a registration.");
}

const unassignedRegistration = await api(unassignedCookie, `/api/v1/events/${eventId}/registrations`, "POST", {
  idempotency_key: `qa-unassigned-register-${runId}`,
  attendee_name: "Unauthorized QA Guest",
  attendee_phone: null,
});
if (unassignedRegistration.status !== 403 || unassignedRegistration.payload?.error?.code !== "EVENT_REGISTRATION_NOT_AUTHORIZED") {
  throw new Error(`Unassigned Field Worker registration was not denied: ${unassignedRegistration.status} ${JSON.stringify(unassignedRegistration.payload)}`);
}

const registration = await api(workerCookie, `/api/v1/events/${eventId}/registrations`, "POST", {
  idempotency_key: `qa-register-${runId}`,
  attendee_name: "Synthetic QA Guest",
  attendee_phone: null,
});
if (registration.status !== 201) throw new Error(`Event registration failed: ${registration.status} ${JSON.stringify(registration.payload)}`);
const registrationId = registration.payload?.data?.registration?.id;
if (!registrationId) throw new Error("Event registration response did not include a registration id");

const unassignedCheckin = await api(unassignedCookie, `/api/v1/events/${eventId}/registrations/${registrationId}/check-in`, "POST", {
  idempotency_key: `qa-unassigned-checkin-${runId}`,
});
if (unassignedCheckin.status !== 403 || unassignedCheckin.payload?.error?.code !== "EVENT_CHECKIN_NOT_AUTHORIZED") {
  throw new Error(`Unassigned Field Worker check-in was not denied: ${unassignedCheckin.status} ${JSON.stringify(unassignedCheckin.payload)}`);
}

const checkin = await api(workerCookie, `/api/v1/events/${eventId}/registrations/${registrationId}/check-in`, "POST", {
  idempotency_key: `qa-checkin-${runId}`,
});
if (checkin.status !== 201) throw new Error(`Event check-in failed: ${checkin.status} ${JSON.stringify(checkin.payload)}`);

const closeoutSubmit = await api(adminCookie, `/api/v1/events/${eventId}/closeout/submit`, "POST", {
  idempotency_key: `qa-closeout-submit-${runId}`,
  summary_notes: "Synthetic authenticated acceptance run",
});
if (closeoutSubmit.status !== 201) throw new Error(`Event closeout submission failed: ${closeoutSubmit.status} ${JSON.stringify(closeoutSubmit.payload)}`);

const closeoutReturn = await api(reviewerCookie, `/api/v1/events/${eventId}/closeout/review`, "POST", {
  idempotency_key: `qa-closeout-return-${runId}`,
  decision: "returned",
  reason: "Synthetic acceptance return: clarify final attendance and transport counts.",
});
if (closeoutReturn.status !== 200 || closeoutReturn.payload?.data?.closeout?.status !== "returned") {
  throw new Error(`Event closeout return failed: ${closeoutReturn.status} ${JSON.stringify(closeoutReturn.payload)}`);
}

const closeoutResubmit = await api(adminCookie, `/api/v1/events/${eventId}/closeout/submit`, "POST", {
  idempotency_key: `qa-closeout-resubmit-${runId}`,
  summary_notes: "Corrected synthetic closeout after reviewer feedback.",
});
if (closeoutResubmit.status !== 201 || closeoutResubmit.payload?.data?.closeout?.status !== "submitted") {
  throw new Error(`Event closeout resubmission failed: ${closeoutResubmit.status} ${JSON.stringify(closeoutResubmit.payload)}`);
}

const closeoutReview = await api(reviewerCookie, `/api/v1/events/${eventId}/closeout/review`, "POST", {
  idempotency_key: `qa-closeout-approve-${runId}`,
  decision: "approved",
  reason: null,
});
if (closeoutReview.status !== 200 || closeoutReview.payload?.data?.closeout?.status !== "approved") {
  throw new Error(`Event closeout review failed: ${closeoutReview.status} ${JSON.stringify(closeoutReview.payload)}`);
}

console.log("EVENT_REGISTRATION_CHECKIN_CLOSEOUT_RETURN_RESUBMIT_PASSED");

const report = await api(workerCookie, "/api/v1/reports", "POST", {
  branch_id: branchId,
  report_type: "daily_evangelism",
  period_start: today,
  period_end: today,
  team_id: null,
  event_id: null,
  contacts_captured: 1,
  gospel_presentations: 1,
  decisions_for_christ: 1,
  followup_required: 1,
  followup_completed: 0,
  visits_completed: 0,
  calls_completed: 0,
  events_supported: 0,
  attendance_count: 0,
});
if (report.status !== 201) throw new Error(`Ministry report submission failed: ${report.status} ${JSON.stringify(report.payload)}`);
const reportId = report.payload?.data?.id;
if (!reportId) throw new Error("Ministry report response did not include a report id");

const otherBranchReport = await api(otherBranchWorkerCookie, "/api/v1/reports", "POST", {
  branch_id: otherBranchId,
  report_type: "daily_evangelism",
  period_start: today,
  period_end: today,
  team_id: null,
  event_id: null,
  contacts_captured: 1,
  gospel_presentations: 1,
  decisions_for_christ: 0,
  followup_required: 1,
  followup_completed: 0,
  visits_completed: 0,
  calls_completed: 0,
  events_supported: 0,
  attendance_count: 0,
}, undefined, otherBranchId);
if (otherBranchReport.status !== 201 || !otherBranchReport.payload?.data?.id) {
  throw new Error("Other-branch ministry report creation failed: " + otherBranchReport.status + " " + JSON.stringify(otherBranchReport.payload));
}
const otherBranchReportId = otherBranchReport.payload.data.id;
const otherBranchReportRead = await api(otherBranchWorkerCookie, "/api/v1/reports/" + otherBranchReportId, "GET", undefined, undefined, otherBranchId);
if (otherBranchReportRead.status !== 200) {
  throw new Error("Other-branch report author could not read their own submitted report.");
}
const primaryBranchReportRead = await api(reviewerCookie, "/api/v1/reports/" + otherBranchReportId, "GET");
if (![403, 404].includes(primaryBranchReportRead.status)) {
  throw new Error("Primary-branch Coordinator read a report from another branch.");
}
const primaryBranchReportReview = await api(reviewerCookie, "/api/v1/reports/" + otherBranchReportId + "/review", "POST", {
  decision: "approved",
  comment: "This cross-branch review must be rejected.",
});
if (![403, 404].includes(primaryBranchReportReview.status)) {
  throw new Error("Primary-branch Coordinator reviewed a report from another branch.");
}
const otherBranchReportAfterDeniedReview = (await d1(
  "SELECT status FROM ministry_report WHERE id=?",
  [otherBranchReportId],
))[0];
if (otherBranchReportAfterDeniedReview?.status !== "submitted") {
  throw new Error("Denied cross-branch report review changed the other-branch report.");
}
console.log("CROSS_BRANCH_REPORT_READ_AND_REVIEW_ISOLATION_PASSED");

console.log("REPORT_CREATE_STATUS", report.payload?.data?.status);
console.log("REPORT_D1_STATUS_AFTER_CREATE", JSON.stringify(await d1("SELECT status,last_action_id FROM ministry_report WHERE id=?", [reportId])));

const selfReview = await api(workerCookie, `/api/v1/reports/${reportId}/review`, "POST", {
  decision: "approved",
  comment: "This self-review must be rejected",
});
if (selfReview.status !== 403 || selfReview.payload?.error?.code !== "SELF_REVIEW_FORBIDDEN") {
  throw new Error(`Field Worker self-review was not rejected: ${selfReview.status} ${JSON.stringify(selfReview.payload)}`);
}
console.log("REPORT_D1_STATUS_AFTER_SELF_REVIEW", JSON.stringify(await d1("SELECT status,author_profile_id FROM ministry_report WHERE id=?", [reportId])));

console.log("REPORT_SUBMIT_AND_SELF_REVIEW_BOUNDARY_PASSED");

const reportReturn = await api(reviewerCookie, `/api/v1/reports/${reportId}/review`, "POST", {
  decision: "returned",
  comment: "Synthetic acceptance return: clarify the follow-up completion count.",
});
if (reportReturn.status !== 200 || reportReturn.payload?.data?.report?.status !== "returned") {
  throw new Error(`Ministry report return failed: ${reportReturn.status} ${JSON.stringify(reportReturn.payload)}`);
}

const reportResubmit = await api(workerCookie, `/api/v1/reports/${reportId}/resubmit`, "POST", {
  contacts_captured: 1,
  gospel_presentations: 1,
  decisions_for_christ: 1,
  followup_required: 1,
  followup_completed: 1,
  visits_completed: 0,
  calls_completed: 0,
  events_supported: 0,
  attendance_count: 0,
});
if (reportResubmit.status !== 200 || reportResubmit.payload?.data?.report?.status !== "submitted") {
  throw new Error(`Ministry report resubmission failed: ${reportResubmit.status} ${JSON.stringify(reportResubmit.payload)}`);
}

const reportReview = await api(reviewerCookie, `/api/v1/reports/${reportId}/review`, "POST", {
  decision: "approved",
  comment: "Synthetic authenticated approval after corrected resubmission",
});
if (reportReview.status !== 200 || reportReview.payload?.data?.report?.status !== "approved") {
  throw new Error(`Ministry report review failed: ${reportReview.status} ${JSON.stringify(reportReview.payload)}`);
}

const reportState = (await d1("SELECT status FROM ministry_report WHERE id=?", [reportId]))[0];
const reviewHistory = (await d1("SELECT decision FROM report_review_event WHERE report_id=? ORDER BY created_at ASC", [reportId])).map((row) => row.decision);
const registrationState = (await d1("SELECT status FROM event_registration WHERE id=?", [registrationId]))[0];
const checkinCount = (await d1("SELECT COUNT(*) AS count FROM event_checkin WHERE event_id=?", [eventId]))[0]?.count;
const closeoutState = (await d1("SELECT status FROM event_closeout WHERE event_id=?", [eventId]))[0];
const closeoutHistory = (await d1("SELECT action FROM event_closeout_event e JOIN event_closeout c ON c.id=e.closeout_id WHERE c.event_id=? ORDER BY e.created_at ASC", [eventId])).map((row) => row.action);
const eventNotice = (await d1("SELECT target_type,target_id FROM staff_notification WHERE recipient_user_id=? AND category='event_assigned' ORDER BY created_at DESC LIMIT 1", [worker.userId]))[0];
const reportNotice = (await d1("SELECT target_type,target_id FROM staff_notification WHERE recipient_user_id=? AND category='report_reviewed' ORDER BY created_at DESC LIMIT 1", [worker.userId]))[0];
const followupState = (await d1("SELECT status FROM followup_task WHERE id=?", [followupTaskId]))[0];
const followupEventCount = (await d1("SELECT COUNT(*) AS count FROM followup_task_event WHERE task_id=?", [followupTaskId]))[0]?.count;
const followupNotice = (await d1("SELECT target_type,target_id FROM staff_notification WHERE recipient_user_id=? AND category='followup_assigned' ORDER BY created_at DESC LIMIT 1", [worker.userId]))[0];

// The owner-approved six-role policy deliberately grants no staff role the
// ability to create or share prayer requests. Verify that default before adding
// temporary grants to this disposable D1 fixture so assigned-inbox reads can
// still be exercised end-to-end without changing production authorization.
const prayerDefaultPolicy = await d1(
  `SELECT COUNT(*) AS count
   FROM role_capability rc
   JOIN role r ON r.id=rc.role_id
   JOIN capability c ON c.id=rc.capability_id
   WHERE r.code='admin_pastor'
     AND c.code IN ('prayer.request.create','prayer.request.share')`,
);
if (Number(prayerDefaultPolicy[0]?.count) !== 0) {
  throw new Error("Production-safe default unexpectedly grants prayer creation or sharing to Admin/Pastor.");
}
const defaultPrayerShareDenied = await api(
  adminCookie,
  "/api/v1/pastoral/prayer/requests/" + randomUUID() + "/shares",
  "POST",
  {},
);
if (defaultPrayerShareDenied.status !== 403) {
  throw new Error("Admin/Pastor unexpectedly received prayer-sharing access under the default role policy.");
}
console.log("PRAYER_DEFAULT_POLICY_DENIAL_PASSED");

await d1(
  `INSERT OR IGNORE INTO role_capability(role_id,capability_id,scope_mode,created_at)
   SELECT r.id,c.id,'branch',?
   FROM role r
   JOIN capability c ON c.code IN ('prayer.request.create','prayer.request.share')
   WHERE r.code='admin_pastor'`,
  [new Date().toISOString()],
);
const prayerTestGrantCount = await d1(
  `SELECT COUNT(*) AS count
   FROM role_capability rc
   JOIN role r ON r.id=rc.role_id
   JOIN capability c ON c.id=rc.capability_id
   WHERE r.code='admin_pastor'
     AND c.code IN ('prayer.request.create','prayer.request.share')
     AND rc.scope_mode='branch'`,
);
if (Number(prayerTestGrantCount[0]?.count) !== 2) {
  throw new Error("Disposable prayer acceptance fixture did not receive its two temporary grants.");
}

const prayerRequestId = randomUUID();
const unassignedPrayerRequestId = randomUUID();
const prayerCreatedAt = new Date().toISOString();
const assignedPrayerNarrative = "Synthetic confidential prayer request for assigned-intercessor acceptance.";
const unassignedPrayerNarrative = "Synthetic prayer request that must remain outside the assigned inbox.";
await d1(
  "INSERT INTO prayer_request(id,branch_id,contact_id,created_by,request_text,status,sensitivity,expires_at,answered_at,created_at,updated_at) VALUES(?,?,NULL,?,?,'open','highly_restricted',NULL,NULL,?,?)",
  [prayerRequestId, branchId, admin.userId, assignedPrayerNarrative, prayerCreatedAt, prayerCreatedAt],
);
await d1(
  "INSERT INTO prayer_request(id,branch_id,contact_id,created_by,request_text,status,sensitivity,expires_at,answered_at,created_at,updated_at) VALUES(?,?,NULL,?,?,'open','highly_restricted',NULL,NULL,?,?)",
  [unassignedPrayerRequestId, branchId, admin.userId, unassignedPrayerNarrative, prayerCreatedAt, prayerCreatedAt],
);
const prayerShareStartsAt = new Date(Date.now() + 3000).toISOString();
const prayerShare = await api(adminCookie, "/api/v1/pastoral/prayer/requests/" + prayerRequestId + "/shares", "POST", {
  staff_profile_id: prayerIntercessor.profileId,
  purpose: "Assigned prayer support for the confidential acceptance request.",
  starts_at: prayerShareStartsAt,
});
if (prayerShare.status !== 201 || !prayerShare.payload?.assignment_id || !prayerShare.payload?.share_id) {
  throw new Error("Temporary Admin/Pastor prayer fixture grant could not assign the synthetic request: " + prayerShare.status + " " + JSON.stringify(prayerShare.payload));
}
await new Promise((resolve) => setTimeout(resolve, 3200));
const assignedPrayerInbox = await api(prayerIntercessorCookie, "/api/v1/pastoral/prayer/assigned?limit=25&offset=0");
const assignedPrayerRows = assignedPrayerInbox.payload?.data?.requests ?? [];
if (assignedPrayerInbox.status !== 200 ||
    !assignedPrayerRows.some((request) => request.id === prayerRequestId) ||
    assignedPrayerRows.some((request) => request.id === unassignedPrayerRequestId)) {
  throw new Error("Prayer Intercessor assigned inbox did not enforce live assignment scope.");
}
const assignedPrayerRead = await api(
  prayerIntercessorCookie,
  "/api/v1/pastoral/prayer/requests/" + prayerRequestId + "/read",
  "POST",
  { branch_id: branchId, access_mode: "assigned" },
);
if (assignedPrayerRead.status !== 200 ||
    assignedPrayerRead.payload?.data?.request?.request_text !== assignedPrayerNarrative) {
  throw new Error("Assigned Prayer Intercessor could not read the assigned prayer narrative.");
}
const unassignedPrayerRead = await api(
  prayerIntercessorCookie,
  "/api/v1/pastoral/prayer/requests/" + unassignedPrayerRequestId + "/read",
  "POST",
  { branch_id: branchId, access_mode: "assigned" },
);
if (unassignedPrayerRead.status !== 404) {
  throw new Error("Prayer Intercessor read a prayer request without a live assignment.");
}
const crossRolePrayerRead = await api(
  workerCookie,
  "/api/v1/pastoral/prayer/requests/" + prayerRequestId + "/read",
  "POST",
  { branch_id: branchId, access_mode: "assigned" },
);
if (crossRolePrayerRead.status !== 403) {
  throw new Error("Field Worker unexpectedly read an assigned prayer narrative.");
}
const prayerAssignmentState = (await d1(
  "SELECT intercessor_user_id,revoked_at FROM prayer_assignment WHERE id=?",
  [prayerShare.payload.assignment_id],
))[0];
const prayerAuditCount = (await d1(
  "SELECT COUNT(*) AS count FROM prayer_access_audit WHERE prayer_request_id=? AND actor_user_id=?",
  [prayerRequestId, prayerIntercessor.userId],
))[0]?.count;
const sensitivePrayerAuditCount = (await d1(
  "SELECT COUNT(*) AS count FROM sensitive_record_access_audit WHERE record_type='prayer_request' AND record_id=? AND actor_profile_id=?",
  [prayerRequestId, prayerIntercessor.profileId],
))[0]?.count;
if (prayerAssignmentState?.intercessor_user_id !== prayerIntercessor.userId ||
    prayerAssignmentState?.revoked_at !== null ||
    Number(prayerAuditCount) < 1 ||
    Number(sensitivePrayerAuditCount) < 1) {
  throw new Error("Assigned prayer workflow did not persist its assignment and both sensitive-read audit records.");
}
await d1(
  `DELETE FROM role_capability
   WHERE role_id=(SELECT id FROM role WHERE code='admin_pastor')
     AND capability_id IN (SELECT id FROM capability WHERE code IN ('prayer.request.create','prayer.request.share'))
     AND scope_mode='branch'`,
);
const prayerGrantsAfterCleanup = await d1(
  `SELECT COUNT(*) AS count
   FROM role_capability rc
   JOIN role r ON r.id=rc.role_id
   JOIN capability c ON c.id=rc.capability_id
   WHERE r.code='admin_pastor'
     AND c.code IN ('prayer.request.create','prayer.request.share')`,
);
const prayerShareAfterCleanup = await api(
  adminCookie,
  "/api/v1/pastoral/prayer/requests/" + prayerRequestId + "/shares",
  "POST",
  {},
);
if (Number(prayerGrantsAfterCleanup[0]?.count) !== 0 || prayerShareAfterCleanup.status !== 403) {
  throw new Error("Temporary prayer fixture grants were not fully removed after acceptance.");
}
console.log("PRAYER_TEST_GRANTS_REMOVED");
console.log("ASSIGNED_PRAYER_ACCESS_AND_CROSS_ROLE_DENIAL_PASSED");

const scheduledReminderDb = {
  prepare(sql) {
    let values = [];
    return {
      bind(...nextValues) { values = nextValues; return this; },
      async all() { return { results: await d1(sql, values) }; },
      async run() {
        await d1(sql, values);
        return { success: true, meta: { changes: 1 } };
      },
    };
  },
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  },
};
const scheduledReminderFirstRun = await processDueFollowupReminders(
  { DB: scheduledReminderDb },
  Date.now(),
);
if (scheduledReminderFirstRun.due_tasks_found !== 1 ||
    scheduledReminderFirstRun.notifications_created !== 1) {
  throw new Error("Scheduled follow-up processor did not create exactly one due-task reminder: " + JSON.stringify(scheduledReminderFirstRun));
}
const scheduledReminderReplay = await processDueFollowupReminders(
  { DB: scheduledReminderDb },
  Date.now(),
);
if (scheduledReminderReplay.due_tasks_found !== 0 ||
    scheduledReminderReplay.notifications_created !== 0) {
  throw new Error("Repeated scheduled invocation created or selected a duplicate reminder: " + JSON.stringify(scheduledReminderReplay));
}
const rescheduledReminderDueAt = new Date(Date.now() - 30_000).toISOString();
const reminderReschedule = await api(
  workerCookie,
  "/api/v1/followup/tasks/" + scheduledReminderTaskId,
  "PATCH",
  { due_at: rescheduledReminderDueAt },
);
if (reminderReschedule.status !== 200 ||
    reminderReschedule.payload?.data?.due_at !== rescheduledReminderDueAt) {
  throw new Error("Scheduled reminder fixture could not be rescheduled through the authenticated follow-up workflow.");
}
const scheduledReminderAfterReschedule = await processDueFollowupReminders(
  { DB: scheduledReminderDb },
  Date.now(),
);
if (scheduledReminderAfterReschedule.due_tasks_found !== 1 ||
    scheduledReminderAfterReschedule.notifications_created !== 1) {
  throw new Error("Rescheduling a due task did not produce one new idempotent reminder: " + JSON.stringify(scheduledReminderAfterReschedule));
}
const reminderReassignment = await api(
  adminCookie,
  "/api/v1/followup/tasks/" + scheduledReminderTaskId + "/assign",
  "POST",
  {
    assignee_profile_id: followupVolunteer.profileId,
    reason: "Synthetic acceptance verifies due reminders follow the current assignee.",
  },
);
if (reminderReassignment.status !== 200) {
  throw new Error("Admin/Pastor could not reassign the scheduled reminder fixture: " + reminderReassignment.status + " " + JSON.stringify(reminderReassignment.payload));
}
const scheduledReminderAfterReassignment = await processDueFollowupReminders(
  { DB: scheduledReminderDb },
  Date.now(),
);
if (scheduledReminderAfterReassignment.due_tasks_found !== 1 ||
    scheduledReminderAfterReassignment.notifications_created !== 1) {
  throw new Error("Reassigning a due task did not create one reminder for the new assignee: " + JSON.stringify(scheduledReminderAfterReassignment));
}
const scheduledReminderRows = await d1(
  "SELECT id,branch_id,recipient_user_id,category,target_type,target_id,idempotency_key FROM staff_notification WHERE target_type='followup_task' AND target_id=? AND category='system' ORDER BY created_at,id",
  [scheduledReminderTaskId],
);
const workerReminderRows = scheduledReminderRows.filter((row) => row.recipient_user_id === worker.userId);
const volunteerReminderRows = scheduledReminderRows.filter((row) => row.recipient_user_id === followupVolunteer.userId);
if (scheduledReminderRows.length !== 3 || workerReminderRows.length !== 2 ||
    volunteerReminderRows.length !== 1 ||
    scheduledReminderRows.some((row) => row.branch_id !== branchId ||
      row.target_type !== "followup_task" || row.category !== "system") ||
    new Set(scheduledReminderRows.map((row) => row.idempotency_key)).size !== 3) {
  throw new Error("Scheduled reminders did not follow due-time and current-assignee idempotency boundaries.");
}
console.log("SCHEDULED_FOLLOWUP_REMINDER_IDEMPOTENCY_RESCHEDULE_AND_REASSIGNMENT_PASSED");

const inbox = await api(workerCookie, "/api/v1/notifications?branch_id=" + branchId + "&limit=50");
if (inbox.status !== 200) throw new Error("Worker notification inbox failed: " + inbox.status + " " + JSON.stringify(inbox.payload));
const workerNotifications = inbox.payload?.data?.notifications ?? [];
const followupNotification = workerNotifications.find((notice) => notice.target_id === followupTaskId);
if (!followupNotification) throw new Error("Follow-up assignment notification was not present in the assigned worker inbox");
const scheduledReminderNotification = workerNotifications.find((notice) =>
  notice.target_id === scheduledReminderTaskId && notice.category === "system");
if (!scheduledReminderNotification) {
  throw new Error("Scheduled due reminder was not present in the current assignee's in-app inbox.");
}
const volunteerInbox = await api(followupVolunteerCookie, "/api/v1/notifications?branch_id=" + branchId + "&limit=50");
const volunteerNotifications = volunteerInbox.payload?.data?.notifications ?? [];
const reassignedReminderNotification = volunteerNotifications.find((notice) =>
  notice.target_id === scheduledReminderTaskId && notice.category === "system");
if (volunteerInbox.status !== 200 || !reassignedReminderNotification) {
  throw new Error("The new assignee did not receive the due reminder in their own in-app inbox.");
}
const adminInbox = await api(adminCookie, "/api/v1/notifications?branch_id=" + branchId + "&limit=50");
if (adminInbox.status !== 200 ||
    (adminInbox.payload?.data?.notifications ?? []).some((notice) =>
      notice.id === followupNotification.id || notice.id === scheduledReminderNotification.id ||
      notice.id === reassignedReminderNotification.id)) {
  throw new Error("Notification inbox exposed a worker notification to another staff member");
}
const readNotice = await api(workerCookie, "/api/v1/notifications/" + followupNotification.id + "/read", "POST", { branch_id: branchId });
if (readNotice.status !== 200 || readNotice.payload?.data?.updated !== true) throw new Error("Recipient could not mark their notification as read");
const crossReadNotice = await api(adminCookie, "/api/v1/notifications/" + followupNotification.id + "/read", "POST", { branch_id: branchId });
if (crossReadNotice.status !== 200 || crossReadNotice.payload?.data?.updated !== false) throw new Error("A different staff member was able to mark another recipient's notification as read");
const readAll = await api(workerCookie, "/api/v1/notifications/read-all", "POST", { branch_id: branchId });
if (readAll.status !== 200) throw new Error("Recipient could not mark all notifications as read");
const inboxAfterReadAll = await api(workerCookie, "/api/v1/notifications?branch_id=" + branchId + "&limit=50");
if (inboxAfterReadAll.payload?.data?.unread_count !== 0) throw new Error("Notification unread count did not reach zero after read-all");



const authenticatedSessionResponse = await fetchWithTimeout(workerUrl + "/api/auth/get-session", {
  headers: { origin, cookie: adminCookie },
});
const authenticatedSessionPayload = await authenticatedSessionResponse.json().catch(() => null);
if (authenticatedSessionResponse.status !== 200 ||
    authenticatedSessionPayload?.user?.id !== admin.userId ||
    !authenticatedSessionPayload?.session?.id) {
  throw new Error("Authenticated Better Auth session retrieval failed.");
}
console.log("AUTHENTICATED_SESSION_RETRIEVAL_PASSED");

// Exercise Better Auth's deferred refresh contract against the real temporary D1 session.
const adminSessionId = authenticatedSessionPayload.session.id;
const refreshDueExpiry = Date.now() + 5 * 24 * 60 * 60 * 1000;
await d1("UPDATE session SET expiresAt=? WHERE id=?", [refreshDueExpiry, adminSessionId]);
const sessionNeedsRefreshResponse = await fetchWithTimeout(workerUrl + "/api/auth/get-session", {
  headers: { origin, cookie: adminCookie },
});
const sessionNeedsRefreshPayload = await sessionNeedsRefreshResponse.json().catch(() => null);
const sessionAfterRead = (await d1("SELECT expiresAt FROM session WHERE id=?", [adminSessionId]))[0];
if (sessionNeedsRefreshResponse.status !== 200 ||
    sessionNeedsRefreshPayload?.needsRefresh !== true ||
    Number(sessionAfterRead?.expiresAt) !== refreshDueExpiry) {
  throw new Error("Deferred session refresh GET did not remain read-only and report needsRefresh.");
}
const sessionRefreshResponse = await fetchWithTimeout(workerUrl + "/api/auth/get-session", {
  method: "POST",
  headers: { origin, cookie: adminCookie, "content-type": "application/json" },
  body: JSON.stringify({}),
});
const sessionRefreshPayload = await sessionRefreshResponse.json().catch(() => null);
const refreshedSessionRow = (await d1(
  "SELECT expiresAt,updatedAt FROM session WHERE id=?",
  [adminSessionId],
))[0];
const refreshedSetCookies = typeof sessionRefreshResponse.headers.getSetCookie === "function"
  ? sessionRefreshResponse.headers.getSetCookie()
  : [sessionRefreshResponse.headers.get("set-cookie") || ""];
const refreshedAdminCookie = refreshedSetCookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
if (sessionRefreshResponse.status !== 200 ||
    sessionRefreshPayload?.session?.id !== adminSessionId ||
    Number(refreshedSessionRow?.expiresAt) <= refreshDueExpiry ||
    !refreshedAdminCookie.includes("session_token=")) {
  throw new Error("Deferred session refresh POST did not extend the session and issue a replacement cookie.");
}
adminCookie = refreshedAdminCookie;
console.log("DEFERRED_SESSION_REFRESH_PASSED");



// Exercise a genuine first-login password gate and prove that the old credential is no longer valid.
const firstLoginCookie = await signIn(firstLoginUser, "First-login Field Worker");
const firstLoginSessionResponse = await fetchWithTimeout(workerUrl + "/api/v1/me", {
  headers: { origin, cookie: firstLoginCookie },
});
const firstLoginSessionPayload = await firstLoginSessionResponse.json().catch(() => null);
if (firstLoginSessionResponse.status !== 200 ||
    firstLoginSessionPayload?.data?.must_change_password !== true ||
    !Array.isArray(firstLoginSessionPayload?.data?.branches) ||
    firstLoginSessionPayload.data.branches.length !== 0) {
  throw new Error("First-login session hydration did not preserve the forced-password-change state.");
}
const firstLoginProtectedRead = await api(
  firstLoginCookie,
  "/api/v1/notifications?branch_id=" + branchId + "&limit=50",
);
if (firstLoginProtectedRead.status !== 403 ||
    firstLoginProtectedRead.payload?.error?.code !== "BRANCH_NOT_AUTHORIZED") {
  throw new Error("First-login account was not blocked from branch-scoped staff operations before password replacement: HTTP " +
    firstLoginProtectedRead.status + " code=" + (firstLoginProtectedRead.payload?.error?.code ?? "unexpected_response"));
}
const firstLoginPassword = "PcgQa-First-" + randomBytes(18).toString("base64url") + "-9!aA";
const firstLoginChange = await api(firstLoginCookie, "/api/v1/auth/password/change", "POST", {
  password: firstLoginPassword,
});
if (firstLoginChange.status !== 200 ||
    firstLoginChange.payload?.data?.password_changed !== true ||
    firstLoginChange.payload?.data?.must_change_password !== false) {
  throw new Error("Forced first-login password change failed: " + firstLoginChange.status + " " + JSON.stringify(firstLoginChange.payload));
}
const firstLoginState = (await d1(
  "SELECT must_change_password,password_setup_expires_at FROM staff_profile WHERE id=?",
  [firstLoginUser.profileId],
))[0];
if (Number(firstLoginState?.must_change_password) !== 0 || firstLoginState?.password_setup_expires_at !== null) {
  throw new Error("Forced first-login password gate was not cleared after password replacement.");
}
await waitForSignInRateLimitSlot();
const firstLoginOldAttempt = await fetchWithTimeout(workerUrl + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ email: firstLoginUser.email, password: firstLoginUser.password, rememberMe: false }),
});
if (firstLoginOldAttempt.status !== 401) {
  throw new Error("Old first-login credential was not rejected after password change: " + firstLoginOldAttempt.status);
}
const firstLoginUpdatedCookie = await signIn(
  { ...firstLoginUser, password: firstLoginPassword },
  "First-login replacement credential",
);
const firstLoginUpdatedMe = await api(firstLoginUpdatedCookie, "/api/v1/me");
if (firstLoginUpdatedMe.status !== 200 || firstLoginUpdatedMe.payload?.ok !== true) {
  throw new Error("Replacement first-login credential could not establish an authenticated staff session.");
}
console.log("FORCED_FIRST_PASSWORD_CHANGE_PASSED");

// Exercise the complete staff-request -> Admin/Pastor approval -> one-time credential -> forced-change flow.
const resetTargetCookie = await signIn(resetTarget, "Password-reset target");
const resetRequestResponse = await fetchWithTimeout(workerUrl + "/api/v1/auth/password-reset-requests", {
  method: "POST",
  headers: {
    origin,
    "content-type": "application/json",
    "cf-connecting-ip": "192.0.2.23",
  },
  body: JSON.stringify({ email: resetTarget.email }),
});
const resetRequestPayload = await resetRequestResponse.json().catch(() => null);
if (resetRequestResponse.status !== 200 || resetRequestPayload?.ok !== true) {
  throw new Error("Staff password-reset request failed: " + resetRequestResponse.status + " " + JSON.stringify(resetRequestPayload));
}
const pendingResetList = await api(adminCookie, "/api/v1/admin/password-reset-requests");
if (pendingResetList.status !== 200 || !Array.isArray(pendingResetList.payload?.data)) {
  throw new Error("Admin/Pastor could not list pending password-reset requests.");
}
const pendingReset = pendingResetList.payload.data.find((item) => item.email === resetTarget.email);
if (!pendingReset?.id) throw new Error("Staff password-reset request was not visible to the Admin/Pastor.");
const resetApproval = await api(
  adminCookie,
  "/api/v1/admin/password-reset-requests/" + pendingReset.id + "/approve",
  "POST",
  {
    branch_id: branchId,
    reason: "Synthetic acceptance verifies the approved password recovery lifecycle.",
  },
);
const temporaryPassword = resetApproval.payload?.data?.temporary_password;
if (resetApproval.status !== 200 ||
    resetApproval.payload?.data?.status !== "approved" ||
    typeof temporaryPassword !== "string" ||
    resetApproval.payload?.data?.temporary_password_sent !== false ||
    resetApproval.payload?.data?.manual_handoff_required !== true ||
    resetApproval.payload?.data?.must_change_password !== true) {
  throw new Error("Admin/Pastor password-reset approval failed or returned an unsafe handoff result: HTTP " +
    resetApproval.status + " code=" + (resetApproval.payload?.error?.code ?? "unexpected_response"));
}
const resetOldSession = await api(resetTargetCookie, "/api/v1/me");
if (resetOldSession.status !== 401) {
  throw new Error("Password reset did not revoke the target staff member's pre-existing session.");
}
await waitForSignInRateLimitSlot();
const resetOldCredentialAttempt = await fetchWithTimeout(workerUrl + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ email: resetTarget.email, password: resetTarget.password, rememberMe: false }),
});
if (resetOldCredentialAttempt.status !== 401) {
  throw new Error("Old password was not rejected after Admin/Pastor reset: " + resetOldCredentialAttempt.status);
}
const temporaryCookie = await signIn(
  { ...resetTarget, password: temporaryPassword },
  "Admin-approved temporary password",
);
const resetPassword = "PcgQa-Reset-" + randomBytes(18).toString("base64url") + "-9!aA";
const resetPasswordChange = await api(temporaryCookie, "/api/v1/auth/password/change", "POST", {
  password: resetPassword,
});
if (resetPasswordChange.status !== 200 ||
    resetPasswordChange.payload?.data?.password_changed !== true ||
    resetPasswordChange.payload?.data?.must_change_password !== false) {
  throw new Error("Admin-approved temporary password could not be replaced: " +
    resetPasswordChange.status + " " + JSON.stringify(resetPasswordChange.payload));
}
const resetTargetState = (await d1(
  "SELECT must_change_password,password_setup_expires_at FROM staff_profile WHERE id=?",
  [resetTarget.profileId],
))[0];
const resetRequestState = (await d1(
  "SELECT status FROM staff_password_reset_request WHERE id=?",
  [pendingReset.id],
))[0];
const resetAuditEvents = await d1(
  "SELECT event_type FROM staff_password_reset_audit WHERE request_id=? ORDER BY created_at",
  [pendingReset.id],
);
if (Number(resetTargetState?.must_change_password) !== 0 ||
    resetTargetState?.password_setup_expires_at !== null ||
    resetRequestState?.status !== "completed" ||
    !["requested", "approved", "reset_completed"].every((eventType) =>
      resetAuditEvents.some((row) => row.event_type === eventType))) {
  throw new Error("Password-reset completion, forced-change flag or audit history did not persist correctly.");
}
const resetUpdatedCookie = await signIn(
  { ...resetTarget, password: resetPassword },
  "Password-reset replacement credential",
);
const resetUpdatedMe = await api(resetUpdatedCookie, "/api/v1/me");
if (resetUpdatedMe.status !== 200 || resetUpdatedMe.payload?.ok !== true) {
  throw new Error("Replacement password could not establish a staff session after recovery.");
}
console.log("ADMIN_APPROVED_PASSWORD_RESET_AND_FORCED_CHANGE_PASSED");

// A successful UI logout must be backed by server-side session revocation.
const signOutResponse = await fetchWithTimeout(workerUrl + "/api/auth/sign-out", {
  method: "POST",
  headers: { origin, cookie: resetUpdatedCookie, "content-type": "application/json" },
  body: JSON.stringify({}),
});
if (!signOutResponse.ok) {
  throw new Error("Better Auth server sign-out failed: " + signOutResponse.status + " " + await signOutResponse.text());
}
const afterSignOut = await api(resetUpdatedCookie, "/api/v1/me");
if (afterSignOut.status !== 401) {
  throw new Error("Server-confirmed sign-out did not revoke the authenticated session.");
}

console.log("SERVER_CONFIRMED_SIGN_OUT_PASSED");

// Exercise team and service-area administration through the same Worker routes
// used by the staff workspace, including audited membership and coverage changes.
const createdTeam = await api(adminCookie, "/api/v1/teams", "POST", {
  branch_id: branchId,
  name: "QA Acceptance Team " + runId,
  description: "Temporary API acceptance team",
});
if (createdTeam.status !== 201 || !createdTeam.payload?.data?.id) {
  throw new Error("Admin/Pastor could not create a team through the staff API: HTTP " +
    createdTeam.status + " code=" + (createdTeam.payload?.error?.code ?? "unexpected_response"));
}
const managedTeamId = createdTeam.payload.data.id;
const listedTeams = await api(adminCookie, "/api/v1/teams?branch_id=" + branchId);
if (listedTeams.status !== 200 ||
    !(listedTeams.payload?.data?.teams ?? []).some((team) => team.id === managedTeamId)) {
  throw new Error("Created team did not appear in the authenticated team directory.");
}
const memberAdd = await api(
  adminCookie,
  "/api/v1/teams/" + managedTeamId + "/members?branch_id=" + branchId,
  "POST",
  { staff_profile_id: unassigned.profileId, membership_role: "member" },
);
if (memberAdd.status !== 201 || !memberAdd.payload?.data?.id) {
  throw new Error("Admin/Pastor could not add an active branch staff member to a team.");
}
const managedMembershipId = memberAdd.payload.data.id;
const memberRoleUpdate = await api(
  adminCookie,
  "/api/v1/teams/" + managedTeamId + "/members/" + managedMembershipId + "?branch_id=" + branchId,
  "PATCH",
  { membership_role: "leader" },
);
if (memberRoleUpdate.status !== 200 || memberRoleUpdate.payload?.data?.membership_role !== "leader") {
  throw new Error("Team membership role update did not persist.");
}
const memberRevoke = await api(
  adminCookie,
  "/api/v1/teams/" + managedTeamId + "/members/" + managedMembershipId + "/revoke?branch_id=" + branchId,
  "POST",
);
if (memberRevoke.status !== 200) throw new Error("Team membership revocation failed.");
const membershipAudit = await d1(
  "SELECT action FROM team_management_audit WHERE target_id=? ORDER BY created_at",
  [managedMembershipId],
);
const membershipState = (await d1(
  "SELECT revoked_at FROM staff_team_membership WHERE id=?",
  [managedMembershipId],
))[0];
if (!membershipState?.revoked_at ||
    !["team.member.added", "team.member.role_changed", "team.member.revoked"].every((action) =>
      membershipAudit.some((item) => item.action === action))) {
  throw new Error("Team membership history or audit trail was not preserved after revocation.");
}

const createdArea = await api(adminCookie, "/api/v1/areas", "POST", {
  branch_id: branchId,
  name: "QA Service Area " + runId,
  code: "QA" + String(runId).slice(-6),
});
if (createdArea.status !== 201 || !createdArea.payload?.data?.id) {
  throw new Error("Admin/Pastor could not create a service area through the staff API.");
}
const managedAreaId = createdArea.payload.data.id;
const listedAreas = await api(adminCookie, "/api/v1/areas?branch_id=" + branchId);
if (listedAreas.status !== 200 ||
    !(listedAreas.payload?.data?.areas ?? []).some((area) => area.id === managedAreaId)) {
  throw new Error("Created service area did not appear in the authenticated service-area directory.");
}
const coverageAdd = await api(
  adminCookie,
  "/api/v1/areas/" + managedAreaId + "/coverage?branch_id=" + branchId,
  "POST",
  { staff_profile_id: unassigned.profileId },
);
if (coverageAdd.status !== 201 || !coverageAdd.payload?.data?.id) {
  throw new Error("Active staff member could not be assigned to service-area coverage.");
}
const managedCoverageId = coverageAdd.payload.data.id;
const coverageRevoke = await api(
  adminCookie,
  "/api/v1/areas/" + managedAreaId + "/coverage/" + managedCoverageId + "/revoke?branch_id=" + branchId,
  "POST",
);
if (coverageRevoke.status !== 200) throw new Error("Service-area coverage revocation failed.");
const coverageAudit = await d1(
  "SELECT action FROM team_management_audit WHERE target_id=? ORDER BY created_at",
  [managedCoverageId],
);
const coverageState = (await d1(
  "SELECT revoked_at FROM staff_area_coverage WHERE id=?",
  [managedCoverageId],
))[0];
if (!coverageState?.revoked_at ||
    !["area.coverage.added", "area.coverage.revoked"].every((action) =>
      coverageAudit.some((item) => item.action === action))) {
  throw new Error("Service-area coverage history or audit trail was not preserved.");
}
console.log("TEAM_AND_SERVICE_AREA_ADMINISTRATION_PASSED");

// Exercise announcements and church-content drafts end-to-end. Drafts must
// remain private and must not be mistaken for public/published content.
const announcementCreate = await api(adminCookie, "/api/v1/announcements", "POST", {
  branch_id: branchId,
  title: "QA announcement " + runId,
  body: "Temporary announcement draft for authenticated API acceptance.",
});
if (announcementCreate.status !== 201 ||
    announcementCreate.payload?.data?.status !== "draft" ||
    announcementCreate.payload?.data?.is_public !== false) {
  throw new Error("Announcement draft creation failed or exposed an unpublished draft.");
}
const announcementId = announcementCreate.payload.data.id;
const announcementList = await api(adminCookie, "/api/v1/announcements?branch_id=" + branchId + "&limit=50&offset=0");
if (announcementList.status !== 200 ||
    !(announcementList.payload?.data ?? []).some((item) => item.id === announcementId)) {
  throw new Error("Created announcement draft did not appear in the authenticated draft list.");
}
const announcementUpdate = await api(
  adminCookie,
  "/api/v1/announcements/" + announcementId + "?branch_id=" + branchId,
  "PATCH",
  { title: "QA announcement revised " + runId, body: "Updated synthetic announcement draft." },
);
if (announcementUpdate.status !== 200 ||
    announcementUpdate.payload?.data?.status !== "draft" ||
    announcementUpdate.payload?.data?.is_public !== false ||
    announcementUpdate.payload?.data?.title !== "QA announcement revised " + runId) {
  throw new Error("Announcement draft update changed publication state or failed to persist.");
}

const sermonCreate = await api(adminCookie, "/api/v1/content/sermons", "POST", {
  branch_id: branchId,
  title: "QA sermon draft " + runId,
  body: "Temporary sermon content draft for API acceptance only.",
  public_slug: "qa-acceptance-" + runId,
});
if (sermonCreate.status !== 201 || sermonCreate.payload?.data?.status !== "draft") {
  throw new Error("Sermon draft creation failed.");
}
const sermonId = sermonCreate.payload.data.id;
const sermonList = await api(adminCookie, "/api/v1/content/sermons?branch_id=" + branchId + "&limit=50&offset=0");
if (sermonList.status !== 200 ||
    !(sermonList.payload?.data ?? []).some((item) => item.id === sermonId && item.status === "draft")) {
  throw new Error("Created sermon draft did not appear in the authenticated content list.");
}
const sermonUpdate = await api(
  adminCookie,
  "/api/v1/content/sermons/" + sermonId + "?branch_id=" + branchId,
  "PATCH",
  { title: "QA sermon draft revised " + runId, body: "Updated temporary sermon draft." },
);
if (sermonUpdate.status !== 200 || sermonUpdate.payload?.data?.status !== "draft" ||
    sermonUpdate.payload?.data?.title !== "QA sermon draft revised " + runId) {
  throw new Error("Sermon draft update failed or changed its publication state.");
}
const contentState = (await d1(
  "SELECT status,published_at FROM sermon WHERE id=?",
  [sermonId],
))[0];
if (contentState?.status !== "draft" || contentState?.published_at !== null) {
  throw new Error("Sermon draft was unexpectedly published during draft operations.");
}
console.log("ANNOUNCEMENT_AND_CONTENT_DRAFT_LIFECYCLE_PASSED");

// Exercise calendar entry create, update, list and reason-coded cancellation.
const calendarStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const calendarEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const calendarCreate = await api(adminCookie, "/api/v1/calendar/entries", "POST", {
  branch_id: branchId,
  entry_type: "other",
  title: "QA calendar entry " + runId,
  starts_at: calendarStart,
  ends_at: calendarEnd,
});
if (calendarCreate.status !== 201 || !calendarCreate.payload?.data?.id) {
  throw new Error("Calendar entry creation failed.");
}
const calendarEntryId = calendarCreate.payload.data.id;
const calendarList = await api(adminCookie, "/api/v1/calendar/entries?branch_id=" + branchId + "&limit=100&offset=0");
if (calendarList.status !== 200 ||
    !(calendarList.payload?.data ?? []).some((item) => item.id === calendarEntryId)) {
  throw new Error("Created calendar entry did not appear in the branch calendar.");
}
const calendarUpdate = await api(
  adminCookie,
  "/api/v1/calendar/entries/" + calendarEntryId + "?branch_id=" + branchId,
  "PATCH",
  { title: "QA calendar entry revised " + runId },
);
if (calendarUpdate.status !== 200 ||
    calendarUpdate.payload?.data?.title !== "QA calendar entry revised " + runId) {
  throw new Error("Calendar entry update failed.");
}
const calendarCancel = await api(
  adminCookie,
  "/api/v1/calendar/entries/" + calendarEntryId + "/cancel?branch_id=" + branchId,
  "POST",
  { reason: "Synthetic acceptance cancellation verifies the audited calendar lifecycle." },
);
const calendarState = (await d1(
  "SELECT status,cancellation_reason,cancelled_by FROM calendar_entry WHERE id=?",
  [calendarEntryId],
))[0];
if (calendarCancel.status !== 200 ||
    calendarCancel.payload?.data?.status !== "cancelled" ||
    calendarState?.status !== "cancelled" ||
    calendarState?.cancellation_reason !== "Synthetic acceptance cancellation verifies the audited calendar lifecycle." ||
    !calendarState?.cancelled_by) {
  throw new Error("Calendar cancellation did not persist its reason and actor audit fields.");
}
console.log("CALENDAR_ENTRY_LIFECYCLE_PASSED");

const checks = {
  reportApproved: reportState?.status === "approved",
  reportReturnedAndResubmitted: reviewHistory.length === 3 &&
    ["returned", "resubmitted", "approved"].every((decision) => reviewHistory.includes(decision)),
  reportReviewHistory: reviewHistory.includes("approved"),
  privateEventFlyerStorageLifecycle: flyerUploadPayload?.data?.object_path?.startsWith("events/") === true && flyerDownloadVerified && flyerRemovePayload?.status === 200 && flyerRemovePayload?.payload?.data?.removed === true && flyerAfterRemoval.status === 404,
  eventRegistrationAttended: registrationState?.status === "attended",
  eventCheckinPersisted: Number(checkinCount) === 1,
  eventCloseoutApproved: closeoutState?.status === "approved",
  eventCloseoutReturnedAndResubmitted: closeoutHistory.length === 4 &&
    closeoutHistory.filter((action) => action === "submitted").length === 2 &&
    closeoutHistory.includes("returned") && closeoutHistory.includes("approved"),
  eventCloseoutAudit: closeoutHistory.length === 4,
  eventAssignmentNotificationTargetsEvent: eventNotice?.target_type === "event" && eventNotice?.target_id === eventId,
  reportReviewNotificationTargetsReport: reportNotice?.target_type === "ministry_report" && reportNotice?.target_id === reportId,
  followupTaskCompleted: followupState?.status === "completed" && Number(followupEventCount) === 3,
  followupNotificationTargetsTask: followupNotice?.target_type === "followup_task" && followupNotice?.target_id === followupTaskId,
  scheduledFollowupReminderIdempotency: scheduledReminderFirstRun.notifications_created === 1 &&
    scheduledReminderReplay.notifications_created === 0 &&
    scheduledReminderAfterReschedule.notifications_created === 1 &&
    scheduledReminderAfterReassignment.notifications_created === 1 &&
    scheduledReminderRows.length === 3 &&
    workerReminderRows.length === 2 && volunteerReminderRows.length === 1,
  scheduledReminderRecipientScoped: Boolean(scheduledReminderNotification) &&
    Boolean(reassignedReminderNotification) &&
    !(adminInbox.payload?.data?.notifications ?? []).some((notice) =>
      notice.id === scheduledReminderNotification.id || notice.id === reassignedReminderNotification.id),
  notificationInboxRecipientScoped: workerNotifications.some((notice) => notice.id === followupNotification.id) &&
    !(adminInbox.payload?.data?.notifications ?? []).some((notice) => notice.id === followupNotification.id),
  notificationReadIsolation: readNotice.payload?.data?.updated === true && crossReadNotice.payload?.data?.updated === false,
  notificationReadAll: inboxAfterReadAll.payload?.data?.unread_count === 0,
  selfReviewDenied: selfReview.status === 403,
  unassignedRegistrationDenied: unassignedRegistration.status === 403,
  unassignedCheckinDenied: unassignedCheckin.status === 403,
  authenticatedSessionRetrieved: authenticatedSessionResponse.status === 200 && Boolean(authenticatedSessionPayload?.session?.id),
  firstLoginSessionGate: firstLoginSessionResponse.status === 200 && firstLoginSessionPayload?.data?.must_change_password === true && firstLoginProtectedRead.status === 403,
  firstLoginPasswordChanged: Number(firstLoginState?.must_change_password) === 0 && firstLoginState?.password_setup_expires_at === null,
  firstLoginOldPasswordRejected: firstLoginOldAttempt.status === 401,
  passwordResetCompleted: resetRequestState?.status === "completed" &&
    ["requested", "approved", "reset_completed"].every((eventType) => resetAuditEvents.some((row) => row.event_type === eventType)),
  passwordResetRevokedOldSession: resetOldSession.status === 401,
  passwordResetOldPasswordRejected: resetOldCredentialAttempt.status === 401,
  passwordResetReplacementAccepted: resetUpdatedMe.status === 200,
  serverConfirmedSignOut: signOutResponse.ok && afterSignOut.status === 401,
  teamAndServiceAreaAdministration: membershipState?.revoked_at !== null && coverageState?.revoked_at !== null &&
    ["team.member.added", "team.member.role_changed", "team.member.revoked"].every((action) => membershipAudit.some((item) => item.action === action)) &&
    ["area.coverage.added", "area.coverage.revoked"].every((action) => coverageAudit.some((item) => item.action === action)),
  announcementDraftLifecycle: announcementUpdate.status === 200 && announcementUpdate.payload?.data?.status === "draft" && announcementUpdate.payload?.data?.is_public === false,
  sermonDraftLifecycle: sermonUpdate.status === 200 && contentState?.status === "draft" && contentState?.published_at === null,
  calendarEntryLifecycle: calendarCancel.status === 200 && calendarState?.status === "cancelled" && Boolean(calendarState?.cancelled_by),
};
const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
if (failed.length) throw new Error(`Authenticated API acceptance failed: ${failed.join(", ")}`);

console.log("AUTHENTICATED_API_ACCEPTANCE_PASSED");
console.log(JSON.stringify(checks));
console.log("Synthetic QA identities and records remain only in the temporary D1 database and will be removed by the workflow's Time Travel restore.");
