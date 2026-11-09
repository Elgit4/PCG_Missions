import {
  isUuid,
  parseContactCreate,
  parseContactPatch,
  parseFollowupTaskAssignment,
  parseFollowupTaskCreate,
  parseFollowupTaskPatch,
} from "./validation.ts";

const branchId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";

Deno.test("contact capture accepts a valid minimal payload", () => {
  const result = parseContactCreate({
    branch_id: branchId,
    client_request_id: requestId,
    first_name: "Ama",
    phone_e164: "+233241234567",
    email_normalized: "AMA@example.com",
    source_metadata: { device_type: "mobile" },
  });
  if (!result.ok) throw new Error(result.error);
  if (result.value.email_normalized !== "ama@example.com") {
    throw new Error("Email must be normalized.");
  }
  if (result.value.last_name !== null) {
    throw new Error("Optional fields should normalize to null.");
  }
});

Deno.test("contact capture rejects unknown or privileged fields", () => {
  const result = parseContactCreate({
    branch_id: branchId,
    client_request_id: requestId,
    first_name: "Ama",
    created_by: "10000000-0000-4000-8000-000000000003",
  });
  if (result.ok) {
    throw new Error("Caller-controlled actor fields must be rejected.");
  }
});

Deno.test("contact capture requires UUID idempotency and branch identifiers", () => {
  if (isUuid("not-a-uuid")) throw new Error("Invalid UUID was accepted.");
  const result = parseContactCreate({
    branch_id: "bad",
    client_request_id: requestId,
    first_name: "Ama",
  });
  if (result.ok) throw new Error("Invalid branch id was accepted.");
});

Deno.test("contact phone uses strict E.164 format", () => {
  for (
    const phone of [
      "0241234567",
      "233241234567",
      "+023312345678",
      "+233-24-123-4567",
    ]
  ) {
    const result = parseContactCreate({
      branch_id: branchId,
      client_request_id: requestId,
      first_name: "Ama",
      phone_e164: phone,
    });
    if (result.ok) throw new Error(`Invalid phone was accepted: ${phone}`);
  }
});

Deno.test("contact update allows only ordinary editable fields", () => {
  const result = parseContactPatch({
    first_name: "Ama",
    preferred_language: "en",
  });
  if (!result.ok) throw new Error(result.error);
});

Deno.test("contact update rejects status, branch and merge controls", () => {
  for (
    const input of [
      { contact_status: "merged" },
      { branch_id: branchId },
      { merged_into_contact_id: "10000000-0000-4000-8000-000000000003" },
      {},
    ]
  ) {
    const result = parseContactPatch(input);
    if (result.ok) throw new Error("Privileged or empty update was accepted.");
  }
});

Deno.test("capture metadata rejects unknown keys", () => {
  const result = parseContactCreate({
    branch_id: branchId,
    client_request_id: requestId,
    first_name: "Ama",
    source_metadata: { email: "private@example.com" },
  });
  if (result.ok) throw new Error("PII metadata was accepted.");
});

const taskRequest = {
  branch_id: branchId,
  contact_id: "10000000-0000-4000-8000-000000000010",
  client_request_id: "10000000-0000-4000-8000-000000000011",
  assignee_user_id: "10000000-0000-4000-8000-000000000012",
  priority: 3,
  due_at: "2026-11-10T10:30:00Z",
  task_note: "Call after service",
};

Deno.test("follow-up task create accepts one staff assignment target", () => {
  const parsed = parseFollowupTaskCreate(taskRequest);
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.value.priority !== 3) throw new Error("Default priority changed.");
  if (parsed.value.due_at !== "2026-11-10T10:30:00.000Z") {
    throw new Error("Due time must be normalized to ISO UTC.");
  }
});

Deno.test("follow-up task create accepts a team target instead of a user", () => {
  const parsed = parseFollowupTaskCreate({
    ...taskRequest,
    assignee_user_id: null,
    team_id: "10000000-0000-4000-8000-000000000013",
  });
  if (!parsed.ok) throw new Error(parsed.error);
});

