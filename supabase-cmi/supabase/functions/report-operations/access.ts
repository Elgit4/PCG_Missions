export interface ReportAccessContext {
  actorProfileId: string;
  authorProfileId: string;
  teamId: string | null;
  canReadOwn: boolean;
  canReviewBranch: boolean;
  canReviewTeam: boolean;
  activeTeamIds: readonly string[];
}

/** Branch reviewer, author, or active own-team reviewer may read a report. */
export function canReadReport(context: ReportAccessContext): boolean {
  if (context.canReviewBranch) return true;
  if (context.canReadOwn && context.actorProfileId === context.authorProfileId) {
    return true;
  }
  return Boolean(
    context.canReviewTeam &&
      context.teamId &&
      context.activeTeamIds.includes(context.teamId),
  );
}

/** Self-review is forbidden for every role, including branch-wide reviewers. */
export function canReviewReport(context: ReportAccessContext): boolean {
  if (context.actorProfileId === context.authorProfileId) return false;
  if (context.canReviewBranch) return true;
  return Boolean(
    context.canReviewTeam &&
      context.teamId &&
      context.activeTeamIds.includes(context.teamId),
  );
}

/** A submit permission must explicitly carry the self scope. */
export function canSubmitOwnReport(scopes: readonly string[]): boolean {
  return scopes.includes("self");
}

/** A report can name a team only when the author is currently a member of it. */
export function canSelectReportTeam(
  teamId: string | null,
  activeTeamIds: readonly string[],
): boolean {
  return teamId === null || activeTeamIds.includes(teamId);
}

/** Event reports require an event assigned to the actor or one of their teams. */
export function canSelectReportEvent(
  staffAssigned: boolean,
  activeTeamAssigned: boolean,
): boolean {
  return staffAssigned || activeTeamAssigned;
}
