import {
  canReadContactNote,
  deriveContactNotePlacement,
  isUuid,
  parseContactCreate,
  parseContactInteractionCreate,
  parseContactNoteCreate,
  parseContactPatch,
  parseFollowupTaskAssignment,
  parseFollowupTaskCreate,
  parseFollowupTaskPatch,
  parseStaffDirectoryQuery,
  projectStaffDirectoryRows,
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

const staffBranchId = "20000000-0000-4000-8000-000000000001";

Deno.test("staff directory query accepts bounded branch search and pagination", () => {
  const url = new URL(
    `https://example.test/staff?branch_id=${staffBranchId}&limit=10&offset=20&search=Ama`,
  );
  const result = parseStaffDirectoryQuery(url);
  if (!result.ok) throw new Error(result.error);
  if (result.value.branch_id !== staffBranchId) {
    throw new Error("Branch filter was not preserved.");
  }
  if (result.value.limit !== 10 || result.value.offset !== 20) {
    throw new Error("Pagination was not parsed correctly.");
  }
  if (result.value.search !== "Ama") {
    throw new Error("Search text was not normalized.");
  }
});

Deno.test("staff directory query rejects missing branch and unknown parameters", () => {
  for (
    const url of [
      new URL("https://example.test/staff"),
      new URL(
        `https://example.test/staff?branch_id=${staffBranchId}&role=admin_pastor`,
      ),
    ]
  ) {
    const result = parseStaffDirectoryQuery(url);
    if (result.ok) throw new Error("Unsupported directory query was accepted.");
  }
});

Deno.test("staff directory query rejects duplicate and out-of-range parameters", () => {
  const duplicate = new URL(
    `https://example.test/staff?branch_id=${staffBranchId}&branch_id=${staffBranchId}`,
  );
  const tooMany = new URL(
    `https://example.test/staff?branch_id=${staffBranchId}&limit=51`,
  );
  const tooLong = new URL(
    `https://example.test/staff?branch_id=${staffBranchId}&search=${
      "a".repeat(81)
    }`,
  );
  for (const url of [duplicate, tooMany, tooLong]) {
    const result = parseStaffDirectoryQuery(url);
    if (result.ok) throw new Error("Invalid directory query was accepted.");
  }
});

Deno.test("staff directory projection deduplicates roles and includes account status", () => {
  const projected = projectStaffDirectoryRows([
    {
      id: "30000000-0000-4000-8000-000000000001",
      full_name: "Ama Mensah",
      account_status: "active",
      auth_user_id: "must-not-appear",
      email: "ama@example.test",
      phone_e164: "+233241234567",
      staff_role_assignment: [
        { role: { code: "coordinator", name: "Coordinator", is_active: true } },
        { role: { code: "coordinator", name: "Coordinator", is_active: true } },
        {
          role: {
            code: "field_worker",
            name: "Field Worker",
            is_active: false,
          },
        },
      ],
    } as never,
    {
      id: "30000000-0000-4000-8000-000000000002",
      full_name: "Inactive Staff",
      account_status: "inactive",
      staff_role_assignment: [
        { role: { code: "coordinator", name: "Coordinator", is_active: true } },
      ],
    },
  ]);
  if (projected.length !== 2) {
    throw new Error(
      "Active and inactive staff with active role assignments must be returned.",
    );
  }
  if (
    projected.find((member) => member.id.endsWith("0001"))?.account_status !==
      "active" ||
    projected.find((member) => member.id.endsWith("0002"))?.account_status !==
      "inactive"
  ) {
    throw new Error("Staff account status was not projected accurately.");
  }
  if (
    projected[0].roles.length !== 1 ||
    projected[0].roles[0].code !== "coordinator"
  ) {
    throw new Error("Directory roles were not deduplicated/filtered.");
  }
  const serialized = JSON.stringify(projected);
  for (
    const sensitive of [
      "auth_user_id",
      "must-not-appear",
      "email",
      "ama@example.test",
      "phone_e164",
      "+233241234567",
    ]
  ) {
    if (serialized.includes(sensitive)) {
      throw new Error(
        `Sensitive field leaked into directory response: ${sensitive}`,
      );
    }
  }
});


Deno.test("contact note create accepts and trims an ordinary note body", () => {
  const parsed = parseContactNoteCreate({
    body: "  Spoke after Sunday service.  ",
  });
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.value.body !== "Spoke after Sunday service.") {
    throw new Error("The note body was not normalized.");
  }
});

