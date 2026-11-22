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
    expect(source).toContain("staffMutationInFlight.current || !roleAction");
    expect(source).toContain("staffMutationInFlight.current || processingRoleRequestId");
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
});
