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
          <p className="cmi-dashboard-eyebrow"><span className="cmi-dashboard-live-dot" />{todayInTimeZone(branchTimeZone)} <span className="cmi-dashboard-date-divider">/</span> YOUR MINISTRY, IN MOTION</p>
          <h2 id="cmi-dashboard-title">Welcome back, <span>{firstName}</span>.</h2>
          <p className="cmi-dashboard-hero-message">Every thoughtful follow-up makes a difference. Here’s your space to keep people connected and ministry moving.</p>
          <div className="cmi-dashboard-hero-foot"><ShieldCheck size={15} /><span>Your workspace is secure and tailored to your role.</span></div>
        </div>
        <div className="cmi-dashboard-hero-art" aria-hidden="true">
          <svg viewBox="0 0 330 210" role="presentation" focusable="false">
            <defs>
              <linearGradient id="ministry-sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6dfaa" /><stop offset="1" stopColor="#d6b46d" /></linearGradient>
              <linearGradient id="ministry-ground" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#789b88" /><stop offset="1" stopColor="#315e50" /></linearGradient>
            </defs>
            <circle cx="235" cy="74" r="48" fill="url(#ministry-sun)" opacity=".95" />
            <path d="M28 184c33-49 73-68 121-57 33 8 55 30 80 28 30-2 49-26 77-25v80H28z" fill="#b7cdbd" opacity=".82" />
            <path d="M44 196c45-39 82-48 117-30 24 12 42 25 70 18 22-6 42-22 72-20v47H44z" fill="url(#ministry-ground)" />
            <path d="M145 145c-18-22-14-47 5-54 17-6 30 7 30 23 2-17 17-27 31-19 18 10 13 36-7 53l-26 22z" fill="#f4f0e5" />
            <circle cx="151" cy="62" r="14" fill="#bd8966" /><path d="M135 59c1-17 31-22 34-1-7-5-17-6-34 1" fill="#294b43" />
            <path d="M123 133c-4-25 4-42 27-45 22-2 32 13 33 39l-3 27h-53z" fill="#e5b85e" />
            <circle cx="214" cy="93" r="12" fill="#8e6048" /><path d="M202 90c3-16 26-17 28 0-9-5-17-5-28 0" fill="#253e3a" />
            <path d="M189 157c-2-24 6-42 25-43 22-1 30 17 27 43l-3 17h-47z" fill="#dce8df" />
            <path d="M92 174c12-20 25-28 39-23 13 4 19 17 21 29" fill="none" stroke="#f5e9c9" strokeWidth="5" strokeLinecap="round" opacity=".9" />
            <path d="M253 135l5-12 5 12 12 5-12 5-5 12-5-12-12-5z" fill="#f5e4bb" opacity=".95" />
            <circle cx="77" cy="63" r="3" fill="#d9bd7b" /><circle cx="286" cy="42" r="4" fill="#d9bd7b" /><circle cx="66" cy="119" r="2.5" fill="#d9bd7b" />
          </svg>
          <span className="cmi-dashboard-art-caption">CONNECTED BY CARE</span>
        </div>
        <div className="cmi-dashboard-hero-brand">
          <span className="cmi-dashboard-branch-mark"><ShieldCheck size={17} /></span>
          <span><small>STAFF PORTAL</small><strong>PCG Missions</strong></span>
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
