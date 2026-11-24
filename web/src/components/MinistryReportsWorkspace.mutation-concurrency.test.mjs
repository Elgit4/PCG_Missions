import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./MinistryReportsWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("ministry report mutation concurrency", () => {
  it("synchronously locks submit, resubmit and review actions", () => {
    expect(source).toContain("const mutationInFlight = useRef(false)");
    expect(source.match(/mutationInFlight\.current = true;/g)).toHaveLength(3);
    expect(source.match(/mutationInFlight\.current = false;/g)).toHaveLength(3);
    expect(source).toContain("mutationInFlight.current || !canSubmit");
    expect(source).toContain("mutationInFlight.current || !canSubmit || editingReportId !== report.id");
    expect(source).toContain("mutationInFlight.current || !canReview || reviewingId !== report.id");
  });

  it("releases each mutation lock in finally after success or failure", () => {
    expect(source.match(/finally \{\n      mutationInFlight\.current = false;\n      setSaving\(false\);\n    \}/g)).toHaveLength(3);
  });
});
