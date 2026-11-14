import { useCallback, useEffect, useState } from "react";
import { Eye, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import {
  CmiApiError,
  type CmiApiClient,
  type PrayerRequestMetadata,
} from "../lib/cmi-api";

interface PrayerRequestRecord {
  id: string;
  branch_id: string;
  request_text: string;
  status: string;
  sensitivity: string;
  expires_at: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PrayerReadResponse {
  request: PrayerRequestRecord;
}

interface PrayerRoomWorkspaceProps {
  api: CmiApiClient;
  branchId: string;
  branchName: string;
}

const OVERSIGHT_REASONS = [
  ["pastoral_review", "Pastoral review"],
  ["continuity_of_care", "Continuity of care"],
  ["safeguarding_concern", "Safeguarding concern"],
  ["complaint_review", "Complaint review"],
  ["administrative_review", "Administrative review"],
] as const;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
}

function errorMessage(error: unknown): string {
  if (error instanceof CmiApiError) {
    if (error.status === 403) {
      return "Your current role does not have access to these prayer requests.";
    }
    if (error.status === 401) return "Your session has expired. Sign in again.";
    return error.message;
  }
  return "Prayer requests could not be loaded. Try again.";
}

export function PrayerRoomWorkspace({
  api,
  branchId,
  branchName,
}: PrayerRoomWorkspaceProps) {
  const [requests, setRequests] = useState<PrayerRequestMetadata[]>([]);
  const [accessMode, setAccessMode] = useState<"assigned" | "oversight">(
    "assigned",
  );
  const [selected, setSelected] = useState<PrayerRequestRecord | null>(null);
  const [reason, setReason] = useState<string>(OVERSIGHT_REASONS[0][0]);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.listPrayerRequests(branchId, 50, 0);
      setRequests(result.data);
      setAccessMode(result.access_mode);
      setSelected(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api, branchId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const openRequest = async (requestId: string) => {
    if (reading) return;
    setReading(true);
    setError("");
    try {
      const result = await api.readPrayerRequest(
        branchId,
        requestId,
        accessMode,
        accessMode === "oversight" ? reason : undefined,
      ) as PrayerReadResponse;
      setSelected(result.request);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setReading(false);
    }
  };

  return (
    <section className="cmi-panel cmi-prayer-workspace">
      <div className="cmi-panel-heading">
        <div>
          <p className="cmi-eyebrow">RESTRICTED MINISTRY</p>
          <h3>Prayer Room</h3>
          <p>
            Prayer requests for {branchName}. Sensitive prayer narratives are
            opened individually and every read is audited.
          </p>
        </div>
        <button
          className="cmi-button cmi-button-secondary"
          type="button"
          onClick={() => void loadRequests()}
          disabled={loading}
          aria-label="Refresh prayer requests"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="cmi-scope-note">
        <LockKeyhole size={15} />
        {accessMode === "assigned"
          ? "You can see requests actively assigned to you. Narratives are not included in this list."
          : "You have pastoral oversight access. Select a reason before opening a restricted narrative."}
      </div>

      {accessMode === "oversight" && (
        <label className="cmi-prayer-reason">
          Oversight reason
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            {OVERSIGHT_REASONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="cmi-inline-error" role="alert">{error}</p>}

      {loading
        ? <div className="cmi-empty-state">Loading prayer requests…</div>
        : requests.length === 0
        ? (
          <div className="cmi-empty-state">
            <ShieldCheck size={24} />
            <h3>No prayer requests to show</h3>
            <p>
              {accessMode === "assigned"
                ? "There are no active prayer requests assigned to you."
                : "No prayer requests have been recorded for this branch."}
            </p>
          </div>
        )
        : (
          <div className="cmi-task-list">
            {requests.map((request) => (
              <article className="cmi-task-row" key={request.id}>
                <div className="cmi-task-symbol">
                  <LockKeyhole size={18} />
                </div>
                <div className="cmi-task-copy">
                  <strong>Prayer request</strong>
                  <span>
                    {request.status.replaceAll("_", " ")} · Received{" "}
                    {formatDate(request.created_at)}
                  </span>
                  {request.expires_at && (
                    <small>Expires {formatDate(request.expires_at)}</small>
                  )}
                </div>
                <button
                  className="cmi-button cmi-button-secondary"
                  type="button"
                  onClick={() => void openRequest(request.id)}
                  disabled={reading}
                >
                  <Eye size={15} />
                  {reading ? "Opening…" : "Open securely"}
                </button>
              </article>
            ))}
          </div>
        )}

      {selected && (
        <section className="cmi-prayer-detail" aria-live="polite">
          <div className="cmi-panel-heading">
            <div>
              <p className="cmi-eyebrow">AUDITED RECORD VIEW</p>
              <h3>Prayer request details</h3>
              <p>Opened {formatDate(selected.updated_at)} · {selected.status}</p>
            </div>
            <button
              className="cmi-button cmi-button-secondary"
              type="button"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <p className="cmi-prayer-narrative">{selected.request_text}</p>
          <p className="cmi-scope-note">
            <LockKeyhole size={14} />
            This restricted narrative is not copied into general contact
            history, reports, or notifications.
          </p>
        </section>
      )}
    </section>
  );
}
