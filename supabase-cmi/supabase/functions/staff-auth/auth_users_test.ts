import { listAllAuthUsers } from "./auth_users.ts";

Deno.test("Auth user scan reads every page before returning a complete result", async () => {
  const calls: number[] = [];
  const users = await listAllAuthUsers(async (page, perPage) => {
    calls.push(page);
    if (perPage !== 2) throw new Error("unexpected page size");
    return {
      users: page === 1 ? ["admin@example.test", "staff@example.test"] : [],
      error: null,
    };
  }, 2, 5);
  if (users.length !== 2 || calls.join(",") !== "1,2") {
    throw new Error("the complete Auth user set was not read");
  }
});

Deno.test("Auth user scan detects a matching admin on a later page", async () => {
  const users = await listAllAuthUsers(async (page) => ({
    users: page === 1 ? ["unrelated-1", "unrelated-2"] :
      page === 2 ? ["admin@example.test"] : [],
    error: null,
  }), 2, 5);
  if (!users.includes("admin@example.test")) {
    throw new Error("later-page Auth user was missed");
  }
});

Deno.test("Auth user scan fails closed when the page limit is reached", async () => {
  let rejected = false;
  try {
    await listAllAuthUsers(async () => ({
      users: ["user-1", "user-2"],
      error: null,
    }), 2, 2);
  } catch (error) {
    rejected = error instanceof Error &&
      error.message === "BOOTSTRAP_AUTH_USER_SCAN_LIMIT_REACHED";
  }
  if (!rejected) throw new Error("truncated Auth scan was accepted");
});

Deno.test("Auth user scan fails closed on provider errors", async () => {
  let rejected = false;
  try {
    await listAllAuthUsers(async () => ({
      users: [],
      error: new Error("provider unavailable"),
    }), 2, 2);
  } catch (error) {
    rejected = error instanceof Error &&
      error.message === "BOOTSTRAP_AUTH_USER_LOOKUP_FAILED";
  }
  if (!rejected) throw new Error("provider failure was accepted");
});

Deno.test("Auth user scan fails closed on malformed pages", async () => {
  let rejected = false;
  try {
    await listAllAuthUsers(async () => ({
      users: ["one", "two", "three"],
      error: null,
    }), 2, 2);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("oversized Auth page was accepted");
});

Deno.test("Auth user scan rejects invalid pagination limits", async () => {
  let rejected = false;
  try {
    await listAllAuthUsers(async () => ({ users: [], error: null }), 0, 1);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("invalid pagination limit was accepted");
});
