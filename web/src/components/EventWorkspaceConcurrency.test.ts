import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panels = [
  "EventAssignmentsPanel.tsx",
  "EventRegistrationsPanel.tsx",
  "EventCloseoutPanel.tsx",
];

describe("event workspace request isolation", () => {
  for (const filename of panels) {
    it(`ignores stale responses and invalidates requests for ${filename}`, () => {
      const source = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
      expect(source).toContain("const requestVersion = useRef(0)");
      expect(source).toContain("const requestId = ++requestVersion.current");
      expect(source).toContain("if (requestId !== requestVersion.current) return");
      expect(source).toContain("return () => { requestVersion.current += 1; }");
      expect(source).toContain("if (requestId === requestVersion.current) setLoading(false)");
    });
  }
});