Deno.test("contact note create rejects empty, oversized and privileged fields", () => {
  for (
    const input of [
      { body: "   " },
      { body: "x".repeat(4001) },
      {
        body: "Follow up",
        author_user_id: "10000000-0000-4000-8000-000000000015",
      },
      { body: "Follow up", visibility: "branch_scope" },
      { body: "Follow up", team_id: "10000000-0000-4000-8000-000000000016" },
      { body: "Follow up", branch_id },
    ]
  ) {
    const parsed = parseContactNoteCreate(input);
    if (parsed.ok) {
      throw new Error("Invalid or caller-controlled note input was accepted.");
    }
  }
});

Deno.test("contact interaction create accepts normalized fields and explicit timezone", () => {
  const parsed = parseContactInteractionCreate({
    interaction_type: "call",
    occurred_at: "2026-11-12T18:30:00+00:00",
    outcome_code: "answered",
    summary: "Agreed to attend the next service.",
    next_action_at: "2026-11-15T09:00:00Z",
  });
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.value.occurred_at !== "2026-11-12T18:30:00.000Z") {
    throw new Error("Interaction time was not normalized to UTC.");
  }
  if (parsed.value.next_action_at !== "2026-11-15T09:00:00.000Z") {
    throw new Error("Next action time was not normalized to UTC.");
  }
});

Deno.test("contact interaction create rejects unsupported, sensitive and malformed fields", () => {
  for (
    const input of [
      { interaction_type: "prayer" },
      {
        interaction_type: "call",
        actor_user_id: "10000000-0000-4000-8000-000000000015",
      },
      {
        interaction_type: "call",
        contact_id: "10000000-0000-4000-8000-000000000016",
      },
      { interaction_type: "call", branch_id },
      { interaction_type: "call", occurred_at: "2026-11-12T18:30:00" },
      { interaction_type: "call", next_action_at: "yesterday" },
      { interaction_type: "call", outcome_code: "Contact was reached" },
      { interaction_type: "call", summary: "x".repeat(1001) },
      { interaction_type: "call", visibility: "branch_scope" },
    ]
  ) {
    const parsed = parseContactInteractionCreate(input);
    if (parsed.ok) {
      throw new Error("Unsupported or invalid interaction input was accepted.");
    }
  }
});

Deno.test("contact note visibility is derived from the strongest valid scope", () => {
  const branch = deriveContactNotePlacement(["assigned", "branch"], [], []);
  if (branch?.visibility !== "branch_scope" || branch.team_id !== null) {
    throw new Error("Branch-scoped note placement was not selected.");
  }
  const team = deriveContactNotePlacement(
    ["team"],
    ["team-a", "team-b"],
    ["team-b"],
  );
  if (team?.visibility !== "team_scope" || team.team_id !== "team-b") {
    throw new Error("A matching active team was not selected.");
  }
  const assigned = deriveContactNotePlacement(
    ["team", "assigned"],
    ["team-a"],
    ["team-b"],
  );
  if (assigned?.visibility !== "assigned_scope") {
    throw new Error(
      "The assignment scope should be used when no team assignment overlaps.",
    );
  }
  if (deriveContactNotePlacement(["team"], ["team-a"], ["team-b"]) !== null) {
    throw new Error(
      "A team note was allowed without a shared team assignment.",
    );
  }
});

Deno.test("contact note visibility is checked against current author, scope and team overlap", () => {
  const note = {
    author_user_id: "user-a",
    visibility: "team_scope" as const,
    team_id: "team-a",
  };
  if (!canReadContactNote(note, "user-b", ["team"], ["team-a"], ["team-a"])) {
    throw new Error(
      "A current member of the assigned team should read its note.",
    );
  }
  if (canReadContactNote(note, "user-b", ["team"], ["team-a"], ["team-b"])) {
    throw new Error(
      "A team note was exposed without a matching contact assignment.",
    );
  }
  if (
    canReadContactNote(note, "user-b", ["assigned"], ["team-a"], ["team-a"])
  ) {
    throw new Error("A team note was exposed to an assigned-only scope.");
  }
  if (
    !canReadContactNote(
      { ...note, visibility: "branch_scope" },
      "user-b",
      ["branch"],
      [],
      [],
    )
  ) {
    throw new Error("A branch-scoped reader should read branch notes.");
  }
  if (
    canReadContactNote(
      { ...note, visibility: "branch_scope" },
      "user-b",
      ["team"],
      ["team-a"],
      ["team-a"],
    )
  ) {
    throw new Error("Team scope must not read branch-only notes.");
  }
  if (
    !canReadContactNote(
      { ...note, visibility: "author_only" },
      "user-a",
      ["team"],
      [],
      [],
    )
  ) {
    throw new Error("An author should read their author-only note.");
  }
  if (
    canReadContactNote(
      { ...note, visibility: "author_only" },
      "user-b",
      ["branch"],
      [],
      [],
    )
  ) {
    throw new Error("Branch scope must not override author-only visibility.");
  }
});
