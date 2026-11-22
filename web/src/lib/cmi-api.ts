
/**
 * PCG Missions browser API adapter.
 *
 * Browser requests use the same-origin Cloudflare Pages gateway and HttpOnly
 * Better Auth cookies. The Worker enforces D1 role/capability authorization.
 * The browser never receives Supabase Auth tokens or service-role credentials;
 * Supabase is retained server-side only for private event-flyer storage.
 */
export interface CmiApiConfig { apiUrl?: string; }
/** @deprecated Retained only for constructor compatibility; Cloudflare auth uses HttpOnly cookies. */
export type AccessTokenProvider = () => Promise<string | null>;
export interface ApiEnvelope<T> {
  data: T;
  request_id: string;
  /** Exact matching record count returned by paginated list endpoints. */
  total?: number;
}
export interface ApiErrorBody { error?: { code?: string; message?: string }; request_id?: string }

export class CmiApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, requestId: string | null) {
    super(message);
    this.name = "CmiApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface StaffSession {
  user: { id: string; email: string | null };
  staff: {
    id: string;
    auth_user_id: string;
    full_name: string;
    email: string | null;
    account_status: "active";
  };
  branches: Array<{ id: string; name: string; timezone: string }>;
  roles: Array<{ code: string; name: string; branch_id: string }>;
  capabilities: Array<{ code: string; scope_mode: string; branch_id: string }>;
  must_change_password: boolean;
  password_setup_expires_at: string | null;
}

export interface StaffDirectoryRole {
  assignment_id: string;
  code: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
}
export interface StaffDirectoryEntry {
  id: string;
  full_name: string;
  account_status: "active" | "inactive";
  roles: StaffDirectoryRole[];
}
export type StandardStaffRoleCode = "coordinator" | "team_leader" | "field_worker" | "follow_up_volunteer" | "prayer_intercessor";
export interface StaffRoleApprovalRequest {
  id: string;
  target_profile_id: string;
  target_name: string;
  assignment_id?: string;
  requested_by: string;
  requester_name: string;
  reason: string;
  requested_at: string;
}

export interface StaffAccountCreateInput {
  branch_id: string;
  full_name: string;
  email: string;
  role_code: "admin_pastor" | "coordinator" | "team_leader" | "field_worker" | "follow_up_volunteer" | "prayer_intercessor";
  reason: string;
}

export interface StaffPasswordResetRequest {
  id: string;
  email: string;
  full_name: string;
  requested_at: string;
  expires_at: string;
  status: "pending" | "processing";
}

export interface EventDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
  capacity: number | null;
  status: "draft" | "published" | "cancelled" | "completed";
  visibility: "private" | "staff" | "public";
  registration_state: "closed" | "open";
  created_at: string;
  updated_at: string;
  flyer_mime_type?: "image/jpeg" | "image/png" | "image/webp" | null;
  flyer_size_bytes?: number | null;
  flyer_updated_at?: string | null;
}
export interface EventDraftCreateInput {
  branch_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
  capacity?: number | null;
}
export type EventDraftPatchInput = Partial<Omit<EventDraftCreateInput, "branch_id">>;


export type EventStaffAssignmentRole = "owner" | "organizer" | "checkin" | "support";

export interface EventRegistrationRecord {
  id: string;
  event_id: string;
  branch_id: string;
  attendee_name_snapshot: string;
  attendee_phone_snapshot: string | null;
  status: "registered" | "cancelled" | "attended" | "no_show";
  registered_at: string;
  checked_in_at: string | null;
}
export interface EventRegistrationWorkspace {
  registrations: EventRegistrationRecord[];
  active_count: number;
}

export interface EventCheckinRecord {
  id: string;
  event_id: string;
  branch_id: string;
  registration_id: string;
  attendee_name_snapshot: string;
  checked_in_at: string;
  recorded_by: string;
  source: "staff";
}
export interface EventStaffCheckinResult {
  checkin: EventCheckinRecord;
  replayed: boolean;
  response_status: number;
}

export interface EventStaffRegistrationInput {
  idempotency_key: string;
  attendee_name: string;
  attendee_phone: string | null;
}
export interface EventStaffRegistrationResult {
  registration: EventRegistrationRecord;
  replayed: boolean;
  response_status: number;
}

export type EventTeamAssignmentRole = "organizer" | "ushering" | "support";
export interface EventStaffAssignmentInput {
  staff_auth_user_id: string;
  assignment_role: EventStaffAssignmentRole;
  starts_at: string;
  ends_at: string | null;
}
export interface EventTeamAssignmentInput {
  team_id: string;
  assignment_role: EventTeamAssignmentRole;
  starts_at: string;
  ends_at: string | null;
}
export interface EventStaffAssignmentRecord extends EventStaffAssignmentInput {
  id: string;
  event_id: string;
  branch_id: string;
  staff_name: string;
  revoked_at: string | null;
  created_at: string;
}
export interface EventTeamAssignmentRecord extends EventTeamAssignmentInput {
  id: string;
  event_id: string;
  branch_id: string;
  team_name: string;
  revoked_at: string | null;
  created_at: string;
}
export interface EventAssignmentWorkspace {
  staff_assignments: EventStaffAssignmentRecord[];
  team_assignments: EventTeamAssignmentRecord[];
  staff_candidates: { auth_user_id: string; full_name: string }[];
  team_candidates: { id: string; name: string }[];
}


export interface EventCloseoutRecord {
  id: string;
  event_id: string;
  branch_id: string;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  status: "draft" | "submitted" | "approved" | "returned";
  attendee_count: number | null;
  registration_count: number | null;
  transport_seat_count: number | null;
  summary_notes: string | null;
}
export interface EventCloseoutHistoryRecord {
  id: string;
  actor_user_id: string;
  action: "submitted" | "approved" | "returned" | "reopened";
  details: Record<string, unknown>;
  created_at: string;
}
export interface EventCloseoutWorkspace {
  closeout: EventCloseoutRecord | null;
  history: EventCloseoutHistoryRecord[];
}
export interface EventCloseoutSubmissionResult {
  closeout: EventCloseoutRecord;
  replayed: boolean;
  response_status: number;
}

