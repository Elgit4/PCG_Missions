import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, BookOpen, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, FileText, KeyRound, LogOut, Megaphone, MoreHorizontal, Network, Plus, RefreshCw, Search, ShieldCheck, Users, XCircle } from "lucide-react";
import { OperationsWorkspace } from "./OperationsWorkspace";
import { TeamAdministrationWorkspace } from "./TeamAdministrationWorkspace";
import { MinistryReportsWorkspace } from "./MinistryReportsWorkspace";
import { ContactDetailDialog } from "./ContactDetailDialog";
import { StaffNotificationCenter } from "./StaffNotificationCenter";
import { OverviewDashboard } from "./OverviewDashboard";
import { canOpenStaffPage, getAvailableStaffPages, hasCapability, hasIdentityCapture, hasIdentityRead } from "../lib/capabilities";
import type { ContactCreateInput, ContactRecord, FollowUpTask, StaffAccountCreateInput, StaffDirectoryEntry, StaffPasswordResetRequest, StaffSession, TaskCreateInput } from "../lib/cmi-api";
import { CmiApiClient, CmiApiError } from "../lib/cmi-api";
import { ThemeToggle } from "../lib/theme";
import { formatApplicationError } from "../lib/error-messages";

type Page = "Overview" | "Contacts" | "Follow-up" | "Events" | "Calendar" | "Announcements" | "Content" | "Teams & Areas" | "Reports" | "Staff" | "Access requests";
type TaskStatusFilter = "all" | "open" | "in_progress" | "completed" | "cancelled" | "overdue" | "today" | "upcoming";
interface StaffWorkspaceProps { api: CmiApiClient; session: StaffSession; onSignOut: () => Promise<void> }

