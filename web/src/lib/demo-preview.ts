import {
  CmiApiClient,
  type ApiEnvelope,
  type ContactCreateInput,
  type ContactRecord,
  type FollowUpTask,
  type StaffAccountCreateInput,
  type StaffDirectoryEntry,
  type StaffPasswordResetRequest,
  type StaffSession,
  type TaskCreateInput,
  type TaskUpdateInput,
} from "./cmi-api";

// Public, isolated preview credentials. These are deliberately NOT production credentials.
export const DEMO_LOGIN_EMAIL = "demo.admin@pcgmissions.test";
export const DEMO_LOGIN_PASSWORD = "PCGMissions-Demo2026!";

export const DEMO_BRANCH_ID = "d3a00000-0000-4000-8000-000000000001";
const DEMO_USER_ID = "d3a00000-0000-4000-8000-000000000002";

function envelope<T>(data: T): ApiEnvelope<T> {
  return { data, request_id: "local-demo-preview" };
}

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const ROLE_NAMES: Record<StaffAccountCreateInput["role_code"], string> = {
  admin_pastor: "Admin / Pastor",
  coordinator: "Coordinator",
  team_leader: "Team Leader",
  field_worker: "Field Worker",
  follow_up_volunteer: "Follow-up Volunteer",
  prayer_intercessor: "Prayer Intercessor",
};

export function createDemoSession(): StaffSession {
  const capabilities = [
    "contact.read.scoped",
    "contact.capture.create",
    "contact.identity.read.scoped",
    "contact.identity.capture",
    "followup.task.read.scoped",
    "followup.task.create",
    "followup.task.update.scoped",
    "staff.password_reset.manage",
    "staff.directory.read",
    "staff.account.manage",
    "access.role.assign",
  ];
  return {
    user: { id: DEMO_USER_ID, email: DEMO_LOGIN_EMAIL },
    staff: {
      id: "d3a00000-0000-4000-8000-000000000003",
      auth_user_id: DEMO_USER_ID,
      full_name: "Demo Administrator",
      email: DEMO_LOGIN_EMAIL,
      account_status: "active",
    },
    branches: [{
      id: DEMO_BRANCH_ID,
      name: "Demo Branch",
      timezone: "Africa/Accra",
    }],
    roles: [{
      code: "admin_pastor",
      name: "Admin / Pastor (Demo)",
      branch_id: DEMO_BRANCH_ID,
    }],
    capabilities: capabilities.map((code) => ({
      code,
      scope_mode: code === "followup.task.create" ? "assigned" : "branch",
      branch_id: DEMO_BRANCH_ID,
    })),
    must_change_password: false,
    password_setup_expires_at: null,
  };
}

/**
 * CMI workspace adapter backed only by in-memory fictional sample records.
 * Every method used by StaffWorkspace is overridden, so demo interactions
 * cannot call Supabase or read/write production church information.
 */
export class DemoCmiApiClient extends CmiApiClient {
  private contacts: ContactRecord[] = [
    {
      id: "d3a00000-0000-4000-8000-000000000011",
      branch_id: DEMO_BRANCH_ID,
      first_name: "Akosua",
      last_name: "Boateng",
      preferred_name: "Akosua",
      contact_status: "active",
      preferred_language: "en",
      created_at: dateDaysAgo(1),
      updated_at: dateDaysAgo(1),
    },
    {
      id: "d3a00000-0000-4000-8000-000000000012",
      branch_id: DEMO_BRANCH_ID,
      first_name: "Kofi",
      last_name: "Mensah",
      preferred_name: "Kofi",
      contact_status: "active",
      preferred_language: "en",
      created_at: dateDaysAgo(2),
      updated_at: dateDaysAgo(2),
    },
    {
      id: "d3a00000-0000-4000-8000-000000000013",
      branch_id: DEMO_BRANCH_ID,
      first_name: "Esi",
      last_name: "Owusu",
      preferred_name: null,
      contact_status: "new",
      preferred_language: "en",
      created_at: dateDaysAgo(3),
      updated_at: dateDaysAgo(3),
    },
    {
      id: "d3a00000-0000-4000-8000-000000000014",
      branch_id: DEMO_BRANCH_ID,
      first_name: "Kwame",
      last_name: "Agyeman",
      preferred_name: "Kwame",
      contact_status: "active",
      preferred_language: "en",
      created_at: dateDaysAgo(5),
      updated_at: dateDaysAgo(5),
    },
    {
      id: "d3a00000-0000-4000-8000-000000000015",
      branch_id: DEMO_BRANCH_ID,
      first_name: "Abena",
      last_name: "Arthur",
      preferred_name: "Abena",
      contact_status: "active",
      preferred_language: "en",
      created_at: dateDaysAgo(7),
      updated_at: dateDaysAgo(7),
    },
    {
      id: "d3a00000-0000-4000-8000-000000000016",
      branch_id: DEMO_BRANCH_ID,
      first_name: "Nana Yaa",
      last_name: "Asare",
      preferred_name: "Yaa",
      contact_status: "new",
      preferred_language: "en",
      created_at: dateDaysAgo(8),
      updated_at: dateDaysAgo(8),
    },
  ];

