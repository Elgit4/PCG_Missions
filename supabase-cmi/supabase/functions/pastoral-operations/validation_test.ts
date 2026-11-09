import {
  isUuid,
  parsePastoralReadInput,
  parsePastoralReadPath,
} from "./validation.ts";

const BRANCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba101";
const RECORD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbba301";

Deno.test("accepts canonical UUIDs and rejects malformed values", () => {
  if (!isUuid(BRANCH_ID) || isUuid("branch-1")) {
    throw new Error("UUID validation did not enforce the canonical format.");
  }
});

Deno.test("parses prayer and care read routes", () => {
  const prayer = parsePastoralReadPath(
    `/functions/v1/pastoral-operations/prayer/requests/${RECORD_ID}/read`,
  );
  const care = parsePastoralReadPath(
    `/pastoral-operations/care/records/${RECORD_ID}/read`,
  );

  if (
    prayer?.kind !== "prayer_request" ||
    prayer.recordId !== RECORD_ID ||
    care?.kind !== "care_record" ||
    care.recordId !== RECORD_ID
  ) {
    throw new Error("Pastoral read route parsing returned an unexpected result.");
  }
});

Deno.test("rejects unsupported routes and non-UUID record IDs", () => {
  if (
    parsePastoralReadPath(
      "/pastoral-operations/prayer/requests/not-a-uuid/read",
    ) !== null ||
    parsePastoralReadPath(
      `/pastoral-operations/prayer/requests/${RECORD_ID}/update`,
    ) !== null ||
    parsePastoralReadPath(
      `/pastoral-operations/care/groups/${RECORD_ID}/read`,
    ) !== null
  ) {
    throw new Error("An unsupported pastoral route was accepted.");
  }
});

Deno.test("accepts an assigned read without an oversight reason", () => {
  const parsed = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "assigned",
  });

  if (!parsed.ok || parsed.value.reason !== null) {
    throw new Error("A valid assigned read request was rejected.");
  }
});

Deno.test("accepts and trims an oversight reason", () => {
  const parsed = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "oversight",
    reason: "  Documented pastoral continuity review.  ",
  });

  if (
    !parsed.ok ||
    parsed.value.reason !== "Documented pastoral continuity review."
  ) {
    throw new Error("A valid oversight reason was not normalized.");
  }
});

Deno.test("rejects an oversight request without a reason", () => {
  const parsed = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "oversight",
  });

  if (parsed.ok) throw new Error("An oversight read without a reason passed.");
});

Deno.test("rejects short, blank and oversized oversight reasons", () => {
  for (const reason of ["too short", " ".repeat(30), "x".repeat(501)]) {
    const parsed = parsePastoralReadInput({
      branch_id: BRANCH_ID,
      access_mode: "oversight",
      reason,
    });
    if (parsed.ok) {
      throw new Error("An invalid oversight reason was accepted.");
    }
  }
});

Deno.test("rejects reasons supplied for assigned reads", () => {
  const parsed = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "assigned",
    reason: "This should not be accepted for an assigned read.",
  });

  if (parsed.ok) {
    throw new Error("An assigned read accepted an oversight reason.");
  }
});

Deno.test("rejects unknown fields and non-object input", () => {
  const extra = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "assigned",
    actor_user_id: "caller-controlled",
  });

  if (extra.ok || parsePastoralReadInput([]).ok) {
    throw new Error("Unsupported body shape or field was accepted.");
  }
});

Deno.test("rejects unsupported modes and malformed branch IDs", () => {
  const mode = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "admin",
  });
  const branch = parsePastoralReadInput({
    branch_id: "not-a-uuid",
    access_mode: "assigned",
  });

  if (mode.ok || branch.ok) {
    throw new Error("Unsupported mode or malformed branch ID was accepted.");
  }
});
