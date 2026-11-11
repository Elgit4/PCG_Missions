import { resolveBootstrapPath } from "./bootstrap_state.ts";

Deno.test("bootstrap is allowed on an empty Auth project", () => {
  if (resolveBootstrapPath([], "admin@example.test", null) !== "create") {
    throw new Error("empty Auth project should allow initial bootstrap");
  }
});

Deno.test("only the exact single configured Auth user may recover a partial bootstrap", () => {
  const result = resolveBootstrapPath(
    [{ email: " ADMIN@example.test " }],
    "admin@example.test",
    null,
  );
  if (result !== "recover_partial_auth_user") {
    throw new Error("narrow partial Auth-only state should be recoverable");
  }
});

Deno.test("first administrator can safely reissue an undelivered temporary credential", () => {
  const result = resolveBootstrapPath(
    [{ email: "admin@example.test" }],
    "admin@example.test",
    {
      email: "admin@example.test",
      account_status: "active",
      must_change_password: true,
      password_changed_at: null,
    },
  );
  if (result !== "recover_undelivered_credential") {
    throw new Error(
      "still-gated first administrator should allow credential recovery",
    );
  }
});

Deno.test("bootstrap cannot reissue after the administrator changes password", () => {
  const result = resolveBootstrapPath(
    [{ email: "admin@example.test" }],
    "admin@example.test",
    {
      email: "admin@example.test",
      account_status: "active",
      must_change_password: false,
      password_changed_at: "2026-11-11T10:00:00.000Z",
    },
  );
  if (result !== "already_used") {
    throw new Error("password change must permanently consume bootstrap");
  }
});

Deno.test("inactive first administrator cannot use bootstrap recovery", () => {
  const result = resolveBootstrapPath(
    [{ email: "admin@example.test" }],
    "admin@example.test",
    {
      email: "admin@example.test",
      account_status: "inactive",
      must_change_password: true,
      password_changed_at: null,
    },
  );
  if (result !== "already_used") {
    throw new Error(
      "inactive profile must not be eligible for bootstrap recovery",
    );
  }
});

Deno.test(
  "bootstrap recovery is blocked when the staff profile email differs",
  () => {
    const result = resolveBootstrapPath(
      [{ email: "admin@example.test" }],
      "admin@example.test",
      {
        email: "different@example.test",
        account_status: "active",
        must_change_password: true,
        password_changed_at: null,
      },
    );
    if (result !== "blocked") {
      throw new Error("mismatched profile identity must not be recoverable");
    }
  },
);

Deno.test("bootstrap is blocked when any other Auth users exist", () => {
  const cases = [
    [{ email: "other@example.test" }],
    [{ email: "admin@example.test" }, { email: "other@example.test" }],
  ];
  for (const users of cases) {
    if (
      resolveBootstrapPath(users, "admin@example.test", null) !== "blocked"
    ) {
      throw new Error("non-empty unrelated Auth project must remain blocked");
    }
  }
});
