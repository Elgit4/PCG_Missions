import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
  Users,
  ClipboardList,
  ClipboardCheck,
} from "lucide-react";
import {
  CmiApiClient,
  CmiApiError,
  type AnnouncementDraftRecord,
  type CalendarEntryRecord,
  type EventDraftRecord,
  type SermonDraftRecord,
  type WelcomeMessageDraftRecord,
} from "../lib/cmi-api";
import { hasCapability } from "../lib/capabilities";
import { formatBranchDate, toBranchLocalInput, branchLocalInputToIso } from "../lib/branch-time";
import { formatApplicationError } from "../lib/error-messages";
import { EventAssignmentsPanel } from "./EventAssignmentsPanel";
import { EventRegistrationsPanel } from "./EventRegistrationsPanel";
import { EventCloseoutPanel } from "./EventCloseoutPanel";

type OperationsSection = "Events" | "Calendar" | "Announcements" | "Content";
type ContentKind = "sermons" | "welcome-messages";

interface OperationsWorkspaceProps {
  section: OperationsSection;
  branchId: string;
  timeZone: string;
  api: CmiApiClient;
  session: import("../lib/cmi-api").StaffSession;
  onSessionExpired: () => void;
}

function shortText(value: string, max = 150): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > max ? normalized.slice(0, max - 1) + "…" : normalized;
}

function errorMessage(error: unknown): string {
  return formatApplicationError(error);
}