  private tasks: FollowUpTask[] = [
    {
      id: "d3a00000-0000-4000-8000-000000000021",
      branch_id: DEMO_BRANCH_ID,
      contact_id: "d3a00000-0000-4000-8000-000000000013",
      assignee_user_id: DEMO_USER_ID,
      priority: 1,
      due_at: dateDaysAgo(-1),
      task_note: "Welcome call after the Sunday service",
      status: "open",
      created_at: dateDaysAgo(1),
      updated_at: dateDaysAgo(1),
    },
    {
      id: "d3a00000-0000-4000-8000-000000000022",
      branch_id: DEMO_BRANCH_ID,
      contact_id: "d3a00000-0000-4000-8000-000000000012",
      assignee_user_id: DEMO_USER_ID,
      priority: 2,
      due_at: dateDaysAgo(0),
      task_note: "Check in and share the next meeting details",
      status: "in_progress",
      created_at: dateDaysAgo(2),
      updated_at: dateDaysAgo(1),
    },
    {
      id: "d3a00000-0000-4000-8000-000000000023",
      branch_id: DEMO_BRANCH_ID,
      contact_id: "d3a00000-0000-4000-8000-000000000011",
      assignee_user_id: DEMO_USER_ID,
      priority: 3,
      due_at: dateDaysAgo(2),
      task_note: "Confirm that the member received the follow-up information",
      status: "completed",
      created_at: dateDaysAgo(4),
      updated_at: dateDaysAgo(2),
    },
  ];

  private staff: StaffDirectoryEntry[] = [
    {
      id: "d3a00000-0000-4000-8000-000000000003",
      full_name: "Demo Administrator",
      account_status: "active",
      roles: [{ code: "admin_pastor", name: "Admin / Pastor" }],
    },
    {
      id: "d3a00000-0000-4000-8000-000000000031",
      full_name: "Ama Owusu",
      account_status: "active",
      roles: [{ code: "coordinator", name: "Coordinator" }],
    },
    {
      id: "d3a00000-0000-4000-8000-000000000032",
      full_name: "Daniel Asante",
      account_status: "active",
      roles: [{ code: "team_leader", name: "Team Leader" }],
    },
    {
      id: "d3a00000-0000-4000-8000-000000000033",
      full_name: "Efua Addo",
      account_status: "inactive",
      roles: [{ code: "follow_up_volunteer", name: "Follow-up Volunteer" }],
    },
  ];

  private resetRequests: StaffPasswordResetRequest[] = [
    {
      id: "d3a00000-0000-4000-8000-000000000041",
      email: "ama.owusu@example.test",
      full_name: "Ama Owusu",
      requested_at: dateDaysAgo(0),
      expires_at: dateDaysAgo(-2),
      status: "pending",
    },
    {
      id: "d3a00000-0000-4000-8000-000000000042",
      email: "daniel.asante@example.test",
      full_name: "Daniel Asante",
      requested_at: dateDaysAgo(1),
      expires_at: dateDaysAgo(-1),
      status: "pending",
    },
  ];

  constructor() {
    // These are inert placeholders. All workspace API methods are overridden below.
    super(
      { supabaseUrl: "https://demo-only.invalid", publishableKey: "demo-preview-only" },
      async () => null,
    );
  }

