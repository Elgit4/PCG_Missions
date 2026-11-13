export type AuthorizationScope =
  | "branch"
  | "team"
  | "assigned"
  | "event"
  | "self"
  | "explicit_share"
  | "oversight";

export type AssignableResource = "contact" | "followup_task" | "prayer_request" | "pastoral_case";

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export interface AuthorizationDatabase {
  prepare(sql: string): D1Statement;
}

export interface AuthorizationInput {
  /** Must come from the verified server-side session, never request JSON. */
  actorProfileId: string;
  /** Must be resolved and validated by trusted branch-context middleware. */
  branchId: string;
  capability: string;
  now: string;
  resourceType?: AssignableResource;
  recordId?: string;
  teamId?: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  scopeMode?: AuthorizationScope;
  sensitivity?: "ordinary" | "restricted" | "highly_restricted";
}

const AUTHORIZATION_SQL = `
SELECT rc.scope_mode AS scope_mode, c.sensitivity AS sensitivity
FROM staff_profile sp
JOIN branch b ON b.id = ?
JOIN staff_role_assignment sra
  ON sra.staff_profile_id = sp.id
 AND sra.branch_id = b.id
JOIN role r ON r.id = sra.role_id AND r.is_active = 1
JOIN role_capability rc ON rc.role_id = r.id
JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
WHERE sp.id = ?
  AND sp.account_status = 'active'
  AND b.is_active = 1
  AND c.code = ?
  AND sra.revoked_at IS NULL
  AND sra.starts_at <= ?
  AND (sra.ends_at IS NULL OR sra.ends_at > ?)
  AND (
    rc.scope_mode = 'branch'
    OR (
      rc.scope_mode = 'team'
      AND ? IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM staff_team_membership tm
        WHERE tm.staff_profile_id = sp.id
          AND tm.team_id = ?
          AND tm.branch_id = b.id
          AND tm.membership_role = 'leader'
          AND tm.revoked_at IS NULL
          AND tm.starts_at <= ?
          AND (tm.ends_at IS NULL OR tm.ends_at > ?)
      )
    )
    OR (
      rc.scope_mode = 'assigned'
      AND ? = 'contact'
      AND ? IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM contact_assignment ca
        WHERE ca.contact_id = ?
          AND ca.branch_id = b.id
          AND ca.assignee_user_id = sp.auth_user_id
          AND ca.starts_at <= ?
          AND (ca.ends_at IS NULL OR ca.ends_at > ?)
      )
    )
    OR (
      rc.scope_mode = 'assigned'
      AND ? = 'followup_task'
      AND ? IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM followup_task ft
        WHERE ft.id = ?
          AND ft.branch_id = b.id
          AND ft.assignee_user_id = sp.auth_user_id
      )
    )
    OR (
      rc.scope_mode = 'explicit_share'
      AND ? IN ('prayer_request', 'pastoral_case')
      AND ? IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM staff_record_share rs
        WHERE rs.staff_profile_id = sp.id
          AND rs.branch_id = b.id
          AND rs.record_type = ?
          AND rs.record_id = ?
          AND rs.revoked_at IS NULL
          AND rs.starts_at <= ?
          AND (rs.ends_at IS NULL OR rs.ends_at > ?)
      )
    )
    OR (rc.scope_mode = 'self' AND ? = sp.id)
  )
ORDER BY CASE rc.scope_mode
  WHEN 'branch' THEN 1 WHEN 'team' THEN 2 WHEN 'assigned' THEN 3
  WHEN 'explicit_share' THEN 4 WHEN 'self' THEN 5 ELSE 99 END
LIMIT 1
`;

/**
 * Checks an operation grant against active staff status, active role assignment,
 * branch tenancy and record scope. This is a precondition only: the handler must
 * still constrain its actual SELECT/UPDATE/DELETE by the same branch and record
 * predicates to avoid a time-of-check/time-of-use authorization gap.
 */
export async function authorizeCapability(
  db: AuthorizationDatabase,
  input: AuthorizationInput,
): Promise<AuthorizationDecision> {
  if (
    !input.actorProfileId ||
    !input.branchId ||
    !/^[a-z][a-z0-9_.-]{2,119}$/.test(input.capability) ||
    !input.now
  ) {
    return { allowed: false };
  }

  const resourceType = input.resourceType ?? "";
  const recordId = input.recordId ?? "";
  const teamId = input.teamId ?? "";

  // Event/oversight scope remains fail-closed until its domain-specific
  // assignment model and predicates are migrated and reviewed.
  const row = await db.prepare(AUTHORIZATION_SQL).bind(
    input.branchId,
    input.actorProfileId,
    input.capability,
    input.now,
    input.now,
    teamId,
    teamId,
    input.now,
    input.now,
    resourceType,
    recordId,
    recordId,
    input.now,
    input.now,
    resourceType,
    recordId,
    recordId,
    resourceType,
    recordId,
    resourceType,
    recordId,
    input.now,
    input.now,
    input.actorProfileId,
  ).first<{ scope_mode: AuthorizationScope; sensitivity: AuthorizationDecision["sensitivity"] }>();

  if (!row) return { allowed: false };
  return { allowed: true, scopeMode: row.scope_mode, sensitivity: row.sensitivity };
}

export interface SensitiveAccessAuditInput {
  id: string;
  branchId: string;
  actorProfileId: string;
  recordType: "prayer_request" | "pastoral_case";
  recordId: string;
  action: "read" | "created" | "updated";
  purpose: string;
  shareReference?: string;
  createdAt: string;
}

/** Writes a metadata-only immutable audit event; never pass narrative content. */
export async function writeSensitiveAccessAudit(
  db: AuthorizationDatabase,
  input: SensitiveAccessAuditInput,
): Promise<void> {
  if (
    !input.id ||
    !input.branchId ||
    !input.actorProfileId ||
    !input.recordId ||
    input.purpose.trim().length < 10 ||
    input.purpose.trim().length > 300
  ) {
    throw new Error("SENSITIVE_AUDIT_INPUT_INVALID");
  }

  const result = await db.prepare(`
    INSERT INTO sensitive_record_access_audit
      (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.branchId,
    input.actorProfileId,
    input.recordType,
    input.recordId,
    input.action,
    input.purpose.trim(),
    input.shareReference ?? null,
    input.createdAt,
  ).run();

  if (!result.success) throw new Error("SENSITIVE_AUDIT_WRITE_FAILED");
}
