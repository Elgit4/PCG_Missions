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

function applicationServerKey(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function NotificationCenter({ api, branchId, onOpenAnnouncements, onSessionExpired }: NotificationCenterProps) {
  const [items, setItems] = useState<AnnouncementInboxRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const previousIds = useRef<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const refresh = useCallback(async (notify = false) => {
    try {
      const result = await api.listAnnouncementInbox(branchId);
      const next = result.data.announcements;
      if (notify && previousIds.current.size && !pushEnabled) {
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
          } catch { /* The in-app inbox remains the reliable fallback. */ }
        }
      }
      previousIds.current = new Set(next.map((item) => item.announcement_id));
      setItems(next);
    } catch (error) {
      if (error instanceof CmiApiError && error.status === 401) onSessionExpired();
    }
  }, [api, branchId, onSessionExpired, permission, pushEnabled]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void refresh(false).finally(() => { if (active) setLoading(false); });
    const timer = window.setInterval(() => { if (active) void refresh(true); }, 20000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    let active = true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return;
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) return;
      await api.savePushSubscription(branchId, {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (active) setPushEnabled(true);
    }).catch(() => { /* A missing local subscription does not affect the in-app inbox. */ });
    return () => { active = false; };
  }, [api, branchId]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const enableDeviceAlerts = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      setPushError("This browser does not support Web Push. The in-app notification inbox will still work.");
      return;
    }
    setPushBusy(true);
    setPushError("");
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        if (result === "denied") setPushError("Notifications are blocked in browser settings. Allow them there and try again.");
        return;
      }
      const keyResult = await api.getPushPublicKey(branchId);
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(keyResult.data.public_key) as BufferSource,
        });
      }
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("The browser did not return valid push subscription keys.");
      await api.savePushSubscription(branchId, {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setPushEnabled(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Push notifications could not be enabled.";
      const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      setPushError(isAppleMobile
        ? `${message} On iPhone or iPad, add PCG Missions to your Home Screen and enable notifications from the installed app.`
        : message);
    } finally {
      setPushBusy(false);
    }
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
          <button type="button" onClick={enableDeviceAlerts} disabled={pushBusy || pushEnabled || permission === "denied" || permission === "unsupported"}>
            <Settings2 size={14} />{pushBusy ? "Enabling…" : pushEnabled ? "Mobile push enabled" : permission === "denied" ? "Push blocked in browser" : permission === "unsupported" ? "Push unavailable" : "Enable mobile push"}
          </button>
          <button type="button" onClick={() => { setOpen(false); onOpenAnnouncements(); }}>Open announcements</button>
        </footer>
        {pushError && <p className="cmi-notification-push-error" role="status">{pushError}</p>}
      </section>}
    </div>
  );
}
