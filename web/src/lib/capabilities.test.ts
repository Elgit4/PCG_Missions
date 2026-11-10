import { describe, expect, it } from "vitest";
import { canOpenStaffPage, getAvailableStaffPages, hasIdentityRead } from "./capabilities";
import type { StaffSession } from "./cmi-api";

const baseSession: StaffSession = {
  user: { id: "user-1", email: "staff@example.org" },
  staff: {
    id: "staff-1",
    auth_user_id: "user-1",
    full_name: "Staff member",
    email: "staff@example.org",
    account_status: "active",
  },
  branches: [{ id: "branch-a", name: "Main Branch", timezone: "Africa/Accra" }],
  roles: [{ code: "coordinator", name: "Coordinator", branch_id: "branch-a" }],
  capabilities: [],
};

describe("capability-driven staff navigation", () => {
  it("does not infer business access from a role when grants are empty", () => {
    expect(getAvailableStaffPages(baseSession, "branch-a")).toEqual(["Overview"]);
  });

  it("requires the capability to apply to the selected branch", () => {
    const session = {
      ...baseSession,
      capabilities: [{ code: "contact.read.scoped", scope_mode: "branch", branch_id: "branch-b" }],
    };
    expect(canOpenStaffPage(session, "Contacts", "branch-a")).toBe(false);
    expect(canOpenStaffPage(session, "Contacts", "branch-b")).toBe(true);
  });

  it("keeps prayer lists and reports unavailable without supported APIs", () => {
    const session = {
      ...baseSession,
      capabilities: [
        { code: "pastoral.prayer.read.assigned", scope_mode: "assigned", branch_id: "branch-a" },
        { code: "report.read", scope_mode: "branch", branch_id: "branch-a" },
      ],
    };
    expect(canOpenStaffPage(session, "Prayer", "branch-a")).toBe(false);
    expect(canOpenStaffPage(session, "Reports", "branch-a")).toBe(false);
  });

  it("checks identity visibility separately from contact directory access", () => {
    const session = {
      ...baseSession,
      capabilities: [{ code: "contact.identity.read.scoped", scope_mode: "assigned", branch_id: "branch-a" }],
    };
    expect(hasIdentityRead(session, "branch-a")).toBe(true);
    expect(hasIdentityRead(session, "branch-b")).toBe(false);
  });
});
