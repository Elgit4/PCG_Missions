import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, RefreshCw, RotateCcw, X } from "lucide-react";
import {
  CmiApiClient,
  CmiApiError,
  type EventCloseoutWorkspace,
  type EventDraftRecord,
} from "../lib/cmi-api";
import { formatBranchDate } from "../lib/branch-time";
import { formatApplicationError } from "../lib/error-messages";

interface EventCloseoutPanelProps {
  api: CmiApiClient;
  branchId: string;
  timeZone: string;
  event: EventDraftRecord;
  currentStaffId: string;
  canSubmit: boolean;
  canReview: boolean;
  onClose: () => void;
  onSessionExpired: () => void;
}

function createRequestKey(): string {
  return crypto.randomUUID();
}

export function EventCloseoutPanel({
  api,
  branchId,
  timeZone,
  event,
  currentStaffId,
  canSubmit,
  canReview,
  onClose,
  onSessionExpired,
}: EventCloseoutPanelProps) {
  const [workspace, setWorkspace] = useState<EventCloseoutWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summaryNotes, setSummaryNotes] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"approved" | "returned">("approved");
  const [submitKey, setSubmitKey] = useState(createRequestKey);
  const [reviewKey, setReviewKey] = useState(createRequestKey);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getEventCloseout(branchId, event.id);
      setWorkspace(result.data);
      setSummaryNotes(result.data.closeout?.summary_notes ?? "");
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

  const closeout = workspace?.closeout ?? null;
  const canSubmitNow = canSubmit &&
    Date.parse(event.ends_at) <= Date.now() &&
    (!closeout || closeout.status === "returned");
  const canReviewNow = canReview &&
    closeout?.status === "submitted" &&
    closeout.submitted_by !== currentStaffId;

  const submit = async () => {
    if (!canSubmitNow || saving || !workspace) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api.submitEventCloseout(branchId, event.id, {
        idempotency_key: submitKey,
        summary_notes: summaryNotes.trim() || null,
      });
      setNotice(result.data.replayed
        ? "This closeout submission was already recorded."
        : "Event closeout submitted. An independent authorised reviewer must review it.");
      setSubmitKey(createRequestKey());
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

  const review = async () => {
    if (!canReviewNow || saving || !workspace) return;
    if (reviewDecision === "returned" && reviewReason.trim().length < 2) {
      setError("Add a reason of at least 2 characters before returning this closeout.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api.reviewEventCloseout(branchId, event.id, {
        idempotency_key: reviewKey,
        decision: reviewDecision,
        reason: reviewReason.trim() || null,
      });
      setNotice(result.data.replayed
        ? "This closeout decision was already recorded."
        : reviewDecision === "approved"
        ? "Event closeout approved."
        : "Event closeout returned with the review reason.");
      setReviewKey(createRequestKey());
      setReviewReason("");
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

  return (
    <section className="cmi-panel cmi-event-closeout-panel" aria-label={"Closeout for " + event.title}>
      <div className="cmi-panel-heading">
        <div>
          <p className="cmi-eyebrow">EVENT RECONCILIATION</p>
          <h4>Closeout · {event.title}</h4>
          <p>Attendance totals come from the event registration and check-in records. Transport is not included.</p>
        </div>
        <div className="cmi-operations-actions">
          <button className="cmi-button cmi-button-secondary" type="button" onClick={() => void load()} disabled={loading || saving}>
            <RefreshCw size={15} />Refresh
          </button>
          <button className="cmi-button cmi-button-secondary" type="button" onClick={onClose} aria-label="Close event closeout">
            <X size={15} />Close
          </button>
        </div>
      </div>

      {error && <div className="cmi-alert" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="cmi-success-note" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

      {loading ? <div className="cmi-loading" role="status">Loading event closeout…</div> : (
        <>
          <div className="cmi-registration-summary">
            <span><strong>{closeout?.registration_count ?? "—"}</strong> active registrations</span>
            <span><strong>{closeout?.attendee_count ?? "—"}</strong> checked in</span>
            <span className={closeout?.status === "approved" ? "is-open" : "is-closed"}>
              {closeout ? closeout.status.replaceAll("_", " ") : "Not submitted"}
            </span>
          </div>

          {closeout?.submitted_at && (
            <p className="cmi-scope-note">Submitted {formatBranchDate(closeout.submitted_at, timeZone)}</p>
          )}
          {closeout?.reviewed_at && (
            <p className="cmi-scope-note">Reviewed {formatBranchDate(closeout.reviewed_at, timeZone)}</p>
          )}
          {closeout?.summary_notes && (
            <div className="cmi-detail-card">
              <strong>Submission notes</strong>
              <p>{closeout.summary_notes}</p>
            </div>
          )}

          {canSubmitNow && (
            <div className="cmi-form-grid cmi-operations-form">
              <label className="cmi-field-wide">Closeout notes <span className="cmi-field-optional">Optional · Maximum 4,000 characters</span>
                <textarea value={summaryNotes} onChange={(change) => { setSummaryNotes(change.currentTarget.value); setSubmitKey(createRequestKey()); }} maxLength={4000} rows={4} placeholder="Summarise the event outcome, attendance observations and follow-up actions." />
              </label>
              <div className="cmi-form-actions cmi-field-wide">
                <span className="cmi-scope-note">Submitting finalises the event and records a reconciliation snapshot. A different authorised Admin/Pastor must review it.</span>
                <button type="button" className="cmi-button cmi-button-primary" onClick={() => void submit()} disabled={saving || loading}>
                  <ClipboardCheck size={15} />{saving ? "Submitting…" : "Submit closeout"}
                </button>
              </div>
            </div>
          )}

          {closeout?.status === "submitted" && closeout.submitted_by === currentStaffId && (
            <p className="cmi-scope-note">You submitted this closeout. Independent review is required, and you cannot approve or return your own submission.</p>
          )}

          {canReviewNow && (
            <div className="cmi-form-grid cmi-operations-form">
              <label>Review decision
                <select value={reviewDecision} onChange={(change) => { setReviewDecision(change.currentTarget.value as "approved" | "returned"); setReviewKey(createRequestKey()); }}>
                  <option value="approved">Approve closeout</option>
                  <option value="returned">Return for correction</option>
                </select>
              </label>
              <label className="cmi-field-wide">Review reason {reviewDecision === "returned" ? <span className="cmi-field-optional">Required</span> : <span className="cmi-field-optional">Optional</span>}
                <textarea value={reviewReason} onChange={(change) => { setReviewReason(change.currentTarget.value); setReviewKey(createRequestKey()); }} maxLength={2000} rows={3} placeholder={reviewDecision === "returned" ? "Explain what must be corrected before resubmission." : "Add an optional review note."} />
              </label>
              <div className="cmi-form-actions cmi-field-wide">
                <span className="cmi-scope-note">Your decision is recorded in the event closeout history.</span>
                <button type="button" className="cmi-button cmi-button-primary" onClick={() => void review()} disabled={saving || loading || (reviewDecision === "returned" && reviewReason.trim().length < 2)}>
                  {reviewDecision === "approved" ? <CheckCircle2 size={15} /> : <RotateCcw size={15} />}
                  {saving ? "Recording…" : reviewDecision === "approved" ? "Approve closeout" : "Return closeout"}
                </button>
              </div>
            </div>
          )}

          {!canSubmitNow && !canReviewNow && closeout?.status !== "approved" && (
            <p className="cmi-detail-muted">
              {closeout?.status === "submitted"
                ? "This closeout is awaiting review by a different authorised reviewer."
                : "Your account does not have an available closeout action for this event."}
            </p>
          )}

          {closeout?.status === "approved" && (
            <div className="cmi-success-note" role="status"><CheckCircle2 size={16} /> Closeout approved and event reconciled.</div>
          )}

          {!!workspace.history.length && (
            <div className="cmi-registration-list-heading">
              <h5>Closeout history</h5>
            </div>
          )}
          {!!workspace.history.length && (
            <div className="cmi-task-list cmi-operations-list">
              {workspace.history.map((item) => (
                <article className="cmi-task-row" key={item.id}>
                  <div className="cmi-task-symbol"><ClipboardCheck size={17} /></div>
                  <div className="cmi-task-copy">
                    <strong>{item.action.replaceAll("_", " ")}</strong>
                    <p>{formatBranchDate(item.created_at, timeZone)}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
