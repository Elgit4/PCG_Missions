import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3,
  HeartHandshake, Home, LayoutDashboard, ListFilter, LogOut, Menu, MessageCircle,
  MoreHorizontal, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Users,
  X, type LucideIcon,
} from "lucide-react";
import { capabilities, dashboardCopy, events, initialContacts, initialTasks, prayerItems, roles, type Contact, type Page, type Role, type Task } from "./data";

const iconByPage: Record<Page, LucideIcon> = {
  Overview: LayoutDashboard, Contacts: Users, "Follow-up": ClipboardList,
  Prayer: HeartHandshake, Events: CalendarDays, Reports: Activity, Team: ShieldCheck,
};

const pathByPage: Record<Page, string> = {
  Overview: "Home", Contacts: "People & follow-up", "Follow-up": "People & follow-up",
  Prayer: "Pastoral care", Events: "Gatherings", Reports: "Insights", Team: "Administration",
};

const navGroups = [
  { label: "YOUR WORK", pages: ["Overview", "Follow-up"] as Page[] },
  { label: "MINISTRY", pages: ["Contacts", "Prayer", "Events"] as Page[] },
  { label: "MANAGE", pages: ["Reports", "Team"] as Page[] },
];

function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [role, setRole] = useState<Role>("Coordinator");
  const [contacts, setContacts] = useState(initialContacts);
  const [tasks, setTasks] = useState(initialTasks);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All contacts");
  const [showCapture, setShowCapture] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [toast, setToast] = useState("");

  const allowedPages = capabilities[role];
  const visiblePages = allowedPages;

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const navigate = (next: Page) => {
    if (!allowedPages.includes(next)) return;
    setPage(next);
    setShowMobileMenu(false);
  };

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      const matchesQuery = !normalized || `${contact.name} ${contact.phone} ${contact.location} ${contact.id}`.toLowerCase().includes(normalized);
      const matchesFilter = filter === "All contacts" || (filter === "Needs assignment" && contact.owner === "Unassigned") || (filter === "In follow-up" && contact.status === "In follow-up") || (filter === "Returned" && contact.status === "Returned");
      return matchesQuery && matchesFilter;
    });
  }, [contacts, filter, query]);

  const completeTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
    notify("Follow-up marked complete");
  };

  const addContact = (contact: Contact) => {
    setContacts((current) => [contact, ...current]);
    setShowCapture(false);
    setPage("Contacts");
    notify("Visitor saved to the demo list");
  };

  const onRoleChange = (next: Role) => {
    setRole(next);
    if (!capabilities[next].includes(page)) setPage("Overview");
    setShowRoleMenu(false);
  };

  const currentCopy = dashboardCopy[role];

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div className="brand-text"><strong>CMI</strong><span>FOLLOW-UP</span></div>
          <button className="icon-button sidebar-collapse" aria-label="Collapse navigation" onClick={() => notify("Navigation is already at its compact width")}>‹</button>
        </div>

        <button className="workspace-switch" onClick={() => notify("One CMI church workspace") }>
          <span className="workspace-seal">C</span><span className="workspace-copy"><strong>CMI · Adenta</strong><small>Church workspace</small></span><ChevronDown size={15} />
        </button>

        <nav className="primary-nav" aria-label="Main navigation">
          {navGroups.map((group) => {
            const items = group.pages.filter((item) => visiblePages.includes(item));
            if (!items.length) return null;
            return <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {items.map((item) => {
                const Icon = iconByPage[item];
                return <button key={item} className={`nav-item ${page === item ? "active" : ""}`} onClick={() => navigate(item)} aria-current={page === item ? "page" : undefined}>
                  <Icon size={17} strokeWidth={1.8} /><span>{item === "Overview" ? "Overview" : item === "Follow-up" ? "My follow-up" : item}</span>{item === "Follow-up" && <span className="nav-count">4</span>}
                </button>;
              })}
            </div>;
          })}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item help-link" onClick={() => notify("Help centre is not connected in this preview") }><CircleHelp size={17} /><span>Help & support</span></button>
          <div className="profile-card">
            <div className="avatar avatar-forest">EB</div><div className="profile-copy"><strong>Esi Boateng</strong><span>{role}</span></div><button className="icon-button" aria-label="Account menu" onClick={() => notify("Account settings are a preview only")}><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setShowMobileMenu(true)}><Menu size={21} /></button>
          <div className="breadcrumbs"><span>{pathByPage[page]}</span><ChevronRight size={14} /><strong>{page === "Follow-up" ? "My follow-up" : page}</strong></div>
          <div className="topbar-actions">
            <span className="connection-pill"><span /> Preview mode</span>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify("You’re all caught up") }><Bell size={18} /><i /></button>
            <button className="role-preview" onClick={() => setShowRoleMenu((value) => !value)} aria-expanded={showRoleMenu}><span className="preview-dot" /> Preview as <strong>{role}</strong><ChevronDown size={14} /></button>
          </div>
          {showRoleMenu && <div className="role-menu" role="menu">{roles.map((option) => <button role="menuitem" key={option} onClick={() => onRoleChange(option)}><span className={option === role ? "role-check selected" : "role-check"}>{option === role && <Check size={12} />}</span>{option}</button>)}</div>}
        </header>

        <div className="demo-ribbon"><Sparkles size={14} /><span><strong>Design preview</strong><span className="ribbon-divider">·</span> All records are synthetic. Changes stay in this browser session.</span><button onClick={() => notify("No real ministry data is connected")}>About this preview <ArrowRight size={13} /></button></div>

        <main id="main-content" className="content-area" tabIndex={-1}>
          {page === "Overview" && <Overview role={role} copy={currentCopy} tasks={tasks} navigate={navigate} completeTask={completeTask} onCapture={() => setShowCapture(true)} />}
          {page === "Contacts" && <ContactsPage contacts={filteredContacts} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onCapture={() => setShowCapture(true)} />}
          {page === "Follow-up" && <FollowUpPage tasks={tasks} completeTask={completeTask} />}
          {page === "Prayer" && <PrayerPage notify={notify} />}
          {page === "Events" && <EventsPage notify={notify} />}
          {page === "Reports" && <ReportsPage />}
          {page === "Team" && <TeamPage notify={notify} />}
        </main>
      </section>

      {showMobileMenu && <div className="mobile-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMobileMenu(false); }}><div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation"><div className="drawer-heading"><strong>CMI Follow-up</strong><button className="icon-button" aria-label="Close navigation" onClick={() => setShowMobileMenu(false)}><X size={19} /></button></div>{visiblePages.map((item) => { const Icon = iconByPage[item]; return <button key={item} className={`nav-item ${page === item ? "active" : ""}`} onClick={() => navigate(item)}><Icon size={18} /><span>{item === "Follow-up" ? "My follow-up" : item}</span></button>; })}<div className="drawer-note"><ShieldCheck size={16} /> Your access is determined by your assigned role and permissions.</div></div></div>}
      {showCapture && <CaptureDialog onClose={() => setShowCapture(false)} onSave={addContact} />}
      {toast && <div role="status" aria-live="polite" className="toast"><CheckCircleIcon />{toast}</div>}
      <div className="mobile-tabbar" aria-label="Quick navigation">{["Overview", "Contacts", "Follow-up", ...(role === "Prayer Intercessor" ? ["Prayer"] : []), "Events"].filter((item) => visiblePages.includes(item as Page)).slice(0, 5).map((item) => { const typed = item as Page; const Icon = iconByPage[typed]; return <button key={item} className={page === typed ? "selected" : ""} onClick={() => navigate(typed)}><Icon size={19} /><span>{typed === "Follow-up" ? "My work" : typed}</span></button>; })}</div>
    </div>
  );
}

