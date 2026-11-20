import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { RefreshCw, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import {
  CmiApiClient,
  CmiApiError,
  type EventAssignmentWorkspace,
  type EventDraftRecord,
  type EventStaffAssignmentRole,
  type EventTeamAssignmentRole,
} from "../lib/cmi-api";
import { branchLocalInputToIso, toBranchLocalInput, formatBranchDate } from "../lib/branch-time";
import { formatApplicationError } from "../lib/error-messages";

interface EventAssignmentsPanelProps {
  api: CmiApiClient;
  branchId: string;
  timeZone: string;
  event: EventDraftRecord;
  onClose: () => void;
  onSessionExpired: () => void;
}

function assignmentState(
  startsAt: string,
  endsAt: string | null,
  revokedAt: string | null,
): "Revoked" | "Scheduled" | "Active" | "Ended" {
  if (revokedAt) return "Revoked";
  const now = Date.now();
  if (Date.parse(startsAt) > now) return "Scheduled";
  if (endsAt && Date.parse(endsAt) <= now) return "Ended";
  return "Active";
}

export function EventAssignmentsPanel({
  api,
  branchId,
  timeZone,
  event,
  onClose,
  onSessionExpired,
}: EventAssignmentsPanelProps) {
  const [workspace, setWorkspace] = useState<EventAssignmentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<"staff" | "team">("staff");
  const [targetId, setTargetId] = useState("");
  const [staffRole, setStaffRole] = useState<EventStaffAssignmentRole>("checkin");
  const [teamRole, setTeamRole] = useState<EventTeamAssignmentRole>("support");
  const [startsAt, setStartsAt] = useState(() => toBranchLocalInput(event.starts_at, timeZone));
  const [endsAt, setEndsAt] = useState(() => toBranchLocalInput(event.ends_at, timeZone));

  const staffCandidates = workspace?.staff_candidates ?? [];
  const teamCandidates = workspace?.team_candidates ?? [];
  const targetOptions = useMemo(
    () => kind === "staff"
      ? staffCandidates.map((candidate) => ({ id: candidate.auth_user_id, label: candidate.full_name }))
      : teamCandidates.map((candidate) => ({ id: candidate.id, label: candidate.name })),
    [kind, staffCandidates, teamCandidates],
  );

  const requestVersion = useRef(0);
  const mutationInFlight = useRef(false);
  const load = useCallback(async () => {
    const requestId = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.getEventAssignments(branchId, event.id);
      if (requestId !== requestVersion.current) return;
      setWorkspace(result.data);
    } catch (cause) {
      if (requestId !== requestVersion.current) return;
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(formatApplicationError(cause));
      }
    } finally {
      if (requestId === requestVersion.current) setLoading(false);
    }
  }, [api, branchId, event.id, onSessionExpired]);

  useEffect(() => {
    setWorkspace(null);
    void load();
    return () => { requestVersion.current += 1; };
  }, [branchId, event.id, load]);

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const selectedId = targetId || targetOptions[0]?.id || "";
    if (!selectedId) {
      setError(kind === "staff" ? "There are no active staff members available in this branch." : "There are no active teams available in this branch.");
      mutationInFlight.current = false;
      return;
    }
    const starts = branchLocalInputToIso(startsAt, timeZone);
    const ends = endsAt ? branchLocalInputToIso(endsAt, timeZone) : null;
    if (!starts || (endsAt && !ends)) {
      setError("Enter valid assignment dates in the branch time zone.");
      mutationInFlight.current = false;
      return;
    }
    if (ends && Date.parse(ends) <= Date.parse(starts)) {
      setError("The assignment end must be later than its start.");
      mutationInFlight.current = false;
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (kind === "staff") {
        await api.createEventStaffAssignment(branchId, event.id, {
          staff_auth_user_id: selectedId,
          assignment_role: staffRole,
          starts_at: starts,
          ends_at: ends,
        });
      } else {
        await api.createEventTeamAssignment(branchId, event.id, {
          team_id: selectedId,
          assignment_role: teamRole,
          starts_at: starts,
          ends_at: ends,
        });
      }
      setTargetId("");
      setNotice(kind === "staff" ? "Staff assignment added." : "Team assignment added.");
      await load();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(formatApplicationError(cause));
      }
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  };

  const revoke = async (assignmentKind: "staff" | "team", assignmentId: string) => {
    if (mutationInFlight.current || !window.confirm("Revoke this event assignment? The assignment history will be retained.")) return;
    mutationInFlight.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.revokeEventAssignment(branchId, event.id, assignmentKind, assignmentId);
      setNotice("Assignment revoked. Its history has been retained.");
      await load();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(formatApplicationError(cause));
      }
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  };

  const staffRows = workspace?.staff_assignments ?? [];
  const teamRows = workspace?.team_assignments ?? [];

  return (
    <section className="cmi-panel cmi-event-assignment-panel" aria-label={"Assignments for " + event.title}>
      <div className="cmi-panel-heading">
        <div>
          <p className="cmi-eyebrow">EVENT TEAM</p>
          <h4>Assignments · {event.title}</h4>
          <p>Assign active branch staff and teams to non-transport event roles. Assignment history is retained when an assignment is revoked.</p>
        </div>
        <div className="cmi-operations-actions">
          <button className="cmi-button cmi-button-secondary" type="button" onClick={() => void load()} disabled={loading || saving} aria-label="Refresh assignments">
            <RefreshCw size={15} />Refresh
          </button>
          <button className="cmi-button cmi-button-secondary" type="button" onClick={onClose} aria-label="Close assignments">
            <X size={15} />Close
          </button>
        </div>
      </div>

      {error && <div className="cmi-alert" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="cmi-success-note" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}

      <form className="cmi-form-grid cmi-operations-form" onSubmit={(eventForm) => void submit(eventForm)}>
        <label>Assign
          <select value={kind} onChange={(change) => { setKind(change.currentTarget.value as "staff" | "team"); setTargetId(""); }}>
            <option value="staff">Individual staff member</option>
            <option value="team">Ministry team</option>
          </select>
        </label>
        <label>{kind === "staff" ? "Staff member" : "Team"}
          <select value={targetId || targetOptions[0]?.id || ""} onChange={(change) => setTargetId(change.currentTarget.value)} required disabled={loading || targetOptions.length === 0}>
            <option value="" disabled>{loading ? "Loading options…" : "Select an assignee"}</option>
            {targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        {kind === "staff" ? (
          <label>Assignment role
            <select value={staffRole} onChange={(change) => setStaffRole(change.currentTarget.value as EventStaffAssignmentRole)}>
              <option value="owner">Event owner</option>
              <option value="organizer">Organizer</option>
              <option value="checkin">Check-in</option>
              <option value="support">Support</option>
            </select>
          </label>
        ) : (
          <label>Assignment role
            <select value={teamRole} onChange={(change) => setTeamRole(change.currentTarget.value as EventTeamAssignmentRole)}>
              <option value="organizer">Organizer</option>
              <option value="ushering">Ushering</option>
              <option value="support">Support</option>
            </select>
          </label>
        )}
        <label>Starts at ({timeZone})
          <input type="datetime-local" value={startsAt} onChange={(change) => setStartsAt(change.currentTarget.value)} required />
        </label>
        <label>Ends at ({timeZone}) · Defaults to event end
          <input type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(change) => setEndsAt(change.currentTarget.value)} />
        </label>
        <div className="cmi-form-actions cmi-field-wide">
          <span className="cmi-scope-note">Transport is excluded. Staff must be active in this branch during the assignment period.</span>
          <button type="submit" className="cmi-button cmi-button-primary" disabled={saving || loading || targetOptions.length === 0}>
            <UserPlus size={15} />{saving ? "Saving…" : "Add assignment"}
          </button>
        </div>
      </form>

      {loading ? <div className="cmi-loading" role="status">Loading event assignments…</div> : (
        <div className="cmi-event-assignment-lists">
          <div>
            <h5><Users size={16} /> Staff assignments</h5>
            <div className="cmi-task-list cmi-operations-list">
              {staffRows.map((item) => {
                const state = assignmentState(item.starts_at, item.ends_at, item.revoked_at);
                return (
                  <article className="cmi-task-row" key={item.id}>
                    <div className="cmi-task-symbol"><ShieldCheck size={17} /></div>
                    <div className="cmi-task-copy">
                      <strong>{item.staff_name}</strong>
                      <p>{item.assignment_role.replaceAll("_", " ")} · {formatBranchDate(item.starts_at, timeZone)}{item.ends_at ? " – " + formatBranchDate(item.ends_at, timeZone) : " · No end date"}</p>
                    </div>
                    <span className={"cmi-task-status " + (state === "Active" ? "status-open" : "status-muted")}>{state}</span>
                    {!item.revoked_at && <button className="cmi-button cmi-button-secondary" type="button" onClick={() => void revoke("staff", item.id)} disabled={saving}>Revoke</button>}
                  </article>
                );
              })}
              {!staffRows.length && <p className="cmi-detail-muted">No individual staff assignments yet.</p>}
            </div>
          </div>
          <div>
            <h5><Users size={16} /> Team assignments</h5>
            <div className="cmi-task-list cmi-operations-list">
              {teamRows.map((item) => {
                const state = assignmentState(item.starts_at, item.ends_at, item.revoked_at);
                return (
                  <article className="cmi-task-row" key={item.id}>
                    <div className="cmi-task-symbol"><Users size={17} /></div>
                    <div className="cmi-task-copy">
                      <strong>{item.team_name}</strong>
                      <p>{item.assignment_role.replaceAll("_", " ")} · {formatBranchDate(item.starts_at, timeZone)}{item.ends_at ? " – " + formatBranchDate(item.ends_at, timeZone) : " · No end date"}</p>
                    </div>
                    <span className={"cmi-task-status " + (state === "Active" ? "status-open" : "status-muted")}>{state}</span>
                    {!item.revoked_at && <button className="cmi-button cmi-button-secondary" type="button" onClick={() => void revoke("team", item.id)} disabled={saving}>Revoke</button>}
                  </article>
                );
              })}
              {!teamRows.length && <p className="cmi-detail-muted">No team assignments yet.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
