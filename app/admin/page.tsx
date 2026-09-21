"use client";

import { useState, useEffect, Suspense } from "react";
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
} from "lucide-react";
import {
  getVerificationState,
  defaultVerificationState,
  setApprovalStatus,
  resetVerificationState,
  VerificationState,
} from "@/lib/verification-store";
import { addNotification } from "@/lib/notifications-store";
import PdfViewerModal from "@/components/PdfViewerModal";

interface Report {
  id: string;
  reporter: string;
  event: string;
  reason: string;
  status: "open" | "resolved";
  details?: string;
}

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

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "SuperAdmin" | "Organizer" | "Student";
  status: "Active" | "Pending" | "Suspended";
  joined: string;
}

interface AdminEvent {
  id: string;
  title: string;
  organizer: string;
  category: string;
  date: string;
  rsvps: number;
  status: "Active" | "Draft" | "Past" | "Flagged";
}

interface MonthlyData {
  month: string;
  events: number;
  rsvps: number;
  heightPercent: number;
}

const initialReports: Report[] = [
  {
    id: "rep-1",
    reporter: "Sara S.",
    event: "Campus Rally",
    reason: "Noise Violation",
    status: "open",
    details: "Amplified sound exceeded decibel guidelines during study hours in Arts Quad.",
  },
  {
    id: "rep-2",
    reporter: "Mark K.",
    event: "Intro to Python",
    reason: "Spam Listing",
    status: "open",
    details: "Commercial external coding academy masquerading as a student-led session.",
  },
  {
    id: "rep-3",
    reporter: "Alex M.",
    event: "Downtown Beat",
    reason: "Inappropriate content",
    status: "open",
    details: "Unlicensed alcohol sponsor mentioned on public promotional flyer.",
  },
];

