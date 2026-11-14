import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, Megaphone, Settings2 } from "lucide-react";
import { CmiApiClient, CmiApiError, type AnnouncementInboxRecord } from "../lib/cmi-api";

interface NotificationCenterProps {
  api: CmiApiClient;
  branchId: string;
  onOpenAnnouncements: () => void;
  onSessionExpired: () => void;
}
function relativeTime(value: string | null): string {
  if (!value) return "Just now";
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(value));
}
export function NotificationCenter({ api, branchId, onOpenAnnouncements, onSessionExpired }: NotificationCenterProps) {
  const [items, setItems] = useState<AnnouncementInboxRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const previousIds = useRef<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const refresh = useCallback(async (notify = false) => {
    try {
      const result = await api.listAnnouncementInbox(branchId);
      const next = result.data.announcements;
      if (notify && previousIds.current.size) {
        const incoming = next.filter((item) => !previousIds.current.has(item.announcement_id));
        if (incoming.length && permission === "granted" && document.visibilityState === "hidden" && "Notification" in window) {
          const item = incoming[0];
          try {
            const notification = new Notification(item.title, {
              body: "A new church announcement is available in PCG Missions.",
              icon: "/logo.svg",
              tag: `pcg-announcement-${item.announcement_id}`,
            });
            notification.onclick = () => { window.focus(); setOpen(true); notification.close(); };
          } catch { /* In-app inbox remains available if device notifications are unsupported. */ }
        }
      }
      previousIds.current = new Set(next.map((item) => item.announcement_id));
      setItems(next);
    } catch (error) {
      if (error instanceof CmiApiError && error.status === 401) onSessionExpired();
    }
  }, [api, branchId, onSessionExpired, permission]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void refresh(false).finally(() => { if (active) setLoading(false); });
    const timer = window.setInterval(() => { if (active) void refresh(true); }, 20000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const enableDeviceAlerts = async () => {
    if (!("Notification" in window)) { setPermission("unsupported"); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const openItem = async (item: AnnouncementInboxRecord) => {
    if (!item.is_read) {
      try {
        await api.markAnnouncementRead(branchId, item.announcement_id);
        setItems((current) => current.map((entry) => entry.announcement_id === item.announcement_id
          ? { ...entry, is_read: 1, read_at: new Date().toISOString() } : entry));
      } catch (error) {
        if (error instanceof CmiApiError && error.status === 401) onSessionExpired();
      }
    }
    setOpen(false);
    onOpenAnnouncements();
  };

  return (
    <div className="cmi-notification-center" ref={panelRef}>
      <button type="button" className="cmi-notification-trigger" aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Bell size={18} />
        {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <section className="cmi-notification-popover" aria-label="Notifications">
        <header>
          <div><span className="cmi-eyebrow">YOUR INBOX</span><h3>Notifications</h3><p>{unread ? `${unread} unread announcement${unread === 1 ? "" : "s"}` : "You're all caught up"}</p></div>
          <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="cmi-notification-list">
          {loading && !items.length ? <p className="cmi-notification-empty">Checking for updates…</p> : items.length ? items.map((item) => (
            <button type="button" key={item.announcement_id} className={item.is_read ? "cmi-notification-item" : "cmi-notification-item unread"}
              onClick={() => void openItem(item)}>
              <span className="cmi-notification-icon"><Megaphone size={16} /></span>
              <span className="cmi-notification-copy"><strong>{item.title}</strong><span>{item.body.replace(/\s+/g, " ").slice(0, 116)}{item.body.length > 116 ? "…" : ""}</span><small>{relativeTime(item.published_at ?? item.delivered_at)}</small></span>
              {!item.is_read && <i aria-label="Unread" />}
            </button>
          )) : <div className="cmi-notification-empty"><CheckCheck size={22} /><strong>No announcements yet</strong><span>New notices from your church will appear here.</span></div>}
        </div>
        <footer>
          <button type="button" onClick={enableDeviceAlerts} disabled={permission === "granted" || permission === "unsupported"}>
            <Settings2 size={14} />{permission === "granted" ? "Device alerts enabled" : permission === "denied" ? "Alerts blocked in browser" : permission === "unsupported" ? "Device alerts unavailable" : "Enable device alerts"}
          </button>
          <button type="button" onClick={() => { setOpen(false); onOpenAnnouncements(); }}>Open announcements</button>
        </footer>
      </section>}
    </div>
  );
}
