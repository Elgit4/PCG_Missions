import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Circle, LoaderCircle } from "lucide-react";
import type { CmiApiClient, StaffNotificationRecord } from "../lib/cmi-api";

type Target = StaffNotificationRecord["target_type"];
interface Props {
  api: CmiApiClient;
  branchId: string;
  onNavigate: (target: Target) => void;
}
function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
export function StaffNotificationCenter({ api, branchId, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StaffNotificationRecord[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!branchId) return;
    if (!quiet) setLoading(true);
    try {
      const result = await api.listStaffNotifications(branchId, 30);
      setItems(result.data.notifications);
      setUnread(result.data.unread_count);
      setError("");
    } catch {
      if (!quiet) setError("Notifications are temporarily unavailable. Try refreshing.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [api, branchId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const markAll = async () => {
    if (!unread || savingId) return;
    setSavingId("all");
    try {
      await api.markAllStaffNotificationsRead(branchId);
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
      setUnread(0);
    } catch {
      setError("We couldn't update your notifications. Please try again.");
    } finally {
      setSavingId(null);
    }
  };

  const activate = async (item: StaffNotificationRecord) => {
    if (!item.read_at) {
      setSavingId(item.id);
      try {
        await api.markStaffNotificationRead(branchId, item.id);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
        setUnread((count) => Math.max(0, count - 1));
      } catch {
        setError("We couldn't update this notification. Please try again.");
        setSavingId(null);
        return;
      }
      setSavingId(null);
    }
    setOpen(false);
    if (item.target_type) onNavigate(item.target_type);
  };

  return (
    <div className="cmi-notification-center">
      <button type="button" className="cmi-icon-action cmi-notification-trigger"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open} aria-controls="cmi-notification-panel"
        onClick={() => { setOpen((value) => !value); if (!open) void load(); }}>
        <Bell size={18} />
        {unread > 0 && <span className="cmi-notification-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <>
          <button className="cmi-notification-dismiss" type="button" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <section className="cmi-notification-panel" id="cmi-notification-panel" aria-label="Notifications">
            <header className="cmi-notification-heading">
              <div><strong>Notifications</strong><small>{unread ? `${unread} unread` : "You're all caught up"}</small></div>
              <button type="button" onClick={() => void markAll()} disabled={!unread || !!savingId} aria-label="Mark all as read">
                {savingId === "all" ? <LoaderCircle size={16} className="is-spinning" /> : <CheckCheck size={17} />}
              </button>
            </header>
            {error && <p className="cmi-notification-error" role="alert">{error}</p>}
            {loading ? <div className="cmi-notification-empty" role="status">Loading notifications…</div> :
              items.length === 0 ? <div className="cmi-notification-empty">No notifications yet. Updates about your assigned work will appear here.</div> :
              <div className="cmi-notification-list">
                {items.map((item) => (
                  <button type="button" className={`cmi-notification-item ${item.read_at ? "" : "unread"}`}
                    key={item.id} onClick={() => void activate(item)} disabled={!!savingId}>
                    <span className="cmi-notification-indicator">{savingId === item.id ? <LoaderCircle size={15} className="is-spinning" /> : !item.read_at ? <Circle size={9} fill="currentColor" /> : <span />}</span>
                    <span className="cmi-notification-copy"><strong>{item.title}</strong><span>{item.body}</span><small>{relativeTime(item.created_at)}</small></span>
                  </button>
                ))}
              </div>
            }
          </section>
        </>
      )}
    </div>
  );
}
