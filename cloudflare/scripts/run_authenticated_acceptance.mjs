import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";

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

async function insertUser(roleCode, label, assignerProfileId, bootstrapAdmin = false) {
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
    [randomUUID(), profileId, roleRows[0].id, branchId, assignedBy, new Date(nowMs - 3600000).toISOString(), now],
  );
  return { userId, profileId, email, password };
}

async function signIn(identity, label) {
  const response = await fetchWithTimeout(`${workerUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: identity.email, password: identity.password, rememberMe: false }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`${label} Better Auth sign-in failed (${response.status}): ${bodyText.slice(0, 500)}`);
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const cookie = setCookies.map(value => value.split(";", 1)[0]).filter(Boolean).join("; ");
  if (!cookie) throw new Error(`${label} sign-in did not return a session cookie`);
  return cookie;
}

async function api(cookie, path, method = "GET", body = undefined) {
  const response = await fetchWithTimeout(`${workerUrl}${path}`, {
    method,
    headers: {
      origin,
      cookie,
      "x-branch-id": branchId,
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
const eventId = randomUUID();

await d1(
  "INSERT INTO church(id,name,timezone,is_configured_instance,created_at,updated_at) VALUES(?,?,'Africa/Accra',1,?,?)",
  [churchId, "PCG Automated Acceptance Church", nowIso, nowIso],
);
await d1(
  "INSERT INTO branch(id,church_id,name,timezone,is_active,created_at,updated_at) VALUES(?,?,?,'Africa/Accra',1,?,?)",
  [branchId, churchId, "Automated Acceptance Branch", nowIso, nowIso],
);

const admin = await insertUser("admin_pastor", "admin", null, true);
const worker = await insertUser("field_worker", "worker", admin.profileId);
const reviewer = await insertUser("coordinator", "reviewer", admin.profileId);
const unassigned = await insertUser("field_worker", "unassigned", admin.profileId);
console.log("SYNTHETIC_IDENTITIES_SEEDED");

const unauthenticated = await fetchWithTimeout(`${workerUrl}/api/v1/me`);
if (unauthenticated.status !== 401) throw new Error(`Unauthenticated /api/v1/me expected 401, got ${unauthenticated.status}`);

const adminCookie = await signIn(admin, "Admin/Pastor");
const workerCookie = await signIn(worker, "Field Worker");
const reviewerCookie = await signIn(reviewer, "Coordinator");
const unassignedCookie = await signIn(unassigned, "Unassigned Field Worker");
console.log("BETTER_AUTH_SESSIONS_CREATED");

for (const [cookie, label] of [[adminCookie, "Admin/Pastor"], [workerCookie, "Field Worker"], [reviewerCookie, "Coordinator"]]) {
  const me = await api(cookie, "/api/v1/me");
  if (me.status !== 200 || me.payload.ok !== true) throw new Error(`${label} authenticated /api/v1/me failed: ${me.status} ${JSON.stringify(me.payload)}`);
}

await d1(
  "INSERT INTO event(id,branch_id,title,description,starts_at,ends_at,timezone,location,capacity,registration_state,visibility,status,transport_enabled,created_by,created_at,updated_at,last_modified_by) VALUES(?,?,?,NULL,?,?,?,'QA Acceptance Venue',50,'open','staff','published',0,?,?,?,?)",
  [eventId, branchId, "Authenticated Acceptance Event", startsAt, endsAt, "Africa/Accra", admin.userId, nowIso, nowIso, admin.userId],
);

console.log("AUTHENTICATED_ME_ENDPOINTS_PASSED");

const assignment = await api(adminCookie, `/api/v1/events/${eventId}/staff-assignments`, "POST", {
  staff_auth_user_id: worker.userId,
  assignment_role: "owner",
  starts_at: startsAt,
  ends_at: endsAt,
});
if (assignment.status !== 201) throw new Error(`Event assignment failed: ${assignment.status} ${JSON.stringify(assignment.payload)}`);

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

const closeoutReview = await api(reviewerCookie, `/api/v1/events/${eventId}/closeout/review`, "POST", {
  idempotency_key: `qa-closeout-review-${runId}`,
  decision: "approved",
  reason: null,
});
if (closeoutReview.status !== 200) throw new Error(`Event closeout review failed: ${closeoutReview.status} ${JSON.stringify(closeoutReview.payload)}`);

console.log("EVENT_REGISTRATION_CHECKIN_CLOSEOUT_PASSED");

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

const reportReview = await api(reviewerCookie, `/api/v1/reports/${reportId}/review`, "POST", {
  decision: "approved",
  comment: "Synthetic authenticated acceptance approval",
});
if (reportReview.status !== 200) throw new Error(`Ministry report review failed: ${reportReview.status} ${JSON.stringify(reportReview.payload)}`);

const reportState = (await d1("SELECT status FROM ministry_report WHERE id=?", [reportId]))[0];
const reviewHistory = (await d1("SELECT decision FROM report_review_event WHERE report_id=?", [reportId]))[0];
const registrationState = (await d1("SELECT status FROM event_registration WHERE id=?", [registrationId]))[0];
const checkinCount = (await d1("SELECT COUNT(*) AS count FROM event_checkin WHERE event_id=?", [eventId]))[0]?.count;
const closeoutState = (await d1("SELECT status FROM event_closeout WHERE event_id=?", [eventId]))[0];
const closeoutHistory = (await d1("SELECT COUNT(*) AS count FROM event_closeout_event e JOIN event_closeout c ON c.id=e.closeout_id WHERE c.event_id=?", [eventId]))[0]?.count;
const eventNotice = (await d1("SELECT target_type,target_id FROM staff_notification WHERE recipient_user_id=? AND category='event_assigned' ORDER BY created_at DESC LIMIT 1", [worker.userId]))[0];
const reportNotice = (await d1("SELECT target_type,target_id FROM staff_notification WHERE recipient_user_id=? AND category='report_reviewed' ORDER BY created_at DESC LIMIT 1", [worker.userId]))[0];

const checks = {
  reportApproved: reportState?.status === "approved",
  reportReviewHistory: reviewHistory?.decision === "approved",
  eventRegistrationAttended: registrationState?.status === "attended",
  eventCheckinPersisted: Number(checkinCount) === 1,
  eventCloseoutApproved: closeoutState?.status === "approved",
  eventCloseoutAudit: Number(closeoutHistory) === 2,
  eventAssignmentNotificationTargetsEvent: eventNotice?.target_type === "event" && eventNotice?.target_id === eventId,
  reportReviewNotificationTargetsReport: reportNotice?.target_type === "ministry_report" && reportNotice?.target_id === reportId,
  selfReviewDenied: selfReview.status === 403,
  unassignedRegistrationDenied: unassignedRegistration.status === 403,
  unassignedCheckinDenied: unassignedCheckin.status === 403,
};
const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
if (failed.length) throw new Error(`Authenticated API acceptance failed: ${failed.join(", ")}`);

console.log("AUTHENTICATED_API_ACCEPTANCE_PASSED");
console.log(JSON.stringify(checks));
console.log("Synthetic QA identities and records remain only in the temporary D1 database and will be removed by the workflow's Time Travel restore.");
