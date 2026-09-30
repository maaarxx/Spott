"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Users,
  Calendar,
  Flag,
  FileCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Search,
  ExternalLink,
  Check,
  ShieldAlert,
  BarChart2,
  UserCheck,
  Filter,
  MoreVertical,
  X,
  Edit3,
  Eye,
  Trash2,
  AlertCircle,
  FileText,
  Sliders,
  Sparkles,
  Zap,
  Archive,
  History,
  RotateCcw,
  Clock,
  Inbox,
  PieChart,
  MapPin,
} from "lucide-react";
import {
  getVerificationState,
  defaultVerificationState,
  setApprovalStatus,
  resetVerificationState,
  getRealTimeDate,
  get30DaysExpiryDate,
  saveVerificationState,
  VerificationState,
  VerificationDocument,
} from "@/lib/verification-store";
import PdfViewerModal from "@/components/PdfViewerModal";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";
import { addNotification, removeNotificationsForEvent } from "@/lib/notifications-store";
import { getStoredEvents, deleteStoredEvent, saveStoredEvent, saveStoredEvents, subscribeToEvents } from "@/lib/events-store";
import {
  getPendingOrganizers,
  approveOrganizer,
  rejectOrganizer,
  subscribeToPendingOrganizers,
  PendingOrganizer,
  PENDING_ORGANIZERS_EVENT,
} from "@/lib/pending-organizers-store";
import {
  AdminUser,
  getAdminUsers,
  saveAdminUsers,
  deleteAdminUser,
  subscribeToUsers,
  registerUserInAdmin,
  formatRealTimeJoined,
  syncUsersFromApi,
  INITIAL_ADMIN_USERS,
  USERS_STORE_KEY,
  SIGNUP_STORE_KEY,
} from "@/lib/users-store";
import {
  getModerationKeywords,
  addModerationKeyword,
  removeModerationKeyword,
  resetModerationKeywords,
  getModerationSettings,
  saveModerationSettings,
  subscribeToModeration,
  ModerationSettings,
} from "@/lib/moderation-store";
import {
  getReports,
  resolveReport,
  subscribeToReports,
  ReportItem,
} from "@/lib/reports-store";
import { getUserProfile, getInitials } from "@/lib/user-profile-store";
import type { EventData } from "@/components/EventCard";

type Report = ReportItem;

type AdminAuditLog = {
  log_id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
};

interface VerificationReq {
  id: string;
  organizer: string;
  submitted: string;
  category: string;
  status: "pending" | "approved" | "rejected";
  documents: string[];
  decidedAt?: string;
  retentionDays?: number;
  expiresDate?: string;
  decisionReason?: string;
}

interface AdminEvent {
  id: string;
  title: string;
  organizer: string;
  category: string;
  date: string;
  createdAt?: string | null;
  rsvps: number;
  capacity?: number;
  status: "Active" | "Draft" | "Archived" | "Flagged";
  archivedAt?: string | null;
  archiveExpiresAt?: string | null;
  isLargeGathering?: boolean;
  isKeywordFlagged?: boolean;
  matchedKeywords?: string[];
  location?: string;
  registrations?: number;
}

interface MonthlyData {
  month: string;
  events: number;
  rsvps: number;
  heightPercent: number;
}

interface StoredGuestEntry {
  dateRegistered?: string;
  registeredAt?: string;
}

const initialReports: Report[] = [];
const initialVerifications: VerificationReq[] = [];

