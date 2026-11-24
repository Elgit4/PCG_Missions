import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Circle, LoaderCircle } from "lucide-react";
import { CmiApiError, type CmiApiClient, type StaffNotificationRecord } from "../lib/cmi-api";

type Target = StaffNotificationRecord["target_type"];
interface Props {
  api: CmiApiClient;
  branchId: string;
  onNavigate: (target: Target) => void;
  onSessionExpired: () => void;
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
export function StaffNotificationCenter({ api, branchId, onNavigate, onSessionExpired }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StaffNotificationRecord[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const activeBranchId = useRef(branchId);

  const load = useCallback(async (quiet = false) => {
    if (!branchId) return;
    const version = ++requestVersion.current;
    if (!quiet) setLoading(true);
    try {
      const result = await api.listStaffNotifications(branchId, 30);
      if (version !== requestVersion.current) return;
      setItems(result.data.notifications);
      setUnread(result.data.unread_count);
      setError("");
    } catch (cause) {
      if (version !== requestVersion.current) return;
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
        return;
      }
      setItems([]);
      setUnread(0);
      if (!quiet) setError("Notifications are temporarily unavailable. Try refreshing.");
    } finally {
      if (version === requestVersion.current && !quiet) setLoading(false);
    }
  }, [api, branchId, onSessionExpired]);

  useLayoutEffect(() => {
    activeBranchId.current = branchId;
    requestVersion.current += 1;
    setItems([]);
    setUnread(0);
    setError("");
    setLoading(false);
    setSavingId(null);
  }, [branchId]);

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
      const actionBranchId = branchId;
      await api.markAllStaffNotificationsRead(actionBranchId);
      if (activeBranchId.current !== actionBranchId) return;
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
      setUnread(0);
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired();
      else if (activeBranchId.current === branchId) setError("We couldn't update your notifications. Please try again.");
    } finally {
      if (activeBranchId.current === branchId) setSavingId(null);
    }
  };

  const activate = async (item: StaffNotificationRecord) => {
    if (!item.read_at) {
      setSavingId(item.id);
      try {
        const actionBranchId = branchId;
        await api.markStaffNotificationRead(actionBranchId, item.id);
        if (activeBranchId.current !== actionBranchId) return;
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
        setUnread((count) => Math.max(0, count - 1));
      } catch (cause) {
        if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired();
        else if (activeBranchId.current === branchId) setError("We couldn't update this notification. Please try again.");
        if (activeBranchId.current === branchId) setSavingId(null);
        return;
      }
      if (activeBranchId.current === branchId) setSavingId(null);
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
