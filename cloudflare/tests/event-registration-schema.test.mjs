import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0013_events_attendance_transport.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("staff event registration INSERT matches the effective D1 schema and actor guard", () => {
  const tableMatch = migration.match(/CREATE TABLE event_registration \(([\s\S]*?)\n\);/i);
  assert.ok(tableMatch, "event_registration table definition must exist");
  const declared = new Set(
    tableMatch[1].split("\n")
      .map((line) => line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1])
      .filter(Boolean),
  );

  // Migration 0013 adds actor attribution after the initial CREATE TABLE.
  if (/ALTER TABLE\s+event_registration\s+ADD COLUMN\s+created_by\b/i.test(migration)) {
    declared.add("created_by");
  }

  const insertMatch = worker.match(/INSERT INTO event_registration\(([^)]+)\)\s*VALUES\(/i);
  assert.ok(insertMatch, "Worker staff registration INSERT must exist");
  const inserted = insertMatch[1].split(",").map((column) => column.trim());

  assert.ok(inserted.length > 0);
  for (const column of inserted) {
    assert.ok(declared.has(column), "Worker INSERT references undeclared D1 column: " + column);
  }
  assert.equal(new Set(inserted).size, inserted.length, "INSERT column list must not contain duplicates");
  assert.ok(inserted.includes("created_by"), "registration must persist the authenticated actor required by the D1 authorization trigger");
  assert.match(migration, /event_registration_authorize_insert[\s\S]*NEW\.created_by IS NULL/i);
  assert.match(worker.slice(insertMatch.index, insertMatch.index + 500), /context\.staff\.userId/);
});

test("event creation and mutation persist the authenticated initial modifier", () => {
  const insertMatch = worker.match(/INSERT INTO event\\(([^)]+)\\)\\s*VALUES\\(/i);
  assert.ok(insertMatch, "Worker event INSERT must exist");
  const inserted = insertMatch[1].split(",").map((column) => column.trim());
  assert.ok(inserted.includes("created_by"));
  assert.ok(inserted.includes("last_modified_by"));
  const insertStatement = worker.slice(insertMatch.index, insertMatch.index + 1200);
  assert.match(insertStatement, /context\\.staff\\.userId,context\\.staff\\.userId,now,now/);
  assert.match(worker, /assignments\\.push\\("last_modified_by=\\?"\\);values\\.push\\(context\\.staff\\.userId\\)/);
  for (const statement of [
    /UPDATE event SET flyer_key=\\?,flyer_content_type=\\?,flyer_size=\\?,flyer_updated_at=\\?,last_modified_by=\\?/,
    /UPDATE event SET flyer_key=NULL,flyer_content_type=NULL,flyer_size=NULL,flyer_updated_at=\\?,last_modified_by=\\?/,
    /UPDATE event SET status='cancelled',registration_state='closed',last_modified_by=\\?/,
    /UPDATE event SET registration_state=\\?,last_modified_by=\\?/,
  ]) assert.match(worker, statement);
});
