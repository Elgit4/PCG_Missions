export interface PublicChurchProfile {
  public_name: string | null;
  welcome_content: string | null;
  public_phone: string | null;
  public_email: string | null;
  address_text: string | null;
  website_url: string | null;
  social_links: unknown;
  updated_at: string | null;
}

export interface PublicContentItem {
  id: string;
  title: string;
  body: string;
  public_slug?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  publication_date?: string | null;
  display_order?: number;
  publish_at?: string | null;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
  registration_state: "open" | "closed";
  transport_enabled: boolean;
}

export interface PublicSiteContent {
  profile: PublicChurchProfile | null;
  sermons: PublicContentItem[];
  dailyWords: PublicContentItem[];
  tracts: PublicContentItem[];
  welcomeMessages: PublicContentItem[];
  announcements: PublicContentItem[];
  events: PublicEvent[];
  failedResources: string[];
}

export interface PublicContentClient {
  getChurchProfile(signal?: AbortSignal): Promise<PublicChurchProfile | null>;
  listSermons(signal?: AbortSignal): Promise<PublicContentItem[]>;
  listDailyWords(signal?: AbortSignal): Promise<PublicContentItem[]>;
  listTracts(signal?: AbortSignal): Promise<PublicContentItem[]>;
  listWelcomeMessages(signal?: AbortSignal): Promise<PublicContentItem[]>;
  listAnnouncements(signal?: AbortSignal): Promise<PublicContentItem[]>;
  listEvents(signal?: AbortSignal): Promise<PublicEvent[]>;
}

export class PublicContentError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PublicContentError";
    this.status = status;
  }
}

export function createPublicContentClient(
  config: { supabaseUrl: string; publishableKey: string },
  fetcher: typeof fetch = fetch,
): PublicContentClient {
  const baseUrl = config.supabaseUrl.replace(/\/+$/, "");

  async function request<T>(
    resource: string,
    options: { slug?: string; signal?: AbortSignal } = {},
  ): Promise<T> {
    if (!baseUrl || !config.publishableKey) {
      throw new PublicContentError(0, "Public content is not configured.");
    }

    const url = new URL(`${baseUrl}/functions/v1/public-content`);
    url.searchParams.set("resource", resource);
    if (options.slug) url.searchParams.set("slug", options.slug);
    if (resource !== "church-profile") {
      url.searchParams.set("limit", "20");
      url.searchParams.set("offset", "0");
    }

    let response: Response;
    try {
      response = await fetcher(url.toString(), {
        method: "GET",
        headers: {
          apikey: config.publishableKey,
          Accept: "application/json",
        },
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new PublicContentError(0, "Unable to connect to the public content service.");
    }

    const payload = await response.json().catch(() => null) as
      | { data?: T; error?: string }
      | null;

    if (!response.ok) {
      throw new PublicContentError(
        response.status,
        typeof payload?.error === "string"
          ? payload.error
          : "Unable to retrieve public content.",
      );
    }
    if (!payload || !("data" in payload)) {
      throw new PublicContentError(502, "The public content service returned an invalid response.");
    }
    return payload.data as T;
  }

  return {
    getChurchProfile: (signal) =>
      request<PublicChurchProfile | null>("church-profile", { signal }),
    listSermons: (signal) => request<PublicContentItem[]>("sermons", { signal }),
    listDailyWords: (signal) => request<PublicContentItem[]>("daily-words", { signal }),
    listTracts: (signal) => request<PublicContentItem[]>("tracts", { signal }),
    listWelcomeMessages: (signal) =>
      request<PublicContentItem[]>("welcome-messages", { signal }),
    listAnnouncements: (signal) =>
      request<PublicContentItem[]>("announcements", { signal }),
    listEvents: (signal) => request<PublicEvent[]>("events", { signal }),
  };
}

export async function loadPublicSiteContent(
  client: PublicContentClient,
  signal?: AbortSignal,
): Promise<PublicSiteContent> {
  const resources = await Promise.allSettled([
    client.getChurchProfile(signal),
    client.listSermons(signal),
    client.listDailyWords(signal),
    client.listTracts(signal),
    client.listWelcomeMessages(signal),
    client.listAnnouncements(signal),
    client.listEvents(signal),
  ] as const);

  const value = <T,>(index: number, fallback: T): T =>
    resources[index].status === "fulfilled"
      ? resources[index].value as T
      : fallback;

  const names = [
    "church profile",
    "sermons",
    "daily words",
    "tracts",
    "welcome messages",
    "announcements",
    "events",
  ];

  return {
    profile: value(0, null),
    sermons: value(1, []),
    dailyWords: value(2, []),
    tracts: value(3, []),
    welcomeMessages: value(4, []),
    announcements: value(5, []),
    events: value(6, []),
    failedResources: resources.flatMap((result, index) =>
      result.status === "rejected" ? [names[index]] : []
    ),
  };
}

export function getUpcomingEvents(
  events: PublicEvent[],
  now = Date.now(),
): PublicEvent[] {
  return events
    .filter((event) => {
      const end = Date.parse(event.ends_at);
      return Number.isFinite(end) && end >= now;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function publicPhoneHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^+\d]/g, "");
  return normalized.length >= 7 ? `tel:${normalized}` : null;
}
