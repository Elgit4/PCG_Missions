import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  Activity, ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3,
  HeartHandshake, LayoutDashboard, ListFilter, Menu, MessageCircle,
  MoreHorizontal, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, ShieldCheck, SlidersHorizontal, Sun, Users,
  X, type LucideIcon,
} from "lucide-react";
import { capabilities, dashboardCopy, events, initialContacts, initialTasks, initialTeam, prayerItems, roles, type Contact, type EventRecord, type Page, type PrayerRequest, type Role, type Task, type TeamMember } from "./data";
import { StaffLogin } from "./components/StaffLogin";

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

function PreviewWorkspace() {
  const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [page, setPage] = useState<Page>("Overview");
  const [role, setRole] = useState<Role>("Coordinator");
  const [contacts, setContacts] = useState(initialContacts);
  const [tasks, setTasks] = useState(initialTasks);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [prayers, setPrayers] = useState<PrayerRequest[]>(prayerItems);
  const [eventList, setEventList] = useState<EventRecord[]>(events);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(initialTeam);
  const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All contacts");
  const [showCapture, setShowCapture] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("pcg-sidebar") === "collapsed");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = (next: "light" | "dark") => {
      setTheme(next);
      root.dataset.theme = next;
      root.style.colorScheme = next;
    };
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      if (!localStorage.getItem("cmi-theme")) syncTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("cmi-theme", next);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("pcg-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  };

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
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    setTaskToComplete(task);
  };

  const finalizeTask = (channel: string, outcome: string, summary: string) => {
    if (!taskToComplete) return;
    const task = taskToComplete;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setCompletedTasks((current) => [{ ...task, action: `${task.action} · ${channel}: ${outcome}${summary ? ` — ${summary}` : ""}`, status: "Due today" }, ...current]);
    setTaskToComplete(null);
    notify("Interaction recorded");
  };

  const updatePrayer = (id: string, status: string) => {
    setPrayers((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    notify("Prayer status updated");
  };

  const addPrayer = (request: PrayerRequest) => {
    setPrayers((current) => [request, ...current]);
    notify("Prayer request added");
  };

  const addContact = (contact: Contact) => {
    setContacts((current) => [contact, ...current]);
    setShowCapture(false);
    setPage("Contacts");
    notify("Visitor saved");
  };

  const updateContact = (id: string, updates: Partial<Contact>) => {
    setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, ...updates } : contact));
    notify("Visitor profile updated");
  };

  const onRoleChange = (next: Role) => {
    setRole(next);
    if (!capabilities[next].includes(page)) setPage("Overview");
    setShowRoleMenu(false);
  };

  const currentCopy = dashboardCopy[role];

  return (
    <div className={`app-frame ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <div className="brand-lockup">
          <img className="brand-crest" src="/logo.svg" alt="" />
          <div className="brand-text"><strong>PCG</strong><span>MISSIONS</span></div>
          <button className="icon-button sidebar-toggle-action" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-pressed={sidebarCollapsed} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <button className="icon-button sidebar-collapse" aria-label="Collapse navigation" onClick={() => notify("Navigation is already at its compact width")}>‹</button>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          {navGroups.map((group) => {
            const items = group.pages.filter((item) => visiblePages.includes(item));
            if (!items.length) return null;
            return <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {items.map((item) => {
                const Icon = iconByPage[item];
                return <button key={item} title={item === "Follow-up" ? "My follow-up" : item} className={`nav-item ${page === item ? "active" : ""}`} onClick={() => navigate(item)} aria-current={page === item ? "page" : undefined}>
                  <Icon size={17} strokeWidth={1.8} /><span>{item === "Overview" ? "Overview" : item === "Follow-up" ? "My follow-up" : item}</span>{item === "Follow-up" && <span className="nav-count">4</span>}
                </button>;
              })}
            </div>;
          })}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item help-link" onClick={() => notify("Help centre coming soon") }><CircleHelp size={17} /><span>Help & support</span></button>
          <div className="profile-card">
            <div className="avatar avatar-forest">EB</div><div className="profile-copy"><strong>Esi Boateng</strong><span>{role}</span></div><button className="icon-button" aria-label="Account menu" onClick={() => notify("Account settings coming soon")}><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </aside>

      <section className="app-main">
        <div className="preview-mode-notice" role="status">
          <strong>DESIGN PREVIEW</strong>
          <span>Sample records only · Changes are temporary · Role selector does not grant real access</span>
        </div>
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setShowMobileMenu(true)}><Menu size={21} /></button>
          <div className="breadcrumbs"><span>{pathByPage[page]}</span><ChevronRight size={14} /><strong>{page === "Follow-up" ? "My follow-up" : page}</strong></div>
          <div className="topbar-actions">
            <span className="connection-pill preview-connection"><span /> Preview only</span>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify("You’re all caught up") }><Bell size={18} /><i /></button>
            <button className="icon-button theme-toggle" type="button" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={theme === "dark"} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="role-preview" onClick={() => setShowRoleMenu((value) => !value)} aria-expanded={showRoleMenu}><span className="preview-dot" /> Preview role <strong>{role}</strong><ChevronDown size={14} /></button>
          </div>
          {showRoleMenu && <div className="role-menu" role="menu">{roles.map((option) => <button role="menuitem" key={option} onClick={() => onRoleChange(option)}><span className={option === role ? "role-check selected" : "role-check"}>{option === role && <Check size={12} />}</span>{option}</button>)}</div>}
        </header>

        <main id="main-content" className="content-area" tabIndex={-1}>
          {page === "Overview" && <Overview role={role} copy={currentCopy} tasks={tasks} navigate={navigate} completeTask={completeTask} onCapture={() => setShowCapture(true)} />}
          {page === "Contacts" && <ContactsPage contacts={filteredContacts} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onCapture={() => setShowCapture(true)} onUpdateContact={updateContact} />}
          {page === "Follow-up" && <FollowUpPage tasks={tasks} completeTask={completeTask} />}
          {page === "Prayer" && <PrayerPage items={prayers} onUpdate={updatePrayer} onAdd={addPrayer} />}
          {page === "Events" && <EventsPageEnhanced items={eventList} setItems={setEventList} notify={notify} />}
          {page === "Reports" && <ReportsPage contacts={contacts} tasks={tasks} completedTasks={completedTasks} events={eventList} />}
          {page === "Team" && <TeamPage people={teamMembers} setPeople={setTeamMembers} notify={notify} />}
        </main>
      </section>

      {showMobileMenu && <div className="mobile-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMobileMenu(false); }}><div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation"><div className="drawer-heading"><img className="drawer-logo" src="/logo-horizontal.svg" alt="PCG Missions" /><button className="icon-button" aria-label="Close navigation" onClick={() => setShowMobileMenu(false)}><X size={19} /></button></div>{visiblePages.map((item) => { const Icon = iconByPage[item]; return <button key={item} className={`nav-item ${page === item ? "active" : ""}`} onClick={() => navigate(item)}><Icon size={18} /><span>{item === "Follow-up" ? "My follow-up" : item}</span></button>; })}<div className="drawer-note"><ShieldCheck size={16} /> Preview navigation only. Real access will be determined by server-issued capabilities.</div></div></div>}
      {showCapture && <CaptureDialog onClose={() => setShowCapture(false)} onSave={addContact} />}
      {taskToComplete && <InteractionDialog task={taskToComplete} onClose={() => setTaskToComplete(null)} onSave={finalizeTask} />}
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
    <div className="welcome-strip"><div className="welcome-copy"><span className="welcome-kicker">THIS WEEK AT CMI</span><h2>Make room for a new beginning.</h2><p>Sunday service · 8:00 AM · Main auditorium</p><button onClick={() => navigate("Events")}>Open event details <ArrowRight size={14} /></button></div><div className="welcome-art" aria-label="People collaborating"><div className="sun-disc"/><div className="hill hill-back"/><div className="hill hill-front"/><span className="art-stem stem-one"/><span className="art-stem stem-two"/></div><img className="welcome-illustration" src="/illustration-team-assignment.svg" alt="People collaborating around a shared task"/><div className="welcome-index">08 <span>WEEK<br/>45</span></div></div>
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
    <div className="data-note"><ShieldCheck size={14}/><span>Use the assigned next step for each visitor and protect sensitive pastoral details.</span></div>
  </>;
}

function Metric({ label, value, change, icon: Icon, accent }: { label: string; value: string; change: string; icon: LucideIcon; accent: string }) {
  return <div className="metric-card"><div className={`metric-icon metric-${accent}`}><Icon size={17} strokeWidth={1.8}/></div><span className="metric-label">{label}</span><div className="metric-row"><strong>{value}</strong><span className="metric-change">{change}</span></div></div>;
}

function ContactsPage({ contacts, query, setQuery, filter, setFilter, onCapture, onUpdateContact }: { contacts: Contact[]; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; onCapture: () => void; onUpdateContact: (id: string, updates: Partial<Contact>) => void }) {
  const [selected, setSelected] = useState<Contact | null>(null);
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> PEOPLE & FOLLOW-UP</p><h1>People we’ve welcomed</h1><p className="page-subtitle">Keep every connection visible and every next step clear.</p></div><button className="button button-primary" onClick={onCapture}><Plus size={17}/>Capture visitor</button></div>
    <section className="panel directory-panel"><div className="directory-toolbar"><div className="directory-tabs">{["All contacts", "Needs assignment", "In follow-up", "Returned"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}{item === "Needs assignment" && <span className="tab-count">3</span>}</button>)}</div><div className="directory-controls"><label className="search-field"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" aria-label="Search contacts"/>{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button>}<kbd>⌘ K</kbd></label><button className="filter-button" onClick={() => setFilter(filter === "All contacts" ? "In follow-up" : "All contacts")}><SlidersHorizontal size={15}/>Filters</button></div></div>
    <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>PERSON</th><th>FIRST VISIT</th><th>HOW THEY FOUND US</th><th>FOLLOW-UP OWNER</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id} onClick={() => setSelected(contact)}><td><div className="person-cell"><div className={`avatar avatar-${contact.accent}`}>{contact.initials}</div><div><strong>{contact.name}</strong><span>{contact.id} · {contact.location}</span></div></div></td><td>{contact.date}</td><td>{contact.source}</td><td><div className="owner-cell"><span className={contact.owner === "Unassigned" ? "owner-dot unassigned" : "owner-dot"}/>{contact.owner}</div></td><td><StatusBadge status={contact.status}/></td><td><button className="row-action" aria-label={`Open ${contact.name}`} onClick={() => setSelected(contact)}><ChevronRight size={16}/></button></td></tr>)}</tbody></table>
    {contacts.length === 0 && <div className="empty-state"><div className="empty-icon"><Search size={20}/></div><strong>No people found</strong><span>Try another name or change the selected view.</span><button className="text-button" onClick={() => {setQuery("");setFilter("All contacts");}}>Clear search and filters</button></div>}
    <div className="contact-mobile-list">{contacts.map((contact) => <button className="contact-mobile-card" key={contact.id} onClick={() => setSelected(contact)}><div className={`avatar avatar-${contact.accent}`}>{contact.initials}</div><div className="contact-mobile-copy"><strong>{contact.name}</strong><span>{contact.id} · {contact.location}</span><span>{contact.owner === "Unassigned" ? "Needs assignment" : `With ${contact.owner}`}</span></div><StatusBadge status={contact.status}/><ChevronRight size={16}/></button>)}</div>
    </div><div className="table-footer"><span>Showing <strong>{contacts.length}</strong> of 24 contacts</span><div><button disabled>Previous</button><span className="page-number">1</span><button>Next <ArrowRight size={13}/></button></div></div></section>
    <div className="data-note"><ShieldCheck size={14}/><span>Visitor records are limited to the access assigned to your role.</span></div>{selected && <ContactProfile contact={selected} onClose={() => setSelected(null)} onSave={(updates) => { onUpdateContact(selected.id, updates); setSelected({ ...selected, ...updates }); }} />}</>;
}

function ContactProfile({ contact, onClose, onSave }: { contact: Contact; onClose: () => void; onSave: (updates: Partial<Contact>) => void }) {
  const [owner, setOwner] = useState(contact.owner);
  const [status, setStatus] = useState<Contact["status"]>(contact.status);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="dialog-topline"><div className={`avatar avatar-${contact.accent}`}>{contact.initials}</div><button className="icon-button" aria-label="Close profile" onClick={onClose}><X size={18}/></button></div><p className="section-kicker">VISITOR PROFILE · {contact.id}</p><h2 id="profile-title">{contact.name}</h2><p className="dialog-subtitle">{contact.phone} · {contact.location}</p><div className="profile-facts"><span><strong>First visit</strong>{contact.date}</span><span><strong>Visit source</strong>{contact.source}</span><span><strong>Contact consent</strong>{contact.consent ?? "Not recorded"}</span><span><strong>Preferred channel</strong>{contact.preference ?? "Not recorded"}</span></div><label>Primary follow-up owner<select value={owner} onChange={(event) => setOwner(event.target.value)}><option>Unassigned</option>{initialTeam.map((member) => <option key={member.name}>{member.name}</option>)}</select></label><label>Visitor status<select value={status} onChange={(event) => setStatus(event.target.value as Contact["status"])}><option>New</option><option>Assigned</option><option>In follow-up</option><option>Returned</option></select></label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Close</button><button type="button" className="button button-primary" onClick={() => { onSave({ owner, status }); onClose(); }}>Save changes</button></div></section></div>;
}

function InteractionDialog({ task, onClose, onSave }: { task: Task; onClose: () => void; onSave: (channel: string, outcome: string, summary: string) => void }) {
  const [channel, setChannel] = useState("Call");
  const [outcome, setOutcome] = useState("Spoke with visitor");
  const [summary, setSummary] = useState("");
  const contact = initialContacts.find((item) => item.name === task.name);
  const phone = contact?.phone.replace(/\s/g, "") ?? "";
  const openChannel = () => {
    onSave(channel, outcome, summary.trim());
    if (channel === "Call" && phone) window.location.href = `tel:${phone}`;
    if (channel === "SMS" && phone) window.location.href = `sms:${phone}?body=${encodeURIComponent(`Hi ${task.name.split(" ")[0]}, this is PCG Missions checking in after Sunday.`)}`;
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); openChannel(); };
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="interaction-title"><div className="dialog-topline"><div className="dialog-icon"><MessageCircle size={18}/></div><button className="icon-button" aria-label="Close interaction form" onClick={onClose}><X size={18}/></button></div><p className="section-kicker">FOLLOW-UP · {task.id}</p><h2 id="interaction-title">Record the interaction</h2><p className="dialog-subtitle">{task.name} · {task.action}</p><form onSubmit={submit}><label>Contact channel<select value={channel} onChange={(event) => setChannel(event.target.value)}><option>Call</option><option>SMS</option><option>Personal visit</option></select></label><label>Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option>Spoke with visitor</option><option>No answer</option><option>Visit completed</option><option>Requested a call back</option><option>Asked not to be contacted</option></select></label><label>Brief internal summary<textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Add the outcome and next step"/></label><div className="form-consent"><ShieldCheck size={15}/><span>{channel === "Call" ? "Save the note, then open your phone app to call this visitor." : channel === "SMS" ? "Save the note, then open a prefilled SMS to this visitor." : "Record the attempt separately from any message delivery status."}</span></div><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">{channel === "Call" ? "Save & call" : channel === "SMS" ? "Save & text" : "Save interaction"}</button></div></form></section></div>;
}

function FollowUpPage({ tasks, completeTask }: { tasks: Task[]; completeTask: (id: string) => void }) {
  const overdue = tasks.filter((task) => task.status === "Overdue");
  const today = tasks.filter((task) => task.status === "Due today");
  const upcoming = tasks.filter((task) => task.status === "Upcoming");
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> YOUR WORK</p><h1>My follow-up</h1><p className="page-subtitle">One conversation at a time. Your assigned next steps.</p></div><button className="button button-secondary" onClick={() => window.print()}><CalendarDays size={16}/>Print my list</button></div><div className="task-summary-strip"><div><strong>{tasks.length}</strong><span>open tasks</span></div><div><strong>{overdue.length}</strong><span>overdue</span></div><div><strong>3</strong><span>calls this week</span></div><div className="summary-next"><Clock3 size={17}/><span>Next task in</span><strong>35 min</strong></div></div>
    <div className="followup-layout"><section className="panel followup-panel"><div className="panel-header"><div><p className="section-kicker">TUESDAY, NOVEMBER 10</p><h2>Follow-up queue</h2></div><button className="filter-button"><ListFilter size={15}/>Sort: due date <ChevronDown size={13}/></button></div><TaskGroup label="Needs attention" helper="Past due · complete or reschedule" tasks={overdue} onComplete={completeTask} tone="overdue"/><TaskGroup label="Due today" helper="Your next conversations" tasks={today} onComplete={completeTask}/><TaskGroup label="Coming up" helper="Planned for later this week" tasks={upcoming} onComplete={completeTask}/></section><aside className="panel next-step-panel"><p className="section-kicker">A GOOD PLACE TO START</p><div className="next-step-icon"><MessageCircle size={20}/></div><h2>Welcome Ama</h2><p>She visited for the first time on Sunday and is waiting for a friendly hello.</p><div className="next-step-meta"><span>FIRST WELCOME CALL</span><strong>Today · 10:30 AM</strong></div><button className="button button-primary button-wide" onClick={() => completeTask(tasks[0]?.id ?? "")}>Record interaction <ArrowRight size={15}/></button></aside></div><div className="data-note"><ShieldCheck size={14}/><span>Tasks are assigned records, not automated judgements about engagement or retention.</span></div></>;
}

function TaskGroup({ label, helper, tasks, onComplete, tone = "" }: { label: string; helper: string; tasks: Task[]; onComplete: (id: string) => void; tone?: string }) {
  if (!tasks.length) return null;
  return <div className={`task-group ${tone}`}><div className="task-group-heading"><div><h3>{label} <span>{tasks.length}</span></h3><p>{helper}</p></div><button className="icon-button" aria-label={`More ${label.toLowerCase()} actions`}><MoreHorizontal size={17}/></button></div>{tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={onComplete}/>)}</div>;
}

function TaskRow({ task, onOpen, compact = false }: { task: Task; onOpen: (id: string) => void; compact?: boolean }) {
  const activate = () => onOpen(task.id);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  };
  return <div className="task-row task-row-button" role="button" tabIndex={0} aria-label={`Open follow-up for ${task.name}`} onClick={activate} onKeyDown={handleKeyDown}><span className="task-check task-check-display" aria-hidden="true"><Check size={13}/></span><div className="avatar avatar-sage">{task.initials}</div><div className="task-person"><strong>{task.action}</strong><span>{task.name}{!compact && ` · ${task.id}`}</span></div><div className="task-due"><strong className={task.status === "Overdue" ? "due-overdue" : ""}>{task.due}</strong><span>{task.time}</span></div><span className="task-row-cta">{!compact && <span>Open</span>}<ChevronRight size={16}/></span></div>;
}

function TaskList({ tasks, onComplete, compact = false }: { tasks: Task[]; onComplete: (id: string) => void; compact?: boolean }) {
  if (!tasks.length) return <div className="empty-inline"><span className="empty-check"><Check size={16}/></span><strong>You’re all caught up</strong><span>There are no open tasks right now.</span></div>;
  return <div className={`task-list ${compact ? "compact" : ""}`}>{tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={onComplete} compact={compact}/>)}</div>;
}

function PrayerPage({ items, onUpdate, onAdd }: { items: PrayerRequest[]; onUpdate: (id: string, status: string) => void; onAdd: (request: PrayerRequest) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const inPrayer = items.filter((item) => item.status === "In prayer").length;
  const needsFollowUp = items.filter((item) => item.status.toLowerCase().includes("follow-up")).length;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !detail.trim()) return;
    onAdd({ id: `PR-${String(Date.now()).slice(-3)}`, title: title.trim(), detail: detail.trim(), received: "Just now", status: "Assigned to you" });
    setTitle(""); setDetail(""); setShowForm(false);
  };
  return <><div className="page-heading prayer-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> PASTORAL CARE · RESTRICTED</p><h1>Prayer desk</h1><p className="page-subtitle">A quiet space for the requests entrusted to you.</p></div><button className="button button-primary" onClick={() => setShowForm((value) => !value)}><Plus size={16}/>{showForm ? "Close form" : "Add request"}</button></div><div className="privacy-callout"><div className="privacy-symbol"><ShieldCheck size={18}/></div><div><strong>Private by design</strong><span>Demo requests are synthetic. Real prayer content requires authenticated, record-level access controls.</span></div></div>{showForm && <form className="panel prayer-form" onSubmit={submit}><label>Request title<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A short, private title" /></label><label>Request details<textarea required rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Enter synthetic demo content only" /></label><div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button button-primary" type="submit">Add request</button></div></form>}<div className="prayer-stats"><div className="prayer-stat"><span>Assigned to you</span><strong>{items.length}</strong></div><div className="prayer-stat"><span>In prayer</span><strong>{inPrayer}</strong></div><div className="prayer-stat"><span>Follow-up requested</span><strong>{needsFollowUp}</strong></div><div className="prayer-stat"><span>Prayed this week</span><strong>{items.filter((item) => item.status === "Prayed").length}</strong></div></div><section className="panel prayer-list-panel"><div className="panel-header"><div><p className="section-kicker">YOUR ASSIGNMENTS</p><h2>Requests in your care</h2></div><span className="confidential-tag"><ShieldCheck size={14}/> {items.length} requests</span></div>{items.length ? items.map((item) => <article className="prayer-card" key={item.id}><div className="prayer-card-icon"><HeartHandshake size={19}/></div><div className="prayer-content"><div className="prayer-card-heading"><div><span className="request-id">{item.id}</span><h3>{item.title}</h3></div><StatusBadge status={item.status}/></div><p>{item.detail}</p><div className="prayer-card-foot"><span><Clock3 size={13}/>{item.received}</span><div><button className="button button-quiet button-small" onClick={() => onUpdate(item.id, "In prayer")}>Mark in prayer</button><button className="button button-secondary button-small" onClick={() => onUpdate(item.id, "Prayed")}>Mark prayed <Check size={13}/></button></div></div></div></article>) : <div className="empty-inline">No prayer requests are assigned in this preview.</div>}</section><div className="data-note sensitive-note"><ShieldCheck size={14}/><span>Changes stay in this browser session. No real sensitive details should be entered.</span></div></>;
}

function EventsPageEnhanced({ items, setItems, notify }: { items: EventRecord[]; setItems: (update: (current: EventRecord[]) => EventRecord[]) => void; notify: (message: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [image, setImage] = useState("");
  const [imageName, setImageName] = useState("");

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = new Date(`${date}T00:00:00`);
    const mark = Number.isNaN(parsed.getTime()) ? "—" : String(parsed.getDate()).padStart(2, "0");
    setItems((current) => [{ title: title.trim(), category: "PCG GATHERING", date: parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit" }).toUpperCase(), time, place: place.trim(), people: 0, tone: "event-olive", mark, image: image || undefined }, ...current]);
    setTitle(""); setDate(""); setTime(""); setPlace(""); setImage(""); setImageName(""); setShowForm(false);
    notify("Event added to this preview");
  };

  const recordAttendance = (eventTitle: string) => {
    setItems((current) => current.map((item) => item.title === eventTitle ? { ...item, people: item.people + 1 } : item));
    notify("Demo attendance count updated");
  };

  const upcoming = items[0];
  return <>
    <div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> GATHERINGS</p><h1>Events & attendance</h1><p className="page-subtitle">Plan gatherings, publish a clear visual, and keep attendance connected.</p></div><button className="button button-primary" onClick={() => setShowForm((value) => !value)}><Plus size={17}/>{showForm ? "Close form" : "Create event"}</button></div>
    {showForm && <form className="panel event-create-form" onSubmit={create}>
      <label>Event name<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. New Members Welcome"/></label>
      <label>Date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label>
      <label>Start time<input required type="time" value={time} onChange={(event) => setTime(event.target.value)}/></label>
      <label>Location<input required value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Main auditorium"/></label>
      <label className="event-upload-field"><span>Publicity image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; if (!file.type.startsWith("image/") || file.size > 6 * 1024 * 1024) { notify("Choose an image under 6 MB"); return; } const reader = new FileReader(); reader.onload = () => { setImage(String(reader.result)); setImageName(file.name); }; reader.readAsDataURL(file); }}/><small>{imageName || "JPG, PNG or WebP · 6 MB max"}</small></label>
      {image && <div className="event-image-preview"><img src={image} alt="Publicity preview"/><button className="text-button" type="button" onClick={() => { setImage(""); setImageName(""); }}>Remove image</button></div>}
      <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button button-primary" type="submit">Save event</button></div>
    </form>}
    {upcoming && <section className={`event-feature ${upcoming.image ? "has-publicity-image" : ""}`}>
      {upcoming.image && <img className="event-feature-image" src={upcoming.image} alt={`Publicity artwork for ${upcoming.title}`}/>}<div className="event-feature-copy"><span className="feature-tag">UP NEXT · {upcoming.date}</span><h2>{upcoming.title}</h2><p>Gather together, welcome new faces, and keep attendance connected to visitor records.</p><div className="feature-meta"><span><Clock3 size={15}/>{upcoming.time}</span><span><Users size={15}/>{upcoming.people} recorded</span><span><CalendarDays size={15}/>{upcoming.place}</span></div><button className="button button-light" onClick={() => recordAttendance(upcoming.title)}>Record one attendee <ArrowRight size={15}/></button></div>
    </section>}
    <div className="event-list-title"><div><p className="section-kicker">EVENT SCHEDULE</p><h2>Coming up at CMI</h2></div><div className="event-view-switch"><button type="button" className={!calendar ? "selected" : ""} onClick={() => setCalendar(false)}>List</button><button type="button" className={calendar ? "selected" : ""} onClick={() => setCalendar(true)}>Calendar</button></div></div>
    {calendar && <div className="panel event-calendar-summary"><CalendarDays size={18}/><span>Calendar schedule · {items.length} events listed in date order</span></div>}
    <div className="event-cards">{items.map((event) => <article className="event-card" key={event.title}><div className={`event-card-art ${event.tone} ${event.image ? "has-event-image" : ""}`}>{event.image && <img className="event-card-image" src={event.image} alt=""/>}<span className="event-card-type">{event.category}</span><strong>{event.mark}</strong></div><div className="event-card-body"><span className="event-date-line">{event.date} <i/> {event.time}</span><h3>{event.title}</h3><span className="event-location">{event.place}</span><div className="event-card-footer"><span><Users size={14}/>{event.people} recorded</span><button className="text-button" onClick={() => recordAttendance(event.title)}>Record attendance<ArrowRight size={14}/></button></div></div></article>)}</div>
    <div className="data-note"><ShieldCheck size={14}/><span>Publicity images stay in this browser preview. Production uploads should use approved storage, resizing, moderation and access controls.</span></div>
  </>;
}

function ReportsPage({ contacts, tasks, completedTasks, events: reportEvents }: { contacts: Contact[]; tasks: Task[]; completedTasks: Task[]; events: EventRecord[] }) {
  const assigned = contacts.filter((contact) => contact.owner !== "Unassigned").length;
  const returned = contacts.filter((contact) => contact.status === "Returned").length;
  const upcoming = reportEvents.filter((event) => event.people >= 0).length;
  const download = () => {
    const rows = [["Metric", "Value"], ["Visitors", contacts.length], ["Assigned visitors", assigned], ["Returned visitors", returned], ["Open tasks", tasks.length], ["Completed tasks in session", completedTasks.length], ["Events in preview", upcoming]];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = "cmi-preview-report.csv"; link.click(); URL.revokeObjectURL(link.href);
  };
  const pct = contacts.length ? Math.round(returned / contacts.length * 100) : 0;
  const width = (value: number) => `${contacts.length ? Math.round(value / contacts.length * 100) : 0}%`;
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> INSIGHTS</p><h1>Ministry in motion</h1><p className="page-subtitle">A clear view of the work, measured with care.</p></div><button className="button button-secondary" onClick={download}><ArrowDown size={15}/>Download CSV</button></div><div className="report-intro"><div><strong>Current preview session</strong><span>Live counts from the synthetic records shown in this app</span></div><span className="confidential-tag"><ShieldCheck size={14}/> Demo data only</span></div><div className="report-metrics"><Metric label="Visitors in directory" value={String(contacts.length)} change={`${assigned} assigned`} icon={Users} accent="green"/><Metric label="Follow-ups completed" value={String(completedTasks.length)} change="This browser session" icon={CheckCheck} accent="amber"/><Metric label="Returned visitors" value={String(returned)} change={`${pct}% of directory`} icon={ArrowUpRight} accent="clay"/><Metric label="Upcoming events" value={String(upcoming)} change={`${reportEvents.reduce((sum, item) => sum + item.people, 0)} attendance entries`} icon={CalendarDays} accent="blue"/></div><div className="reports-grid"><section className="panel report-chart-panel"><div className="panel-header"><div><p className="section-kicker">VISITOR JOURNEY</p><h2>From welcome to return</h2><p className="panel-description">Counts by recorded preview status · not a retention score</p></div></div><div className="funnel-chart">{[["New visitors", contacts.length], ["Assigned", assigned], ["Contact recorded", completedTasks.length], ["Returned", returned]].map(([label, count]) => <div className="funnel-row" key={label}><span>{label}</span><div><i style={{ width: width(Number(count)) }}/><strong>{count}</strong></div></div>)}</div><div className="report-footnote"><ShieldCheck size={13}/>Recorded sample data only. No inferred status.</div></section><section className="panel channel-panel"><div className="panel-header"><div><p className="section-kicker">FOLLOW-UP WORKLOAD</p><h2>Task status</h2></div></div><div className="channel-bars"><div><div><span>Open tasks</span><strong>{tasks.length}</strong></div><i><b style={{width: `${Math.min(tasks.length * 12, 100)}%`}}/></i></div><div><div><span>Overdue</span><strong>{tasks.filter((task) => task.status === "Overdue").length}</strong></div><i><b style={{width: `${tasks.length ? tasks.filter((task) => task.status === "Overdue").length / tasks.length * 100 : 0}%`}}/></i></div><div><div><span>Completed in session</span><strong>{completedTasks.length}</strong></div><i><b style={{width: `${completedTasks.length + tasks.length ? completedTasks.length / (completedTasks.length + tasks.length) * 100 : 0}%`}}/></i></div></div><p className="report-caution">A completed task is not treated as a successful contact without an interaction outcome.</p></section></div><div className="data-note"><ShieldCheck size={14}/><span>CSV contains aggregate preview counts only. Production reports need approved definitions, date windows, access checks and export audit records.</span></div></>;
}

function TeamPage({ people, setPeople, notify }: { people: TeamMember[]; setPeople: (update: (current: TeamMember[]) => TeamMember[]) => void; notify: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Follow-up Volunteer");
  const [team, setTeam] = useState("Adenta Follow-up");
  const activeCount = people.filter((person) => (person.status ?? "Active") === "Active").length;
  const teamsCount = new Set(people.map((person) => person.teams)).size;
  const visiblePeople = people.filter((person) => `${person.name} ${person.role} ${person.teams}`.toLowerCase().includes(search.toLowerCase()));
  const invite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = name.trim(); if (!cleaned) return;
    const initials = cleaned.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    setPeople((current) => [...current, { initials, name: cleaned, role, teams: team, tasks: 0, color: "blue", status: "Pending" }]);
    setName(""); setShowInvite(false); notify("Preview invitation added as pending");
  };
  const toggleStatus = (person: TeamMember) => {
    if (person.name === "Esi Boateng") return;
    const status = person.status ?? "Active";
    setPeople((current) => current.map((item) => item.name === person.name ? { ...item, status: status === "Active" ? "Inactive" : "Active" } : item));
    notify(status === "Active" ? "Member marked inactive" : "Member reactivated");
  };
  return <><div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> ADMINISTRATION</p><h1>People serving people.</h1><p className="page-subtitle">Review the demo directory, team placement and account state.</p></div><button className="button button-primary" onClick={() => setShowInvite((value) => !value)}><Plus size={17}/>{showInvite ? "Close invite" : "Invite team member"}</button></div><div className="admin-banner"><div className="admin-banner-icon"><ShieldCheck size={20}/></div><div><strong>Preview access only</strong><span>Adding or deactivating here does not create or revoke a real account or grant data permissions.</span></div></div>{showInvite && <form className="panel team-invite-form" onSubmit={invite}><label>Member name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name"/></label><label>Application role<select value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((item) => <option key={item}>{item}</option>)}</select></label><label>Ministry team<input required value={team} onChange={(event) => setTeam(event.target.value)} placeholder="Team name"/></label><div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => setShowInvite(false)}>Cancel</button><button className="button button-primary" type="submit">Add pending member</button></div></form>}<div className="team-summary"><div className="team-summary-main"><span className="section-kicker">CMI MINISTRY TEAMS</span><h2>Working together, with care.</h2><p>Each member has a clear place to serve and an appropriate view of the work.</p></div><div className="team-summary-stat"><strong>{activeCount}</strong><span>active members</span></div><div className="team-summary-stat"><strong>{teamsCount}</strong><span>team assignments</span></div><div className="team-summary-stat"><strong>{people.filter((person) => person.status === "Pending").length}</strong><span>pending invites</span></div></div><section className="panel team-panel"><div className="panel-header"><div><p className="section-kicker">TEAM DIRECTORY</p><h2>Ministry members</h2></div><div className="directory-controls"><label className="search-field"><Search size={15}/><input placeholder="Search team" aria-label="Search team members" value={search} onChange={(event) => setSearch(event.target.value)}/></label><span className="task-count-pill">{visiblePeople.length} shown</span></div></div><div className="team-table"><div className="team-table-head"><span>MEMBER</span><span>ROLE</span><span>MINISTRY TEAM</span><span>OPEN TASKS</span><span>STATE</span></div>{visiblePeople.map((person) => <div className="team-table-row" key={person.name}><div className="person-cell"><div className={`avatar avatar-${person.color}`}>{person.initials}</div><div><strong>{person.name}</strong><span>{person.name === "Esi Boateng" ? "You · Preview account" : person.status === "Pending" ? "Invitation not sent" : "Demo member"}</span></div></div><span className="team-role">{person.role}</span><span className="team-group-name">{person.teams}</span><span className="task-count-pill">{person.tasks}</span><button className="text-button" disabled={person.name === "Esi Boateng"} onClick={() => toggleStatus(person)}>{person.status ?? "Active"}</button></div>)}</div>{!visiblePeople.length && <div className="empty-inline">No team members match “{search}”.</div>}</section><div className="data-note"><ShieldCheck size={14}/><span>Demo-only team changes are not invitations. Production account provisioning, capabilities, audit history and deactivation must run through trusted backend operations.</span></div></>;
}

function StatusBadge({ status }: { status: string }) {
  const type = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`status-badge status-${type}`}><i/>{status}</span>;
}

function CaptureDialog({ onClose, onSave }: { onClose: () => void; onSave: (contact: Contact) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState("Sunday service");
  const [preference, setPreference] = useState("Call");
  const [consent, setConsent] = useState("Not asked");
  const [error, setError] = useState("");
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) { setError("Add a name and phone number to continue."); return; }
    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    onSave({ id: `CM-${Math.floor(2482 + Math.random() * 100)}`, name: name.trim(), initials, phone: phone.trim(), location: location.trim() || "Not provided", source, status: "New", owner: "Unassigned", date: "Today", accent: "ochre", consent: consent === "Yes, follow-up is welcome" ? "Granted" : consent === "No, please do not contact" ? "Declined" : "Not recorded", preference });
  };
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="capture-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div className="dialog-topline"><div className="dialog-icon"><Users size={19}/></div><button className="icon-button" aria-label="Close capture form" onClick={onClose}><X size={18}/></button></div><p className="section-kicker">WELCOME & CONNECT</p><h2 id="capture-title">Capture a visitor</h2><p className="dialog-subtitle">A few details help the team offer a thoughtful welcome.</p><form noValidate onSubmit={save}><label>Full name <span>Required</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ama Serwaa Mensah" aria-invalid={!!error && !name.trim()} /></label><label>Phone number <span>Required</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+233 24 000 0000" aria-invalid={!!error && !phone.trim()} /></label><label>Area or neighbourhood <span>Optional</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Adenta" /></label><label>How did they visit? <select value={source} onChange={(event) => setSource(event.target.value)}><option>Sunday service</option><option>Community outreach</option><option>Youth service</option><option>Other event</option></select></label><label>Follow-up consent<select value={consent} onChange={(event) => setConsent(event.target.value)}><option>Not asked</option><option>Yes, follow-up is welcome</option><option>No, please do not contact</option></select></label><label>Preferred channel<select value={preference} onChange={(event) => setPreference(event.target.value)}><option>Call</option><option>SMS</option><option>Personal visit</option></select></label><div className="form-consent"><ShieldCheck size={15}/><span>Consent is recorded separately from SMS delivery preferences. This demo does not send messages.</span></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary">Save visitor <ArrowRight size={15}/></button></div></form><small className="preview-form-note">Demo only · Do not enter real personal information</small></section></div>;
}

function App() {
  const previewEnabled = import.meta.env.DEV && import.meta.env.VITE_CMI_PREVIEW_MODE === "true";
  return previewEnabled ? <PreviewWorkspace /> : <StaffLogin />;
}

export default App;
