import { createAuth, type AuthDatabase, type AuthEnvironment } from "./auth.ts";
import { authorizeCapability, type AssignableResource, type AuthorizationDecision } from "./authorization.ts";

export interface StaffStatement {
  bind(...values: unknown[]): StaffStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export interface StaffDatabase extends AuthDatabase {
  prepare(sql: string): StaffStatement;
}

export interface StaffEnvironment extends AuthEnvironment {
  DB: StaffDatabase;
}

export interface AuthenticatedStaff {
  userId: string;
  profileId: string;
  fullName: string;
  email: string;
  branches: Array<{ id: string; name: string; timezone: string }>;
  roles: Array<{ code: string; name: string; branch_id: string }>;
  capabilities: Array<{ code: string; scope_mode: string; branch_id: string }>;
  mustChangePassword: boolean;
  passwordSetupExpiresAt: string | null;
}

export interface ActiveBranchContext {
  branchId: string;
  branchName: string;
  roles: string[];
  capabilities: Array<{ code: string; scopeMode: string; sensitivity: string }>;
}

export type StaffContextResult =
  | { state: "unauthenticated" }
  | { state: "auth_unavailable" }
  | { state: "staff_inactive" }
  | { state: "password_setup_expired" }
  | { state: "staff_not_provisioned" }
  | { state: "branch_not_authorized" }
  | { state: "authenticated"; staff: AuthenticatedStaff; activeBranch: ActiveBranchContext | null };

export async function resolveStaffContext(
  request: Request,
  env: StaffEnvironment,
): Promise<StaffContextResult> {
  let user: { id: string; email: string };
  try {
    const session = await createAuth(env).api.getSession({ headers: request.headers });
    if (!session?.user?.id) return { state: "unauthenticated" };
    user = { id: session.user.id, email: session.user.email ?? "" };
  } catch {
    return { state: "auth_unavailable" };
  }

  const profile = await env.DB.prepare(`
    SELECT id, auth_user_id, full_name, email, account_status,
           must_change_password, password_setup_expires_at
    FROM staff_profile
    WHERE auth_user_id = ?
    LIMIT 1
  `).bind(user.id).first<{
    id: string;
    auth_user_id: string;
    full_name: string;
    email: string | null;
    account_status: string;
    must_change_password: number;
    password_setup_expires_at: string | null;
  }>();

  if (!profile) return { state: "staff_not_provisioned" };
  if (profile.account_status !== "active") return { state: "staff_inactive" };

  const now = new Date().toISOString();
  const mustChangePassword = profile.must_change_password === 1;
  const passwordSetupExpiresAt = profile.password_setup_expires_at ?? null;
  if (mustChangePassword) {
    const expiresAt = Date.parse(passwordSetupExpiresAt ?? "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { state: "password_setup_expired" };
  }
  const branchRows = await env.DB.prepare(`
    SELECT DISTINCT b.id, b.name, b.timezone
    FROM staff_role_assignment sra
    JOIN role r ON r.id = sra.role_id AND r.is_active = 1
    JOIN branch b ON b.id = sra.branch_id AND b.is_active = 1
    WHERE sra.staff_profile_id = ?
      AND sra.revoked_at IS NULL
      AND sra.starts_at <= ?
      AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    ORDER BY b.name COLLATE NOCASE
  `).bind(profile.id, now, now).all<{ id: string; name: string; timezone: string }>();

  const staff: AuthenticatedStaff = {
    userId: user.id,
    profileId: profile.id,
    fullName: profile.full_name,
    email: profile.email ?? user.email,
    branches: mustChangePassword ? [] : branchRows.results ?? [],
    roles: [],
    capabilities: [],
    mustChangePassword,
    passwordSetupExpiresAt,
  };

  const assignmentRows = await env.DB.prepare(`
    SELECT DISTINCT r.id AS role_id, r.code, r.name, b.id AS branch_id
    FROM staff_role_assignment sra
    JOIN role r ON r.id = sra.role_id AND r.is_active = 1
    JOIN branch b ON b.id = sra.branch_id AND b.is_active = 1
    WHERE sra.staff_profile_id = ? AND sra.revoked_at IS NULL
      AND sra.starts_at <= ? AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    ORDER BY b.name COLLATE NOCASE, r.code
  `).bind(profile.id, now, now).all<{ role_id: string; code: string; name: string; branch_id: string }>();
  const activeAssignments = assignmentRows.results ?? [];
  if (!mustChangePassword) {
    staff.roles = activeAssignments.map(({ code, name, branch_id }) => ({ code, name, branch_id }));
    if (activeAssignments.length > 0) {
      const roleIds = [...new Set(activeAssignments.map((row) => row.role_id))];
      const placeholders = roleIds.map(() => "?").join(",");
      const grants = await env.DB.prepare(`
        SELECT DISTINCT c.code, rc.scope_mode, sra.branch_id
        FROM staff_role_assignment sra
        JOIN role_capability rc ON rc.role_id = sra.role_id
        JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
        WHERE sra.staff_profile_id = ? AND sra.role_id IN (${placeholders})
          AND sra.revoked_at IS NULL AND sra.starts_at <= ?
          AND (sra.ends_at IS NULL OR sra.ends_at > ?)
        ORDER BY sra.branch_id, c.code, rc.scope_mode
      `).bind(profile.id, ...roleIds, now, now).all<{ code: string; scope_mode: string; branch_id: string }>();
      staff.capabilities = grants.results ?? [];
    }
  }

  const requestedBranchId = request.headers.get("x-branch-id");
  if (!requestedBranchId) return { state: "authenticated", staff, activeBranch: null };

  const branch = staff.branches.find((item) => item.id === requestedBranchId);
  if (!branch) return { state: "branch_not_authorized" };

  const grants = await env.DB.prepare(`
    SELECT DISTINCT r.code AS role_code, c.code AS capability_code,
           rc.scope_mode, c.sensitivity
    FROM staff_role_assignment sra
    JOIN role r ON r.id = sra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    WHERE sra.staff_profile_id = ?
      AND sra.branch_id = ?
      AND sra.revoked_at IS NULL
      AND sra.starts_at <= ?
      AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    ORDER BY r.code, c.code
  `).bind(profile.id, branch.id, now, now).all<{
    role_code: string;
    capability_code: string;
    scope_mode: string;
    sensitivity: string;
  }>();

  const rows = grants.results ?? [];
  return {
    state: "authenticated",
    staff,
    activeBranch: {
      branchId: branch.id,
      branchName: branch.name,
      roles: [...new Set(rows.map((row) => row.role_code))],
      capabilities: rows.map((row) => ({
        code: row.capability_code,
        scopeMode: row.scope_mode,
        sensitivity: row.sensitivity,
      })),
    },
  };
}

export type CapabilityRequestResult =
  | { state: "unauthenticated" | "auth_unavailable" | "staff_inactive" | "password_setup_expired" | "staff_not_provisioned" | "branch_not_authorized" | "branch_required" | "capability_denied" }
  | { state: "authorized"; staff: AuthenticatedStaff; activeBranch: ActiveBranchContext; decision: AuthorizationDecision };

/** Apply capability authorization before the handler query. Repeat branch and
 * record predicates inside the actual SQL statement to prevent TOCTOU leaks. */
export async function authorizeRequestCapability(
  request: Request,
  env: StaffEnvironment,
  capability: string,
  resource?: { type: AssignableResource; recordId: string; teamId?: string },
): Promise<CapabilityRequestResult> {
  const context = await resolveStaffContext(request, env);
  if (context.state !== "authenticated") return context;
  if (!context.activeBranch) return { state: "branch_required" };

  const decision = await authorizeCapability(env.DB, {
    actorProfileId: context.staff.profileId,
    branchId: context.activeBranch.branchId,
    capability,
    now: new Date().toISOString(),
    resourceType: resource?.type,
    recordId: resource?.recordId,
    teamId: resource?.teamId,
  });

  if (!decision.allowed) return { state: "capability_denied" };
  return { state: "authorized", staff: context.staff, activeBranch: context.activeBranch, decision };
}
