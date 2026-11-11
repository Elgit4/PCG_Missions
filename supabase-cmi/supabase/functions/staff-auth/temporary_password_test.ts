import { generateTemporaryPassword } from "./temporary_password.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("temporary passwords meet the first-login password policy", () => {
  for (let index = 0; index < 100; index += 1) {
    const password = generateTemporaryPassword();
    assert(password.length === 46, "temporary password must be 46 characters");
    assert(/[A-Z]/.test(password), "temporary password must include uppercase");
    assert(/[a-z]/.test(password), "temporary password must include lowercase");
    assert(/[0-9]/.test(password), "temporary password must include a number");
  }
});

Deno.test("temporary password generation uses fresh random output", () => {
  const values = new Set(
    Array.from({ length: 100 }, () => generateTemporaryPassword()),
  );
  assert(values.size === 100, "100 generated passwords must be unique");
});