function CheckCircleIcon() { return <span className="toast-icon"><Check size={14} /></span>; }

function Overview({ role, copy, tasks, navigate, completeTask, onCapture }: { role: Role; copy: { greeting: string; message: string; focus: string }; tasks: Task[]; navigate: (page: Page) => void; completeTask: (id: string) => void; onCapture: () => void }) {
  const prayerOnly = role === "Prayer Intercessor";
  return <>
    <div className="page-heading overview-heading"><div><p className="eyebrow"><span className="eyebrow-rule" /> {copy.focus.toUpperCase()} <span className="eyebrow-date">SUNDAY, NOVEMBER 8</span></p><h1>{copy.greeting}</h1><p className="page-subtitle">{copy.message}</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => navigate("Events")}><CalendarDays size={16} />View calendar</button><button className="button button-primary" onClick={onCapture}><Plus size={17} />Capture visitor</button></div></div>
    <div className="welcome-strip"><div className="welcome-copy"><span className="welcome-kicker">THIS WEEK AT CMI</span><h2>Make room for a new beginning.</h2><p>Sunday service · 8:00 AM · Main auditorium</p><button onClick={() => navigate("Events")}>Open event details <ArrowRight size={14} /></button></div><div className="welcome-art" aria-label="Abstract illustration of a sun rising over hills"><div className="sun-disc"/><div className="hill hill-back"/><div className="hill hill-front"/><span className="art-stem stem-one"/><span className="art-stem stem-two"/></div><div className="welcome-index">08 <span>WEEK<br/>45</span></div></div>
    <section className="metric-grid" aria-label="Ministry summary">
      <Metric label={prayerOnly ? "Requests assigned" : "New visitors"} value={prayerOnly ? "8" : "24"} change={prayerOnly ? "2 new this week" : "+18% this month"} icon={prayerOnly ? HeartHandshake : Users} accent="green" />
      <Metric label={prayerOnly ? "In prayer" : "Follow-up due"} value={prayerOnly ? "5" : "12"} change={prayerOnly ? "3 updated recently" : "4 need attention"} icon={prayerOnly ? CheckCheck : Clock3} accent="amber" />
      <Metric label={prayerOnly ? "Prayed this week" : "Returned visitors"} value={prayerOnly ? "14" : "16"} change={prayerOnly ? "Your activity" : "+6 from last week"} icon={prayerOnly ? HeartHandshake : ArrowUpRight} accent="clay" />
      {!prayerOnly && <Metric label="Upcoming events" value="3" change="Next: Sunday service" icon={CalendarDays} accent="blue" />}
    </section>

    <div className="dashboard-columns">
      <section className="panel task-panel">
        <div className="panel-header"><div><p className="section-kicker">THE NEXT RIGHT THING</p><h2>{prayerOnly ? "Your prayer list" : "Today’s follow-up"}</h2><p className="panel-description">{prayerOnly ? "Assigned requests, held with care." : "A clear next step for every conversation."}</p></div><button className="text-button" onClick={() => navigate(prayerOnly ? "Prayer" : "Follow-up")}>View all <ArrowRight size={15} /></button></div>
        {prayerOnly ? <div className="prayer-teaser"><div className="prayer-mark"><HeartHandshake size={21} /></div><div><strong>2 requests need your attention</strong><span>One new request was assigned this morning.</span></div><button className="button button-secondary button-small" onClick={() => navigate("Prayer")}>Open prayer desk</button></div> : <TaskList tasks={tasks.slice(0, 3)} onComplete={completeTask} compact />}
        <div className="panel-footnote"><span className="footnote-dot" />{prayerOnly ? "Private to your assigned prayer work" : "Showing your assigned tasks only"}</div>
      </section>

      <section className="panel activity-panel"><div className="panel-header"><div><p className="section-kicker">A LITTLE MOMENTUM</p><h2>Ministry pulse</h2></div><button className="icon-button panel-menu" aria-label="More ministry pulse options"><MoreHorizontal size={18} /></button></div><div className="pulse-summary"><div><strong>{prayerOnly ? "14" : "38"}</strong><span>{prayerOnly ? "prayers offered this week" : "meaningful follow-ups this week"}</span></div><span className="pulse-trend"><ArrowUpRight size={14} /> 12%</span></div><div className="chart-wrap" role="img" aria-label="Activity rose through the week and peaked on Sunday"><div className="chart-y-labels"><span>16</span><span>12</span><span>8</span><span>4</span></div><div className="chart-content"><div className="chart-gridlines"><i/><i/><i/><i/></div><svg viewBox="0 0 520 126" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#31765e" stopOpacity=".18"/><stop offset="100%" stopColor="#31765e" stopOpacity="0"/></linearGradient></defs><path d="M0 103 C30 99 42 72 79 79 S130 88 160 62 S214 75 242 56 S292 67 320 41 S370 51 399 27 S462 51 520 12 L520 126 L0 126 Z" fill="url(#chartFill)"/><path d="M0 103 C30 99 42 72 79 79 S130 88 160 62 S214 75 242 56 S292 67 320 41 S370 51 399 27 S462 51 520 12" fill="none" stroke="#286e56" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round"/></svg><div className="chart-x-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div></div><div className="chart-legend"><span><i className="legend-green"/>{prayerOnly ? "Prayer activity" : "Follow-up completed"}</span><span>Last 7 days</span></div></section>
    </div>

    {!prayerOnly && <div className="lower-grid"><section className="panel contact-panel"><div className="panel-header"><div><p className="section-kicker">FRESH CONNECTIONS</p><h2>Recently welcomed</h2></div><button className="text-button" onClick={() => navigate("Contacts")}>All contacts <ArrowRight size={15}/></button></div><div className="mini-contact-list">{initialContacts.slice(0, 3).map((contact) => <div className="mini-contact" key={contact.id}><div className={`avatar avatar-${contact.accent}`}>{contact.initials}</div><div className="mini-contact-main"><strong>{contact.name}</strong><span>{contact.source} · {contact.date}</span></div><StatusBadge status={contact.status}/><button className="row-action" aria-label={`Open ${contact.name}`} onClick={() => navigate("Contacts")}><ChevronRight size={16}/></button></div>)}</div></section><section className="panel event-panel"><div className="panel-header"><div><p className="section-kicker">SAVE THE DATE</p><h2>Coming together</h2></div><button className="icon-button panel-menu" aria-label="More event options"><MoreHorizontal size={18}/></button></div><div className="next-event"><div className="calendar-tile"><span>NOV</span><strong>15</strong></div><div><span className="event-type">SUNDAY SERVICE</span><strong>Community & Care Sunday</strong><span>8:00 AM · Main auditorium</span></div><button className="row-action" aria-label="View event" onClick={() => navigate("Events")}><ArrowRight size={16}/></button></div><div className="event-footer"><span><Users size={14}/> 126 expected</span><span className="event-going">Open event <ChevronRight size={13}/></span></div></section></div>}
    <div className="data-note"><ShieldCheck size={14}/><span>This preview uses example records only. Do not enter real visitor or pastoral information.</span></div>
  </>;
}