function messageFor(error: unknown): string {
  return formatApplicationError(error);
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

function navigationIcon(item: Page, size = 18) {
  switch (item) {
    case "Overview": return <Activity size={size} strokeWidth={1.9} />;
    case "Contacts": return <Users size={size} strokeWidth={1.9} />;
    case "Follow-up": return <ClipboardList size={size} strokeWidth={1.9} />;
    case "Events": return <CalendarDays size={size} strokeWidth={1.9} />;
    case "Calendar": return <CalendarClock size={size} strokeWidth={1.9} />;
    case "Announcements": return <Megaphone size={size} strokeWidth={1.9} />;
    case "Content": return <BookOpen size={size} strokeWidth={1.9} />;
    case "Teams & Areas": return <Network size={size} strokeWidth={1.9} />;
    case "Reports": return <FileText size={size} strokeWidth={1.9} />;
    case "Staff": return <Users size={size} strokeWidth={1.9} />;
    case "Access requests": return <KeyRound size={size} strokeWidth={1.9} />;
  }
}

function navigationLabel(item: Page): string {
  if (item === "Follow-up") return "Follow-up tasks";
  if (item === "Content") return "Visitor content";
  return item;
}
function isOverdue(task: FollowUpTask): boolean {
  return (task.status === "open" || task.status === "in_progress") &&
    !!task.due_at && new Date(task.due_at).getTime() < Date.now();
}

function WorkspaceSkeleton({ page }: { page: Page }) {
  const isOverview = page === "Overview";
  const isTable = page === "Contacts" || page === "Staff" || page === "Follow-up" || page === "Access requests";
  return (
    <div className="cmi-loading-skeleton" role="status" aria-label={`Loading ${page.toLowerCase()} workspace`}>
      <span className="cmi-skeleton-sr">Loading workspace content</span>
      {isOverview ? (
        <>
          <div className="cmi-skeleton-welcome">
            <div className="cmi-skeleton-copy"><i className="cmi-skeleton-line short" /><i className="cmi-skeleton-line title" /><i className="cmi-skeleton-line medium" /></div>
            <i className="cmi-skeleton-mark" />
          </div>
          <div className="cmi-skeleton-stats">{[1, 2, 3, 4].map((item) => <div className="cmi-skeleton-stat" key={item}><i className="cmi-skeleton-line short" /><i className="cmi-skeleton-line number" /><i className="cmi-skeleton-line medium" /></div>)}</div>
          <div className="cmi-skeleton-grid">
            <div className="cmi-skeleton-panel"><i className="cmi-skeleton-line medium" /><i className="cmi-skeleton-line title" /><i className="cmi-skeleton-line long" /><i className="cmi-skeleton-line long" /><i className="cmi-skeleton-line medium" /></div>
            <div className="cmi-skeleton-panel"><i className="cmi-skeleton-line medium" /><i className="cmi-skeleton-line title" />{[1, 2, 3].map((item) => <i className="cmi-skeleton-row" key={item}><b /><span><i /><i /></span></i>)}</div>
          </div>
        </>
      ) : (
        <div className="cmi-skeleton-panel cmi-skeleton-page">
          <div className="cmi-skeleton-heading"><span><i className="cmi-skeleton-line short" /><i className="cmi-skeleton-line title" /><i className="cmi-skeleton-line medium" /></span><i className="cmi-skeleton-action" /></div>
          {isTable && <i className="cmi-skeleton-search" />}
          {Array.from({ length: isTable ? 5 : 3 }, (_, index) => <i className="cmi-skeleton-row" key={index}><b /><span><i /><i /></span><em /></i>)}
        </div>
      )}
    </div>
  );
}

export function StaffWorkspace({ api, session, onSignOut }: StaffWorkspaceProps) {
  const branchId = session.branches[0]?.id ?? "";
  const [page, setPage] = useState<Page>(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "access-requests") return "Access requests";
    return "Overview";
  });
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("all");
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [resetRequests, setResetRequests] = useState<StaffPasswordResetRequest[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffDirectoryEntry[]>([]);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showMobileMore, setShowMobileMore] = useState(false);
  const [staffStatusEdit, setStaffStatusEdit] = useState<{ profileId: string; nextStatus: "active" | "inactive" } | null>(null);
  const [staffStatusReason, setStaffStatusReason] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [resetReasons, setResetReasons] = useState<Record<string, string>>({});
  const [processingResetId, setProcessingResetId] = useState<string | null>(null);
  const [contactsHasMore, setContactsHasMore] = useState(false);
  const [tasksHasMore, setTasksHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showContactForm, setShowContactForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskContactId, setTaskContactId] = useState("");
  const [taskContactQuery, setTaskContactQuery] = useState("");
  const [debouncedTaskContactQuery, setDebouncedTaskContactQuery] = useState("");
  const [taskContactResults, setTaskContactResults] = useState<ContactRecord[]>([]);
  const [taskContactLoading, setTaskContactLoading] = useState(false);
  const [taskContactError, setTaskContactError] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const contactRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);
  const taskRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedTaskContactQuery(taskContactQuery.trim()),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [taskContactQuery]);

  useEffect(() => {
    if (
      !showTaskForm || !canReadContacts ||
      debouncedTaskContactQuery.length < 2
    ) {
      setTaskContactLoading(false);
      setTaskContactError("");
      if (!taskContactId) setTaskContactResults([]);
      return;
    }
    let active = true;
    setTaskContactLoading(true);
    setTaskContactError("");
    api.listContacts(branchId, {
      limit: 12,
      offset: 0,
      search: debouncedTaskContactQuery,
    }).then((result) => {
      if (active) setTaskContactResults(result.data);
    }).catch((error: unknown) => {
      if (!active) return;
      setTaskContactResults([]);
      setTaskContactError(messageFor(error));
    }).finally(() => {
      if (active) setTaskContactLoading(false);
    });
    return () => {
      active = false;
    };
  }, [
    api,
    branchId,
    canReadContacts,
    debouncedTaskContactQuery,
    showTaskForm,
    taskContactId,
  ]);


  const canReadContacts = canOpenStaffPage(session, "Contacts", branchId);
  const canReadTasks = canOpenStaffPage(session, "Follow-up", branchId);
  const canCreateContacts = hasCapability(session, "contact.capture.create", branchId);
  const canReadContactNotes = hasCapability(session, "contact.note.read.scoped", branchId);
  const canCreateContactNotes = hasCapability(session, "contact.note.create", branchId);
  const canRecordContactInteraction = hasCapability(session, "contact.interaction.record", branchId);
  const taskCreateGrant = session.capabilities.find((grant) =>
    grant.code === "followup.task.create" && grant.branch_id === branchId
  );
  const canCreateTasks = !!taskCreateGrant;
  const canSelfAssignTask = !!taskCreateGrant &&
    (taskCreateGrant.scope_mode === "assigned" || taskCreateGrant.scope_mode === "branch");
  const canUpdateTasks = hasCapability(session, "followup.task.update.scoped", branchId);
  const canManagePasswordResets = hasCapability(session, "staff.password_reset.manage", branchId);
  const canReadStaffDirectory = hasCapability(session, "staff.directory.read", branchId);
  const canManageStaffAccounts = hasCapability(session, "staff.account.manage", branchId);
  const canCreateStaffAccounts = hasCapability(session, "staff.account.manage", branchId) && hasCapability(session, "access.role.assign", branchId);
  const availablePages = useMemo(() => {
    const pages: Page[] = getAvailableStaffPages(session, branchId)
      .filter((candidate): candidate is Exclude<Page, "Staff" | "Access requests"> =>
        candidate !== "Prayer"
      );
    if (canCreateContacts && !pages.includes("Contacts")) pages.push("Contacts");
    if (canReadStaffDirectory) pages.push("Staff");
    if (canManagePasswordResets) pages.push("Access requests");
    return pages;
  }, [session, branchId, canCreateContacts, canManagePasswordResets, canReadStaffDirectory]);
  const navigationSections = [
    { label: "WORKSPACE", items: availablePages.filter((item) => ["Overview", "Contacts", "Follow-up"].includes(item)) },
    { label: "MINISTRY", items: availablePages.filter((item) => ["Events", "Calendar", "Announcements", "Content", "Reports"].includes(item)) },
    { label: "ADMINISTRATION", items: availablePages.filter((item) => ["Teams & Areas", "Staff", "Access requests"].includes(item)) },
  ].filter((section) => section.items.length > 0);
  const preferredMobilePages: Page[] = ["Overview", "Contacts", "Follow-up", "Calendar"];
  const mobilePrimaryPages = [
    ...preferredMobilePages.filter((item) => availablePages.includes(item)),
    ...availablePages.filter((item) => !preferredMobilePages.includes(item)),
  ].slice(0, 4);
  const mobileMorePages = availablePages.filter((item) => !mobilePrimaryPages.includes(item));
  const canCaptureIdentity = hasIdentityCapture(session, branchId);
  const canReadIdentity = hasIdentityRead(session, branchId);
  const activeBranch = session.branches.find((branch) => branch.id === branchId);
  const branchTimeZone = activeBranch?.timezone || "Africa/Accra";

  const expireSession = useCallback(() => {
    setContacts([]);
    setSelectedContact(null);
    setTasks([]);
    setContactsHasMore(false);
    setTasksHasMore(false);
    setResetRequests([]);
    setStaffMembers([]);
    setShowStaffForm(false);
    setStaffStatusEdit(null);
    setStaffStatusReason("");
    setResetReasons({});
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
      setContacts([]); setTasks([]); setResetRequests([]); setStaffMembers([]); setResetReasons({});
      setContactsHasMore(false); setTasksHasMore(false);
      setLoading(false); setLoadError("");
      return () => { current = false; };
    }
    setLoading(true); setLoadError("");
    const requests: Promise<void>[] = [];
    if (canReadContacts) {
      requests.push(api.listContacts(branchId, { limit: 50, offset: 0, search: debouncedQuery || undefined })
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
    if (canManagePasswordResets) {
      requests.push(api.listStaffPasswordResetRequests(branchId)
        .then((result) => { if (current) setResetRequests(result.data); })
        .catch((error: unknown) => {
          if (!current) return;
          if (error instanceof CmiApiError && error.status === 401) expireSession();
          else setLoadError(messageFor(error));
        }));
    } else {
      setResetRequests([]);
      setResetReasons({});
    }
    if (canReadStaffDirectory) {
      requests.push(api.listStaffDirectory(branchId, { limit: 50, offset: 0 })
        .then((result) => { if (current) setStaffMembers(result.data); })
        .catch((error: unknown) => {
          if (!current) return;
          if (error instanceof CmiApiError && error.status === 401) expireSession();
          else setLoadError(messageFor(error));
        }));
    } else {
      setStaffMembers([]);
    }
    void Promise.all(requests).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, branchId, canReadContacts, canReadTasks, canManagePasswordResets, canReadStaffDirectory, debouncedQuery, expireSession]);

  const visibleContacts = contacts;
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const openTasks = tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: branchTimeZone }).format(new Date());
  const filteredTasks = tasks.filter((task) => {
    if (taskStatusFilter === "overdue") return isOverdue(task);
    if (taskStatusFilter === "today") return !!task.due_at && new Intl.DateTimeFormat("en-CA", { timeZone: branchTimeZone }).format(new Date(task.due_at)) === todayKey && (task.status === "open" || task.status === "in_progress");
    if (taskStatusFilter === "upcoming") return !!task.due_at && new Date(task.due_at).getTime() > Date.now() && (task.status === "open" || task.status === "in_progress");
    return taskStatusFilter === "all" || task.status === taskStatusFilter;
  }).sort((a, b) => {
    const overdueOrder = Number(isOverdue(b)) - Number(isOverdue(a));
    if (overdueOrder) return overdueOrder;
    return (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) -
      (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER);
  });

  const refresh = async () => {
    if (!branchId) return;
    setRefreshing(true); setActionError("");
    try {
      const [contactResult, taskResult, resetResult, staffResult] = await Promise.all([
        canReadContacts ? api.listContacts(branchId, { limit: 50, offset: 0, search: debouncedQuery || undefined }) : Promise.resolve(null),
        canReadTasks ? api.listFollowUpTasks(branchId, { limit: 50, offset: 0 }) : Promise.resolve(null),
        canManagePasswordResets ? api.listStaffPasswordResetRequests(branchId) : Promise.resolve(null),
        canReadStaffDirectory ? api.listStaffDirectory(branchId, { limit: 50, offset: 0 }) : Promise.resolve(null),
      ]);
      if (contactResult) {
        setContacts(contactResult.data);
        setContactsHasMore(contactResult.data.length === 50);
      }
      if (taskResult) {
        setTasks(taskResult.data);
        setTasksHasMore(taskResult.data.length === 50);
      }
      if (resetResult) setResetRequests(resetResult.data);
      if (staffResult) setStaffMembers(staffResult.data);
    } catch (error) { handleActionError(error); }
    finally { setRefreshing(false); }
  };

  const createStaffAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateStaffAccounts || !branchId || saving) return;
    const form = new FormData(event.currentTarget);
    const input: StaffAccountCreateInput = {
      branch_id: branchId,
      full_name: String(form.get("full_name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      role_code: String(form.get("role_code") ?? "field_worker") as StaffAccountCreateInput["role_code"],
      reason: String(form.get("reason") ?? "").trim(),
    };
    setSaving(true); setActionError(""); setActionNotice("");
    try {
      const result = await api.createStaffAccount(input);
      setActionNotice(`Staff account created. The temporary sign-in details were emailed to ${result.data.email}. The user must change the temporary password at first sign-in.`);
      setShowStaffForm(false);
      const directory = await api.listStaffDirectory(branchId, { limit: 50, offset: 0 });
      setStaffMembers(directory.data);
    } catch (error) {
      if (error instanceof CmiApiError && error.code === "STAFF_INVITATION_EMAIL_FAILED") {
        setShowStaffForm(false);
        setActionError("");
        setActionNotice(
          `The staff account for ${input.email} was created, but the invitation email was not delivered. Do not create it again. Fix the church email sender, then ask this staff member to use Forgot password so you can approve a temporary-password reset.`,
        );
        try {
          const directory = await api.listStaffDirectory(branchId, { limit: 50, offset: 0 });
          setStaffMembers(directory.data);
        } catch (refreshError) {
          setLoadError(messageFor(refreshError));
        }
      } else {
        handleActionError(error);
      }
    }
    finally { setSaving(false); }
  };

  const updateStaffAccountStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!staffStatusEdit || !branchId || !canManageStaffAccounts || saving) return;
    const reason = staffStatusReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setActionError("Provide an audit reason between 10 and 500 characters.");
      return;
    }
    setSaving(true); setActionError(""); setActionNotice("");
    try {
      const result = await api.setStaffAccountStatus(
        staffStatusEdit.profileId,
        branchId,
        staffStatusEdit.nextStatus,
        reason,
      );
      setStaffMembers((members) => members.map((member) =>
        member.id === staffStatusEdit.profileId
          ? { ...member, account_status: result.data.account_status }
          : member
      ));
      setActionNotice(result.data.account_status === "inactive"
        ? "Staff account deactivated. Their application access has been revoked."
        : "Staff account reactivated. They can sign in again.");
      setStaffStatusEdit(null);
      setStaffStatusReason("");
    } catch (error) { handleActionError(error); }
    finally { setSaving(false); }
  };

  const reviewPasswordReset = async (request: StaffPasswordResetRequest, action: "approve" | "deny") => {
    if (!canManagePasswordResets || !branchId || processingResetId) return;
    const reason = (resetReasons[request.id] ?? "").trim();
    if (reason.length < 10 || reason.length > 300) {
      setActionError("Enter a review reason between 10 and 300 characters before taking action.");
      return;
    }
    setProcessingResetId(request.id);
    setActionError("");
    try {
      if (action === "approve") {
        await api.approveStaffPasswordResetRequest(branchId, request.id, reason);
      } else {
        await api.denyStaffPasswordResetRequest(branchId, request.id, reason);
      }
      setResetRequests((current) => current.filter((item) => item.id !== request.id));
      setResetReasons((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
    } catch (error) { handleActionError(error); }
    finally { setProcessingResetId(null); }
  };

  const loadMoreContacts = async () => {
    if (!canReadContacts || !branchId || !contactsHasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.listContacts(branchId, {
        limit: 50,
        offset: contacts.length,
        search: debouncedQuery || undefined,
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
    const email = canCaptureIdentity ? String(form.get("email") ?? "").trim() : "";
    const ageRange = String(form.get("age_range") ?? "").trim();
    const language = String(form.get("preferred_language") ?? "").trim();
    if (!firstName) { setActionError("Enter the visitor's first name."); return; }
    if (phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      setActionError("Enter the phone number in international E.164 format, for example +233241234567.");
      return;
    }
    const contactPayload = {
      branch_id: branchId,
      first_name: firstName,
      last_name: lastName || null,
      preferred_name: String(form.get("preferred_name") ?? "").trim() || null,
      preferred_language: language || null,
      age_range: ageRange || null,
      source_metadata: { device_type: "web" },
      ...(phone ? { phone_e164: phone, phone_display: phone } : {}),
      ...(email ? { email_normalized: email.toLowerCase() } : {}),
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
    const contactId = taskContactId || String(form.get("contact_id") ?? "");
    const taskNote = String(form.get("task_note") ?? "").trim();
    const rawPriority = Number(form.get("priority") ?? 2);
    const dueInput = String(form.get("due_at") ?? "");
    if (!contactId) {
      setActionError("Search for and select a contact before creating the follow-up.");
      return;
    }
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
      setShowTaskForm(false); setTaskContactId(""); setTaskContactQuery(""); setTaskContactResults([]); setPage("Follow-up");
    } catch (error) { handleActionError(error); }
    finally { setSaving(false); }
  };

  const updateTaskStatus = async (task: FollowUpTask, status: FollowUpTask["status"]) => {
    if (!canUpdateTasks || !branchId || task.status === status || task.status === "completed" || task.status === "cancelled") return;
    setActionError("");
    setUpdatingTaskId(task.id);
    try {
      const result = await api.updateFollowUpTask(branchId, task.id, { status });
      setTasks((current) => current.map((item) => item.id === task.id ? result.data : item));
      setActionNotice(status === "completed" ? "Follow-up task completed." : "Follow-up task started.");
    } catch (error) {
      handleActionError(error);
      if (error instanceof CmiApiError && (error.status === 409 || error.status === 0)) {
        await refresh();
      }
    } finally {
      setUpdatingTaskId(null);
    }
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
      <a className="cmi-skip-link" href="#cmi-content">Skip to content</a>
      <aside className="cmi-sidebar">
        <div className="cmi-brand">
          <img src="/logo.svg" alt="" />
          <span><strong>PCG MISSIONS</strong><small>MINISTRY WORKSPACE</small></span>
        </div>
        <div className="cmi-sidebar-navigation">
          {navigationSections.map((section) => (
            <section className="cmi-nav-section" key={section.label}>
              <div className="cmi-sidebar-label">{section.label}</div>
              <nav className="cmi-nav" aria-label={`${section.label.toLowerCase()} navigation`}>
                {section.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={page === item ? "active" : ""}
                    aria-current={page === item ? "page" : undefined}
                    onClick={() => { setPage(item); setShowMobileMore(false); }}
                  >
                    {navigationIcon(item)}
                    <span className="cmi-nav-desktop-label">{navigationLabel(item)}</span>
                    {item === "Follow-up" && openTasks.length > 0 ? <em>{openTasks.length}</em> : null}
                  </button>
                ))}
              </nav>
            </section>
          ))}
        </div>
        <div className="cmi-sidebar-bottom">
          <div className="cmi-access-note"><ShieldCheck size={16} /><span>Access is controlled by your active role grants and branch assignment.</span></div>
          <div className="cmi-user-card">
            <div className="cmi-user-avatar">{session.staff.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
            <div><strong>{session.staff.full_name}</strong><small>{session.roles.filter((role) => role.branch_id === branchId).map((role) => role.name).join(" · ") || "Staff member"}</small></div>
            <button aria-label="Sign out" title="Sign out" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} /></button>
          </div>
          <div className="cmi-sidebar-attribution">
            <strong>PCG Missions · Staff operations</strong>
            <span>Powered by ElTech</span>
          </div>
        </div>
      </aside>

      <nav className="cmi-mobile-nav" aria-label="Primary navigation" onKeyDown={(event) => { if (event.key === "Escape") setShowMobileMore(false); }}>
        {showMobileMore && mobileMorePages.length > 0 && (
          <div id="cmi-mobile-more-list" className="cmi-mobile-more" role="group" aria-label="More workspace pages">
            {mobileMorePages.map((item) => (
              <button key={item} type="button" className={page === item ? "active" : ""}
                onClick={() => { setPage(item); setShowMobileMore(false); }}>
                {navigationIcon(item, 17)}<span>{navigationLabel(item)}</span>
                {item === "Follow-up" && openTasks.length > 0 ? <em>{openTasks.length}</em> : null}
              </button>
            ))}
          </div>
        )}
        <div className="cmi-mobile-nav-items" style={{ gridTemplateColumns: `repeat(${mobilePrimaryPages.length + (mobileMorePages.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}>
          {mobilePrimaryPages.map((item) => (
            <button key={item} type="button" className={page === item ? "active" : ""}
              aria-current={page === item ? "page" : undefined}
              onClick={() => { setPage(item); setShowMobileMore(false); }}>
              {navigationIcon(item, 19)}<span>{item === "Overview" ? "Home" : item === "Contacts" ? "People" : item === "Follow-up" ? "Tasks" : item}</span>
            </button>
          ))}
          {mobileMorePages.length > 0 && (
            <button type="button" className={showMobileMore || mobileMorePages.includes(page) ? "active" : ""}
              aria-expanded={showMobileMore} aria-controls="cmi-mobile-more-list"
              onClick={() => setShowMobileMore((value) => !value)}>
              <MoreHorizontal size={20} strokeWidth={1.9} /><span>More</span>
            </button>
          )}
        </div>
      </nav>
      <main className="cmi-main">
        <header className="cmi-topbar">
          <div className="cmi-topbar-heading">
            <div className="cmi-mobile-brand"><img src="/logo.svg" alt="" /><span><strong>PCG Missions</strong><small>STAFF WORKSPACE</small></span></div>
            <span className="cmi-breadcrumb">PCG MISSIONS / {(activeBranch?.name ?? "NO ACTIVE BRANCH").toUpperCase()}</span>
            <h1>{page === "Follow-up" ? "Follow-up tasks" : page}</h1>
          </div>
          <div className="cmi-topbar-actions">
            <StaffNotificationCenter api={api} branchId={branchId} onNavigate={(target) => {
              const destination = target === "followup_task" ? "Follow-up" : target === "event" ? "Events" : target === "ministry_report" ? "Reports" : null;
              if (destination && availablePages.includes(destination)) setPage(destination);
            }} />
            <ThemeToggle />
            <button type="button" className="cmi-icon-action" onClick={() => void refresh()} disabled={refreshing || loading} aria-label={refreshing ? "Refreshing workspace" : "Refresh workspace"} title={refreshing ? "Refreshing" : "Refresh"}>
              <RefreshCw size={17} className={refreshing ? "is-spinning" : undefined} />
            </button>
          </div>
        </header>
        <section className="cmi-content" id="cmi-content" tabIndex={-1} aria-busy={loading}>
          {loadError && <div className="cmi-alert" role="alert">{loadError}</div>}
          {actionError && <div className="cmi-alert" role="alert">{actionError}<button onClick={() => setActionError("")} aria-label="Dismiss message">×</button></div>}
          {actionNotice && <div className="cmi-success-note" role="status">{actionNotice}<button onClick={() => setActionNotice("")} aria-label="Dismiss message">×</button></div>}
          {loading && <WorkspaceSkeleton page={page} /> }

          {page === "Overview" && (
            <OverviewDashboard
              staffName={session.staff.full_name}
              branchName={activeBranch?.name ?? "your branch"}
              branchTimeZone={branchTimeZone}
              contacts={contacts}
              tasks={tasks}
              contactsHasMore={contactsHasMore}
              tasksHasMore={tasksHasMore}
              canReadContacts={canReadContacts}
              canCreateContacts={canCreateContacts}
              canReadTasks={canReadTasks}
              canCreateTasks={canCreateTasks}
              canReadStaffDirectory={canReadStaffDirectory}
              canManagePasswordResets={canManagePasswordResets}
              canAccessTeams={availablePages.includes("Teams & Areas")}
              canAccessReports={availablePages.includes("Reports")}
              onOpenContacts={() => setPage("Contacts")}
              onCreateContact={() => { setPage("Contacts"); setShowContactForm(true); }}
              onOpenFollowUp={() => setPage("Follow-up")}
              onCreateTask={() => { setPage("Follow-up"); setShowTaskForm(true); }}
            />
          )}

          {page === "Staff" && canReadStaffDirectory && <div className="cmi-panel">
            <div className="cmi-panel-heading">
              <div><p className="cmi-eyebrow">TEAM & ACCESS</p><h3>Staff accounts</h3><p>Manage staff access for {activeBranch?.name ?? "this branch"}. Account creation is restricted to authorised administrators.</p></div>
              {canCreateStaffAccounts && <button className="cmi-button cmi-button-primary" type="button" onClick={() => setShowStaffForm((value) => !value)}><Plus size={16} />Create staff account</button>}
            </div>
            {showStaffForm && canCreateStaffAccounts && <form className="cmi-form-grid" onSubmit={createStaffAccount}>
              <label>Full name<input name="full_name" required minLength={2} maxLength={180} autoComplete="name" /></label>
              <label>Staff email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
              <label>Role<select name="role_code" defaultValue="field_worker">
                <option value="coordinator">Coordinator</option><option value="team_leader">Team Leader</option><option value="field_worker">Field Worker</option><option value="follow_up_volunteer">Follow-up Volunteer</option><option value="prayer_intercessor">Prayer Intercessor</option><option value="admin_pastor">Admin / Pastor</option>
              </select></label>
              <label className="cmi-field-wide">Reason for account creation<textarea name="reason" required minLength={10} maxLength={500} rows={3} placeholder="Record the ministry appointment or authorisation (10–500 characters)." /></label>
              <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => setShowStaffForm(false)}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Creating account…" : "Create account & email details"}</button></div>
              <p className="cmi-field-wide cmi-scope-note">A one-time temporary password is sent to the staff member's email. They must replace it immediately after signing in. The administrator never sees the permanent password.</p>
            </form>}
            <div className="cmi-task-list">
              {staffMembers.map((member) => <article className="cmi-task-row cmi-staff-directory-row" key={member.id}>
                <div className="cmi-task-symbol"><Users size={18} /></div>
                <div className="cmi-task-copy"><strong>{member.full_name}</strong><p>{member.roles.map((role) => role.name).join(" · ")}</p></div>
                <span className={member.account_status === "active" ? "cmi-task-status status-open" : "cmi-task-status status-cancelled"}>{member.account_status === "active" ? "Active" : "Inactive"}</span>
                {canManageStaffAccounts && member.id !== session.staff.id && <button type="button" className="cmi-button cmi-button-secondary cmi-staff-status-action" onClick={() => { setStaffStatusEdit({ profileId: member.id, nextStatus: member.account_status === "active" ? "inactive" : "active" }); setStaffStatusReason(""); setActionError(""); }}>{member.account_status === "active" ? "Deactivate" : "Reactivate"}</button>}
                {staffStatusEdit?.profileId === member.id && <form className="cmi-staff-status-form" onSubmit={updateStaffAccountStatus}>
                  <label>Reason for {staffStatusEdit.nextStatus === "inactive" ? "deactivation" : "reactivation"}<textarea value={staffStatusReason} onChange={(event) => setStaffStatusReason(event.target.value)} minLength={10} maxLength={500} rows={2} required placeholder="Enter the authorisation or operational reason (10–500 characters)." /></label>
                  <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => { setStaffStatusEdit(null); setStaffStatusReason(""); }}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : "Confirm " + (staffStatusEdit.nextStatus === "inactive" ? "deactivation" : "reactivation")}</button></div>
                </form>}
              </article>)}
              {!staffMembers.length && !loading && <p className="cmi-empty-row">No staff accounts are assigned to this branch yet.</p>}
            </div>
          </div>}

          {page === "Contacts" && (canReadContacts || canCreateContacts) && <div className="cmi-panel">
            <div className="cmi-panel-heading"><div><p className="cmi-eyebrow">PEOPLE & CONNECTION</p><h3>Contacts</h3><p>Only contacts within your server-authorised scope are shown.</p></div>
              {canCreateContacts && <button className="cmi-button cmi-button-primary" onClick={() => setShowContactForm((value) => !value)}><Plus size={16} />Add contact</button>}
            </div>
            {canReadContacts && <label className="cmi-search"><Search size={16} /><input aria-label="Search contacts by first name" maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts by first name" /></label>}
            {!canReadContacts && <p className="cmi-scope-note">You can capture new contacts, but your current access does not include browsing existing contact records.</p>}
            {showContactForm && canCreateContacts && <form className="cmi-form-grid" onSubmit={createContact}>
              <label>First name<input name="first_name" required maxLength={120} autoComplete="given-name" /></label>
              <label>Last name <span>Optional</span><input name="last_name" maxLength={120} autoComplete="family-name" /></label>
              <label>Preferred name <span>Optional</span><input name="preferred_name" maxLength={120} /></label>
              <label>Age range <span>Optional</span><select name="age_range" defaultValue=""><option value="">Not recorded</option><option value="under_18">Under 18</option><option value="18_24">18–24</option><option value="25_34">25–34</option><option value="35_44">35–44</option><option value="45_54">45–54</option><option value="55_64">55–64</option><option value="65_plus">65+</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
              <label>Preferred language <span>Optional</span><select name="preferred_language" defaultValue="en"><option value="en">English</option><option value="tw">Twi</option><option value="ga">Ga</option><option value="ee">Ewe</option><option value="dag">Dagbani</option><option value="other">Other</option></select></label>
              {canCaptureIdentity && <>
                <label>Phone number <span>Optional · international E.164 format</span><input name="phone" type="tel" autoComplete="tel" maxLength={16} placeholder="+233241234567" /></label>
                <label>Email address <span>Optional · restricted identity field</span><input name="email" type="email" autoComplete="email" maxLength={254} /></label>
              </>}
              <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => setShowContactForm(false)}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : "Save contact"}</button></div>
              <p className="cmi-field-wide cmi-scope-note">Identity fields are available only with the required permission. Add only information needed for ministry follow-up.</p>
            </form>}
            {canReadContacts && <>
              <div className="cmi-table-wrap"><table className="cmi-table"><caption className="cmi-sr-only">Contacts visible in the current branch and access scope</caption><thead><tr><th scope="col">CONTACT</th><th scope="col">STATUS</th><th scope="col">LANGUAGE</th><th scope="col">IDENTITY</th></tr></thead><tbody>
                {visibleContacts.map((contact) => <tr key={contact.id}><td data-label="Contact"><button type="button" className="cmi-contact-open" onClick={() => setSelectedContact(contact)} aria-label={`Open contact profile, notes and activity for ${displayName(contact)}`}><strong>{displayName(contact)}</strong><span>Open profile, notes & activity</span></button><small>{contact.id}</small></td><td data-label="Status"><span className="cmi-status">{statusLabel(contact.contact_status)}</span></td><td data-label="Language">{contact.preferred_language || "Not recorded"}</td><td data-label="Identity">{canReadIdentity && !contact.identity_redacted ? (contact.phone_display || contact.phone_e164 || "Not recorded") : "Restricted"}</td></tr>)}
              </tbody></table>{!visibleContacts.length && !loading && <div className="cmi-contact-empty">
                <strong>{query.trim() ? "No contacts match that search." : "No contacts have been added yet."}</strong>
                <span>{query.trim() ? "Clear the search or try another first name." : "Add a contact to begin using profiles, notes, interaction history and follow-up tasks."}</span>
                {canCreateContacts && !query.trim() && <button type="button" className="cmi-button cmi-button-primary" onClick={() => setShowContactForm(true)}><Plus size={14} />Add first contact</button>}
              </div>}</div>
              {contactsHasMore && <div className="cmi-load-more"><button className="cmi-button cmi-button-secondary" onClick={() => void loadMoreContacts()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more contacts"}</button></div>}
            </>}
          </div>}

          {page === "Follow-up" && canReadTasks && <div className="cmi-panel">
            <div className="cmi-panel-heading"><div><p className="cmi-eyebrow">CARE IN ACTION</p><h3>Follow-up tasks</h3><p>Filter tasks in your current branch and assignment scope. Counts reflect the loaded records.</p></div>
              {canSelfAssignTask && <button className="cmi-button cmi-button-primary" onClick={() => {
                setTaskContactId("");
                setTaskContactQuery("");
                setTaskContactResults([]);
                setTaskContactError("");
                setShowTaskForm((value) => !value);
              }}><Plus size={16} />New task</button>}
              {canCreateTasks && canSelfAssignTask && !canReadContacts && <div className="cmi-task-prerequisite" role="note">
                <span>Your current role cannot search the contact directory. Ask an authorised coordinator to grant the required contact access.</span>
              </div>}
              {canCreateTasks && !canSelfAssignTask && <span className="cmi-scope-note">Task creation is granted, but a supported team assignment target is not available in this workspace.</span>}
            </div>
            {showTaskForm && canCreateTasks && <form className="cmi-form-grid" onSubmit={createTask}>
              <div className="cmi-field-wide cmi-task-contact-picker">
                <label htmlFor="cmi-task-contact-search">Contact</label>
                <input id="cmi-task-contact-search" type="search" role="combobox"
                  aria-autocomplete="list" aria-expanded={taskContactResults.length > 0}
                  aria-controls="cmi-task-contact-results" autoComplete="off"
                  placeholder="Search by name or permitted phone number"
                  value={taskContactQuery}
                  onChange={(change) => {
                    setTaskContactQuery(change.target.value);
                    setTaskContactId("");
                  }} />
                <input type="hidden" name="contact_id" value={taskContactId} />
                {taskContactLoading && <small role="status">Searching contacts…</small>}
                {taskContactError && <small className="cmi-form-error" role="alert">{taskContactError}</small>}
                {!taskContactLoading && taskContactQuery.trim().length < 2 && !taskContactId && <small>Enter at least two characters to search the authorised contact directory.</small>}
                {!taskContactLoading && debouncedTaskContactQuery.length >= 2 && !taskContactResults.length && !taskContactError && <small>No matching contacts were found in your current access scope.</small>}
                {taskContactResults.length > 0 && <div id="cmi-task-contact-results" className="cmi-task-contact-results" role="listbox" aria-label="Matching contacts">
                  {taskContactResults.map((contact) => <button type="button" role="option" aria-selected={taskContactId === contact.id} key={contact.id}
                    onClick={() => {
                      setTaskContactId(contact.id);
                      setTaskContactQuery(displayName(contact));
                      setTaskContactResults([contact]);
                      setTaskContactError("");
                    }}>
                    <strong>{displayName(contact)}</strong>
                    <span>{contact.phone_display || contact.phone_e164 || "No phone displayed"} · {contact.contact_status.replaceAll("_", " ")}</span>
                  </button>)}
                </div>}
                {taskContactId && <button type="button" className="cmi-button cmi-button-secondary"
                  onClick={() => { setTaskContactId(""); setTaskContactQuery(""); setTaskContactResults([]); }}>
                  Change selected contact
                </button>}
              </div>
              <label>Priority<select name="priority" defaultValue="2"><option value="1">Urgent</option><option value="2">Normal</option><option value="3">Low</option><option value="4">Very low</option><option value="5">Minimal</option></select></label>
              <label>Due date and time<input type="datetime-local" name="due_at" /></label>
              <label className="cmi-field-wide">Operational note <span>Do not enter pastoral narratives or sensitive identity data</span><textarea name="task_note" rows={3} maxLength={1000} /></label>
              <div className="cmi-form-actions"><button type="button" className="cmi-button cmi-button-secondary" onClick={() => { setShowTaskForm(false); setTaskContactId(""); }}>Cancel</button><button type="submit" className="cmi-button cmi-button-primary" disabled={saving}>{saving ? "Saving…" : "Create task"}</button></div>
            </form>}
            <div className="cmi-followup-toolbar">
              <div className="cmi-operations-tabs" role="group" aria-label="Filter follow-up tasks">
                {([
                  ["all", "All"],
                  ["overdue", "Overdue"],
                  ["today", "Today"],
                  ["upcoming", "Upcoming"],
                  ["in_progress", "In progress"],
                  ["completed", "Completed"],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" className={taskStatusFilter === value ? "active" : ""} aria-pressed={taskStatusFilter === value} onClick={() => setTaskStatusFilter(value)}>{label}</button>
                ))}
              </div>
              <span>{filteredTasks.length} shown · {tasks.length} loaded</span>
            </div>
            <div className="cmi-task-list">{filteredTasks.map((task) => {
              const contact = contactById.get(task.contact_id);
              return <article className="cmi-task-row" key={task.id}><div className="cmi-task-symbol"><CalendarClock size={18} /></div>
                <div className="cmi-task-copy"><strong>{contact ? displayName(contact) : "Contact details restricted"}</strong><p>{task.task_note || "No operational note"}</p><small>{formatDate(task.due_at, branchTimeZone)} · Priority {task.priority}</small></div>
                <span className={`cmi-task-status status-${isOverdue(task) ? "overdue" : task.status}`}>{isOverdue(task) ? "Overdue" : statusLabel(task.status)}</span>
                {canUpdateTasks && (task.status === "open" || task.status === "in_progress") && <div className="cmi-task-actions">
                  {task.status === "open" && <button type="button" className="cmi-button cmi-button-secondary" onClick={() => void updateTaskStatus(task, "in_progress")} disabled={updatingTaskId !== null}>{updatingTaskId === task.id ? "Saving…" : "Start"}</button>}
                  <button type="button" className="cmi-button cmi-button-primary" onClick={() => void updateTaskStatus(task, "completed")} disabled={updatingTaskId !== null}>{updatingTaskId === task.id ? "Saving…" : <><CheckCircle2 size={14} /> Complete</>}</button>
                </div>}
              </article>;
            })}{!filteredTasks.length && !loading && <p className="cmi-empty-row">{tasks.length ? "No tasks match this filter in the loaded records." : "No follow-up tasks are visible in this branch scope."}</p>}</div>
            {tasksHasMore && <div className="cmi-load-more"><button className="cmi-button cmi-button-secondary" onClick={() => void loadMoreTasks()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more tasks"}</button></div>}
          </div>}

          {page === "Access requests" && canManagePasswordResets && <div className="cmi-panel">
            <div className="cmi-panel-heading">
              <div>
                <p className="cmi-eyebrow">ACCOUNT SECURITY</p>
                <h3>Password reset requests</h3>
                <p>Review staff requests and issue a one-time temporary password by email. The staff member must replace it at first sign-in.</p>
              </div>
              <span className="cmi-reset-count">{resetRequests.length} pending</span>
            </div>
            <div className="cmi-reset-list">
              {resetRequests.map((request) => (
                <article className="cmi-reset-card" key={request.id}>
                  <div className="cmi-reset-card-top">
                    <div className="cmi-reset-avatar"><KeyRound size={18} /></div>
                    <div className="cmi-reset-person">
                      <strong>{request.full_name}</strong>
                      <span>{request.email}</span>
                    </div>
                    <span className="cmi-task-status status-open">Pending</span>
                  </div>
                  <div className="cmi-reset-meta">
                    <span>Requested {formatDate(request.requested_at, branchTimeZone)}</span>
                    <span>Expires {formatDate(request.expires_at, branchTimeZone)}</span>
                  </div>
                  <label className="cmi-reset-reason">
                    <span>Review reason</span>
                    <textarea
                      rows={2}
                      maxLength={300}
                      value={resetReasons[request.id] ?? ""}
                      onChange={(event) => setResetReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                      placeholder="Record how the request was verified (10–300 characters)"
                      disabled={processingResetId === request.id}
                    />
                  </label>
                  <div className="cmi-reset-actions">
                    <button
                      className="cmi-button cmi-button-secondary"
                      type="button"
                      onClick={() => void reviewPasswordReset(request, "deny")}
                      disabled={processingResetId !== null}
                    >
                      <XCircle size={15} /> Deny
                    </button>
                    <button
                      className="cmi-button cmi-button-primary"
                      type="button"
                      onClick={() => void reviewPasswordReset(request, "approve")}
                      disabled={processingResetId !== null}
                    >
                      <CheckCircle2 size={15} />
                      {processingResetId === request.id ? "Processing…" : "Approve & email temporary password"}
                    </button>
                  </div>
                </article>
              ))}
              {!resetRequests.length && !loading && (
                <div className="cmi-reset-empty">
                  <ShieldCheck size={22} />
                  <strong>No pending password-reset requests</strong>
                  <p>New staff requests will appear here after the notification is sent to administrators.</p>
                </div>
              )}
            </div>
          </div>}

          {page === "Teams & Areas" && availablePages.includes("Teams & Areas") && <TeamAdministrationWorkspace key={branchId + ":teams-areas"} branchId={branchId} branchName={activeBranch.name} api={api} session={session} onSessionExpired={expireSession} />}
          {page === "Reports" && availablePages.includes("Reports") && <MinistryReportsWorkspace key={branchId + ":reports"} branchId={branchId} branchName={activeBranch.name} api={api} session={session} />}
          {page === "Events" && availablePages.includes("Events") && <OperationsWorkspace key={branchId + ":events"} section="Events" branchId={branchId} branchName={activeBranch.name} timeZone={branchTimeZone} api={api} session={session} onSessionExpired={expireSession} />}
          {page === "Calendar" && availablePages.includes("Calendar") && <OperationsWorkspace key={branchId + ":calendar"} section="Calendar" branchId={branchId} branchName={activeBranch.name} timeZone={branchTimeZone} api={api} session={session} onSessionExpired={expireSession} />}
          {page === "Announcements" && availablePages.includes("Announcements") && <OperationsWorkspace key={branchId + ":announcements"} section="Announcements" branchId={branchId} branchName={activeBranch.name} timeZone={branchTimeZone} api={api} session={session} onSessionExpired={expireSession} />}
          {page === "Content" && availablePages.includes("Content") && <OperationsWorkspace key={branchId + ":content"} section="Content" branchId={branchId} branchName={activeBranch.name} timeZone={branchTimeZone} api={api} session={session} onSessionExpired={expireSession} />}
          {!canReadContacts && !canCreateContacts && page === "Contacts" && <div className="cmi-panel cmi-empty-state"><ShieldCheck size={24} /><h3>Contact access is not granted</h3><p>Your assigned role has no contact-read capability for this branch.</p></div>}
          {!canReadTasks && page === "Follow-up" && <div className="cmi-panel cmi-empty-state"><ShieldCheck size={24} /><h3>Follow-up access is not granted</h3><p>Your assigned role has no follow-up-read capability for this branch.</p></div>}
          {!availablePages.includes(page) && <div className="cmi-panel cmi-empty-state"><ShieldCheck size={24} /><h3>This section is unavailable</h3><p>Your session does not contain an active permission for this section.</p></div>}
        </section>

      </main>
      {selectedContact && <ContactDetailDialog
        key={`${branchId}:${selectedContact.id}`}
        open={!!selectedContact}
        onOpenChange={(open) => { if (!open) setSelectedContact(null); }}
        branchId={branchId}
        timeZone={branchTimeZone}
        contact={selectedContact}
        api={api}
        canReadIdentity={canReadIdentity}
        canReadNotes={canReadContactNotes}
        canCreateNotes={canCreateContactNotes}
        canRecordInteraction={canRecordContactInteraction}
        canCreateFollowUp={canCreateTasks && canSelfAssignTask}
        onCreateFollowUp={(contact) => {
          setTaskContactId(contact.id);
          setTaskContactQuery(displayName(contact));
          setTaskContactResults([contact]);
          setSelectedContact(null);
          setPage("Follow-up");
          setShowTaskForm(true);
          setActionError("");
        }}
        onSessionExpired={expireSession}
      />}
    </div>
  );
}
