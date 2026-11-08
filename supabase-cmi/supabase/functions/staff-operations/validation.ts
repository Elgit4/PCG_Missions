const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactCreateInput {
  branch_id: string;
  client_request_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  phone_e164: string | null;
  phone_display: string | null;
  email_normalized: string | null;
  age_range: string | null;
  preferred_language: string | null;
  service_area_id: string | null;
  source_metadata: Record<string, string>;
}

export type ContactPatchInput = Partial<
  Pick<
    ContactCreateInput,
    | "first_name"
    | "last_name"
    | "preferred_name"
    | "phone_e164"
    | "phone_display"
    | "email_normalized"
    | "age_range"
    | "preferred_language"
  >
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string" || value.trim().length > maxLength) {
    return { ok: false, error: `Invalid ${field}.` };
  }
  return { ok: true, value: value.trim() };
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maxLength) {
    return { ok: false, error: `Invalid ${field}.` };
  }
  return { ok: true, value: value.trim() };
}

export function parseContactCreate(
  value: unknown,
): { ok: true; value: ContactCreateInput } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };

  const allowed = new Set([
    "branch_id",
    "client_request_id",
    "first_name",
    "last_name",
    "preferred_name",
    "phone_e164",
    "phone_display",
    "email_normalized",
    "age_range",
    "preferred_language",
    "service_area_id",
    "source_metadata",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported contact field." };
  }

  if (typeof value.branch_id !== "string" || !UUID_PATTERN.test(value.branch_id)) {
    return { ok: false, error: "Invalid branch_id." };
  }
  if (
    typeof value.client_request_id !== "string" ||
    !UUID_PATTERN.test(value.client_request_id)
  ) {
    return { ok: false, error: "A UUID client_request_id is required." };
  }

  const firstName = requiredText(value.first_name, "first_name", 120);
  if (!firstName.ok) return firstName;

  const lastName = optionalText(value.last_name, "last_name", 120);
  if (!lastName.ok) return lastName;
  const preferredName = optionalText(value.preferred_name, "preferred_name", 120);
  if (!preferredName.ok) return preferredName;
  const phone = optionalText(value.phone_e164, "phone_e164", 16);
  if (!phone.ok) return phone;
  if (phone.value !== null && !E164_PATTERN.test(phone.value)) {
    return { ok: false, error: "phone_e164 must use E.164 format." };
  }
  const phoneDisplay = optionalText(value.phone_display, "phone_display", 40);
  if (!phoneDisplay.ok) return phoneDisplay;
  const email = optionalText(value.email_normalized, "email_normalized", 254);
  if (!email.ok) return email;
  const normalizedEmail = email.value?.toLowerCase() ?? null;
  if (normalizedEmail !== null && !EMAIL_PATTERN.test(normalizedEmail)) {
    return { ok: false, error: "Invalid email_normalized." };
  }
  const ageRange = optionalText(value.age_range, "age_range", 40);
  if (!ageRange.ok) return ageRange;
  const language = optionalText(value.preferred_language, "preferred_language", 80);
  if (!language.ok) return language;

  let serviceAreaId: string | null = null;
  if (value.service_area_id !== undefined && value.service_area_id !== null && value.service_area_id !== "") {
    if (typeof value.service_area_id !== "string" || !UUID_PATTERN.test(value.service_area_id)) {
      return { ok: false, error: "Invalid service_area_id." };
    }
    serviceAreaId = value.service_area_id;
  }

  let metadata: Record<string, string> = {};
  if (value.source_metadata !== undefined) {
    if (!isRecord(value.source_metadata)) {
      return { ok: false, error: "source_metadata must be an object." };
    }
    const permitted = new Set(["app_version", "form_version", "device_type", "locale"]);
    for (const [key, item] of Object.entries(value.source_metadata)) {
      if (!permitted.has(key) || typeof item !== "string" || item.length > 80) {
        return { ok: false, error: "Unsupported source metadata." };
      }
      metadata[key] = item;
    }
  }

  return {
    ok: true,
    value: {
      branch_id: value.branch_id,
      client_request_id: value.client_request_id,
      first_name: firstName.value,
      last_name: lastName.value,
      preferred_name: preferredName.value,
      phone_e164: phone.value,
      phone_display: phoneDisplay.value,
      email_normalized: normalizedEmail,
      age_range: ageRange.value,
      preferred_language: language.value,
      service_area_id: serviceAreaId,
      source_metadata: metadata,
    },
  };
}

export function parseContactPatch(
  value: unknown,
): { ok: true; value: ContactPatchInput } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  const allowed = new Set([
    "first_name",
    "last_name",
    "preferred_name",
    "phone_e164",
    "phone_display",
    "email_normalized",
    "age_range",
    "preferred_language",
  ]);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unsupported or empty contact update." };
  }

  const result: ContactPatchInput = {};
  for (const key of keys) {
    const raw = value[key];
    if (key === "first_name") {
      const parsed = requiredText(raw, key, 120);
      if (!parsed.ok) return parsed;
      result.first_name = parsed.value;
    } else {
      const max = key === "phone_display" ? 40 : key === "email_normalized" ? 254 :
        key === "age_range" ? 40 : key === "preferred_language" ? 80 : 120;
      const parsed = optionalText(raw, key, max);
      if (!parsed.ok) return parsed;
      const parsedValue = key === "email_normalized"
        ? parsed.value?.toLowerCase() ?? null
        : parsed.value;
      if (key === "phone_e164" && parsedValue !== null && !E164_PATTERN.test(parsedValue)) {
        return { ok: false, error: "phone_e164 must use E.164 format." };
      }
      if (key === "email_normalized" && parsedValue !== null && !EMAIL_PATTERN.test(parsedValue)) {
        return { ok: false, error: "Invalid email_normalized." };
      }
      if (key === "last_name") result.last_name = parsedValue;
      if (key === "preferred_name") result.preferred_name = parsedValue;
      if (key === "phone_e164") result.phone_e164 = parsedValue;
      if (key === "phone_display") result.phone_display = parsedValue;
      if (key === "email_normalized") result.email_normalized = parsedValue;
      if (key === "age_range") result.age_range = parsedValue;
      if (key === "preferred_language") result.preferred_language = parsedValue;
    }
  }
  return { ok: true, value: result };
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
