import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw, UserPlus, Users, XCircle } from "lucide-react";
import {
  CmiApiClient,
  CmiApiError,
  type EventDraftRecord,
  type EventRegistrationRecord,
} from "../lib/cmi-api";
import { formatBranchDate } from "../lib/branch-time";
import { formatApplicationError } from "../lib/error-messages";

interface EventRegistrationsPanelProps {
  api: CmiApiClient;
  branchId: string;
  timeZone: string;
  event: EventDraftRecord;
  onClose: () => void;
  onSessionExpired: () => void;
}

function createRequestKey(): string {
  return crypto.randomUUID();
}

export function EventRegistrationsPanel({
  api,
  branchId,
  timeZone,
  event,
  onClose,
  onSessionExpired,
}: EventRegistrationsPanelProps) {
  const [registrations, setRegistrations] = useState<EventRegistrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeePhone, setAttendeePhone] = useState("");
  const [requestKey, setRequestKey] = useState(createRequestKey);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.listEventRegistrations(branchId, event.id);
      setRegistrations(result.data);
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(formatApplicationError(cause));
      }
    } finally {
      setLoading(false);
    }
  }, [api, branchId, event.id, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api.registerEventAttendee(branchId, event.id, {
        idempotency_key: requestKey,
        attendee_name: attendeeName.trim(),
        attendee_phone: attendeePhone.trim() || null,
      });
      setNotice(result.data.replayed
        ? "This registration was already recorded. No duplicate was created."
        : "Attendee registered successfully.");
      setAttendeeName("");
      setAttendeePhone("");
      setRequestKey(createRequestKey());
      await load();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(formatApplicationError(cause));
      }
    } finally {
      setSaving(false);
    }
  };


  const cancel = async (registration: EventRegistrationRecord) => {
    if (saving || cancellingId) return;
    if (!window.confirm(
      "Cancel the registration for " + registration.attendee_name_snapshot +
      "? This releases one event capacity slot. A checked-in attendee cannot be cancelled.",
    )) return;

    setCancellingId(registration.id);
    setError("");
    setNotice("");
    try {
      const result = await api.cancelEventRegistration(
        branchId,
        event.id,
        registration.id,
        createRequestKey(),
      );
      setNotice(result.data.replayed
        ? "The cancellation was already recorded."
        : "Registration cancelled and capacity released.");
      await load();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(formatApplicationError(cause));
      }
    } finally {
      setCancellingId(null);
    }
  };

  const activeCount = registrations.filter((item) => item.status !== "cancelled").length;
  const remaining = event.capacity === null
    ? null
    : Math.max(0, event.capacity - activeCount);
  const canRegister = event.status === "published" &&
    event.visibility === "staff" &&
    event.registration_state === "open";

  return (
    <section className="cmi-panel cmi-event-registration-panel" aria-label={"Registrations for " + event.title}>
      <div className="cmi-panel-heading">
        <div>
          <p className="cmi-eyebrow">STAFF-ONLY REGISTRATION</p>
          <h4>Attendees · {event.title}</h4>
          <p>Staff-assisted registration only. No public intake, automatic contact creation or contact-directory lookup is enabled.</p>
        </div>
        <div className="cmi-operations-actions">
          <button className="cmi-button cmi-button-secondary" type="button" onClick={() => void load()} disabled={loading || saving}>
            <RefreshCw size={15} />Refresh
          </button>
          <button className="cmi-button cmi-button-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>

      {error && <div className="cmi-alert" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="cmi-success-note" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

      <div className="cmi-registration-summary">
        <span><strong>{activeCount}</strong> active registrations</span>
        <span>{event.capacity === null ? "Finite capacity not configured" : `${remaining} of ${event.capacity} places remaining`}</span>
        <span className={canRegister ? "is-open" : "is-closed"}>{canRegister ? "Registration open" : "Registration closed"}</span>
      </div>

      {canRegister && (
        <form className="cmi-form-grid cmi-operations-form" onSubmit={(eventForm) => void submit(eventForm)}>
          <label>Attendee full name
            <input value={attendeeName} onChange={(change) => { setAttendeeName(change.currentTarget.value); setRequestKey(createRequestKey()); }} minLength={2} maxLength={180} required placeholder="Enter attendee name" />
          </label>
          <label>Phone number <span className="cmi-field-optional">Optional · International format</span>
            <input value={attendeePhone} onChange={(change) => { setAttendeePhone(change.currentTarget.value); setRequestKey(createRequestKey()); }} type="tel" maxLength={16} placeholder="+233..." />
          </label>
          <div className="cmi-form-actions cmi-field-wide">
            <span className="cmi-scope-note">Only the name and optional phone snapshot are saved. The record is not automatically linked to a CRM contact.</span>
            <button type="submit" className="cmi-button cmi-button-primary" disabled={saving || loading || attendeeName.trim().length < 2 || remaining === 0}>
              <UserPlus size={15} />{saving ? "Registering…" : "Register attendee"}
            </button>
          </div>
        </form>
      )}

      <div className="cmi-registration-list-heading">
        <h5><Users size={16} /> Registration list</h5>
        <span>Latest 100 records · Times in {timeZone}</span>
      </div>
      {loading ? <div className="cmi-loading" role="status">Loading registrations…</div> : (
        <div className="cmi-task-list cmi-operations-list">
          {registrations.map((item) => (
            <article className="cmi-task-row" key={item.id}>
              <div className="cmi-task-symbol"><Users size={17} /></div>
              <div className="cmi-task-copy">
                <strong>{item.attendee_name_snapshot}</strong>
                <p>Registered {formatBranchDate(item.registered_at, timeZone)}</p>
              </div>
              <span className={"cmi-task-status " + (item.status === "registered" ? "status-open" : "status-muted")}>
                {item.status.replaceAll("_", " ")}
              </span>
              {item.status === "registered" && Date.parse(event.starts_at) > Date.now() && (
                <button
                  className="cmi-button cmi-button-secondary"
                  type="button"
                  onClick={() => void cancel(item)}
                  disabled={saving || cancellingId !== null || loading}
                  aria-label={"Cancel registration for " + item.attendee_name_snapshot}
                >
                  <XCircle size={14} />{cancellingId === item.id ? "Cancelling…" : "Cancel"}
                </button>
              )}
            </article>
          ))}
          {!registrations.length && <p className="cmi-detail-muted">No registrations have been recorded for this event.</p>}
        </div>
      )}
    </section>
  );
}
