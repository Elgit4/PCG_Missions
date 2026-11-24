export interface BootstrapAuthUser {
  email?: string | null;
}

export interface BootstrapStaffProfile {
  email?: string | null;
  account_status?: string | null;
  must_change_password?: boolean | null;
  password_changed_at?: string | null;
}

export type BootstrapPath =
  | "create"
  | "recover_partial_auth_user"
  | "recover_undelivered_credential"
  | "already_used"
  | "blocked";

export function resolveBootstrapPath(
  users: BootstrapAuthUser[],
  configuredEmail: string,
  profile: BootstrapStaffProfile | null,
): BootstrapPath {
  if (users.length === 0) return "create";
  if (
    users.length !== 1 ||
    (users[0].email ?? "").trim().toLowerCase() !== configuredEmail
  ) return "blocked";

  if (!profile) return "recover_partial_auth_user";
  if (
    (profile.email ?? "").trim().toLowerCase() !== configuredEmail
  ) {
    return "blocked";
  }

  // Permit credential re-issue only while the provisioned first administrator
  // is still gated behind the initial password change. Once a password has
  // been changed, bootstrap is permanently consumed.
  if (
    profile.account_status === "active" &&
    profile.must_change_password === true &&
    profile.password_changed_at == null
  ) return "recover_undelivered_credential";

  return "already_used";
}
