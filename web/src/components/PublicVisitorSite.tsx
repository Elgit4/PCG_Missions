import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Clock3,
  Globe2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react";
import {
  createPublicContentClient,
  getUpcomingEvents,
  loadPublicSiteContent,
  publicPhoneHref,
  safeExternalUrl,
  type PublicContentItem,
  type PublicEvent,
  type PublicSiteContent,
} from "../lib/public-content";
import "./PublicVisitorSite.css";

const EMPTY_CONTENT: PublicSiteContent = {
  profile: null,
  sermons: [],
  dailyWords: [],
  tracts: [],
  welcomeMessages: [],
  announcements: [],
  events: [],
  failedResources: [],
};

function excerpt(value: string | null | undefined, length = 190): string {
  const text = value?.trim() ?? "";
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}…`;
}

function formatDate(value: string, timeZone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  try {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timeZone || "Africa/Accra",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}

function formatDay(value: string, timeZone?: string): { day: string; month: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "—", month: "TBA" };
  try {
    const parts = new Intl.DateTimeFormat("en-GH", {
      day: "2-digit",
      month: "short",
      timeZone: timeZone || "Africa/Accra",
    }).formatToParts(date);
    return {
      day: parts.find((part) => part.type === "day")?.value ?? "—",
      month: parts.find((part) => part.type === "month")?.value ?? "TBA",
    };
  } catch {
    return { day: "—", month: "TBA" };
  }
}

function getSocialLinks(value: unknown): Array<{ label: string; url: string }> {
  if (!value || typeof value !== "object") return [];
  const entries = Array.isArray(value)
    ? value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      return [[String(record.label ?? record.name ?? "Social"), record.url] as const];
    })
    : Object.entries(value as Record<string, unknown>);
  return entries.flatMap(([label, raw]) => {
    const candidate = typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && "url" in raw
      ? String((raw as { url: unknown }).url ?? "")
      : "";
    const url = safeExternalUrl(candidate);
    return url ? [{ label: label.replace(/[-_]/g, " "), url }] : [];
  });
}

function ContentCard({
  item,
  eyebrow,
  featured = false,
}: {
  item: PublicContentItem;
  eyebrow: string;
  featured?: boolean;
}) {
  return (
    <article className={featured ? "visitor-content-card is-featured" : "visitor-content-card"}>
      <span className="visitor-card-eyebrow">{eyebrow}</span>
      <h3>{item.title}</h3>
      {item.body && (
        <>
          <p>{excerpt(item.body, featured ? 260 : 175)}</p>
          <details className="visitor-read-more">
            <summary>Read full {eyebrow.toLowerCase()}</summary>
            <p>{item.body}</p>
          </details>
        </>
      )}
      {item.published_at && (
        <time dateTime={item.published_at}>{formatDate(item.published_at, "Africa/Accra")}</time>
      )}
    </article>
  );
}

function EventCard({ event }: { event: PublicEvent }) {
  const date = formatDay(event.starts_at, event.timezone);
  return (
    <article className="visitor-event-card">
      <div className="visitor-event-date" aria-label={formatDate(event.starts_at, event.timezone)}>
        <strong>{date.day}</strong>
        <span>{date.month}</span>
      </div>
      <div className="visitor-event-copy">
        <h3>{event.title}</h3>
        <p>{excerpt(event.description, 150) || "Join us for this upcoming church gathering."}</p>
        <div className="visitor-event-meta">
          <span><Clock3 size={14} />{formatDate(event.starts_at, event.timezone)}</span>
          {event.location && <span><MapPin size={14} />{event.location}</span>}
        </div>
      </div>
    </article>
  );
}

export function PublicVisitorSite() {
  const [content, setContent] = useState<PublicSiteContent>(EMPTY_CONTENT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const client = createPublicContentClient({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
      publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    });

    setLoading(true);
    setLoadError("");
    void loadPublicSiteContent(client, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setContent(result);
        if (result.failedResources.length === 7) {
          setLoadError("Public information is temporarily unavailable. Please try again.");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError("Public information is temporarily unavailable. Please try again.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadCount]);

  useEffect(() => {
    const name = content.profile?.public_name?.trim() || "PCG Missions";
    document.title = `${name} | Welcome`;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute(
      "content",
      `Welcome to ${name}. Explore church events, messages and ways to connect.`,
    );
  }, [content.profile?.public_name]);

  const churchName = content.profile?.public_name?.trim() || "PCG Missions";
  const welcomeText = content.profile?.welcome_content?.trim() ||
    content.welcomeMessages[0]?.body?.trim() ||
    "Discover upcoming gatherings, explore messages and find practical ways to connect with our church community.";
  const upcomingEvents = useMemo(
    () => getUpcomingEvents(content.events).slice(0, 4),
    [content.events],
  );
  const socialLinks = useMemo(
    () => getSocialLinks(content.profile?.social_links),
    [content.profile?.social_links],
  );
  const phoneHref = publicPhoneHref(content.profile?.public_phone);
  const websiteUrl = safeExternalUrl(content.profile?.website_url);

  return (
    <div className="visitor-site">
      <a className="visitor-skip-link" href="#visitor-main">Skip to content</a>
      <header className="visitor-header">
        <div className="visitor-container visitor-header-inner">
          <a className="visitor-brand" href="/visit" aria-label={`${churchName} home`}>
            <img src="/logo.svg" alt="" />
            <span><strong>{churchName}</strong><small>WELCOME · CONNECT · GROW</small></span>
          </a>
          <nav className="visitor-nav" aria-label="Main navigation">
            <a href="#events">Events</a>
            <a href="#messages">Messages</a>
            <a href="#daily-word">Daily Word</a>
            <a href="#resources">Resources</a>
          </nav>
          <a className="visitor-staff-link" href="/">
            Staff sign in <ArrowUpRight size={16} />
          </a>
        </div>
      </header>

      <main id="visitor-main">
        <section className="visitor-hero">
          <div className="visitor-container visitor-hero-inner">
            <div className="visitor-hero-copy">
              <p className="visitor-eyebrow"><span /> YOU ARE WELCOME HERE</p>
              <h1>Welcome to <em>{churchName}.</em></h1>
              <p className="visitor-hero-intro">{welcomeText}</p>
              <div className="visitor-hero-actions">
                <a className="visitor-primary-action" href="#events">Explore what’s on <ArrowUpRight size={17} /></a>
                <a className="visitor-secondary-action" href="#contact">Connect with us</a>
              </div>
              <p className="visitor-hero-note">A place to worship, connect and serve together.</p>
            </div>
            <div className="visitor-hero-mark" aria-hidden="true">
              <div className="visitor-hero-mark-ring" />
              <img src="/logo.svg" alt="" />
              <span>PCG MISSIONS</span>
            </div>
          </div>
        </section>

        <div className="visitor-container visitor-main-content">
          {loadError && (
            <div className="visitor-alert" role="alert">
              <span>{loadError}</span>
              <button type="button" onClick={() => setReloadCount((value) => value + 1)}>
                Try again <RefreshCw size={14} />
              </button>
            </div>
          )}
          {!loadError && content.failedResources.length > 0 && (
            <p className="visitor-partial-notice" role="status">
              Some public information could not be loaded. Other sections remain available.
            </p>
          )}

          {content.announcements.length > 0 && (
            <section className="visitor-section visitor-announcements" aria-labelledby="visitor-announcements-title">
              <div className="visitor-section-heading">
                <div><span className="visitor-section-kicker">STAY IN THE KNOW</span><h2 id="visitor-announcements-title">Church updates</h2></div>
              </div>
              <div className="visitor-content-grid">
                {content.announcements.slice(0, 3).map((item) => (
                  <ContentCard key={item.id} item={item} eyebrow="ANNOUNCEMENT" />
                ))}
              </div>
            </section>
          )}

          <section className="visitor-section" id="events" aria-labelledby="visitor-events-title">
            <div className="visitor-section-heading">
              <div><span className="visitor-section-kicker">COME AND BE PART OF IT</span><h2 id="visitor-events-title">Upcoming gatherings</h2><p>Find a time to meet, worship and grow together.</p></div>
              <CalendarDays className="visitor-section-icon" size={27} />
            </div>
            {loading ? (
              <div className="visitor-loading-list" aria-label="Loading upcoming events"><i /><i /><i /></div>
            ) : upcomingEvents.length > 0 ? (
              <div className="visitor-events-list">{upcomingEvents.map((event) => <EventCard key={event.id} event={event} />)}</div>
            ) : (
              <div className="visitor-empty-state"><CalendarDays size={22} /><p>No public events are listed right now. Please check back soon.</p></div>
            )}
          </section>

          <section className="visitor-section" id="messages" aria-labelledby="visitor-messages-title">
              <div className="visitor-section-heading">
                <div><span className="visitor-section-kicker">TEACHING & ENCOURAGEMENT</span><h2 id="visitor-messages-title">Recent messages</h2><p>Thoughts and teaching to encourage your walk of faith.</p></div>
                <BookOpen className="visitor-section-icon" size={27} />
              </div>
              {loading ? <div className="visitor-loading-grid"><i /><i /></div> : (
                content.sermons.length > 0 ? (
                  <div className="visitor-content-grid">
                    {content.sermons.slice(0, 4).map((item) => <ContentCard key={item.id} item={item} eyebrow="SERMON" />)}
                  </div>
                ) : (
                  <div className="visitor-empty-state"><BookOpen size={22} /><p>Messages will appear here when they are published.</p></div>
                )
              )}
          </section>

          <section className="visitor-section visitor-daily-word" id="daily-word" aria-labelledby="visitor-daily-title">
              <div className="visitor-daily-word-copy">
                <span className="visitor-section-kicker">A MOMENT IN THE WORD</span>
                <h2 id="visitor-daily-title">Daily Word</h2>
                {loading ? <div className="visitor-loading-lines"><i /><i /><i /></div> : content.dailyWords[0] ? (
                  <>
                    <h3>{content.dailyWords[0].title}</h3>
                    <p>{excerpt(content.dailyWords[0].body, 300)}</p>
                    {content.dailyWords[0].body && (
                      <details className="visitor-read-more">
                        <summary>Read full Daily Word</summary>
                        <p>{content.dailyWords[0].body}</p>
                      </details>
                    )}
                    {content.dailyWords[0].publication_date && <time dateTime={content.dailyWords[0].publication_date}>{content.dailyWords[0].publication_date}</time>}
                  </>
                ) : <p>Daily encouragement will appear here when it is published.</p>}
              </div>
              <div className="visitor-daily-word-mark" aria-hidden="true"><BookOpen size={64} strokeWidth={1.2} /></div>
          </section>

          <section className="visitor-section" id="resources" aria-labelledby="visitor-resources-title">
              <div className="visitor-section-heading">
                <div><span className="visitor-section-kicker">EXPLORE & SHARE</span><h2 id="visitor-resources-title">Resources</h2><p>Helpful reading for your personal journey and conversations.</p></div>
                <Globe2 className="visitor-section-icon" size={27} />
              </div>
              {loading ? <div className="visitor-loading-grid"><i /><i /></div> : (
                content.tracts.length > 0 ? (
                  <div className="visitor-content-grid">
                    {content.tracts.slice(0, 4).map((item) => <ContentCard key={item.id} item={item} eyebrow="DIGITAL RESOURCE" />)}
                  </div>
                ) : (
                  <div className="visitor-empty-state"><Globe2 size={22} /><p>Digital resources will appear here when they are published.</p></div>
                )
              )}
          </section>

          <section className="visitor-contact-section" id="contact" aria-labelledby="visitor-contact-title">
            <div className="visitor-contact-copy">
              <span className="visitor-section-kicker">LET’S CONNECT</span>
              <h2 id="visitor-contact-title">We’d be glad to hear from you.</h2>
              <p>Reach out using the public contact details below.</p>
            </div>
            <div className="visitor-contact-details">
              {content.profile?.public_phone && phoneHref && <a href={phoneHref}><Phone size={17} />{content.profile.public_phone}</a>}
              {content.profile?.public_email && <a href={`mailto:${encodeURIComponent(content.profile.public_email)}`}><Mail size={17} />{content.profile.public_email}</a>}
              {content.profile?.address_text && <p><MapPin size={17} />{content.profile.address_text}</p>}
              {websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer"><Globe2 size={17} />Visit our website <ArrowUpRight size={14} /></a>}
              {socialLinks.map((link) => <a key={link.label} href={link.url} target="_blank" rel="noreferrer"><Globe2 size={17} />{link.label} <ArrowUpRight size={14} /></a>)}
              {!content.profile?.public_phone && !content.profile?.public_email && !content.profile?.address_text && !websiteUrl && socialLinks.length === 0 && (
                <p className="visitor-contact-empty">Public contact details will be added here once configured.</p>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="visitor-footer">
        <div className="visitor-container visitor-footer-inner">
          <a className="visitor-footer-brand" href="/visit"><img src="/logo.svg" alt="" /><strong>{churchName}</strong></a>
          <span>© {new Date().getFullYear()} {churchName}</span>
          <a href="/">Staff sign in <ArrowUpRight size={14} /></a>
        </div>
      </footer>
    </div>
  );
}
