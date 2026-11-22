import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0013_events_attendance_transport.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("staff event registration INSERT uses only columns present in the D1 schema", () => {
  const tableMatch = migration.match(/CREATE TABLE event_registration \(([\s\S]*?)\n\);/i);
  assert.ok(tableMatch, "event_registration table definition must exist");
  const declared = new Set(
    tableMatch[1].split("\n")
      .map((line) => line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1])
      .filter(Boolean),
  );

  const insertMatch = worker.match(/INSERT INTO event_registration\(([^)]+)\)\s*VALUES\(/i);
  assert.ok(insertMatch, "Worker staff registration INSERT must exist");
  const inserted = insertMatch[1].split(",").map((column) => column.trim());

  assert.ok(inserted.length > 0);
  for (const column of inserted) {
    assert.ok(declared.has(column), `Worker INSERT references undeclared D1 column: ${column}`);
  }
  assert.equal(new Set(inserted).size, inserted.length, "INSERT column list must not contain duplicates");
});
