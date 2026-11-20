import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MinistryReportsWorkspace.tsx", import.meta.url), "utf8");

describe("ministry report detail request concurrency", () => {
  it("uses a separate request version for detail lookups", () => {
    expect(source).toContain("const detailRequestVersion = useRef(0)");
    expect(source).toContain("const requestId = ++detailRequestVersion.current");
    expect(source).toContain("if (requestId === detailRequestVersion.current)");
  });

  it("invalidates pending detail lookups when the user closes or switches the report", () => {
    expect(source).toContain("detailRequestVersion.current += 1");
    expect(source).toContain("setDetailReport(null)");
  });

  it("invalidates pending detail lookups when the branch-scoped workspace changes or unmounts", () => {
    expect(source).toContain("detailRequestVersion.current += 1;\n    setDetailReport(null);");
    expect(source).toContain("requestVersion.current += 1;\n      detailRequestVersion.current += 1;");
  });
});

it("ignores stale pagination responses after a refresh or branch change", () => {
  expect(source).toContain("const loadMoreRequestVersion = useRef(0)");
  expect(source).toContain("const requestId = ++loadMoreRequestVersion.current");
  expect(source).toContain("if (requestId !== loadMoreRequestVersion.current) return");
  expect(source).toContain("loadMoreRequestVersion.current += 1");
});

it("clears the pagination loading state when a fresh report list supersedes it", () => {
  const loadStart = source.slice(
    source.indexOf("const load = useCallback"),
    source.indexOf("const loadMore ="),
  );
  expect(loadStart).toContain("loadMoreRequestVersion.current += 1");
  expect(loadStart).toContain("setLoadingMore(false)");
});
