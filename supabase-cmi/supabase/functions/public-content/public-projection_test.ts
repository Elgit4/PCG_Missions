import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PUBLIC_RESOURCES } from "./validation.ts";

Deno.test("public event projection excludes private workflow fields", () => {
  const columns = PUBLIC_RESOURCES.events.columns.split(",");
  assert(columns.includes("id"));
  assert(columns.includes("title"));
  assert(columns.includes("starts_at"));
  assert(!columns.includes("capacity"));
  assert(!columns.includes("branch_id"));
  assert(!columns.includes("registration_state"));
  assert(!columns.includes("transport_enabled"));
  assertEquals(PUBLIC_RESOURCES.events.filters, [
    { column: "status", value: "published" },
    { column: "visibility", value: "public" },
  ]);
});

Deno.test(
  "public content projections remain limited to approved published resources",
  () => {
  const resourceNames = Object.keys(PUBLIC_RESOURCES);
  assert(resourceNames.includes("sermons"));
  assert(resourceNames.includes("daily-words"));
  assert(resourceNames.includes("tracts"));
  assert(resourceNames.includes("announcements"));
  assert(resourceNames.includes("events"));
  assert(!resourceNames.includes("contacts"));
    assert(!resourceNames.includes("prayer-requests"));
  },
);
