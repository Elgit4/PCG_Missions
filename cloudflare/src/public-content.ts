export interface PublicContentDatabase {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    };
  };
}

export class PublicContentRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "PublicContentRequestError";
  }
}

const PUBLICATION_WINDOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

function pagination(url: URL): { limit: number; offset: number } {
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new PublicContentRequestError(400, "Invalid public-content pagination.");
  }
  return { limit, offset };
}

function slugFilter(slug: string | null): { sql: string; values: string[] } {
  return slug ? { sql: " AND public_slug = ?", values: [slug] } : { sql: "", values: [] };
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Public projection only: never returns private staff, pastoral, prayer, or event-flyer fields. */
export async function readPublicContent(db: PublicContentDatabase, url: URL): Promise<unknown> {
  const resource = url.searchParams.get("resource");
  if (!resource) throw new PublicContentRequestError(400, "A public-content resource is required.");

  if (resource === "church-profile") {
    const row = await db.prepare(`
      SELECT public_name, welcome_content, public_phone, public_email,
             address_text, website_url, social_links, updated_at
      FROM church_public_profile
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind().first<Record<string, unknown>>();
    return row ? { ...row, social_links: parseJsonObject(row.social_links) } : null;
  }

  const { limit, offset } = pagination(url);
  const slug = slugFilter(url.searchParams.get("slug"));
  const pageValues = [...slug.values, limit, offset];

  switch (resource) {
    case "sermons":
      return (await db.prepare(`
        SELECT id, title, body, public_slug, published_at, created_at
        FROM sermon
        WHERE status = 'published'
          AND (published_at IS NULL OR published_at <= ${PUBLICATION_WINDOW})
          ${slug.sql}
        ORDER BY COALESCE(published_at, created_at) DESC, id
        LIMIT ? OFFSET ?
      `).bind(...pageValues).all()).results ?? [];

    case "daily-words":
      return (await db.prepare(`
        SELECT id, title, body, publication_date, public_slug, published_at, created_at
        FROM daily_word
        WHERE status = 'published'
          AND publication_date <= date('now')
          AND (published_at IS NULL OR published_at <= ${PUBLICATION_WINDOW})
          ${slug.sql}
        ORDER BY publication_date DESC, id
        LIMIT ? OFFSET ?
      `).bind(...pageValues).all()).results ?? [];

    case "tracts":
      return (await db.prepare(`
        SELECT id, title, body, public_slug, published_at, created_at
        FROM digital_tract
        WHERE status = 'published'
          AND (published_at IS NULL OR published_at <= ${PUBLICATION_WINDOW})
          ${slug.sql}
        ORDER BY COALESCE(published_at, created_at) DESC, id
        LIMIT ? OFFSET ?
      `).bind(...pageValues).all()).results ?? [];

    case "welcome-messages":
      return (await db.prepare(`
        SELECT id, title, body, display_order, published_at, created_at
        FROM welcome_message
        WHERE status = 'published'
          AND (published_at IS NULL OR published_at <= ${PUBLICATION_WINDOW})
        ORDER BY display_order ASC, created_at DESC, id
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all()).results ?? [];

    case "announcements":
      return (await db.prepare(`
        SELECT id, title, body, published_at, created_at
        FROM announcement
        WHERE is_public = 1
          AND status = 'published'
          AND (publish_at IS NULL OR publish_at <= ${PUBLICATION_WINDOW})
          AND (published_at IS NULL OR published_at <= ${PUBLICATION_WINDOW})
        ORDER BY COALESCE(published_at, publish_at, created_at) DESC, id
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all()).results ?? [];

    case "events":
      return (await db.prepare(`
        SELECT id, title, description, starts_at, ends_at, timezone, location
        FROM event
        WHERE visibility = 'public'
          AND status = 'published'
          AND ends_at >= ${PUBLICATION_WINDOW}
        ORDER BY starts_at ASC, id
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all()).results ?? [];

    default:
      throw new PublicContentRequestError(404, "The requested public-content resource was not found.");
  }
}
