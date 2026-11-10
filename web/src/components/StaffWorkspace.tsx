import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, CalendarClock, CheckCircle2, ClipboardList, LogOut, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { canOpenStaffPage, getAvailableStaffPages, hasCapability, hasIdentityCapture, hasIdentityRead } from "../lib/capabilities";
import type { ContactCreateInput, ContactRecord, FollowUpTask, StaffSession, TaskCreateInput } from "../lib/cmi-api";
import { CmiApiClient, CmiApiError } from "../lib/cmi-api";

type Page = "Overview" | "Contacts" | "Follow-up";
interface StaffWorkspaceProps { api: CmiApiClient; session: StaffSession; onSignOut: () => Promise<void> }

function messageFor(error: unknown): string {
  if (error instanceof CmiApiError) {
    if (error.status === 401) return "Your staff session has expired. Sign in again.";
    if (error.status === 403) return "Your account is signed in, but it does not have permission for this operation.";
    if (error.status === 404) return "The requested record is unavailable or outside your access scope.";
    if (error.status === 409) return "This operation conflicts with an existing request or a recent record change. Refresh the data before trying again.";
    if (error.status === 422) return "Some submitted fields need correction. Review the form and try again.";
    if (error.status === 429) return "Too many requests were made. Wait a moment before trying again.";
    if (error.status === 503) return "This service is temporarily unavailable. Try again later.";
    if (error.status === 0) return error.message;
    return `${error.message}${error.requestId ? ` (Reference: ${error.requestId})` : ""}`;
  }
  return "Something went wrong. Please try again.";
}
function displayName(contact: ContactRecord): string {
  return contact.preferred_name?.trim() || [contact.first_name, contact.last_name].filter(Boolean).join(" ");
}
function formatDate(value: string | null, timeZone: string): string {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}
function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function StaffWorkspace({ api, session, onSignOut }: StaffWorkspaceProps) {
  const [branchId, setBranchId] = useState(session.branches[0]?.id ?? "");
  const [page, setPage] = useState<Page>("Overview");
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [contactsHasMore, setContactsHasMore] = useState(false);
  const [tasksHasMore, setTasksHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [showContactForm, setShowContactForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const contactRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);
  const taskRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);

  const canReadContacts = canOpenStaffPage(session, "Contacts", branchId);
  const canReadTasks = canOpenStaffPage(session, "Follow-up", branchId);
  const canCreateContacts = hasCapability(session, "contact.capture.create", branchId);
  const taskCreateGrant = session.capabilities.find((grant) =>
    grant.code === "followup.task.create" && grant.branch_id === branchId
  );
  const canCreateTasks = !!taskCreateGrant;
  const canSelfAssignTask = !!taskCreateGrant &&
    (taskCreateGrant.scope_mode === "assigned" || taskCreateGrant.scope_mode === "branch");
  const canUpdateTasks = hasCapability(session, "followup.task.update.scoped", branchId);
  const availablePages = useMemo(() => {
    const pages = getAvailableStaffPages(session, branchId)
      .filter((candidate): candidate is Page =>
        candidate === "Overview" || candidate === "Contacts" || candidate === "Follow-up"
      );
    if (canCreateContacts && !pages.includes("Contacts")) pages.push("Contacts");
    return pages;
  }, [session, branchId, canCreateContacts]);
  const canCaptureIdentity = hasIdentityCapture(session, branchId);
  const canReadIdentity = hasIdentityRead(session, branchId);
  const activeBranch = session.branches.find((branch) => branch.id === branchId);
  const branchTimeZone = activeBranch?.timezone || "Africa/Accra";

  const expireSession = useCallback(() => {
    setContacts([]);
    setTasks([]);
    setContactsHasMore(false);
    setTasksHasMore(false);
    setLoadError("Your staff session has expired. Please sign in again.");
    setActionError("");
    void onSignOut();
  }, [onSignOut]);

  const handleActionError = useCallback((error: unknown) => {
    if (error instanceof CmiApiError && error.status === 401) {
      expireSession();
      return;
    }
    setActionError(messageFor(error));
  }, [expireSession]);

  useEffect(() => {
    let current = true;
    if (!branchId) {
      setContacts([]); setTasks([]);
      setContactsHasMore(false); setTasksHasMore(false);
      setLoading(false); setLoadError("");
      return () => { current = false; };
    }
    setLoading(true); setLoadError("");
    const requests: Promise<void>[] = [];
    if (canReadContacts) {
      requests.push(api.listContacts(branchId, { limit: 50, offset: 0, search: query.trim() || undefined })
        .then((result) => {
          if (current) {
            setContacts(result.data);
            setContactsHasMore(result.data.length === 50);
          }
        })
        .catch((error: unknown) => {
          if (!current) return;
          if (error instanceof CmiApiError && error.status === 401) expireSession();
          else setLoadError(messageFor(error));
        }));
    } else {
      setContacts([]);
      setContactsHasMore(false);
    }
    if (canReadTasks) {
      requests.push(api.listFollowUpTasks(branchId, { limit: 50, offset: 0 })
        .then((result) => {
          if (current) {
            setTasks(result.data);
            setTasksHasMore(result.data.length === 50);
          }
        })
        .catch((error: unknown) => {
          if (!current) return;
          if (error instanceof CmiApiError && error.status === 401) expireSession();
          else setLoadError(messageFor(error));
        }));
    } else {
      setTasks([]);
      setTasksHasMore(false);
    }
    void Promise.all(requests).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, branchId, canReadContacts, canReadTasks, query, expireSession]);

  const visibleContacts = contacts;
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const openTasks = tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  const completedTasks = tasks.filter((task) => task.status === "completed");

  const refresh = async () => {
    if (!branchId) return;
    setRefreshing(true); setActionError("");
    try {
      const [contactResult, taskResult] = await Promise.all([
        canReadContacts ? api.listContacts(branchId, { limit: 50, offset: 0, search: query.trim() || undefined }) : Promise.resolve(null),
        canReadTasks ? api.listFollowUpTasks(branchId, { limit: 50, offset: 0 }) : Promise.resolve(null),
      ]);
      if (contactResult) {
        setContacts(contactResult.data);
        setContactsHasMore(contactResult.data.length === 50);
      }
      if (taskResult) {
        setTasks(taskResult.data);
        setTasksHasMore(taskResult.data.length === 50);
      }
    } catch (error) { handleActionError(error); }
    finally { setRefreshing(false); }
  };

  const loadMoreContacts = async () => {
    if (!canReadContacts || !branchId || !contactsHasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.listContacts(branchId, {
        limit: 50,
        offset: contacts.length,
        search: query.trim() || undefined,
      });
      setContacts((current) => [...current, ...result.data]);
      setContactsHasMore(result.data.length === 50);
    } catch (error) { handleActionError(error); }
    finally { setLoadingMore(false); }
  };

  const loadMoreTasks = async () => {
    if (!canReadTasks || !branchId || !tasksHasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.listFollowUpTasks(branchId, { limit: 50, offset: tasks.length });
      setTasks((current) => [...current, ...result.data]);
      setTasksHasMore(result.data.length === 50);
    } catch (error) { handleActionError(error); }
    finally { setLoadingMore(false); }
  };

  const createContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateContacts || !branchId) return;
    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("first_name") ?? "").trim();
    const lastName = String(form.get("last_name") ?? "").trim();
    const phone = canCaptureIdentity ? String(form.get("phone") ?? "").trim() : "";
    if (!firstName || !lastName) { setActionError("Enter the visitor's first and last name."); return; }
    const contactPayload = {
      branch_id: branchId,
      first_name: firstName,
      last_name: lastName,
      preferred_name: String(form.get("preferred_name") ?? "").trim() || null,
      preferred_language: "en",
      source_metadata: { device_type: "web" },
      ...(phone ? { phone_display: phone } : {}),
    };
    const fingerprint = JSON.stringify(contactPayload);
    if (!contactRequestRef.current || contactRequestRef.current.fingerprint !== fingerprint) {
      contactRequestRef.current = { fingerprint, id: crypto.randomUUID() };
    }
    const input: ContactCreateInput = {
      ...contactPayload,
      client_request_id: contactRequestRef.current.id,
    };
    setSaving(true); setActionError("");
    try {
      const result = await api.createContact(input);
      setContacts((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      contactRequestRef.current = null;
      setShowContactForm(false); setPage("Contacts");
    } catch (error) { handleActionError(error); }
    finally { setSaving(false); }
  };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateTasks || !branchId) return;
    const form = new FormData(event.currentTarget);
    const contactId = String(form.get("contact_id") ?? "");
    const taskNote = String(form.get("task_note") ?? "").trim();
    const rawPriority = Number(form.get("priority") ?? 2);
    const dueInput = String(form.get("due_at") ?? "");
    if (!contactId || !contacts.some((contact) => contact.id === contactId)) { setActionError("Select a contact that is visible in this branch."); return; }
    // Without membership/assignment projections, only self-assignment can be constructed safely.
    if (!canSelfAssignTask) {
      setActionError("Task creation for this scope requires an authorised team or staff assignment target.");
      return;
    }
    const parsedDueDate = dueInput ? new Date(dueInput) : null;
    if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) { setActionError("Enter a valid due date and time."); return; }
    const taskPayload = {
      branch_id: branchId,
      contact_id: contactId,
      assignee_user_id: session.user.id,
      priority: Number.isInteger(rawPriority) && rawPriority >= 1 && rawPriority <= 5 ? rawPriority : 2,
      task_note: taskNote || null,
      due_at: parsedDueDate ? parsedDueDate.toISOString() : null,
    };
    const fingerprint = JSON.stringify(taskPayload);
    if (!taskRequestRef.current || taskRequestRef.current.fingerprint !== fingerprint) {
      taskRequestRef.current = { fingerprint, id: crypto.randomUUID() };
    }
    const input: TaskCreateInput = {
      ...taskPayload,
      client_request_id: taskRequestRef.current.id,
    };
    setSaving(true); setActionError("");
    try {
      const result = await api.createFollowUpTask(input);
      setTasks((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      taskRequestRef.current = null;
      setShowTaskForm(false); setPage("Follow-up");
    } catch (error) { handleActionError(error); }
    finally { setSaving(false); }
  };

  const completeTask = async (task: FollowUpTask) => {
    if (!canUpdateTasks || !branchId || task.status === "completed" || task.status === "cancelled") return;
    setActionError("");
    try {
      const result = await api.updateFollowUpTask(branchId, task.id, { status: "completed" });
      setTasks((current) => current.map((item) => item.id === task.id ? result.data : item));
    } catch (error) { handleActionError(error); }
  };
  const signOut = async () => {
    setSigningOut(true);
    try { await onSignOut(); } catch { /* Local credentials are cleared even when offline. */ }
    finally { setSigningOut(false); }
  };

  if (!activeBranch) return (
    <main className="cmi-no-branch">
      <div className="cmi-empty-icon"><ShieldCheck size={24} /></div>
      <h1>No active branch access</h1>
      <p>Your staff account is authenticated, but no active branch assignment is available. Contact an authorised church administrator.</p>
      <button className="cmi-button cmi-button-secondary" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} />{signingOut ? "Signing out…" : "Sign out"}</button>
    </main>
  );

  return (
    <div className="cmi-workspace">
      <aside className="cmi-sidebar">
        <div className="cmi-brand"><img src="/logo.svg" alt="" /><span><strong>PCG MISSIONS</strong><small>STAFF WORKSPACE</small></span></div>
        <div className="cmi-sidebar-label">WORKSPACE</div>
        <nav className="cmi-nav" aria-label="Staff workspace">
          {availablePages.map((item) => <button key={item} type="button" className={page === item ? "active" : ""} aria-current={page === item ? "page" : undefined} onClick={() => setPage(item)}>
            {item === "Overview" ? <Activity size={19} /> : item === "Contacts" ? <Users size={19} /> : <ClipboardList size={19} />}
            <span className="cmi-nav-desktop-label">{item === "Follow-up" ? "Follow-up tasks" : item}</span>
            {item === "Follow-up" && <span className="cmi-nav-mobile-label">Tasks</span>}
            {item === "Follow-up" && openTasks.length > 0 ? <em>{openTasks.length}</em> : null}
          </button>)}
        </nav>
        <div className="cmi-sidebar-bottom">
          <div className="cmi-access-note"><ShieldCheck size={16} /><span>Access is controlled by your active role grants and branch assignment.</span></div>
          <div className="cmi-user-card">
            <div className="cmi-user-avatar">{session.staff.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
            <div><strong>{session.staff.full_name}</strong><small>{session.roles.filter((role) => role.branch_id === branchId).map((role) => role.name).join(" · ") || "Staff member"}</small></div>
            <button aria-label="Sign out" title="Sign out" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="cmi-main">
        <header className="cmi-topbar">
          <div className="cmi-topbar-heading">
            <div className="cmi-mobile-brand"><img src="/logo.svg" alt="" /><span><strong>PCG Missions</strong><small>STAFF WORKSPACE</small></span></div>
            <span className="cmi-breadcrumb">PCG MISSIONS / {activeBranch.name.toUpperCase()}</span>
            <h1>{page === "Follow-up" ? "Follow-up tasks" : page}</h1>
          </div>
          <div className="cmi-topbar-actions">
            <label className="cmi-branch-picker"><span>BRANCH</span><select aria-label="Active branch" value={branchId} onChange={(event) => {
                setContacts([]);
                setTasks([]);
                setContactsHasMore(false);
                setTasksHasMore(false);
                setQuery("");
                setShowContactForm(false);
                setShowTaskForm(false);
                setBranchId(event.target.value);
                setPage("Overview");
              }}>
              {session.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select></label>
            <button className="cmi-button cmi-button-secondary" onClick={() => void refresh()} disabled={refreshing || loading}>{refreshing ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        <section className="cmi-content" aria-live="polite">
          {loadError && <div className="cmi-alert" role="alert">{loadError}</div>}
          {actionError && <div className="cmi-alert" role="alert">{actionError}<button onClick={() => setActionError("")} aria-label="Dismiss message">×</button></div>}
          {loading && <div className="cmi-loading" role="status">Loading authorised branch data…</div>}

          {page === "Overview" && (
            <>
              <div className="cmi-welcome"><div><p className="cmi-eyebrow">YOUR MINISTRY WORKSPACE</p><h2>Welcome, {session.staff.full_name.split(/\s+/)[0]}.</h2><p>Here is the current activity available to your account in {activeBranch.name}.</p></div><div className="cmi-welcome-mark"><ShieldCheck size={30} /></div></div>
              <div className="cmi-stat-grid">
                <article className="cmi-stat-card"><span>VISIBLE CONTACTS</span><strong>{canReadContacts ? contacts.length : "—"}</strong><small>{canReadContacts ? "Records within your access scope" : "Contact access not granted"}</small></article>
                <article className="cmi-stat-card"><span>OPEN FOLLOW-UPS</span><strong>{canReadTasks ? openTasks.length : "—"}</strong><small>{canReadTasks ? "Open or in-progress tasks" : "Task access not granted"}</small></article>
                <article className="cmi-stat-card"><span>COMPLETED TASKS</span><strong>{canReadTasks ? completedTasks.length : "—"}</strong><small>{canReadTasks ? "Completed in loaded records" : "Task access not granted"}</small></article>
              </div>
              <div className="cmi-panel"><div className="cmi-panel-heading"><div><p className="cmi-eyebrow">ACCESS SUMMARY</p><h3>What you can work with</h3></div></div>
                <div className="cmi-permission-list">
                  <div><span className={canReadContacts ? "cmi-dot enabled" : "cmi-dot"} />Contacts and visitor records <strong>{canReadContacts ? "Available" : "Not granted"}</strong></div>
                  <div><span className={canReadTasks ? "cmi-dot enabled" : "cmi-dot"} />Follow-up tasks <strong>{canReadTasks ? "Available" : "Not granted"}</strong></div>
                  <div><span className="cmi-dot" />Prayer narratives and reports <strong>Unavailable in this release</strong></div>
                </div>
              </div>
            </>
          )}

          {page === "Contacts" && (canReadContacts || canCreateContacts) && <div className="cmi-panel">
            <div className="cmi-panel-heading"><div><p className="cmi-eyebrow">PEOPLE & CONNECTION</p><h3>Contacts</h3><p>Only contacts within your server-authorised scope are shown.</p></div>
              {canCreateContacts && <button className="cmi-button cmi-button-primary" onClick={() => setShowContactForm((value) => !value)}><Plus size={16} />Add contact</button>}
            </div>
            {canReadContacts && <label className="cmi-search"><Search size={16} /><input aria-label="Search contacts by first name" maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts by first name" /></label>}
            {!canReadContacts && <p className="cmi-scope-note">You can capture new contacts, but your current access does not include browsing existing contact records.</p>}
            {showContactForm && canCreateContacts && <form className="cmi-form-grid" onSubmit={createContact}>
              <label>First name<input name="first_name" required maxLength={120} autoComplete="given-name" /></label>
              <label>Last name<input name="last_name" required maxLength={120} autoComplete="family-name" /></label>
              <label>Preferred name <span>Optional</span><input name="preferred_name" maxLength={120} /></label>
              {canCaptureIdentity && <label>Phone number <span>Optional · restricted identity field</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>}
              <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => setShowContactForm(false)}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : "Save contact"}</button></div>
            </form>}
            {canReadContacts && <>
              <div className="cmi-table-wrap"><table className="cmi-table"><thead><tr><th>CONTACT</th><th>STATUS</th><th>LANGUAGE</th><th>IDENTITY</th></tr></thead><tbody>
                {visibleContacts.map((contact) => <tr key={contact.id}><td data-label="Contact"><strong>{displayName(contact)}</strong><small>{contact.id}</small></td><td data-label="Status"><span className="cmi-status">{statusLabel(contact.contact_status)}</span></td><td data-label="Language">{contact.preferred_language || "Not recorded"}</td><td data-label="Identity">{canReadIdentity && !contact.identity_redacted ? (contact.phone_display || contact.phone_e164 || "Not recorded") : "Restricted"}</td></tr>)}
              </tbody></table>{!visibleContacts.length && !loading && <p className="cmi-empty-row">No contacts are available for this search and access scope.</p>}</div>
              {contactsHasMore && <div className="cmi-load-more"><button className="cmi-button cmi-button-secondary" onClick={() => void loadMoreContacts()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more contacts"}</button></div>}
            </>}
          </div>}

          {page === "Follow-up" && canReadTasks && <div className="cmi-panel">
            <div className="cmi-panel-heading"><div><p className="cmi-eyebrow">CARE IN ACTION</p><h3>Follow-up tasks</h3><p>Task records are filtered by the backend using your active branch and scope.</p></div>
              {canSelfAssignTask && <button className="cmi-button cmi-button-primary" onClick={() => setShowTaskForm((value) => !value)} disabled={!canReadContacts || !contacts.length}><Plus size={16} />New task</button>}
              {canCreateTasks && !canSelfAssignTask && <span className="cmi-scope-note">Task creation is granted, but a supported team assignment target is not available in this workspace.</span>}
            </div>
            {showTaskForm && canCreateTasks && <form className="cmi-form-grid" onSubmit={createTask}>
              <label className="cmi-field-wide">Contact<select name="contact_id" required defaultValue=""><option value="" disabled>Select a visible contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{displayName(contact)}</option>)}</select></label>
              <label>Priority<select name="priority" defaultValue="2"><option value="1">Urgent</option><option value="2">Normal</option><option value="3">Low</option><option value="4">Very low</option><option value="5">Minimal</option></select></label>
              <label>Due date and time<input type="datetime-local" name="due_at" /></label>
              <label className="cmi-field-wide">Operational note <span>Do not enter pastoral narratives or sensitive identity data</span><textarea name="task_note" rows={3} maxLength={1000} /></label>
              <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => setShowTaskForm(false)}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : "Create task"}</button></div>
            </form>}
            <div className="cmi-task-list">{tasks.map((task) => {
              const contact = contactById.get(task.contact_id);
              return <article className="cmi-task-row" key={task.id}><div className="cmi-task-symbol"><CalendarClock size={18} /></div>
                <div className="cmi-task-copy"><strong>{contact ? displayName(contact) : "Contact details restricted"}</strong><p>{task.task_note || "No operational note"}</p><small>{formatDate(task.due_at, branchTimeZone)} · Priority {task.priority}</small></div>
                <span className={`cmi-task-status status-${task.status}`}>{statusLabel(task.status)}</span>
                {canUpdateTasks && (task.status === "open" || task.status === "in_progress") && <button className="cmi-complete-button" onClick={() => void completeTask(task)} aria-label="Mark task complete" title="Mark task complete"><CheckCircle2 size={18} /></button>}
              </article>;
            })}{!tasks.length && !loading && <p className="cmi-empty-row">No follow-up tasks are visible in this branch scope.</p>}</div>
            {tasksHasMore && <div className="cmi-load-more"><button className="cmi-button cmi-button-secondary" onClick={() => void loadMoreTasks()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more tasks"}</button></div>}
          </div>}

          {!canReadContacts && !canCreateContacts && page === "Contacts" && <div className="cmi-panel cmi-empty-state"><ShieldCheck size={24} /><h3>Contact access is not granted</h3><p>Your assigned role has no contact-read capability for this branch.</p></div>}
          {!canReadTasks && page === "Follow-up" && <div className="cmi-panel cmi-empty-state"><ShieldCheck size={24} /><h3>Follow-up access is not granted</h3><p>Your assigned role has no follow-up-read capability for this branch.</p></div>}
          {!availablePages.includes(page) && <div className="cmi-panel cmi-empty-state"><ShieldCheck size={24} /><h3>This section is unavailable</h3><p>Your session does not contain an active permission for this section.</p></div>}
        </section>
        <footer className="cmi-footer"><span>PCG Missions · Staff operations</span><span>Powered by ElTech</span></footer>
      </main>
    </div>
  );
}
