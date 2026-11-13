import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, FilePlus2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { CmiApiClient, CmiApiError, type MinistryReportCreateInput, type MinistryReportRecord, type MinistryReportType, type StaffSession } from "../lib/cmi-api";
import { hasCapability } from "../lib/capabilities";

interface Props { branchId: string; branchName: string; api: CmiApiClient; session: StaffSession }
const COUNT_FIELDS = [
  ["contacts_captured", "Contacts captured"],
  ["gospel_presentations", "Gospel presentations"],
  ["decisions_for_christ", "Decisions for Christ"],
  ["followup_required", "Follow-ups required"],
  ["followup_completed", "Follow-ups completed"],
  ["visits_completed", "Visits completed"],
  ["calls_completed", "Calls completed"],
  ["events_supported", "Events supported"],
  ["attendance_count", "Attendance count"],
] as const;
type CountKey = typeof COUNT_FIELDS[number][0];

function errorMessage(error: unknown): string {
  if (error instanceof CmiApiError && error.status === 403) return "Your role does not have permission for this report action.";
  if (error instanceof CmiApiError && error.status === 409) return "This report has changed. Refresh the list and try again.";
  return "The report service could not complete this request. Try again.";
}
function reportTitle(type: MinistryReportType): string {
  if (type === "daily_evangelism") return "Daily evangelism";
  if (type === "event_evangelism") return "Event evangelism";
  return "Weekly ministry";
}
function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
}
function emptyCounts(): Record<CountKey, string> {
  return Object.fromEntries(COUNT_FIELDS.map(([key]) => [key, "0"])) as Record<CountKey, string>;
}

