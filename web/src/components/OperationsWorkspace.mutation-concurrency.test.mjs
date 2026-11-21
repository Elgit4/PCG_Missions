import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./OperationsWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("operations mutation concurrency", () => {
  it("synchronously serializes draft save, flyer removal and registration transitions", () => {
    expect(source).toContain("const mutationInFlight = useRef(false)");
    expect(source.match(/mutationInFlight\.current = true;/g)).toHaveLength(4);
    expect(source.match(/mutationInFlight\.current = false;/g)).toHaveLength(4);
    expect(source).toContain("mutationInFlight.current || !canManage || saving");
    expect(source).toContain("if (mutationInFlight.current) return;");
    expect(source).toContain("api.removeEventFlyer(branchId, editingEvent.id)");
    expect(source).toContain("api.openStaffEventRegistration(branchId, item.id)");
    expect(source).toContain("api.closeStaffEventRegistration(branchId, item.id)");
  });

  it("releases every operations lock in finally", () => {
    expect(source.match(/mutationInFlight\.current = false;/g)).toHaveLength(4);
    expect(source.match(/finally \{\n\s+mutationInFlight\.current = false;\n\s+setSaving\(false\);\n\s+\}/g)).toHaveLength(4);
  });
});
