import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  CalendarClock,
  Check,
  Clock3,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { CmiApiError } from "../lib/cmi-api";
import type {
  ContactInteraction,
  ContactInteractionCreateInput,
  ContactNote,
  ContactRecord,
  CmiApiClient,
} from "../lib/cmi-api";

interface ContactDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  timeZone: string;
  contact: ContactRecord;
  api: CmiApiClient;
  canReadIdentity: boolean;
  canReadNotes: boolean;
  canCreateNotes: boolean;
  canRecordInteraction: boolean;
  onSessionExpired: () => void;
}

function formatDate(value: string | null | undefined, timeZone: string): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof CmiApiError) {
    if (error.status === 401) return "Your staff session has expired. Sign in again.";
    if (error.status === 403 || error.status === 404) {
      return "This contact or part of its history is no longer available within your current access scope. Refresh the workspace before continuing.";
    }
    if (error.status === 409) return "The record changed while you were working. Refresh its history before trying again.";
    if (error.status === 422) return "Check the information entered and correct the highlighted details.";
    if (error.status === 0) {
      return "The server response could not be confirmed. Refresh this record before attempting the action again to avoid a duplicate entry.";
    }
    return `The operation could not be completed.${error.requestId ? ` Reference: ${error.requestId}` : ""}`;
  }
  return "The operation could not be completed. Refresh the record and try again.";
}

function displayContactName(contact: ContactRecord): string {
  return contact.preferred_name?.trim() ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ");
}

