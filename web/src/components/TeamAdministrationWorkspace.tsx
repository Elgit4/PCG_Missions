import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ChevronRight,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  UserRoundPlus,
  X,
} from "lucide-react";
import {
  CmiApiClient,
  CmiApiError,
  type ServiceAreaRecord,
  type StaffDirectoryEntry,
  type TeamRecord,
  type TeamMemberRecord,
} from "../lib/cmi-api";
import { hasCapability } from "../lib/capabilities";

type WorkspaceTab = "teams" | "areas";

interface TeamAdministrationWorkspaceProps {
  branchId: string;
  branchName: string;
  api: CmiApiClient;
  session: import("../lib/cmi-api").StaffSession;
  onSessionExpired: () => void;
}

function apiMessage(error: unknown): string {
  if (error instanceof CmiApiError) {
    if (error.status === 401) return "Your staff session has expired. Sign in again.";
    if (error.code === "TEAM_LEADER_ROLE_REQUIRED") {
      return "This staff member must first be assigned the Team Leader role in this branch.";
    }
    if (error.code === "ACTIVE_ASSIGNMENTS_EXIST") return error.message;
    if (error.code === "DUPLICATE_RECORD") return "A team, area code or membership with these details already exists.";
    if (error.status === 403) return "Your account does not have permission for this operation in the selected branch.";
    if (error.status === 404) return "The selected team, staff membership or service area is no longer available.";
    if (error.status === 422) return error.message;
    if (error.status === 0) return "The service could not be reached. Check your connection and retry.";
    return error.message + (error.requestId ? " (Reference: " + error.requestId + ")" : "");
  }
  return "The operation could not be completed. Please try again.";
}

function isLeader(staff: StaffDirectoryEntry | undefined): boolean {
  return !!staff?.roles.some((role) => role.code === "team_leader");
}

function displayName(staff: Pick<StaffDirectoryEntry, "id" | "full_name" | "account_status"> | null | undefined): string {
  return staff?.full_name ?? "Staff account unavailable";
}

