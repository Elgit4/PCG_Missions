import {
  canReadReport,
  canReviewReport,
  canSelectReportEvent,
  canSelectReportTeam,
  canSubmitOwnReport,
} from "./access.ts";

const author = "author-profile";
const reviewer = "reviewer-profile";
const teamA = "active-team-a";
const teamB = "other-team";
function context(overrides: Partial<Parameters<typeof canReadReport>[0]> = {}) {
  return {
    actorProfileId: reviewer,
    authorProfileId: author,
    teamId: teamA,
    canReadOwn: false,
    canReviewBranch: false,
    canReviewTeam: false,
    activeTeamIds: [] as readonly string[],
    ...overrides,
  };
}

Deno.test("Admin/Pastor and Coordinator branch reviewers can read reports across branch", () => {
  const policy = context({ canReviewBranch: true });
  if (!canReadReport(policy) || !canReviewReport(policy)) {
    throw new Error("branch reviewers must be able to read and review another author's report");
  }
});

Deno.test("branch reviewer cannot review their own report", () => {
  const policy = context({
    actorProfileId: author,
    authorProfileId: author,
    canReviewBranch: true,
  });
  if (!canReadReport(policy) || canReviewReport(policy)) {
    throw new Error("authors can read but never review their own report");
  }
});

Deno.test("Team Leader can review only an active own-team report", () => {
  const ownTeam = context({ canReviewTeam: true, activeTeamIds: [teamA] });
  if (!canReadReport(ownTeam) || !canReviewReport(ownTeam)) {
    throw new Error("active own-team report must be readable/reviewable");
  }
  const otherTeam = context({ canReviewTeam: true, activeTeamIds: [teamB] });
  if (canReadReport(otherTeam) || canReviewReport(otherTeam)) {
    throw new Error("another team's report must remain inaccessible");
  }
  const endedMembership = context({ canReviewTeam: true, activeTeamIds: [] });
  if (canReadReport(endedMembership) || canReviewReport(endedMembership)) {
    throw new Error("expired or revoked membership must not grant access");
  }
});

Deno.test("Field Worker and Follow-up Volunteer can read only their own reports", () => {
  const own = context({ actorProfileId: author, authorProfileId: author, canReadOwn: true });
  if (!canReadReport(own) || canReviewReport(own)) {
    throw new Error("own reports must be readable but not reviewable");
  }
  const someoneElses = context({ canReadOwn: true });
  if (canReadReport(someoneElses) || canReviewReport(someoneElses)) {
    throw new Error("self scope must not expose another author's report");
  }
});

Deno.test("Prayer Intercessor and cross-branch staff receive no report access without grants", () => {
  const noGrant = context();
  if (canReadReport(noGrant) || canReviewReport(noGrant)) {
    throw new Error("lack of report capability must deny all report access");
  }
  if (canSubmitOwnReport([])) {
    throw new Error("no report submission grant must deny submission");
  }
});

Deno.test("report submission requires an explicit self scope", () => {
  if (!canSubmitOwnReport(["self"])) throw new Error("self scope should permit own submissions");
  if (canSubmitOwnReport(["team"]) || canSubmitOwnReport(["branch"])) {
    throw new Error("team/branch scopes alone must not permit own report submission");
  }
});

Deno.test("team and event references require active assignment", () => {
  if (!canSelectReportTeam(null, [])) throw new Error("team is optional");
  if (!canSelectReportTeam(teamA, [teamA])) throw new Error("active own team should be selectable");
  if (canSelectReportTeam(teamB, [teamA])) throw new Error("other team must be rejected");
  if (!canSelectReportEvent(true, false)) throw new Error("staff-assigned event should be selectable");
  if (!canSelectReportEvent(false, true)) throw new Error("team-assigned event should be selectable");
  if (canSelectReportEvent(false, false)) throw new Error("unassigned event must be rejected");
});
