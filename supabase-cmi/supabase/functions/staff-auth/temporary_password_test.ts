import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";

import { generateTemporaryPassword } from "./temporary_password.ts";

Deno.test("temporary passwords meet the first-login password policy", () => {
  for (let index = 0; index < 100; index += 1) {
    const password = generateTemporaryPassword();
    assertEquals(password.length, 46);
    assertMatch(password, /[A-Z]/);
    assertMatch(password, /[a-z]/);
    assertMatch(password, /[0-9]/);
  }
});

Deno.test("temporary password generation uses fresh random output", () => {
  const values = new Set(
    Array.from({ length: 100 }, () => generateTemporaryPassword()),
  );
  assertEquals(values.size, 100);
});
