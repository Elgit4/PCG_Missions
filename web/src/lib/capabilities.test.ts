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
  must_change_password: false,
  password_setup_expires_at: null,
};

describe("capability-driven staff navigation", () => {
  it("does not infer business access from role names when grants are empty", () => {
    expect(getAvailableStaffPages(baseSession, "branch-a")).toEqual(["Overview"]);
  });

  it("requires a branch ID for every branch-scoped capability check", () => {
    const session = {
      ...baseSession,
      capabilities: [{ code: "contact.read.scoped", scope_mode: "branch", branch_id: "branch-a" }],
    };
    expect(canOpenStaffPage(session, "Contacts")).toBe(false);
    expect(canOpenStaffPage(session, "Contacts", undefined)).toBe(false);
    expect(canOpenStaffPage(session, "Contacts", "branch-a")).toBe(true);
  });

  it("does not accept a grant from a different active branch", () => {
    const session = {
      ...baseSession,
      capabilities: [{ code: "contact.read.scoped", scope_mode: "branch", branch_id: "branch-b" }],
    };
    expect(canOpenStaffPage(session, "Contacts", "branch-a")).toBe(false);
    expect(canOpenStaffPage(session, "Contacts", "branch-b")).toBe(false);
  });

  it("requires the selected branch to exist in the current staff session", () => {
    expect(canOpenStaffPage(baseSession, "Overview", "branch-b")).toBe(false);
    expect(getAvailableStaffPages(baseSession)).toEqual([]);
  });

  it("keeps pastoral and report pages unavailable without supported list APIs", () => {
    const session = {
      ...baseSession,
      capabilities: [
        { code: "prayer.request.read.assigned", scope_mode: "assigned", branch_id: "branch-a" },
        { code: "report.read", scope_mode: "branch", branch_id: "branch-a" },
      ],
    };
    expect(canOpenStaffPage(session, "Prayer", "branch-a")).toBe(false);
    expect(canOpenStaffPage(session, "Reports", "branch-a")).toBe(false);
  });

  it("shows Teams & Areas only with an explicit branch management grant", () => {
    const noGrant = { ...baseSession, capabilities: [] };
    const teamGrant = { ...baseSession, capabilities: [{ code: "team.manage", scope_mode: "branch", branch_id: "branch-a" }] };
    const areaGrant = { ...baseSession, capabilities: [{ code: "area.manage", scope_mode: "branch", branch_id: "branch-a" }] };
    expect(canOpenStaffPage(noGrant, "Teams & Areas", "branch-a")).toBe(false);
    expect(canOpenStaffPage(teamGrant, "Teams & Areas", "branch-a")).toBe(true);
    expect(canOpenStaffPage(areaGrant, "Teams & Areas", "branch-a")).toBe(true);
    expect(canOpenStaffPage(teamGrant, "Teams & Areas", "branch-b")).toBe(false);
  });

  it("shows event drafts only with event read or management grants", () => {
    const noGrant = { ...baseSession, capabilities: [] };
    const readGrant = { ...baseSession, capabilities: [{ code: "event.read.scoped", scope_mode: "branch", branch_id: "branch-a" }] };
    const manageGrant = { ...baseSession, capabilities: [{ code: "event.manage.scoped", scope_mode: "branch", branch_id: "branch-a" }] };
    expect(canOpenStaffPage(noGrant, "Events", "branch-a")).toBe(false);
    expect(canOpenStaffPage(readGrant, "Events", "branch-a")).toBe(true);
    expect(canOpenStaffPage(manageGrant, "Events", "branch-a")).toBe(true);
  });

  it("keeps calendar, announcement and draft-content pages separately permissioned", () => {
    const session = {
      ...baseSession,
      capabilities: [
        { code: "calendar.read.scoped", scope_mode: "branch", branch_id: "branch-a" },
        { code: "announcement.create.scoped", scope_mode: "branch", branch_id: "branch-a" },
        { code: "content.manage.draft", scope_mode: "branch", branch_id: "branch-a" },
      ],
    };
    expect(canOpenStaffPage(session, "Calendar", "branch-a")).toBe(true);
    expect(canOpenStaffPage(session, "Announcements", "branch-a")).toBe(true);
    expect(canOpenStaffPage(session, "Content", "branch-a")).toBe(true);
    expect(canOpenStaffPage(session, "Announcements", "branch-b")).toBe(false);
  });

  it("checks identity visibility separately from contact directory access", () => {
    const session = {
      ...baseSession,
      capabilities: [{ code: "contact.identity.read.scoped", scope_mode: "assigned", branch_id: "branch-a" }],
    };
    expect(hasIdentityRead(session, "branch-a")).toBe(true);
    expect(hasIdentityRead(session, "branch-b")).toBe(false);
  });

  it("does not open an inactive staff session", () => {
    const session = {
      ...baseSession,
      staff: { ...baseSession.staff, account_status: "inactive" as "active" },
    };
    expect(canOpenStaffPage(session, "Overview", "branch-a")).toBe(false);
  });
});
