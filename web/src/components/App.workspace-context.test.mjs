import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("authenticated workspace branch safety", () => {
  it("blocks workspace mounting when the staff session has ambiguous branch context", () => {
    expect(app).toContain("!hasSingleWorkspaceBranch(staffSession.branches)");
    expect(app.indexOf("!hasSingleWorkspaceBranch(staffSession.branches)")).toBeLessThan(
      app.indexOf("<StaffWorkspace api={api}"),
    );
  });

  it("does not disclose branch names in the blocked-context message", () => {
    expect(app).toContain("more than one active workspace assignment");
    expect(app).not.toContain("staffSession.branches.map");
  });

  it("distinguishes missing, multiple and malformed workspace assignments", () => {
    expect(app).toContain("staffSession.branches.length === 0");
    expect(app).toContain("staffSession.branches.length > 1");
    expect(app).toContain("This account has no active workspace assignment.");
    expect(app).toContain("This account has more than one active workspace assignment.");
    expect(app).toContain("workspace assignment could not be verified");
  });
});