  override async listContacts(
    branchId: string,
    options: { limit?: number; offset?: number; search?: string } = {},
  ) {
    const query = options.search?.trim().toLowerCase() ?? "";
    const filtered = this.contacts.filter((contact) =>
      contact.branch_id === branchId &&
      (!query || `${contact.first_name} ${contact.last_name}`.toLowerCase().includes(query))
    );
    return envelope(filtered.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 25)));
  }

  override async listFollowUpTasks(
    branchId: string,
    options: { limit?: number; offset?: number; status?: FollowUpTask["status"] } = {},
  ) {
    const filtered = this.tasks.filter((task) =>
      task.branch_id === branchId && (!options.status || task.status === options.status)
    );
    return envelope(filtered.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 25)));
  }

  override async listStaffPasswordResetRequests(_branchId: string) {
    return envelope([...this.resetRequests]);
  }

  override async listStaffDirectory(
    _branchId: string,
    options: { limit?: number; offset?: number; search?: string } = {},
  ) {
    const query = options.search?.trim().toLowerCase() ?? "";
    const filtered = this.staff.filter((member) =>
      !query || member.full_name.toLowerCase().includes(query)
    );
    return envelope(filtered.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 25)));
  }

  override async createStaffAccount(input: StaffAccountCreateInput) {
    const id = crypto.randomUUID();
    this.staff = [{
      id,
      full_name: input.full_name,
      account_status: "active",
      roles: [{ code: input.role_code, name: ROLE_NAMES[input.role_code] }],
    }, ...this.staff];
    return envelope({
      staff_profile_id: id,
      email: input.email,
      role_code: input.role_code,
      invitation_email_sent: false,
      must_change_password: true,
    });
  }

  override async setStaffAccountStatus(
    staffProfileId: string,
    branchId: string,
    status: "active" | "inactive",
    _reason: string,
  ) {
    const member = this.staff.find((item) => item.id === staffProfileId);
    if (member) member.account_status = status;
    return envelope({
      staff_profile_id: staffProfileId,
      branch_id: branchId,
      account_status: status,
    });
  }

  override async approveStaffPasswordResetRequest(_branchId: string, requestId: string, _reason: string) {
    this.resetRequests = this.resetRequests.filter((item) => item.id !== requestId);
    return envelope({
      status: "approved",
      temporary_password_sent: false,
      must_change_password: true,
    });
  }

  override async denyStaffPasswordResetRequest(_branchId: string, requestId: string, _reason: string) {
    this.resetRequests = this.resetRequests.filter((item) => item.id !== requestId);
    return envelope({ status: "denied" });
  }

  override async createContact(input: ContactCreateInput) {
    const record: ContactRecord = {
      id: crypto.randomUUID(),
      branch_id: input.branch_id,
      first_name: input.first_name,
      last_name: input.last_name,
      preferred_name: input.preferred_name ?? null,
      phone_display: input.phone_display ?? null,
      email_normalized: input.email_normalized ?? null,
      age_range: input.age_range ?? null,
      preferred_language: input.preferred_language ?? "en",
      contact_status: "new",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.contacts = [record, ...this.contacts];
    return envelope(record);
  }

  override async createFollowUpTask(input: TaskCreateInput) {
    const task: FollowUpTask = {
      id: crypto.randomUUID(),
      branch_id: input.branch_id,
      contact_id: input.contact_id,
      assignee_user_id: input.assignee_user_id ?? null,
      team_id: input.team_id ?? null,
      priority: input.priority,
      due_at: input.due_at ?? null,
      task_note: input.task_note ?? null,
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.tasks = [task, ...this.tasks];
    return envelope(task);
  }

  override async updateFollowUpTask(
    _branchId: string,
    taskId: string,
    input: TaskUpdateInput,
  ) {
    const current = this.tasks.find((task) => task.id === taskId);
    if (!current) throw new Error("Demo task not found.");
    const updated: FollowUpTask = {
      ...current,
      ...input,
      updated_at: new Date().toISOString(),
    };
    this.tasks = this.tasks.map((task) => task.id === taskId ? updated : task);
    return envelope(updated);
  }
}

export function createDemoPreview() {
  return {
    api: new DemoCmiApiClient(),
    session: createDemoSession(),
  };
}
