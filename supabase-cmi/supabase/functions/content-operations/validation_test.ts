import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  isUuid,
  parseContentListQuery,
  parseSermonCreate,
  parseSermonPatch,
  parseWelcomeMessageCreate,
  parseWelcomeMessagePatch,
} from "./validation.ts";

const branchId = "10000000-0000-4000-8000-000000000001";

Deno.test("validates UUIDs and bounded branch content pagination", () => {
  assertEquals(isUuid(branchId), true);
  assertEquals(isUuid("branch-1"), false);
  assertEquals(
    parseContentListQuery(
      new URL(
        `https://example.test/content?branch_id=${branchId}&limit=10&offset=20`,
      ),
    ),
    {
      ok: true,
      value: { branch_id: branchId, limit: 10, offset: 20 },
    },
  );
  assertEquals(
    parseContentListQuery(
      new URL(`https://example.test/content?branch_id=${branchId}&limit=51`),
    ),
    { ok: false, error: "Limit must be an integer from 1 to 50." },
  );
});

Deno.test("rejects duplicate and unsupported content query parameters", () => {
  assertEquals(
    parseContentListQuery(
      new URL(
        `https://example.test/content?branch_id=${branchId}&limit=10&limit=20`,
      ),
    ),
    { ok: false, error: "Duplicate query parameter." },
  );
  assertEquals(
    parseContentListQuery(
      new URL(
        `https://example.test/content?branch_id=${branchId}&status=draft`,
      ),
    ),
    { ok: false, error: "Unsupported query parameter." },
  );
});

Deno.test("creates a branch sermon with a normalized slug", () => {
  const result = parseSermonCreate({
    branch_id: branchId,
    title: "  Faith and Service  ",
    body: "  The sermon body.  ",
    public_slug: "faith-and-service",
  });
  assert(result.ok);
  assertEquals(result.value, {
    branch_id: branchId,
    title: "Faith and Service",
    body: "The sermon body.",
    public_slug: "faith-and-service",
  });
});

Deno.test("rejects publication and identity fields on sermon creation", () => {
  const base = {
    branch_id: branchId,
    title: "Faith and Service",
    body: "The sermon body.",
    public_slug: "faith-and-service",
  };
  for (
    const field of [
      "status",
      "published_at",
      "created_by",
      "church_id",
      "is_public",
    ]
  ) {
    assertEquals(
      parseSermonCreate({ ...base, [field]: "published" }),
      { ok: false, error: "Unsupported sermon field." },
    );
  }
});

Deno.test("enforces sermon field lengths and slug grammar", () => {
  const base = {
    branch_id: branchId,
    title: "Faith and Service",
    body: "The sermon body.",
    public_slug: "faith-and-service",
  };
  assertEquals(
    parseSermonCreate({ ...base, title: "X" }),
    { ok: false, error: "Invalid title." },
  );
  assertEquals(
    parseSermonCreate({ ...base, body: "x".repeat(30001) }),
    { ok: false, error: "Invalid body." },
  );
  assertEquals(
    parseSermonCreate({ ...base, public_slug: "Faith & Service" }),
    {
      ok: false,
      error:
        "public_slug must contain lowercase letters, numbers and single hyphens.",
    },
  );
});

Deno.test("allows only editable sermon fields in a patch", () => {
  assertEquals(
    parseSermonPatch({
      title: "Updated sermon title",
      public_slug: "updated-sermon-title",
    }),
    {
      ok: true,
      value: {
        title: "Updated sermon title",
        public_slug: "updated-sermon-title",
      },
    },
  );
  assertEquals(
    parseSermonPatch({ status: "published" }),
    { ok: false, error: "Unsupported or empty sermon update." },
  );
  assertEquals(
    parseSermonPatch({}),
    { ok: false, error: "Unsupported or empty sermon update." },
  );
});

Deno.test("creates branch welcome messages with default display order", () => {
  const result = parseWelcomeMessageCreate({
    branch_id: branchId,
    title: "Welcome to worship",
    body: "We are glad you are here.",
  });
  assert(result.ok);
  assertEquals(result.value, {
    branch_id: branchId,
    title: "Welcome to worship",
    body: "We are glad you are here.",
    display_order: 0,
  });
});

Deno.test("rejects publication, global-scope and author fields for welcome messages", () => {
  const base = {
    branch_id: branchId,
    title: "Welcome to worship",
    body: "We are glad you are here.",
  };
  for (
    const field of [
      "status",
      "published_at",
      "created_by",
      "church_id",
      "is_public",
    ]
  ) {
    assertEquals(
      parseWelcomeMessageCreate({ ...base, [field]: "published" }),
      { ok: false, error: "Unsupported welcome-message field." },
    );
  }
  assertEquals(
    parseWelcomeMessageCreate({ ...base, branch_id: null }),
    { ok: false, error: "Invalid branch_id." },
  );
});

Deno.test("validates welcome-message display order and text lengths", () => {
  const base = {
    branch_id: branchId,
    title: "Welcome to worship",
    body: "We are glad you are here.",
  };
  assertEquals(
    parseWelcomeMessageCreate({ ...base, display_order: -1 }),
    {
      ok: false,
      error: "display_order must be an integer from 0 to 10000.",
    },
  );
  assertEquals(
    parseWelcomeMessageCreate({ ...base, display_order: 1.5 }),
    {
      ok: false,
      error: "display_order must be an integer from 0 to 10000.",
    },
  );
  assertEquals(
    parseWelcomeMessageCreate({ ...base, body: "x".repeat(12001) }),
    { ok: false, error: "Invalid body." },
  );
});

Deno.test("allows only title, body and display order in welcome-message updates", () => {
  assertEquals(
    parseWelcomeMessagePatch({
      title: "New welcome title",
      display_order: 5,
    }),
    {
      ok: true,
      value: {
        title: "New welcome title",
        display_order: 5,
      },
    },
  );
  assertEquals(
    parseWelcomeMessagePatch({ status: "published" }),
    {
      ok: false,
      error: "Unsupported or empty welcome-message update.",
    },
  );
  assertEquals(
    parseWelcomeMessagePatch({ display_order: 10001 }),
    {
      ok: false,
      error: "display_order must be an integer from 0 to 10000.",
    },
  );
});
