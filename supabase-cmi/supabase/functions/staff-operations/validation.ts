const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactCreateInput {
  branch_id: string;
  client_request_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  phone_e164: string | null;
  phone_display: string | null;
  email_normalized: string | null;
  age_range: string | null;
  preferred_language: string | null;
  service_area_id: string | null;
  team_id: string | null;
  source_metadata: Record<string, string>;
}

export type ContactPatchInput = Partial<
  Pick<
    ContactCreateInput,
    | "first_name"
    | "last_name"
    | "preferred_name"
    | "phone_e164"
    | "phone_display"
    | "email_normalized"
    | "age_range"
    | "preferred_language"
  >
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string" || value.trim().length > maxLength) {
    return { ok: false, error: `Invalid ${field}.` };
  }
  return { ok: true, value: value.trim() };
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (
    typeof value !== "string" || value.trim().length < 1 ||
    value.trim().length > maxLength
  ) {
    return { ok: false, error: `Invalid ${field}.` };
  }
  return { ok: true, value: value.trim() };
}

export function parseContactCreate(
  value: unknown,
): { ok: true; value: ContactCreateInput } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }

  const allowed = new Set([
    "branch_id",
    "client_request_id",
    "first_name",
    "last_name",
    "preferred_name",
    "phone_e164",
    "phone_display",
    "email_normalized",
    "age_range",
    "preferred_language",
    "service_area_id",
    "team_id",
    "source_metadata",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported contact field." };
  }

  if (
    typeof value.branch_id !== "string" || !UUID_PATTERN.test(value.branch_id)
  ) {
    return { ok: false, error: "Invalid branch_id." };
  }
  if (
    typeof value.client_request_id !== "string" ||
    !UUID_PATTERN.test(value.client_request_id)
  ) {
    return { ok: false, error: "A UUID client_request_id is required." };
  }

  const firstName = requiredText(value.first_name, "first_name", 120);
  if (!firstName.ok) return firstName;

  const lastName = optionalText(value.last_name, "last_name", 120);
  if (!lastName.ok) return lastName;
  const preferredName = optionalText(
    value.preferred_name,
    "preferred_name",
    120,
  );
  if (!preferredName.ok) return preferredName;
  const phone = optionalText(value.phone_e164, "phone_e164", 16);
  if (!phone.ok) return phone;
  if (phone.value !== null && !E164_PATTERN.test(phone.value)) {
    return { ok: false, error: "phone_e164 must use E.164 format." };
  }
  const phoneDisplay = optionalText(value.phone_display, "phone_display", 40);
  if (!phoneDisplay.ok) return phoneDisplay;
  const email = optionalText(value.email_normalized, "email_normalized", 254);
  if (!email.ok) return email;
  const normalizedEmail = email.value?.toLowerCase() ?? null;
  if (normalizedEmail !== null && !EMAIL_PATTERN.test(normalizedEmail)) {
    return { ok: false, error: "Invalid email_normalized." };
  }
  const ageRange = optionalText(value.age_range, "age_range", 40);
  if (!ageRange.ok) return ageRange;
  const language = optionalText(
    value.preferred_language,
    "preferred_language",
    80,
  );
  if (!language.ok) return language;

  let serviceAreaId: string | null = null;
  if (
    value.service_area_id !== undefined && value.service_area_id !== null &&
    value.service_area_id !== ""
  ) {
    if (
      typeof value.service_area_id !== "string" ||
      !UUID_PATTERN.test(value.service_area_id)
    ) {
      return { ok: false, error: "Invalid service_area_id." };
    }
    serviceAreaId = value.service_area_id;
  }

  let teamId: string | null = null;
  if (
    value.team_id !== undefined && value.team_id !== null &&
    value.team_id !== ""
  ) {
    if (
      typeof value.team_id !== "string" || !UUID_PATTERN.test(value.team_id)
    ) {
      return { ok: false, error: "Invalid team_id." };
    }
    teamId = value.team_id;
  }

  const metadata: Record<string, string> = {};
  if (value.source_metadata !== undefined) {
    if (!isRecord(value.source_metadata)) {
      return { ok: false, error: "source_metadata must be an object." };
    }
    const permitted = new Set([
      "app_version",
      "form_version",
      "device_type",
      "locale",
    ]);
    for (const [key, item] of Object.entries(value.source_metadata)) {
      if (!permitted.has(key) || typeof item !== "string" || item.length > 80) {
        return { ok: false, error: "Unsupported source metadata." };
      }
      metadata[key] = item;
    }
  }

  return {
    ok: true,
    value: {
      branch_id: value.branch_id,
      client_request_id: value.client_request_id,
      first_name: firstName.value,
      last_name: lastName.value,
      preferred_name: preferredName.value,
      phone_e164: phone.value,
      phone_display: phoneDisplay.value,
      email_normalized: normalizedEmail,
      age_range: ageRange.value,
      preferred_language: language.value,
      service_area_id: serviceAreaId,
      team_id: teamId,
      source_metadata: metadata,
    },
  };
}

