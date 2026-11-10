import { resolveBootstrapPath } from "./bootstrap_state.ts";

Deno.test("bootstrap is allowed on an empty Auth project", () => {
  if (resolveBootstrapPath([], "admin@example.test", false) !== "create") {
    throw new Error("empty Auth project should allow initial bootstrap");
  }
});

Deno.test("only the exact single configured Auth user may recover a partial bootstrap", () => {
  const result = resolveBootstrapPath(
    [{ email: " ADMIN@example.test " }],
    "admin@example.test",
    false,
  );
  if (result !== "recover_partial_auth_user") {
    throw new Error("narrow partial Auth-only state should be recoverable");
  }
});

Deno.test("a provisioned staff profile permanently consumes bootstrap", () => {
  const result = resolveBootstrapPath(
    [{ email: "admin@example.test" }],
    "admin@example.test",
    true,
  );
  if (result !== "already_used") {
    throw new Error("existing staff profile must make bootstrap one-time");
  }
});

Deno.test("bootstrap is blocked when any other Auth users exist", () => {
  const cases = [
    [{ email: "other@example.test" }],
    [{ email: "admin@example.test" }, { email: "other@example.test" }],
  ];
  for (const users of cases) {
    if (
      resolveBootstrapPath(users, "admin@example.test", false) !== "blocked"
    ) {
      throw new Error("non-empty unrelated Auth project must remain blocked");
    }
  }
});
