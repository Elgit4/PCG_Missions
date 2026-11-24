import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./EventAssignmentsPanel.tsx", import.meta.url), "utf8");

describe("event assignment mutation concurrency", () => {
  it("serializes assignment creation and revocation synchronously", () => {
    expect(source).toContain("const mutationInFlight = useRef(false)");
    expect(source.match(/if \(mutationInFlight\.current\) return;/g)).toHaveLength(1);
    expect(source.match(/mutationInFlight\.current = true;/g)).toHaveLength(2);
    expect(source.match(/mutationInFlight\.current = false;/g)).toHaveLength(5);
  });

  it("releases the mutation lock when assignment input validation fails", () => {
    expect(source).toContain("There are no active staff members available in this branch.");
    expect(source).toContain("Enter valid assignment dates in the branch time zone.");
    expect(source).toContain("The assignment end must be later than its start.");
    expect(source.match(/mutationInFlight\.current = false;/g)).toHaveLength(5);
  });
});
