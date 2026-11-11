export interface BootstrapAuthUser {
  email?: string | null;
}

export type BootstrapPath =
  | "create"
  | "recover_partial_auth_user"
  | "already_used"
  | "blocked";

export function resolveBootstrapPath(
  users: BootstrapAuthUser[],
  configuredEmail: string,
  hasStaffProfile: boolean,
): BootstrapPath {
  if (users.length === 0) return "create";
  if (
    users.length === 1 &&
    (users[0].email ?? "").trim().toLowerCase() === configuredEmail
  ) {
    return hasStaffProfile ? "already_used" : "recover_partial_auth_user";
  }
  return "blocked";
}
