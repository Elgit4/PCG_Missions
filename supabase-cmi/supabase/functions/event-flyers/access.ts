export type FlyerScopeMode = string;

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
  if (!profile || profile.account_status !== "active") {
    return "not_active";
  }
  if (profile.must_change_password) {
    return "password_change_required";
  }
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

const FLYER_STAFF_ASSIGNMENT_ROLES = new Set([
  "owner",
  "organizer",
  "checkin",
  "support",
]);
const FLYER_TEAM_ASSIGNMENT_ROLES = new Set([
  "organizer",
  "ushering",
  "support",
]);

export function isFlyerStaffAssignmentEligible(
  assignmentRole: string,
): boolean {
  return FLYER_STAFF_ASSIGNMENT_ROLES.has(assignmentRole);
}

export function isFlyerTeamAssignmentEligible(
  assignmentRole: string,
): boolean {
  return FLYER_TEAM_ASSIGNMENT_ROLES.has(assignmentRole);
}

export interface FlyerTeamAssignment {
  team_id: string;
  assignment_role: string;
}

export interface FlyerTeamMembership {
  team_id: string;
}

export function hasEligibleFlyerTeamMembership(
  assignments: readonly FlyerTeamAssignment[],
  memberships: readonly FlyerTeamMembership[],
): boolean {
  const memberTeamIds = new Set(
    memberships.map((membership) => membership.team_id),
  );
  return assignments.some((assignment) =>
    isFlyerTeamAssignmentEligible(assignment.assignment_role) &&
    memberTeamIds.has(assignment.team_id)
  );
}

export function hasEligibleFlyerAssignment(
  assignmentRoles: readonly string[],
): boolean {
  return assignmentRoles.some(isFlyerStaffAssignmentEligible);
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
