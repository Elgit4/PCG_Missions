import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { HeartHandshake, MessageCircle, Send, ShieldCheck, Sparkles } from "lucide-react";
import { CmiApiClient, CmiApiError, type PrayerRoomMessage } from "../lib/cmi-api";

interface PrayerRoomWorkspaceProps {
  branchId: string;
  branchName: string;
  api: CmiApiClient;
  currentProfileId: string;
  onSessionExpired: () => void;
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}
function dayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

export function PrayerRoomWorkspace({ branchId, branchName, api, currentProfileId, onSessionExpired }: PrayerRoomWorkspaceProps) {
  const [messages, setMessages] = useState<PrayerRoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<string | null>(null);

  const loadMessages = useCallback(async (initial = false) => {
    try {
      const result = await api.listPrayerRoomMessages(branchId, 80);
      setMessages((current) => {
        const next = result.data;
        const newest = next[next.length - 1]?.id ?? null;
        if (!initial && newest && lastMessageRef.current && newest !== lastMessageRef.current) {
          const incoming = next.find((message) => message.id === newest);
          if (incoming && incoming.author_profile_id !== currentProfileId && document.visibilityState === "visible") {
            // The room remains in-app only; no email or SMS is dispatched.
          }
        }
        lastMessageRef.current = newest;
        return next;
      });
      setError("");
    } catch (reason) {
      if (reason instanceof CmiApiError && reason.status === 401) onSessionExpired();
      else if (initial) setError(reason instanceof Error ? reason.message : "The prayer room could not be loaded.");
    } finally {
      if (initial) setLoading(false);
    }
  }, [api, branchId, currentProfileId, onSessionExpired]);

  useEffect(() => {
    let active = true;
    void loadMessages(true);
    const timer = window.setInterval(() => { if (active) void loadMessages(false); }, 12000);
    return () => { active = false; window.clearInterval(timer); };
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || body.length > 4000) return;
    setSending(true);
    setError("");
    try {
      const result = await api.postPrayerRoomMessage(branchId, body);
      setMessages((current) => [...current.filter((item) => item.id !== result.data.message.id), result.data.message]);
      setDraft("");
      lastMessageRef.current = result.data.message.id;
    } catch (reason) {
      if (reason instanceof CmiApiError && reason.status === 401) onSessionExpired();
      else setError(reason instanceof Error ? reason.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  let previousDay = "";
  return (
    <div className="cmi-prayer-room">
      <section className="cmi-prayer-room-intro">
        <div className="cmi-prayer-room-emblem"><HeartHandshake size={23} /></div>
        <div className="cmi-prayer-room-copy">
          <p className="cmi-eyebrow">MINISTRY COMMUNITY · {branchName.toUpperCase()}</p>
          <h2>Prayer room</h2>
          <p>A dedicated space for the team to share prayer points, encouragement and updates.</p>
        </div>
        <span className="cmi-prayer-room-live"><i /> Branch room</span>
      </section>
      <section className="cmi-prayer-room-panel" aria-label="Prayer room conversation">
        <header className="cmi-prayer-room-panel-head">
          <div><MessageCircle size={17} /><strong>Prayer conversation</strong></div>
          <span>Messages are visible to authorised staff in this branch</span>
        </header>
        <div className="cmi-prayer-room-feed" aria-live="polite" aria-relevant="additions text">
          {loading ? (
            <div className="cmi-prayer-room-empty"><span className="cmi-prayer-room-loader" /><strong>Opening the prayer room</strong><p>Loading the latest messages…</p></div>
          ) : messages.length === 0 ? (
            <div className="cmi-prayer-room-empty">
              <div><Sparkles size={22} /></div><strong>Start with a prayer point</strong>
              <p>Share an encouragement, a prayer request or a short update with your branch team.</p>
            </div>
          ) : messages.map((message) => {
            const day = dayLabel(message.created_at);
            const showDay = day !== previousDay;
            previousDay = day;
            const mine = message.author_profile_id === currentProfileId;
            return (
              <div className="cmi-prayer-message-group" key={message.id}>
                {showDay && <div className="cmi-prayer-day"><span>{day}</span></div>}
                <article className={mine ? "cmi-prayer-message mine" : "cmi-prayer-message"}>
                  {!mine && <span className="cmi-prayer-avatar">{initials(message.author_name)}</span>}
                  <div className="cmi-prayer-message-body">
                    {!mine && <strong>{message.author_name}</strong>}
                    <p>{message.body}</p>
                    <time dateTime={message.created_at}>{timeLabel(message.created_at)}</time>
                  </div>
                </article>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {error && <p className="cmi-prayer-room-error" role="alert">{error}</p>}
        <form className="cmi-prayer-compose" onSubmit={(event) => void sendMessage(event)}>
          <label className="cmi-prayer-compose-field">
            <span className="cmi-sr-only">Write a message to the prayer room</span>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2}
              placeholder="Share a prayer point or encouragement…" disabled={sending} />
          </label>
          <div className="cmi-prayer-compose-foot">
            <span>{draft.length}/4000 · Keep messages respectful and supportive</span>
            <button type="submit" disabled={!draft.trim() || sending}>
              <Send size={15} />{sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </section>
      <p className="cmi-prayer-room-privacy"><ShieldCheck size={15} /> This conversation is branch-scoped and access-controlled. Private pastoral-care notes and assigned prayer-request narratives are kept separate.</p>
    </div>
  );
}
