import { isUuid, parseContactCreate, parseContactPatch } from "./validation.ts";

const branchId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";

Deno.test("contact capture accepts a valid minimal payload", () => {
  const result = parseContactCreate({
    branch_id: branchId,
    client_request_id: requestId,
    first_name: "Ama",
    phone_e164: "+233241234567",
    email_normalized: "AMA@example.com",
    source_metadata: { device_type: "mobile" },
  });
  if (!result.ok) throw new Error(result.error);
  if (result.value.email_normalized !== "ama@example.com") {
    throw new Error("Email must be normalized.");
  }
  if (result.value.last_name !== null) {
    throw new Error("Optional fields should normalize to null.");
  }
});

Deno.test("contact capture rejects unknown or privileged fields", () => {
  const result = parseContactCreate({
    branch_id: branchId,
    client_request_id: requestId,
    first_name: "Ama",
    created_by: "10000000-0000-4000-8000-000000000003",
  });
  if (result.ok) {
    throw new Error("Caller-controlled actor fields must be rejected.");
  }
});

Deno.test("contact capture requires UUID idempotency and branch identifiers", () => {
  if (isUuid("not-a-uuid")) throw new Error("Invalid UUID was accepted.");
  const result = parseContactCreate({
    branch_id: "bad",
    client_request_id: requestId,
    first_name: "Ama",
  });
  if (result.ok) throw new Error("Invalid branch id was accepted.");
});

Deno.test("contact phone uses strict E.164 format", () => {
  for (
    const phone of [
      "0241234567",
      "233241234567",
      "+023312345678",
      "+233-24-123-4567",
    ]
  ) {
    const result = parseContactCreate({
      branch_id: branchId,
      client_request_id: requestId,
      first_name: "Ama",
      phone_e164: phone,
    });
    if (result.ok) throw new Error(`Invalid phone was accepted: ${phone}`);
  }
});

Deno.test("contact update allows only ordinary editable fields", () => {
  const result = parseContactPatch({
    first_name: "Ama",
    preferred_language: "en",
  });
  if (!result.ok) throw new Error(result.error);
});

Deno.test("contact update rejects status, branch and merge controls", () => {
  for (
    const input of [
      { contact_status: "merged" },
      { branch_id: branchId },
      { merged_into_contact_id: "10000000-0000-4000-8000-000000000003" },
      {},
    ]
  ) {
    const result = parseContactPatch(input);
    if (result.ok) throw new Error("Privileged or empty update was accepted.");
  }
});

Deno.test("capture metadata rejects unknown keys", () => {
  const result = parseContactCreate({
    branch_id: branchId,
    client_request_id: requestId,
    first_name: "Ama",
    source_metadata: { email: "private@example.com" },
  });
  if (result.ok) throw new Error("PII metadata was accepted.");
});
