export type FlyerScopeMode = "branch" | "event" | "team" | string;

export interface FlyerStaffProfile {
  account_status: string;
  must_change_password: boolean;
}

export type FlyerProfileDenial =
  | "not_active"
  | "password_change_required";

export function flyerProfileDenial(
  profile: FlyerStaffProfile | null,
): FlyerProfileDenial | null {
  if (!profile || profile.account_status !== "active") return "not_active";
  if (profile.must_change_password) return "password_change_required";
  return null;
}

export interface FlyerEventProjection {
  status: string;
  visibility: string;
}

export function isEditablePrivateEvent(
  event: FlyerEventProjection | null,
): boolean {
  return event?.status === "draft" && event.visibility === "private";
}

export interface FlyerScopeDecision {
  branchActive: boolean;
  scopeModes: readonly FlyerScopeMode[];
  directEventAssignment: boolean;
  teamEventMembership: boolean;
}

export function canManageFlyerInScope(
  decision: FlyerScopeDecision,
): boolean {
  if (!decision.branchActive) return false;
  if (decision.scopeModes.includes("branch")) return true;
  if (
    decision.scopeModes.includes("event") &&
    decision.directEventAssignment
  ) return true;
  if (
    decision.scopeModes.includes("team") &&
    decision.teamEventMembership
  ) return true;
  return false;
}