const formatDate = (daysOffset: number = 0) => {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const initialEventsList: AdminEvent[] = [];

function AdminContent() {
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "dashboard";

  const [reports, setReports] = useState<Report[]>(initialReports);
  const [reportTab, setReportTab] = useState<"active" | "archive">("active");
  const [verifications, setVerifications] = useState<VerificationReq[]>(initialVerifications);
  const [usersList, setUsersList] = useState<AdminUser[]>(INITIAL_ADMIN_USERS);
  const [eventsList, setEventsList] = useState<AdminEvent[]>(initialEventsList);
  const [analyticsMonth, setAnalyticsMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [eventScope, setEventScope] = useState<"active" | "archive">("active");
  const [hoveredMonth, setHoveredMonth] = useState<MonthlyData | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [pendingOrganizers, setPendingOrganizers] = useState<PendingOrganizer[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditLogsError, setAuditLogsError] = useState<string | null>(null);
  const [moderationKeywords, setModerationKeywords] = useState<string[]>([]);
  const [newKeywordInput, setNewKeywordInput] = useState("");
  const [moderationSettings, setModerationSettings] = useState<ModerationSettings>({
    capacityThreshold: 200,
    sensitivity: "Strict",
    autoFlagLargeEvents: true,
  });
  const [tempThreshold, setTempThreshold] = useState<number>(200);
  const [tempSensitivity, setTempSensitivity] = useState<"Strict" | "Standard">("Strict");

  // Aggregate activity for a selectable calendar month, grouped by week.
  const monthlyActivity: MonthlyData[] = useMemo(() => {
    const [year, month] = analyticsMonth.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const weekCount = Math.ceil(new Date(year, month, 0).getDate() / 7);
    const weeks = Array.from({ length: weekCount }, (_, index) => ({ month: `Week ${index + 1}`, events: 0, rsvps: 0, heightPercent: 6 }));
    const inRange = (value?: string | null) => {
      if (!value) return false;
      const time = new Date(value).getTime();
      return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
    };

    for (const event of eventsList) {
      const createdAt = event.createdAt || event.date;
      if (inRange(createdAt)) {
        const day = new Date(createdAt).getDate();
        weeks[Math.min(weeks.length - 1, Math.floor((day - 1) / 7))].events += 1;
      }
    }

    try {
      const guestMap: Record<string, StoredGuestEntry[]> = JSON.parse(localStorage.getItem("spott_guest_lists") || "{}");
      for (const event of eventsList) {
        const list = guestMap[event.id] || [];
        for (const attendee of list) {
          const registeredAt = attendee.dateRegistered || attendee.registeredAt;
          if (!registeredAt || !inRange(registeredAt)) continue;
          const day = new Date(registeredAt).getDate();
          weeks[Math.min(weeks.length - 1, Math.floor((day - 1) / 7))].rsvps += 1;
        }
      }
    } catch {}

    const maxCount = Math.max(...weeks.map((week) => week.events + week.rsvps), 1);
    return weeks.map((week) => ({
      ...week,
      heightPercent: week.events + week.rsvps > 0
        ? Math.max(12, Math.round(((week.events + week.rsvps) / maxCount) * 85))
        : 6,
    }));
  }, [eventsList, analyticsMonth]);

  const monthlyMetrics = useMemo(() => {
    const [year, month] = analyticsMonth.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const isInMonth = (value?: string | null) => {
      if (!value) return false;
      const time = new Date(value).getTime();
      return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
    };
    let rsvps = 0;
    try {
      const guestMap: Record<string, StoredGuestEntry[]> = JSON.parse(localStorage.getItem("spott_guest_lists") || "{}");
      for (const event of eventsList) {
        const list = guestMap[event.id] || [];
        rsvps += list.filter((attendee) => isInMonth(attendee.dateRegistered || attendee.registeredAt)).length;
      }
    } catch {}
    return {
      users: usersList.filter((user) => isInMonth(user.joinedAt || user.joined)).length,
      events: eventsList.filter((event) => isInMonth(event.createdAt || event.date)).length,
      rsvps,
      reports: reports.filter((report) => isInMonth(report.submitted)).length,
      openReports: reports.filter((report) => report.status === "open" && isInMonth(report.submitted)).length,
      monthLabel: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      rangeLabel: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(end.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    };
  }, [analyticsMonth, eventsList, usersList, reports]);

  // Verification store state & PDF preview (SSR-safe initial baseline)
  const [verState, setVerState] = useState<VerificationState>(defaultVerificationState);
  const [adminPdfPreview, setAdminPdfPreview] = useState<string | null>(null);

  useEffect(() => {
    // Sync with client localStorage on mount to prevent SSR hydration mismatch
    const syncVerifications = () => {
      const current = getVerificationState("Metro Creative Group");
      setVerState(current);

      // Scan ALL organizer verification keys across localStorage (not just Metro)
      const allVerifications: VerificationReq[] = [];
      const seen = new Set<string>();
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith("spott_verification_state")) continue;
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            const parsed: VerificationState = JSON.parse(raw);
            const orgName = parsed.organizerName || "Unknown Organizer";
            if (seen.has(orgName.toLowerCase())) continue;
            seen.add(orgName.toLowerCase());
            if (!parsed.documents || parsed.documents.length === 0) continue;
            if (parsed.status !== "pending") {
              const expiry = parsed.expiresDate ? new Date(parsed.expiresDate).getTime() : NaN;
              const decision = parsed.decidedAt ? new Date(parsed.decidedAt).getTime() : NaN;
              const expiresAt = Number.isFinite(expiry)
                ? expiry
                : Number.isFinite(decision)
                  ? decision + 30 * 24 * 60 * 60 * 1000
                  : Date.now() + 30 * 24 * 60 * 60 * 1000;
              if (expiresAt <= Date.now()) continue;
            }
            allVerifications.push({
              id: `ver-${key}`,
              organizer: orgName,
              submitted: parsed.expeditedAt || parsed.decidedAt || formatDate(0),
              category: "Student Organization",
              status: parsed.status,
              documents: parsed.documents.map((d) => d.name),
              decidedAt: parsed.decidedAt,
              retentionDays: parsed.retentionDays,
              expiresDate: parsed.expiresDate,
              decisionReason: parsed.decisionReason,
            });
          } catch {}
        }
      } catch {}

      // Override Metro's entry with its live verState for consistency
      const metroIdx = allVerifications.findIndex(
        (v) => v.organizer.toLowerCase().includes("metro creative")
      );
      if (metroIdx >= 0) {
        allVerifications[metroIdx] = {
          ...allVerifications[metroIdx],
          id: "ver-metro",
          status: current.status,
          documents: current.documents.map((d) => d.name),
          decidedAt: current.decidedAt,
          expiresDate: current.expiresDate,
        };
      } else if (current.documents && current.documents.length > 0) {
        allVerifications.unshift({
          id: "ver-metro",
          organizer: "Metro Creative Group",
          submitted: formatDate(0),
          category: "Arts & Culture",
          status: current.status,
          documents: current.documents.map((d) => d.name),
          decidedAt: current.decidedAt,
          expiresDate: current.expiresDate,
        });
      }

      setVerifications(allVerifications);
    };

    const mapToAdminEvents = (list: EventData[]): AdminEvent[] => {
      const modSettings = getModerationSettings();
      const modKeywords = getModerationKeywords();

      return list.map((e) => {
        let rsvpCount = e.registrations || 0;
        try {
          const rawGuests = localStorage.getItem("spott_guest_lists");
          if (rawGuests) {
            const guestMap = JSON.parse(rawGuests);
            if (Array.isArray(guestMap[e.id])) {
              const activeAttendees = guestMap[e.id].filter((attendee: { status?: string }) => attendee.status !== "Declined");
              rsvpCount = Math.max(rsvpCount, activeAttendees.length);
            }
          }
        } catch {}

        try {
          let userRegistrations = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key === "spott_registered_events" || key.startsWith("spott_registered_events_"))) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.includes(e.id)) {
                  userRegistrations++;
                }
              }
            }
          }
          rsvpCount = Math.max(rsvpCount, userRegistrations);
        } catch {}

        const cap = typeof e.capacity === "number" ? e.capacity : (e.capacity ? Number(e.capacity) : 100);
        const textToScan = `${e.title || ""} ${e.description || ""}`.toLowerCase();
        const matched = modKeywords.filter((k) => textToScan.includes(k.toLowerCase()));
        const isLarge = Math.max(cap, rsvpCount) >= modSettings.capacityThreshold;

        return {
          id: e.id,
          title: e.title,
          organizer: e.organizer || "Metro Creative Group",
          location: e.location,
          category: e.categories?.[0] || "General",
          date: e.date,
          createdAt: e.createdAt || e.confirmedAt || null,
          rsvps: rsvpCount,
          registrations: rsvpCount,
          capacity: cap,
          status: (["archived", "past", "completed", "done"].includes(String(e.status).toLowerCase())
            ? "Archived"
            : e.status === "draft"
              ? "Draft"
              : e.status === "flagged"
                ? "Flagged"
                : "Active") as AdminEvent["status"],
          archivedAt: e.archivedAt || null,
          archiveExpiresAt: e.archiveExpiresAt || (e.archivedAt ? new Date(new Date(e.archivedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : null),
          isLargeGathering: isLarge,
          isKeywordFlagged: matched.length > 0,
          matchedKeywords: matched,
        };
      });
    };

    const syncRemoteVerificationStatuses = async () => {
      try {
        const response = await fetchWithSupabaseSession('/api/verification?scope=all');
        if (!response.ok) return;
        const payload = await response.json();
        const rows = Array.isArray(payload.verifications) ? payload.verifications : [];
        const metro = rows.find((row: { organization_name?: string }) => row.organization_name?.toLowerCase().includes('metro creative'));
        if (metro) {
          const status = metro.verification_status === 'verified' ? 'approved' : metro.verification_status === 'rejected' ? 'rejected' : 'pending';
          const local = getVerificationState('Metro Creative Group');
          if (local.status !== status) {
            const updated = { ...local, status } as VerificationState;
            if (status !== 'pending') {
              updated.decidedAt ||= getRealTimeDate();
              updated.retentionDays ||= 30;
              updated.expiresDate ||= get30DaysExpiryDate();
            }
            saveVerificationState(updated, 'Metro Creative Group');
            setVerState(updated);
          }
        }
        setVerifications((current) => {
          const merged = [...current];
          for (const row of rows as Array<{ organizer_id: string; organization_name: string; verification_status?: string | null }>) {
            if (!row.organization_name) continue;
            if (!['verified', 'rejected', 'pending'].includes(row.verification_status || '')) continue;
            const status = row.verification_status === 'verified' ? 'approved' : row.verification_status === 'rejected' ? 'rejected' : 'pending';
            const index = merged.findIndex((entry) => entry.organizer.toLowerCase() === row.organization_name.toLowerCase());
            if (index >= 0) merged[index] = { ...merged[index], status };
            else merged.push({ id: `db-${row.organizer_id}`, organizer: row.organization_name, submitted: formatDate(0), category: 'Student Organization', status, documents: [] });
          }
          return merged;
        });
      } catch { /* Keep the last successfully loaded server statuses. */ }
    };

    const syncAdminEvents = async () => {
      const stored = getStoredEvents();
      setEventsList(mapToAdminEvents(stored));

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        const res = await fetch("/api/events?scope=admin", { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const apiData = await res.json();
          if (Array.isArray(apiData)) {
            saveStoredEvents(apiData, false);
            setEventsList(mapToAdminEvents(getStoredEvents()));
          }
        }
      } catch {}
    };

    syncVerifications();
    void syncRemoteVerificationStatuses();
    syncAdminEvents();

    // Real-time Users sync
    const syncUsers = () => {
      setUsersList(getAdminUsers());
    };
    syncUsers();
    syncUsersFromApi().then(() => syncUsers());
    const unsubUsers = subscribeToUsers(syncUsers);
    const refreshRemoteUsers = () => {
      void syncUsersFromApi().then(syncUsers);
    };
    const remoteUsersInterval = setInterval(refreshRemoteUsers, 5000);
    const remoteVerificationInterval = setInterval(syncRemoteVerificationStatuses, 10000);
    window.addEventListener('focus', refreshRemoteUsers);

    // Real-time Pending Organizers sync
    const syncPendingOrgs = async () => {
      try {
        const response = await fetch('/api/pending-organizers');
        if (!response.ok) return;
        const payload = await response.json();
        setPendingOrganizers((payload.organizers || []).map((item: { id: string; name: string; email: string; status: string; submitted_at: string; decided_at?: string }) => ({
          id: item.id, name: item.name, email: item.email, password: '',
          status: item.status, submittedAt: item.submitted_at, decidedAt: item.decided_at,
        })));
      } catch { /* Keep the last successfully loaded list. */ }
    };
    const syncAuditLogs = async () => {
      try {
        const response = await fetchWithSupabaseSession('/api/admin/audit-logs?limit=100');
        const payload = await response.json();
        if (!response.ok) {
          setAuditLogsError(payload.code === 'AUTHENTICATION_REQUIRED'
            ? 'You are signed out of the audit service. Sign in again as admin@spott.ph.'
            : payload.code === 'ADMIN_ROLE_REQUIRED'
              ? 'This account is not assigned the admin role in Spott.'
              : payload.error || 'Unable to load audit logs.');
          return;
        }
        setAuditLogs(payload.logs || []);
        setAuditLogsError(null);
      } catch { setAuditLogsError('Unable to connect to the audit log service.'); }
    };
    syncAuditLogs();
    syncPendingOrgs();
    const unsubPendingOrgs = subscribeToPendingOrganizers(syncPendingOrgs);

    // Moderation sync
    const syncModeration = () => {
      const kw = getModerationKeywords();
      const st = getModerationSettings();
      setModerationKeywords(kw);
      setModerationSettings(st);
      setTempThreshold(st.capacityThreshold);
      setTempSensitivity(st.sensitivity);
    };
    syncModeration();
    const unsubModeration = subscribeToModeration(() => {
      syncModeration();
      syncAdminEvents();
    });

    // Real-time Reports sync
    const syncReports = () => {
      setReports(getReports());
    };
    syncReports();
    const unsubReports = subscribeToReports(syncReports);

    // Heartbeat to guarantee multi-tab real-time sync even across backgrounded tabs
    const syncInterval = setInterval(() => {
      syncUsers();
      syncPendingOrgs();
      syncAdminEvents();
      syncReports();
      syncVerifications();
    }, 1500);

    const unsubscribeEvents = subscribeToEvents(syncAdminEvents);
    window.addEventListener("spott_registered_updated", syncAdminEvents);
    window.addEventListener("spott_events_updated", syncAdminEvents);
    window.addEventListener("spott_verification_updated", syncVerifications);
    window.addEventListener("spott_reports_updated", syncReports);
    window.addEventListener(PENDING_ORGANIZERS_EVENT, syncPendingOrgs);
    return () => {
      unsubscribeEvents();
      unsubUsers();
      clearInterval(remoteUsersInterval);
      clearInterval(remoteVerificationInterval);
      window.removeEventListener('focus', refreshRemoteUsers);
      unsubPendingOrgs();
      unsubModeration();
      unsubReports();
      clearInterval(syncInterval);
      window.removeEventListener("spott_registered_updated", syncAdminEvents);
      window.removeEventListener("spott_events_updated", syncAdminEvents);
      window.removeEventListener("spott_verification_updated", syncVerifications);
      window.removeEventListener("spott_reports_updated", syncReports);
      window.removeEventListener(PENDING_ORGANIZERS_EVENT, syncPendingOrgs);
    };
  }, []);

  // Search filters
  const [userSearch, setUserSearch] = useState("");
  const [userSortOrder, setUserSortOrder] = useState<"newest" | "oldest" | "name">("newest");
  const [eventSearch, setEventSearch] = useState("");

  // Real-time sorted & filtered users
  const displayedUsers = useMemo(() => {
    const query = userSearch.toLowerCase().trim();
    const filtered = usersList.filter(
      (u) =>
        !query ||
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
    );

    return [...filtered].sort((a, b) => {
      if (userSortOrder === "name") {
        return a.name.localeCompare(b.name);
      }
      const tA = a.joinedAt ? new Date(a.joinedAt).getTime() : new Date(a.joined).getTime() || 0;
      const tB = b.joinedAt ? new Date(b.joinedAt).getTime() : new Date(b.joined).getTime() || 0;
      return userSortOrder === "newest" ? tB - tA : tA - tB;
    });
  }, [usersList, userSearch, userSortOrder]);

  // Modals
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AdminEvent | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedVerification, setSelectedVerification] = useState<VerificationReq | null>(null);
  const [thresholdModalOpen, setThresholdModalOpen] = useState(false);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const recordAdminAction = (entry: { action: string; targetType: string; targetId?: string; summary: string }) => {
    void fetchWithSupabaseSession('/api/admin/audit-logs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
    }).then((response) => {
      if (response.ok) fetchWithSupabaseSession('/api/admin/audit-logs?limit=100').then((r) => r.json()).then((data) => setAuditLogs(data.logs || [])).catch(() => {});
    }).catch(() => {});
  };

  const handleAddKeyword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const kw = newKeywordInput.trim();
    if (!kw) return;
    const updated = addModerationKeyword(kw);
    setModerationKeywords(updated);
    setNewKeywordInput("");
    showNotice(`✓ Added "${kw}" to automated listing filters.`);
  };

  const handleRemoveKeyword = (kw: string) => {
    const updated = removeModerationKeyword(kw);
    setModerationKeywords(updated);
    showNotice(`Removed "${kw}" from listing filters.`);
  };

  const handleResetKeywords = () => {
    const updated = resetModerationKeywords();
    setModerationKeywords(updated);
    showNotice(`Reset listing filters to default moderation keywords.`);
  };

  const handleSaveThreshold = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updated = saveModerationSettings({
      capacityThreshold: tempThreshold,
      sensitivity: tempSensitivity,
    });
    setModerationSettings(updated);
    setThresholdModalOpen(false);
    showNotice(`✓ Threshold saved: Events with ${updated.capacityThreshold}+ capacity will trigger Crowd Safety Review.`);
  };

  // 1. User Management Handlers
  const handleSaveUser = (updated: AdminUser) => {
    setUsersList((prev) => {
      const next = prev.map((u) => (u.id === updated.id ? updated : u));
      saveAdminUsers(next);
      return next;
    });
    setSelectedUser(null);
    recordAdminAction({ action: 'user.updated', targetType: 'user', targetId: updated.id, summary: `Updated account details for ${updated.name}.` });
    showNotice(`Successfully updated account settings for ${updated.name}.`);
  };

  const handleDeleteUser = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently remove ${name}'s account?\n\nThis cannot be undone — the account will not return after a page refresh.`)) return;
    const userToDelete = usersList.find((u) => u.id === id);
    if (userToDelete) {
      deleteAdminUser({ id: userToDelete.id, email: userToDelete.email, name: userToDelete.name });
    } else {
      // Fallback: just filter and save if somehow not in current list
      setUsersList((prev) => {
        const next = prev.filter((u) => u.id !== id);
        saveAdminUsers(next);
        return next;
      });
    }
    setSelectedUser(null);
    recordAdminAction({ action: 'user.deleted', targetType: 'user', targetId: id, summary: `Removed account for ${name}.` });
    showNotice(`✓ Permanently removed ${name}'s account.`);
  };

  // Pending Organizer Approval Handlers
  const handleApproveOrg = async (org: PendingOrganizer) => {
    const response = await fetch('/api/pending-organizers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: org.id, status: 'approved' }) });
    if (!response.ok) { showNotice('Could not approve organizer. Please confirm you are signed in as an administrator.'); return; }
    await syncUsersFromApi();
    setUsersList(getAdminUsers());
    await fetch('/api/pending-organizers').then((r) => r.json()).then((p) => setPendingOrganizers((p.organizers || []).map((item: { id: string; name: string; email: string; status: string; submitted_at: string; decided_at?: string }) => ({ id: item.id, name: item.name, email: item.email, password: '', status: item.status, submittedAt: item.submitted_at, decidedAt: item.decided_at }))));
    showNotice(`✓ Approved organizer "${org.name}" — they can now log in.`);
    addNotification({
      type: "announcement",
      title: "Organizer Account Approved",
      message: `Your organizer account for "${org.name}" has been approved! You can now log in at Spott.`,
      targetRole: "organizer",
      link: "/login",
    });
  };

  const handleRejectOrg = async (org: PendingOrganizer) => {
    const response = await fetch('/api/pending-organizers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: org.id, status: 'rejected' }) });
    if (!response.ok) { showNotice('Could not reject organizer application.'); return; }
    await fetch('/api/pending-organizers').then((r) => r.json()).then((p) => setPendingOrganizers((p.organizers || []).map((item: { id: string; name: string; email: string; status: string; submitted_at: string; decided_at?: string }) => ({ id: item.id, name: item.name, email: item.email, password: '', status: item.status, submittedAt: item.submitted_at, decidedAt: item.decided_at }))));
    showNotice(`✕ Rejected organizer application for "${org.name}".`);
  };

  // 2. Event Moderation Handlers
  const handleSaveEvent = (updated: AdminEvent) => {
    try {
      const stored = getStoredEvents();
      const target = stored.find((e) => e.id === updated.id);
      if (target) {
        target.title = updated.title;
        target.status = updated.status.toLowerCase();
        saveStoredEvent(target);
      }
    } catch {}
    setEventsList((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setSelectedEvent(null);
    recordAdminAction({ action: 'event.moderated', targetType: 'event', targetId: updated.id, summary: `Changed “${updated.title}” status to ${updated.status}.` });
    showNotice(`Event "${updated.title}" status updated to ${updated.status}.`);
    addNotification({
      type: "update",
      title: `Event Moderation: "${updated.title}"`,
      message: `Administrator updated listing status to "${updated.status}".`,
      targetRole: "organizer",
      link: "/organizer",
    });
    if (updated.status === "Active") {
      addNotification({
        type: "announcement",
        title: `Live Event: "${updated.title}"`,
        message: `"${updated.title}" by ${updated.organizer} is now active and open for RSVPs.`,
        targetRole: "user",
        link: "/",
      });
    }
  };

  const handleDeleteEvent = (id: string, title: string) => {
    deleteStoredEvent(id);
    removeNotificationsForEvent(id, title);
    setEventsList((prev) => prev.filter((e) => e.id !== id));
    setSelectedEvent(null);
    recordAdminAction({ action: 'event.removed', targetType: 'event', targetId: id, summary: `Removed event “${title}” from moderation.` });
    showNotice(`Event "${title}" has been taken down and removed.`);
    addNotification({
      type: "cancellation",
      title: `Event Taken Down: "${title}"`,
      message: `An administrator has taken down "${title}" following platform review.`,
      targetRole: "organizer",
      link: "/organizer",
    });
    addNotification({
      type: "cancellation",
      title: `Event Cancelled: "${title}"`,
      message: `The event "${title}" was removed or cancelled.`,
      targetRole: "user",
      link: "/",
    });
  };

  // 3. Report Resolution Handlers
  const handleResolveReportAction = (id: string, actionNote: string) => {
    resolveReport(id, actionNote);
    if (actionNote.toLowerCase().includes("removed") && selectedReport?.eventId) {
      try {
        deleteStoredEvent(selectedReport.eventId);
        removeNotificationsForEvent(selectedReport.eventId, selectedReport.event);
        setEventsList((prev) => prev.filter((e) => e.id !== selectedReport.eventId));
      } catch {}
    }
    setReports(getReports());
    setSelectedReport(null);
    recordAdminAction({ action: 'report.resolved', targetType: 'report', targetId: id, summary: `Resolved report: ${actionNote}` });
    showNotice(`✓ Report resolved: ${actionNote}`);
  };

  // 4. Verification Handlers & 30-Day Archive System
  const [verificationTab, setVerificationTab] = useState<"active" | "archive">("active");
  const [archiveFilter, setArchiveFilter] = useState<"all" | "approved" | "rejected">("all");

  const todayStr = formatDate(0);
  const expiresStr = formatDate(30);

  const persistAdminVerificationStatus = (name: string, status: 'pending' | 'approved' | 'rejected') => {
    void fetchWithSupabaseSession('/api/verification', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationName: name, status: status === 'approved' ? 'verified' : status }),
    }).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        showNotice(payload.error || 'Verification update did not sync to the server.');
      }
    }).catch(() => showNotice('Verification update did not sync to the server.'));
  };

  const handleApproveVerification = (id: string, name: string) => {
    setVerifications((prev) =>
      prev.map((v) =>
        v.id === id
          ? {
              ...v,
              status: "approved",
              decidedAt: todayStr,
              retentionDays: 30,
              expiresDate: expiresStr,
              decisionReason: "Accreditation approved by University SuperAdmin.",
            }
          : v
      )
    );
    setApprovalStatus("approved", undefined, name);
    persistAdminVerificationStatus(name, 'approved');
    setVerState(getVerificationState("Metro Creative Group"));
    setSelectedVerification(null);
    recordAdminAction({ action: 'verification.approved', targetType: 'verification', targetId: id, summary: `Approved verification for ${name}.` });
    showNotice(`✓ Approved verification for ${name}. Record moved to 30-Day Archive History.`);
    addNotification({
      type: "announcement",
      title: `Accreditation Approved: ${name}`,
      message: `Official verified trust badge issued for ${name}. All public event listings will now proudly display the verified checkmark.`,
      targetRole: "organizer",
      link: "/organizer",
    });
  };

  const handleRejectVerification = (id: string, name: string) => {
    setVerifications((prev) =>
      prev.map((v) =>
        v.id === id
          ? {
              ...v,
              status: "rejected",
              decidedAt: todayStr,
              retentionDays: 30,
              expiresDate: expiresStr,
              decisionReason: "Application declined. Stored in compliance archive.",
            }
          : v
      )
    );
    setApprovalStatus("rejected", undefined, name);
    persistAdminVerificationStatus(name, 'rejected');
    setVerState(getVerificationState("Metro Creative Group"));
    setSelectedVerification(null);
    recordAdminAction({ action: 'verification.rejected', targetType: 'verification', targetId: id, summary: `Rejected verification for ${name}.` });
    showNotice(`✕ Declined verification for ${name}. Record moved to 30-Day Archive History.`);
    addNotification({
      type: "cancellation",
      title: `Accreditation Application Declined`,
      message: `Application was declined. Record preserved in 30-day compliance archive until ${expiresStr}. You can submit updated credentials anytime.`,
      targetRole: "organizer",
      link: "/organizer",
    });
  };

  const handleRestoreVerification = (id: string, name: string) => {
    setVerifications((prev) =>
      prev.map((v) =>
        v.id === id
          ? {
              ...v,
              status: "pending",
              decidedAt: undefined,
              retentionDays: undefined,
              expiresDate: undefined,
              decisionReason: undefined,
            }
          : v
      )
    );
    setApprovalStatus("pending", undefined, name);
    persistAdminVerificationStatus(name, 'pending');
    setVerState(getVerificationState("Metro Creative Group"));
    showNotice(`Restored ${name} to Active Verification Queue.`);
  };

  const handleResetAllSampleVerifications = () => {
    setVerifications(initialVerifications);
    resetVerificationState();
    setVerState(getVerificationState());
    setVerificationTab("active");
    showNotice("Reset all sample verification requests to Active Queue.");
  };

  // Compute active vs archived counts
  const activeVerifications = verifications.filter((v) => {
    const isMetro = v.organizer === "Metro Creative Group";
    const st = isMetro ? verState.status : v.status;
    return st === "pending";
  });

  const archivedVerifications = verifications.filter((v) => {
    const isMetro = v.organizer === "Metro Creative Group";
    const st = isMetro ? verState.status : v.status;
    if (st === "pending") return false;
    if (archiveFilter === "all") return true;
    return st === archiveFilter;
  });

  const allArchivedCount = verifications.filter((v) => {
    const isMetro = v.organizer === "Metro Creative Group";
    const st = isMetro ? verState.status : v.status;
    return st !== "pending";
  }).length;

  const pendingReportsCount = reports.filter((r) => r.status === "open").length;
  const activeReports = reports.filter((report) => report.status === "open");
  const archivedReports = reports.filter((report) => report.status === "resolved");
  const displayedReports = reportTab === "active" ? activeReports : archivedReports;
  const archivedAdminEvents = eventsList.filter((event) => event.status === "Archived");
  const displayedAdminEvents = (eventScope === "active"
    ? eventsList.filter((event) => event.status !== "Archived")
    : archivedAdminEvents
  ).filter((event) => event.title.toLowerCase().includes(eventSearch.toLowerCase()));
  const pendingVerificationsCount = activeVerifications.length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Action Notice Alert */}
      {actionNotice && (
        <div className="p-3.5 bg-[#fff0e8] text-[#ff6b35] rounded-xl border border-[#ff6b35]/30 text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-[#ff6b35] font-black">
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. DASHBOARD TAB: Executive Overview (Wireframe 4)                        */}
      {/* ========================================================================= */}
      {currentTab === "dashboard" && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717] tracking-tight">
                Admin Dashboard
              </h1>
              <p className="text-sm text-[#666666] font-medium mt-1">
                System moderation, organization verifications, and platform activity metrics.
              </p>
            </div>
          </div>

          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <Link href="/admin?tab=users" className="no-underline">
              <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35] transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs sm:text-sm font-bold text-[#666666] uppercase tracking-wide">
                    Total Users
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-[#171717]">{usersList.length}</span>
                </div>
                <p className="text-[11px] text-[#888888] font-semibold mt-2">{usersList.length} registered account{usersList.length !== 1 ? 's' : ''}</p>
              </div>
            </Link>

            <Link href="/admin?tab=events" className="no-underline">
              <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35] transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs sm:text-sm font-bold text-[#666666] uppercase tracking-wide">
                    Active Events
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-[#171717]">{eventsList.filter((event) => event.status === "Active").length}</span>
                </div>
                <p className="text-[11px] text-[#ff6b35] font-semibold mt-2">
                  {eventsList.filter((event) => event.status === "Active").length === 0 ? "No active events" : `Across campus categories`}
                </p>
              </div>
            </Link>

            <Link href="/admin?tab=reports" className="no-underline">
              <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-rose-300 transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs sm:text-sm font-bold text-[#666666] uppercase tracking-wide">
                    Pending Reports
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-rose-50 text-rose-600 flex items-center justify-center transition-colors">
                    <Flag className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-rose-600">
                    {pendingReportsCount}
                  </span>
                  <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                    Review
                  </span>
                </div>
                <p className="text-[11px] text-[#888888] mt-2">Community reports</p>
              </div>
            </Link>

            <Link href="/admin?tab=verifications" className="no-underline">
              <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35] transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs sm:text-sm font-bold text-[#666666] uppercase tracking-wide">
                    Verification Requests
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                    <FileCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-[#ff6b35]">
                    {pendingVerificationsCount}
                  </span>
                  <span className="text-xs font-bold text-[#ff6b35] bg-[#fff0e8] px-2 py-0.5 rounded-md">
                    Action queue
                  </span>
                </div>
                <p className="text-[11px] text-[#888888] mt-2">Student organizations</p>
              </div>
            </Link>
          </div>

          {/* 2-Column Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Reports */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-5 border-b border-[#e6e1d8] flex items-center justify-between">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-[#171717]">Recent Reports</h2>
                    <p className="text-xs text-[#666666] mt-0.5">Flagged events and attendee complaints</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    {pendingReportsCount} Open
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase text-[#666666]">
                        <th className="py-3 px-5">Reporter</th>
                        <th className="py-3 px-5">Event</th>
                        <th className="py-3 px-5">Reason</th>
                        <th className="py-3 px-5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e1d8]">
                      {activeReports.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-xs text-[#888888]">
                            No reports submitted. All campus listings are in good standing.
                          </td>
                        </tr>
                      ) : (
                        activeReports.slice(0, 6).map((rep) => (
                          <tr key={rep.id} className="hover:bg-[#faf8f3]/60 transition-colors">
                            <td className="py-3.5 px-5 font-bold text-[#171717] whitespace-nowrap">
                              {rep.reporter}
                            </td>
                            <td className="py-3.5 px-5 text-[#444444] font-medium whitespace-nowrap">
                              {rep.event}
                            </td>
                            <td className="py-3.5 px-5 text-[#666666] whitespace-nowrap">
                              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-md">
                                {rep.reason}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              {rep.status === "open" ? (
                                <button
                                  onClick={() => setSelectedReport(rep)}
                                  className="text-xs font-black text-[#ff6b35] hover:text-[#e0531f] hover:underline cursor-pointer"
                                >
                                  Resolve
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                  <Check className="w-3.5 h-3.5" /> Resolved
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 border-t border-[#e6e1d8] bg-[#faf8f3] text-right">
                <Link
                  href="/admin?tab=reports"
                  className="text-xs font-bold text-[#666666] hover:text-[#ff6b35] transition-colors"
                >
                  View all incident reports →
                </Link>
              </div>
            </div>

            {/* Pending Verifications */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-5 border-b border-[#e6e1d8] flex items-center justify-between">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-[#171717]">Pending Verifications</h2>
                    <p className="text-xs text-[#666666] mt-0.5">Campus club trust badge submissions</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#fff0e8] text-[#ff6b35] border border-[#ff6b35]/20">
                    {pendingVerificationsCount} Pending
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase text-[#666666]">
                        <th className="py-3 px-5">Organizer</th>
                        <th className="py-3 px-5">Submitted</th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e1d8]">
                      {activeVerifications.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-xs text-[#888888]">
                            No verification requests pending review.
                          </td>
                        </tr>
                      ) : (
                        activeVerifications.slice(0, 6).map((ver) => (
                          <tr key={ver.id} className="hover:bg-[#faf8f3]/60 transition-colors">
                            <td className="py-3.5 px-5">
                              <div className="font-bold text-[#171717]">{ver.organizer}</div>
                              <div className="text-[11px] text-[#888888]">{ver.category}</div>
                            </td>
                            <td className="py-3.5 px-5 text-xs text-[#555555] font-semibold whitespace-nowrap">
                              {ver.submitted}
                            </td>
                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              {ver.status === "pending" ? (
                                <div className="inline-flex items-center gap-3">
                                  <button
                                    onClick={() => setSelectedVerification(ver)}
                                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                                  >
                                    Review & Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectVerification(ver.id, ver.organizer)}
                                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : ver.status === "approved" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">
                                  <XCircle className="w-3.5 h-3.5" /> Rejected
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 border-t border-[#e6e1d8] bg-[#faf8f3] text-right">
                <Link
                  href="/admin?tab=verifications"
                  className="text-xs font-bold text-[#666666] hover:text-[#ff6b35] transition-colors"
                >
                  Review all accreditation files →
                </Link>
              </div>
            </div>
          </div>

          {/* Monthly Activity Chart */}
          <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-[#171717]">Monthly Activity</h2>
                <p className="text-xs text-[#666666] mt-0.5">
                  Platform event creation volume and attendee interest trends
                </p>
              </div>

              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-[#666666]">
                Reporting month
                <input type="month" value={analyticsMonth} max={new Date().toISOString().slice(0, 7)} onChange={(event) => { setAnalyticsMonth(event.target.value); setHoveredMonth(null); }} className="px-3 py-2 rounded-xl border border-[#e6e1d8] bg-white text-xs font-semibold normal-case tracking-normal text-[#171717]" />
              </label>

              {hoveredMonth ? (
                <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[#fff0e8] border border-[#ff6b35]/20 text-xs font-bold text-[#ff6b35]">
                  <span>{hoveredMonth.month} · {monthlyMetrics.monthLabel}:</span>
                  <span className="text-[#171717]">{hoveredMonth.events} {hoveredMonth.events === 1 ? "Event" : "Events"}</span>
                  <span>•</span>
                  <span className="text-[#171717]">{hoveredMonth.rsvps} {hoveredMonth.rsvps === 1 ? "RSVP" : "RSVPs"}</span>
                </div>
              ) : (
                (() => {
                  const activeOrPeak =
                    monthlyActivity.find((m) => m.events > 0 || m.rsvps > 0) ||
                    monthlyActivity[0];
                  return (
                    <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[#faf8f3] border border-[#e6e1d8] text-xs font-bold text-[#666666]">
                      <span>{activeOrPeak.month} · {monthlyMetrics.monthLabel}:</span>
                      <span className="text-[#171717]">{activeOrPeak.events} {activeOrPeak.events === 1 ? "Event" : "Events"}</span>
                      <span>•</span>
                      <span className="text-[#171717]">{activeOrPeak.rsvps} {activeOrPeak.rsvps === 1 ? "RSVP" : "RSVPs"}</span>
                    </div>
                  );
                })()
              )}
            </div>

            <div className="pt-8 pb-4">
              <div className="h-52 flex items-end justify-between gap-3 sm:gap-8 px-4 border-b border-[#e6e1d8]">
              {monthlyActivity.map((item) => {
                  const hasEvents = item.events > 0 || item.rsvps > 0;
                  return (
                    <div
                      key={item.month}
                      className="flex-1 flex flex-col items-center gap-2 group cursor-pointer h-full justify-end"
                      onMouseEnter={() => setHoveredMonth(item)}
                      onMouseLeave={() => setHoveredMonth(null)}
                    >
                      <div
                        className={`text-[11px] font-black px-2 py-0.5 rounded-md whitespace-nowrap mb-1 transition-all ${
                          hasEvents
                            ? "opacity-100 text-[#ff6b35] bg-[#fff0e8] border border-[#ff6b35]/30 shadow-xs"
                            : "opacity-0 group-hover:opacity-100 text-[#171717] bg-white border border-[#e6e1d8] shadow-md"
                        }`}
                      >
                        {item.events} events
                      </div>

                      <div
                        style={{ height: `${item.heightPercent}%` }}
                        className={`
                          w-full max-w-[48px] rounded-t-xl transition-all duration-300
                          ${
                            hasEvents
                              ? "bg-gradient-to-t from-[#ff6b35] to-[#ff8c42] shadow-md group-hover:brightness-110"
                              : "bg-[#e6e1d8] group-hover:bg-[#ff6b35]/70"
                          }
                        `}
                      />
                      <span
                        className={`text-xs font-bold transition-colors ${
                          hasEvents ? "text-[#ff6b35]" : "text-[#666666] group-hover:text-[#171717]"
                        }`}
                      >
                        {item.month.replace("Week ", "W")}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-[#888888] font-medium pt-3 px-2">
                <span>{monthlyMetrics.rangeLabel}</span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-[#888888]">
                  {eventsList.length > 0 ? (
                    <><TrendingUp className="w-3.5 h-3.5 text-[#ff6b35]" /> Event data accumulates as organizers publish listings ({eventsList.length} published)</>
                  ) : (
                    "No event data yet — chart will populate when events are published"
                  )}
                </span>
                <span>Month-to-date</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. USERS TAB: Full Interactive Directory & Modal                          */}
      {/* ========================================================================= */}
      {currentTab === "users" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">User Management</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Sync
                </span>
              </div>
              <p className="text-sm text-[#666666] mt-0.5">
                Manage registered university accounts and roles ({usersList.length} active).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user by name or email..."
                  className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm border border-[#e6e1d8] rounded-xl bg-white focus:outline-none focus:border-[#ff6b35]"
                />
              </div>
              <select
                value={userSortOrder}
                onChange={(e) => setUserSortOrder(e.target.value as typeof userSortOrder)}
                className="px-3 py-2 text-xs font-bold border border-[#e6e1d8] rounded-xl bg-white text-[#171717] focus:outline-none focus:border-[#ff6b35] cursor-pointer"
                title="Sort registered users"
              >
                <option value="newest">🕒 Joined: Newest First</option>
                <option value="oldest">⏳ Joined: Oldest First</option>
                <option value="name">🔤 Name (A-Z)</option>
              </select>
            </div>
          </div>

          {/* ── Pending Organizer Approvals ── */}
          {(() => {
            const pendingOnes = pendingOrganizers.filter((o) => o.status === "pending");
            const decidedOnes = pendingOrganizers.filter((o) => o.status !== "pending");
            return (
              <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-[#e6e1d8] flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-black text-[#171717] flex items-center gap-2">
                      Organizer Account Approvals
                      {pendingOnes.length > 0 && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 animate-pulse">
                          {pendingOnes.length} Pending
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-[#666666] mt-0.5">Review and approve or reject organizer registration requests.</p>
                  </div>
                </div>
                {pendingOrganizers.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#888888]">
                    <UserCheck className="w-8 h-8 mx-auto mb-2 text-[#ccc]" />
                    No organizer applications yet. New sign-ups will appear here.
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase text-[#666666]">
                        <th className="py-3 px-6">Organizer Name</th>
                        <th className="py-3 px-6">Email</th>
                        <th className="py-3 px-6">Submitted</th>
                        <th className="py-3 px-6">Status</th>
                        <th className="py-3 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e1d8]">
                      {pendingOnes.map((org) => (
                        <tr key={org.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="py-4 px-6 font-bold text-[#171717]">{org.name}</td>
                          <td className="py-4 px-6 text-xs text-[#555555] font-mono">{org.email}</td>
                          <td className="py-4 px-6 text-xs text-[#666666]">
                            {new Date(org.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="py-4 px-6">
                            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              Pending
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleApproveOrg(org)}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-black transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => handleRejectOrg(org)}
                                className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-black transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {decidedOnes.map((org) => (
                        <tr key={org.id} className="opacity-60">
                          <td className="py-3 px-6 font-bold text-[#171717]">{org.name}</td>
                          <td className="py-3 px-6 text-xs text-[#555555] font-mono">{org.email}</td>
                          <td className="py-3 px-6 text-xs text-[#666666]">
                            {new Date(org.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="py-3 px-6">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                              org.status === "approved"
                                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                : "text-rose-700 bg-rose-50 border-rose-200"
                            }`}>
                              {org.status === "approved" ? "Approved" : "Rejected"}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-right text-xs text-[#888888]">
                            {org.decidedAt ? new Date(org.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}

          {/* ── Registered Users Table ── */}
          <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase text-[#666666]">
                  <th className="py-3.5 px-6">Name</th>
                  <th className="py-3.5 px-6">Email</th>
                  <th className="py-3.5 px-6">Role</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Joined</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e1d8]">
                {displayedUsers.map((u) => {
                  const rt = formatRealTimeJoined(u);
                  return (
                    <tr key={u.id} className="hover:bg-[#faf8f3]/60 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {/* Profile Avatar */}
                          {(() => {
                            const p = getUserProfile(u.email);
                            const ini = getInitials(u.name);
                            return (
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-[#eee9e1] border border-[#e6e1d8] flex items-center justify-center text-xs font-black text-[#555] shrink-0">
                                {p.avatarUrl ? (
                                  <img src={p.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{ini}</span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="min-w-0">
                            <p className="font-bold text-[#171717] text-sm truncate">{u.name}</p>
                            {(() => {
                              const p = getUserProfile(u.email);
                              if (p.phone || p.address) {
                                return (
                                  <p className="text-[11px] text-[#888888] truncate">
                                    {p.phone || p.address}
                                  </p>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-xs text-[#555555] font-mono">{u.email}</td>
                      <td className="py-4 px-6">
                        <span className={`text-xs font-extrabold px-2.5 py-1 rounded-md ${
                          u.role === "Admin" ? "bg-black text-white" : u.role === "Organizer" ? "bg-[#fff0e8] text-[#ff6b35]" : "bg-gray-100 text-gray-700"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-xs font-bold ${u.status === "Active" ? "text-emerald-600" : u.status === "Suspended" ? "text-rose-600" : "text-amber-600"}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            {rt.isRecent && (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                            )}
                            <span className={`text-xs font-bold ${rt.isRecent ? "text-emerald-700" : "text-[#171717]"}`}>
                              {rt.display}
                            </span>
                            {rt.isRecent && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 tracking-wide">
                                Recent
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#888888] font-medium" title={rt.fullDate}>
                            {rt.display !== rt.relative ? rt.relative : rt.fullDate}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => setSelectedUser(u)}
                          className="px-3 py-1 bg-[#fff0e8] text-[#ff6b35] hover:bg-[#ff6b35] hover:text-white rounded-lg text-xs font-black transition-colors cursor-pointer"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. EVENTS TAB: Moderation Directory & Review Modal                        */}
      {/* ========================================================================= */}
      {currentTab === "events" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">{eventScope === "archive" ? "Archived Campus Events" : "Campus Events Moderation"}</h1>
              <p className="text-sm text-[#666666] mt-0.5">
                {eventScope === "archive"
                  ? `${archivedAdminEvents.length} past events retained for 30 days after archiving.`
                  : `Monitoring ${eventsList.filter((event) => event.status !== "Archived").length} active and scheduled campus events.`}
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Search event title..."
                className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm border border-[#e6e1d8] rounded-xl bg-white focus:outline-none focus:border-[#ff6b35]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#f0ede6] p-1.5 rounded-2xl border border-[#e6e1d8] w-fit">
            <button type="button" onClick={() => setEventScope("active")} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${eventScope === "active" ? "bg-[#171717] text-white" : "text-[#666666] hover:text-[#171717]"}`}>
              Active Events ({eventsList.filter((event) => event.status !== "Archived").length})
            </button>
            <button type="button" onClick={() => setEventScope("archive")} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${eventScope === "archive" ? "bg-[#171717] text-white" : "text-[#666666] hover:text-[#171717]"}`}>
              Archive ({archivedAdminEvents.length})
            </button>
          </div>

          <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase text-[#666666]">
                  <th className="py-3.5 px-6">Event Title</th>
                  <th className="py-3.5 px-6">Organizer</th>
                  <th className="py-3.5 px-6">Date</th>
                  <th className="py-3.5 px-6">RSVPs</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e1d8]">
                {displayedAdminEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-[#888888]">
                      {eventScope === "archive" ? "Past events will remain here for 30 days after archiving." : "No active or scheduled events currently need monitoring."}
                    </td>
                  </tr>
                ) : (
                  displayedAdminEvents.map((e) => (
                      <tr key={e.id} className="hover:bg-[#faf8f3]/60 transition-colors">
                        <td className="py-4 px-6 font-bold text-[#171717]">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-[#171717]">{e.title}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {e.isKeywordFlagged && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                  <span>🚩 Keyword Flagged</span>
                                </span>
                              )}
                              {e.isLargeGathering && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  <span>⚠️ {moderationSettings.capacityThreshold}+ Crowd Review</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-xs text-[#555555]">{e.organizer}</td>
                        <td className="py-4 px-6 text-xs text-[#666666]">{e.date}</td>
                        <td className="py-4 px-6 font-bold text-sm text-[#171717]">
                          {e.rsvps}
                          {e.capacity ? <span className="text-xs text-[#888888] font-normal"> / {e.capacity}</span> : null}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            e.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : e.status === "Draft" ? "bg-amber-50 text-amber-700 border border-amber-200" : e.status === "Flagged" ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-gray-100 text-gray-700 border border-gray-200"
                          }`}>
                            {e.status === "Archived" && e.archiveExpiresAt
                              ? `Archived · until ${new Date(e.archiveExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                              : e.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => setSelectedEvent(e)}
                            className="px-3 py-1 bg-gray-100 hover:bg-[#ff6b35] hover:text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. REPORTS TAB: Incident Reports & Full Resolution Modal                  */}
      {/* ========================================================================= */}
      {currentTab === "reports" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Incident & Policy Reports</h1>
              <p className="text-sm text-[#666666] mt-0.5">Attendee submitted safety and listing integrity reports.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                {pendingReportsCount} Open Review{pendingReportsCount !== 1 ? 's' : ''}
              </span>
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {archivedReports.length} Archived
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#f0ede6] p-1.5 rounded-2xl border border-[#e6e1d8] w-fit">
            <button
              type="button"
              onClick={() => setReportTab("active")}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${reportTab === "active" ? "bg-[#171717] text-white" : "text-[#666666] hover:text-[#171717]"}`}
            >
              Active Incidents ({activeReports.length})
            </button>
            <button
              type="button"
              onClick={() => setReportTab("archive")}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${reportTab === "archive" ? "bg-[#171717] text-white" : "text-[#666666] hover:text-[#171717]"}`}
            >
              <Archive className="w-3.5 h-3.5" />
              Archive History ({archivedReports.length})
            </button>
          </div>

          {displayedReports.length === 0 ? (
            <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                {reportTab === "archive" ? <Archive className="w-6 h-6" /> : <Check className="w-6 h-6" />}
              </div>
              <h3 className="font-black text-base text-[#171717]">
                {reportTab === "archive" ? "No Archived Incidents" : "All Good! No Reports Pending"}
              </h3>
              <p className="text-xs text-[#666666] max-w-sm mx-auto leading-relaxed">
                {reportTab === "archive"
                  ? "Resolved incidents will be retained here for 30 days."
                  : "There are currently no active attendee safety or policy violation reports on Spott."}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm p-6 space-y-4">
              {displayedReports.map((rep) => (
                <div
                  key={rep.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#faf8f3] border border-[#e6e1d8] gap-4 hover:border-[#ff6b35]/40 transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Flag className={`w-4 h-4 shrink-0 ${rep.status === "open" ? "text-rose-600" : "text-[#888888]"}`} />
                      <span className="font-bold text-[#171717] text-sm truncate">{rep.event}</span>
                      <span className="text-xs px-2.5 py-0.5 bg-rose-50 text-rose-700 font-bold rounded-md border border-rose-200/60 shrink-0">
                        {rep.reason}
                      </span>
                      <span
                        className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border shrink-0 ${
                          rep.status === "open"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {rep.status === "open" ? "● Needs Review" : "✓ Resolved"}
                      </span>
                    </div>

                    <p className="text-xs text-[#666666]">
                      Reported by <strong className="text-[#171717]">{rep.reporter}</strong>
                      {rep.reporterEmail ? <span className="font-mono text-[#888888] ml-1">({rep.reporterEmail})</span> : null}
                      {rep.submitted ? <span className="ml-2 text-[#888888]">• {rep.submitted}</span> : null}
                    </p>

                    {rep.details && (
                      <p className="text-xs text-[#444444] bg-white p-2.5 rounded-lg border border-[#e6e1d8] mt-1 leading-relaxed">
                        &quot;{rep.details}&quot;
                      </p>
                    )}

                    {rep.resolutionNote && (
                      <div className="text-xs text-emerald-800 font-semibold pt-0.5 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Action: {rep.resolutionNote}</span>
                        {rep.decidedAt ? <span className="text-[#888888] font-normal">({rep.decidedAt})</span> : null}
                        {rep.expiresAt ? (
                          <span className="text-[#888888] font-normal">
                            · Retained until {new Date(rep.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center">
                    {rep.status === "open" ? (
                      <button
                        onClick={() => setSelectedReport(rep)}
                        className="px-4 py-2 bg-[#171717] text-white text-xs font-bold rounded-xl hover:bg-[#ff6b35] transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                      >
                        Resolve Issue
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <Check className="w-4 h-4" /> Resolved
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODERATION TAB                                                         */}
      {/* ========================================================================= */}
      {currentTab === "moderation" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Content Moderation & Safety Policies</h1>
            <p className="text-sm text-[#666666] mt-0.5">
              Automated screening triggers, custom keyword interception, and crowd safety review thresholds across Spott.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Automated Listing Filters */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-base text-[#171717]">Automated Listing Filters</h3>
                  <p className="text-xs text-[#666666] mt-0.5">
                    Keywords automatically intercepted for review before going live in the Discover feed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetKeywords}
                  className="text-[11px] font-bold text-[#ff6b35] hover:underline cursor-pointer"
                >
                  Reset Defaults
                </button>
              </div>

              {/* Keyword Badges with Delete */}
              <div className="flex flex-wrap gap-2 pt-1">
                {moderationKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#faf8f3] text-[#171717] rounded-xl border border-[#e6e1d8] font-mono shadow-2xs group"
                  >
                    <span>{kw}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      className="text-[#999999] hover:text-rose-600 transition-colors cursor-pointer"
                      title={`Remove "${kw}"`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add Keyword Input Bar */}
              <form onSubmit={handleAddKeyword} className="pt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  placeholder="Add keyword or trigger phrase (e.g. hazing, fake tickets)..."
                  className="flex-1 text-xs font-medium border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 bg-white focus:outline-none focus:border-[#ff6b35]"
                />
                <button
                  type="submit"
                  disabled={!newKeywordInput.trim()}
                  className="px-4 py-2.5 bg-[#171717] hover:bg-[#ff6b35] disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0"
                >
                  + Add Filter
                </button>
              </form>
            </div>

            {/* Card 2: Crowd Safety & Capacity Threshold */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-base text-[#171717]">Event Capacity & Crowd Safety Review</h3>
                  <p className="text-xs text-[#666666] mt-0.5">
                    Automatically flags major events that exceed venue capacity or crowd limits for security coordination.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#faf8f3] border border-[#e6e1d8] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#666666] uppercase tracking-wide">
                    Major Gathering Threshold:
                  </span>
                  <span className="text-sm font-black text-[#ff6b35]">
                    {moderationSettings.capacityThreshold}+ Expected Attendees
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#666666]">
                  <span>Moderation Screening Mode:</span>
                  <span className="font-bold text-[#171717]">{moderationSettings.sensitivity} Policy</span>
                </div>
                <p className="text-[11px] text-[#888888] pt-1 leading-relaxed">
                  Events with capacity or RSVPs at or above {moderationSettings.capacityThreshold} will display a &quot;Crowd Review&quot; badge in your Events moderation list.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTempThreshold(moderationSettings.capacityThreshold);
                  setTempSensitivity(moderationSettings.sensitivity);
                  setThresholdModalOpen(true);
                }}
                className="px-4 py-2.5 bg-[#ff6b35] hover:bg-[#e0531f] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-2"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Configure Thresholds</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. VERIFICATION REQUESTS TAB: Accreditation Inspection Modal              */}
      {/* ========================================================================= */}
      {currentTab === "verifications" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">
                Organization Verification Queue
              </h1>
              <p className="text-sm text-[#666666] mt-0.5">
                Review student organization accreditation and manage the 30-day compliance archive.
              </p>
            </div>

            {/* View Switcher Pills */}
            <div className="flex items-center gap-1.5 bg-[#f0ede6] p-1.5 rounded-2xl border border-[#e6e1d8] self-start sm:self-auto shadow-2xs">
              <button
                type="button"
                onClick={() => setVerificationTab("active")}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  verificationTab === "active"
                    ? "bg-[#171717] text-white shadow-sm ring-2 ring-[#ff6b35]"
                    : "text-[#666666] hover:text-[#171717]"
                }`}
              >
                <span>Active Queue</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    verificationTab === "active"
                      ? "bg-[#ff6b35] text-white"
                      : "bg-white text-[#666666]"
                  }`}
                >
                  {activeVerifications.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVerificationTab("archive")}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  verificationTab === "archive"
                    ? "bg-[#171717] text-white shadow-sm ring-2 ring-[#ff6b35]"
                    : "text-[#666666] hover:text-[#171717]"
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archive History</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    verificationTab === "archive"
                      ? "bg-[#ff6b35] text-white"
                      : "bg-white text-[#666666]"
                  }`}
                >
                  {allArchivedCount}
                </span>
              </button>
            </div>
          </div>

          {/* VIEW 1: ACTIVE QUEUE */}
          {verificationTab === "active" && (
            <div className="space-y-4">
              {activeVerifications.length > 0 ? (
                <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm p-6 space-y-4">
                  {activeVerifications.map((ver) => {
                    const isMetro = ver.organizer === "Metro Creative Group";
                    const isExpedited = isMetro && verState.isExpedited;
                    const docCount = isMetro ? verState.documents.length : ver.documents.length;

                    return (
                      <div
                        key={ver.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border gap-4 transition-all ${
                          isExpedited
                            ? "bg-gradient-to-r from-amber-50/70 via-white to-orange-50/40 border-amber-300 shadow-sm ring-1 ring-amber-300"
                            : "bg-[#faf8f3] border-[#e6e1d8]"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <ShieldCheck className={`w-5 h-5 ${isExpedited ? "text-amber-600" : "text-[#ff6b35]"}`} />
                            <span className="font-black text-[#171717] text-base">{ver.organizer}</span>
                            <span className="text-xs px-2.5 py-0.5 bg-[#fff0e8] text-[#ff6b35] font-bold rounded-full border border-[#ff6b35]/20">
                              {ver.category}
                            </span>
                            {isExpedited && (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black rounded-full shadow-xs animate-pulse">
                                <Zap className="w-3 h-3 fill-white" />
                                <span>⚡ URGENT: EXPEDITE REQUESTED</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#666666]">
                            Submitted: <strong>{ver.submitted}</strong> • {docCount} documents attached
                          </p>
                          {isExpedited && verState.expediteNote && (
                            <div className="text-xs text-amber-900 bg-amber-100/70 px-2.5 py-1 rounded-lg border border-amber-300/60 inline-flex items-center gap-1.5 mt-1 font-medium">
                              <span className="font-black text-amber-800">Note:</span>
                              <span>&quot;{verState.expediteNote}&quot;</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setSelectedVerification(ver)}
                            className={`px-4 py-2 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs ${
                              isExpedited
                                ? "bg-gradient-to-r from-[#ff6b35] to-[#ff8c42] hover:from-[#e0531f] hover:to-[#ff6b35]"
                                : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                          >
                            {isExpedited ? "Review Expedited" : "Approve & Issue Badge"}
                          </button>
                          <button
                            onClick={() => handleRejectVerification(ver.id, ver.organizer)}
                            className="px-4 py-2 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors cursor-pointer"
                          >
                            Decline & Archive
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Empty state when queue is clear */
                <div className="bg-white border border-[#e6e1d8] rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-300 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1.5">
                    <h3 className="text-lg sm:text-xl font-black text-[#171717]">
                      Active Verification Queue Clear
                    </h3>
                    <p className="text-xs sm:text-sm text-[#666666] leading-relaxed">
                      All student organization accreditation requests have been processed. Approved and declined applications have been moved to the <strong>Archive History</strong>, where they remain stored for 30 days.
                    </p>
                  </div>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => setVerificationTab("archive")}
                      className="px-5 py-2.5 bg-[#171717] hover:bg-[#ff6b35] text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Archive className="w-4 h-4" />
                      <span>View Archive History ({allArchivedCount} records)</span>
                    </button>
                    <button
                      onClick={handleResetAllSampleVerifications}
                      className="px-4 py-2.5 bg-[#faf8f3] border border-[#e6e1d8] hover:border-[#ff6b35] text-xs font-bold text-[#555555] hover:text-[#171717] rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#ff6b35]" />
                      <span>Reset Sample Queue to Pending</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: ARCHIVE HISTORY (30 DAYS RETENTION) */}
          {verificationTab === "archive" && (
            <div className="space-y-4">
              {/* 30-Day Policy Alert Banner */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-[#fff0e8] via-amber-50/70 to-white rounded-2xl border border-amber-300/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#ff6b35]/10 text-[#ff6b35] flex items-center justify-center shrink-0">
                    <History className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs sm:text-sm font-black text-[#171717]">
                        30-Day Institutional Audit Archive
                      </p>
                      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-md">
                        30 Calendar Days
                      </span>
                    </div>
                    <p className="text-xs text-[#666666]">
                      Approved accreditation credentials and declined applications are retained in this historical archive for 30 days before automated purge.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                  <button
                    onClick={handleResetAllSampleVerifications}
                    className="px-3 py-1.5 bg-white border border-[#e6e1d8] hover:border-[#ff6b35] text-xs font-bold text-[#ff6b35] rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset All to Queue</span>
                  </button>
                </div>
              </div>

              {/* Archive Sub-filter pills */}
              <div className="flex items-center gap-2 pt-1 overflow-x-auto">
                {(["all", "approved", "rejected"] as const).map((filterKey) => {
                  const label =
                    filterKey === "all"
                      ? `All Archived (${allArchivedCount})`
                      : filterKey === "approved"
                      ? `Approved (${verifications.filter((v) => (v.organizer === "Metro Creative Group" ? verState.status : v.status) === "approved").length})`
                      : `Declined (${verifications.filter((v) => (v.organizer === "Metro Creative Group" ? verState.status : v.status) === "rejected").length})`;

                  return (
                    <button
                      key={filterKey}
                      onClick={() => setArchiveFilter(filterKey)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        archiveFilter === filterKey
                          ? "bg-[#171717] text-white shadow-2xs"
                          : "bg-white border border-[#e6e1d8] text-[#666666] hover:border-[#ff6b35] hover:text-[#171717]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Archive Records List */}
              {archivedVerifications.length > 0 ? (
                <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm p-6 space-y-4">
                  {archivedVerifications.map((ver) => {
                    const isMetro = ver.organizer === "Metro Creative Group";
                    const currentStatus = isMetro ? verState.status : ver.status;
                    const docCount = isMetro ? verState.documents.length : ver.documents.length;
                    const decidedAt = (isMetro && verState.decidedAt) || ver.decidedAt || todayStr;
                    const expiresDate = (isMetro && verState.expiresDate) || ver.expiresDate || expiresStr;
                    const isApproved = currentStatus === "approved";

                    return (
                      <div
                        key={ver.id}
                        className={`flex flex-col lg:flex-row lg:items-center justify-between p-4 sm:p-5 rounded-2xl border gap-4 transition-all ${
                          isApproved
                            ? "bg-emerald-50/30 border-emerald-200/80"
                            : "bg-rose-50/20 border-rose-200/80"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <ShieldCheck
                              className={`w-5 h-5 ${
                                isApproved ? "text-emerald-600" : "text-rose-600"
                              }`}
                            />
                            <span className="font-black text-[#171717] text-base">
                              {ver.organizer}
                            </span>
                            <span className="text-xs px-2.5 py-0.5 bg-white text-[#666666] font-bold rounded-full border border-[#e6e1d8]">
                              {ver.category}
                            </span>

                            {/* Status Pill */}
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-black rounded-full border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Verified & Issued Badge</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 bg-rose-100 text-rose-800 font-black rounded-full border border-rose-300">
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Application Declined</span>
                              </span>
                            )}
                          </div>

                          {/* Historical Details */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#666666]">
                            <span>
                              Submitted: <strong>{ver.submitted}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Decided: <strong>{decidedAt}</strong> by SuperAdmin
                            </span>
                            <span>•</span>
                            <span>{docCount} documents attached</span>
                          </div>

                          {/* 30-Day Retention Notice Badge */}
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              <strong>30-Day Retention:</strong> Stored in archive until{" "}
                              <strong>{expiresDate}</strong> (30 days remaining before purge)
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto">
                          <button
                            type="button"
                            onClick={() => setSelectedVerification(ver)}
                            className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-[#e6e1d8] hover:border-[#ff6b35] text-[#171717] hover:text-[#ff6b35] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#ff6b35]" />
                            <span>Inspect & View PDFs</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreVerification(ver.id, ver.organizer)}
                            className="px-3.5 py-2 bg-[#171717] hover:bg-[#ff6b35] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore to Queue</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white border border-[#e6e1d8] rounded-2xl p-8 text-center text-xs text-[#888888]">
                  No archived verification records found matching this filter.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. ANALYTICS TAB: Charts & Visualizations                                 */}
      {/* ========================================================================= */}
      {currentTab === "analytics" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Platform Analytics & System Intelligence</h1>
              <p className="text-sm text-[#666666] mt-0.5">
                Monthly platform adoption, event activity, RSVP volume, and moderation trends.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-[#666666]">
              Reporting month · {monthlyMetrics.rangeLabel}
              <input type="month" value={analyticsMonth} max={new Date().toISOString().slice(0, 7)} onChange={(event) => setAnalyticsMonth(event.target.value)} className="px-3 py-2 rounded-xl border border-[#e6e1d8] bg-white text-sm font-semibold normal-case tracking-normal text-[#171717]" />
            </label>
          </div>

          {/* Top 4 KPI Metrics — all derived from real state */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Users Joined</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">{monthlyMetrics.users}</p>
              <p className="text-xs text-[#888888] font-medium mt-2">
                {monthlyMetrics.monthLabel} · {usersList.filter((user) => user.status === "Active").length} active accounts total
              </p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Events Created</span>
              <p className="text-3xl sm:text-4xl font-black text-[#ff6b35]">{monthlyMetrics.events}</p>
              <p className="text-xs text-[#666666] font-medium mt-2">
                {monthlyMetrics.monthLabel} · {eventsList.filter((event) => event.status === "Active").length} active now
              </p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">RSVP Submissions</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">{monthlyMetrics.rsvps}</p>
              <p className="text-xs text-[#888888] font-medium mt-2">Received during {monthlyMetrics.monthLabel}</p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Open Reports</span>
              {(() => {
                const openCount = monthlyMetrics.openReports;
                const resolvedCount = monthlyMetrics.reports - monthlyMetrics.openReports;
                return (
                  <>
                    <p className={`text-3xl sm:text-4xl font-black ${openCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {openCount}
                    </p>
                    <p className="text-xs text-[#666666] font-medium mt-2">
                      {reports.length === 0
                        ? "No reports filed"
                        : resolvedCount > 0
                        ? `${resolvedCount} resolved`
                        : `${openCount} awaiting review`}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Monthly Growth chart — real data, empty state when no events */}
          <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base sm:text-lg font-black text-[#171717]">Platform Snapshot: Users vs Events</h3>
                <p className="text-xs text-[#666666]">Current registered users and published events on the platform</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-[#171717]" />
                  <span>Users</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-[#ff6b35]" />
                  <span>Events</span>
                </div>
              </div>
            </div>

            {eventsList.length === 0 && usersList.length <= 3 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center gap-3 border border-dashed border-[#e6e1d8] rounded-2xl bg-[#faf8f3]">
                <BarChart2 className="w-8 h-8 text-[#cccccc]" />
                <p className="text-sm font-bold text-[#888888]">No activity data yet</p>
                <p className="text-xs text-[#aaaaaa] max-w-xs">
                  Chart will populate as organizers publish events and users register on the platform.
                </p>
              </div>
            ) : (
              <div className="pt-4 pb-2">
                <div className="h-48 flex items-end justify-around gap-8 px-8 border-b border-[#e6e1d8]">
                  {[
                    { label: "Users", value: usersList.length, color: "#171717" },
                    { label: "Events", value: eventsList.length, color: "#ff6b35" },
                  ].map((item) => {
                    const maxVal = Math.max(usersList.length, eventsList.length, 1);
                    const barH = Math.max(Math.round((item.value / maxVal) * 160), 6);
                    return (
                      <div key={item.label} className="flex flex-col items-center gap-2 group cursor-pointer">
                        <span className="text-xs font-black text-[#171717] group-hover:text-[#ff6b35] transition-colors">{item.value}</span>
                        <div
                          style={{ height: `${barH}px`, backgroundColor: item.color, width: "56px" }}
                          className="rounded-t-xl transition-all group-hover:brightness-125"
                        />
                        <span className="text-xs font-bold text-[#666666]">{item.label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-xs text-[#888888] pt-3 font-medium">
                  {usersList.length} user{usersList.length !== 1 ? "s" : ""} · {eventsList.length} event{eventsList.length !== 1 ? "s" : ""} currently on platform
                </p>
              </div>
            )}
          </div>

          {/* Chart Grid 2 — Category Popularity & Top Venues from real eventsList */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Campus Category Popularity */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-black text-[#171717]">Campus Category Popularity</h3>
                <p className="text-xs text-[#666666]">Distribution of active listings across event genres</p>
              </div>
              {eventsList.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-center">
                  <PieChart className="w-8 h-8 text-[#cccccc]" />
                  <p className="text-sm font-bold text-[#888888]">No events to categorize</p>
                  <p className="text-xs text-[#aaaaaa]">Category breakdown will appear once organizers publish events.</p>
                </div>
              ) : (() => {
                const cats: Record<string, number> = {};
                eventsList.forEach(e => { const c = e.category || "General"; cats[c] = (cats[c] || 0) + 1; });
                const total = eventsList.length;
                const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4);
                const colors = ["bg-[#ff6b35]", "bg-indigo-600", "bg-emerald-500", "bg-amber-500"];
                const barColors = ["#ff6b35", "#4f46e5", "#10b981", "#f59e0b"];
                return (
                  <div className="space-y-3 pt-2">
                    <div className="h-4 w-full flex rounded-full overflow-hidden shadow-inner">
                      {sorted.map(([cat, cnt], i) => (
                        <div key={cat} style={{ width: `${Math.round((cnt / total) * 100)}%`, backgroundColor: barColors[i] }} title={`${cat}: ${Math.round((cnt / total) * 100)}%`} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      {sorted.map(([cat, cnt], i) => (
                        <div key={cat} className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${colors[i]}`} />
                            <span className="text-xs font-bold text-[#171717] truncate">{cat}</span>
                          </div>
                          <span className="text-lg font-black text-[#171717] mt-1 block">
                            {Math.round((cnt / total) * 100)}% ({cnt} evt{cnt !== 1 ? "s" : ""})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Top Active Campus Venues */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-black text-[#171717]">Top Active Campus Venues</h3>
                <p className="text-xs text-[#666666]">Locations hosting the highest concentration of events</p>
              </div>
              {eventsList.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-center">
                  <MapPin className="w-8 h-8 text-[#cccccc]" />
                  <p className="text-sm font-bold text-[#888888]">No venue data yet</p>
                  <p className="text-xs text-[#aaaaaa]">Venue rankings will populate as events are published.</p>
                </div>
              ) : (() => {
                const venues: Record<string, { events: number; rsvps: number }> = {};
                eventsList.forEach(e => {
                  const v = e.location || "Campus Venue";
                  if (!venues[v]) venues[v] = { events: 0, rsvps: 0 };
                  venues[v].events += 1;
                  venues[v].rsvps += e.registrations || 0;
                });
                const sorted = Object.entries(venues).sort((a, b) => b[1].events - a[1].events).slice(0, 4);
                const maxEvents = sorted[0]?.[1].events || 1;
                const barCols = ["#ff6b35", "#171717", "#10b981", "#8b5cf6"];
                return (
                  <div className="space-y-3.5 pt-2">
                    {sorted.map(([venue, data], i) => (
                      <div key={venue}>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span className="text-[#171717] truncate max-w-[60%]">{i + 1}. {venue}</span>
                          <span style={{ color: barCols[i] }}>{data.events} Event{data.events !== 1 ? "s" : ""} • {data.rsvps} RSVPs</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div style={{ width: `${Math.round((data.events / maxEvents) * 100)}%`, backgroundColor: barCols[i] }} className="h-full rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* INTERACTIVE MODALS                                                        */}
      {/* ========================================================================= */}

      {/* 1. MANAGE USER MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-3">
                {/* Profile Avatar */}
                {(() => {
                  const p = getUserProfile(selectedUser.email);
                  const ini = getInitials(selectedUser.name);
                  return (
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[#eee9e1] border border-[#e6e1d8] flex items-center justify-center text-sm font-black text-[#555] shrink-0">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt={selectedUser.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{ini}</span>
                      )}
                    </div>
                  );
                })()}
                <div>
                  <h3 className="text-lg font-black text-[#171717]">Manage Account</h3>
                  <p className="text-xs text-[#666666] font-mono">{selectedUser.email}</p>
                  {(() => {
                    const p = getUserProfile(selectedUser.email);
                    const details = [p.phone, p.address].filter(Boolean).join(" · ");
                    return details ? (
                      <p className="text-[11px] text-[#888888] mt-0.5">{details}</p>
                    ) : null;
                  })()}
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#888888] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-[#666666] mb-1.5">User Full Name</label>
                <input
                  type="text"
                  value={selectedUser.name}
                  onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })}
                  className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#ff6b35]"
                />
              </div>

              <div>
                <label className="block text-[#666666] mb-1.5">Assigned Platform Role</label>
                <select
                  value={selectedUser.role}
                  onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value as typeof selectedUser.role })}
                  className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-sm font-bold bg-white focus:outline-none focus:border-[#ff6b35]"
                >
                  <option value="Student">Student (Standard Attendee)</option>
                  <option value="Organizer">Organizer (Event Creator)</option>
                  <option value="Admin">Admin (Full Control)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#666666] mb-1.5">Account Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Active", "Pending", "Suspended"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSelectedUser({ ...selectedUser, status: st })}
                      className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                        selectedUser.status === st
                          ? st === "Active"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : st === "Suspended"
                            ? "bg-rose-600 text-white border-rose-600"
                            : "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-[#555555] border-[#e6e1d8] hover:bg-gray-50"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real-time Join Info */}
              {(() => {
                const rt = formatRealTimeJoined(selectedUser);
                return (
                  <div className="p-3 bg-[#faf8f3] border border-[#e6e1d8] rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[#888888] font-bold block text-[10px] uppercase tracking-wider">Date Joined</span>
                      <span className="text-[#171717] font-extrabold text-sm flex items-center gap-1.5 mt-0.5">
                        {rt.isRecent && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        )}
                        {rt.display}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-[#666666] font-medium block">Exact Timestamp:</span>
                      <span className="text-xs font-bold text-[#171717] font-mono">{rt.fullDate}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="pt-3 border-t border-[#e6e1d8] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleDeleteUser(selectedUser.id, selectedUser.name)}
                className="px-3.5 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveUser(selectedUser)}
                  className="px-5 py-2 bg-[#171717] hover:bg-[#ff6b35] text-white rounded-xl text-xs font-black shadow-md transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. REVIEW EVENT MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-[#ff6b35] bg-[#fff0e8] px-2 py-0.5 rounded">
                  {selectedEvent.category}
                </span>
                <h3 className="text-lg font-black text-[#171717] mt-1">{selectedEvent.title}</h3>
                <p className="text-xs text-[#666666]">By {selectedEvent.organizer}</p>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#888888] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-bold">
              <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#666666]">Date Scheduled:</span>
                  <span className="text-[#171717]">{selectedEvent.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666]">Current RSVPs:</span>
                  <span className="text-[#171717] font-black">{selectedEvent.rsvps} reservations</span>
                </div>
              </div>

              <div>
                <label className="block text-[#666666] mb-1.5">Listing Status</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["Active", "Draft", "Archived", "Flagged"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSelectedEvent({ ...selectedEvent, status: st })}
                      className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                        selectedEvent.status === st
                          ? st === "Active"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : st === "Flagged"
                            ? "bg-rose-600 text-white border-rose-600"
                            : "bg-[#171717] text-white border-[#171717]"
                          : "bg-white text-[#555555] border-[#e6e1d8] hover:bg-gray-50"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#e6e1d8] flex items-center justify-between">
              <button
                onClick={() => handleDeleteEvent(selectedEvent.id, selectedEvent.title)}
                className="px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Take Down</span>
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="px-4 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveEvent(selectedEvent)}
                  className="px-5 py-2 bg-[#171717] hover:bg-[#ff6b35] text-white rounded-xl text-xs font-black shadow-md transition-colors"
                >
                  Save Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. RESOLVE REPORT MODAL */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2 text-rose-600">
                <Flag className="w-5 h-5" />
                <h3 className="text-lg font-black text-[#171717]">Resolve Incident Report</h3>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#888888] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 space-y-1">
                <p className="font-bold text-rose-900">Event: {selectedReport.event}</p>
                <p className="text-rose-800">Violation: {selectedReport.reason}</p>
                <p className="text-rose-700">Reported by: {selectedReport.reporter}</p>
                {selectedReport.details && <p className="text-[#555555] pt-1">Note: &quot;{selectedReport.details}&quot;</p>}
              </div>

              <div className="space-y-2 pt-2">
                <p className="font-bold text-[#171717]">Select Resolution Action:</p>
                <button
                  onClick={() => handleResolveReportAction(selectedReport.id, "Issued warning letter to organizer")}
                  className="w-full p-3 text-left rounded-xl border border-[#e6e1d8] hover:border-[#ff6b35] hover:bg-[#fff0e8] font-bold transition-all"
                >
                  ⚠️ Issue Official Campus Warning to Organizer
                </button>
                <button
                  onClick={() => handleResolveReportAction(selectedReport.id, "Event listing removed from Spott feed")}
                  className="w-full p-3 text-left rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-800 font-bold transition-all"
                >
                  🚫 Unpublish and Remove Listing Immediately
                </button>
                <button
                  onClick={() => handleResolveReportAction(selectedReport.id, "Dismissed as false report")}
                  className="w-full p-3 text-left rounded-xl border border-gray-200 hover:bg-gray-50 text-[#666666] font-bold transition-all"
                >
                  ✓ Dismiss as Inaccurate / False Alarm
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. INSPECT VERIFICATION MODAL */}
      {selectedVerification && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2 text-[#ff6b35]">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-lg font-black text-[#171717]">{selectedVerification.organizer}</h3>
              </div>
              <button
                onClick={() => setSelectedVerification(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#888888] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8] space-y-1">
                <p className="text-[#666666]">Genre: <strong>{selectedVerification.category}</strong></p>
                <p className="text-[#666666]">Submission Date: <strong>{selectedVerification.submitted}</strong></p>
              </div>

              {selectedVerification.organizer === "Metro Creative Group" && verState.isExpedited && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-black text-xs text-amber-800">
                    <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span>⚡ Priority Expedited (Emergency Review Active)</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    &quot;{verState.expediteNote || "Organizer requested priority accreditation."}&quot;
                  </p>
                </div>
              )}

              <div>
                <p className="font-bold text-[#171717] mb-2">Submitted Accreditation Credentials:</p>
                <div className="space-y-2">
                  {selectedVerification.organizer === "Metro Creative Group" ? (
                    verState.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-emerald-900 font-bold overflow-hidden pr-2">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="truncate">
                            <p className="truncate text-xs">{doc.name}</p>
                            <p className="text-[10px] text-emerald-700 font-normal">{doc.type}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAdminPdfPreview(doc.name)}
                          className="px-2.5 py-1 bg-white hover:bg-emerald-600 hover:text-white border border-emerald-300 rounded-lg text-[11px] font-bold text-emerald-700 transition-colors shrink-0 cursor-pointer shadow-2xs"
                        >
                          View PDF
                        </button>
                      </div>
                    ))
                  ) : (
                    selectedVerification.documents.map((doc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-emerald-900 font-bold overflow-hidden pr-2">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="truncate text-xs">{doc}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAdminPdfPreview(doc)}
                          className="px-2.5 py-1 bg-white hover:bg-emerald-600 hover:text-white border border-emerald-300 rounded-lg text-[11px] font-bold text-emerald-700 transition-colors shrink-0 cursor-pointer shadow-2xs"
                        >
                          View PDF
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* If item is archived (approved or rejected), show retention badge */}
              {((selectedVerification.organizer === "Metro Creative Group" ? verState.status : selectedVerification.status) !== "pending") && (
                <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-black text-amber-900">
                        {((selectedVerification.organizer === "Metro Creative Group" ? verState.status : selectedVerification.status) === "approved")
                          ? "Archived Record: Verified & Approved"
                          : "Archived Record: Application Declined"}
                      </p>
                      <p className="text-[10px] text-amber-700">
                        Preserved in 30-day archive until {(selectedVerification.organizer === "Metro Creative Group" ? verState.expiresDate : selectedVerification.expiresDate) || expiresStr}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 shrink-0">
                    30 Days
                  </span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#e6e1d8] flex items-center justify-between gap-2">
              {((selectedVerification.organizer === "Metro Creative Group" ? verState.status : selectedVerification.status) !== "pending") ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleRestoreVerification(selectedVerification.id, selectedVerification.organizer);
                      setSelectedVerification(null);
                    }}
                    className="px-3.5 py-2 bg-[#171717] hover:bg-[#ff6b35] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore to Queue</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedVerification(null)}
                      className="px-4 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50"
                    >
                      Close
                    </button>
                    {((selectedVerification.organizer === "Metro Creative Group" ? verState.status : selectedVerification.status) === "rejected") ? (
                      <button
                        onClick={() => handleApproveVerification(selectedVerification.id, selectedVerification.organizer)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-colors"
                      >
                        Approve & Issue Badge
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRejectVerification(selectedVerification.id, selectedVerification.organizer)}
                        className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold transition-colors"
                      >
                        Revoke & Decline
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="w-full flex justify-end gap-2">
                  <button
                    onClick={() => handleRejectVerification(selectedVerification.id, selectedVerification.organizer)}
                    className="px-4 py-2 border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition-colors"
                  >
                    Decline & Archive
                  </button>
                  <button
                    onClick={() => handleApproveVerification(selectedVerification.id, selectedVerification.organizer)}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-colors"
                  >
                    Approve & Issue Checkmark
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. CONFIGURE THRESHOLDS MODAL */}
      {thresholdModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#ff6b35]" />
                <h3 className="text-lg font-black text-[#171717]">Event Capacity & Crowd Safety Threshold</h3>
              </div>
              <button
                type="button"
                onClick={() => setThresholdModalOpen(false)}
                className="text-[#888888] hover:text-[#171717] font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveThreshold} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-[#171717] mb-1 uppercase tracking-wide">
                  Major Gathering Security Trigger (Attendees / Capacity)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={10}
                    max={10000}
                    value={tempThreshold}
                    onChange={(e) => setTempThreshold(Number(e.target.value))}
                    required
                    className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-sm font-bold text-[#171717] focus:outline-none focus:border-[#ff6b35]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#888888] font-bold pointer-events-none">
                    attendees
                  </span>
                </div>
                <p className="text-[11px] text-[#888888] mt-1.5 leading-relaxed">
                  Events with capacity or total RSVPs at or above this number will be flagged with a <strong>Crowd Review</strong> badge in the moderation directory so security and campus marshals can prepare.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-[#171717] mb-1 uppercase tracking-wide">
                  Content Screening Sensitivity
                </label>
                <select
                  value={tempSensitivity}
                  onChange={(e) => setTempSensitivity(e.target.value as "Strict" | "Standard")}
                  className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white text-[#171717] focus:outline-none focus:border-[#ff6b35] cursor-pointer"
                >
                  <option value="Strict">Strict (Auto-Hold & Intercept Large Gatherings)</option>
                  <option value="Standard">Standard (Advisory Warnings on High Capacity)</option>
                </select>
                <p className="text-[11px] text-[#888888] mt-1.5 leading-relaxed">
                  Strict mode requires manual approval for flagged large events; Standard mode lists them while alerting staff.
                </p>
              </div>

              <div className="pt-3 border-t border-[#e6e1d8] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setThresholdModalOpen(false)}
                  className="px-4 py-2 border border-[#e6e1d8] hover:bg-gray-50 rounded-xl text-xs font-bold text-[#666666] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#ff6b35] hover:bg-[#e0531f] text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {currentTab === "audit" && (
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Admin Audit Log</h1>
              <p className="mt-1 text-sm text-[#666666]">Recent account, organizer, and event actions recorded on the server.</p>
            </div>
            <button type="button" onClick={() => fetchWithSupabaseSession('/api/admin/audit-logs?limit=100').then(async (response) => {
              const payload = await response.json();
              if (!response.ok) { setAuditLogsError(payload.error || 'Unable to load audit logs.'); return; }
              setAuditLogs(payload.logs || []); setAuditLogsError(null);
            }).catch(() => setAuditLogsError('Unable to connect to the audit log service.'))}
              className="rounded-xl border border-[#e6e1d8] bg-white px-4 py-2 text-xs font-bold text-[#171717] hover:border-[#ff6b35]">
              Refresh logs
            </button>
          </div>
          {auditLogsError && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{auditLogsError}</div>}
          <div className="overflow-hidden rounded-2xl border border-[#e6e1d8] bg-white shadow-sm">
            {auditLogs.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#777777]">{auditLogsError ? 'Audit entries are unavailable until admin access is configured.' : 'No admin actions have been recorded yet.'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-[#faf8f3] text-[10px] uppercase tracking-wider text-[#777777]"><tr>
                    <th className="px-5 py-3">When</th><th className="px-5 py-3">Admin</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Target</th><th className="px-5 py-3">Details</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#f0ece5]">
                    {auditLogs.map((entry) => <tr key={entry.log_id}>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-[#666666]">{new Date(entry.created_at).toLocaleString()}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-[#171717]">{entry.actor_email}</td>
                      <td className="px-5 py-4"><span className="rounded-full bg-[#fff2eb] px-2.5 py-1 text-[10px] font-black text-[#d65325]">{entry.action}</span></td>
                      <td className="px-5 py-4 text-xs text-[#555555]">{entry.target_type}{entry.target_id ? ` · ${entry.target_id}` : ''}</td>
                      <td className="px-5 py-4 text-xs text-[#555555]">{entry.summary}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* PDF Viewer Modal */}
      {adminPdfPreview && (
        <PdfViewerModal
          documentName={adminPdfPreview}
          organizerName={selectedVerification?.organizer || "Metro Creative Group"}
          onClose={() => setAdminPdfPreview(null)}
        />
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-gray-500">Loading Admin Dashboard...</div>}>
      <AdminContent />
    </Suspense>
  );
}
