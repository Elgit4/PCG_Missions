import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  isUuid,
  parseCalendarCreate,
  parseCalendarListQuery,
  parseCalendarPatch,
} from "./validation.ts";

const branchId = "10000000-0000-4000-8000-000000000001";

Deno.test("validates branch calendar pagination", () => {
  assertEquals(isUuid(branchId), true);
  assertEquals(isUuid("branch-1"), false);
  assertEquals(
    parseCalendarListQuery(
      new URL(
        `https://example.test/calendar?branch_id=${branchId}&limit=50&offset=100`,
      ),
    ),
    {
      ok: true,
      value: { branch_id: branchId, limit: 50, offset: 100 },
    },
  );
  assertEquals(
    parseCalendarListQuery(
      new URL(
        `https://example.test/calendar?branch_id=${branchId}&limit=101`,
      ),
    ),
    { ok: false, error: "Limit must be an integer from 1 to 100." },
  );
});

Deno.test("rejects unknown and duplicate calendar query parameters", () => {
  assertEquals(
    parseCalendarListQuery(
      new URL(
        `https://example.test/calendar?branch_id=${branchId}&limit=10&limit=20`,
      ),
    ),
    { ok: false, error: "Duplicate query parameter." },
  );
  assertEquals(
    parseCalendarListQuery(
      new URL(
        `https://example.test/calendar?branch_id=${branchId}&scope=team`,
      ),
    ),
    { ok: false, error: "Unsupported query parameter." },
  );
});

Deno.test("creates branch calendar entries and normalizes timestamps", () => {
  const result = parseCalendarCreate({
    branch_id: branchId,
    entry_type: "service",
    title: "Sunday Service",
    starts_at: "2026-11-15T09:00:00+01:00",
    ends_at: "2026-11-15T12:00:00+01:00",
  });
  assert(result.ok);
  assertEquals(result.value, {
    branch_id: branchId,
    entry_type: "service",
    title: "Sunday Service",
    starts_at: "2026-11-15T08:00:00.000Z",
    ends_at: "2026-11-15T11:00:00.000Z",
  });
});

Deno.test("rejects restricted and caller-controlled calendar scope fields", () => {
  const base = {
    branch_id: branchId,
    entry_type: "service",
    title: "Sunday Service",
    starts_at: "2026-11-15T08:00:00Z",
  };
  for (
    const field of [
      "scope_type",
      "team_id",
      "event_id",
      "owner_user_id",
      "created_by",
      "id",
    ]
  ) {
    assertEquals(
      parseCalendarCreate({ ...base, [field]: "branch" }),
      { ok: false, error: "Unsupported calendar field." },
    );
  }
  assertEquals(
    parseCalendarCreate({ ...base, entry_type: "prayer_schedule" }),
    {
      ok: false,
      error: "entry_type must be service, event or other.",
    },
  );
  assertEquals(
    parseCalendarCreate({ ...base, entry_type: "followup" }),
    {
      ok: false,
      error: "entry_type must be service, event or other.",
    },
  );
});

Deno.test("requires explicit timezone offsets and an increasing time range", () => {
  const base = {
    branch_id: branchId,
    entry_type: "event",
    title: "Outreach",
    starts_at: "2026-11-15T09:00:00",
  };
  assertEquals(
    parseCalendarCreate(base),
    {
      ok: false,
      error: "starts_at must be an ISO timestamp with an explicit timezone.",
    },
  );
  assertEquals(
    parseCalendarCreate({
      ...base,
      starts_at: "2026-11-15T09:00:00Z",
      ends_at: "2026-11-15T08:00:00Z",
    }),
    { ok: false, error: "ends_at must be later than starts_at." },
  );
});

Deno.test("validates calendar title length and entry type", () => {
  const base = {
    branch_id: branchId,
    entry_type: "other",
    starts_at: "2026-11-15T09:00:00Z",
  };
  assertEquals(
    parseCalendarCreate({ ...base, title: "X" }),
    { ok: false, error: "Invalid title." },
  );
  assertEquals(
    parseCalendarCreate({
      ...base,
      title: "Valid title",
      entry_type: "unknown",
    }),
    {
      ok: false,
      error: "entry_type must be service, event or other.",
    },
  );
});

Deno.test("allows only scoped ordinary fields in a calendar update", () => {
  assertEquals(
    parseCalendarPatch(
      {
        title: "Changed title",
        starts_at: "2026-11-15T10:00:00Z",
      },
      "2026-11-15T08:00:00.000Z",
      "2026-11-15T09:00:00.000Z",
    ),
    {
      ok: true,
      value: {
        title: "Changed title",
        starts_at: "2026-11-15T10:00:00.000Z",
      },
    },
  );
  assertEquals(
    parseCalendarPatch(
      { scope_type: "team" },
      "2026-11-15T08:00:00.000Z",
      null,
    ),
    {
      ok: false,
      error: "Unsupported or empty calendar update.",
    },
  );
  assertEquals(
    parseCalendarPatch({}, "2026-11-15T08:00:00.000Z", null),
    {
      ok: false,
      error: "Unsupported or empty calendar update.",
    },
  );
});

Deno.test("checks patched time ranges against unchanged values", () => {
  assertEquals(
    parseCalendarPatch(
      { ends_at: "2026-11-15T07:00:00Z" },
      "2026-11-15T08:00:00.000Z",
      "2026-11-15T10:00:00.000Z",
    ),
    { ok: false, error: "ends_at must be later than starts_at." },
  );
  assertEquals(
    parseCalendarPatch(
      { ends_at: null },
      "2026-11-15T08:00:00.000Z",
      "2026-11-15T10:00:00.000Z",
    ),
    { ok: true, value: { ends_at: null } },
  );
});
