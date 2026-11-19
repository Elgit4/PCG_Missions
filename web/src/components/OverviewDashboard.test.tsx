import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OverviewDashboard } from "./OverviewDashboard";

const baseProps = {
  staffName: "Ama Mensah",
  branchName: "Tema Central",
  branchTimeZone: "Africa/Accra",
  contacts: [],
  tasks: [],
  contactsHasMore: false,
  tasksHasMore: false,
  canReadContacts: true,
  canCreateContacts: true,
  canReadTasks: true,
  canCreateTasks: true,
  canReadStaffDirectory: false,
  canManagePasswordResets: false,
  canAccessTeams: false,
  canAccessReports: false,
  onOpenContacts: vi.fn(),
  onCreateContact: vi.fn(),
  onOpenFollowUp: vi.fn(),
  onCreateTask: vi.fn(),
};

describe("OverviewDashboard", () => {
  it("renders the operational hierarchy instead of a permanent getting-started tutorial", () => {
    const html = renderToStaticMarkup(createElement(OverviewDashboard, baseProps));
    expect(html).toContain("Welcome back, Ama");
    expect(html).toContain("Your follow-up queue");
    expect(html).toContain("Quick actions");
    expect(html).not.toContain("GETTING STARTED");
    expect(html).not.toContain("Build your branch contact workflow");
  });

  it("does not expose create actions without the matching capabilities", () => {
    const html = renderToStaticMarkup(createElement(OverviewDashboard, {
      ...baseProps,
      canCreateContacts: false,
      canCreateTasks: false,
    }));
    expect(html).not.toContain("Add contact");
    expect(html).not.toContain("New follow-up");
    expect(html).toContain("Your follow-up queue");
  });

  it("identifies contact and task figures as loaded previews when further records may exist", () => {
    const html = renderToStaticMarkup(createElement(OverviewDashboard, {
      ...baseProps,
      contactsHasMore: true,
      tasksHasMore: true,
      contacts: Array.from({ length: 50 }, (_, index) => ({
        id: `contact-${index}`,
        branch_id: "branch-1",
        first_name: `Contact ${index}`,
        last_name: "Person",
      })) as never[],
    }));
    expect(html).toContain("CONTACTS LOADED");
    expect(html).toContain("first 50 loaded task records");
    expect(html).not.toContain("Branch total");
  });

  it("distinguishes unavailable access from an accessible but empty task queue", () => {
    const noAccess = renderToStaticMarkup(createElement(OverviewDashboard, {
      ...baseProps,
      canReadTasks: false,
      canCreateTasks: false,
    }));
    const empty = renderToStaticMarkup(createElement(OverviewDashboard, {
      ...baseProps,
      canReadTasks: true,
      tasks: [],
    }));
    expect(noAccess).toContain("Follow-up access is not granted");
    expect(empty).toContain("You have no open follow-up tasks in the loaded records");
  });

  it("does not reveal contact names in task previews when contact access is not granted", () => {
    const html = renderToStaticMarkup(createElement(OverviewDashboard, {
      ...baseProps,
      canReadContacts: false,
      contacts: [{
        id: "contact-1",
        branch_id: "branch-1",
        first_name: "Private",
        last_name: "Contact",
      }] as never[],
      tasks: [{
        id: "task-1",
        branch_id: "branch-1",
        contact_id: "contact-1",
        priority: 2,
        due_at: null,
        task_note: "Sensitive note",
        status: "open",
      }],
    }));
    expect(html).not.toContain("Private Contact");
    expect(html).not.toContain("Sensitive note");
    expect(html).toContain("Contact details are restricted");
  });
});
