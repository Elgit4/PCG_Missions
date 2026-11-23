import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StaffWorkspace.tsx", import.meta.url), "utf8");

describe("staff account and password-reset mutation concurrency", () => {
  it("serializes staff account, role assignment and dual-control mutations synchronously", () => {
    expect(source).toContain("const staffMutationInFlight = useRef(false)");
    expect(source.match(/staffMutationInFlight\.current = true;/g)).toHaveLength(4);
    expect(source.match(/staffMutationInFlight\.current = false;/g)).toHaveLength(4);
    expect(source).toContain("staffMutationInFlight.current || !canCreateStaffAccounts");
    expect(source).toContain("staffMutationInFlight.current || !staffStatusEdit");
    expect(source).toContain("if (!roleAction || !branchId || !canAssignStaffRoles || staffMutationInFlight.current || saving) return;");
    expect(source).toContain("if (!canApproveStaffRoles || !branchId || staffMutationInFlight.current || processingRoleRequestId) return;");
  });

  it("serializes password-reset approval and denial until the request settles", () => {
    expect(source).toContain("const passwordResetReviewInFlight = useRef(false)");
    expect(source).toContain("passwordResetReviewInFlight.current || !canManagePasswordResets");
    expect(source.match(/passwordResetReviewInFlight\.current = true;/g)).toHaveLength(1);
    expect(source.match(/passwordResetReviewInFlight\.current = false;/g)).toHaveLength(1);
    expect(source).toContain(`finally {
      passwordResetReviewInFlight.current = false;
      setProcessingResetId(null);
    }`);
  });
  it("loads Admin/Pastor elevation and revocation queues on first workspace load", () => {
    expect(source).toContain("requests.push(api.listAdminElevationRequests(branchId)");
    expect(source).toContain("requests.push(api.listAdminRevocationRequests(branchId)");
    expect(source).toContain("canApproveStaffRoles, debouncedQuery");
  });

  it("prevents the requester from reviewing their own Admin/Pastor role request", () => {
    expect(source).toContain("if (request.requested_by === session.staff.id)");
    expect(source).toContain("A different Admin/Pastor must review this request.");
  });

  it("supports authorised team and staff targets for follow-up creation and handoff", () => {
    expect(source).toContain("const canAssignFollowUpToStaff");
    expect(source).toContain("name=\"task_assignment_target\"");
    expect(source).toContain('value={`team:${team.id}`}');
    expect(source).toContain('value={`staff:${member.id}`}');
    expect(source).toContain("const input: TaskReassignmentInput = targetType === \"staff\"");
  });

});