function Metric({ label, value, change, icon: Icon, accent }: { label: string; value: string; change: string; icon: LucideIcon; accent: string }) {
  return <div className="metric-card"><div className={`metric-icon metric-${accent}`}><Icon size={17} strokeWidth={1.8}/></div><span className="metric-label">{label}</span><div className="metric-row"><strong>{value}</strong><span className="metric-change">{change}</span></div></div>;
}

function ContactsPage({ contacts, query, setQuery, filter, setFilter, onCapture }: { contacts: Contact[]; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; onCapture: () => void }) {
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> PEOPLE & FOLLOW-UP</p><h1>People we’ve welcomed</h1><p className="page-subtitle">Keep every connection visible and every next step clear.</p></div><button className="button button-primary" onClick={onCapture}><Plus size={17}/>Capture visitor</button></div>
    <section className="panel directory-panel"><div className="directory-toolbar"><div className="directory-tabs">{["All contacts", "Needs assignment", "In follow-up", "Returned"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}{item === "Needs assignment" && <span className="tab-count">3</span>}</button>)}</div><div className="directory-controls"><label className="search-field"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" aria-label="Search contacts"/>{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button>}<kbd>⌘ K</kbd></label><button className="filter-button" onClick={() => setFilter(filter === "All contacts" ? "In follow-up" : "All contacts")}><SlidersHorizontal size={15}/>Filters</button></div></div>
    <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>PERSON</th><th>FIRST VISIT</th><th>HOW THEY FOUND US</th><th>FOLLOW-UP OWNER</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id}><td><div className="person-cell"><div className={`avatar avatar-${contact.accent}`}>{contact.initials}</div><div><strong>{contact.name}</strong><span>{contact.id} · {contact.location}</span></div></div></td><td>{contact.date}</td><td>{contact.source}</td><td><div className="owner-cell"><span className={contact.owner === "Unassigned" ? "owner-dot unassigned" : "owner-dot"}/>{contact.owner}</div></td><td><StatusBadge status={contact.status}/></td><td><button className="row-action" aria-label={`Open ${contact.name}`}><ChevronRight size={16}/></button></td></tr>)}</tbody></table>
    {contacts.length === 0 && <div className="empty-state"><div className="empty-icon"><Search size={20}/></div><strong>No people found</strong><span>Try another name or change the selected view.</span><button className="text-button" onClick={() => {setQuery("");setFilter("All contacts");}}>Clear search and filters</button></div>}
    <div className="contact-mobile-list">{contacts.map((contact) => <div className="contact-mobile-card" key={contact.id}><div className={`avatar avatar-${contact.accent}`}>{contact.initials}</div><div className="contact-mobile-copy"><strong>{contact.name}</strong><span>{contact.id} · {contact.location}</span><span>{contact.owner === "Unassigned" ? "Needs assignment" : `With ${contact.owner}`}</span></div><StatusBadge status={contact.status}/><ChevronRight size={16}/></div>)}</div>
    </div><div className="table-footer"><span>Showing <strong>{contacts.length}</strong> of 24 contacts</span><div><button disabled>Previous</button><span className="page-number">1</span><button>Next <ArrowRight size={13}/></button></div></div></section>
    <div className="data-note"><ShieldCheck size={14}/><span>Contact details shown here are synthetic and for interface review only.</span></div></>;
}