function interactionLabel(value: ContactInteraction["interaction_type"]): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ContactDetailDialog({
  open,
  onOpenChange,
  branchId,
  timeZone,
  contact: initialContact,
  api,
  canReadIdentity,
  canReadNotes,
  canCreateNotes,
  canRecordInteraction,
  onSessionExpired,
}: ContactDetailDialogProps) {
  const [contact, setContact] = useState(initialContact);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [interactions, setInteractions] = useState<ContactInteraction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const identityVisible = canReadIdentity && !contact.identity_redacted;

  useEffect(() => {
    setContact(initialContact);
  }, [initialContact]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true);
    setLoadError("");
    setActionError("");
    setNotice("");

    const noteRequest = canReadNotes
      ? api.listContactNotes(branchId, initialContact.id)
      : Promise.resolve({ data: [] as ContactNote[], request_id: "" });
    void Promise.allSettled([
      api.getContact(branchId, initialContact.id),
      noteRequest,
      api.listContactInteractions(branchId, initialContact.id),
    ]).then(([contactResult, noteResult, interactionResult]) => {
      if (!current) return;
      if (contactResult.status === "rejected") {
        const error = contactResult.reason;
        if (error instanceof CmiApiError && error.status === 401) {
          onSessionExpired();
          return;
        }
        setLoadError(actionErrorMessage(error));
        setNotes([]);
        setInteractions([]);
        return;
      }
      setContact(contactResult.value.data);

      if (noteResult.status === "fulfilled") {
        setNotes(noteResult.value.data);
      } else {
        setNotes([]);
        const error = noteResult.reason;
        if (error instanceof CmiApiError && error.status === 401) {
          onSessionExpired();
          return;
        }
        setLoadError(actionErrorMessage(error));
      }

      if (interactionResult.status === "fulfilled") {
        setInteractions(interactionResult.value.data);
      } else {
        setInteractions([]);
        const error = interactionResult.reason;
        if (error instanceof CmiApiError && error.status === 401) {
          onSessionExpired();
          return;
        }
        setLoadError((previous) => previous || actionErrorMessage(error));
      }
    }).finally(() => {
      if (current) setLoading(false);
    });

    return () => { current = false; };
  }, [api, branchId, canReadNotes, initialContact.id, onSessionExpired, open, refreshKey]);

  const createNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = noteBody.trim();
    if (!canCreateNotes || !body || savingNote) return;
    setSavingNote(true);
    setActionError("");
    setNotice("");
    try {
      const result = await api.createContactNote(branchId, contact.id, { body });
      setNotes((current) => [result.data, ...current]);
      setNoteBody("");
      setNotice("Note saved.");
    } catch (error) {
      if (error instanceof CmiApiError && error.status === 401) onSessionExpired();
      setActionError(actionErrorMessage(error));
    } finally {
      setSavingNote(false);
    }
  };

  const createInteraction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRecordInteraction || savingInteraction) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const rawNextAction = String(form.get("next_action_at") ?? "");
    const nextActionDate = rawNextAction ? new Date(rawNextAction) : null;
    if (nextActionDate && Number.isNaN(nextActionDate.getTime())) {
      setActionError("Enter a valid next-action date and time.");
      return;
    }
    const input: ContactInteractionCreateInput = {
      interaction_type: String(form.get("interaction_type") ?? "call") as ContactInteractionCreateInput["interaction_type"],
      outcome_code: String(form.get("outcome_code") ?? "") || null,
      summary: String(form.get("summary") ?? "").trim() || null,
      next_action_at: nextActionDate ? nextActionDate.toISOString() : null,
    };
    setSavingInteraction(true);
    setActionError("");
    setNotice("");
    try {
      const result = await api.createContactInteraction(branchId, contact.id, input);
      setInteractions((current) => [result.data, ...current]);
      setShowInteractionForm(false);
      setNotice("Interaction recorded.");
      formElement.reset();
    } catch (error) {
      if (error instanceof CmiApiError && error.status === 401) onSessionExpired();
      setActionError(actionErrorMessage(error));
    } finally {
      setSavingInteraction(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmi-detail-overlay" />
        <Dialog.Content className="cmi-detail-dialog" aria-describedby="cmi-contact-detail-description">
          <header className="cmi-detail-header">
            <div className="cmi-detail-heading">
              <p className="cmi-eyebrow">CONTACT RECORD</p>
              <Dialog.Title className="cmi-detail-title">{displayContactName(contact)}</Dialog.Title>
              <Dialog.Description id="cmi-contact-detail-description">
                Contact details and ordinary follow-up history available within your current access scope.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="cmi-detail-close" aria-label="Close contact details"><X size={19} /></button>
            </Dialog.Close>
          </header>

          <div className="cmi-detail-scroll">
            {loadError && <div className="cmi-detail-alert" role="alert"><AlertCircle size={17} /><span>{loadError}</span></div>}
            {actionError && <div className="cmi-detail-alert" role="alert"><AlertCircle size={17} /><span>{actionError}</span><button type="button" onClick={() => setActionError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
            {notice && <div className="cmi-detail-notice" role="status"><Check size={16} /><span>{notice}</span></div>}

            <section className="cmi-detail-section">
              <div className="cmi-detail-section-heading">
                <div><p className="cmi-eyebrow">PROFILE</p><h3>Contact information</h3></div>
                <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
              {loading ? <p className="cmi-detail-muted" role="status">Loading the latest authorised contact record…</p> : (
                <dl className="cmi-detail-facts">
                  <div><dt>Preferred name</dt><dd>{contact.preferred_name || "Not recorded"}</dd></div>
                  <div><dt>Last name</dt><dd>{contact.last_name || "Not recorded"}</dd></div>
                  <div><dt>Age range</dt><dd>{contact.age_range || "Not recorded"}</dd></div>
                  <div><dt>Preferred language</dt><dd>{contact.preferred_language || "Not recorded"}</dd></div>
                  <div><dt>Status</dt><dd><span className="cmi-detail-status">{contact.contact_status.replaceAll("_", " ")}</span></dd></div>
                  <div><dt>Phone</dt><dd>{identityVisible ? (contact.phone_display || contact.phone_e164 || "Not recorded") : "Restricted"}</dd></div>
                  <div><dt>Email</dt><dd>{identityVisible ? (contact.email_normalized || "Not recorded") : "Restricted"}</dd></div>
                </dl>
              )}
              {!identityVisible && <p className="cmi-detail-privacy"><ShieldCheck size={14} />Phone and email are hidden because this account does not have identity-read permission.</p>}
            </section>

            <section className="cmi-detail-section">
              <div className="cmi-detail-section-heading">
                <div><p className="cmi-eyebrow">CONTACT HISTORY</p><h3>Notes</h3></div>
                {canReadNotes && <span className="cmi-detail-count">{notes.length}</span>}
              </div>
              {canCreateNotes && <form className="cmi-detail-form" onSubmit={createNote}>
                <label htmlFor="cmi-contact-note">Add an ordinary follow-up note</label>
                <textarea id="cmi-contact-note" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={4000} rows={3} placeholder="Record a practical follow-up detail…" />
                <div className="cmi-detail-form-footer">
                  <small>Do not include prayer requests, pastoral care details, credentials or other sensitive information.</small>
                  <button type="submit" className="cmi-button cmi-button-primary" disabled={!noteBody.trim() || savingNote}>
                    <Plus size={14} />{savingNote ? "Saving…" : "Save note"}
                  </button>
                </div>
              </form>}
              {canReadNotes ? (
                <div className="cmi-detail-timeline">
                  {notes.map((note) => <article className="cmi-detail-timeline-item" key={note.id}>
                    <div className="cmi-detail-timeline-icon"><MessageSquareText size={15} /></div>
                    <div><p>{note.body}</p><time dateTime={note.created_at}>{formatDate(note.created_at, timeZone)}</time></div>
                  </article>)}
                  {!loading && notes.length === 0 && <p className="cmi-detail-muted">No ordinary follow-up notes have been recorded yet.</p>}
                </div>
              ) : (
                <p className="cmi-detail-muted">Note history is not included in this account's permissions.</p>
              )}
            </section>

            <section className="cmi-detail-section">
              <div className="cmi-detail-section-heading">
                <div><p className="cmi-eyebrow">RECENT ACTIVITY</p><h3>Calls and visits</h3></div>
                {canRecordInteraction && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setShowInteractionForm((value) => !value)}>
                  <Plus size={14} /> Record interaction
                </button>}
              </div>
              {showInteractionForm && canRecordInteraction && <form className="cmi-detail-form" onSubmit={createInteraction}>
                <div className="cmi-detail-form-grid">
                  <label>Type<select name="interaction_type" defaultValue="call"><option value="call">Call</option><option value="visit">Visit</option><option value="message">Message</option><option value="meeting">Meeting</option><option value="other">Other</option></select></label>
                  <label>Outcome<select name="outcome_code" defaultValue=""><option value="">Not specified</option><option value="answered">Answered</option><option value="no_answer">No answer</option><option value="follow_up_required">Follow-up required</option><option value="visit_completed">Visit completed</option><option value="not_interested">Not interested</option></select></label>
                  <label className="cmi-detail-form-wide">Next action date <span>Optional</span><input type="datetime-local" name="next_action_at" /></label>
                  <label className="cmi-detail-form-wide">Summary <span>Ordinary operational details only</span><textarea name="summary" rows={3} maxLength={1000} placeholder="What happened and what is the next practical step?" /></label>
                </div>
                <div className="cmi-detail-form-footer">
                  <small>Interaction records are visible only with the contact's authorised history.</small>
                  <div className="cmi-detail-form-actions">
                    <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setShowInteractionForm(false)}>Cancel</button>
                    <button type="submit" className="cmi-button cmi-button-primary" disabled={savingInteraction}>{savingInteraction ? "Saving…" : "Record activity"}</button>
                  </div>
                </div>
              </form>}
              <div className="cmi-detail-timeline">
                {interactions.map((interaction) => <article className="cmi-detail-timeline-item" key={interaction.id}>
                  <div className="cmi-detail-timeline-icon"><Phone size={15} /></div>
                  <div>
                    <strong>{interactionLabel(interaction.interaction_type)}{interaction.outcome_code ? ` · ${interaction.outcome_code.replaceAll("_", " ")}` : ""}</strong>
                    {interaction.summary && <p>{interaction.summary}</p>}
                    <time dateTime={interaction.occurred_at}>{formatDate(interaction.occurred_at, timeZone)}</time>
                    {interaction.next_action_at && <small className="cmi-detail-next-action"><CalendarClock size={13} /> Next action {formatDate(interaction.next_action_at, timeZone)}</small>}
                  </div>
                </article>)}
                {!loading && interactions.length === 0 && <p className="cmi-detail-muted">No calls, visits or other interactions have been recorded yet.</p>}
              </div>
            </section>
          </div>
          <footer className="cmi-detail-footer"><span><Clock3 size={14} /> Times shown in {timeZone}</span><Dialog.Close asChild><button type="button" className="cmi-button cmi-button-secondary">Close record</button></Dialog.Close></footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
