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

Deno.test("accepts an assigned read without an oversight reason code", () => {
  const parsed = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "assigned",
  });

  if (!parsed.ok || parsed.value.reason_code !== null) {
    throw new Error("A valid assigned read request was rejected.");
  }
});

Deno.test("accepts a supported oversight reason code", () => {
  const parsed = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "oversight",
    reason_code: "continuity_of_care",
  });

  if (
    !parsed.ok ||
    parsed.value.reason_code !== "continuity_of_care"
  ) {
    throw new Error("A valid oversight reason code was not accepted.");
  }
});

Deno.test("rejects oversight reads without an approved reason code", () => {
  for (const reason_code of [undefined, "free-text narrative", "other", ""]) {
    const parsed = parsePastoralReadInput({
      branch_id: BRANCH_ID,
      access_mode: "oversight",
      ...(reason_code === undefined ? {} : { reason_code }),
    });

    if (parsed.ok) {
      throw new Error("An unsupported oversight reason code was accepted.");
    }
  }
});

Deno.test("rejects reason codes on assigned reads", () => {
  const parsed = parsePastoralReadInput({
    branch_id: BRANCH_ID,
    access_mode: "assigned",
    reason_code: "pastoral_review",
  });

  if (parsed.ok) {
    throw new Error("An assigned read accepted an oversight reason code.");
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
