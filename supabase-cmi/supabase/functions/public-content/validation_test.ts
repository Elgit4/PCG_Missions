import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getScheduledPublicationFilter,
  parsePublicContentRequest,
  PUBLIC_RESOURCES,
} from "./validation.ts";

Deno.test("accepts a published sermons collection with bounded pagination", () => {
  const result = parsePublicContentRequest(
    new URL("https://example.test/?resource=sermons&limit=10&offset=20"),
  );
  assert(result.ok);
  assertEquals(result.value, {
    resource: "sermons",
    limit: 10,
    offset: 20,
  });
});

Deno.test("accepts a valid public slug", () => {
  const result = parsePublicContentRequest(
    new URL("https://example.test/?resource=sermons&slug=hope-in-christ"),
  );
  assert(result.ok);
  assertEquals(result.value, {
    resource: "sermons",
    slug: "hope-in-christ",
    limit: 20,
    offset: 0,
  });
});

Deno.test("rejects unknown resources and parameters", () => {
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=staff")),
    { ok: false, error: "Unsupported public resource." },
  );
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=sermons&select=*")),
    { ok: false, error: "Unsupported query parameter." },
  );
});

Deno.test("rejects malformed slugs and slug lookup for non-slug resources", () => {
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=sermons&slug=../private")),
    { ok: false, error: "Invalid slug." },
  );
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=events&slug=anything")),
    { ok: false, error: "Slug lookup is not supported for this resource." },
  );
});

Deno.test("rejects pagination outside safe bounds", () => {
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=tracts&limit=500")),
    { ok: false, error: "Limit must be an integer from 1 to 50." },
  );
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=events&offset=-1")),
    { ok: false, error: "Offset must be an integer from 0 to 10000." },
  );
});

Deno.test("church profile does not accept collection parameters", () => {
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=church-profile&limit=10")),
    { ok: false, error: "Unsupported query parameter." },
  );
});

Deno.test("public projections use fixed published-only resource mappings", () => {
  assertEquals(PUBLIC_RESOURCES.sermons.filters, [{ column: "status", value: "published" }]);
  assertEquals(PUBLIC_RESOURCES.announcements.filters, [
    { column: "status", value: "published" },
    { column: "is_public", value: true },
  ]);
  assertEquals(PUBLIC_RESOURCES.events.filters, [
    { column: "status", value: "published" },
    { column: "visibility", value: "public" },
  ]);
  assertEquals(PUBLIC_RESOURCES.events.columns.includes("capacity"), false);
  assertEquals(PUBLIC_RESOURCES["welcome-messages"].globalOnly, true);
});

Deno.test("public projections never map private operational domains", () => {
  const mappedTables = Object.values(PUBLIC_RESOURCES).map((resource) => resource.table);
  assertEquals(
    mappedTables.some((table) =>
      ["contact", "staff_profile", "prayer_request", "care_record", "sms_outbox"].includes(table)
    ),
    false,
  );
});


Deno.test("rejects inherited resource names and duplicate query parameters", () => {
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=toString")),
    { ok: false, error: "Unsupported public resource." },
  );
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=sermons&limit=10&limit=20")),
    { ok: false, error: "Duplicate query parameter." },
  );
  assertEquals(
    parsePublicContentRequest(new URL("https://example.test/?resource=sermons&resource=events")),
    { ok: false, error: "Duplicate query parameter." },
  );
});


Deno.test("public announcements are withheld until their scheduled publish time", () => {
  assertEquals(
    PUBLIC_RESOURCES.announcements.publishAtColumn,
    "publish_at",
  );
  assertEquals(
    getScheduledPublicationFilter("announcements", "2026-11-08T12:00:00.000Z"),
    "publish_at.is.null,publish_at.lte.2026-11-08T12:00:00.000Z",
  );
  assertEquals(
    getScheduledPublicationFilter("sermons", "2026-11-08T12:00:00.000Z"),
    null,
  );
});
