import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./EventRegistrationsPanel.tsx", import.meta.url), "utf8");

describe("event registration mutation concurrency", () => {
  it("serializes registration, check-in and cancellation with a synchronous mutation lock", () => {
    expect(source).toContain("const mutationInFlight = useRef(false)");
    expect(source.match(/if \(mutationInFlight\.current\) return;/g)).toHaveLength(3);
    expect(source.match(/mutationInFlight\.current = true;/g)).toHaveLength(3);
    expect(source.match(/mutationInFlight\.current = false;/g)).toHaveLength(3);
  });

  it("prevents registration and refresh controls from running during attendance mutations", () => {
    expect(source).toContain("disabled={loading || saving || checkingInId !== null || cancellingId !== null}");
    expect(source).toContain("disabled={saving || checkingInId !== null || cancellingId !== null || loading || attendeeName.trim().length < 2 || remaining === 0}");
  });

  it("keeps the idempotency key stable after an ambiguous registration failure", () => {
    const submit = source.slice(source.indexOf("const submit"), source.indexOf("const checkIn"));
    expect(submit).toContain("idempotency_key: requestKey");
    expect(submit).toContain("setRequestKey(createRequestKey())");
    expect(submit.indexOf("setRequestKey(createRequestKey())")).toBeLessThan(submit.indexOf("} catch (cause)"));
  });
});
