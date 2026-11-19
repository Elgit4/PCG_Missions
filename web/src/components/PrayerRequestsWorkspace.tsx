import { useCallback, useEffect, useState } from "react";
import { HeartHandshake, RefreshCw, ShieldCheck } from "lucide-react";
import {
  CmiApiClient,
  CmiApiError,
  type AssignedPrayerRequestRecord,
} from "../lib/cmi-api";
import { formatApplicationError } from "../lib/error-messages";

interface PrayerRequestsWorkspaceProps {
  api: CmiApiClient;
  branchId: string;
  branchName: string;
  timeZone: string;
  onSessionExpired: () => void;
}

function formatPrayerDate(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

function labelStatus(status: AssignedPrayerRequestRecord["status"]): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (part) => part.toUpperCase());
}

export function PrayerRequestsWorkspace({
  api,
  branchId,
  branchName,
  timeZone,
  onSessionExpired,
}: PrayerRequestsWorkspaceProps) {
  const [requests, setRequests] = useState<AssignedPrayerRequestRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const pageSize = 25;
  const load = useCallback(async (nextOffset = offset) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.listAssignedPrayerRequests(branchId, {
        limit: pageSize,
        offset: nextOffset,
      });
      setRequests(result.data.requests);
      setTotal(result.data.total);
      setOffset(result.data.offset);
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(formatApplicationError(cause));
      }
    } finally {
      setLoading(false);
    }
  }, [api, branchId, offset, onSessionExpired]);

  useEffect(() => {
    void load(0);
  }, [branchId, load]);

  return (
    <div className="cmi-prayer-workspace">
      <section className="cmi-panel">
        <div className="cmi-panel-heading cmi-prayer-heading">
          <div>
            <p className="cmi-eyebrow">ASSIGNED PRAYER SUPPORT</p>
            <h3>Prayer requests</h3>
            <p>Read prayer requests that are currently assigned to you in <strong>{branchName}</strong>.</p>
            <div className="cmi-prayer-privacy-note">
              <ShieldCheck size={15} />
              <span>Restricted access · Contact identity is not included · Read-only</span>
            </div>
          </div>
          <button
            className="cmi-button cmi-button-secondary"
            type="button"
            onClick={() => void load(offset)}
            disabled={loading}
          >
            <RefreshCw size={15} />Refresh
          </button>
        </div>

        {error && <div className="cmi-alert" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}

        <div className="cmi-prayer-summary">
          <span><strong>{total}</strong> assigned {total === 1 ? "request" : "requests"}</span>
          <span>Times shown in {timeZone}</span>
        </div>

        {loading ? (
          <div className="cmi-loading" role="status">Loading assigned prayer requests…</div>
        ) : requests.length ? (
          <div className="cmi-prayer-list">
            {requests.map((request) => (
              <article className="cmi-prayer-card" key={request.id}>
                <div className="cmi-prayer-card-heading">
                  <span className={"cmi-prayer-status status-" + request.status.replaceAll("_", "-")}>
                    {labelStatus(request.status)}
                  </span>
                  <span>{formatPrayerDate(request.created_at, timeZone)}</span>
                </div>
                <p className="cmi-prayer-narrative">{request.request_text}</p>
                <div className="cmi-prayer-card-footer">
                  <span>{request.sensitivity === "highly_restricted" ? "Highly restricted" : "Restricted"}</span>
                  {request.expires_at && <span>Available until {formatPrayerDate(request.expires_at, timeZone)}</span>}
                  {request.answered_at && <span>Answered {formatPrayerDate(request.answered_at, timeZone)}</span>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="cmi-prayer-empty">
            <div><HeartHandshake size={24} /></div>
            <strong>No active prayer assignments</strong>
            <p>Prayer requests assigned to your account will appear here. This page does not search unassigned requests or show linked contact details.</p>
          </div>
        )}

        {!loading && total > pageSize && (
          <div className="cmi-prayer-pagination">
            <span>Showing {offset + 1}–{Math.min(offset + requests.length, total)} of {total}</span>
            <div>
              <button type="button" className="cmi-button cmi-button-secondary" disabled={offset === 0 || loading} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</button>
              <button type="button" className="cmi-button cmi-button-secondary" disabled={offset + pageSize >= total || loading} onClick={() => void load(offset + pageSize)}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
