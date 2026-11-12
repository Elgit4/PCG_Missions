import { describe, expect, it } from "vitest";
import {
  branchLocalInputToIso,
  formatBranchDate,
  toBranchLocalInput,
} from "./branch-time";

describe("branch-local date and time conversion", () => {
  it("converts Ghana branch wall-clock time without a browser-zone offset", () => {
    const iso = branchLocalInputToIso("2026-11-12T18:30", "Africa/Accra");
    expect(iso).toBe("2026-11-12T18:30:00.000Z");
    expect(toBranchLocalInput(iso, "Africa/Accra")).toBe("2026-11-12T18:30");
  });

  it("converts a branch in a non-zero UTC offset", () => {
    expect(branchLocalInputToIso("2026-11-12T09:00", "Asia/Tokyo"))
      .toBe("2026-11-12T00:00:00.000Z");
  });

  it("rejects invalid calendar values, timestamps and IANA time zones", () => {
    expect(branchLocalInputToIso("2026-02-30T09:00", "Africa/Accra")).toBeNull();
    expect(branchLocalInputToIso("not-a-date", "Africa/Accra")).toBeNull();
    expect(branchLocalInputToIso("2026-11-12T09:00", "Not/A-Timezone")).toBeNull();
  });

  it("rejects a nonexistent wall-clock time during a daylight-saving transition", () => {
    expect(branchLocalInputToIso("2026-03-29T01:30", "Europe/London")).toBeNull();
  });

  it("formats dates in the supplied branch time zone", () => {
    expect(formatBranchDate("2026-11-12T18:30:00.000Z", "Africa/Accra"))
      .toMatch(/12 Nov 2026/);
  });

  it("returns safe fallback values for invalid values", () => {
    expect(toBranchLocalInput("invalid", "Africa/Accra")).toBe("");
    expect(formatBranchDate("invalid", "Africa/Accra")).toBe("Date unavailable");
    expect(formatBranchDate(null, "Africa/Accra")).toBe("No end time");
  });
});
