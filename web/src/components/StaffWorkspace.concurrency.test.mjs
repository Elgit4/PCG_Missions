import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StaffWorkspace.tsx", import.meta.url), "utf8");

describe("follow-up task status mutation concurrency", () => {
  it("locks task status changes synchronously before awaiting the API", () => {
    expect(source).toContain("const taskMutationInFlight = useRef(false)");
    expect(source).toContain("taskMutationInFlight.current || !canUpdateTasks");
    expect(source.match(/taskMutationInFlight\.current = true;/g)).toHaveLength(1);
    expect(source.match(/taskMutationInFlight\.current = false;/g)).toHaveLength(1);
  });

  it("releases the lock in finally after successful or failed updates", () => {
    expect(source).toContain(`finally {
      taskMutationInFlight.current = false;
      setUpdatingTaskId(null);
    }`);
  });
});