export function MinistryReportsWorkspace({ branchId, branchName, api, session }: Props) {
  const canSubmit = hasCapability(session, "report.submit.own", branchId);
  const canReview = hasCapability(session, "report.review.branch", branchId) || hasCapability(session, "report.review.team", branchId);
  const [reports, setReports] = useState<MinistryReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reportType, setReportType] = useState<MinistryReportType>("daily_evangelism");
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [teamId, setTeamId] = useState("");
  const [eventId, setEventId] = useState("");
  const [counts, setCounts] = useState<Record<CountKey, string>>(emptyCounts);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const result = await api.listMinistryReports(branchId, { limit: 50, offset: 0 });
      setReports(result.data);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, branchId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (reportType === "weekly_ministry") {
      const start = new Date(periodStart + "T00:00:00Z");
      if (!Number.isNaN(start.getTime())) {
        start.setUTCDate(start.getUTCDate() + 6);
        setPeriodEnd(start.toISOString().slice(0, 10));
      }
    } else {
      setPeriodEnd(periodStart);
    }
  }, [reportType, periodStart]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    setNotice("");
    const payload: MinistryReportCreateInput = {
      branch_id: branchId,
      report_type: reportType,
      period_start: periodStart,
      period_end: periodEnd,
      ...(teamId.trim() ? { team_id: teamId.trim() } : {}),
      ...(reportType === "event_evangelism" ? { event_id: eventId.trim() } : {}),
      ...Object.fromEntries(COUNT_FIELDS.map(([key]) => [key, Number(counts[key])])) as Record<CountKey, number>,
    };
    try {
      await api.createMinistryReport(payload);
      setNotice("Your report has been submitted for review.");
      setShowForm(false);
      setCounts(emptyCounts());
      setTeamId("");
      setEventId("");
      await load(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const review = async (report: MinistryReportRecord, decision: "approved" | "returned") => {
    if (!canReview || reviewingId !== report.id) return;
    setSaving(true);
    setError("");
    try {
      await api.reviewMinistryReport(report.id, { decision, comment: reviewComment.trim() || undefined });
      setNotice(decision === "approved" ? "Report approved." : "Report returned to its author.");
      setReviewingId(null);
      setReviewComment("");
      await load(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ministry-reports" aria-labelledby="ministry-reports-title">
      <header className="ministry-reports-header">
        <div>
          <p className="ministry-reports-eyebrow">MINISTRY ACCOUNTABILITY · {branchName.toUpperCase()}</p>
          <h2 id="ministry-reports-title">Ministry reports</h2>
          <p>Record ministry activity, follow progress and review submitted reports.</p>
        </div>
        <div className="ministry-reports-actions">
          <button type="button" className="cmi-button cmi-button-secondary" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "ministry-spin" : ""} /> Refresh
          </button>
          {canSubmit && <button type="button" className="cmi-button cmi-button-primary" onClick={() => setShowForm((value) => !value)}>
            <FilePlus2 size={16} /> {showForm ? "Close form" : "New report"}
          </button>}
        </div>
      </header>

      {error && <div className="ministry-report-alert" role="alert"><AlertCircle size={17} />{error}</div>}
      {notice && <div className="ministry-report-notice" role="status"><CheckCircle2 size={17} />{notice}</div>}

      {showForm && canSubmit && (
        <form className="ministry-report-form cmi-panel" onSubmit={(event) => void submit(event)}>
          <div className="ministry-report-form-heading">
            <div><span className="ministry-report-step">NEW SUBMISSION</span><h3>Submit ministry activity</h3></div>
            <p>Counts only. Do not enter names, phone numbers or pastoral narratives.</p>
          </div>
          <div className="ministry-report-form-grid">
            <label><span>Report type</span><select value={reportType} onChange={(event) => setReportType(event.target.value as MinistryReportType)}>
              <option value="daily_evangelism">Daily evangelism</option>
              <option value="event_evangelism">Event evangelism</option>
              <option value="weekly_ministry">Weekly ministry</option>
            </select></label>
            <label><span>Period starts</span><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /></label>
            <label><span>Period ends</span><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required readOnly={reportType !== "weekly_ministry"} /></label>
            <label><span>Team ID <small>(optional)</small></span><input value={teamId} onChange={(event) => setTeamId(event.target.value)} placeholder="Paste your active team ID" /></label>
            {reportType === "event_evangelism" && <label className="ministry-report-wide"><span>Event ID (required)</span><input value={eventId} onChange={(event) => setEventId(event.target.value)} placeholder="Paste the event ID" required /></label>}
          </div>
          <div className="ministry-report-count-grid">
            {COUNT_FIELDS.map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min="0" max="100000" step="1" value={counts[key]} onChange={(event) => setCounts((current) => ({ ...current, [key]: event.target.value }))} required /></label>)}
          </div>
          <div className="ministry-report-form-footer">
            <span>Submitted reports cannot be edited. A reviewer may return one for correction.</span>
            <button type="submit" className="cmi-button cmi-button-primary" disabled={saving}><Send size={16} />{saving ? "Submitting…" : "Submit report"}</button>
          </div>
        </form>
      )}

      <div className="ministry-report-list-heading">
        <div><h3>Submitted reports</h3><span>{reports.length} loaded</span></div>
        <span className="ministry-report-scope"><ShieldCheck size={14} /> Access limited by your role</span>
      </div>

      {loading ? <div className="ministry-report-loading" role="status">Loading ministry reports…</div>
        : reports.length === 0 ? <div className="cmi-panel ministry-report-empty"><ClipboardCheck size={26} /><h3>No reports to show yet</h3><p>Submitted reports will appear here according to your access.</p></div>
        : <div className="ministry-report-cards">
          {reports.map((report) => {
            const own = report.author_profile_id === session.staff.id;
            const canAct = canReview && !own && report.status === "submitted";
            return <article className="ministry-report-card" key={report.id}>
              <div className="ministry-report-card-top">
                <div><span className="ministry-report-type">{reportTitle(report.report_type)}</span><h4>{dateLabel(report.period_start)}{report.period_end !== report.period_start ? " – " + dateLabel(report.period_end) : ""}</h4></div>
                <span className={"ministry-report-status is-" + report.status}>{report.status.replaceAll("_", " ")}</span>
              </div>
              <div className="ministry-report-metrics">
                <div><strong>{report.contacts_captured}</strong><span>Contacts</span></div>
                <div><strong>{report.gospel_presentations}</strong><span>Presentations</span></div>
                <div><strong>{report.decisions_for_christ}</strong><span>Decisions</span></div>
                <div><strong>{report.followup_completed}/{report.followup_required}</strong><span>Follow-ups</span></div>
                <div><strong>{report.visits_completed}</strong><span>Visits</span></div>
                <div><strong>{report.attendance_count}</strong><span>Attendance</span></div>
              </div>
              {canAct && <div className="ministry-report-review">
                {reviewingId === report.id ? <>
                  <label><span>Review note (required when returning)</span><textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={2} maxLength={2000} /></label>
                  <div>
                    <button type="button" className="cmi-button cmi-button-secondary" onClick={() => { setReviewingId(null); setReviewComment(""); }}>Cancel</button>
                    <button type="button" className="cmi-button cmi-button-secondary" disabled={saving || !reviewComment.trim()} onClick={() => void review(report, "returned")}>Return</button>
                    <button type="button" className="cmi-button cmi-button-primary" disabled={saving} onClick={() => void review(report, "approved")}>Approve</button>
                  </div>
                </> : <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setReviewingId(report.id)}>Review report</button>}
              </div>}
            </article>;
          })}
        </div>}
    </section>
  );
}
