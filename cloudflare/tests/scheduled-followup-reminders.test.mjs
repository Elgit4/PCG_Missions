import assert from "node:assert/strict";
import test from "node:test";
import { processDueFollowupReminders } from "../src/scheduled-followup-reminders.ts";

function createDatabase(dueTasks) {
  const prepared = [];
  let batches = 0;
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          return { results: dueTasks };
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      batches += 1;
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
    get prepared() { return prepared; },
    get batches() { return batches; },
  };
  return db;
}

const scheduledAt = Date.parse("2026-11-24T12:00:00.000Z");

test("does not write when there are no due assigned follow-up tasks", async () => {
  const DB = createDatabase([]);
  const result = await processDueFollowupReminders({ DB }, scheduledAt);

  assert.deepEqual(result, { due_tasks_found: 0, notifications_created: 0 });
  assert.equal(DB.batches, 0);
  assert.equal(DB.prepared.length, 1);
  assert.match(DB.prepared[0].sql, /ft\.status IN \('open', 'in_progress'\)/);
  assert.match(DB.prepared[0].sql, /datetime\(ft\.due_at\) <= datetime\(\?\)/);
  assert.match(DB.prepared[0].sql, /sp\.account_status = 'active'/);
  assert.match(DB.prepared[0].sql, /a\.revoked_at IS NULL/);
  assert.match(DB.prepared[0].sql, /NOT EXISTS/);
  assert.deepEqual(DB.prepared[0].values, [
    "2026-11-24T12:00:00.000Z",
    "2026-11-24T12:00:00.000Z",
    "2026-11-24T12:00:00.000Z",
  ]);
});

test("creates generic recipient-scoped reminders with a due-time and assignee idempotency key", async () => {
  const task = {
    id: "task-123",
    branch_id: "branch-123",
    assignee_user_id: "user-123",
    due_at: "2026-11-24T11:45:00.000Z",
  };
  const DB = createDatabase([task]);
  const result = await processDueFollowupReminders({ DB }, scheduledAt);

  assert.deepEqual(result, { due_tasks_found: 1, notifications_created: 1 });
  assert.equal(DB.batches, 1);
  assert.equal(DB.prepared.length, 2);

  const insert = DB.prepared[1];
  assert.match(insert.sql, /INSERT OR IGNORE INTO staff_notification/);
  assert.match(insert.sql, /'system', 'Follow-up due'/);
  assert.match(insert.sql, /'A follow-up task is due\. Open Follow-up to review it\.'/);
  assert.match(insert.sql, /'followup_task'/);
  assert.match(insert.sql, /WHERE EXISTS/);
  assert.match(insert.sql, /ft\.assignee_user_id = \?/);
  assert.match(insert.sql, /ft\.due_at = \?/);
  assert.match(insert.sql, /a\.branch_id = ft\.branch_id/);
  assert.equal(insert.values[1], task.branch_id);
  assert.equal(insert.values[2], task.assignee_user_id);
  assert.equal(insert.values[3], task.id);
  assert.equal(insert.values[4], `followup-due:${task.id}:${task.due_at}:${task.assignee_user_id}`);
  assert.equal(insert.values[6], task.id);
  assert.equal(insert.values[7], task.branch_id);
  assert.equal(insert.values[8], task.assignee_user_id);
  assert.equal(insert.values[9], task.due_at);
});

test("rejects an invalid scheduled timestamp before querying D1", async () => {
  const DB = createDatabase([]);
  await assert.rejects(
    () => processDueFollowupReminders({ DB }, Number.NaN),
    /SCHEDULED_TIME_INVALID/,
  );
  assert.equal(DB.prepared.length, 0);
});

test("processes no more than the bounded 50-task batch per invocation", async () => {
  const tasks = Array.from({ length: 50 }, (_, index) => ({
    id: `task-${index}`,
    branch_id: "branch-123",
    assignee_user_id: "user-123",
    due_at: "2026-11-24T11:45:00.000Z",
  }));
  const DB = createDatabase(tasks);
  const result = await processDueFollowupReminders({ DB }, scheduledAt);

  assert.equal(result.due_tasks_found, 50);
  assert.equal(result.notifications_created, 50);
  assert.equal(DB.batches, 1);
  assert.equal(DB.prepared.length, 51);
});
