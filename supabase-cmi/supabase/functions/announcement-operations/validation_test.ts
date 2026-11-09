import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  isUuid,
  parseAnnouncementCreate,
  parseAnnouncementListQuery,
  parseAnnouncementPatch,
} from "./validation.ts";

const branchId = "10000000-0000-4000-8000-000000000001";

Deno.test("parses an announcement draft and normalizes text", () => {
  const result = parseAnnouncementCreate({
    branch_id: branchId,
    title: "  Sunday Service Notice  ",
    body: "  Service begins at 8:00 AM.  ",
  });

  assert(result.ok);
  assertEquals(result.value, {
    branch_id: branchId,
    title: "Sunday Service Notice",
    body: "Service begins at 8:00 AM.",
  });
});

Deno.test("requires a valid branch UUID", () => {
  assertEquals(isUuid(branchId), true);
  assertEquals(isUuid("branch-1"), false);
  assertEquals(
    parseAnnouncementCreate({
      branch_id: "branch-1",
      title: "Service notice",
      body: "Service begins at 8:00 AM.",
    }),
    { ok: false, error: "Invalid branch_id." },
  );
});

Deno.test("rejects caller-controlled publication and audience fields", () => {
  const base = {
    branch_id: branchId,
    title: "Service notice",
    body: "Service begins at 8:00 AM.",
  };
  for (
    const field of [
      "status",
      "is_public",
      "publish_at",
      "published_at",
      "created_by",
      "team_id",
      "event_id",
      "audience",
    ]
  ) {
    assertEquals(
      parseAnnouncementCreate({ ...base, [field]: "published" }),
      { ok: false, error: "Unsupported announcement field." },
    );
  }
});

Deno.test("enforces title and body length limits", () => {
  const base = {
    branch_id: branchId,
    title: "Service notice",
    body: "Service begins at 8:00 AM.",
  };
  assertEquals(
    parseAnnouncementCreate({ ...base, title: "X" }),
    { ok: false, error: "Invalid title." },
  );
  assertEquals(
    parseAnnouncementCreate({ ...base, title: "x".repeat(221) }),
    { ok: false, error: "Invalid title." },
  );
  assertEquals(
    parseAnnouncementCreate({ ...base, body: " " }),
    { ok: false, error: "Invalid body." },
  );
  assertEquals(
    parseAnnouncementCreate({ ...base, body: "x".repeat(20_001) }),
    { ok: false, error: "Invalid body." },
  );
});

Deno.test("rejects non-object payloads and unsupported keys", () => {
  assertEquals(
    parseAnnouncementCreate(null),
    { ok: false, error: "A JSON object is required." },
  );
  assertEquals(
    parseAnnouncementCreate({
      branch_id: branchId,
      title: "Service notice",
      body: "Service begins at 8:00 AM.",
      arbitrary: true,
    }),
    { ok: false, error: "Unsupported announcement field." },
  );
});

Deno.test("accepts only title and body when editing a draft", () => {
  assertEquals(
    parseAnnouncementPatch({
      title: "Updated service notice",
      body: "The service begins at 8:30 AM.",
    }),
    {
      ok: true,
      value: {
        title: "Updated service notice",
        body: "The service begins at 8:30 AM.",
      },
    },
  );
  assertEquals(
    parseAnnouncementPatch({ status: "published" }),
    {
      ok: false,
      error: "Unsupported or empty announcement update.",
    },
  );
  assertEquals(
    parseAnnouncementPatch({}),
    {
      ok: false,
      error: "Unsupported or empty announcement update.",
    },
  );
});

Deno.test("rejects invalid announcement patch values", () => {
  assertEquals(
    parseAnnouncementPatch({ title: "" }),
    { ok: false, error: "Invalid title." },
  );
  assertEquals(
    parseAnnouncementPatch({ body: "x".repeat(20_001) }),
    { ok: false, error: "Invalid body." },
  );
  assertEquals(
    parseAnnouncementPatch("not-an-object"),
    { ok: false, error: "A JSON object is required." },
  );
});

Deno.test("parses bounded branch announcement pagination", () => {
  assertEquals(
    parseAnnouncementListQuery(
      new URL(
        `https://example.test/announcements?branch_id=${branchId}&limit=10&offset=20`,
      ),
    ),
    {
      ok: true,
      value: { branch_id: branchId, limit: 10, offset: 20 },
    },
  );
  assertEquals(
    parseAnnouncementListQuery(
      new URL(
        `https://example.test/announcements?branch_id=${branchId}&limit=51`,
      ),
    ),
    {
      ok: false,
      error: "Limit must be an integer from 1 to 50.",
    },
  );
});

Deno.test("rejects duplicate and unsupported announcement query parameters", () => {
  assertEquals(
    parseAnnouncementListQuery(
      new URL(
        `https://example.test/announcements?branch_id=${branchId}&limit=10&limit=20`,
      ),
    ),
    { ok: false, error: "Duplicate query parameter." },
  );
  assertEquals(
    parseAnnouncementListQuery(
      new URL(
        `https://example.test/announcements?branch_id=${branchId}&status=draft`,
      ),
    ),
    { ok: false, error: "Unsupported query parameter." },
  );
});
