import { describe, expect, it } from "vitest";
import { hasSingleWorkspaceBranch } from "./workspace-context";

describe("workspace branch context", () => {
  it("accepts exactly one non-empty active branch", () => {
    expect(hasSingleWorkspaceBranch([{ id: "branch-a" }])).toBe(true);
  });

  it("rejects an empty branch list", () => {
    expect(hasSingleWorkspaceBranch([])).toBe(false);
  });

  it("rejects multiple branches instead of silently choosing the first", () => {
    expect(hasSingleWorkspaceBranch([{ id: "branch-a" }, { id: "branch-b" }])).toBe(false);
  });

  it("rejects a malformed empty branch identifier", () => {
    expect(hasSingleWorkspaceBranch([{ id: " " }])).toBe(false);
  });
});
