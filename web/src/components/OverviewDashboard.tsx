import {
  ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, ChevronDown, Clock3,
  ClipboardList, LockKeyhole, Plus, ShieldCheck, Users,
} from "lucide-react";
import type { ContactRecord, FollowUpTask } from "../lib/cmi-api";

interface OverviewDashboardProps {
  staffName: string;
  branchTimeZone: string;
  contacts: ContactRecord[];
  tasks: FollowUpTask[];
  contactsHasMore: boolean;
  tasksHasMore: boolean;
  canReadContacts: boolean;
  canCreateContacts: boolean;
  canReadTasks: boolean;
  canCreateTasks: boolean;
  canReadStaffDirectory: boolean;
  canManagePasswordResets: boolean;
  canAccessTeams: boolean;
  canAccessReports: boolean;
  onOpenContacts: () => void;
  onCreateContact: () => void;
  onOpenFollowUp: () => void;
  onCreateTask: () => void;
}

function contactName(contact: ContactRecord): string {
  return contact.preferred_name?.trim() ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Contact";
}

function formatDate(value: string | null, timeZone: string): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat("en-GH", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GH", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    }).format(date);
  }
}

function isTaskOverdue(task: FollowUpTask, now: number): boolean {
  return (task.status === "open" || task.status === "in_progress") &&
    !!task.due_at && new Date(task.due_at).getTime() < now;
}

function todayInTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GH", {
      weekday: "long", day: "numeric", month: "long", timeZone,
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-GH", {
      weekday: "long", day: "numeric", month: "long",
    }).format(new Date());
  }
}

