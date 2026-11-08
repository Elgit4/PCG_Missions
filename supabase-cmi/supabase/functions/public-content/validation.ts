export const PUBLIC_RESOURCES = {
  sermons: {
    table: "sermon",
    columns: "id,title,body,public_slug,published_at,created_at",
    slugColumn: "public_slug",
    filters: [{ column: "status", value: "published" }],
    order: { column: "published_at", ascending: false },
  },
  "daily-words": {
    table: "daily_word",
    columns: "id,title,body,publication_date,public_slug,published_at,created_at",
    slugColumn: "public_slug",
    filters: [{ column: "status", value: "published" }],
    order: { column: "publication_date", ascending: false },
  },
  tracts: {
    table: "digital_tract",
    columns: "id,title,body,public_slug,published_at,created_at",
    slugColumn: "public_slug",
    filters: [{ column: "status", value: "published" }],
    order: { column: "published_at", ascending: false },
  },
  "welcome-messages": {
    table: "welcome_message",
    columns: "id,title,body,display_order,published_at,created_at",
    filters: [{ column: "status", value: "published" }],
    order: { column: "display_order", ascending: true },
    globalOnly: true,
  },
  announcements: {
    table: "announcement",
    columns: "id,title,body,publish_at,published_at,created_at",
    filters: [
      { column: "status", value: "published" },
      { column: "is_public", value: true },
    ],
    order: { column: "published_at", ascending: false },
  },
  events: {
    table: "event",
    columns: "id,title,description,starts_at,ends_at,timezone,location,registration_state,transport_enabled",
    filters: [
      { column: "status", value: "published" },
      { column: "visibility", value: "public" },
    ],
    order: { column: "starts_at", ascending: true },
  },
} as const;

export type PublicResource = keyof typeof PUBLIC_RESOURCES;

export type PublicContentRequest =
  | { resource: "church-profile" }
  | {
    resource: Exclude<PublicResource, "welcome-messages">;
    slug?: string;
    limit: number;
    offset: number;
  }
  | {
    resource: "welcome-messages";
    limit: number;
    offset: number;
  };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parsePublicContentRequest(
  url: URL,
): { ok: true; value: PublicContentRequest } | { ok: false; error: string } {
  const seenKeys = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (seenKeys.has(key)) {
      return { ok: false, error: "Duplicate query parameter." };
    }
    seenKeys.add(key);
  }

  const resource = url.searchParams.get("resource");
  if (resource === "church-profile") {
    if ([...url.searchParams.keys()].some((key) => key !== "resource")) {
      return { ok: false, error: "Unsupported query parameter." };
    }
    return { ok: true, value: { resource } };
  }

  if (!resource || !Object.hasOwn(PUBLIC_RESOURCES, resource)) {
    return { ok: false, error: "Unsupported public resource." };
  }

  const allowedKeys = new Set(["resource", "slug", "limit", "offset"]);
  if ([...url.searchParams.keys()].some((key) => !allowedKeys.has(key))) {
    return { ok: false, error: "Unsupported query parameter." };
  }

  const slug = url.searchParams.get("slug") ?? undefined;
  const resourceConfig = PUBLIC_RESOURCES[resource as PublicResource];
  if (slug !== undefined) {
    if (!("slugColumn" in resourceConfig)) {
      return { ok: false, error: "Slug lookup is not supported for this resource." };
    }
    if (slug.length > 120 || !SLUG_PATTERN.test(slug)) {
      return { ok: false, error: "Invalid slug." };
    }
  }

  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false, error: "Limit must be an integer from 1 to 50." };
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) {
    return { ok: false, error: "Offset must be an integer from 0 to 10000." };
  }

  if (resource === "welcome-messages") {
    return { ok: true, value: { resource, limit, offset } };
  }
  return {
    ok: true,
    value: slug === undefined
      ? { resource: resource as Exclude<PublicResource, "welcome-messages">, limit, offset }
      : { resource: resource as Exclude<PublicResource, "welcome-messages">, slug, limit, offset },
  };
}