export function OperationsWorkspace({
  section,
  branchId,
  timeZone,
  api,
  session,
  onSessionExpired,
}: OperationsWorkspaceProps) {
  const [events, setEvents] = useState<EventDraftRecord[]>([]);
  const [entries, setEntries] = useState<CalendarEntryRecord[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementDraftRecord[]>([]);
  const [sermons, setSermons] = useState<SermonDraftRecord[]>([]);
  const [welcomeMessages, setWelcomeMessages] = useState<WelcomeMessageDraftRecord[]>([]);
  const [contentKind, setContentKind] = useState<ContentKind>("sermons");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null);
  const [existingFlyerUrl, setExistingFlyerUrl] = useState<string | null>(null);
  const [assignmentEvent, setAssignmentEvent] = useState<EventDraftRecord | null>(null);
  const [registrationEvent, setRegistrationEvent] = useState<EventDraftRecord | null>(null);
  const [closeoutEvent, setCloseoutEvent] = useState<EventDraftRecord | null>(null);
  const loadVersion = useRef(0);
  const flyerPreviewRequest = useRef(0);
  const mutationInFlight = useRef(false);

  useEffect(() => {
    if (!flyerFile) { setFlyerPreview(null); return; }
    const preview = URL.createObjectURL(flyerFile);
    setFlyerPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [flyerFile]);

  const canRead = section === "Events"
    ? hasCapability(session, "event.read.scoped", branchId)
    : section === "Calendar"
    ? hasCapability(session, "calendar.read.scoped", branchId)
    : section === "Announcements"
    ? hasCapability(session, "announcement.read.scoped", branchId)
    : hasCapability(session, "content.manage.draft", branchId);

  const canManageRegistrations = section === "Events" &&
    hasCapability(session, "event.registration.manage.scoped", branchId);
  const canCheckIn = section === "Events" &&
    hasCapability(session, "event.checkin.scoped", branchId);
  const canSubmitCloseout = section === "Events" &&
    hasCapability(session, "event.closeout.submit", branchId);
  const canReviewCloseout = section === "Events" &&
    hasCapability(session, "event.closeout.review", branchId);

  const canManage = section === "Events"
    ? hasCapability(session, "event.manage.scoped", branchId)
    : section === "Calendar"
    ? hasCapability(session, "calendar.manage.scoped", branchId)
    : section === "Announcements"
    ? hasCapability(session, "announcement.create.scoped", branchId)
    : hasCapability(session, "content.manage.draft", branchId);

  const loadRecords = useCallback(async () => {
    const requestId = ++loadVersion.current;
    setError("");
    if (!canRead) {
      setEvents([]);
      setEntries([]);
      setAnnouncements([]);
      setSermons([]);
      setWelcomeMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (section === "Events") {
        const result = await api.listEventDrafts(branchId, { limit: 50, offset: 0 });
        if (requestId !== loadVersion.current) return;
        setEvents(result.data);
      } else if (section === "Calendar") {
        const result = await api.listCalendarEntries(branchId, { limit: 50, offset: 0 });
        if (requestId !== loadVersion.current) return;
        setEntries(result.data);
      } else if (section === "Announcements") {
        const result = await api.listAnnouncementDrafts(branchId, { limit: 50, offset: 0 });
        if (requestId !== loadVersion.current) return;
        setAnnouncements(result.data);
      } else if (contentKind === "sermons") {
        const result = await api.listSermonDrafts(branchId, { limit: 50, offset: 0 });
        if (requestId !== loadVersion.current) return;
        setSermons(result.data);
      } else {
        const result = await api.listWelcomeMessageDrafts(branchId, { limit: 50, offset: 0 });
        if (requestId !== loadVersion.current) return;
        setWelcomeMessages(result.data);
      }
    } catch (cause) {
      if (requestId !== loadVersion.current) return;
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(errorMessage(cause));
      }
    } finally {
      if (requestId === loadVersion.current) setLoading(false);
    }
  }, [api, branchId, canRead, contentKind, onSessionExpired, section]);

  useEffect(() => {
    void loadRecords();
    return () => { loadVersion.current += 1; };
  }, [loadRecords]);

  const beginCreate = () => {
    flyerPreviewRequest.current += 1;
    setEditingId(null);
    setFlyerFile(null);
    setExistingFlyerUrl(null);
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const beginEdit = (id: string) => {
    const previewRequestId = ++flyerPreviewRequest.current;
    setEditingId(id);
    setFlyerFile(null);
    setExistingFlyerUrl(null);
    const event = section === "Events" ? events.find((item) => item.id === id) : undefined;
    if (event?.flyer_mime_type) {
      void api.getEventFlyerPreview(branchId, id).then((result) => {
        if (previewRequestId === flyerPreviewRequest.current) setExistingFlyerUrl(result.data.signed_url);
      }).catch((cause: unknown) => {
        if (previewRequestId !== flyerPreviewRequest.current) return;
        if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired();
        setExistingFlyerUrl(null);
      });
    }
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const cancelEdit = () => {
    flyerPreviewRequest.current += 1;
    setEditingId(null);
    setFlyerFile(null);
    setExistingFlyerUrl(null);
    setShowForm(false);
  };

  const deleteRecord = async (id: string, title: string) => {
    if (!canManage || (section !== "Events" && section !== "Calendar") || mutationInFlight.current || saving || deletingId) return;
    const verb = section === "Events" ? "cancel" : "remove";
    if (!window.confirm(`Delete “${title}”? This will ${verb} the record and preserve its audit history. It cannot be undone here.`)) return;
    mutationInFlight.current = true;
    setDeletingId(id);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (section === "Events") await api.cancelEventDraft(branchId, id);
      else if (section === "Calendar") await api.cancelCalendarEntry(branchId, id, "Removed by an authorized branch administrator.");
      setNotice(section === "Events" ? "Event cancelled and removed from active drafts." : "Calendar entry cancelled and removed from the active calendar.");
      await loadRecords();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired();
      else setError(errorMessage(cause));
    } finally {
      mutationInFlight.current = false;
      setDeletingId(null);
      setSaving(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutationInFlight.current || !canManage || saving) return;
    const form = new FormData(event.currentTarget);
    mutationInFlight.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (section === "Events") {
        const start = branchLocalInputToIso(String(form.get("starts_at") ?? ""), timeZone);
        const end = branchLocalInputToIso(String(form.get("ends_at") ?? ""), timeZone);
        if (!start || !end) throw new Error("Enter valid start and end times in the selected local time zone.");
        if (Date.parse(end) <= Date.parse(start)) throw new Error("The event end must be later than its start.");
        const capacityValue = String(form.get("capacity") ?? "").trim();
        const capacity = capacityValue === "" ? null : Number(capacityValue);
        if (
          capacity !== null &&
          (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 2147483647)
        ) {
          throw new Error("Capacity must be a positive whole number.");
        }
        const input = {
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          starts_at: start,
          ends_at: end,
          timezone: timeZone,
          location: String(form.get("location") ?? "").trim() || null,
          capacity,
        };
        let savedEventId = editingId;
        if (editingId) {
          await api.updateEventDraft(branchId, editingId, input);
        } else {
          const created = await api.createEventDraft({ branch_id: branchId, ...input });
          savedEventId = created.data.id;
        }
        const selectedFlyer = flyerFile;
        if (savedEventId && selectedFlyer instanceof File && selectedFlyer.size > 0) {
          try {
            await api.uploadEventFlyer(branchId, savedEventId, selectedFlyer);
          } catch (uploadError) {
            await loadRecords();
            setEditingId(savedEventId);
            throw uploadError;
          }
        }
      } else if (section === "Calendar") {
        const start = branchLocalInputToIso(String(form.get("starts_at") ?? ""), timeZone);
        const endValue = String(form.get("ends_at") ?? "");
        const end = endValue ? branchLocalInputToIso(endValue, timeZone) : null;
        if (!start || (endValue && !end)) throw new Error("Enter a valid calendar date and time in the branch time zone.");
        if (end && Date.parse(end) <= Date.parse(start)) throw new Error("The end must be later than the start.");
        const input = {
          entry_type: String(form.get("entry_type") ?? "other") as "service" | "event" | "other",
          title: String(form.get("title") ?? "").trim(),
          starts_at: start,
          ends_at: end,
        };
        if (editingId) await api.updateCalendarEntry(branchId, editingId, input);
        else await api.createCalendarEntry({ branch_id: branchId, ...input });
      } else if (section === "Announcements") {
        const input = {
          title: String(form.get("title") ?? "").trim(),
          body: String(form.get("body") ?? "").trim(),
        };
        if (editingId) await api.updateAnnouncementDraft(branchId, editingId, input);
        else await api.createAnnouncementDraft({ branch_id: branchId, ...input });
      } else if (contentKind === "sermons") {
        const input = {
          title: String(form.get("title") ?? "").trim(),
          body: String(form.get("body") ?? "").trim(),
          public_slug: String(form.get("public_slug") ?? "").trim().toLowerCase(),
        };
        if (editingId) await api.updateSermonDraft(branchId, editingId, input);
        else await api.createSermonDraft({ branch_id: branchId, ...input });
      } else {
        const displayOrder = Number(form.get("display_order") ?? 0);
        if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 10000) {
          throw new Error("Display order must be a whole number from 0 to 10,000.");
        }
        const input = {
          title: String(form.get("title") ?? "").trim(),
          body: String(form.get("body") ?? "").trim(),
          display_order: displayOrder,
        };
        if (editingId) await api.updateWelcomeMessageDraft(branchId, editingId, input);
        else await api.createWelcomeMessageDraft({ branch_id: branchId, ...input });
      }
      setEditingId(null);
      setFlyerFile(null);
      setExistingFlyerUrl(null);
      setShowForm(false);
      setNotice(section === "Events" ? "Event draft saved. The flyer, if attached, is stored privately." : "Saved. This item remains a private draft and is not visible to the public.");
      await loadRecords();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(errorMessage(cause));
      }
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  };

  const editingEvent = section === "Events" ? events.find((item) => item.id === editingId) : undefined;
  const editingEntry = section === "Calendar" ? entries.find((item) => item.id === editingId) : undefined;
  const editingAnnouncement = section === "Announcements" ? announcements.find((item) => item.id === editingId) : undefined;
  const editingSermon = section === "Content" && contentKind === "sermons" ? sermons.find((item) => item.id === editingId) : undefined;
  const editingWelcome = section === "Content" && contentKind === "welcome-messages" ? welcomeMessages.find((item) => item.id === editingId) : undefined;

  const description = section === "Events"
    ? "Manage events, assigned teams, staff registration and attendance. Completed events can be submitted for independent closeout review."
    : section === "Calendar"
    ? "Maintain calendar entries for services, events and other ministry activities."
    : section === "Announcements"
    ? "Prepare private announcement drafts. Publishing and message delivery are separate, unavailable actions."
    : "Prepare sermon and welcome-message drafts. Publishing remains disabled and is not available from this screen.";

  return (
    <div className="cmi-operations-workspace">
      <section className="cmi-panel">
        <div className="cmi-panel-heading cmi-operations-heading">
          <div>
            <p className="cmi-eyebrow">MINISTRY OPERATIONS</p>
            <h3>{section === "Content" ? "Visitor content" : section}</h3>
            <p>{description} Your assigned workspace is applied automatically.</p>
            <small className="cmi-operations-timezone">All dates and times are shown in {timeZone}.</small>
          </div>
          <div className="cmi-operations-actions">
            {canRead && <button className="cmi-button cmi-button-secondary" type="button" onClick={() => void loadRecords()} disabled={loading || saving}><RefreshCw size={15} />Refresh</button>}
            {canManage && <button className="cmi-button cmi-button-primary" type="button" onClick={beginCreate} disabled={saving}><Plus size={15} />New {section === "Events" ? "event" : section === "Calendar" ? "entry" : section === "Announcements" ? "announcement" : "content"}</button>}
          </div>
        </div>

        {section === "Content" && (
          <div className="cmi-operations-tabs" role="group" aria-label="Visitor content type">
            <button type="button" className={contentKind === "sermons" ? "active" : ""} onClick={() => { setContentKind("sermons"); setEditingId(null); setShowForm(false); }}>Sermons</button>
            <button type="button" className={contentKind === "welcome-messages" ? "active" : ""} onClick={() => { setContentKind("welcome-messages"); setEditingId(null); setShowForm(false); }}>Welcome messages</button>
          </div>
        )}

        {!canRead && (
          <div className="cmi-operations-prerequisite">
            <ShieldCheck size={19} />
            <div><strong>Record listing is not granted</strong><p>Your account may create the permitted draft type, but it does not have the separate read capability required to list existing records.</p></div>
          </div>
        )}

        {error && <div className="cmi-alert" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        {notice && <div className="cmi-success-note" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

        {showForm && canManage && (
          <form className="cmi-form-grid cmi-operations-form" onSubmit={(event) => void save(event)} key={section + ":" + contentKind + ":" + (editingId ?? "new")}>
            {section === "Events" && (
              <>
                <label>Event title<input name="title" required minLength={2} maxLength={220} defaultValue={editingEvent?.title ?? ""} placeholder="e.g. Sunday evangelism outreach" /></label>
                <label>Location<input name="location" maxLength={250} defaultValue={editingEvent?.location ?? ""} placeholder="Venue or meeting point" /></label>
                <label>Capacity <span className="cmi-field-optional">Optional · Required for staff registration</span><input name="capacity" type="number" min={1} max={2147483647} step={1} defaultValue={editingEvent?.capacity ?? ""} placeholder="e.g. 120" /></label>
                <label>Starts at ({timeZone})<input name="starts_at" type="datetime-local" required defaultValue={toBranchLocalInput(editingEvent?.starts_at, timeZone)} /></label>
                <label>Ends at ({timeZone})<input name="ends_at" type="datetime-local" required defaultValue={toBranchLocalInput(editingEvent?.ends_at, timeZone)} /></label>
                <label className="cmi-field-wide">Description<textarea name="description" rows={3} maxLength={12000} defaultValue={editingEvent?.description ?? ""} placeholder="Purpose, audience and instructions for staff." /></label>
                <div className="cmi-field-wide cmi-event-flyer-field">
                  <label htmlFor="cmi-event-flyer">Event flyer <span className="cmi-field-optional">Optional</span></label>
                  <input id="cmi-event-flyer" name="flyer" type="file" accept="image/jpeg,image/png,image/webp"
                    onChange={(change) => { setFlyerFile(change.currentTarget.files?.[0] ?? null); setExistingFlyerUrl(null); }} />
                  <small>JPEG, PNG or WebP. Maximum file size: 5 MB. The flyer remains private to authorised staff.</small>
                  {(flyerPreview || existingFlyerUrl) && <div className="cmi-flyer-preview"><img src={flyerPreview ?? existingFlyerUrl ?? ""} alt="Event flyer preview" /><span>{flyerFile?.name ?? "Current event flyer"}</span></div>}
                  {editingEvent?.flyer_mime_type && !flyerFile && !existingFlyerUrl && <small>Existing flyer attached. Preview is being prepared or is temporarily unavailable.</small>}
                  {flyerFile && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => { setFlyerFile(null); setExistingFlyerUrl(null); }}>Remove selected image</button>}
                  {editingEvent?.flyer_mime_type && <button type="button" className="cmi-button cmi-button-secondary" disabled={saving}
                    onClick={() => void (async () => {
                      if (mutationInFlight.current) return;
                      mutationInFlight.current = true;
                      setSaving(true);
                      setError("");
                      try {
                        await api.removeEventFlyer(branchId, editingEvent.id);
                        setExistingFlyerUrl(null);
                        await loadRecords();
                        setNotice("The event flyer has been removed.");
                      } catch (cause) {
                        if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired();
                        else setError(errorMessage(cause));
                      } finally {
                        mutationInFlight.current = false;
                        setSaving(false);
                      }
                    })()}>Remove current flyer</button>}
                </div>
                <p className="cmi-field-wide cmi-scope-note">The server saves this as a private draft with registration closed. Public registration, capacity and attendance are intentionally unavailable.</p>
              </>
            )}
            {section === "Calendar" && (
              <>
                <label>Entry title<input name="title" required minLength={2} maxLength={220} defaultValue={editingEntry?.title ?? ""} placeholder="e.g. Sunday worship service" /></label>
                <label>Entry type<select name="entry_type" defaultValue={editingEntry?.entry_type ?? "service"}><option value="service">Service</option><option value="event">Event</option><option value="other">Other ministry activity</option></select></label>
                <label>Starts at ({timeZone})<input name="starts_at" type="datetime-local" required defaultValue={toBranchLocalInput(editingEntry?.starts_at, timeZone)} /></label>
                <label>Ends at ({timeZone})<input name="ends_at" type="datetime-local" defaultValue={toBranchLocalInput(editingEntry?.ends_at, timeZone)} /></label>
                <p className="cmi-field-wide cmi-scope-note">Calendar entries follow your assigned ministry scope. Leave the end time blank for an entry with no defined end.</p>
              </>
            )}
            {section === "Announcements" && (
              <>
                <label>Announcement title<input name="title" required minLength={2} maxLength={220} defaultValue={editingAnnouncement?.title ?? ""} placeholder="e.g. Change to Sunday service time" /></label>
                <label className="cmi-field-wide">Announcement message<textarea name="body" required minLength={1} maxLength={20000} rows={6} defaultValue={editingAnnouncement?.body ?? ""} placeholder="Write the announcement for review." /></label>
                <p className="cmi-field-wide cmi-scope-note">The server forces private draft status. This form does not publish, schedule or send SMS/email/WhatsApp messages.</p>
              </>
            )}
            {section === "Content" && contentKind === "sermons" && (
              <>
                <label>Sermon title<input name="title" required minLength={2} maxLength={220} defaultValue={editingSermon?.title ?? ""} placeholder="Message title" /></label>
                <label>Public URL slug<input name="public_slug" required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={editingSermon?.public_slug ?? ""} placeholder="e.g. walking-in-faith" /></label>
                <label className="cmi-field-wide">Sermon content<textarea name="body" required minLength={1} maxLength={30000} rows={8} defaultValue={editingSermon?.body ?? ""} placeholder="Add the sermon manuscript or summary." /></label>
                <p className="cmi-field-wide cmi-scope-note">Sermons remain private drafts until a separate publishing workflow is approved and implemented.</p>
              </>
            )}
            {section === "Content" && contentKind === "welcome-messages" && (
              <>
                <label>Welcome message title<input name="title" required minLength={2} maxLength={220} defaultValue={editingWelcome?.title ?? ""} placeholder="e.g. Welcome to PCG Missions" /></label>
                <label>Display order<input name="display_order" type="number" min={0} max={10000} step={1} defaultValue={editingWelcome?.display_order ?? 0} /></label>
                <label className="cmi-field-wide">Welcome message<textarea name="body" required minLength={1} maxLength={12000} rows={6} defaultValue={editingWelcome?.body ?? ""} placeholder="Write the message visitors should see after publication." /></label>
                <p className="cmi-field-wide cmi-scope-note">This message remains a private draft. Church-wide public settings and publication are separate permissions.</p>
              </>
            )}
            <div className="cmi-form-actions cmi-field-wide">
              <button type="button" className="cmi-button cmi-button-secondary" onClick={cancelEdit} disabled={saving}><X size={15} />Cancel</button>
              <button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Save private draft"}</button>
            </div>
          </form>
        )}

        {loading && <div className="cmi-loading" role="status">Loading authorised records…</div>}

        {section === "Events" && canRead && !loading && (
          <div className="cmi-task-list cmi-operations-list">
            {events.map((item) => (
              <article className="cmi-task-row" key={item.id}>
                <div className="cmi-task-symbol"><CalendarDays size={18} /></div>
                <div className="cmi-task-copy"><strong>{item.title}</strong><p>{formatBranchDate(item.starts_at, timeZone)} – {formatBranchDate(item.ends_at, timeZone)}{item.location ? " · " + item.location : ""}</p><small>{shortText(item.description ?? "No description added.")}</small></div>
                <span className="cmi-task-status status-open">{item.status === "draft" ? "Private draft" : item.status === "completed" ? "Completed" : item.status === "cancelled" ? "Cancelled" : item.registration_state === "open" ? "Staff registration open" : "Staff event · Registration closed"}</span>
                {canManage && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setAssignmentEvent(item)} aria-label={"Manage assignments for " + item.title}><Users size={14} />Assignments</button>}
                {canManageRegistrations && item.status === "draft" && item.visibility === "private" && item.registration_state === "closed" && (
                  <button type="button" className="cmi-button cmi-button-secondary" disabled={!item.capacity || saving} onClick={async () => {
                    if (mutationInFlight.current) return;
                    mutationInFlight.current = true;
                    setSaving(true); setError(""); setNotice("");
                    try { await api.openStaffEventRegistration(branchId, item.id); setNotice("Event published to staff visibility. Staff registration is now open."); await loadRecords(); }
                    catch (cause) {
                      if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired();
                      else setError(errorMessage(cause));
                    }
                    finally {
                      mutationInFlight.current = false;
                      setSaving(false);
                    }
                  }} title={!item.capacity ? "Set a finite capacity before opening registration." : "Publish this event to staff only"}>
                    Open staff registration
                  </button>
                )}
                {canManageRegistrations && item.status === "published" && item.visibility === "staff" && (
                  <>
                    <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setRegistrationEvent(item)} aria-label={"Manage registrations for " + item.title}><ClipboardList size={14} />Registrations</button>
                    {item.registration_state === "open" && <button type="button" className="cmi-button cmi-button-secondary" disabled={saving} onClick={async () => {
                      if (mutationInFlight.current) return;
                      mutationInFlight.current = true;
                      setSaving(true); setError(""); setNotice("");
                      try { await api.closeStaffEventRegistration(branchId, item.id); setNotice("Staff registration closed."); await loadRecords(); }
                      catch (cause) {
                        if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired();
                        else setError(errorMessage(cause));
                      }
                      finally {
                        mutationInFlight.current = false;
                        setSaving(false);
                      }
                    }}>Close registration</button>}
                  </>
                )}
                {(canSubmitCloseout || canReviewCloseout) && (item.status === "published" || item.status === "completed") && Date.parse(item.ends_at) <= Date.now() && (
                  <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setCloseoutEvent(item)} aria-label={"Open closeout for " + item.title}><ClipboardCheck size={14} />Closeout</button>
                )}
                {canManage && item.status === "draft" && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginEdit(item.id)} aria-label={"Edit " + item.title}><Pencil size={14} />Edit</button>}
                {canManage && item.status === "draft" && <button type="button" className="cmi-button cmi-button-danger" onClick={() => void deleteRecord(item.id,item.title)} disabled={deletingId!==null} aria-label={"Delete " + item.title}>{deletingId===item.id ? "Deleting…" : <><Trash2 size={14} />Delete</>}</button>}
              </article>
            ))}
            {!events.length && <p className="cmi-detail-muted">No event drafts are available yet.</p>}
          </div>
        )}

        {section === "Events" && canManage && assignmentEvent && (
          <EventAssignmentsPanel
            key={assignmentEvent.id}
            api={api}
            branchId={branchId}
            timeZone={timeZone}
            event={assignmentEvent}
            onClose={() => setAssignmentEvent(null)}
            onSessionExpired={onSessionExpired}
          />
        )}

        {section === "Events" && canManageRegistrations && registrationEvent && (
          <EventRegistrationsPanel
            key={registrationEvent.id + ":" + registrationEvent.registration_state}
            api={api}
            branchId={branchId}
            timeZone={timeZone}
            event={registrationEvent}
            canCheckIn={canCheckIn}
            onClose={() => setRegistrationEvent(null)}
            onSessionExpired={onSessionExpired}
          />
        )}

        {section === "Events" && (canSubmitCloseout || canReviewCloseout) && closeoutEvent && (
          <EventCloseoutPanel
            key={closeoutEvent.id}
            api={api}
            branchId={branchId}
            timeZone={timeZone}
            event={closeoutEvent}
            currentStaffId={session.user.id}
            canSubmit={canSubmitCloseout}
            canReview={canReviewCloseout}
            onClose={() => setCloseoutEvent(null)}
            onSessionExpired={onSessionExpired}
          />
        )}

        {section === "Calendar" && canRead && !loading && (
          <div className="cmi-task-list cmi-operations-list">
            {entries.map((item) => (
              <article className="cmi-task-row" key={item.id}>
                <div className="cmi-task-symbol"><CalendarClock size={18} /></div>
                <div className="cmi-task-copy"><strong>{item.title}</strong><p>{item.entry_type.replaceAll("_", " ")} · {formatBranchDate(item.starts_at, timeZone)} – {formatBranchDate(item.ends_at, timeZone)}</p></div>
                <span className="cmi-task-status status-open">Scheduled</span>
                {canManage && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginEdit(item.id)} aria-label={"Edit " + item.title}><Pencil size={14} />Edit</button>}
                {canManage && <button type="button" className="cmi-button cmi-button-danger" onClick={() => void deleteRecord(item.id,item.title)} disabled={deletingId!==null} aria-label={"Delete " + item.title}>{deletingId===item.id ? "Deleting…" : <><Trash2 size={14} />Delete</>}</button>}
              </article>
            ))}
            {!entries.length && <p className="cmi-detail-muted">No calendar entries are available yet.</p>}
          </div>
        )}

        {section === "Announcements" && canRead && !loading && (
          <div className="cmi-task-list cmi-operations-list">
            {announcements.map((item) => (
              <article className="cmi-task-row" key={item.id}>
                <div className="cmi-task-symbol"><Megaphone size={18} /></div>
                <div className="cmi-task-copy"><strong>{item.title}</strong><p>{formatBranchDate(item.updated_at, timeZone)} · {shortText(item.body)}</p></div>
                <span className="cmi-task-status status-open">Private draft</span>
                {canManage && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginEdit(item.id)} aria-label={"Edit " + item.title}><Pencil size={14} />Edit</button>}

              </article>
            ))}
            {!announcements.length && <p className="cmi-detail-muted">No announcement drafts are available yet.</p>}
          </div>
        )}

        {section === "Content" && canRead && !loading && contentKind === "sermons" && (
          <div className="cmi-task-list cmi-operations-list">
            {sermons.map((item) => (
              <article className="cmi-task-row" key={item.id}>
                <div className="cmi-task-symbol"><BookOpen size={18} /></div>
                <div className="cmi-task-copy"><strong>{item.title}</strong><p>/{item.public_slug} · Updated {formatBranchDate(item.updated_at, timeZone)}</p><small>{shortText(item.body)}</small></div>
                <span className="cmi-task-status status-open">Private draft</span>
                {canManage && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginEdit(item.id)} aria-label={"Edit " + item.title}><Pencil size={14} />Edit</button>}
              </article>
            ))}
            {!sermons.length && <p className="cmi-detail-muted">No sermon drafts are available yet.</p>}
          </div>
        )}

        {section === "Content" && canRead && !loading && contentKind === "welcome-messages" && (
          <div className="cmi-task-list cmi-operations-list">
            {welcomeMessages.map((item) => (
              <article className="cmi-task-row" key={item.id}>
                <div className="cmi-task-symbol"><BookOpen size={18} /></div>
                <div className="cmi-task-copy"><strong>{item.title}</strong><p>Display order {item.display_order} · Updated {formatBranchDate(item.updated_at, timeZone)}</p><small>{shortText(item.body)}</small></div>
                <span className="cmi-task-status status-open">Private draft</span>
                {canManage && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginEdit(item.id)} aria-label={"Edit " + item.title}><Pencil size={14} />Edit</button>}
              </article>
            ))}
            {!welcomeMessages.length && <p className="cmi-detail-muted">No welcome-message drafts are available yet.</p>}
          </div>
        )}

        {!canRead && !canManage && <div className="cmi-empty-state"><ShieldCheck size={22} /><strong>This module is not authorised for your account.</strong><p>The sidebar is permission-driven. Ask an administrator to review your staff-role permissions.</p></div>}
      </section>
    </div>
  );
}
