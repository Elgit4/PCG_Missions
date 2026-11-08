export interface StaffProfile {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string | null;
  account_status: "invited" | "active" | "inactive" | "suspended";
}

export interface RoleAssignmentRow {
  role_id: string;
  branch_id: string;
  starts_at: string;
  ends_at?: string | null;
  revoked_at?: string | null;
  role?: { code: string; name: string; is_active: boolean } | Array<{
    code: string;
    name: string;
    is_active: boolean;
  }> | null;
}

export interface RoleCapabilityRow {
  role_id: string;
  scope_mode: string;
  capability?: { code: string; is_active: boolean } | Array<{
    code: string;
    is_active: boolean;
  }> | null;
}

export interface BranchRow {
  id: string;
  name: string;
  timezone: string;
  is_active: boolean;
}

export interface StaffSession {
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
}

function relationOne<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/**
 * Build the frontend session projection from trusted database rows.
 * Inactive roles/branches and capabilities without a matching active role
 * assignment are never returned.
 */
export function buildStaffSession(
  profile: StaffProfile,
  assignments: RoleAssignmentRow[],
  roleCapabilities: RoleCapabilityRow[],
  branches: BranchRow[],
): StaffSession {
  const activeBranches = new Map(
    branches.filter((branch) => branch.is_active).map((branch) => [branch.id, branch]),
  );

  const activeAssignments = assignments.flatMap((assignment) => {
    const role = relationOne(assignment.role);
    if (
      !role ||
      !role.is_active ||
      assignment.ends_at != null ||
      assignment.revoked_at != null ||
      !activeBranches.has(assignment.branch_id)
    ) return [];
    return [{ ...assignment, role }];
  });

  const roles = activeAssignments.map((assignment) => ({
    code: assignment.role.code,
    name: assignment.role.name,
    branch_id: assignment.branch_id,
  }));

  const capabilities = roleCapabilities.flatMap((grant) => {
    const capability = relationOne(grant.capability);
    if (!capability?.is_active) return [];
    return activeAssignments
      .filter((assignment) => assignment.role_id === grant.role_id)
      .map((assignment) => ({
        code: capability.code,
        scope_mode: grant.scope_mode,
        branch_id: assignment.branch_id,
      }));
  });

  const uniqueRoles = new Map(
    roles.map((role) => [`${role.branch_id}:${role.code}`, role]),
  );
  const uniqueCapabilities = new Map(
    capabilities.map((item) => [
      `${item.branch_id}:${item.code}:${item.scope_mode}`,
      item,
    ]),
  );

  return {
    staff: {
      id: profile.id,
      auth_user_id: profile.auth_user_id,
      full_name: profile.full_name,
      email: profile.email,
      account_status: "active",
    },
    branches: [...activeBranches.values()]
      .filter((branch) => activeAssignments.some((item) => item.branch_id === branch.id))
      .map(({ id, name, timezone }) => ({ id, name, timezone }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    roles: [...uniqueRoles.values()].sort((a, b) =>
      a.branch_id.localeCompare(b.branch_id) || a.code.localeCompare(b.code)
    ),
    capabilities: [...uniqueCapabilities.values()].sort((a, b) =>
      a.branch_id.localeCompare(b.branch_id) ||
      a.code.localeCompare(b.code) ||
      a.scope_mode.localeCompare(b.scope_mode)
    ),
  };
}
