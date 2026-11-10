export type AuthUserPage<T> = {
  users: unknown;
  error: unknown;
};

export type AuthUserPageLoader<T> = (
  page: number,
  perPage: number,
) => Promise<AuthUserPage<T>> | AuthUserPage<T>;

/**
 * Read every Auth user page before deciding whether first-admin bootstrap is
 * allowed. A bounded scan fails closed rather than treating a truncated result
 * as an empty project.
 */
export async function listAllAuthUsers<T>(
  loadPage: AuthUserPageLoader<T>,
  perPage = 100,
  maxPages = 100,
): Promise<T[]> {
  if (
    !Number.isInteger(perPage) || perPage < 1 ||
    !Number.isInteger(maxPages) || maxPages < 1
  ) {
    throw new Error("INVALID_AUTH_USER_PAGE_LIMIT");
  }

  const users: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await loadPage(page, perPage);
    if (result.error) throw new Error("BOOTSTRAP_AUTH_USER_LOOKUP_FAILED");
    if (!Array.isArray(result.users) || result.users.length > perPage) {
      throw new Error("BOOTSTRAP_AUTH_USER_LOOKUP_FAILED");
    }
    users.push(...result.users as T[]);
    if (result.users.length < perPage) return users;
  }

  throw new Error("BOOTSTRAP_AUTH_USER_SCAN_LIMIT_REACHED");
}