export function parseContactPatch(
  value: unknown,
): { ok: true; value: ContactPatchInput } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set([
    "first_name",
    "last_name",
    "preferred_name",
    "phone_e164",
    "phone_display",
    "email_normalized",
    "age_range",
    "preferred_language",
  ]);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported or empty contact update." };
  }

  const result: ContactPatchInput = {};
  for (const key of keys) {
    const raw = value[key];
    if (key === "first_name") {
      const parsed = requiredText(raw, key, 120);
      if (!parsed.ok) return parsed;
      result.first_name = parsed.value;
    } else {
      const max = key === "phone_display"
        ? 40
        : key === "email_normalized"
        ? 254
        : key === "age_range"
        ? 40
        : key === "preferred_language"
        ? 80
        : 120;
      const parsed = optionalText(raw, key, max);
      if (!parsed.ok) return parsed;
      const parsedValue = key === "email_normalized"
        ? parsed.value?.toLowerCase() ?? null
        : parsed.value;
      if (
        key === "phone_e164" && parsedValue !== null &&
        !E164_PATTERN.test(parsedValue)
      ) {
        return { ok: false, error: "phone_e164 must use E.164 format." };
      }
      if (
        key === "email_normalized" && parsedValue !== null &&
        !EMAIL_PATTERN.test(parsedValue)
      ) {
        return { ok: false, error: "Invalid email_normalized." };
      }
      if (key === "last_name") result.last_name = parsedValue;
      if (key === "preferred_name") result.preferred_name = parsedValue;
      if (key === "phone_e164") result.phone_e164 = parsedValue;
      if (key === "phone_display") result.phone_display = parsedValue;
      if (key === "email_normalized") result.email_normalized = parsedValue;
      if (key === "age_range") result.age_range = parsedValue;
      if (key === "preferred_language") result.preferred_language = parsedValue;
    }
  }
  return { ok: true, value: result };
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface StaffDirectoryQuery {
  branch_id: string;
  limit: number;
  offset: number;
  search: string;
}

export function parseStaffDirectoryQuery(
  url: URL,
): { ok: true; value: StaffDirectoryQuery } | { ok: false; error: string } {
  const allowed = new Set(["branch_id", "limit", "offset", "search"]);
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || seen.has(key)) {
      return { ok: false, error: "Unsupported or duplicate query parameter." };
    }
    seen.add(key);
  }

  const branchId = url.searchParams.get("branch_id") ?? "";
  if (!UUID_PATTERN.test(branchId)) {
    return { ok: false, error: "A valid branch_id is required." };
  }

  const limit = Number(url.searchParams.get("limit") ?? "25");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const search = (url.searchParams.get("search") ?? "").trim();
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, error: "limit must be an integer from 1 to 50." };
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) {
    return { ok: false, error: "offset must be an integer from 0 to 5000." };
  }
  if (search.length > 80) {
    return { ok: false, error: "search must not exceed 80 characters." };
  }

  return { ok: true, value: { branch_id: branchId, limit, offset, search } };
}

