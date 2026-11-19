import { describe, expect, it } from "vitest";
import { AuthClientError } from "./auth";
import { CmiApiError } from "./cmi-api";
import { formatApplicationError } from "./error-messages";

describe("formatApplicationError", () => {
  it("does not expose raw network diagnostics", () => {
    const error = new CmiApiError(0, "NETWORK_ERROR", "Fetch failed: internal proxy detail", null);
    expect(formatApplicationError(error)).toBe("We couldn't reach the PCG Missions service. Check your internet connection and try again.");
  });

  it("explains permission failures without exposing backend details", () => {
    const error = new CmiApiError(403, "FORBIDDEN", "database policy name", "req-123");
    expect(formatApplicationError(error)).toContain("You don't have permission");
    expect(formatApplicationError(error)).toContain("req-123");
    expect(formatApplicationError(error)).not.toContain("database policy");
  });

  it("explains validation and upload failures", () => {
    expect(formatApplicationError(new CmiApiError(422, "INVALID_INPUT", "raw validation"))).toContain("Some information is missing or invalid");
    expect(formatApplicationError(new CmiApiError(413, "PAYLOAD_TOO_LARGE", "raw body"))).toContain("too large");
    expect(formatApplicationError(new CmiApiError(415, "UNSUPPORTED_MEDIA", "raw mime"))).toContain("file type isn't supported");
  });

  it("uses a generic credential message to avoid account enumeration", () => {
    const error = new AuthClientError(400, "invalid_credentials", "raw auth response");
    expect(formatApplicationError(error)).toBe("The email address or password isn't correct. Check your details and try again.");
  });

  it("includes request references for server failures", () => {
    const error = new CmiApiError(500, "INTERNAL_ERROR", "stack trace", "trace-456");
    expect(formatApplicationError(error)).toContain("Reference: trace-456");
    expect(formatApplicationError(error)).not.toContain("stack trace");
  });
});