const now = new Date();
const currentYear = now.getFullYear();
const formatDate = (daysOffset: number = 0) => {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const initialVerifications: VerificationReq[] = [
  {
    id: "ver-1",
    organizer: "Beta Tech Club",
    submitted: formatDate(-3),
    category: "Academic & Tech",
    status: "pending",
    documents: ["Beta_Tech_Accreditation.pdf", "Faculty_Endorsement_Signed.pdf"],
  },
  {
    id: "ver-2",
    organizer: "Local Foodies",
    submitted: formatDate(-2),
    category: "Culinary Arts",
    status: "pending",
    documents: ["Foodies_Charter.pdf", "Sanitation_Permit_Compliance.pdf"],
  },
  {
    id: "ver-3",
    organizer: "Metro Creative Group",
    submitted: formatDate(0),
    category: "Arts & Culture",
    status: "pending",
    documents: ["Metro_Creative_Registration.pdf", "Adviser_Signoff_Signed.pdf"],
  },
];

const monthlyActivity: MonthlyData[] = [
  { month: "May", events: 34, rsvps: 210, heightPercent: 32 },
  { month: "Jun", events: 58, rsvps: 450, heightPercent: 55 },
  { month: "Jul", events: 65, rsvps: 580, heightPercent: 62 },
  { month: "Aug", events: 45, rsvps: 390, heightPercent: 44 },
  { month: "Sep", events: 92, rsvps: 820, heightPercent: 88 },
  { month: "Oct", events: 118, rsvps: 1040, heightPercent: 100 },
  { month: "Nov", events: 72, rsvps: 610, heightPercent: 68 },
];

const initialUsersList: AdminUser[] = [
  { id: "u-1", name: "John Doe", email: "john.doe@spott.edu", role: "SuperAdmin", status: "Active", joined: `Jan 12, ${currentYear}` },
  { id: "u-2", name: "Metro Creative Group", email: "contact@metrocreative.org", role: "Organizer", status: "Active", joined: `Feb 03, ${currentYear}` },
  { id: "u-3", name: "Alice Green", email: "alice.g@university.edu", role: "Student", status: "Active", joined: `Mar 19, ${currentYear}` },
  { id: "u-4", name: "Bob Miller", email: "bob.m@university.edu", role: "Student", status: "Active", joined: `Mar 22, ${currentYear}` },
  { id: "u-5", name: "Beta Tech Club", email: "leads@betatech.edu", role: "Organizer", status: "Pending", joined: formatDate(-3) },
  { id: "u-6", name: "Spam Bot 404", email: "bot99@suspicious.io", role: "Student", status: "Suspended", joined: formatDate(-1) },
];

const initialEventsList: AdminEvent[] = [
  { id: "e-1", title: "Downtown Jazz Sessions", organizer: "Metro Creative Group", category: "Concerts", date: `Oct 24, ${currentYear}`, rsvps: 84, status: "Active" },
  { id: "e-2", title: "Winter Arts & Crafts Fair", organizer: "Metro Creative Group", category: "Workshops", date: `Dec 10, ${currentYear}`, rsvps: 0, status: "Draft" },
  { id: "e-3", title: "Tech Startup Panel", organizer: "Metro Creative Group", category: "School Events", date: `Sep 05, ${currentYear}`, rsvps: 112, status: "Past" },
  { id: "e-4", title: "Midnight Night Market", organizer: "Local Foodies", category: "Night Markets", date: `Nov 02, ${currentYear}`, rsvps: 240, status: "Active" },
  { id: "e-5", title: `Hackathon ${currentYear}`, organizer: "Beta Tech Club", category: "School Events", date: `Nov 15, ${currentYear}`, rsvps: 310, status: "Active" },
];

function AdminContent() {
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "dashboard";

  const [reports, setReports] = useState<Report[]>(initialReports);
  const [verifications, setVerifications] = useState<VerificationReq[]>(initialVerifications);
  const [usersList, setUsersList] = useState<AdminUser[]>(initialUsersList);
  const [eventsList, setEventsList] = useState<AdminEvent[]>(initialEventsList);
  const [hoveredMonth, setHoveredMonth] = useState<MonthlyData | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Verification store state & PDF preview (SSR-safe initial baseline)
  const [verState, setVerState] = useState<VerificationState>(defaultVerificationState);
  const [adminPdfPreview, setAdminPdfPreview] = useState<string | null>(null);

  useEffect(() => {
    // Sync with client localStorage on mount to prevent SSR hydration mismatch
    const initial = getVerificationState();
    setVerState(initial);
    setVerifications((prev) =>
      prev.map((v) =>
        v.organizer === "Metro Creative Group"
          ? {
              ...v,
              status: initial.status,
              documents: initial.documents.map((d) => d.name),
            }
          : v
      )
    );

    const handleUpdate = () => {
      const updated = getVerificationState();
      setVerState(updated);
      setVerifications((prev) =>
        prev.map((v) =>
          v.organizer === "Metro Creative Group"
            ? {
                ...v,
                status: updated.status,
                documents: updated.documents.map((d) => d.name),
              }
            : v
        )
      );
    };
    handleUpdate();
    window.addEventListener("spott_verification_updated", handleUpdate);
    return () => window.removeEventListener("spott_verification_updated", handleUpdate);
  }, []);

  // Search filters
  const [userSearch, setUserSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");

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

  // 1. User Management Handlers
  const handleSaveUser = (updated: AdminUser) => {
    setUsersList((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelectedUser(null);
    showNotice(`Successfully updated account settings for ${updated.name}.`);
  };

  // 2. Event Moderation Handlers
  const handleSaveEvent = (updated: AdminEvent) => {
    setEventsList((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setSelectedEvent(null);
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
    setEventsList((prev) => prev.filter((e) => e.id !== id));
    setSelectedEvent(null);
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
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "resolved" } : r))
    );
    setSelectedReport(null);
    showNotice(`Report resolved: ${actionNote}`);
  };

  // 4. Verification Handlers & 30-Day Archive System
  const [verificationTab, setVerificationTab] = useState<"active" | "archive">("active");
  const [archiveFilter, setArchiveFilter] = useState<"all" | "approved" | "rejected">("all");

  const todayStr = formatDate(0);
  const expiresStr = formatDate(30);

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
    if (name === "Metro Creative Group") {
      setApprovalStatus("approved");
      setVerState(getVerificationState());
    }
    setSelectedVerification(null);
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
    if (name === "Metro Creative Group") {
      setApprovalStatus("rejected");
      setVerState(getVerificationState());
    }
    setSelectedVerification(null);
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
    if (name === "Metro Creative Group") {
      setApprovalStatus("pending");
      setVerState(getVerificationState());
    }
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
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Live Supabase Sync
              </span>
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
                  <span className="text-3xl sm:text-4xl font-black text-[#171717]">{usersList.length * 240}</span>
                </div>
                <p className="text-[11px] text-emerald-600 font-semibold mt-2">↑ 14% new signups</p>
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
                  <span className="text-3xl sm:text-4xl font-black text-[#171717]">{eventsList.length * 9 + 3}</span>
                </div>
                <p className="text-[11px] text-[#ff6b35] font-semibold mt-2">Across 8 categories</p>
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
                      {reports.map((rep) => (
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
                      ))}
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
                      {verifications.map((ver) => (
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
                      ))}
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

              {hoveredMonth && (
                <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[#fff0e8] border border-[#ff6b35]/20 text-xs font-bold text-[#ff6b35]">
                  <span>{hoveredMonth.month} 2025:</span>
                  <span className="text-[#171717]">{hoveredMonth.events} Events</span>
                  <span>•</span>
                  <span className="text-[#171717]">{hoveredMonth.rsvps} RSVPs</span>
                </div>
              )}
            </div>

            <div className="pt-8 pb-4">
              <div className="h-52 flex items-end justify-between gap-3 sm:gap-8 px-4 border-b border-[#e6e1d8]">
                {monthlyActivity.map((item) => {
                  const isPeak = item.month === "Oct";
                  return (
                    <div
                      key={item.month}
                      className="flex-1 flex flex-col items-center gap-2 group cursor-pointer h-full justify-end"
                      onMouseEnter={() => setHoveredMonth(item)}
                      onMouseLeave={() => setHoveredMonth(null)}
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-black text-[#171717] bg-white border border-[#e6e1d8] shadow-md px-2 py-0.5 rounded-md whitespace-nowrap mb-1">
                        {item.events} evts
                      </div>

                      <div
                        style={{ height: `${item.heightPercent}%` }}
                        className={`
                          w-full max-w-[48px] rounded-t-xl transition-all duration-300
                          ${
                            isPeak
                              ? "bg-gradient-to-t from-[#ff6b35] to-[#ff8c42] shadow-md group-hover:brightness-110"
                              : "bg-[#e6e1d8] group-hover:bg-[#ff6b35]/70"
                          }
                        `}
                      />
                      <span
                        className={`text-xs font-bold transition-colors ${
                          isPeak ? "text-[#ff6b35]" : "text-[#666666] group-hover:text-[#171717]"
                        }`}
                      >
                        {item.month}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-[#888888] font-medium pt-3 px-2">
                <span>May 2025</span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-[#ff6b35]">
                  <TrendingUp className="w-3.5 h-3.5" /> October reached all-time high (118 events)
                </span>
                <span>Nov 2025</span>
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
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">User Management</h1>
              <p className="text-sm text-[#666666] mt-0.5">Manage 1,420 registered university accounts and roles.</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search user by name or email..."
                className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm border border-[#e6e1d8] rounded-xl bg-white focus:outline-none focus:border-[#ff6b35]"
              />
            </div>
          </div>

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
                {usersList
                  .filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
                  .map((u) => (
                    <tr key={u.id} className="hover:bg-[#faf8f3]/60 transition-colors">
                      <td className="py-4 px-6 font-bold text-[#171717]">{u.name}</td>
                      <td className="py-4 px-6 text-xs text-[#555555] font-mono">{u.email}</td>
                      <td className="py-4 px-6">
                        <span className={`text-xs font-extrabold px-2.5 py-1 rounded-md ${
                          u.role === "SuperAdmin" ? "bg-black text-white" : u.role === "Organizer" ? "bg-[#fff0e8] text-[#ff6b35]" : "bg-gray-100 text-gray-700"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-xs font-bold ${u.status === "Active" ? "text-emerald-600" : u.status === "Suspended" ? "text-rose-600" : "text-amber-600"}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-xs text-[#666666]">{u.joined}</td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => setSelectedUser(u)}
                          className="px-3 py-1 bg-[#fff0e8] text-[#ff6b35] hover:bg-[#ff6b35] hover:text-white rounded-lg text-xs font-black transition-colors cursor-pointer"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
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
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Campus Events Moderation</h1>
              <p className="text-sm text-[#666666] mt-0.5">Monitoring all 48 active and scheduled campus events.</p>
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
                {eventsList
                  .filter((e) => e.title.toLowerCase().includes(eventSearch.toLowerCase()))
                  .map((e) => (
                    <tr key={e.id} className="hover:bg-[#faf8f3]/60 transition-colors">
                      <td className="py-4 px-6 font-bold text-[#171717]">{e.title}</td>
                      <td className="py-4 px-6 text-xs text-[#555555]">{e.organizer}</td>
                      <td className="py-4 px-6 text-xs text-[#666666]">{e.date}</td>
                      <td className="py-4 px-6 font-bold">{e.rsvps}</td>
                      <td className="py-4 px-6">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          e.status === "Active" ? "bg-emerald-50 text-emerald-700" : e.status === "Draft" ? "bg-amber-50 text-amber-700" : e.status === "Flagged" ? "bg-rose-50 text-rose-700" : "bg-gray-100 text-gray-700"
                        }`}>
                          {e.status}
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
                  ))}
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
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Incident & Policy Reports</h1>
            <p className="text-sm text-[#666666] mt-0.5">Attendee submitted safety and listing integrity reports.</p>
          </div>

          <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm p-6 space-y-4">
            {reports.map((rep) => (
              <div key={rep.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#faf8f3] border border-[#e6e1d8] gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Flag className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-[#171717] text-sm">{rep.event}</span>
                    <span className="text-xs px-2 py-0.5 bg-rose-50 text-rose-700 font-bold rounded">
                      {rep.reason}
                    </span>
                  </div>
                  <p className="text-xs text-[#666666] mt-1">Reported by <strong>{rep.reporter}</strong></p>
                  {rep.details && <p className="text-xs text-[#888888] mt-0.5 italic">"{rep.details}"</p>}
                </div>
                <div>
                  {rep.status === "open" ? (
                    <button
                      onClick={() => setSelectedReport(rep)}
                      className="px-4 py-2 bg-[#171717] text-white text-xs font-bold rounded-xl hover:bg-[#ff6b35] transition-colors cursor-pointer"
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODERATION TAB                                                         */}
      {/* ========================================================================= */}
      {currentTab === "moderation" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Content Moderation Policies</h1>
            <p className="text-sm text-[#666666] mt-0.5">Automated screening triggers and community guidelines.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="font-black text-base text-[#171717]">Automated Listing Filters</h3>
              <p className="text-xs text-[#666666]">
                Keywords automatically intercepted for review before going live in the Discover feed.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-xs px-2.5 py-1 bg-gray-100 rounded-lg font-mono">unofficial party</span>
                <span className="text-xs px-2.5 py-1 bg-gray-100 rounded-lg font-mono">off-campus alcohol</span>
                <span className="text-xs px-2.5 py-1 bg-gray-100 rounded-lg font-mono">unauthorized vendor</span>
              </div>
            </div>

            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="font-black text-base text-[#171717]">Campus Safety Protocols</h3>
              <p className="text-xs text-[#666666]">
                All large events exceeding 200 participants require campus security coordination endorsement.
              </p>
              <button
                onClick={() => setThresholdModalOpen(true)}
                className="px-4 py-2 bg-[#ff6b35] text-white text-xs font-bold rounded-xl hover:bg-[#e0531f] transition-colors cursor-pointer"
              >
                Configure Thresholds
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
                              <span>"{verState.expediteNote}"</span>
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
                High-level engagement, growth trajectory, category distribution, and moderation response trends.
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 flex items-center gap-1.5 self-start sm:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time Campus Telemetry
            </span>
          </div>

          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Monthly Active Users</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">1,420</p>
              <p className="text-xs text-emerald-600 font-bold mt-2">↑ 28% from last month</p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Total RSVP Reservations</span>
              <p className="text-3xl sm:text-4xl font-black text-[#ff6b35]">3,840</p>
              <p className="text-xs text-[#666666] font-medium mt-2">89% verified check-in rate</p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Verified Organizations</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">41</p>
              <p className="text-xs text-emerald-600 font-bold mt-2">5 under review</p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Avg Resolution Time</span>
              <p className="text-3xl sm:text-4xl font-black text-emerald-600">1.1 hrs</p>
              <p className="text-xs text-[#666666] font-medium mt-2">Down from 4.2 hrs</p>
            </div>
          </div>

          {/* Chart Grid 1: Dual-Bar Growth Chart (Users vs Events) */}
          <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base sm:text-lg font-black text-[#171717]">Monthly Growth: User Signups vs Event Listings</h3>
                <p className="text-xs text-[#666666]">Comparison of student adoption volume and event creation velocity</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-[#171717]" />
                  <span>New Users</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-[#ff6b35]" />
                  <span>Events Created</span>
                </div>
              </div>
            </div>

            {/* Dual Bar Chart */}
            <div className="pt-6 pb-2">
              <div className="h-48 flex items-end justify-between gap-2 sm:gap-6 px-4 border-b border-[#e6e1d8]">
                {[
                  { m: "May", users: 140, evts: 34, uh: 35, eh: 24 },
                  { m: "Jun", users: 210, evts: 58, uh: 52, eh: 41 },
                  { m: "Jul", users: 260, evts: 65, uh: 65, eh: 46 },
                  { m: "Aug", users: 190, evts: 45, uh: 47, eh: 32 },
                  { m: "Sep", users: 340, evts: 92, uh: 85, eh: 65 },
                  { m: "Oct", users: 400, evts: 118, uh: 100, eh: 84 },
                  { m: "Nov", users: 280, evts: 72, uh: 70, eh: 51 },
                ].map((item) => (
                  <div key={item.m} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end cursor-pointer">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black text-[#171717] bg-white border px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap mb-1">
                      {item.users} users • {item.evts} evts
                    </div>
                    <div className="flex items-end gap-1 sm:gap-1.5 w-full justify-center">
                      <div
                        style={{ height: `${item.uh}%` }}
                        className="w-3 sm:w-5 bg-[#171717] rounded-t-md group-hover:brightness-125 transition-all"
                      />
                      <div
                        style={{ height: `${item.eh}%` }}
                        className="w-3 sm:w-5 bg-[#ff6b35] rounded-t-md group-hover:brightness-110 transition-all"
                      />
                    </div>
                    <span className="text-xs font-bold text-[#666666] group-hover:text-[#171717]">
                      {item.m}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-[#888888] pt-2 px-2 font-medium">
                <span>Start of Summer Term (May)</span>
                <span className="text-[#ff6b35] font-bold">Fall Semester Peak: October (+400 signups)</span>
                <span>November 2025</span>
              </div>
            </div>
          </div>

          {/* Chart Grid 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-black text-[#171717]">Campus Category Popularity</h3>
                <p className="text-xs text-[#666666]">Distribution of active listings across event genres</p>
              </div>
              <div className="space-y-3 pt-2">
                <div className="h-4 w-full flex rounded-full overflow-hidden shadow-inner">
                  <div style={{ width: "34%" }} className="bg-[#ff6b35]" title="Concerts (34%)" />
                  <div style={{ width: "26%" }} className="bg-indigo-600" title="Workshops (26%)" />
                  <div style={{ width: "22%" }} className="bg-emerald-500" title="School Events (22%)" />
                  <div style={{ width: "18%" }} className="bg-amber-500" title="Night Markets (18%)" />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ff6b35]" />
                      <span className="text-xs font-bold text-[#171717]">Concerts & Gigs</span>
                    </div>
                    <span className="text-lg font-black text-[#171717] mt-1 block">34% (16 evts)</span>
                  </div>
                  <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      <span className="text-xs font-bold text-[#171717]">Workshops & Tech</span>
                    </div>
                    <span className="text-lg font-black text-[#171717] mt-1 block">26% (12 evts)</span>
                  </div>
                  <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-[#171717]">School & Campus</span>
                    </div>
                    <span className="text-lg font-black text-[#171717] mt-1 block">22% (11 evts)</span>
                  </div>
                  <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-xs font-bold text-[#171717]">Night Markets</span>
                    </div>
                    <span className="text-lg font-black text-[#171717] mt-1 block">18% (9 evts)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-black text-[#171717]">Top Active Campus Venues</h3>
                <p className="text-xs text-[#666666]">Locations hosting the highest concentration of student gatherings</p>
              </div>
              <div className="space-y-3.5 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#171717]">1. Metro Amphitheater & Arts Hall</span>
                    <span className="text-[#ff6b35]">18 Events • 1,240 RSVPs</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: "85%" }} className="h-full bg-[#ff6b35] rounded-full" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#171717]">2. Campus Quadrangle & Central Plaza</span>
                    <span className="text-[#171717]">14 Events • 980 RSVPs</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: "68%" }} className="h-full bg-[#171717] rounded-full" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#171717]">3. Innovation & Engineering Hub</span>
                    <span className="text-[#171717]">10 Events • 740 RSVPs</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: "52%" }} className="h-full bg-emerald-500 rounded-full" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#171717]">4. Student Activity Center Pavilion</span>
                    <span className="text-[#171717]">6 Events • 410 RSVPs</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: "35%" }} className="h-full bg-purple-500 rounded-full" />
                  </div>
                </div>
              </div>
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
              <div>
                <h3 className="text-lg font-black text-[#171717]">Manage Account</h3>
                <p className="text-xs text-[#666666] font-mono">{selectedUser.email}</p>
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
                  onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value as any })}
                  className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-sm font-bold bg-white focus:outline-none focus:border-[#ff6b35]"
                >
                  <option value="Student">Student (Standard Attendee)</option>
                  <option value="Organizer">Organizer (Event Creator)</option>
                  <option value="SuperAdmin">SuperAdmin (Full Control)</option>
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
            </div>

            <div className="pt-3 border-t border-[#e6e1d8] flex justify-end gap-2">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveUser(selectedUser)}
                className="px-5 py-2 bg-[#171717] hover:bg-[#ff6b35] text-white rounded-xl text-xs font-black shadow-md transition-colors"
              >
                Save Changes
              </button>
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
                  {(["Active", "Draft", "Past", "Flagged"] as const).map((st) => (
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
                {selectedReport.details && <p className="text-[#555555] pt-1">Note: "{selectedReport.details}"</p>}
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
                    "{verState.expediteNote || "Organizer requested priority accreditation."}"
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#ff6b35]" />
                <h3 className="text-lg font-black text-[#171717]">Campus Safety Thresholds</h3>
              </div>
              <button onClick={() => setThresholdModalOpen(false)} className="text-[#888888] font-bold">✕</button>
            </div>
            <div className="space-y-3 text-xs font-bold text-[#444444]">
              <div>
                <label className="block mb-1">Large Gathering Security Trigger (Attendees)</label>
                <input type="number" defaultValue={200} className="w-full border border-[#e6e1d8] rounded-xl px-3 py-2" />
              </div>
              <div>
                <label className="block mb-1">Automatic Content Intercept Sensitivity</label>
                <select className="w-full border border-[#e6e1d8] rounded-xl px-3 py-2 bg-white">
                  <option>Strict (Campus Policy Grade A)</option>
                  <option>Balanced (Standard University)</option>
                </select>
              </div>
            </div>
            <div className="pt-3 flex justify-end gap-2">
              <button onClick={() => setThresholdModalOpen(false)} className="px-4 py-2 border rounded-xl text-xs font-bold">Cancel</button>
              <button
                onClick={() => {
                  setThresholdModalOpen(false);
                  showNotice("Safety policy threshold settings saved.");
                }}
                className="px-5 py-2 bg-[#ff6b35] text-white rounded-xl text-xs font-bold hover:bg-[#e0531f]"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
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