function FollowUpPage({ tasks, completeTask }: { tasks: Task[]; completeTask: (id: string) => void }) {
  const overdue = tasks.filter((task) => task.status === "Overdue");
  const today = tasks.filter((task) => task.status === "Due today");
  const upcoming = tasks.filter((task) => task.status === "Upcoming");
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> YOUR WORK</p><h1>My follow-up</h1><p className="page-subtitle">One conversation at a time. Your assigned next steps.</p></div><button className="button button-secondary" onClick={() => window.print()}><CalendarDays size={16}/>Print my list</button></div><div className="task-summary-strip"><div><strong>{tasks.length}</strong><span>open tasks</span></div><div><strong>{overdue.length}</strong><span>overdue</span></div><div><strong>3</strong><span>calls this week</span></div><div className="summary-next"><Clock3 size={17}/><span>Next task in</span><strong>35 min</strong></div></div>
    <div className="followup-layout"><section className="panel followup-panel"><div className="panel-header"><div><p className="section-kicker">TUESDAY, NOVEMBER 10</p><h2>Follow-up queue</h2></div><button className="filter-button"><ListFilter size={15}/>Sort: due date <ChevronDown size={13}/></button></div><TaskGroup label="Needs attention" helper="Past due · complete or reschedule" tasks={overdue} onComplete={completeTask} tone="overdue"/><TaskGroup label="Due today" helper="Your next conversations" tasks={today} onComplete={completeTask}/><TaskGroup label="Coming up" helper="Planned for later this week" tasks={upcoming} onComplete={completeTask}/></section><aside className="panel next-step-panel"><p className="section-kicker">A GOOD PLACE TO START</p><div className="next-step-icon"><MessageCircle size={20}/></div><h2>Welcome Ama</h2><p>She visited for the first time on Sunday and is waiting for a friendly hello.</p><div className="next-step-meta"><span>FIRST WELCOME CALL</span><strong>Today · 10:30 AM</strong></div><button className="button button-primary button-wide" onClick={() => alert("This preview does not place calls.")}>Open contact details <ArrowRight size={15}/></button><small>Call controls are not connected in this preview.</small></aside></div><div className="data-note"><ShieldCheck size={14}/><span>Tasks are assigned records, not automated judgements about engagement or retention.</span></div></>;
}