export interface StaffDirectoryProfileRow {
  id: string;
  full_name: string;
  account_status?: string;
  staff_role_assignment?:
    | Array<{
      role?:
        | {
          code: string;
          name: string;
          is_active: boolean;
        }
        | Array<{
          code: string;
          name: string;
          is_active: boolean;
        }>
        | null;
    }>
    | null;
}

export interface StaffDirectoryMember {
  id: string;
  full_name: string;
  account_status: "active" | "inactive";
  roles: Array<{ code: string; name: string }>;
}

/**
 * Projects staff and their active role names for one branch.
 * Only allowlisted fields are returned; Auth IDs, email and phone never enter
 * the directory response. Account status is included for authorised account
 * lifecycle controls; inactive accounts remain visible to authorised admins.
 */
export function projectStaffDirectoryRows(
  rows: StaffDirectoryProfileRow[],
): StaffDirectoryMember[] {
  return rows
    .filter((row) =>
      row.account_status === "active" || row.account_status === "inactive"
    )
    .map((row) => {
      const roles = new Map<string, string>();
      for (const assignment of row.staff_role_assignment ?? []) {
        const relation = assignment.role;
        const relatedRoles = Array.isArray(relation)
          ? relation
          : relation
          ? [relation]
          : [];
        for (const role of relatedRoles) {
          if (role.is_active && role.code && role.name) {
            roles.set(role.code, role.name);
          }
        }
      }
      return {
        id: row.id,
        full_name: row.full_name,
        account_status: row.account_status as "active" | "inactive",
        roles: [...roles.entries()]
          .map(([code, name]) => ({ code, name }))
          .sort((a, b) => a.code.localeCompare(b.code)),
      };
    })
    .filter((row) => row.roles.length > 0)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export interface FollowupTaskCreateInput {
  branch_id: string;
  contact_id: string;
  client_request_id: string;
  list_id: string | null;
  assignee_user_id: string | null;
  team_id: string | null;
  priority: number;
  due_at: string | null;
  task_note: string | null;
}

export type FollowupTaskPatchInput =
  & Partial<
    Pick<FollowupTaskCreateInput, "priority" | "due_at" | "task_note">
  >
  & { status?: "open" | "in_progress" | "completed" | "cancelled" };

const TASK_STATUSES = new Set([
  "open",
  "in_progress",
  "completed",
  "cancelled",
]);

function parseTaskDueAt(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i
      .test(value)
  ) {
    return {
      ok: false,
      error: "due_at must be an ISO timestamp with an explicit timezone.",
    };
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, error: "Invalid due_at." };
  }
  return { ok: true, value: new Date(timestamp).toISOString() };
}

export function parseFollowupTaskCreate(
  value: unknown,
): { ok: true; value: FollowupTaskCreateInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }

  const allowed = new Set([
    "branch_id",
    "contact_id",
    "client_request_id",
    "list_id",
    "assignee_user_id",
    "team_id",
    "priority",
    "due_at",
    "task_note",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported follow-up task field." };
  }

  for (const field of ["branch_id", "contact_id", "client_request_id"]) {
    if (typeof value[field] !== "string" || !UUID_PATTERN.test(value[field])) {
      return { ok: false, error: `Invalid ${field}.` };
    }
  }

  const optionalUuid = (field: string): string | null | undefined => {
    const item = value[field];
    if (item === undefined || item === null || item === "") return null;
    if (typeof item !== "string" || !UUID_PATTERN.test(item)) return undefined;
    return item;
  };

  const listId = optionalUuid("list_id");
  const assigneeId = optionalUuid("assignee_user_id");
  const teamId = optionalUuid("team_id");
  if (
    listId === undefined || assigneeId === undefined || teamId === undefined
  ) {
    return { ok: false, error: "Invalid list_id or assignment target." };
  }
  if ((assigneeId === null) === (teamId === null)) {
    return {
      ok: false,
      error: "Exactly one of assignee_user_id or team_id is required.",
    };
  }

  const priority = value.priority === undefined ? 3 : value.priority;
  if (
    typeof priority !== "number" || !Number.isInteger(priority) ||
    priority < 1 || priority > 5
  ) {
    return { ok: false, error: "priority must be an integer from 1 to 5." };
  }

  const dueAt = parseTaskDueAt(value.due_at);
  if (!dueAt.ok) return dueAt;
  const taskNote = optionalText(value.task_note, "task_note", 2000);
  if (!taskNote.ok) return taskNote;

  return {
    ok: true,
    value: {
      branch_id: value.branch_id as string,
      contact_id: value.contact_id as string,
      client_request_id: value.client_request_id as string,
      list_id: listId,
      assignee_user_id: assigneeId,
      team_id: teamId,
      priority,
      due_at: dueAt.value,
      task_note: taskNote.value,
    },
  };
}

