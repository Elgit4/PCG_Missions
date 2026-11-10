import {
  normalizeEmail,
  parseBranchId,
  parsePasswordChange,
  parseResetRequest,
  parseResetRequestId,
  parseResetReview,
} from "./validation.ts";

Deno.test("normalizes email before lookup", () => {
  if (
    normalizeEmail("  AMa.Mensah@Example.COM ") !== "ama.mensah@example.com"
  ) {
    throw new Error("email was not normalized");
  }
});

Deno.test("rejects malformed email input", () => {
  for (const input of ["", "not-an-email", "a@b", "x".repeat(260), null]) {
    if (normalizeEmail(input) !== null) {
      throw new Error("invalid email accepted");
    }
  }
});

Deno.test("reset request accepts only one email field", () => {
  const valid = parseResetRequest({ email: "Ama@example.com" });
  if (!valid.ok || valid.email !== "ama@example.com") {
    throw new Error("valid reset request rejected");
  }
  if (parseResetRequest({ email: "a@example.com", branch_id: "extra" }).ok) {
    throw new Error("unexpected field accepted");
  }
  if (parseResetRequest("a@example.com").ok) {
    throw new Error("non-object input accepted");
  }
});

Deno.test("branch and request identifiers must be UUIDs", () => {
  const id = "3f5b7df0-30b4-4bcd-a893-a6b1b1a73a63";
  if (parseBranchId(id) !== id || parseResetRequestId(id) !== id) {
    throw new Error("valid UUID rejected");
  }
  if (
    parseBranchId("branch-1") !== null || parseResetRequestId("../1") !== null
  ) {
    throw new Error("invalid UUID accepted");
  }
});

Deno.test("admin review requires branch scope and an auditable reason", () => {
  const valid = parseResetReview({
    branch_id: "3f5b7df0-30b4-4bcd-a893-a6b1b1a73a63",
    reason: "Verified request with the account holder.",
  });
  if (!valid.ok) throw new Error("valid review rejected");
  if (parseResetReview({ branch_id: valid.branch_id, reason: "ok" }).ok) {
    throw new Error("short review reason accepted");
  }
  if (
    parseResetReview({
      branch_id: valid.branch_id,
      reason: "valid reason",
      actor_id: "spoof",
    }).ok
  ) {
    throw new Error("caller-supplied actor field accepted");
  }
});

Deno.test("password change requires a strong replacement password and no extra fields", () => {
  const valid = parsePasswordChange({ password: "NewSecurePassword2026" });
  if (!valid.ok || valid.password !== "NewSecurePassword2026") {
    throw new Error("valid replacement password rejected");
  }
  for (
    const input of [
      { password: "short1A" },
      { password: "lowercasepassword2026" },
      { password: "UPPERCASEPASSWORD2026" },
      { password: "NoDigitsPasswordHere" },
      { password: "x".repeat(129) },
      { password: "NewSecurePassword2026", user_id: "spoofed" },
    ]
  ) {
    if (parsePasswordChange(input).ok) {
      throw new Error("invalid password payload accepted");
    }
  }
});