function TaskGroup({ label, helper, tasks, onComplete, tone = "" }: { label: string; helper: string; tasks: Task[]; onComplete: (id: string) => void; tone?: string }) {
  if (!tasks.length) return null;
  return <div className={`task-group ${tone}`}><div className="task-group-heading"><div><h3>{label} <span>{tasks.length}</span></h3><p>{helper}</p></div><button className="icon-button" aria-label={`More ${label.toLowerCase()} actions`}><MoreHorizontal size={17}/></button></div>{tasks.map((task) => <div className="task-row" key={task.id}><button className="task-check" aria-label={`Mark ${task.action} for ${task.name} complete`} onClick={() => onComplete(task.id)}><Check size={13}/></button><div className="avatar avatar-sage">{task.initials}</div><div className="task-person"><strong>{task.action}</strong><span>{task.name} · {task.id}</span></div><div className="task-due"><strong>{task.due}</strong><span>{task.time}</span></div><button className="row-action" aria-label={`Open task for ${task.name}`}><ChevronRight size={16}/></button></div>)}</div>;
}

function TaskList({ tasks, onComplete, compact = false }: { tasks: Task[]; onComplete: (id: string) => void; compact?: boolean }) {
  if (!tasks.length) return <div className="empty-inline"><span className="empty-check"><Check size={16}/></span><strong>You’re all caught up</strong><span>There are no open tasks right now.</span></div>;
  return <div className={`task-list ${compact ? "compact" : ""}`}>{tasks.map((task) => <div className="task-row" key={task.id}><button className="task-check" aria-label={`Mark ${task.action} for ${task.name} complete`} onClick={() => onComplete(task.id)}><Check size={13}/></button><div className="avatar avatar-sage">{task.initials}</div><div className="task-person"><strong>{task.action}</strong><span>{task.name}</span></div><div className="task-due"><strong className={task.status === "Overdue" ? "due-overdue" : ""}>{task.due}</strong><span>{task.time}</span></div>{!compact && <button className="row-action"><ChevronRight size={16}/></button>}</div>)}</div>;
}