export function parseFollowupTaskPatch(
  value: unknown,
): { ok: true; value: FollowupTaskPatchInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set(["priority", "due_at", "task_note", "status"]);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported or empty follow-up task update." };
  }

  const result: FollowupTaskPatchInput = {};
  if (Object.hasOwn(value, "priority")) {
    const priority = value.priority;
    if (
      typeof priority !== "number" || !Number.isInteger(priority) ||
      priority < 1 || priority > 5
    ) {
      return { ok: false, error: "priority must be an integer from 1 to 5." };
    }
    result.priority = priority;
  }
  if (Object.hasOwn(value, "due_at")) {
    const dueAt = parseTaskDueAt(value.due_at);
    if (!dueAt.ok) return dueAt;
    result.due_at = dueAt.value;
  }
  if (Object.hasOwn(value, "task_note")) {
    const note = optionalText(value.task_note, "task_note", 2000);
    if (!note.ok) return note;
    result.task_note = note.value;
  }
  if (Object.hasOwn(value, "status")) {
    if (typeof value.status !== "string" || !TASK_STATUSES.has(value.status)) {
      return { ok: false, error: "Invalid follow-up task status." };
    }
    result.status = value.status as FollowupTaskPatchInput["status"];
  }
  return { ok: true, value: result };
}

export interface FollowupTaskAssignmentInput {
  assignee_user_id: string | null;
  team_id: string | null;
}

export function parseFollowupTaskAssignment(
  value: unknown,
): { ok: true; value: FollowupTaskAssignmentInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const keys = Object.keys(value);
  if (
    keys.length !== 1 ||
    (keys[0] !== "assignee_user_id" && keys[0] !== "team_id")
  ) {
    return {
      ok: false,
      error: "Exactly one assignment target must be supplied.",
    };
  }
  const target = value[keys[0]];
  if (typeof target !== "string" || !UUID_PATTERN.test(target)) {
    return { ok: false, error: "Invalid assignment target UUID." };
  }
  return {
    ok: true,
    value: {
      assignee_user_id: keys[0] === "assignee_user_id" ? target : null,
      team_id: keys[0] === "team_id" ? target : null,
    },
  };
}

export interface ContactNoteCreateInput {
  body: string;
}

/** Accepts note text only. The server derives author, branch, team and visibility. */
export function parseContactNoteCreate(
  value: unknown,
): { ok: true; value: ContactNoteCreateInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "body") {
    return { ok: false, error: "Only an ordinary note body is accepted." };
  }
  const body = requiredText(value.body, "body", 4000);
  if (!body.ok) return body;
  return { ok: true, value: { body: body.value } };
}

export type ContactInteractionType =
  | "call"
  | "visit"
  | "message"
  | "meeting"
  | "other";

export interface ContactInteractionCreateInput {
  interaction_type: ContactInteractionType;
  occurred_at: string | null;
  outcome_code: string | null;
  summary: string | null;
  next_action_at: string | null;
}

const CONTACT_INTERACTION_TYPES = new Set<ContactInteractionType>([
  "call",
  "visit",
  "message",
  "meeting",
  "other",
]);

