import { createAuth, type AuthEnvironment } from "./auth";
import { authorizeCapability, type AssignableResource, type AuthorizationDecision } from "./authorization";

export interface StaffStatement {
  bind(...values: unknown[]): StaffStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export interface StaffDatabase {
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
}

export interface ActiveBranchContext {
  branchId: string;
  branchName: string;
  roles: string[];
  capabilities: Array<{ code: string; scopeMode: string; sensitivity: string }>;
}

export type StaffContextResult =
  | { state: "unauthenticated" }
  | { state: "staff_inactive" }
  | { state: "staff_not_provisioned" }
  | { state: "branch_not_authorized" }
  | { state: "authenticated"; staff: AuthenticatedStaff; activeBranch: ActiveBranchContext | null };

export async function resolveStaffContext(
  request: Request,
  env: StaffEnvironment,
): Promise<StaffContextResult> {
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return { state: "unauthenticated" };

  const profile = await env.DB.prepare(`
    SELECT id, auth_user_id, full_name, email, account_status
    FROM staff_profile
    WHERE auth_user_id = ?
    LIMIT 1
  `).bind(session.user.id).first<{
    id: string;
    auth_user_id: string;
    full_name: string;
    email: string | null;
    account_status: string;
  }>();

  if (!profile) return { state: "staff_not_provisioned" };
  if (profile.account_status !== "active") return { state: "staff_inactive" };

  const now = new Date().toISOString();
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
    userId: session.user.id,
    profileId: profile.id,
    fullName: profile.full_name,
    email: profile.email ?? session.user.email,
    branches: branchRows.results ?? [],
  };

  const requestedBranchId = request.headers.get("x-branch-id");
  if (!requestedBranchId) {
    return { state: "authenticated", staff, activeBranch: null };
  }

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
  | { state: "unauthenticated" | "staff_inactive" | "staff_not_provisioned" | "branch_not_authorized" | "branch_required" | "capability_denied" }
  | { state: "authorized"; staff: AuthenticatedStaff; activeBranch: ActiveBranchContext; decision: AuthorizationDecision };

/**
 * Shared gate for future business handlers. Call it before the handler query,
 * then repeat the branch/record predicate inside that same read/write SQL
 * statement. Resource IDs/team IDs passed here must be derived from a
 * branch-constrained server-side lookup, never copied from caller claims.
 */
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
  return {
    state: "authorized",
    staff: context.staff,
    activeBranch: context.activeBranch,
    decision,
  };
}