function PrayerPage({ notify }: { notify: (message: string) => void }) {
  const [items, setItems] = useState(prayerItems);
  const update = (id: string, status: string) => { setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item)); notify("Prayer status updated in this preview"); };
  return <><div className="page-heading prayer-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> PASTORAL CARE · RESTRICTED</p><h1>Prayer desk</h1><p className="page-subtitle">A quiet space for the requests entrusted to you.</p></div><div className="confidential-tag"><ShieldCheck size={15}/> Assigned requests only</div></div><div className="privacy-callout"><div className="privacy-symbol"><ShieldCheck size={18}/></div><div><strong>Private by design</strong><span>Only requests assigned to you are shown. Keep conversations within the care team and do not copy sensitive details elsewhere.</span></div></div><div className="prayer-stats"><div className="prayer-stat"><span>Assigned to you</span><strong>8</strong></div><div className="prayer-stat"><span>In prayer</span><strong>5</strong></div><div className="prayer-stat"><span>Follow-up requested</span><strong>2</strong></div><div className="prayer-stat"><span>Prayed this week</span><strong>14</strong></div></div><section className="panel prayer-list-panel"><div className="panel-header"><div><p className="section-kicker">YOUR ASSIGNMENTS</p><h2>Requests in your care</h2></div><button className="filter-button"><ListFilter size={15}/>Filter</button></div>{items.map((item) => <article className="prayer-card" key={item.id}><div className="prayer-card-icon"><HeartHandshake size={19}/></div><div className="prayer-content"><div className="prayer-card-heading"><div><span className="request-id">{item.id}</span><h3>{item.title}</h3></div><StatusBadge status={item.status}/></div><p>{item.detail}</p><div className="prayer-card-foot"><span><Clock3 size={13}/>{item.received}</span><div><button className="button button-quiet button-small" onClick={() => update(item.id, "In prayer")}>Mark in prayer</button><button className="button button-secondary button-small" onClick={() => update(item.id, "Prayed")}>Mark prayed <Check size={13}/></button></div></div></div></article>)}</section><div className="data-note sensitive-note"><ShieldCheck size={14}/><span>Prayer content is shown only for the active role preview. No sensitive details are stored or sent.</span></div></>;
}

function EventsPage({ notify }: { notify: (message: string) => void }) {
  const [registered, setRegistered] = useState<string[]>([]);
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> GATHERINGS</p><h1>Events & attendance</h1><p className="page-subtitle">Bring people together. Keep the details simple.</p></div><button className="button button-primary" onClick={() => notify("Event creation needs an authorized backend") }><Plus size={17}/>Create event</button></div><div className="event-feature"><div><span className="feature-tag">THIS SUNDAY · NOV 15</span><h2>Community &<br/>Care Sunday</h2><p>A morning to worship, connect, and make space for new faces.</p><div className="feature-meta"><span><Clock3 size={15}/>8:00 AM</span><span><Users size={15}/>126 expected</span><span><CalendarDays size={15}/>Main auditorium</span></div><button className="button button-light" onClick={() => notify("Event workspace is a preview only")}>Open event workspace <ArrowRight size={15}/></button></div><div className="event-feature-art"><div className="arch-shape"><div className="arch-window"><div className="arch-sun"/><div className="arch-land land-one"/><div className="arch-land land-two"/></div></div><div className="feature-stamp">GATHER<br/>WITH<br/>PURPOSE</div></div></div><div className="event-list-title"><div><p className="section-kicker">UP NEXT</p><h2>Coming up at CMI</h2></div><div className="event-view-switch"><button className="selected">List</button><button onClick={() => notify("Calendar view is not included in this preview")}>Calendar</button></div></div><div className="event-cards">{events.map((event) => <article className="event-card" key={event.title}><div className={`event-card-art ${event.tone}`}><span className="event-card-type">{event.category}</span><strong>{event.mark}</strong><span className="art-orbit"/></div><div className="event-card-body"><span className="event-date-line">{event.date} <i/> {event.time}</span><h3>{event.title}</h3><span className="event-location">{event.place}</span><div className="event-card-footer"><span><Users size={14}/>{event.people} expected</span><button className="text-button" onClick={() => { setRegistered((current) => [...new Set([...current, event.title])]); notify("Added to your demo event list"); }}>{registered.includes(event.title) ? "Added" : "View details"}<ArrowRight size={14}/></button></div></div></article>)}</div><div className="data-note"><ShieldCheck size={14}/><span>Registration, transport reservations, and check-in require approved backend workflows.</span></div></>;
}

