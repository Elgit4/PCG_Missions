export const roles = [
  "Admin / Pastor",
  "Coordinator",
  "Team Leader",
  "Field Worker",
  "Follow-up Volunteer",
  "Prayer Intercessor",
] as const;

export type Role = (typeof roles)[number];
export type Page = "Overview" | "Contacts" | "Follow-up" | "Prayer" | "Events" | "Reports" | "Team";

export type Contact = {
  id: string;
  name: string;
  initials: string;
  phone: string;
  location: string;
  source: string;
  status: "New" | "Assigned" | "In follow-up" | "Returned";
  owner: string;
  date: string;
  accent: string;
  consent?: "Granted" | "Declined" | "Not recorded";
  preference?: string;
};

export type Task = {
  id: string;
  name: string;
  initials: string;
  action: string;
  due: string;
  time: string;
  owner: string;
  status: "Due today" | "Overdue" | "Upcoming";
};

export type EventRecord = {
  title: string;
  category: string;
  date: string;
  time: string;
  place: string;
  people: number;
  tone: string;
  mark: string;
  image?: string;
};

export type PrayerRequest = {
  id: string;
  title: string;
  detail: string;
  received: string;
  status: string;
};

export type TeamMember = {
  initials: string;
  name: string;
  role: string;
  teams: string;
  tasks: number;
  color: string;
  status?: "Active" | "Pending" | "Inactive";
};

export const initialContacts: Contact[] = [
  { id: "CM-2481", name: "Ama Serwaa Mensah", initials: "AM", phone: "+233 24 555 0182", location: "Adenta", source: "Sunday service", status: "New", owner: "Unassigned", date: "Today", accent: "ochre" },
  { id: "CM-2480", name: "Daniel Owusu", initials: "DO", phone: "+233 55 102 8841", location: "Madina", source: "Sunday service", status: "Assigned", owner: "Kojo Asante", date: "Today", accent: "sage" },
  { id: "CM-2479", name: "Abena Ofori", initials: "AO", phone: "+233 20 671 4490", location: "East Legon", source: "Community outreach", status: "In follow-up", owner: "Esi Boateng", date: "Yesterday", accent: "clay" },
  { id: "CM-2478", name: "Michael Tetteh", initials: "MT", phone: "+233 27 318 7006", location: "Legon", source: "Sunday service", status: "Returned", owner: "Akosua Nyarko", date: "Yesterday", accent: "blue" },
  { id: "CM-2477", name: "Nana Yaa Agyeman", initials: "NA", phone: "+233 50 042 9931", location: "Adenta", source: "Youth service", status: "In follow-up", owner: "Kojo Asante", date: "Nov 05", accent: "rose" },
];

export const initialTasks: Task[] = [
  { id: "T-182", name: "Ama Serwaa Mensah", initials: "AM", action: "First welcome call", due: "Today", time: "10:30 AM", owner: "You", status: "Due today" },
  { id: "T-179", name: "Daniel Owusu", initials: "DO", action: "Check in after Sunday", due: "Today", time: "1:00 PM", owner: "You", status: "Due today" },
  { id: "T-176", name: "Nana Yaa Agyeman", initials: "NA", action: "Follow-up visit", due: "Yesterday", time: "4:00 PM", owner: "You", status: "Overdue" },
  { id: "T-174", name: "Michael Tetteh", initials: "MT", action: "Invite to next service", due: "Nov 12", time: "11:00 AM", owner: "You", status: "Upcoming" },
];

export const events: EventRecord[] = [
  { title: "Community & Care Sunday", category: "SUNDAY SERVICE", date: "SUN, NOV 15", time: "8:00 AM", place: "Main auditorium", people: 126, tone: "event-olive", mark: "15" },
  { title: "New Members Welcome", category: "CONNECT", date: "WED, NOV 18", time: "6:30 PM", place: "Fellowship hall", people: 24, tone: "event-clay", mark: "18" },
  { title: "Adenta Community Outreach", category: "OUTREACH", date: "SAT, NOV 21", time: "9:00 AM", place: "Adenta market", people: 18, tone: "event-gold", mark: "21" },
];

export const prayerItems = [
  { id: "PR-084", title: "Prayer for family", detail: "Please keep my family in prayer this week.", received: "Today · 9:12 AM", status: "Assigned to you" },
  { id: "PR-081", title: "Strength and direction", detail: "Asking for prayer as I make an important decision.", received: "Nov 06 · 3:40 PM", status: "In prayer" },
  { id: "PR-078", title: "Thanksgiving", detail: "Grateful for the support received from the team.", received: "Nov 04 · 11:05 AM", status: "Follow-up requested" },
];

export const initialTeam: TeamMember[] = [
  { initials: "EB", name: "Esi Boateng", role: "Coordinator", teams: "Welcome · Follow-up", tasks: 8, color: "forest", status: "Active" },
  { initials: "KA", name: "Kojo Asante", role: "Team Leader", teams: "Adenta Follow-up", tasks: 6, color: "clay", status: "Active" },
  { initials: "AN", name: "Akosua Nyarko", role: "Field Worker", teams: "Welcome Team", tasks: 4, color: "blue", status: "Active" },
  { initials: "NA", name: "Nana Agyeman", role: "Follow-up Volunteer", teams: "Adenta Follow-up", tasks: 3, color: "ochre", status: "Active" },
];

export const capabilities: Record<Role, Page[]> = {
  "Admin / Pastor": ["Overview", "Contacts", "Follow-up", "Prayer", "Events", "Reports", "Team"],
  Coordinator: ["Overview", "Contacts", "Follow-up", "Events", "Reports"],
  "Team Leader": ["Overview", "Contacts", "Follow-up", "Events", "Reports"],
  "Field Worker": ["Overview", "Contacts", "Follow-up", "Events"],
  "Follow-up Volunteer": ["Overview", "Contacts", "Follow-up"],
  "Prayer Intercessor": ["Overview", "Prayer"],
};

export const dashboardCopy: Record<Role, { greeting: string; message: string; focus: string }> = {
  "Admin / Pastor": { greeting: "Good morning, Pastor Kofi", message: "Here’s the ministry at a glance.", focus: "Ministry overview" },
  Coordinator: { greeting: "Good morning, Esi", message: "Your teams are moving well. Here’s what needs attention.", focus: "Coordination desk" },
  "Team Leader": { greeting: "Good morning, Kojo", message: "Here’s your team’s work for today.", focus: "Team overview" },
  "Field Worker": { greeting: "Good morning, Akosua", message: "A few good conversations can change someone’s week.", focus: "My fieldwork" },
  "Follow-up Volunteer": { greeting: "Good morning, Nana", message: "Here are the people and next steps on your list.", focus: "My follow-up" },
  "Prayer Intercessor": { greeting: "Good morning, Abena", message: "Thank you for holding these requests with care.", focus: "Prayer desk" },
};