Deno.test("follow-up task create rejects missing or dual assignment targets", () => {
  for (
    const assignment of [
      { assignee_user_id: null, team_id: null },
      {
        assignee_user_id: "10000000-0000-4000-8000-000000000012",
        team_id: "10000000-0000-4000-8000-000000000013",
      },
    ]
  ) {
    const parsed = parseFollowupTaskCreate({ ...taskRequest, ...assignment });
    if (parsed.ok) throw new Error("Invalid assignment target was accepted.");
  }
});

Deno.test("follow-up task create rejects privileged and cross-scope fields", () => {
  const parsed = parseFollowupTaskCreate({
    ...taskRequest,
    created_by: "10000000-0000-4000-8000-000000000014",
    status: "completed",
  });
  if (parsed.ok) {
    throw new Error("Caller-controlled task fields were accepted.");
  }
});

Deno.test("follow-up task create rejects invalid priority and due dates", () => {
  for (
    const input of [
      { ...taskRequest, priority: 0 },
      { ...taskRequest, priority: 6 },
      { ...taskRequest, due_at: "not-a-date" },
      { ...taskRequest, due_at: "2026-11-10T10:30:00" },
    ]
  ) {
    const parsed = parseFollowupTaskCreate(input);
    if (parsed.ok) throw new Error("Invalid task details were accepted.");
  }
});

Deno.test("follow-up task update accepts ordinary details and lifecycle fields", () => {
  const parsed = parseFollowupTaskPatch({
    priority: 4,
    task_note: "Updated follow-up note",
    status: "in_progress",
  });
  if (!parsed.ok) throw new Error(parsed.error);
});

Deno.test("follow-up task update rejects assignment changes and unknown fields", () => {
  for (
    const input of [
      { assignee_user_id: "10000000-0000-4000-8000-000000000012" },
      { team_id: "10000000-0000-4000-8000-000000000013" },
      { branch_id: branchId },
      { status: "deleted" },
      {},
    ]
  ) {
    const parsed = parseFollowupTaskPatch(input);
    if (parsed.ok) {
      throw new Error("Privileged or invalid task update was accepted.");
    }
  }
});

Deno.test("follow-up task reassignment accepts one staff target", () => {
  const parsed = parseFollowupTaskAssignment({
    assignee_user_id: "10000000-0000-4000-8000-000000000015",
  });
  if (!parsed.ok) throw new Error(parsed.error);
  if (
    parsed.value.assignee_user_id !==
      "10000000-0000-4000-8000-000000000015" ||
    parsed.value.team_id !== null
  ) {
    throw new Error("Staff reassignment target was not normalized.");
  }
});

Deno.test("follow-up task reassignment accepts one team target", () => {
  const parsed = parseFollowupTaskAssignment({
    team_id: "10000000-0000-4000-8000-000000000016",
  });
  if (!parsed.ok) throw new Error(parsed.error);
  if (
    parsed.value.team_id !== "10000000-0000-4000-8000-000000000016" ||
    parsed.value.assignee_user_id !== null
  ) {
    throw new Error("Team reassignment target was not normalized.");
  }
});

Deno.test("follow-up task reassignment rejects missing, dual or invalid targets", () => {
  for (
    const input of [
      {},
      {
        assignee_user_id: "10000000-0000-4000-8000-000000000015",
        team_id: "10000000-0000-4000-8000-000000000016",
      },
      { assignee_user_id: "not-a-uuid" },
      {
        assignee_user_id: "10000000-0000-4000-8000-000000000015",
        status: "open",
      },
    ]
  ) {
    const parsed = parseFollowupTaskAssignment(input);
    if (parsed.ok) {
      throw new Error(
        "Invalid or caller-controlled reassignment was accepted.",
      );
    }
  }
});
