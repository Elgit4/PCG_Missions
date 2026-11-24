import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.ts";

function emptyDatabase() {
  return {
    prepare() {
      return {
        bind() { return this; },
        async all() { return { results: [] }; },
      };
    },
    async batch() {
      throw new Error("An empty due-task set must not write.");
    },
  };
}

test("Worker scheduled entrypoint queues the due-reminder processor", async () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");

  let queued;
  const context = {
    waitUntil(promise) {
      queued = promise;
    },
  };
  worker.scheduled(
    { scheduledTime: Date.parse("2026-11-24T12:00:00.000Z"), cron: "*/15 * * * *" },
    { DB: emptyDatabase() },
    context,
  );

  assert.ok(queued instanceof Promise);
  await queued;
});

test("Worker scheduled entrypoint reports failures without exposing database details", async () => {
  let queued;
  const context = {
    waitUntil(promise) {
      queued = promise;
    },
  };
  const env = {
    DB: {
      prepare() {
        return {
          bind() { return this; },
          async all() { throw new Error("private SQL and row data must not be logged"); },
        };
      },
      async batch() { throw new Error("unexpected batch"); },
    },
  };

  worker.scheduled(
    { scheduledTime: Date.parse("2026-11-24T12:00:00.000Z"), cron: "*/15 * * * *" },
    env,
    context,
  );

  await assert.rejects(queued, /SCHEDULED_FOLLOWUP_REMINDERS_FAILED/);
});