/** Accepts operational interaction details only; actor and branch are server-derived. */
export function parseContactInteractionCreate(
  value: unknown,
): { ok: true; value: ContactInteractionCreateInput } | {
  ok: false;
  error: string;
} {
  if (!isRecord(value)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const allowed = new Set([
    "interaction_type",
    "occurred_at",
    "outcome_code",
    "summary",
    "next_action_at",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported contact interaction field." };
  }
  if (
    typeof value.interaction_type !== "string" ||
    !CONTACT_INTERACTION_TYPES.has(
      value.interaction_type as ContactInteractionType,
    )
  ) {
    return { ok: false, error: "Invalid interaction_type." };
  }

  const occurredAt = parseTaskDueAt(value.occurred_at);
  if (!occurredAt.ok) {
    return {
      ok: false,
      error: "occurred_at must be an ISO timestamp with an explicit timezone.",
    };
  }
  const nextActionAt = parseTaskDueAt(value.next_action_at);
  if (!nextActionAt.ok) {
    return {
      ok: false,
      error:
        "next_action_at must be an ISO timestamp with an explicit timezone.",
    };
  }

  const outcome = optionalText(value.outcome_code, "outcome_code", 60);
  if (!outcome.ok) return outcome;
  if (outcome.value !== null && !/^[a-z][a-z0-9_]{1,59}$/.test(outcome.value)) {
    return { ok: false, error: "outcome_code must be a lowercase code." };
  }
  const summary = optionalText(value.summary, "summary", 1000);
  if (!summary.ok) return summary;

  return {
    ok: true,
    value: {
      interaction_type: value.interaction_type as ContactInteractionType,
      occurred_at: occurredAt.value,
      outcome_code: outcome.value,
      summary: summary.value,
      next_action_at: nextActionAt.value,
    },
  };
}

export type ContactNoteVisibility =
  | "author_only"
  | "assigned_scope"
  | "team_scope"
  | "branch_scope";

export type ContactNotePlacement = {
  visibility: ContactNoteVisibility;
  team_id: string | null;
};

export interface ContactNoteVisibilityRow {
  author_user_id: string;
  visibility: ContactNoteVisibility;
  team_id: string | null;
}

/**
 * Returns a scope-derived placement for a new ordinary note.
 * Team visibility requires the actor to be a current member of a team that
 * also has an active assignment to the contact.
 */
export function deriveContactNotePlacement(
  scopes: string[],
  actorTeamIds: string[],
  contactTeamIds: string[],
): ContactNotePlacement | null {
  if (scopes.includes("branch")) {
    return { visibility: "branch_scope", team_id: null };
  }
  if (scopes.includes("team")) {
    const contactTeams = new Set(contactTeamIds);
    const sharedTeamId = actorTeamIds.find((teamId) =>
      contactTeams.has(teamId)
    );
    if (sharedTeamId) {
      return { visibility: "team_scope", team_id: sharedTeamId };
    }
  }
  if (scopes.includes("assigned")) {
    return { visibility: "assigned_scope", team_id: null };
  }
  if (scopes.includes("self")) {
    return { visibility: "author_only", team_id: null };
  }
  return null;
}

/** Evaluates stored note visibility against current capability and team scope. */
export function canReadContactNote(
  note: ContactNoteVisibilityRow,
  actorUserId: string,
  scopes: string[],
  actorTeamIds: string[],
  contactTeamIds: string[],
): boolean {
  if (note.visibility === "author_only") {
    return note.author_user_id === actorUserId;
  }
  if (note.visibility === "branch_scope") {
    return scopes.includes("branch");
  }
  if (note.visibility === "assigned_scope") {
    return scopes.includes("branch") || scopes.includes("assigned");
  }
  if (note.visibility === "team_scope") {
    if (scopes.includes("branch")) return true;
    if (!scopes.includes("team") || !note.team_id) return false;
    const actorTeams = new Set(actorTeamIds);
    const contactTeams = new Set(contactTeamIds);
    return actorTeams.has(note.team_id) && contactTeams.has(note.team_id);
  }
  return false;
}
