import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./TeamAdministrationWorkspace.tsx", import.meta.url), "utf8");

describe("team and service-area mutation concurrency", () => {
  it("uses a synchronous lock at the shared mutation boundary", () => {
    expect(source).toContain("const mutationInFlight = useRef(false)");
    expect(source).toContain("if (mutationInFlight.current) return;");
    expect(source).toContain("mutationInFlight.current = true;");
    expect(source).toContain("mutationInFlight.current = false;");
  });

  it("keeps all team, membership and service-area changes behind the shared mutation boundary", () => {
    expect(source.match(/await completeMutation\(/g)?.length).toBeGreaterThanOrEqual(8);
  });
});