export function OverviewDashboard({
  staffName, branchTimeZone, contacts, tasks, contactsHasMore, tasksHasMore,
  canReadContacts, canCreateContacts, canReadTasks, canCreateTasks,
  canReadStaffDirectory, canManagePasswordResets, canAccessTeams, canAccessReports,
  onOpenContacts, onCreateContact, onOpenFollowUp, onCreateTask,
}: OverviewDashboardProps) {
  const firstName = staffName.trim().split(/\s+/)[0] || "there";
  const now = Date.now();
  const openTasks = tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  const overdueTasks = openTasks.filter((task) => isTaskOverdue(task, now));
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
  const priorityQueue = [...openTasks].sort((a, b) => {
    const overdueDifference = Number(isTaskOverdue(b, now)) - Number(isTaskOverdue(a, now));
    if (overdueDifference !== 0) return overdueDifference;
    const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  }).slice(0, 5);
  const canCreateTaskFromOverview = canCreateTasks && canReadContacts && contacts.length > 0;
  const availableCount = [
    canReadContacts, canReadTasks, canReadStaffDirectory, canManagePasswordResets,
    canAccessTeams, canAccessReports,
  ].filter(Boolean).length;

  return (
    <div className="cmi-dashboard">
      <section className="cmi-dashboard-hero" aria-labelledby="cmi-dashboard-title">
        <div className="cmi-dashboard-hero-copy">
          <p className="cmi-dashboard-eyebrow">{todayInTimeZone(branchTimeZone)}</p>
          <h2 id="cmi-dashboard-title">Welcome back, {firstName}</h2>
          <p>Your ministry workspace for <strong>{branchName}</strong>. Here is what needs your attention today.</p>
        </div>
        <div className="cmi-dashboard-hero-meta">
          <span className="cmi-dashboard-branch-mark"><ShieldCheck size={19} /></span>
          <span><small>ACTIVE WORKSPACE</small><strong>{branchName}</strong></span>
        </div>
      </section>

      <section className="cmi-dashboard-metrics" aria-label="Workspace summary">
        {canReadContacts && (
          <article className="cmi-dashboard-metric">
            <span className="cmi-dashboard-metric-icon"><Users size={18} /></span>
            <div><small>CONTACTS LOADED</small><strong>{contacts.length}</strong><span>{contactsHasMore ? "First 50-record preview" : "In your current access scope"}</span></div>
            <button type="button" aria-label="Open contacts" onClick={onOpenContacts}><ArrowUpRight size={16} /></button>
          </article>
        )}
        {canReadTasks && (
          <>
            <article className="cmi-dashboard-metric">
              <span className="cmi-dashboard-metric-icon"><ClipboardList size={18} /></span>
              <div><small>OPEN FOLLOW-UPS</small><strong>{openTasks.length}</strong><span>{tasksHasMore ? "From the first 50 loaded tasks" : "In loaded task records"}</span></div>
              <button type="button" aria-label="Open follow-up tasks" onClick={onOpenFollowUp}><ArrowUpRight size={16} /></button>
            </article>
            <article className={"cmi-dashboard-metric" + (overdueTasks.length ? " is-alert" : "")}>
              <span className="cmi-dashboard-metric-icon"><Clock3 size={18} /></span>
              <div><small>OVERDUE</small><strong>{overdueTasks.length}</strong><span>Open tasks past their due time</span></div>
              <button type="button" aria-label="Review follow-up tasks" onClick={onOpenFollowUp}><ArrowUpRight size={16} /></button>
            </article>
            <article className="cmi-dashboard-metric">
              <span className="cmi-dashboard-metric-icon"><CheckCircle2 size={18} /></span>
              <div><small>COMPLETED</small><strong>{completedTasks.length}</strong><span>In loaded task records</span></div>
              <button type="button" aria-label="View follow-up history" onClick={onOpenFollowUp}><ArrowUpRight size={16} /></button>
            </article>
          </>
        )}
      </section>

      <div className="cmi-dashboard-columns">
        <section className="cmi-dashboard-queue" aria-labelledby="cmi-dashboard-queue-title">
          <div className="cmi-dashboard-section-heading">
            <div>
              <p className="cmi-dashboard-eyebrow">PRIORITY WORK</p>
              <h3 id="cmi-dashboard-queue-title">Your follow-up queue</h3>
              <p>Start with overdue work, then what is due next.</p>
            </div>
            {canReadTasks && <button type="button" className="cmi-dashboard-link" onClick={onOpenFollowUp}>View all <ArrowRight size={15} /></button>}
          </div>

          {!canReadTasks ? (
            <div className="cmi-dashboard-empty">
              <span className="cmi-dashboard-empty-icon"><LockKeyhole size={19} /></span>
              <strong>Follow-up access is not granted</strong>
              <p>Your current role does not include access to follow-up tasks.</p>
            </div>
          ) : priorityQueue.length === 0 ? (
            <div className="cmi-dashboard-empty">
              <span className="cmi-dashboard-empty-icon is-positive"><CheckCircle2 size={20} /></span>
              <strong>You have no open follow-up tasks in the loaded records</strong>
              <p>When a follow-up is assigned to your workspace, it will appear here.</p>
              {canCreateTaskFromOverview && <button type="button" className="cmi-dashboard-secondary-action" onClick={onCreateTask}><Plus size={15} /> New follow-up</button>}
            </div>
          ) : (
            <div className="cmi-dashboard-task-list">
              {priorityQueue.map((task) => {
                const overdue = isTaskOverdue(task, now);
                const contact = canReadContacts ? contactMap.get(task.contact_id) : undefined;
                return (
                  <article className="cmi-dashboard-task" key={task.id}>
                    <span className={"cmi-dashboard-task-indicator" + (overdue ? " is-overdue" : "")} />
                    <div className="cmi-dashboard-task-copy">
                      <strong>{contact ? contactName(contact) : canReadContacts ? "Linked contact" : "Contact details are restricted"}</strong>
                      <span>{task.status === "in_progress" ? "In progress" : "Open"} · Priority {task.priority}/5</span>
                    </div>
                    <div className="cmi-dashboard-task-due">
                      <span className={overdue ? "is-overdue" : ""}>{overdue ? "Overdue" : "Due"}</span>
                      <strong>{formatDate(task.due_at, branchTimeZone)}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {canReadTasks && tasksHasMore && <p className="cmi-dashboard-preview-note">This queue is based on the first 50 loaded task records, not a complete branch-wide total.</p>}
        </section>

        <aside className="cmi-dashboard-side">
          <section className="cmi-dashboard-quick-actions" aria-labelledby="cmi-dashboard-actions-title">
            <div className="cmi-dashboard-section-heading compact">
              <div><p className="cmi-dashboard-eyebrow">KEEP THINGS MOVING</p><h3 id="cmi-dashboard-actions-title">Quick actions</h3></div>
            </div>
            <div className="cmi-dashboard-actions-list">
              {canCreateContacts && (
                <button type="button" className="cmi-dashboard-action" onClick={onCreateContact}>
                  <span className="cmi-dashboard-action-icon"><Plus size={18} /></span>
                  <span><strong>Add contact</strong><small>Record a new visitor or contact</small></span>
                  <ArrowRight size={16} />
                </button>
              )}
              {canCreateTaskFromOverview && (
                <button type="button" className="cmi-dashboard-action" onClick={onCreateTask}>
                  <span className="cmi-dashboard-action-icon"><CalendarClock size={18} /></span>
                  <span><strong>New follow-up</strong><small>Schedule the next action</small></span>
                  <ArrowRight size={16} />
                </button>
              )}
              {canReadContacts && !canCreateContacts && (
                <button type="button" className="cmi-dashboard-action" onClick={onOpenContacts}>
                  <span className="cmi-dashboard-action-icon"><Users size={18} /></span>
                  <span><strong>Open contacts</strong><small>Review accessible contact records</small></span>
                  <ArrowRight size={16} />
                </button>
              )}
              {canReadTasks && !canCreateTaskFromOverview && (
                <button type="button" className="cmi-dashboard-action" onClick={onOpenFollowUp}>
                  <span className="cmi-dashboard-action-icon"><ClipboardList size={18} /></span>
                  <span><strong>Open follow-up</strong><small>Review your task list</small></span>
                  <ArrowRight size={16} />
                </button>
              )}
              {!canCreateContacts && !canReadContacts && !canReadTasks && <p className="cmi-dashboard-no-actions">No operational actions are currently available to your role.</p>}
            </div>
            {canCreateTasks && !canCreateTaskFromOverview && <p className="cmi-dashboard-action-hint">To create a follow-up, you need an accessible contact record first.</p>}
          </section>

          <details className="cmi-dashboard-access">
            <summary>
              <span className="cmi-dashboard-access-icon"><ShieldCheck size={17} /></span>
              <span><strong>Workspace access</strong><small>{availableCount} areas currently available</small></span>
              <ChevronDown size={17} />
            </summary>
            <div className="cmi-dashboard-access-content">
              <div><span>Contacts</span><strong>{canReadContacts ? "Available" : "Not granted"}</strong></div>
              <div><span>Follow-up tasks</span><strong>{canReadTasks ? "Available" : "Not granted"}</strong></div>
              <div><span>Staff directory</span><strong>{canReadStaffDirectory ? "Available" : "Not granted"}</strong></div>
              <div><span>Password-reset requests</span><strong>{canManagePasswordResets ? "Available" : "Not granted"}</strong></div>
              <div><span>Teams & service areas</span><strong>{canAccessTeams ? "Available" : "Not granted"}</strong></div>
              <div><span>Ministry reports</span><strong>{canAccessReports ? "Available" : "Not granted"}</strong></div>
              <p><LockKeyhole size={13} /> Data access is enforced by your active role grants and branch assignment.</p>
            </div>
          </details>
          <div className="cmi-dashboard-trust-note"><span><ShieldCheck size={16} /></span><p>Your workspace only shows records and actions permitted by your current role.</p></div>
        </aside>
      </div>
    </div>
  );
}
