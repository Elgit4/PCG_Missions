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

async function api(cookie, path, method = "GET", body = undefined, idempotencyKey = undefined) {
  const response = await fetchWithTimeout(`${workerUrl}${path}`, {
    method,
    headers: {
      origin,
      cookie,
      "x-branch-id": branchId,
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

const adminCookie = await signIn(admin, "Admin/Pastor");
const workerCookie = await signIn(worker, "Field Worker");
const reviewerCookie = await signIn(reviewer, "Coordinator");
const unassignedCookie = await signIn(unassigned, "Unassigned Field Worker");
const teamLeaderCookie = await signIn(teamLeader, "Team Leader");
const followupVolunteerCookie = await signIn(followupVolunteer, "Follow-up Volunteer");
const prayerIntercessorCookie = await signIn(prayerIntercessor, "Prayer Intercessor");
console.log("BETTER_AUTH_SESSIONS_CREATED");

for (const [cookie, label] of [
  [adminCookie, "Admin/Pastor"],
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

console.log("AUTHENTICATED_ME_ENDPOINTS_PASSED");

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

const followupList = await api(workerCookie, "/api/v1/followup/tasks?limit=50&offset=0&status=open");
if (followupList.status !== 200 || !followupList.payload?.data?.some((task) => task.id === followupTaskId)) {
  throw new Error("Assigned follow-up list did not return the new task: " + followupList.status + " " + JSON.stringify(followupList.payload));
}
const followupStarted = await api(workerCookie, "/api/v1/followup/tasks/" + followupTaskId, "PATCH", { status: "in_progress" });
if (followupStarted.status !== 200) throw new Error("Follow-up start failed: " + followupStarted.status + " " + JSON.stringify(followupStarted.payload));
const followupCompleted = await api(workerCookie, "/api/v1/followup/tasks/" + followupTaskId, "PATCH", { status: "completed" });
if (followupCompleted.status !== 200) throw new Error("Follow-up completion failed: " + followupCompleted.status + " " + JSON.stringify(followupCompleted.payload));
console.log("CONTACT_AND_FOLLOWUP_LIFECYCLE_PASSED");

// Verify team-scoped allocation, handoff, and assigned-only privacy across all six roles.
const adminTeamAssign = await api(adminCookie, `/api/v1/contacts/${contactId}/assign`, "POST", {
  team_id: teamId,
  reason: "Admin routes the captured visitor to the responsible ministry team.",
});
if (adminTeamAssign.status !== 201 || adminTeamAssign.payload?.data?.team_id !== teamId) {
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
const followupState = (await d1("SELECT status FROM followup_task WHERE id=?", [followupTaskId]))[0];
const followupEventCount = (await d1("SELECT COUNT(*) AS count FROM followup_task_event WHERE task_id=?", [followupTaskId]))[0]?.count;
const followupNotice = (await d1("SELECT target_type,target_id FROM staff_notification WHERE recipient_user_id=? AND category='followup_assigned' ORDER BY created_at DESC LIMIT 1", [worker.userId]))[0];

const inbox = await api(workerCookie, "/api/v1/notifications?branch_id=" + branchId + "&limit=50");
if (inbox.status !== 200) throw new Error("Worker notification inbox failed: " + inbox.status + " " + JSON.stringify(inbox.payload));
const workerNotifications = inbox.payload?.data?.notifications ?? [];
const followupNotification = workerNotifications.find((notice) => notice.target_id === followupTaskId);
if (!followupNotification) throw new Error("Follow-up assignment notification was not present in the assigned worker inbox");
const adminInbox = await api(adminCookie, "/api/v1/notifications?branch_id=" + branchId + "&limit=50");
if (adminInbox.status !== 200 || (adminInbox.payload?.data?.notifications ?? []).some((notice) => notice.id === followupNotification.id)) {
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

// Exercise a genuine first-login password gate and prove that the old credential is no longer valid.
const firstLoginCookie = await signIn(firstLoginUser, "First-login Field Worker");
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

const checks = {
  reportApproved: reportState?.status === "approved",
  reportReviewHistory: reviewHistory?.decision === "approved",
  eventRegistrationAttended: registrationState?.status === "attended",
  eventCheckinPersisted: Number(checkinCount) === 1,
  eventCloseoutApproved: closeoutState?.status === "approved",
  eventCloseoutAudit: Number(closeoutHistory) === 2,
  eventAssignmentNotificationTargetsEvent: eventNotice?.target_type === "event" && eventNotice?.target_id === eventId,
  reportReviewNotificationTargetsReport: reportNotice?.target_type === "ministry_report" && reportNotice?.target_id === reportId,
  followupTaskCompleted: followupState?.status === "completed" && Number(followupEventCount) === 3,
  followupNotificationTargetsTask: followupNotice?.target_type === "followup_task" && followupNotice?.target_id === followupTaskId,
  notificationInboxRecipientScoped: workerNotifications.some((notice) => notice.id === followupNotification.id) &&
    !(adminInbox.payload?.data?.notifications ?? []).some((notice) => notice.id === followupNotification.id),
  notificationReadIsolation: readNotice.payload?.data?.updated === true && crossReadNotice.payload?.data?.updated === false,
  notificationReadAll: inboxAfterReadAll.payload?.data?.unread_count === 0,
  selfReviewDenied: selfReview.status === 403,
  unassignedRegistrationDenied: unassignedRegistration.status === 403,
  unassignedCheckinDenied: unassignedCheckin.status === 403,
  authenticatedSessionRetrieved: authenticatedSessionResponse.status === 200 && Boolean(authenticatedSessionPayload?.session?.id),
  firstLoginPasswordChanged: Number(firstLoginState?.must_change_password) === 0 && firstLoginState?.password_setup_expires_at === null,
  firstLoginOldPasswordRejected: firstLoginOldAttempt.status === 401,
  passwordResetCompleted: resetRequestState?.status === "completed" &&
    ["requested", "approved", "reset_completed"].every((eventType) => resetAuditEvents.some((row) => row.event_type === eventType)),
  passwordResetRevokedOldSession: resetOldSession.status === 401,
  passwordResetOldPasswordRejected: resetOldCredentialAttempt.status === 401,
  passwordResetReplacementAccepted: resetUpdatedMe.status === 200,
  serverConfirmedSignOut: signOutResponse.ok && afterSignOut.status === 401,
};
const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
if (failed.length) throw new Error(`Authenticated API acceptance failed: ${failed.join(", ")}`);

console.log("AUTHENTICATED_API_ACCEPTANCE_PASSED");
console.log(JSON.stringify(checks));
console.log("Synthetic QA identities and records remain only in the temporary D1 database and will be removed by the workflow's Time Travel restore.");