function ReportsPage() {
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> INSIGHTS</p><h1>Ministry in motion</h1><p className="page-subtitle">A clear view of the work, measured with care.</p></div><button className="button button-secondary"><CalendarDays size={16}/>Last 30 days <ChevronDown size={14}/></button></div><div className="report-intro"><div><strong>November 1 – 30, 2026</strong><span>Operational activity · synthetic preview data</span></div><button className="button button-secondary" onClick={() => window.print()}>Export report <ArrowDown size={15}/></button></div><div className="report-metrics"><Metric label="New visitors" value="24" change="+18% vs. last month" icon={Users} accent="green"/><Metric label="Follow-ups completed" value="86" change="+12% vs. last month" icon={CheckCheck} accent="amber"/><Metric label="Returned to service" value="16" change="67% of new visitors" icon={ArrowUpRight} accent="clay"/><Metric label="Events held" value="4" change="2 upcoming" icon={CalendarDays} accent="blue"/></div><div className="reports-grid"><section className="panel report-chart-panel"><div className="panel-header"><div><p className="section-kicker">VISITOR JOURNEY</p><h2>From welcome to return</h2><p className="panel-description">Counts by recorded step · not a retention score</p></div><button className="icon-button" aria-label="More report options"><MoreHorizontal size={18}/></button></div><div className="funnel-chart"><div className="funnel-row"><span>New visitors</span><div><i style={{width:"100%"}}/><strong>24</strong></div></div><div className="funnel-row"><span>Assigned</span><div><i style={{width:"83%"}}/><strong>20</strong></div></div><div className="funnel-row"><span>Contact recorded</span><div><i style={{width:"71%"}}/><strong>17</strong></div></div><div className="funnel-row"><span>Returned</span><div><i style={{width:"67%"}}/><strong>16</strong></div></div></div><div className="report-footnote"><ShieldCheck size={13}/>Recorded events only. No inferred status.</div></section><section className="panel channel-panel"><div className="panel-header"><div><p className="section-kicker">TEAM ACTIVITY</p><h2>Follow-up by channel</h2></div><button className="text-button">Details <ArrowRight size={14}/></button></div><div className="channel-bars"><div><div><span>Phone calls</span><strong>42</strong></div><i><b style={{width:"78%"}}/></i></div><div><div><span>In-person visits</span><strong>26</strong></div><i><b style={{width:"52%"}}/></i></div><div><div><span>SMS submitted</span><strong>18</strong></div><i><b style={{width:"36%"}}/></i></div></div><p className="report-caution">SMS submissions are not evidence that a message was read or answered.</p></section></div><div className="data-note"><ShieldCheck size={14}/><span>Reports use sample numbers and are not connected to ministry records.</span></div></>;
}

