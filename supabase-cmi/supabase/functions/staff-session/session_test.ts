import {
  buildStaffSession,
  type BranchRow,
  type RoleAssignmentRow,
  type RoleCapabilityRow,
  type StaffProfile,
} from "./session.ts";

const profile: StaffProfile = {
  id: "profile-1",
  auth_user_id: "auth-1",
  full_name: "Test Staff",
  email: "staff@example.test",
  account_status: "active",
};

const branches: BranchRow[] = [
  {
    id: "branch-1",
    name: "Main Branch",
    timezone: "Africa/Accra",
    is_active: true,
  },
  {
    id: "branch-2",
    name: "Inactive Branch",
    timezone: "Africa/Accra",
    is_active: false,
  },
];

Deno.test("session contains active roles and only active branches", () => {
  const assignments: RoleAssignmentRow[] = [
    {
      role_id: "role-1",
      branch_id: "branch-1",
      starts_at: "2026-01-01T00:00:00Z",
      role: { code: "coordinator", name: "Coordinator", is_active: true },
    },
    {
      role_id: "role-2",
      branch_id: "branch-1",
      starts_at: "2026-01-01T00:00:00Z",
      role: { code: "field_worker", name: "Field Worker", is_active: false },
    },
    {
      role_id: "role-3",
      branch_id: "branch-2",
      starts_at: "2026-01-01T00:00:00Z",
      role: { code: "team_leader", name: "Team Leader", is_active: true },
    },
  ];

  const session = buildStaffSession(profile, assignments, [], branches);

  if (session.roles.length !== 1) throw new Error("Expected one active role.");
  if (session.roles[0].code !== "coordinator") {
    throw new Error("Unexpected role.");
  }
  if (
    session.branches.length !== 1 ||
    session.branches[0].id !== "branch-1"
  ) {
    throw new Error("Inactive branches must not be returned.");
  }
});

Deno.test(
  "session exposes only grants belonging to an active role assignment",
  () => {
    const assignments: RoleAssignmentRow[] = [
      {
        role_id: "role-1",
        branch_id: "branch-1",
        starts_at: "2026-01-01T00:00:00Z",
        role: { code: "coordinator", name: "Coordinator", is_active: true },
      },
    ];
    const grants: RoleCapabilityRow[] = [
      {
        role_id: "role-1",
        scope_mode: "branch",
        capability: { code: "contact.read.scoped", is_active: true },
      },
      {
        role_id: "role-1",
        scope_mode: "assigned",
        capability: { code: "contact.read.scoped", is_active: false },
      },
      {
        role_id: "role-2",
        scope_mode: "branch",
        capability: { code: "contact.export.scoped", is_active: true },
      },
    ];

    const session = buildStaffSession(profile, assignments, grants, branches);

    if (session.capabilities.length !== 1) {
      throw new Error(
        "Only the active assigned role's active capability should be returned.",
      );
    }
    if (session.capabilities[0].code !== "contact.read.scoped") {
      throw new Error("Unexpected capability.");
    }
  },
);

Deno.test("empty role-capability matrix returns no capabilities", () => {
  const assignments: RoleAssignmentRow[] = [
    {
      role_id: "role-1",
      branch_id: "branch-1",
      starts_at: "2026-01-01T00:00:00Z",
      role: { code: "admin_pastor", name: "Admin / Pastor", is_active: true },
    },
  ];
  const session = buildStaffSession(profile, assignments, [], branches);
  if (session.capabilities.length !== 0) {
    throw new Error("Pending grants must remain fail-closed.");
  }
});

Deno.test(
  "session keeps assignments active until their effective end time",
  () => {
    const now = new Date("2026-11-09T06:00:00.000Z");
    const assignments: RoleAssignmentRow[] = [
      {
        role_id: "role-active",
        branch_id: "branch-1",
        starts_at: "2026-10-01T00:00:00.000Z",
        ends_at: "2026-12-01T00:00:00.000Z",
        role: { code: "coordinator", name: "Coordinator", is_active: true },
      },
      {
        role_id: "role-expired",
        branch_id: "branch-1",
        starts_at: "2026-01-01T00:00:00.000Z",
        ends_at: "2026-11-01T00:00:00.000Z",
        role: { code: "field_worker", name: "Field Worker", is_active: true },
      },
      {
        role_id: "role-future",
        branch_id: "branch-1",
        starts_at: "2026-12-01T00:00:00.000Z",
        role: { code: "team_leader", name: "Team Leader", is_active: true },
      },
    ];

    const session = buildStaffSession(
      profile,
      assignments,
      [],
      branches,
      now,
    );

    if (
      session.roles.length !== 1 ||
      session.roles[0].code !== "coordinator"
    ) {
      throw new Error(
        "Only assignments active at the supplied instant should be returned.",
      );
    }
  },
);
