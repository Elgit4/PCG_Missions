import { describe, expect, it } from "vitest";
import { resolveTheme, type Theme } from "./theme";

describe("theme preference resolution", () => {
  it("uses an explicit saved light or dark preference", () => {
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
  });

  it("follows the operating-system preference when no choice is saved", () => {
    expect(resolveTheme(null, "dark")).toBe("dark");
    expect(resolveTheme(null, "light")).toBe("light");
  });

  it("falls back to light for invalid stored values", () => {
    expect(resolveTheme("system" as Theme, "light")).toBe("light");
  });
});