export interface AssignedPrayerRequestRecord {
  id: string;
  branch_id: string;
  request_text: string;
  status: "open" | "assigned" | "in_progress" | "answered" | "closed";
  sensitivity: "restricted" | "highly_restricted";
  expires_at: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
  assignment_starts_at: string;
  assignment_ends_at: string | null;
}
export interface AssignedPrayerInbox {
  requests: AssignedPrayerRequestRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface StaffNotificationRecord {
  id: string;
  category: "followup_assigned" | "event_assigned" | "report_reviewed" | "system";
  title: string;
  body: string;
  target_type: "followup_task" | "event" | "ministry_report" | null;
  target_id: string | null;
  created_at: string;
  read_at: string | null;
}
export interface StaffNotificationInbox {
  notifications: StaffNotificationRecord[];
  unread_count: number;
}
export interface EventFlyerResult {
  object_path: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  signed_url: string;
  signed_url_expires_in: number;
}

export interface CalendarEntryRecord {
  id: string;
  branch_id: string;
  entry_type: "service" | "event" | "other";
  title: string;
  starts_at: string;
  ends_at: string | null;
  scope_type: "branch";
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface CalendarEntryCreateInput {
  branch_id: string;
  entry_type: CalendarEntryRecord["entry_type"];
  title: string;
  starts_at: string;
  ends_at: string | null;
}
export type CalendarEntryPatchInput = Partial<Omit<CalendarEntryCreateInput, "branch_id">>;

export interface AnnouncementDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  body: string;
  is_public: false;
  status: "draft";
  created_at: string;
  updated_at: string;
}
export interface AnnouncementDraftCreateInput {
  branch_id: string;
  title: string;
  body: string;
}
export type AnnouncementDraftPatchInput = Partial<Pick<AnnouncementDraftCreateInput, "title" | "body">>;

export interface SermonDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  body: string;
  public_slug: string;
  status: "draft";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface SermonDraftCreateInput {
  branch_id: string;
  title: string;
  body: string;
  public_slug: string;
}
export type SermonDraftPatchInput = Partial<Pick<SermonDraftCreateInput, "title" | "body" | "public_slug">>;

export interface WelcomeMessageDraftRecord {
  id: string;
  branch_id: string;
  title: string;
  body: string;
  display_order: number;
  status: "draft";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface WelcomeMessageDraftCreateInput {
  branch_id: string;
  title: string;
  body: string;
  display_order: number;
}
export type WelcomeMessageDraftPatchInput = Partial<Pick<WelcomeMessageDraftCreateInput, "title" | "body" | "display_order">>;

export interface TeamMemberRecord {
  id: string;
  team_id: string;
  staff_profile_id: string;
  membership_role: "member" | "leader";
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  staff: Pick<StaffDirectoryEntry, "id" | "full_name" | "account_status"> | null;
}
export interface TeamRecord {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  members: TeamMemberRecord[];
  member_count?: number;
}
export interface TeamWorkspaceData { teams: TeamRecord[] }
export interface TeamCreateInput {
  branch_id: string;
  name: string;
  description: string | null;
}
export type TeamPatchInput = Partial<Pick<TeamCreateInput, "name" | "description">> & { is_active?: boolean };
export interface TeamMemberCreateInput {
  staff_profile_id: string;
  membership_role: "member" | "leader";
}
export interface TeamMemberRoleInput { membership_role: "member" | "leader" }

export interface AreaCoverageRecord {
  id: string;
  service_area_id: string;
  staff_profile_id: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  staff: Pick<StaffDirectoryEntry, "id" | "full_name" | "account_status"> | null;
}
export interface ServiceAreaRecord {
  id: string;
  branch_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  coverage: AreaCoverageRecord[];
  coverage_count?: number;
}
export interface ServiceAreaWorkspaceData { areas: ServiceAreaRecord[] }
export type TeamMutationResult = Omit<TeamRecord, "members">;
export type TeamMembershipMutationResult = Omit<TeamMemberRecord, "staff">;
export type ServiceAreaMutationResult = Omit<ServiceAreaRecord, "coverage">;
export type AreaCoverageMutationResult = Omit<AreaCoverageRecord, "staff">;
export interface ServiceAreaCreateInput {
  branch_id: string;
  name: string;
  code: string | null;
}
export type ServiceAreaPatchInput = Partial<Pick<ServiceAreaCreateInput, "name" | "code">> & { is_active?: boolean };
export interface AreaCoverageCreateInput { staff_profile_id: string }

export interface ContactRecord {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name?: string | null;
  phone_e164?: string | null;
  phone_display?: string | null;
  email_normalized?: string | null;
  age_range?: string | null;
  preferred_language?: string | null;
  service_area_id?: string | null;
  contact_status: string;
  identity_redacted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ContactCreateInput {
  branch_id: string;
  client_request_id: string;
  first_name: string;
  last_name?: string | null;
  preferred_name?: string | null;
  phone_e164?: string | null;
  phone_display?: string | null;
  email_normalized?: string | null;
  age_range?: string | null;
  preferred_language?: string | null;
  service_area_id?: string | null;
  team_id?: string | null;
  source_metadata?: Record<string, unknown>;
}

export interface ContactUpdateInput {
  first_name?: string;
  last_name?: string | null;
  preferred_name?: string | null;
  age_range?: string | null;
  preferred_language?: string | null;
  service_area_id?: string | null;
  phone_e164?: string | null;
  phone_display?: string | null;
  email_normalized?: string | null;
}

export interface ContactNote {
  id: string;
  body: string;
  created_at: string;
  updated_at?: string;
}

export interface ContactInteraction {
  id: string;
  interaction_type: "call" | "visit" | "message" | "meeting" | "other";
  occurred_at: string;
  outcome_code: string | null;
  summary: string | null;
  next_action_at: string | null;
  created_at: string;
}

export interface ContactNoteCreateInput {
  body: string;
}

export interface ContactInteractionCreateInput {
  interaction_type: ContactInteraction["interaction_type"];
  occurred_at?: string | null;
  outcome_code?: string | null;
  summary?: string | null;
  next_action_at?: string | null;
}

export interface FollowUpTask {
  id: string;
  branch_id: string;
  contact_id: string;
  assignee_user_id?: string | null;
  team_id?: string | null;
  priority: number;
  due_at: string | null;
  task_note: string | null;
  status: "open" | "in_progress" | "completed" | "cancelled";
  created_at?: string;
  updated_at?: string;
}

interface TaskCreateBase {
  branch_id: string;
  contact_id: string;
  client_request_id: string;
  list_id?: string | null;
  priority: number;
  due_at?: string | null;
  task_note?: string | null;
}
export type TaskAssignmentTarget =
  | { assignee_user_id: string; team_id?: never }
  | { team_id: string; assignee_user_id?: never };
export type TaskCreateInput = TaskCreateBase & TaskAssignmentTarget;
export type TaskReassignmentInput =
  | { assignee_profile_id: string; team_id?: never; reason: string }
  | { team_id: string; assignee_profile_id?: never; reason: string };
export interface TaskUpdateInput {
  priority?: number;
  due_at?: string | null;
  task_note?: string | null;
  status?: FollowUpTask["status"];
}
export interface CmiRequestOptions {
  method?: "GET" | "POST" | "PATCH";
  /** Branch scope sent as trusted request context, independently of route query parameters. */
  branchId?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  authenticated?: boolean;
  idempotencyKey?: string;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
function parseJson(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}
function assertExactlyOneTaskTarget(
  input: { assignee_user_id?: unknown; team_id?: unknown },
): asserts input is TaskAssignmentTarget {
  const hasAssignee = typeof input.assignee_user_id === "string" && input.assignee_user_id.trim().length > 0;
  const hasTeam = typeof input.team_id === "string" && input.team_id.trim().length > 0;
  if (hasAssignee === hasTeam) {
    throw new TypeError("Exactly one non-empty task assignment target is required.");
  }
}

function assertValidTaskReassignment(
  input: { assignee_profile_id?: unknown; team_id?: unknown; reason?: unknown },
): asserts input is TaskReassignmentInput {
  const hasAssignee = typeof input.assignee_profile_id === "string" && input.assignee_profile_id.trim().length > 0;
  const hasTeam = typeof input.team_id === "string" && input.team_id.trim().length > 0;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (hasAssignee === hasTeam || reason.length < 10 || reason.length > 500) {
    throw new TypeError("Exactly one task reassignment target and a reason of 10–500 characters are required.");
  }
}

function requestErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/[\r\n]+/g, " ").slice(0, 140);
    return message ? `${error.name}: ${message}` : error.name;
  }
  return "Unknown network error";
}

export type MinistryReportType = "daily_evangelism" | "event_evangelism" | "weekly_ministry";
export type MinistryReportStatus = "draft" | "submitted" | "returned" | "approved";
export interface MinistryReportRecord {
  id: string;
  branch_id: string;
  report_type: MinistryReportType;
  period_start: string;
  period_end: string;
  author_profile_id: string;
  team_id: string | null;
  event_id: string | null;
  contacts_captured: number;
  gospel_presentations: number;
  decisions_for_christ: number;
  followup_required: number;
  followup_completed: number;
  visits_completed: number;
  calls_completed: number;
  events_supported: number;
  attendance_count: number;
  status: MinistryReportStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  review_history?: MinistryReportReviewEvent[];
}
export interface MinistryReportReviewEvent {
  id: string;
  actor_profile_id: string;
  decision: "approved" | "returned" | "comment" | "resubmitted";
  comment: string | null;
  created_at: string;
}
export interface MinistryReportCreateInput {
  branch_id: string;
  report_type: MinistryReportType;
  period_start: string;
  period_end: string;
  team_id?: string | null;
  event_id?: string | null;
  contacts_captured?: number;
  gospel_presentations?: number;
  decisions_for_christ?: number;
  followup_required?: number;
  followup_completed?: number;
  visits_completed?: number;
  calls_completed?: number;
  events_supported?: number;
  attendance_count?: number;
}
export interface MinistryReportReviewInput {
  decision: "approved" | "returned" | "comment";
  comment?: string | null;
}
export interface MinistryReportReviewResult {
  report: MinistryReportRecord;
  review_history: MinistryReportReviewEvent[];
}


function workerApiPath(functionName: string, suffix: string, method: string): string | null {
  const verb = method.toUpperCase();
  if (functionName === "staff-session" && suffix === "") return "/api/v1/me";

  if (functionName === "announcement-operations") {
    if (suffix === "/announcements" && (verb === "GET" || verb === "POST")) return "/api/v1/announcements";
    if (/^\/announcements\/[^/]+$/.test(suffix) && (verb === "GET" || verb === "PATCH")) return "/api/v1" + suffix;
    return null;
  }

  if (functionName === "calendar-operations") {
    if (suffix === "/entries" && (verb === "GET" || verb === "POST")) return "/api/v1/calendar/entries";
    if (/^\/entries\/[^/]+$/.test(suffix) && (verb === "GET" || verb === "PATCH")) return "/api/v1" + suffix.replace("/entries/", "/calendar/entries/");
    return null;
  }

  if (functionName === "event-flyers") {
    const flyerMatch = suffix.match(/^\/events\/([^/]+)$/);
    if (flyerMatch && verb === "GET") return `/api/v1/events/${flyerMatch[1]}/flyer`;
    const removeMatch = suffix.match(/^\/events\/([^/]+)\/remove$/);
    if (removeMatch && verb === "POST") return `/api/v1/events/${removeMatch[1]}/flyer/remove`;
    return null;
  }

  if (functionName === "event-operations") {
    if (suffix === "/events" && (verb === "GET" || verb === "POST")) return "/api/v1/events";
    if (/^\/events\/[^/]+$/.test(suffix) && (verb === "GET" || verb === "PATCH")) return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/cancel$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/registrations$/.test(suffix) && (verb === "GET" || verb === "POST")) return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/assignments$/.test(suffix) && verb === "GET") return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/(staff-assignments|team-assignments)$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/(staff-assignments|team-assignments)\/[^/]+\/revoke$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/staff-registration\/(open|close)$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/registrations\/[^/]+\/(check-in|cancel)$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/closeout$/.test(suffix) && verb === "GET") return "/api/v1" + suffix;
    if (/^\/events\/[^/]+\/closeout\/(submit|review)$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    return null;
  }

  if (functionName === "pastoral-operations") {
    if (suffix === "/prayer/requests/assigned" && verb === "GET") return "/api/v1/pastoral/prayer/assigned";
    const prayerRead = suffix.match(/^\/prayer\/requests\/([^/]+)\/read$/);
    if (prayerRead && verb === "POST") return "/api/v1/pastoral/prayer/requests/" + prayerRead[1] + "/read";
    const careRead = suffix.match(/^\/care\/records\/([^/]+)\/read$/);
    if (careRead && verb === "POST") return "/api/v1/pastoral/care/records/" + careRead[1] + "/read";
    return null;
  }

  if (functionName === "report-operations") {
    if ((suffix === "/reports" || suffix === "/teams" || suffix === "/events") && verb === "GET") return "/api/v1" + suffix;
    if (suffix === "/reports" && verb === "POST") return "/api/v1/reports";
    if (/^\/reports\/[^/]+$/.test(suffix) && verb === "GET") return "/api/v1" + suffix;
    if (/^\/reports\/[^/]+\/(review|resubmit)$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    return null;
  }

  if (functionName === "staff-notifications") {
    if (suffix === "/notifications" && verb === "GET") return "/api/v1/notifications";
    if (suffix === "/notifications/read-all" && verb === "POST") return "/api/v1/notifications/read-all";
    if (/^\/notifications\/[^/]+\/read$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    return null;
  }

  if (functionName === "team-operations") {
    if ((suffix === "/teams" || suffix === "/areas") && (verb === "GET" || verb === "POST")) return "/api/v1" + suffix;
    if ((/^\/teams\/[^/]+$/.test(suffix) || /^\/areas\/[^/]+$/.test(suffix)) && verb === "PATCH") return "/api/v1" + suffix;
    if (/^\/teams\/[^/]+\/members$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    if (/^\/teams\/[^/]+\/members\/[^/]+$/.test(suffix) && verb === "PATCH") return "/api/v1" + suffix;
    if (/^\/teams\/[^/]+\/members\/[^/]+\/revoke$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    if (/^\/areas\/[^/]+\/coverage$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    if (/^\/areas\/[^/]+\/coverage\/[^/]+\/revoke$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
    return null;
  }

  if (functionName === "staff-auth") {
    if (suffix === "/admin/staff" && verb === "POST") return "/api/v1/staff/accounts";
    if (suffix === "/admin/password-reset-requests" && verb === "GET") return "/api/v1/admin/password-reset-requests";
    const resetReview = suffix.match(/^\/admin\/password-reset-requests\/([^/]+)\/(approve|deny)$/);
    if (resetReview && verb === "POST") return `/api/v1/admin/password-reset-requests/${resetReview[1]}/${resetReview[2]}`;
    return null;
  }

  if (functionName === "staff-access-operations") {
    const statusMatch = suffix.match(/^\/staff\/([^/]+)\/accounts\/(deactivate|reactivate)$/);
    if (statusMatch && verb === "POST") return `/api/v1/staff/${statusMatch[1]}/${statusMatch[2]}`;
    return null;
  }

  if (functionName === "staff-role-operations") {
    if (suffix === "/staff/roles" && verb === "POST") return "/api/v1/staff/roles";
    if (/^\\/staff\\/roles\\/[^/]+$/.test(suffix) && verb === "DELETE") return "/api/v1" + suffix;
    if ((suffix === "/staff/role-elevations" || suffix === "/staff/role-revocations") && (verb === "GET" || verb === "POST")) {
      return "/api/v1" + suffix;
    }
    if (/^\\/staff\\/role-(elevations|revocations)\\/[^/]+\\/(approve|reject)$/.test(suffix) && verb === "POST") {
      return "/api/v1" + suffix;
    }
    return null;
  }

  if (functionName === "staff-operations") {
    if (suffix === "/contacts" && (verb === "GET" || verb === "POST")) return "/api/v1/contacts";
    if (/^\/contacts\/[^/]+$/.test(suffix) && (verb === "GET" || verb === "PATCH")) return "/api/v1" + suffix;
    if (/^\/contacts\/[^/]+\/interactions$/.test(suffix) && (verb === "GET" || verb === "POST")) return "/api/v1" + suffix;
    if (/^\/contacts\/[^/]+\/notes$/.test(suffix) && (verb === "GET" || verb === "POST")) return "/api/v1" + suffix;
    if (suffix === "/staff" && verb === "GET") return "/api/v1/staff";
    if (suffix === "/followup/tasks" && (verb === "GET" || verb === "POST")) return "/api/v1/followup/tasks";
    if (suffix.startsWith("/followup/tasks/") && suffix.split("/").length === 4 && verb === "PATCH") return "/api/v1" + suffix;
    if (/^\/followup\/tasks\/[^/]+\/assign$/.test(suffix) && verb === "POST") return "/api/v1" + suffix;
  }

  if (functionName === "public-content") return "/api/v1/public-content";
  return null;
}

export class CmiApiClient {
  private readonly baseUrl: string;

  constructor(
    config: CmiApiConfig = {},
    /** @deprecated No bearer token is sent; the Worker authenticates the HttpOnly session cookie. */
    _getAccessToken: AccessTokenProvider = async () => null,
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {
    const configured = normalizeBaseUrl(config.apiUrl ?? "");
    this.baseUrl = configured || (typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const parsed = new URL(this.baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("The PCG Missions API URL must use HTTPS outside local development.");
    }
  }

  private async request<T>(
    functionName: string,
    path: string,
    options: CmiRequestOptions = {},
  ): Promise<ApiEnvelope<T>> {
    const suffix = path ? (path.startsWith("/") ? path : "/" + path) : "";
    const method = (options.method ?? "GET").toUpperCase();
    const workerPath = workerApiPath(functionName, suffix, method);
    if (!workerPath) {
      throw new CmiApiError(501, "CLOUDFLARE_ROUTE_NOT_MIGRATED",
        "This operation has no Cloudflare Worker route yet. No request was sent to another service.", null);
    }

    const url = new URL(workerPath, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    const headers = new Headers({ Accept: "application/json" });
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    const bodyBranchId = options.body && typeof options.body === "object" && "branch_id" in options.body
      ? (options.body as { branch_id?: unknown }).branch_id
      : undefined;
    const branchId = options.branchId ?? options.query?.branch_id ?? bodyBranchId;
    if (branchId !== undefined && branchId !== null && branchId !== "") headers.set("X-Branch-Id", String(branchId));
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      throw new CmiApiError(0, "NETWORK_ERROR", requestErrorDetail(error), null);
    } finally {
      clearTimeout(timeout);
    }

    const payload = parseJson(await response.text()) as (ApiEnvelope<T> & ApiErrorBody) | null;
    const requestId = payload?.request_id ?? response.headers.get("X-Request-Id");
    if (!response.ok) {
      throw new CmiApiError(
        response.status,
        payload?.error?.code ?? `HTTP_${response.status}`,
        payload?.error?.message ?? "The request could not be completed.",
        requestId ?? null,
      );
    }
    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      throw new CmiApiError(502, "INVALID_RESPONSE", "The server returned an unexpected response.", requestId ?? null);
    }
    return payload;
  }

  getStaffSession() { return this.request<StaffSession>("staff-session", ""); }

  listContacts(branchId: string, options: { limit?: number; offset?: number; search?: string } = {}) {
    return this.request<ContactRecord[]>("staff-operations", "/contacts", {
      query: { branch_id: branchId, limit: options.limit ?? 25, offset: options.offset ?? 0, search: options.search },
    });
  }
  getContact(branchId: string, contactId: string) {
    return this.request<ContactRecord>("staff-operations", `/contacts/${encodeURIComponent(contactId)}`, { query: { branch_id: branchId } });
  }
  createContact(input: ContactCreateInput) {
    if (input.team_id) {
      throw new TypeError("Team assignment is not part of the contact-capture operation.");
    }
    const body = {
      first_name: input.first_name,
      last_name: input.last_name,
      preferred_name: input.preferred_name,
      phone_e164: input.phone_e164,
      email: input.email_normalized,
      age_range: input.age_range,
      preferred_language: input.preferred_language,
      service_area_id: input.service_area_id,
      source_metadata: input.source_metadata,
    };
    return this.request<ContactRecord>("staff-operations", "/contacts", {
      method: "POST",
      query: { branch_id: input.branch_id },
      body,
      idempotencyKey: input.client_request_id,
    });
  }
  updateContact(branchId: string, contactId: string, input: ContactUpdateInput) {
    if (input.service_area_id !== undefined) {
      throw new TypeError("Service-area changes must use the dedicated service-area assignment workflow.");
    }
    const body = {
      first_name: input.first_name,
      last_name: input.last_name,
      preferred_name: input.preferred_name,
      phone_e164: input.phone_e164,
      email: input.email_normalized,
      age_range: input.age_range,
      preferred_language: input.preferred_language,
    };
    const allowedBody = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(allowedBody).length === 0) {
      throw new TypeError("Provide at least one supported contact field to update.");
    }
    return this.request<ContactRecord>("staff-operations", `/contacts/${encodeURIComponent(contactId)}`, {
      method: "PATCH", query: { branch_id: branchId }, body: allowedBody,
    });
  }

  listContactNotes(branchId: string, contactId: string) {
    return this.request<ContactNote[]>(
      "staff-operations",
      `/contacts/${encodeURIComponent(contactId)}/notes`,
      { query: { branch_id: branchId } },
    );
  }
  createContactNote(branchId: string, contactId: string, input: ContactNoteCreateInput) {
    return this.request<ContactNote>(
      "staff-operations",
      `/contacts/${encodeURIComponent(contactId)}/notes`,
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }
  listContactInteractions(branchId: string, contactId: string) {
    return this.request<ContactInteraction[]>(
      "staff-operations",
      `/contacts/${encodeURIComponent(contactId)}/interactions`,
      { query: { branch_id: branchId } },
    );
  }
  createContactInteraction(
    branchId: string,
    contactId: string,
    input: ContactInteractionCreateInput,
  ) {
    return this.request<ContactInteraction>(
      "staff-operations",
      `/contacts/${encodeURIComponent(contactId)}/interactions`,
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }

  listFollowUpTasks(branchId: string, options: { limit?: number; offset?: number; status?: FollowUpTask["status"] } = {}) {
    return this.request<FollowUpTask[]>("staff-operations", "/followup/tasks", {
      branchId,
      query: { limit: options.limit ?? 25, offset: options.offset ?? 0, status: options.status },
    });
  }
  createFollowUpTask(input: TaskCreateInput) {
    assertExactlyOneTaskTarget(input);
    const { branch_id, client_request_id, ...body } = input;
    return this.request<FollowUpTask>("staff-operations", "/followup/tasks", {
      method: "POST",
      query: { branch_id },
      body,
      idempotencyKey: client_request_id,
    });
  }
  updateFollowUpTask(branchId: string, taskId: string, input: TaskUpdateInput) {
    return this.request<FollowUpTask>("staff-operations", `/followup/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }
  reassignFollowUpTask(branchId: string, taskId: string, input: TaskReassignmentInput) {
    assertValidTaskReassignment(input);
    return this.request<FollowUpTask>("staff-operations", `/followup/tasks/${encodeURIComponent(taskId)}/assign`, {
      method: "POST", query: { branch_id: branchId }, body: input,
    });
  }

  listStaffDirectory(branchId: string, options: { limit?: number; offset?: number; search?: string } = {}) {
    return this.request<StaffDirectoryEntry[]>("staff-operations", "/staff", {
      query: { branch_id: branchId, limit: options.limit ?? 25, offset: options.offset ?? 0, search: options.search },
    });
  }

  assignStaffRole(branchId: string, targetProfileId: string, roleCode: StandardStaffRoleCode, reason: string) {
    return this.request<{ id: string; target_profile_id: string; role_code: StandardStaffRoleCode; branch_id: string; starts_at: string; ends_at: string | null }>(
      "staff-role-operations", "/staff/roles", {
        method: "POST", branchId,
        body: { target_profile_id: targetProfileId, role_code: roleCode, starts_at: new Date().toISOString(), ends_at: null, reason },
      },
    );
  }
  revokeStaffRole(branchId: string, assignmentId: string, reason: string) {
    return this.request<{ revoked_assignment_id: string }>(
      "staff-role-operations", "/staff/roles/" + encodeURIComponent(assignmentId), {
        method: "DELETE", branchId, body: { reason },
      },
    );
  }
  listAdminElevationRequests(branchId: string) {
    return this.request<StaffRoleApprovalRequest[]>("staff-role-operations", "/staff/role-elevations", { branchId });
  }
  requestAdminElevation(branchId: string, targetProfileId: string, reason: string) {
    return this.request<{ id: string; target_profile_id: string; status: string }>(
      "staff-role-operations", "/staff/role-elevations", {
        method: "POST", branchId, body: { target_profile_id: targetProfileId, reason },
      },
    );
  }
  reviewAdminElevation(branchId: string, requestId: string, decision: "approve" | "reject", reason: string) {
    return this.request<{ elevation_request_id: string; assignment_id?: string; status: string }>(
      "staff-role-operations", "/staff/role-elevations/" + encodeURIComponent(requestId) + "/" + decision, {
        method: "POST", branchId, body: { review_reason: reason },
      },
    );
  }
  listAdminRevocationRequests(branchId: string) {
    return this.request<StaffRoleApprovalRequest[]>("staff-role-operations", "/staff/role-revocations", { branchId });
  }
  requestAdminRevocation(branchId: string, assignmentId: string, reason: string) {
    return this.request<{ id: string; assignment_id: string; status: string }>(
      "staff-role-operations", "/staff/role-revocations", {
        method: "POST", branchId, body: { assignment_id: assignmentId, reason },
      },
    );
  }
  reviewAdminRevocation(branchId: string, requestId: string, decision: "approve" | "reject", reason: string) {
    return this.request<{ revocation_request_id: string; status: string }>(
      "staff-role-operations", "/staff/role-revocations/" + encodeURIComponent(requestId) + "/" + decision, {
        method: "POST", branchId, body: { review_reason: reason },
      },
    );
  }

  createStaffAccount(input: StaffAccountCreateInput) {
    return this.request<{
      staff_profile_id: string;
      email: string;
      role_code: StaffAccountCreateInput["role_code"];
      account_created: true;
      email_sent: false;
      must_change_password: true;
      temporary_password: string;
      manual_handoff_required: true;
      password_expires_in_hours: number;
    }>("staff-auth", "/admin/staff", { method: "POST", body: input });
  }

    setStaffAccountStatus(
    staffProfileId: string,
    branchId: string,
    status: "active" | "inactive",
    reason: string,
  ) {
    const action = status === "active" ? "reactivate" : "deactivate";
    return this.request<{
      staff_profile_id: string;
      branch_id: string;
      account_status: "active" | "inactive";
      no_change?: boolean;
    }>(
      "staff-access-operations",
      `/staff/${encodeURIComponent(staffProfileId)}/accounts/${action}`,
      { method: "POST", query: { branch_id: branchId }, body: { reason } },
    );
  }

  listStaffPasswordResetRequests(branchId: string) {
    return this.request<StaffPasswordResetRequest[]>(
      "staff-auth",
      "/admin/password-reset-requests",
      { query: { branch_id: branchId } },
    );
  }
  approveStaffPasswordResetRequest(branchId: string, requestId: string, reason: string) {
    return this.request<{
      status: string;
      email: string;
      temporary_password_sent: boolean;
      must_change_password: boolean;
      temporary_password?: string;
      manual_handoff_required?: boolean;
    }>(
      "staff-auth",
      `/admin/password-reset-requests/${encodeURIComponent(requestId)}/approve`,
      { method: "POST", body: { branch_id: branchId, reason } },
    );
  }
  denyStaffPasswordResetRequest(branchId: string, requestId: string, reason: string) {
    return this.request<{ status: string }>(
      "staff-auth",
      `/admin/password-reset-requests/${encodeURIComponent(requestId)}/deny`,
      { method: "POST", body: { branch_id: branchId, reason } },
    );
  }
  listReportTeams(branchId: string) {
    return this.request<Array<{ id: string; name: string }>>("report-operations", "/teams", {
      query: { branch_id: branchId },
    });
  }
  listReportEvents(branchId: string) {
    return this.request<Array<{ id: string; title: string; starts_at: string }>>("report-operations", "/events", {
      query: { branch_id: branchId },
    });
  }
  listMinistryReports(branchId: string, options: {
    report_type?: MinistryReportType;
    status?: Exclude<MinistryReportStatus, "draft">;
    limit?: number;
    offset?: number;
  } = {}) {
    return this.request<MinistryReportRecord[]>("report-operations", "/reports", {
      query: { branch_id: branchId, ...options },
    });
  }
  getMinistryReport(branchId: string, reportId: string) {
    return this.request<MinistryReportRecord>("report-operations", "/reports/" + encodeURIComponent(reportId), {
      query: { branch_id: branchId },
    });
  }
  createMinistryReport(input: MinistryReportCreateInput) {
    return this.request<MinistryReportRecord>("report-operations", "/reports", {
      method: "POST", body: input,
    });
  }
  resubmitMinistryReport(reportId: string, counts: Omit<MinistryReportCreateInput,
    "branch_id" | "report_type" | "period_start" | "period_end" | "team_id" | "event_id"
  >) {
    return this.request<MinistryReportReviewResult>(
      "report-operations",
      "/reports/" + encodeURIComponent(reportId) + "/resubmit",
      { method: "POST", body: counts },
    );
  }
  reviewMinistryReport(reportId: string, input: MinistryReportReviewInput) {
    return this.request<MinistryReportReviewResult>(
      "report-operations",
      "/reports/" + encodeURIComponent(reportId) + "/review",
      { method: "POST", body: input },
    );
  }

  listEventDrafts(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<EventDraftRecord[]>("event-operations", "/events", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createEventDraft(input: EventDraftCreateInput) {
    return this.request<EventDraftRecord>("event-operations", "/events", { method: "POST", body: input });
  }
  updateEventDraft(branchId: string, eventId: string, input: EventDraftPatchInput) {
    return this.request<EventDraftRecord>("event-operations", "/events/" + encodeURIComponent(eventId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }
  cancelEventDraft(branchId: string, eventId: string) {
    return this.request<{ event_id: string; status: string }>("event-operations", "/events/" + encodeURIComponent(eventId) + "/cancel", {
      method: "POST", query: { branch_id: branchId },
    });
  }



  listAssignedPrayerRequests(
    branchId: string,
    options: { limit?: number; offset?: number } = {},
  ) {
    return this.request<AssignedPrayerInbox>(
      "pastoral-operations",
      "/prayer/requests/assigned",
      {
        query: {
          branch_id: branchId,
          limit: options.limit ?? 25,
          offset: options.offset ?? 0,
        },
      },
    );
  }


  openStaffEventRegistration(branchId: string, eventId: string) {
    return this.request<EventDraftRecord>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/staff-registration/open",
      { method: "POST", query: { branch_id: branchId } },
    );
  }
  closeStaffEventRegistration(branchId: string, eventId: string) {
    return this.request<EventDraftRecord>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/staff-registration/close",
      { method: "POST", query: { branch_id: branchId } },
    );
  }
  listEventRegistrations(branchId: string, eventId: string) {
    return this.request<EventRegistrationWorkspace>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/registrations",
      { query: { branch_id: branchId } },
    );
  }
  registerEventAttendee(
    branchId: string,
    eventId: string,
    input: EventStaffRegistrationInput,
  ) {
    return this.request<EventStaffRegistrationResult>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/registrations",
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }




  getEventCloseout(branchId: string, eventId: string) {
    return this.request<EventCloseoutWorkspace>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/closeout",
      { query: { branch_id: branchId } },
    );
  }
  submitEventCloseout(
    branchId: string,
    eventId: string,
    input: { idempotency_key: string; summary_notes: string | null },
  ) {
    return this.request<EventCloseoutSubmissionResult>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/closeout/submit",
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }
  reviewEventCloseout(
    branchId: string,
    eventId: string,
    input: {
      idempotency_key: string;
      decision: "approved" | "returned";
      reason: string | null;
    },
  ) {
    return this.request<EventCloseoutSubmissionResult>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/closeout/review",
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }

  checkinEventRegistration(
    branchId: string,
    eventId: string,
    registrationId: string,
    idempotencyKey: string,
  ) {
    return this.request<EventStaffCheckinResult>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/registrations/" +
        encodeURIComponent(registrationId) + "/check-in",
      {
        method: "POST",
        query: { branch_id: branchId },
        body: { idempotency_key: idempotencyKey },
      },
    );
  }

  cancelEventRegistration(
    branchId: string,
    eventId: string,
    registrationId: string,
    idempotencyKey: string,
  ) {
    return this.request<EventStaffRegistrationResult>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/registrations/" +
        encodeURIComponent(registrationId) + "/cancel",
      {
        method: "POST",
        query: { branch_id: branchId },
        body: { idempotency_key: idempotencyKey },
      },
    );
  }

  getEventAssignments(branchId: string, eventId: string) {
    return this.request<EventAssignmentWorkspace>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/assignments",
      { query: { branch_id: branchId } },
    );
  }
  createEventStaffAssignment(branchId: string, eventId: string, input: EventStaffAssignmentInput) {
    return this.request<EventStaffAssignmentRecord>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/staff-assignments",
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }
  createEventTeamAssignment(branchId: string, eventId: string, input: EventTeamAssignmentInput) {
    return this.request<EventTeamAssignmentRecord>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/team-assignments",
      { method: "POST", query: { branch_id: branchId }, body: input },
    );
  }
  revokeEventAssignment(branchId: string, eventId: string, kind: "staff" | "team", assignmentId: string) {
    const resource = kind === "staff" ? "staff-assignments" : "team-assignments";
    return this.request<{ id: string; revoked_at: string }>(
      "event-operations",
      "/events/" + encodeURIComponent(eventId) + "/" + resource + "/" +
        encodeURIComponent(assignmentId) + "/revoke",
      { method: "POST", query: { branch_id: branchId } },
    );
  }

  listStaffNotifications(branchId: string, limit = 30) {
    return this.request<StaffNotificationInbox>("staff-notifications", "/notifications", {
      query: { branch_id: branchId, limit },
    });
  }
  markStaffNotificationRead(branchId: string, notificationId: string) {
    return this.request<{ updated: boolean }>("staff-notifications", "/notifications/" + encodeURIComponent(notificationId) + "/read", {
      method: "POST", body: { branch_id: branchId },
    });
  }
  markAllStaffNotificationsRead(branchId: string) {
    return this.request<{ updated_count: number }>("staff-notifications", "/notifications/read-all", {
      method: "POST", body: { branch_id: branchId },
    });
  }

  async uploadEventFlyer(branchId: string, eventId: string, file: File): Promise<ApiEnvelope<EventFlyerResult>> {
    const url = new URL("/api/v1/events/" + encodeURIComponent(eventId) + "/flyer", this.baseUrl);
    const headers = new Headers({ Accept: "application/json", "X-Branch-Id": branchId });
    const form = new FormData();
    form.set("file", file);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        method: "POST", headers, body: form, credentials: "include", cache: "no-store", signal: controller.signal,
      });
    } catch (error) {
      throw new CmiApiError(0, "NETWORK_ERROR", requestErrorDetail(error), null);
    } finally {
      clearTimeout(timeout);
    }
    const payload = parseJson(await response.text()) as (ApiEnvelope<EventFlyerResult> & ApiErrorBody) | null;
    const requestId = payload?.request_id ?? response.headers.get("X-Request-Id");
    if (!response.ok) {
      throw new CmiApiError(response.status, payload?.error?.code ?? "EVENT_FLYER_UPLOAD_FAILED",
        payload?.error?.message ?? "The flyer upload could not be completed.", requestId ?? null);
    }
    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      throw new CmiApiError(502, "INVALID_RESPONSE", "The server returned an unexpected response.", requestId ?? null);
    }
    return payload;
  }
  getEventFlyerPreview(branchId: string, eventId: string) {
    return this.request<EventFlyerResult>("event-flyers", "/events/" + encodeURIComponent(eventId), {
      query: { branch_id: branchId },
    });
  }
  removeEventFlyer(branchId: string, eventId: string) {
    return this.request<{ removed: boolean }>("event-flyers", "/events/" + encodeURIComponent(eventId) + "/remove", {
      method: "POST", query: { branch_id: branchId },
    });
  }

  listCalendarEntries(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<CalendarEntryRecord[]>("calendar-operations", "/entries", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createCalendarEntry(input: CalendarEntryCreateInput) {
    return this.request<CalendarEntryRecord>("calendar-operations", "/entries", { method: "POST", body: input });
  }
  updateCalendarEntry(branchId: string, entryId: string, input: CalendarEntryPatchInput) {
    return this.request<CalendarEntryRecord>("calendar-operations", "/entries/" + encodeURIComponent(entryId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }
  cancelCalendarEntry(branchId: string, entryId: string, reason: string) {
    return this.request<{ entry_id: string; status: string }>("calendar-operations", "/entries/" + encodeURIComponent(entryId) + "/cancel", {
      method: "POST", query: { branch_id: branchId }, body: { reason },
    });
  }

  listAnnouncementDrafts(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<AnnouncementDraftRecord[]>("announcement-operations", "/announcements", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createAnnouncementDraft(input: AnnouncementDraftCreateInput) {
    return this.request<AnnouncementDraftRecord>("announcement-operations", "/announcements", { method: "POST", body: input });
  }
  updateAnnouncementDraft(branchId: string, announcementId: string, input: AnnouncementDraftPatchInput) {
    return this.request<AnnouncementDraftRecord>("announcement-operations", "/announcements/" + encodeURIComponent(announcementId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }
  archiveAnnouncementDraft(branchId: string, announcementId: string) {
    return this.request<{ announcement_id: string; status: string }>("announcement-operations", "/announcements/" + encodeURIComponent(announcementId) + "/archive", {
      method: "POST", query: { branch_id: branchId },
    });
  }

  listSermonDrafts(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<SermonDraftRecord[]>("content-operations", "/sermons", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createSermonDraft(input: SermonDraftCreateInput) {
    return this.request<SermonDraftRecord>("content-operations", "/sermons", { method: "POST", body: input });
  }
  updateSermonDraft(branchId: string, sermonId: string, input: SermonDraftPatchInput) {
    return this.request<SermonDraftRecord>("content-operations", "/sermons/" + encodeURIComponent(sermonId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listWelcomeMessageDrafts(branchId: string, options: { limit?: number; offset?: number } = {}) {
    return this.request<WelcomeMessageDraftRecord[]>("content-operations", "/welcome-messages", {
      query: { branch_id: branchId, limit: options.limit ?? 50, offset: options.offset ?? 0 },
    });
  }
  createWelcomeMessageDraft(input: WelcomeMessageDraftCreateInput) {
    return this.request<WelcomeMessageDraftRecord>("content-operations", "/welcome-messages", { method: "POST", body: input });
  }
  updateWelcomeMessageDraft(branchId: string, messageId: string, input: WelcomeMessageDraftPatchInput) {
    return this.request<WelcomeMessageDraftRecord>("content-operations", "/welcome-messages/" + encodeURIComponent(messageId), {
      method: "PATCH", query: { branch_id: branchId }, body: input,
    });
  }

  listTeams(branchId: string) {
    return this.request<TeamWorkspaceData>("team-operations", "/teams", {
      query: { branch_id: branchId },
    });
  }
  createTeam(input: TeamCreateInput) {
    return this.request<TeamMutationResult>("team-operations", "/teams", {
      method: "POST",
      body: input,
    });
  }
  updateTeam(branchId: string, teamId: string, input: TeamPatchInput) {
    return this.request<TeamMutationResult>("team-operations", "/teams/" + encodeURIComponent(teamId), {
      method: "PATCH",
      query: { branch_id: branchId },
      body: input,
    });
  }
  addTeamMember(branchId: string, teamId: string, input: TeamMemberCreateInput) {
    return this.request<TeamMembershipMutationResult>("team-operations", "/teams/" + encodeURIComponent(teamId) + "/members", {
      method: "POST",
      query: { branch_id: branchId },
      body: input,
    });
  }
  updateTeamMemberRole(branchId: string, teamId: string, membershipId: string, input: TeamMemberRoleInput) {
    return this.request<TeamMembershipMutationResult>("team-operations", "/teams/" + encodeURIComponent(teamId) + "/members/" + encodeURIComponent(membershipId), {
      method: "PATCH",
      query: { branch_id: branchId },
      body: input,
    });
  }
  revokeTeamMember(branchId: string, teamId: string, membershipId: string) {
    return this.request<TeamMembershipMutationResult>("team-operations", "/teams/" + encodeURIComponent(teamId) + "/members/" + encodeURIComponent(membershipId) + "/revoke", {
      method: "POST",
      query: { branch_id: branchId },
    });
  }

  listServiceAreas(branchId: string) {
    return this.request<ServiceAreaWorkspaceData>("team-operations", "/areas", {
      query: { branch_id: branchId },
    });
  }
  createServiceArea(input: ServiceAreaCreateInput) {
    return this.request<ServiceAreaMutationResult>("team-operations", "/areas", {
      method: "POST",
      body: input,
    });
  }
  updateServiceArea(branchId: string, areaId: string, input: ServiceAreaPatchInput) {
    return this.request<ServiceAreaMutationResult>("team-operations", "/areas/" + encodeURIComponent(areaId), {
      method: "PATCH",
      query: { branch_id: branchId },
      body: input,
    });
  }
  addAreaCoverage(branchId: string, areaId: string, input: AreaCoverageCreateInput) {
    return this.request<AreaCoverageMutationResult>("team-operations", "/areas/" + encodeURIComponent(areaId) + "/coverage", {
      method: "POST",
      query: { branch_id: branchId },
      body: input,
    });
  }
  revokeAreaCoverage(branchId: string, areaId: string, coverageId: string) {
    return this.request<AreaCoverageMutationResult>("team-operations", "/areas/" + encodeURIComponent(areaId) + "/coverage/" + encodeURIComponent(coverageId) + "/revoke", {
      method: "POST",
      query: { branch_id: branchId },
    });
  }

  readPrayerRequest(branchId: string, requestId: string, accessMode: "assigned" | "oversight", reasonCode?: string) {
    return this.request<unknown>("pastoral-operations", `/prayer/requests/${encodeURIComponent(requestId)}/read`, {
      method: "POST", body: { branch_id: branchId, access_mode: accessMode, ...(reasonCode ? { reason_code: reasonCode } : {}) },
    });
  }
  readCareRecord(branchId: string, recordId: string, accessMode: "assigned" | "oversight", reasonCode?: string) {
    return this.request<unknown>("pastoral-operations", `/care/records/${encodeURIComponent(recordId)}/read`, {
      method: "POST", body: { branch_id: branchId, access_mode: accessMode, ...(reasonCode ? { reason_code: reasonCode } : {}) },
    });
  }
  getPublicContent<T = unknown>(resource: string, query: Record<string, string | number | undefined> = {}) {
    return this.request<T>("public-content", "", { authenticated: false, query: { resource, ...query } });
  }
}

export function createConfiguredCmiApiClient(getAccessToken: AccessTokenProvider): CmiApiClient {
  return new CmiApiClient({}, getAccessToken);
}