function TeamPage({ notify }: { notify: (message: string) => void }) {
  const people = [{ initials: "EB", name: "Esi Boateng", role: "Coordinator", teams: "Welcome · Follow-up", tasks: 8, color: "forest" }, { initials: "KA", name: "Kojo Asante", role: "Team Leader", teams: "Adenta Follow-up", tasks: 6, color: "clay" }, { initials: "AN", name: "Akosua Nyarko", role: "Field Worker", teams: "Welcome Team", tasks: 4, color: "blue" }, { initials: "NA", name: "Nana Agyeman", role: "Follow-up Volunteer", teams: "Adenta Follow-up", tasks: 3, color: "ochre" }];
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> ADMINISTRATION</p><h1>People serving people.</h1><p className="page-subtitle">Manage ministry teams and review access in one place.</p></div><button className="button button-primary" onClick={() => notify("Account invitations are not connected in this preview") }><Plus size={17}/>Invite team member</button></div><div className="admin-banner"><div className="admin-banner-icon"><ShieldCheck size={20}/></div><div><strong>Roles guide the workspace. Permissions protect the records.</strong><span>This preview demonstrates role-aware navigation only. It does not enforce record-level access.</span></div><button className="text-button" onClick={() => notify("Authorization is not connected to a backend")}>Access model <ArrowRight size={14}/></button></div><div className="team-summary"><div className="team-summary-main"><span className="section-kicker">CMI MINISTRY TEAMS</span><h2>Working together, with care.</h2><p>Each member has a clear place to serve and an appropriate view of the work.</p></div><div className="team-summary-stat"><strong>18</strong><span>active team members</span></div><div className="team-summary-stat"><strong>4</strong><span>ministry teams</span></div><div className="team-summary-stat"><strong>6</strong><span>pending follow-ups</span></div></div><section className="panel team-panel"><div className="panel-header"><div><p className="section-kicker">TEAM DIRECTORY</p><h2>Ministry members</h2></div><div className="directory-controls"><label className="search-field"><Search size={15}/><input placeholder="Search team" aria-label="Search team members"/></label><button className="filter-button"><ListFilter size={15}/>Filter</button></div></div><div className="team-table"><div className="team-table-head"><span>MEMBER</span><span>ROLE</span><span>MINISTRY TEAM</span><span>OPEN TASKS</span><span/></div>{people.map((person) => <div className="team-table-row" key={person.name}><div className="person-cell"><div className={`avatar avatar-${person.color}`}>{person.initials}</div><div><strong>{person.name}</strong><span>{person.name === "Esi Boateng" ? "You · Active now" : "Active"}</span></div></div><span className="team-role">{person.role}</span><span className="team-group-name">{person.teams}</span><span className="task-count-pill">{person.tasks}</span><button className="row-action" aria-label={`Open ${person.name} account`} onClick={() => notify("Account details are a preview only")}><ChevronRight size={16}/></button></div>)}</div></section><div className="data-note"><ShieldCheck size={14}/><span>Account provisioning, permissions, audit history, and deactivation require trusted backend operations.</span></div></>;
}

function StatusBadge({ status }: { status: string }) {
  const type = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`status-badge status-${type}`}><i/>{status}</span>;
}

function CaptureDialog({ onClose, onSave }: { onClose: () => void; onSave: (contact: Contact) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) { setError("Add a name and phone number to continue."); return; }
    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    onSave({ id: `CM-${Math.floor(2482 + Math.random() * 100)}`, name: name.trim(), initials, phone: phone.trim(), location: location.trim() || "Not provided", source: "Sunday service", status: "New", owner: "Unassigned", date: "Today", accent: "ochre" });
  };
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div className="dialog-topline"><div className="dialog-icon"><Users size={19}/></div><button className="icon-button" aria-label="Close capture form" onClick={onClose}><X size={18}/></button></div><p className="section-kicker">WELCOME & CONNECT</p><h2 id="capture-title">Capture a visitor</h2><p className="dialog-subtitle">A few details help the team offer a thoughtful welcome.</p><form noValidate onSubmit={save}><label>Full name <span>Required</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ama Serwaa Mensah" aria-invalid={!!error && !name.trim()} /></label><label>Phone number <span>Required</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+233 24 000 0000" aria-invalid={!!error && !phone.trim()} /></label><label>Area or neighbourhood <span>Optional</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Adenta" /></label><label>How did they visit? <select defaultValue="Sunday service"><option>Sunday service</option><option>Community outreach</option><option>Youth service</option><option>Other event</option></select></label><div className="form-consent"><ShieldCheck size={15}/><span>Consent and follow-up preferences are captured through approved workflows.</span></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">Save visitor <ArrowRight size={15}/></button></div></form><small className="preview-form-note">Demo only · Do not enter real personal information</small></section></div>;
}

export default App;
