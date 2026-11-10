import type { StaffSession } from "./cmi-api";

export type StaffPage = "Overview" | "Contacts" | "Follow-up" | "Events" | "Team" | "Prayer" | "Reports";

const PAGE_CAPABILITIES: Partial<Record<StaffPage, readonly string[]>> = {
  Contacts: ["contact.read.scoped"],
  "Follow-up": ["followup.task.read.scoped"],
  Events: [
    "event.read.scoped",
    "event.manage.scoped",
    "calendar.read.scoped",
    "calendar.manage.scoped",
  ],
  Team: ["staff.directory.read"],
};

/**
 * UI visibility is only a convenience. Every operation must still be
 * authorized by the Edge Function and database transaction.
 */
export function hasCapability(
  session: StaffSession,
  code: string,
  branchId?: string,
): boolean {
  return session.capabilities.some((grant) =>
    grant.code === code && (!branchId || grant.branch_id === branchId)
  );
}

export function canOpenStaffPage(session: StaffSession, page: StaffPage, branchId?: string): boolean {
  if (page === "Overview") return session.staff.account_status === "active";
  if (page === "Prayer" || page === "Reports") return false;

  const required = PAGE_CAPABILITIES[page] ?? [];
  return required.some((code) => hasCapability(session, code, branchId));
}

export function getAvailableStaffPages(session: StaffSession, branchId?: string): StaffPage[] {
  const candidates: StaffPage[] = ["Overview", "Contacts", "Follow-up", "Events", "Team"];
  return candidates.filter((page) => canOpenStaffPage(session, page, branchId));
}

export function hasIdentityRead(session: StaffSession, branchId?: string): boolean {
  return hasCapability(session, "contact.identity.read.scoped", branchId);
}

export function hasIdentityCapture(session: StaffSession, branchId?: string): boolean {
  return hasCapability(session, "contact.identity.capture", branchId);
}
