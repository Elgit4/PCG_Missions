import type { StaffSession } from "./cmi-api";

export type StaffPage = "Overview" | "Contacts" | "Follow-up" | "Events" | "Team" | "Prayer" | "Reports";

const PAGE_CAPABILITIES: Partial<Record<StaffPage, readonly string[]>> = {
  Contacts: ["contact.read.scoped"],
  "Follow-up": ["followup.task.read.scoped"],
  Events: ["event.read.scoped", "calendar.read.scoped"],
  Team: ["staff.directory.read"],
};

/**
 * Navigation is derived only from server-issued grants attached to the
 * explicitly selected active branch. This is a UI guard; the Edge Function
 * remains the authorization authority for every request.
 */
export function hasCapability(
  session: StaffSession,
  code: string,
  branchId?: string,
): boolean {
  if (!branchId || !session.branches.some((branch) => branch.id === branchId)) {
    return false;
  }
  return session.capabilities.some((grant) =>
    grant.code === code && grant.branch_id === branchId
  );
}

export function canOpenStaffPage(
  session: StaffSession,
  page: StaffPage,
  branchId?: string,
): boolean {
  if (!branchId || !session.branches.some((branch) => branch.id === branchId)) {
    return false;
  }
  if (session.staff.account_status !== "active") return false;
  if (page === "Overview") return true;
  if (page === "Prayer" || page === "Reports") return false;

  const required = PAGE_CAPABILITIES[page] ?? [];
  return required.some((code) => hasCapability(session, code, branchId));
}

export function getAvailableStaffPages(session: StaffSession, branchId?: string): StaffPage[] {
  if (!branchId) return [];
  const candidates: StaffPage[] = ["Overview", "Contacts", "Follow-up", "Events", "Team"];
  return candidates.filter((page) => canOpenStaffPage(session, page, branchId));
}

export function hasIdentityRead(session: StaffSession, branchId?: string): boolean {
  return hasCapability(session, "contact.identity.read.scoped", branchId);
}

export function hasIdentityCapture(session: StaffSession, branchId?: string): boolean {
  return hasCapability(session, "contact.identity.capture", branchId);
}

export function hasCapabilityForBranch(
  session: StaffSession,
  code: string,
  branchId: string | undefined,
): boolean {
  return hasCapability(session, code, branchId);
}
