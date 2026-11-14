import { useCallback, useEffect, useState } from "react";
import { Eye, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import {
  CmiApiError,
  type CmiApiClient,
  type CareRecordMetadata,
  type CareRecordDetail,
} from "../lib/cmi-api";

interface Props { api: CmiApiClient; branchId: string; branchName: string; timeZone: string; onSessionExpired: () => void }
const OVERSIGHT_REASONS = [
  ["pastoral_review", "Pastoral review"],
  ["continuity_of_care", "Continuity of care"],
  ["safeguarding_concern", "Safeguarding concern"],
  ["complaint_review", "Complaint review"],
  ["administrative_review", "Administrative review"],
] as const;
function formatDate(value: string, timeZone: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}
function statusLabel(value: string): string { return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function errorMessage(error: unknown): string {
  if (error instanceof CmiApiError && error.status === 403) return "Your current role does not have access to these care records.";
  if (error instanceof CmiApiError && error.status === 401) return "Your session has expired. Sign in again.";
  return error instanceof Error ? error.message : "Pastoral-care records could not be loaded. Try again.";
}
export function CareWorkspace({ api, branchId, branchName, timeZone, onSessionExpired }: Props) {
  const [records, setRecords] = useState<CareRecordMetadata[]>([]);
  const [accessMode, setAccessMode] = useState<"assigned" | "oversight">("assigned");
  const [selected, setSelected] = useState<CareRecordDetail | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true); setError("");
    try {
      const result = await api.listCareRecords(branchId, 50, 0);
      setRecords(result.data.data);
      setAccessMode(result.data.access_mode);
      setSelected(null);
    } catch (cause) { if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired(); else setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [api, branchId, onSessionExpired]);
  useEffect(() => { void load(); }, [load]);
  const openRecord = async (id: string) => {
    if (reading) return;
    if (accessMode === "oversight" && !reason) {
      setError("Select an oversight reason before opening this restricted care record.");
      return;
    }
    setReading(true); setError("");
    try {
      const result = await api.readCareRecord(branchId, id, accessMode, accessMode === "oversight" ? reason : undefined);
      setSelected(result.data);
    } catch (cause) { if (cause instanceof CmiApiError && cause.status === 401) onSessionExpired(); else setError(errorMessage(cause)); }
    finally { setReading(false); }
  };
  return (
    <section className="cmi-panel cmi-prayer-workspace">
      <div className="cmi-panel-heading">
        <div><p className="cmi-eyebrow">RESTRICTED MINISTRY</p><h3>Pastoral Care</h3><p>Assigned care records for {branchName}. Restricted interactions open individually and each read is audited.</p></div>
        <button className="cmi-button cmi-button-secondary" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh pastoral care records"><RefreshCw size={16} />Refresh</button>
      </div>
      <div className="cmi-scope-note"><LockKeyhole size={15} />{accessMode === "assigned" ? "You can see care records actively assigned to you. Restricted notes are not included in this list." : "You have pastoral oversight access. Select a reason before opening restricted interactions."}</div>
      {accessMode === "oversight" && <label className="cmi-prayer-reason">Oversight reason<select value={reason} onChange={(event) => setReason(event.target.value)}><option value="" disabled>Select an oversight reason</option>{OVERSIGHT_REASONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {error && <p className="cmi-inline-error" role="alert">{error}</p>}
      {loading ? <div className="cmi-empty-state">Loading care records…</div> : records.length === 0 ? <div className="cmi-empty-state"><ShieldCheck size={24}/><h3>No care records to show</h3><p>{accessMode === "assigned" ? "There are no active care records assigned to you." : "No care records have been recorded for this branch."}</p></div> : <div className="cmi-task-list">{records.map((record) => <article className="cmi-task-row" key={record.id}><div className="cmi-task-symbol"><LockKeyhole size={18}/></div><div className="cmi-task-copy"><strong>Pastoral care record</strong><span>{statusLabel(record.status)} · Opened {formatDate(record.created_at, timeZone)}</span></div><button className="cmi-button cmi-button-secondary" type="button" onClick={() => void openRecord(record.id)} disabled={reading}><Eye size={15}/>{reading ? "Opening…" : "Open securely"}</button></article>)}</div>}
      {selected && <section className="cmi-prayer-detail" aria-live="polite"><div className="cmi-panel-heading"><div><p className="cmi-eyebrow">AUDITED RECORD VIEW</p><h3>Pastoral care details</h3><p>{statusLabel(selected.record.status)} · Updated {formatDate(selected.record.updated_at, timeZone)}</p></div><button className="cmi-button cmi-button-secondary" type="button" onClick={() => setSelected(null)}>Close</button></div>{selected.interactions.length === 0 ? <p className="cmi-empty-state">No recorded interactions.</p> : <div className="cmi-task-list">{selected.interactions.map((interaction) => <article className="cmi-task-row" key={interaction.id}><div className="cmi-task-copy"><strong>{statusLabel(interaction.interaction_type)}{interaction.outcome_code ? " · " + statusLabel(interaction.outcome_code) : ""}</strong><span>{formatDate(interaction.occurred_at, timeZone)}</span>{interaction.restricted_note && <p className="cmi-prayer-narrative">{interaction.restricted_note}</p>}</div></article>)}</div>}<p className="cmi-scope-note"><LockKeyhole size={14}/>Restricted notes remain outside general contact history, reports and notifications.</p></section>}
    </section>
  );
}
