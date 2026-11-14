import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
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

type OperationsSection = "Events" | "Calendar" | "Announcements" | "Content";
type ContentKind = "sermons" | "welcome-messages";

interface OperationsWorkspaceProps {
  section: OperationsSection;
  branchId: string;
  branchName: string;
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
  if (error instanceof CmiApiError) {
    if (error.status === 401) return "Your staff session has expired. Sign in again.";
    if (error.status === 403) return "Your account does not have the required permission for this operation.";
    if (error.status === 404) return "This record is no longer available in your branch.";
    if (error.status === 409) return "This record changed before the save completed. Refresh and try again.";
    if (error.status === 422) return error.message;
    if (error.status === 0) return "The service could not be reached. Check your connection and retry.";
    return error.message + (error.requestId ? " (Reference: " + error.requestId + ")" : "");
  }
  return "The operation could not be completed. Please try again.";
}

export function OperationsWorkspace({
  section,
  branchId,
  branchName,
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
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [flyerPreview, setFlyerPreview] = useState("");
  useEffect(() => { if(!flyerPreview) return; return () => URL.revokeObjectURL(flyerPreview); }, [flyerPreview]);

  const canRead = section === "Events"
    ? hasCapability(session, "event.read.scoped", branchId)
    : section === "Calendar"
    ? hasCapability(session, "calendar.read.scoped", branchId)
    : section === "Announcements"
    ? hasCapability(session, "announcements.read", branchId)
    : hasCapability(session, "content.manage.draft", branchId);

  const canManage = section === "Events"
    ? hasCapability(session, "event.manage.scoped", branchId)
    : section === "Calendar"
    ? hasCapability(session, "calendar.manage.scoped", branchId)
    : section === "Announcements"
    ? hasCapability(session, "announcements.manage", branchId)
    : hasCapability(session, "content.manage.draft", branchId);

  const loadRecords = useCallback(async () => {
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
        const result = await api.listEventDrafts(branchId, { limit: 50 });
        setEvents(result.data);
      } else if (section === "Calendar") {
        const result = await api.listCalendarEntries(branchId, { limit: 50 });
        setEntries(result.data);
      } else if (section === "Announcements") {
        const result = await api.listAnnouncementDrafts(branchId, { limit: 50, offset: 0, status: canManage ? "all" : "published" });
        setAnnouncements(result.data);
      } else if (contentKind === "sermons") {
        const result = await api.listSermonDrafts(branchId, { limit: 50, offset: 0 });
        setSermons(result.data);
      } else {
        const result = await api.listWelcomeMessageDrafts(branchId, { limit: 50, offset: 0 });
        setWelcomeMessages(result.data);
      }
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(errorMessage(cause));
      }
    } finally {
      setLoading(false);
    }
  }, [api, branchId, canRead, contentKind, onSessionExpired, section]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const beginCreate = () => {
    setFlyerPreview("");
    setEditingId(null);
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const beginEdit = (id: string) => {
    setFlyerPreview("");
    setEditingId(id);
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const cancelEdit = () => {
    setFlyerPreview("");
    setEditingId(null);
    setShowForm(false);
  };

  const publishAnnouncement = async (announcementId: string) => {
    if (!canManage || publishingId) return;
    setPublishingId(announcementId);
    setError("");
    setNotice("");
    try {
      await api.publishAnnouncementDraft(branchId, announcementId);
      setNotice("Announcement published. It has been delivered to eligible staff in the selected audience’s in-app inbox.");
      await loadRecords();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired();
      else setError(errorMessage(cause));
    } finally {
      setPublishingId(null);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (section === "Events") {
        const start = branchLocalInputToIso(String(form.get("starts_at") ?? ""), timeZone);
        const end = branchLocalInputToIso(String(form.get("ends_at") ?? ""), timeZone);
        if (!start || !end) throw new Error("Enter valid start and end times in the branch time zone.");
        if (Date.parse(end) <= Date.parse(start)) throw new Error("The event end must be later than its start.");
        const flyer=form.get("flyer");
        if(!(flyer instanceof File)||flyer.size===0){if(!editingEvent?.flyer_url) throw new Error("Upload an event flyer or image before saving this event.");}
        if(flyer instanceof File&&flyer.size>5*1024*1024) throw new Error("The event image must be 5 MB or smaller.");
        const input = {
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim() || null,
          starts_at: start,
          ends_at: end,
          timezone: timeZone,
          location: String(form.get("location") ?? "").trim() || null,
        };
        let eventId=editingId;
        if(editingId) await api.updateEventDraft(branchId,editingId,input);
        else { const created=await api.createEventDraft({branch_id:branchId,...input}); eventId=created.data.event.id; setEditingId(eventId); await loadRecords(); }
        if(flyer instanceof File&&flyer.size>0) await api.uploadEventFlyer(branchId,eventId!,flyer);
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
          audience_type: String(form.get("audience_type") ?? "branch") as "branch" | "staff",
        };
        if (editingId) await api.updateAnnouncementDraft(branchId, editingId, { title: input.title, body: input.body });
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
      setShowForm(false);
      setNotice("Saved. This item remains a private draft and is not visible to the public.");
      await loadRecords();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(errorMessage(cause));
      }
    } finally {
      setSaving(false);
    }
  };

  const editingEvent = section === "Events" ? events.find((item) => item.id === editingId) : undefined;
  const editingEntry = section === "Calendar" ? entries.find((item) => item.id === editingId) : undefined;
  const editingAnnouncement = section === "Announcements" ? announcements.find((item) => item.id === editingId) : undefined;
  const editingSermon = section === "Content" && contentKind === "sermons" ? sermons.find((item) => item.id === editingId) : undefined;
  const editingWelcome = section === "Content" && contentKind === "welcome-messages" ? welcomeMessages.find((item) => item.id === editingId) : undefined;

  const description = section === "Events"
    ? "Create and maintain internal event drafts. Registration, transport, capacity and check-in are not enabled in this workspace."
    : section === "Calendar"
    ? "Maintain branch calendar entries for services, events and other ministry activities."
    : section === "Announcements"
    ? "Publish branch announcements directly into each staff member’s in-app inbox. No email or SMS is sent."
    : "Prepare sermon and welcome-message drafts. Publishing remains disabled and is not available from this screen.";

  return (
    <div className="cmi-operations-workspace">
      <section className="cmi-panel">
        <div className="cmi-panel-heading cmi-operations-heading">
          <div>
            <p className="cmi-eyebrow">BRANCH OPERATIONS</p>
            <h3>{section === "Content" ? "Visitor content" : section}</h3>
            <p>{description} <strong>{branchName}</strong>.</p>
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
                <label>Starts at ({timeZone})<input name="starts_at" type="datetime-local" required defaultValue={toBranchLocalInput(editingEvent?.starts_at, timeZone)} /></label>
                <label>Ends at ({timeZone})<input name="ends_at" type="datetime-local" required defaultValue={toBranchLocalInput(editingEvent?.ends_at, timeZone)} /></label>
                <label className="cmi-field-wide">Event flyer or image<input name="flyer" type="file" accept="image/png,image/jpeg,image/webp" required={!editingEvent?.flyer_url} onChange={change=>{const file=change.currentTarget.files?.[0];setFlyerPreview(file?URL.createObjectURL(file):"");}} /><small>Required for every event. PNG, JPEG or WebP · maximum 5 MB.</small></label>
                {(flyerPreview||editingEvent?.flyer_url)&&<div className="cmi-field-wide"><img src={flyerPreview||editingEvent?.flyer_url||""} alt="Event flyer preview" style={{display:"block",width:"min(100%,360px)",maxHeight:220,objectFit:"contain",borderRadius:12,border:"1px solid var(--cmi-border, #dce4df)"}} /></div>}
                <label className="cmi-field-wide">Description<textarea name="description" rows={3} maxLength={12000} defaultValue={editingEvent?.description ?? ""} placeholder="Purpose, audience and instructions for staff." /></label>
                <p className="cmi-field-wide cmi-scope-note">A flyer is mandatory for every event. This record remains a private draft until the separate publishing workflow is completed.</p>
              </>
            )}
            {section === "Calendar" && (
              <>
                <label>Entry title<input name="title" required minLength={2} maxLength={220} defaultValue={editingEntry?.title ?? ""} placeholder="e.g. Sunday worship service" /></label>
                <label>Entry type<select name="entry_type" defaultValue={editingEntry?.entry_type ?? "service"}><option value="service">Service</option><option value="event">Event</option><option value="other">Other ministry activity</option></select></label>
                <label>Starts at ({timeZone})<input name="starts_at" type="datetime-local" required defaultValue={toBranchLocalInput(editingEntry?.starts_at, timeZone)} /></label>
                <label>Ends at ({timeZone})<input name="ends_at" type="datetime-local" defaultValue={toBranchLocalInput(editingEntry?.ends_at, timeZone)} /></label>
                <p className="cmi-field-wide cmi-scope-note">Calendar entries are branch-scoped. Leave the end time blank for an entry with no defined end.</p>
              </>
            )}
            {section === "Announcements" && (
              <>
                <label>Announcement title<input name="title" required minLength={2} maxLength={180} defaultValue={editingAnnouncement?.title ?? ""} placeholder="e.g. Change to Sunday service time" /></label>
                {!editingId ? (
                  <label>Who should receive this?
                    <select name="audience_type" defaultValue="branch">
                      <option value="branch">Everyone in {branchName}</option>
                    </select>
                  </label>
                ) : (
                  <label>Audience<input value={editingAnnouncement?.audience_type === "staff" ? "All active staff across the church" : "Everyone in this branch"} readOnly /></label>
                )}
                <label className="cmi-field-wide">Announcement message<textarea name="body" required minLength={1} maxLength={20000} rows={6} defaultValue={editingAnnouncement?.body ?? ""} placeholder="Write a clear announcement for your church team." /></label>
                <p className="cmi-field-wide cmi-scope-note">Publishing places the announcement in each recipient’s in-app notification inbox. No email, SMS or OTP is sent. Church-wide delivery is restricted to Admin/Pastor.</p>
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
              <button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : section === "Announcements" ? "Save announcement draft" : "Save private draft"}</button>
            </div>
          </form>
        )}

        {loading && <div className="cmi-loading" role="status">Loading authorised records…</div>}

        {section === "Events" && canRead && !loading && (
          <div className="cmi-task-list cmi-operations-list">
            {events.map((item) => (
              <article className="cmi-task-row" key={item.id}>
                <div className="cmi-task-symbol">{item.flyer_url ? <img src={item.flyer_url} alt="" style={{width:52,height:52,objectFit:"cover",borderRadius:8}} /> : <CalendarDays size={18} />}</div>
                <div className="cmi-task-copy"><strong>{item.title}</strong><p>{formatBranchDate(item.starts_at, timeZone)} – {formatBranchDate(item.ends_at, timeZone)}{item.location ? " · " + item.location : ""}</p><small>{shortText(item.description ?? "No description added.")}</small></div>
                <span className="cmi-task-status status-open">Private draft</span>
                {canManage && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginEdit(item.id)} aria-label={"Edit " + item.title}><Pencil size={14} />Edit</button>}
              </article>
            ))}
            {!events.length && <p className="cmi-detail-muted">No event drafts are visible in this branch.</p>}
          </div>
        )}

        {section === "Calendar" && canRead && !loading && (
          <div className="cmi-task-list cmi-operations-list">
            {entries.map((item) => (
              <article className="cmi-task-row" key={item.id}>
                <div className="cmi-task-symbol"><CalendarClock size={18} /></div>
                <div className="cmi-task-copy"><strong>{item.title}</strong><p>{item.entry_type.replaceAll("_", " ")} · {formatBranchDate(item.starts_at, timeZone)} – {formatBranchDate(item.ends_at, timeZone)}</p></div>
                <span className="cmi-task-status status-open">Scheduled</span>
                {canManage && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginEdit(item.id)} aria-label={"Edit " + item.title}><Pencil size={14} />Edit</button>}
              </article>
            ))}
            {!entries.length && <p className="cmi-detail-muted">No calendar entries are visible in this branch.</p>}
          </div>
        )}

        {section === "Announcements" && canRead && !loading && (
          <div className="cmi-task-list cmi-operations-list">
            {announcements.map((item) => (
              <article className="cmi-task-row" key={item.id}>
                <div className="cmi-task-symbol"><Megaphone size={18} /></div>
                <div className="cmi-task-copy"><strong>{item.title}</strong><p>{formatBranchDate(item.updated_at, timeZone)} · {shortText(item.body)}</p></div>
                <span className={"cmi-task-status " + (item.status === "published" ? "status-completed" : item.status === "archived" ? "status-cancelled" : "status-open")}>{item.status === "published" ? "Published" : item.status === "scheduled" ? "Scheduled" : item.status === "archived" ? "Archived" : "Draft"}</span>
                {canManage && item.status === "draft" && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginEdit(item.id)} aria-label={"Edit " + item.title}><Pencil size={14} />Edit</button>}
                {canManage && item.status === "draft" && <button type="button" className="cmi-button cmi-button-primary" onClick={() => void publishAnnouncement(item.id)} disabled={publishingId !== null}>{publishingId === item.id ? "Publishing…" : "Publish & notify"}</button>}
              </article>
            ))}
            {!announcements.length && <p className="cmi-detail-muted">No announcement drafts are visible in this branch.</p>}
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
            {!sermons.length && <p className="cmi-detail-muted">No sermon drafts are visible in this branch.</p>}
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
            {!welcomeMessages.length && <p className="cmi-detail-muted">No welcome-message drafts are visible in this branch.</p>}
          </div>
        )}

        {!canRead && !canManage && <div className="cmi-empty-state"><ShieldCheck size={22} /><strong>This module is not authorised for your account.</strong><p>The sidebar is permission-driven. Ask an administrator to review the role and branch capability assignments.</p></div>}
      </section>
    </div>
  );
}