export function TeamAdministrationWorkspace({
  branchId,
  branchName,
  api,
  session,
  onSessionExpired,
}: TeamAdministrationWorkspaceProps) {
  const canManageTeams = hasCapability(session, "team.manage", branchId);
  const canManageAreas = hasCapability(session, "area.manage", branchId);
  const canReadStaff = hasCapability(session, "staff.directory.read", branchId);

  const [tab, setTab] = useState<WorkspaceTab>(canManageTeams ? "teams" : "areas");
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [areas, setAreas] = useState<ServiceAreaRecord[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [showCoverageForm, setShowCoverageForm] = useState(false);
  const [confirmMemberId, setConfirmMemberId] = useState<string | null>(null);
  const [confirmCoverageId, setConfirmCoverageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? null;
  const activeStaff = useMemo(
    () => staff.filter((member) => member.account_status === "active"),
    [staff],
  );
  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.id, member])),
    [staff],
  );

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [teamResult, areaResult, staffResult] = await Promise.all([
        canManageTeams ? api.listTeams(branchId) : Promise.resolve(null),
        canManageAreas ? api.listServiceAreas(branchId) : Promise.resolve(null),
        canReadStaff ? api.listStaffDirectory(branchId, { limit: 50, offset: 0 }) : Promise.resolve(null),
      ]);
      if (teamResult) {
        setTeams(teamResult.data.teams);
        setSelectedTeamId((current) =>
          teamResult.data.teams.some((team) => team.id === current)
            ? current
            : teamResult.data.teams[0]?.id ?? null
        );
      } else {
        setTeams([]);
        setSelectedTeamId(null);
      }
      if (areaResult) {
        setAreas(areaResult.data.areas);
        setSelectedAreaId((current) =>
          areaResult.data.areas.some((area) => area.id === current)
            ? current
            : areaResult.data.areas[0]?.id ?? null
        );
      } else {
        setAreas([]);
        setSelectedAreaId(null);
      }
      if (staffResult) setStaff(staffResult.data);
      else setStaff([]);
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(apiMessage(cause));
      }
    } finally {
      setLoading(false);
    }
  }, [api, branchId, canManageAreas, canManageTeams, canReadStaff, onSessionExpired]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const completeMutation = async (successMessage: string, action: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      setShowTeamForm(false);
      setEditingTeamId(null);
      setShowMemberForm(false);
      setShowAreaForm(false);
      setEditingAreaId(null);
      setShowCoverageForm(false);
      setConfirmMemberId(null);
      setConfirmCoverageId(null);
      await loadWorkspace();
    } catch (cause) {
      if (cause instanceof CmiApiError && cause.status === 401) {
        onSessionExpired();
      } else {
        setError(apiMessage(cause));
      }
    } finally {
      setSaving(false);
    }
  };

  const submitTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageTeams || saving) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim() || null;
    if (editingTeamId) {
      await completeMutation("Team details updated.", () =>
        api.updateTeam(branchId, editingTeamId, { name, description })
      );
    } else {
      await completeMutation("Team created.", () =>
        api.createTeam({ branch_id: branchId, name, description })
      );
    }
  };

  const setTeamActive = async (team: TeamRecord) => {
    if (!canManageTeams || saving) return;
    const nextActive = !team.is_active;
    await completeMutation(
      nextActive ? "Team reactivated." : "Team deactivated.",
      () => api.updateTeam(branchId, team.id, { is_active: nextActive }),
    );
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageTeams || !canReadStaff || !selectedTeam || saving) return;
    const form = new FormData(event.currentTarget);
    const staffProfileId = String(form.get("staff_profile_id") ?? "");
    const membershipRole = String(form.get("membership_role") ?? "member") as "member" | "leader";
    await completeMutation("Staff member added to the team.", () =>
      api.addTeamMember(branchId, selectedTeam.id, {
        staff_profile_id: staffProfileId,
        membership_role: membershipRole,
      })
    );
  };

  const changeMemberRole = async (member: TeamMemberRecord) => {
    if (!canManageTeams || !selectedTeam || saving) return;
    const nextRole = member.membership_role === "leader" ? "member" : "leader";
    await completeMutation(
      nextRole === "leader" ? "Team leader membership assigned." : "Membership changed to team member.",
      () => api.updateTeamMemberRole(branchId, selectedTeam.id, member.id, { membership_role: nextRole }),
    );
  };

  const revokeMember = async (member: TeamMemberRecord) => {
    if (!canManageTeams || !selectedTeam || saving) return;
    await completeMutation("Team membership ended. Its history has been retained.", () =>
      api.revokeTeamMember(branchId, selectedTeam.id, member.id)
    );
  };

  const submitArea = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageAreas || saving) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const code = String(form.get("code") ?? "").trim() || null;
    if (editingAreaId) {
      await completeMutation("Service-area details updated.", () =>
        api.updateServiceArea(branchId, editingAreaId, { name, code })
      );
    } else {
      await completeMutation("Service area created.", () =>
        api.createServiceArea({ branch_id: branchId, name, code })
      );
    }
  };

  const setAreaActive = async (area: ServiceAreaRecord) => {
    if (!canManageAreas || saving) return;
    const nextActive = !area.is_active;
    await completeMutation(
      nextActive ? "Service area reactivated." : "Service area deactivated.",
      () => api.updateServiceArea(branchId, area.id, { is_active: nextActive }),
    );
  };

  const addCoverage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageAreas || !canReadStaff || !selectedArea || saving) return;
    const form = new FormData(event.currentTarget);
    const staffProfileId = String(form.get("staff_profile_id") ?? "");
    await completeMutation("Staff coverage assigned to the service area.", () =>
      api.addAreaCoverage(branchId, selectedArea.id, { staff_profile_id: staffProfileId })
    );
  };

  const revokeCoverage = async () => {
    if (!canManageAreas || !selectedArea || !confirmCoverageId || saving) return;
    const coverageId = confirmCoverageId;
    await completeMutation("Service-area coverage ended. Its history has been retained.", () =>
      api.revokeAreaCoverage(branchId, selectedArea.id, coverageId)
    );
  };

  const beginTeamEdit = (team: TeamRecord) => {
    setEditingTeamId(team.id);
    setShowTeamForm(true);
    setError("");
    setNotice("");
  };

  const beginAreaEdit = (area: ServiceAreaRecord) => {
    setEditingAreaId(area.id);
    setShowAreaForm(true);
    setError("");
    setNotice("");
  };

  return (
    <div className="cmi-structure-workspace">
      <section className="cmi-panel">
        <div className="cmi-panel-heading cmi-structure-heading">
          <div>
            <p className="cmi-eyebrow">PEOPLE & MINISTRY STRUCTURE</p>
            <h3>Teams & Service Areas</h3>
            <p>Organise staff membership and coverage within <strong>{branchName}</strong>. Access is restricted to this branch.</p>
          </div>
          <button
            type="button"
            className="cmi-button cmi-button-secondary"
            onClick={() => void loadWorkspace()}
            disabled={loading || saving}
          >
            <RefreshCw size={15} />Refresh
          </button>
        </div>

        <div className="cmi-structure-tabs" role="tablist" aria-label="Team administration sections">
          {canManageTeams && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "teams"}
              className={tab === "teams" ? "active" : ""}
              onClick={() => { setTab("teams"); setError(""); setNotice(""); }}
            >
              <Users size={15} />Teams
              <span>{teams.length}</span>
            </button>
          )}
          {canManageAreas && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "areas"}
              className={tab === "areas" ? "active" : ""}
              onClick={() => { setTab("areas"); setError(""); setNotice(""); }}
            >
              <MapPin size={15} />Service areas
              <span>{areas.length}</span>
            </button>
          )}
        </div>

        {error && <div className="cmi-alert" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        {notice && <div className="cmi-success-note" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}
        {loading && <div className="cmi-loading" role="status">Loading branch structure…</div>}

        {tab === "teams" && canManageTeams && (
          <div className="cmi-structure-grid">
            <div className="cmi-structure-index">
              <div className="cmi-structure-index-heading">
                <div><strong>Branch teams</strong><small>{teams.length} team{teams.length === 1 ? "" : "s"}</small></div>
                <button
                  type="button"
                  className="cmi-button cmi-button-primary cmi-button-compact"
                  onClick={() => { setEditingTeamId(null); setShowTeamForm((value) => !value); setError(""); }}
                  disabled={saving}
                >
                  <Plus size={14} />New
                </button>
              </div>
              {teams.map((team) => (
                <button
                  type="button"
                  key={team.id}
                  className={"cmi-structure-index-card" + (selectedTeamId === team.id ? " active" : "")}
                  onClick={() => { setSelectedTeamId(team.id); setShowTeamForm(false); setShowMemberForm(false); setConfirmMemberId(null); }}
                >
                  <span className="cmi-structure-index-icon"><Users size={17} /></span>
                  <span className="cmi-structure-index-copy"><strong>{team.name}</strong><small>{team.members.length} active member{team.members.length === 1 ? "" : "s"}</small></span>
                  <span className={"cmi-structure-dot" + (team.is_active ? " active" : "")} aria-label={team.is_active ? "Active" : "Inactive"} />
                  <ChevronRight size={15} />
                </button>
              ))}
              {!teams.length && !loading && <div className="cmi-structure-index-empty"><Users size={24} /><strong>No teams yet</strong><span>Create the first branch team to begin assigning staff.</span></div>}
            </div>

            <div className="cmi-structure-detail">
              {showTeamForm && (
                <form className="cmi-structure-form" onSubmit={(event) => void submitTeam(event)}>
                  <div className="cmi-structure-detail-heading">
                    <div><p className="cmi-eyebrow">{editingTeamId ? "EDIT TEAM" : "NEW TEAM"}</p><h4>{editingTeamId ? "Update team details" : "Create a branch team"}</h4></div>
                    <button type="button" className="cmi-icon-button" onClick={() => { setShowTeamForm(false); setEditingTeamId(null); }} aria-label="Close form"><X size={16} /></button>
                  </div>
                  <label>Team name<input name="name" required minLength={2} maxLength={160} defaultValue={teams.find((team) => team.id === editingTeamId)?.name ?? ""} placeholder="e.g. Welcome & Follow-up" /></label>
                  <label>Description <span>Optional</span><textarea name="description" rows={3} maxLength={1000} defaultValue={teams.find((team) => team.id === editingTeamId)?.description ?? ""} placeholder="Describe the team's ministry focus." /></label>
                  <div className="cmi-form-actions">
                    <button type="button" className="cmi-button cmi-button-secondary" onClick={() => { setShowTeamForm(false); setEditingTeamId(null); }} disabled={saving}>Cancel</button>
                    <button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : editingTeamId ? "Save changes" : "Create team"}</button>
                  </div>
                </form>
              )}

              {selectedTeam && !showTeamForm && (
                <>
                  <div className="cmi-structure-detail-heading">
                    <div>
                      <p className="cmi-eyebrow">{selectedTeam.is_active ? "ACTIVE TEAM" : "INACTIVE TEAM"}</p>
                      <h4>{selectedTeam.name}</h4>
                      <p>{selectedTeam.description || "No team description has been added."}</p>
                    </div>
                    <span className={"cmi-structure-status" + (selectedTeam.is_active ? " active" : "")}>{selectedTeam.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="cmi-structure-metrics">
                    <div><strong>{selectedTeam.members.length}</strong><span>Active members</span></div>
                    <div><strong>{selectedTeam.members.filter((member) => member.membership_role === "leader").length}</strong><span>Team leaders</span></div>
                  </div>
                  <div className="cmi-structure-action-row">
                    <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginTeamEdit(selectedTeam)} disabled={saving}><Users size={14} />Edit details</button>
                    <button type="button" className="cmi-button cmi-button-secondary" onClick={() => void setTeamActive(selectedTeam)} disabled={saving}>
                      <Archive size={14} />{selectedTeam.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                    {canReadStaff && selectedTeam.is_active && (
                      <button type="button" className="cmi-button cmi-button-primary" onClick={() => setShowMemberForm((value) => !value)} disabled={saving}>
                        <UserRoundPlus size={14} />Add member
                      </button>
                    )}
                  </div>

                  {showMemberForm && canReadStaff && (
                    <form className="cmi-structure-assignment-form" onSubmit={(event) => void addMember(event)}>
                      <div><strong>Add staff to team</strong><small>Only active staff assigned to this branch are eligible.</small></div>
                      <label>Staff member<select name="staff_profile_id" required defaultValue=""><option value="" disabled>Select a staff member</option>{activeStaff.filter((person) => !selectedTeam.members.some((member) => member.staff_profile_id === person.id)).map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.roles.map((role) => role.name).join(", ")}</option>)}</select></label>
                      <label>Team membership<select name="membership_role" defaultValue="member"><option value="member">Member</option><option value="leader" disabled={!activeStaff.some((person) => isLeader(person) && !selectedTeam.members.some((member) => member.staff_profile_id === person.id))}>Team Leader</option></select></label>
                      {!activeStaff.some((person) => isLeader(person) && !selectedTeam.members.some((member) => member.staff_profile_id === person.id)) && <p className="cmi-scope-note cmi-structure-leader-note">No eligible Team Leaders are available. Assign the Team Leader role to a staff account in this branch first.</p>}
                      <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => setShowMemberForm(false)} disabled={saving}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving || !activeStaff.some((person) => !selectedTeam.members.some((member) => member.staff_profile_id === person.id))}>{saving ? "Adding…" : "Add to team"}</button></div>
                    </form>
                  )}

                  {!canReadStaff && <p className="cmi-scope-note">Staff membership details are hidden because this account does not have the separate staff-directory permission.</p>}
                  <div className="cmi-structure-members">
                    <div className="cmi-structure-section-heading"><div><strong>Team membership</strong><small>Membership history is retained when a person leaves.</small></div></div>
                    {selectedTeam.members.map((member) => {
                      const directoryEntry = staffById.get(member.staff_profile_id);
                      const canPromote = member.membership_role === "leader" || isLeader(directoryEntry);
                      return (
                        <article className="cmi-structure-person" key={member.id}>
                          <span className="cmi-structure-avatar">{displayName(member.staff).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                          <div className="cmi-structure-person-copy"><strong>{displayName(member.staff)}</strong><small>{member.membership_role === "leader" ? "Team Leader" : "Member"} · Joined {new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(member.starts_at))}</small></div>
                          {member.membership_role === "leader" && <span className="cmi-structure-role">Leader</span>}
                          {canReadStaff && (
                            <div className="cmi-structure-person-actions">
                              {canPromote && <button type="button" className="cmi-text-action" onClick={() => void changeMemberRole(member)} disabled={saving}>{member.membership_role === "leader" ? "Set member" : "Make leader"}</button>}
                              <button type="button" className="cmi-text-action danger" onClick={() => setConfirmMemberId(confirmMemberId === member.id ? null : member.id)} disabled={saving}>Remove</button>
                            </div>
                          )}
                          {confirmMemberId === member.id && (
                            <div className="cmi-inline-confirm">
                              <span>End this team membership? Historical assignment records will remain.</span>
                              <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setConfirmMemberId(null)} disabled={saving}>Keep</button>
                              <button type="button" className="cmi-button cmi-button-danger" onClick={() => void revokeMember(member)} disabled={saving}>{saving ? "Removing…" : "Confirm removal"}</button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                    {!selectedTeam.members.length && <div className="cmi-structure-empty"><Users size={21} /><span>No active members have been assigned to this team.</span></div>}
                  </div>
                </>
              )}
              {!selectedTeam && !showTeamForm && <div className="cmi-structure-detail-empty"><ShieldCheck size={27} /><strong>Select a team or create one.</strong><span>Membership and role assignment controls will appear here.</span></div>}
            </div>
          </div>
        )}

        {tab === "areas" && canManageAreas && (
          <div className="cmi-structure-grid">
            <div className="cmi-structure-index">
              <div className="cmi-structure-index-heading">
                <div><strong>Service areas</strong><small>{areas.length} area{areas.length === 1 ? "" : "s"}</small></div>
                <button type="button" className="cmi-button cmi-button-primary cmi-button-compact" onClick={() => { setEditingAreaId(null); setShowAreaForm((value) => !value); setError(""); }} disabled={saving}><Plus size={14} />New</button>
              </div>
              {areas.map((area) => (
                <button
                  type="button"
                  key={area.id}
                  className={"cmi-structure-index-card" + (selectedAreaId === area.id ? " active" : "")}
                  onClick={() => { setSelectedAreaId(area.id); setShowAreaForm(false); setShowCoverageForm(false); setConfirmCoverageId(null); }}
                >
                  <span className="cmi-structure-index-icon"><MapPin size={17} /></span>
                  <span className="cmi-structure-index-copy"><strong>{area.name}</strong><small>{area.coverage.length} active assignment{area.coverage.length === 1 ? "" : "s"}{area.code ? " · " + area.code : ""}</small></span>
                  <span className={"cmi-structure-dot" + (area.is_active ? " active" : "")} aria-label={area.is_active ? "Active" : "Inactive"} />
                  <ChevronRight size={15} />
                </button>
              ))}
              {!areas.length && !loading && <div className="cmi-structure-index-empty"><MapPin size={24} /><strong>No service areas yet</strong><span>Create an area to organise field coverage.</span></div>}
            </div>

            <div className="cmi-structure-detail">
              {showAreaForm && (
                <form className="cmi-structure-form" onSubmit={(event) => void submitArea(event)}>
                  <div className="cmi-structure-detail-heading">
                    <div><p className="cmi-eyebrow">{editingAreaId ? "EDIT SERVICE AREA" : "NEW SERVICE AREA"}</p><h4>{editingAreaId ? "Update service area" : "Create a service area"}</h4></div>
                    <button type="button" className="cmi-icon-button" onClick={() => { setShowAreaForm(false); setEditingAreaId(null); }} aria-label="Close form"><X size={16} /></button>
                  </div>
                  <label>Area name<input name="name" required minLength={2} maxLength={160} defaultValue={areas.find((area) => area.id === editingAreaId)?.name ?? ""} placeholder="e.g. Northern Area" /></label>
                  <label>Area code <span>Optional</span><input name="code" maxLength={24} pattern="[A-Za-z0-9_-]{2,24}" defaultValue={areas.find((area) => area.id === editingAreaId)?.code ?? ""} placeholder="e.g. NORTH" /></label>
                  <p className="cmi-scope-note">Area codes are unique within this branch. Use short codes that are easy to recognise in reports and field assignments.</p>
                  <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => { setShowAreaForm(false); setEditingAreaId(null); }} disabled={saving}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : editingAreaId ? "Save changes" : "Create service area"}</button></div>
                </form>
              )}

              {selectedArea && !showAreaForm && (
                <>
                  <div className="cmi-structure-detail-heading">
                    <div><p className="cmi-eyebrow">{selectedArea.is_active ? "ACTIVE SERVICE AREA" : "INACTIVE SERVICE AREA"}</p><h4>{selectedArea.name}</h4><p>{selectedArea.code ? "Area code " + selectedArea.code : "No area code assigned."}</p></div>
                    <span className={"cmi-structure-status" + (selectedArea.is_active ? " active" : "")}>{selectedArea.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="cmi-structure-metrics">
                    <div><strong>{selectedArea.coverage.length}</strong><span>Active staff coverage</span></div>
                    <div><strong>{selectedArea.coverage.filter((record) => record.staff?.account_status === "active").length}</strong><span>Active staff profiles</span></div>
                  </div>
                  <div className="cmi-structure-action-row">
                    <button type="button" className="cmi-button cmi-button-secondary" onClick={() => beginAreaEdit(selectedArea)} disabled={saving}><MapPin size={14} />Edit details</button>
                    <button type="button" className="cmi-button cmi-button-secondary" onClick={() => void setAreaActive(selectedArea)} disabled={saving}><Archive size={14} />{selectedArea.is_active ? "Deactivate" : "Reactivate"}</button>
                    {canReadStaff && selectedArea.is_active && <button type="button" className="cmi-button cmi-button-primary" onClick={() => setShowCoverageForm((value) => !value)} disabled={saving}><UserRoundPlus size={14} />Assign staff</button>}
                  </div>

                  {showCoverageForm && canReadStaff && (
                    <form className="cmi-structure-assignment-form" onSubmit={(event) => void addCoverage(event)}>
                      <div><strong>Assign field coverage</strong><small>Choose active staff who already belong to this branch.</small></div>
                      <label>Staff member<select name="staff_profile_id" required defaultValue=""><option value="" disabled>Select staff member</option>{activeStaff.filter((person) => !selectedArea.coverage.some((item) => item.staff_profile_id === person.id)).map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.roles.map((role) => role.name).join(", ")}</option>)}</select></label>
                      <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => setShowCoverageForm(false)} disabled={saving}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving || !activeStaff.some((person) => !selectedArea.coverage.some((item) => item.staff_profile_id === person.id))}>{saving ? "Assigning…" : "Assign coverage"}</button></div>
                    </form>
                  )}

                  {!canReadStaff && <p className="cmi-scope-note">Staff coverage details are hidden because this account does not have the separate staff-directory permission.</p>}
                  <div className="cmi-structure-members">
                    <div className="cmi-structure-section-heading"><div><strong>Staff coverage</strong><small>Coverage assignments are ended, not deleted.</small></div></div>
                    {selectedArea.coverage.map((coverage) => (
                      <article className="cmi-structure-person" key={coverage.id}>
                        <span className="cmi-structure-avatar"><MapPin size={16} /></span>
                        <div className="cmi-structure-person-copy"><strong>{displayName(coverage.staff)}</strong><small>Assigned {new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(coverage.starts_at))}</small></div>
                        {canReadStaff && <div className="cmi-structure-person-actions"><button type="button" className="cmi-text-action danger" onClick={() => setConfirmCoverageId(confirmCoverageId === coverage.id ? null : coverage.id)} disabled={saving}>End coverage</button></div>}
                        {confirmCoverageId === coverage.id && (
                          <div className="cmi-inline-confirm">
                            <span>End this staff member's coverage for the selected area?</span>
                            <button type="button" className="cmi-button cmi-button-secondary" onClick={() => setConfirmCoverageId(null)} disabled={saving}>Keep</button>
                            <button type="button" className="cmi-button cmi-button-danger" onClick={() => void revokeCoverage()} disabled={saving}>{saving ? "Ending…" : "Confirm"}</button>
                          </div>
                        )}
                      </article>
                    ))}
                    {!selectedArea.coverage.length && <div className="cmi-structure-empty"><MapPin size={21} /><span>No active staff coverage has been assigned to this area.</span></div>}
                  </div>
                </>
              )}
              {!selectedArea && !showAreaForm && <div className="cmi-structure-detail-empty"><ShieldCheck size={27} /><strong>Select an area or create one.</strong><span>Staff coverage controls will appear here.</span></div>}
            </div>
          </div>
        )}

        {!canManageTeams && !canManageAreas && (
          <div className="cmi-empty-state"><ShieldCheck size={22} /><strong>Team administration is not authorised.</strong><p>This section is visible only when your active branch grants team or service-area management.</p></div>
        )}
      </section>
    </div>
  );
}
