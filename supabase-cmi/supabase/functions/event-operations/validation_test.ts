import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isUuid,
  parseEventCreate,
  parseEventListQuery,
  parseEventPatch,
} from "./validation.ts";

const branchId = "10000000-0000-4000-8000-000000000001";

Deno.test("creates a private draft event with the Accra timezone default", () => {
  const result = parseEventCreate({
    branch_id: branchId,
    title: "Sunday Outreach",
    starts_at: "2026-11-15T08:00:00+00:00",
    ends_at: "2026-11-15T12:00:00+00:00",
  });
  assert(result.ok);
  assertEquals(result.value, {
    branch_id: branchId,
    title: "Sunday Outreach",
    description: null,
    starts_at: "2026-11-15T08:00:00.000Z",
    ends_at: "2026-11-15T12:00:00.000Z",
    timezone: "Africa/Accra",
    location: null,
  });
});

Deno.test("normalizes optional event text and explicit-offset timestamps", () => {
  const result = parseEventCreate({
    branch_id: branchId,
    title: "  Community Service  ",
    description: "  A church-wide service.  ",
    starts_at: "2026-11-15T09:00:00+01:00",
    ends_at: "2026-11-15T13:00:00+01:00",
    timezone: "Africa/Accra",
    location: "  Tema  ",
  });
  assert(result.ok);
  assertEquals(result.value.title, "Community Service");
  assertEquals(result.value.description, "A church-wide service.");
  assertEquals(result.value.starts_at, "2026-11-15T08:00:00.000Z");
  assertEquals(result.value.location, "Tema");
});

Deno.test("rejects missing branch IDs and malformed UUIDs", () => {
  assertEquals(isUuid(branchId), true);
  assertEquals(isUuid("not-a-uuid"), false);
  assertEquals(
    parseEventCreate({
      title: "Sunday Outreach",
      starts_at: "2026-11-15T08:00:00Z",
      ends_at: "2026-11-15T12:00:00Z",
    }),
    { ok: false, error: "Invalid branch_id." },
  );
});

Deno.test("rejects caller-controlled lifecycle and capacity fields", () => {
  const base = {
    branch_id: branchId,
    title: "Sunday Outreach",
    starts_at: "2026-11-15T08:00:00Z",
    ends_at: "2026-11-15T12:00:00Z",
  };
  for (const field of ["status", "visibility", "registration_state", "capacity", "created_by"]) {
    assertEquals(
      parseEventCreate({ ...base, [field]: "published" }),
      { ok: false, error: "Unsupported event field." },
    );
  }
});

Deno.test("rejects invalid title and description lengths", () => {
  const base = {
    branch_id: branchId,
    starts_at: "2026-11-15T08:00:00Z",
    ends_at: "2026-11-15T12:00:00Z",
  };
  assertEquals(
    parseEventCreate({ ...base, title: "X" }),
    { ok: false, error: "Invalid title." },
  );
  assertEquals(
    parseEventCreate({ ...base, title: "Valid title", description: "x".repeat(12001) }),
    { ok: false, error: "Invalid description." },
  );
});

Deno.test("requires timestamps to include an explicit timezone", () => {
  const base = {
    branch_id: branchId,
    title: "Sunday Outreach",
    ends_at: "2026-11-15T12:00:00Z",
  };
  assertEquals(
    parseEventCreate({ ...base, starts_at: "2026-11-15T08:00:00" }),
    { ok: false, error: "starts_at must be an ISO timestamp with an explicit timezone." },
  );
});

Deno.test("rejects invalid timestamps and an end before the start", () => {
  const base = {
    branch_id: branchId,
    title: "Sunday Outreach",
  };
  assertEquals(
    parseEventCreate({
      ...base,
      starts_at: "not-a-date",
      ends_at: "2026-11-15T12:00:00Z",
    }),
    { ok: false, error: "starts_at must be an ISO timestamp with an explicit timezone." },
  );
  assertEquals(
    parseEventCreate({
      ...base,
      starts_at: "2026-11-15T12:00:00Z",
      ends_at: "2026-11-15T08:00:00Z",
    }),
    { ok: false, error: "ends_at must be later than starts_at." },
  );
});

Deno.test("validates IANA timezone names", () => {
  const base = {
    branch_id: branchId,
    title: "Sunday Outreach",
    starts_at: "2026-11-15T08:00:00Z",
    ends_at: "2026-11-15T12:00:00Z",
  };
  assertEquals(
    parseEventCreate({ ...base, timezone: "Not/A-Timezone" }),
    { ok: false, error: "Invalid timezone." },
  );
  const valid = parseEventCreate({ ...base, timezone: "Africa/Accra" });
  assert(valid.ok);
});

Deno.test("accepts only editable fields in an event patch", () => {
  assertEquals(
    parseEventPatch({ title: "Updated title", location: "Tema" }),
    { ok: true, value: { title: "Updated title", location: "Tema" } },
  );
  assertEquals(
    parseEventPatch({ branch_id: branchId }),
    { ok: false, error: "Unsupported or empty event update." },
  );
  assertEquals(
    parseEventPatch({ status: "published" }),
    { ok: false, error: "Unsupported or empty event update." },
  );
  assertEquals(
    parseEventPatch({}),
    { ok: false, error: "Unsupported or empty event update." },
  );
});

Deno.test("checks temporal order when both patch timestamps are supplied", () => {
  assertEquals(
    parseEventPatch({
      starts_at: "2026-11-15T12:00:00Z",
      ends_at: "2026-11-15T11:00:00Z",
    }),
    { ok: false, error: "ends_at must be later than starts_at." },
  );
  assertEquals(
    parseEventPatch({ starts_at: "2026-11-15T12:00:00+00:00" }),
    { ok: true, value: { starts_at: "2026-11-15T12:00:00.000Z" } },
  );
});

Deno.test("parses bounded event-list pagination", () => {
  assertEquals(
    parseEventListQuery(new URL(`https://example.test/events?branch_id=${branchId}&limit=10&offset=20`)),
    { ok: true, value: { branch_id: branchId, limit: 10, offset: 20 } },
  );
  assertEquals(
    parseEventListQuery(new URL(`https://example.test/events?branch_id=${branchId}&limit=51`)),
    { ok: false, error: "Limit must be an integer from 1 to 50." },
  );
});

Deno.test("rejects duplicate and unsupported event-list parameters", () => {
  assertEquals(
    parseEventListQuery(new URL(`https://example.test/events?branch_id=${branchId}&limit=10&limit=20`)),
    { ok: false, error: "Duplicate query parameter." },
  );
  assertEquals(
    parseEventListQuery(new URL(`https://example.test/events?branch_id=${branchId}&status=draft`)),
    { ok: false, error: "Unsupported query parameter." },
  );
});
