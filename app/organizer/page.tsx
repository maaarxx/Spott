"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Users,
  Eye,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Edit3,
  PlusCircle,
  ArrowUpRight,
  Sparkles,
  Search,
  Filter,
  BarChart3,
  ShieldCheck,
  Check,
  FileText,
  UploadCloud,
  Layers,
  MapPin,
  Calendar,
  DollarSign,
  Copy,
  Trash2,
  Share2,
  MoreVertical,
  Activity,
  PieChart,
  ArrowUp,
  SlidersHorizontal,
  X,
  Zap,
  Archive,
  History,
  RotateCcw,
} from "lucide-react";
import { useEffect } from "react";
import {
  getVerificationState,
  defaultVerificationState,
  setExpeditedRequest,
  addVerificationDocument,
  setApprovalStatus,
  getRealTimeDate,
  get30DaysExpiryDate,
  VerificationState,
  VerificationDocument,
} from "@/lib/verification-store";
import PdfViewerModal from "@/components/PdfViewerModal";
import { addNotification, removeNotificationsForEvent } from "@/lib/notifications-store";
import { getStoredEvents, saveStoredEvent, deleteStoredEvent } from "@/lib/events-store";

const currentYear = new Date().getFullYear();

export interface OrganizerEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  rsvps: number;
  capacity: number;
  views: number;
  status: "Active" | "Draft" | "Past";
  location: string;
  category: string;
  price: number;
}

const initialEvents: OrganizerEvent[] = [];

// Daily RSVP data for Organizer Analytics Chart
const emptyWeeklyRsvpData = [
  { day: "Mon", count: 0, height: 4 },
  { day: "Tue", count: 0, height: 4 },
  { day: "Wed", count: 0, height: 4 },
  { day: "Thu", count: 0, height: 4 },
  { day: "Fri", count: 0, height: 4 },
  { day: "Sat", count: 0, height: 4 },
  { day: "Sun", count: 0, height: 4 },
];

const emptyHourlyTraffic = [
  { hour: "8 AM", val: 0 },
  { hour: "10 AM", val: 0 },
  { hour: "12 PM", val: 0 },
  { hour: "2 PM", val: 0 },
  { hour: "4 PM", val: 0 },
  { hour: "6 PM", val: 0 },
  { hour: "8 PM", val: 0 },
  { hour: "10 PM", val: 0 },
];

function OrganizerContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";

  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<{ day: string; count: number } | null>(null);
  const [alertNotice, setAlertNotice] = useState<string | null>(null);

  // Verification & Document Store state (SSR-safe baseline)
  const [verState, setVerState] = useState<VerificationState>(defaultVerificationState);
  const [previewDocName, setPreviewDocName] = useState<string | null>(null);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDocTitle, setUploadDocTitle] = useState("");
  const [uploadDocType, setUploadDocType] = useState("University Co-Curricular Charter");
  const [isUploading, setIsUploading] = useState(false);

  // Expedite modal state
  const [expediteModalOpen, setExpediteModalOpen] = useState(false);
  const [expediteReason, setExpediteReason] = useState(
    "Priority verification request for upcoming campus event season."
  );

  const syncEvents = () => {
    const stored = getStoredEvents();
    const mapped: OrganizerEvent[] = stored.map((e) => {
      let timeStr = "TBA";
      let dateStr = e.date || "";
      if (e.date && e.date.includes(" ")) {
        const parts = e.date.split(" ");
        dateStr = parts[0];
        timeStr = parts.slice(1).join(" ");
      } else if (e.date && e.date.includes("T")) {
        const parts = e.date.split("T");
        dateStr = parts[0];
        timeStr = parts[1].slice(0, 5);
      }
      return {
        id: e.id,
        name: e.title,
        date: dateStr,
        time: timeStr,
        rsvps: e.registrations || 0,
        capacity: 100,
        views: 0,
        status: (e.status === "active" ? "Active" : e.status === "draft" ? "Draft" : "Active") as any,
        location: e.location || "Campus Venue",
        category: e.categories?.[0] || "School Events",
        price: e.price || 0,
      };
    });
    setEvents(mapped);
  };

  useEffect(() => {
    syncEvents();
    window.addEventListener("spott_events_updated", syncEvents);
    return () => window.removeEventListener("spott_events_updated", syncEvents);
  }, []);

  useEffect(() => {
    // Sync with client localStorage upon mount to prevent SSR hydration mismatch
    setVerState(getVerificationState());

    const handleUpdate = () => {
      setVerState(getVerificationState());
    };
    window.addEventListener("spott_verification_updated", handleUpdate);
    return () => window.removeEventListener("spott_verification_updated", handleUpdate);
  }, []);

  const showAlert = (msg: string) => {
    setAlertNotice(msg);
    setTimeout(() => setAlertNotice(null), 3500);
  };

  const handleConfirmExpedite = () => {
    const updated = setExpeditedRequest(expediteReason);
    setVerState(updated);
    setExpediteModalOpen(false);
    showAlert("⚡ Verification expedited! Priority review request sent to university administrators.");
  };

  const handleConfirmUpload = () => {
    if (!uploadDocTitle.trim()) {
      showAlert("Please enter a document title or upload a PDF file.");
      return;
    }
    setIsUploading(true);
    setTimeout(() => {
      const updated = addVerificationDocument(uploadDocTitle, uploadDocType);
      setVerState(updated);
      setIsUploading(false);
      setUploadModalOpen(false);
      setUploadDocTitle("");
      showAlert(`✓ Uploaded "${uploadDocTitle}.pdf" successfully to your accreditation files.`);
    }, 600);
  };

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || e.status === statusFilter;
    const matchesCategory = categoryFilter === "All" || e.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const totalEvents = events.length;
  const totalRSVPs = events.reduce((acc, curr) => acc + curr.rsvps, 0);
  const totalViews = events.reduce((acc, curr) => acc + curr.views, 0);
  const regRate = Math.round((totalRSVPs / Math.max(totalViews, 1)) * 100);

  const activeCount = events.filter((e) => e.status === "Active").length;
  const draftCount = events.filter((e) => e.status === "Draft").length;
  const pastCount = events.filter((e) => e.status === "Past").length;

  const handleDuplicate = (evt: OrganizerEvent) => {
    const dup: OrganizerEvent = {
      ...evt,
      id: `event-${Date.now()}`,
      name: `${evt.name} (Copy)`,
      status: "Draft",
      rsvps: 0,
      views: 0,
    };
    saveStoredEvent({
      id: dup.id,
      title: dup.name,
      description: `Duplicate of ${evt.name}`,
      date: `${dup.date} ${dup.time}`,
      price: dup.price,
      status: "draft",
      organizer: "Metro Creative Group",
      verified: true,
      location: dup.location,
      city: "Manila",
      categories: [dup.category],
      registrations: 0,
      confirmedAt: null,
    });
    setEvents([dup, ...events]);
    showAlert(`Duplicated "${evt.name}" as new draft.`);
  };

  const handleDelete = (id: string, name: string) => {
    deleteStoredEvent(id);
    removeNotificationsForEvent(id, name);
    setEvents(events.filter((e) => e.id !== id));
    showAlert(`Deleted "${name}".`);
  };

  // Edit Event state
  const [editingEvent, setEditingEvent] = useState<OrganizerEvent | null>(null);

  const handleSaveEventEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    saveStoredEvent({
      id: editingEvent.id,
      title: editingEvent.name,
      description: `Updated event: ${editingEvent.name}`,
      date: `${editingEvent.date} ${editingEvent.time}`,
      price: editingEvent.price,
      status: editingEvent.status.toLowerCase(),
      organizer: "Metro Creative Group",
      verified: true,
      location: editingEvent.location,
      city: "Manila",
      categories: [editingEvent.category],
      registrations: editingEvent.rsvps,
      confirmedAt: new Date().toISOString(),
    });
    setEvents(events.map((ev) => (ev.id === editingEvent.id ? editingEvent : ev)));
    showAlert(`✓ Updated event "${editingEvent.name}" successfully.`);
    addNotification({
      type: "update",
      title: `Event Schedule Updated: "${editingEvent.name}"`,
      message: `The organizer updated the details and schedule for "${editingEvent.name}" (${editingEvent.date} · ${editingEvent.location}).`,
      targetRole: "user",
      link: `/events/${editingEvent.id}`,
    });
    setEditingEvent(null);
  };

  const handleToggleStatus = (id: string) => {
    setEvents(
      events.map((e) => {
        if (e.id === id) {
          const newStatus = e.status === "Active" ? "Draft" : "Active";
          showAlert(`Event "${e.name}" is now ${newStatus}.`);
          addNotification({
            type: "update",
            title: `Event Status: "${e.name}" is now ${newStatus}`,
            message: `Metro Creative Group set "${e.name}" listing to ${newStatus}.`,
            targetRole: "user",
            link: "/",
          });
          return { ...e, status: newStatus };
        }
        return e;
      })
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Alert message */}
      {alertNotice && (
        <div className="p-3.5 bg-[#fff0e8] text-[#ff6b35] rounded-xl border border-[#ff6b35]/30 text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs">
          <span>{alertNotice}</span>
          <button onClick={() => setAlertNotice(null)} className="text-[#ff6b35] font-black">
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. OVERVIEW TAB: High Level Dashboard (Wireframe 1)                       */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <>
          {/* Welcome & Overview Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-black text-[#171717] tracking-tight">
                  Welcome back, Metro Creative Group
                </h1>
              </div>
              <p className="text-sm sm:text-base text-[#666666] font-medium">
                Manage your upcoming projects and view tracking metrics.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/organizer/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff6b35] text-white font-bold text-sm shadow-md hover:bg-[#e0531f] transition-all no-underline shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create Event</span>
              </Link>
            </div>
          </div>

          {/* 4 Metric Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs sm:text-sm font-bold text-[#666666] tracking-wide uppercase">
                  Total Events
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                  <CalendarDays className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-[#171717]">{totalEvents}</span>
                {activeCount > 0 && (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {activeCount} Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#888888] mt-2">
                {totalEvents === 0 ? "No events yet" : `${activeCount} active, ${draftCount} draft, ${pastCount} past`}
              </p>
            </div>

            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs sm:text-sm font-bold text-[#666666] tracking-wide uppercase">
                  Total RSVPs
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-[#171717]">{totalRSVPs}</span>
                {totalRSVPs > 0 && (
                  <span className="text-xs font-semibold text-[#ff6b35] bg-[#fff0e8] px-2 py-0.5 rounded-md">
                    Across {totalEvents} event{totalEvents !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#888888] mt-2">
                {totalRSVPs === 0 ? "No RSVPs yet" : `${totalRSVPs} total registrations`}
              </p>
            </div>

            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs sm:text-sm font-bold text-[#666666] tracking-wide uppercase">
                  Total Views
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                  <Eye className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-[#171717]">{totalViews}</span>
                {totalViews > 0 && (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Total views
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#888888] mt-2">
                {totalViews === 0 ? "No views tracked yet" : "Page impressions across listings"}
              </p>
            </div>

            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs sm:text-sm font-bold text-[#666666] tracking-wide uppercase">
                  Registrations
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-[#171717]">
                  {totalEvents > 0 ? `${regRate}%` : "0%"}
                </span>
                {totalEvents > 0 && (
                  <span className="text-xs font-semibold text-[#ff6b35] bg-[#fff0e8] px-2 py-0.5 rounded-md">
                    {regRate >= 50 ? "On track" : "Building up"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#888888] mt-2">
                {totalEvents === 0 ? "No events to measure" : "RSVP to view ratio"}
              </p>
            </div>
          </div>

          {/* Verification Status Banner */}
          <div
            className={`rounded-2xl p-5 sm:p-6 shadow-sm relative overflow-hidden border ${
              verState.status === "approved"
                ? "bg-gradient-to-r from-white via-white to-emerald-50/40 border-emerald-300"
                : verState.status === "rejected"
                ? "bg-gradient-to-r from-white via-white to-rose-50/40 border-rose-300"
                : "bg-gradient-to-r from-white via-white to-[#fff8f5] border-[#ff6b35]/30"
            }`}
          >
            <div
              className={`absolute top-0 left-0 w-1.5 h-full ${
                verState.status === "approved"
                  ? "bg-emerald-500"
                  : verState.status === "rejected"
                  ? "bg-rose-500"
                  : "bg-[#ff6b35]"
              }`}
            />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-3xl" suppressHydrationWarning>
                <div className="flex items-center gap-2.5 flex-wrap" suppressHydrationWarning>
                  <h3 className="text-base sm:text-lg font-black text-[#171717]" suppressHydrationWarning>
                    Verification Status:{" "}
                    {verState.status === "approved"
                      ? "Verified"
                      : verState.status === "rejected"
                      ? "Declined"
                      : verState.documents.length === 0
                      ? "Not Submitted"
                      : "Pending"}
                  </h3>

                  {verState.status === "approved" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-emerald-600 text-white shadow-xs">
                      <CheckCircle2 className="w-3 h-3" />
                      Verified Badge Active
                    </span>
                  ) : verState.status === "rejected" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-rose-600 text-white shadow-xs">
                      <X className="w-3 h-3" />
                      Application Declined
                    </span>
                  ) : verState.documents.length === 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-gray-100 text-[#666666] border border-[#e6e1d8]">
                      <Clock className="w-3 h-3" />
                      Not Submitted
                    </span>
                  ) : verState.isExpedited ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-amber-500 text-white shadow-xs animate-pulse">
                      <Zap className="w-3 h-3" />
                      Priority Expedited
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-[#fff0e8] text-[#ff6b35] border border-[#ff6b35]/30">
                      <Clock className="w-3 h-3" />
                      Under Review
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-[#555555] leading-relaxed">
                  {verState.status === "approved"
                    ? "Your student organization credentials have been verified by the university. The official checkmark badge is active across all your public event pages and listings."
                    : verState.status === "rejected"
                    ? `Application was declined. This record is preserved in the 30-day compliance archive until ${verState.expiresDate || get30DaysExpiryDate()} (30 days retention). You may re-apply with new or updated credentials.`
                    : verState.documents.length === 0
                    ? "No credentials submitted yet. Click 'Start Submission' to upload your organization documents and begin the verification process."
                    : verState.isExpedited
                    ? `Emergency review active (${verState.expeditedAt || "Today"}). University Student Affairs administrators have prioritized your submission under accelerated 4-12hr emergency turnaround.`
                    : "Your student organization credentials are currently under verification. Once approved by university administrators, a checkmark badge will appear on your public events pages to establish trust."}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {verState.status === "rejected" ? (
                  <button
                    onClick={() => {
                      const updated = setApprovalStatus("pending");
                      setVerState(updated);
                      setUploadModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#ff6b35] text-white text-xs font-bold hover:bg-[#e0531f] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-Apply / Submit Credentials</span>
                  </button>
                ) : verState.status === "approved" ? (
                  <button
                    onClick={() => setShowVerificationModal(true)}
                    className="px-4 py-2 rounded-xl bg-white border border-[#e6e1d8] text-xs font-bold text-[#171717] hover:border-emerald-500 hover:text-emerald-700 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>View Badge Details</span>
                  </button>
                ) : verState.documents.length === 0 ? (
                  /* Not yet submitted */
                  <button
                    onClick={() => setUploadModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-[#ff6b35] text-white text-xs font-bold hover:bg-[#e0531f] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Start Submission</span>
                  </button>
                ) : (
                  /* Has documents — actually pending review */
                  <>
                    <button
                      onClick={() => setShowVerificationModal(true)}
                      className="px-4 py-2 rounded-xl bg-white border border-[#e6e1d8] text-xs font-bold text-[#171717] hover:border-[#ff6b35] hover:text-[#ff6b35] transition-all cursor-pointer shadow-2xs"
                    >
                      View Requirements
                    </button>
                    {verState.isExpedited ? (
                      <span className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-default shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Expedite Active</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => setExpediteModalOpen(true)}
                        className="px-4 py-2 rounded-xl bg-[#171717] text-white text-xs font-bold hover:bg-[#ff6b35] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Zap className="w-3.5 h-3.5 text-[#ff6b35]" />
                        <span>Expedite Review</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Recent Events Preview Table */}
          <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-[#e6e1d8] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-[#171717]">Recent Events Overview</h2>
                <p className="text-xs text-[#666666] mt-0.5">Quick status preview of latest listings</p>
              </div>
              <Link
                href="/organizer?tab=events"
                className="text-xs font-bold text-[#ff6b35] hover:underline flex items-center gap-1"
              >
                <span>View Full Management</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase text-[#666666]">
                    <th className="py-3 px-6">Event Name</th>
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-6 text-center">RSVPs</th>
                    <th className="py-3 px-6 text-center">Views</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e1d8]">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-[#888888]">
                        No events published yet. Click &quot;Create New Event&quot; to publish your first campus event.
                      </td>
                    </tr>
                  ) : (
                    events.slice(0, 3).map((evt) => (
                      <tr key={evt.id} className="hover:bg-[#faf8f3]/60 transition-colors">
                        <td className="py-4 px-6 font-bold text-[#171717]">{evt.name}</td>
                        <td className="py-4 px-6 text-xs text-[#555555]">{evt.date}</td>
                        <td className="py-4 px-6 text-center font-bold">{evt.rsvps}</td>
                        <td className="py-4 px-6 text-center text-[#666666]">{evt.views}</td>
                        <td className="py-4 px-6">
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            evt.status === "Active" ? "bg-emerald-50 text-emerald-700" : evt.status === "Draft" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-700"
                          }`}>
                            {evt.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <Link href={`/organizer/rsvp?eventId=${evt.id}`} className="text-xs font-bold text-[#ff6b35] hover:underline mr-3">
                            RSVPs
                          </Link>
                          <button
                            type="button"
                            onClick={() => setEditingEvent(evt)}
                            className="text-xs font-bold text-[#171717] hover:text-[#ff6b35] cursor-pointer"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. MY EVENTS TAB: Dedicated Event Management & Publishing                 */}
      {/* ========================================================================= */}
      {activeTab === "events" && (
        <div className="space-y-6">
          {/* Header & Quick Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717] tracking-tight">
                My Events Management
              </h1>
              <p className="text-sm text-[#666666] mt-0.5">
                Full directory of your created campus events, ticket capacity, and live publishing controls.
              </p>
            </div>
            <Link
              href="/organizer/create"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff6b35] text-white font-bold text-sm shadow-md hover:bg-[#e0531f] transition-all no-underline shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create New Event</span>
            </Link>
          </div>

          {/* Quick Filter Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => setStatusFilter("All")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "All" ? "bg-[#171717] text-white border-[#171717] shadow-sm" : "bg-white border-[#e6e1d8] hover:border-[#ff6b35]"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${statusFilter === "All" ? "text-gray-300" : "text-[#888888]"}`}>All Listings</span>
              <span className="text-2xl font-black">{totalEvents}</span>
            </button>
            <button
              onClick={() => setStatusFilter("Active")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "Active" ? "bg-[#171717] text-white border-[#171717] shadow-sm" : "bg-white border-[#e6e1d8] hover:border-emerald-500"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${statusFilter === "Active" ? "text-emerald-400" : "text-emerald-600"}`}>Live / Active</span>
              <span className="text-2xl font-black text-emerald-500">{activeCount}</span>
            </button>
            <button
              onClick={() => setStatusFilter("Draft")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "Draft" ? "bg-[#171717] text-white border-[#171717] shadow-sm" : "bg-white border-[#e6e1d8] hover:border-amber-500"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${statusFilter === "Draft" ? "text-amber-400" : "text-amber-600"}`}>Drafts</span>
              <span className="text-2xl font-black text-amber-500">{draftCount}</span>
            </button>
            <button
              onClick={() => setStatusFilter("Past")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "Past" ? "bg-[#171717] text-white border-[#171717] shadow-sm" : "bg-white border-[#e6e1d8] hover:border-gray-500"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${statusFilter === "Past" ? "text-gray-300" : "text-gray-500"}`}>Archived / Past</span>
              <span className="text-2xl font-black">{pastCount}</span>
            </button>
          </div>

          {/* Search & Category Filter Toolbar */}
          <div className="bg-white border border-[#e6e1d8] rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search event title, venue, or address..."
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm font-medium border border-[#e6e1d8] rounded-xl focus:outline-none focus:border-[#ff6b35]"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3.5 py-2 text-xs font-bold border border-[#e6e1d8] rounded-xl bg-white text-[#171717] focus:outline-none focus:border-[#ff6b35] cursor-pointer"
              >
                <option value="All">All Categories</option>
                <option value="Concerts">Concerts</option>
                <option value="Workshops">Workshops</option>
                <option value="School Events">School Events</option>
                <option value="Night Markets">Night Markets</option>
              </select>
            </div>
          </div>

          {/* Detailed Event Cards List */}
          <div className="space-y-4">
            {filteredEvents.length === 0 ? (
              <div className="bg-white border border-[#e6e1d8] rounded-2xl p-12 text-center text-[#888888] text-sm">
                No events found matching your search and filter criteria.
              </div>
            ) : (
              filteredEvents.map((evt) => {
                const fillPercent = Math.round((evt.rsvps / Math.max(evt.capacity, 1)) * 100);
                return (
                  <div
                    key={evt.id}
                    className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm hover:border-[#ff6b35]/60 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                  >
                    {/* Left Info */}
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                            evt.status === "Active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : evt.status === "Draft"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-gray-100 text-gray-700 border border-gray-200"
                          }`}
                        >
                          {evt.status}
                        </span>
                        <span className="text-xs font-bold text-[#ff6b35] bg-[#fff0e8] px-2.5 py-0.5 rounded-full border border-[#ff6b35]/20">
                          {evt.category}
                        </span>
                        <span className="text-xs font-bold text-[#666666]">
                          {evt.price === 0 ? "Free Event" : `₱${evt.price}`}
                        </span>
                      </div>

                      <h3 className="text-xl font-black text-[#171717]">{evt.name}</h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-[#666666]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#ff6b35]" />
                          <span>{evt.date} • {evt.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#ff6b35]" />
                          <span>{evt.location}</span>
                        </div>
                      </div>

                      {/* Capacity Progress Bar */}
                      <div className="space-y-1 max-w-md pt-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-[#171717]">{evt.rsvps} of {evt.capacity} RSVPs filled</span>
                          <span className="text-[#ff6b35]">{fillPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.min(fillPercent, 100)}%` }}
                            className="h-full bg-[#ff6b35] rounded-full transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right Actions */}
                    <div className="flex flex-wrap lg:flex-col items-end gap-2 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-[#e6e1d8]">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/organizer/rsvp?eventId=${evt.id}`}
                          className="px-4 py-2 bg-[#ff6b35] text-white text-xs font-bold rounded-xl hover:bg-[#e0531f] transition-all no-underline shadow-xs flex items-center gap-1.5"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Manage RSVPs ({evt.rsvps})</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditingEvent(evt)}
                          className="px-4 py-2 bg-white border border-[#e6e1d8] text-[#171717] text-xs font-bold rounded-xl hover:border-[#ff6b35] hover:text-[#ff6b35] transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStatus(evt.id)}
                          className="px-3 py-1.5 text-xs font-bold text-[#666666] hover:text-[#171717] border border-[#e6e1d8] rounded-lg bg-[#faf8f3] cursor-pointer"
                        >
                          {evt.status === "Active" ? "Unpublish to Draft" : "Publish Live"}
                        </button>
                        <button
                          onClick={() => handleDuplicate(evt)}
                          className="p-1.5 text-[#666666] hover:text-[#ff6b35] rounded-lg hover:bg-gray-100 cursor-pointer"
                          title="Duplicate Event"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(evt.id, evt.name)}
                          className="p-1.5 text-rose-600 hover:text-rose-700 rounded-lg hover:bg-rose-50 cursor-pointer"
                          title="Delete Event"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ANALYTICS TAB: Rich Visual Charts & Metrics                            */}
      {/* ========================================================================= */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Organizer Analytics & Insights</h1>
              <p className="text-sm text-[#666666] mt-0.5">
                Audience reach, conversion funnel, RSVP velocity, and attendee engagement trends.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1.5 bg-[#fff0e8] text-[#ff6b35] rounded-xl border border-[#ff6b35]/30">
                Live Data • Updated 5m ago
              </span>
            </div>
          </div>

          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Conversion Rate</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">
                {totalViews > 0 ? `${((totalRSVPs / totalViews) * 100).toFixed(1)}%` : "0.0%"}
              </p>
              <p className="text-xs text-[#666666] font-bold mt-2 flex items-center gap-1">
                {totalRSVPs > 0 ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <ArrowUp className="w-3.5 h-3.5" /> Live conversion rate
                  </span>
                ) : (
                  "No registration traffic yet"
                )}
              </p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Avg RSVPs / Event</span>
              <p className="text-3xl sm:text-4xl font-black text-[#ff6b35]">
                {totalEvents > 0 ? (totalRSVPs / totalEvents).toFixed(1) : "0"}
              </p>
              <p className="text-xs text-[#666666] font-medium mt-2">Target: 50 RSVPs</p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Repeat Attendees</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">
                {totalRSVPs > 0 ? "35%" : "0%"}
              </p>
              <p className="text-xs text-[#666666] font-medium mt-2">
                {totalRSVPs > 0 ? "High student brand loyalty" : "No attendance history yet"}
              </p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Total Page Impressions</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">{totalViews}</p>
              <p className="text-xs text-[#666666] font-medium mt-2">Across campus feeds</p>
            </div>
          </div>

          {/* Chart Grid 1: Weekly RSVP Velocity & Status Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Weekly RSVP Velocity (Bar Chart) */}
            <div className="lg:col-span-2 bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-black text-[#171717]">Weekly RSVP Velocity</h3>
                  <p className="text-xs text-[#666666]">Registrations received per day over the past 7 days</p>
                </div>
                {hoveredDay && (
                  <span className="text-xs font-black text-[#ff6b35] bg-[#fff0e8] px-2.5 py-1 rounded-lg">
                    {hoveredDay.day}: {hoveredDay.count} signups
                  </span>
                )}
              </div>

              {/* Bar visualization */}
              <div className="pt-6 pb-2">
                <div className="h-44 flex items-end justify-between gap-4 px-2 border-b border-[#e6e1d8]">
                  {(totalRSVPs > 0
                    ? [
                        { day: "Mon", count: Math.round(totalRSVPs * 0.1), height: 35 },
                        { day: "Tue", count: Math.round(totalRSVPs * 0.15), height: 55 },
                        { day: "Wed", count: Math.round(totalRSVPs * 0.12), height: 45 },
                        { day: "Thu", count: Math.round(totalRSVPs * 0.2), height: 75 },
                        { day: "Fri", count: Math.round(totalRSVPs * 0.25), height: 100 },
                        { day: "Sat", count: Math.round(totalRSVPs * 0.1), height: 40 },
                        { day: "Sun", count: Math.round(totalRSVPs * 0.08), height: 30 },
                      ]
                    : emptyWeeklyRsvpData
                  ).map((d) => (
                    <div
                      key={d.day}
                      className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end cursor-pointer group"
                      onMouseEnter={() => setHoveredDay(d)}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black text-[#171717] bg-white border px-1.5 py-0.5 rounded shadow-xs mb-1">
                        {d.count}
                      </div>
                      <div
                        style={{ height: `${d.height}%` }}
                        className={`w-full max-w-[40px] rounded-t-xl transition-all duration-300 ${
                          d.count > 0 && d.height === 100
                            ? "bg-gradient-to-t from-[#ff6b35] to-[#ff8c42] shadow-sm"
                            : "bg-[#e8e4dc] group-hover:bg-[#ff6b35]/70"
                        }`}
                      />
                      <span className="text-xs font-bold text-[#666666] group-hover:text-[#ff6b35] mt-1">
                        {d.day}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-[#888888] font-medium pt-2 px-1">
                  <span>Monday</span>
                  <span className="font-bold text-[#ff6b35]">
                    {totalRSVPs > 0 ? "Peak Day: Friday" : "No peak signups yet"}
                  </span>
                  <span>Sunday</span>
                </div>
              </div>
            </div>

            {/* Chart 2: RSVP Status Breakdown Donut/Segments */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-base font-black text-[#171717]">RSVP Status Distribution</h3>
                <p className="text-xs text-[#666666]">
                  Current breakdown of all {totalRSVPs} participant replies
                </p>
              </div>

              {/* Segmented bar visual */}
              <div className="py-6 space-y-4">
                {totalRSVPs === 0 ? (
                  <div className="h-5 w-full bg-gray-100 rounded-full" />
                ) : (
                  <div className="h-5 w-full flex rounded-full overflow-hidden shadow-inner">
                    <div style={{ width: "70%" }} className="bg-emerald-500" title="Confirmed: 70%" />
                    <div style={{ width: "20%" }} className="bg-[#ff6b35]" title="Pending: 20%" />
                    <div style={{ width: "10%" }} className="bg-rose-500" title="Declined: 10%" />
                  </div>
                )}

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span>Confirmed Guests</span>
                    </div>
                    <span className="text-[#171717]">
                      {totalRSVPs > 0 ? `${Math.round(totalRSVPs * 0.7)} (70%)` : "0 (0%)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#ff6b35]" />
                      <span>Pending Verification</span>
                    </div>
                    <span className="text-[#171717]">
                      {totalRSVPs > 0 ? `${Math.round(totalRSVPs * 0.2)} (20%)` : "0 (0%)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-rose-500" />
                      <span>Declined / Cancelled</span>
                    </div>
                    <span className="text-[#171717]">
                      {totalRSVPs > 0 ? `${Math.round(totalRSVPs * 0.1)} (10%)` : "0 (0%)"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8] text-xs text-[#555555]">
                ⚡ <strong>Tip:</strong> Sending a reminder 24h before increases check-in rates by +18%.
              </div>
            </div>
          </div>

          {/* Chart Grid 2: Peak Sign-Up Hours & Discovery Channels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Peak Hours Chart */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-black text-[#171717]">Peak RSVP Rush Hours</h3>
                  <p className="text-xs text-[#666666]">When students register for your listings throughout the day</p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {(totalRSVPs > 0
                  ? [
                      { hour: "8 AM", val: Math.round(totalRSVPs * 0.08) },
                      { hour: "10 AM", val: Math.round(totalRSVPs * 0.18) },
                      { hour: "12 PM", val: Math.round(totalRSVPs * 0.45), peak: true },
                      { hour: "2 PM", val: Math.round(totalRSVPs * 0.28) },
                      { hour: "4 PM", val: Math.round(totalRSVPs * 0.22) },
                      { hour: "6 PM", val: Math.round(totalRSVPs * 0.38) },
                      { hour: "8 PM", val: Math.round(totalRSVPs * 0.5), peak: true },
                      { hour: "10 PM", val: Math.round(totalRSVPs * 0.15) },
                    ]
                  : emptyHourlyTraffic
                ).map((h) => (
                  <div key={h.hour} className="flex items-center gap-3 text-xs font-bold">
                    <span className="w-14 text-[#666666] shrink-0 text-right">{h.hour}</span>
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(h.val, 100)}%` }}
                        className={`h-full rounded-full ${
                          h.peak ? "bg-[#ff6b35]" : "bg-[#171717]/70"
                        }`}
                      />
                    </div>
                    <span className={`w-10 text-right ${h.peak ? "text-[#ff6b35] font-black" : "text-[#666666]"}`}>
                      {h.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Discovery Source Breakdown */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-black text-[#171717]">Discovery Channels</h3>
                <p className="text-xs text-[#666666]">Where attendees are discovering your event links</p>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#171717]">Interactive Campus Map</span>
                    <span className="text-[#ff6b35]">{totalViews > 0 ? "48%" : "0%"} ({Math.round(totalViews * 0.48)} views)</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: totalViews > 0 ? "48%" : "0%" }} className="h-full bg-[#ff6b35] rounded-full" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#171717]">Discover Feed Search</span>
                    <span className="text-[#171717]">{totalViews > 0 ? "28%" : "0%"} ({Math.round(totalViews * 0.28)} views)</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: totalViews > 0 ? "28%" : "0%" }} className="h-full bg-[#171717] rounded-full" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#171717]">Direct Link & Social Shares</span>
                    <span className="text-[#171717]">{totalViews > 0 ? "16%" : "0%"} ({Math.round(totalViews * 0.16)} views)</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: totalViews > 0 ? "16%" : "0%" }} className="h-full bg-emerald-500 rounded-full" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#171717]">In-App Push Notifications</span>
                    <span className="text-[#171717]">{totalViews > 0 ? "8%" : "0%"} ({Math.round(totalViews * 0.08)} views)</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div style={{ width: totalViews > 0 ? "8%" : "0%" }} className="h-full bg-[#ff6b35] rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. VERIFICATION TAB: Club Accreditation Details                           */}
      {/* ========================================================================= */}
      {activeTab === "verification" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Organization Verification</h1>
            <p className="text-sm text-[#666666] mt-1">
              Verify your student organization to gain the official Spott trust checkmark badge.
            </p>
          </div>

          <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
            {verState.status === "approved" ? (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-900">Current Status: Verified & Approved</p>
                  <p className="text-xs text-emerald-700">
                    Official accreditation granted. Verified badge is active on your public event pages.
                  </p>
                </div>
              </div>
            ) : verState.status === "rejected" ? (
              <div className="flex items-center justify-between p-4 bg-rose-50 rounded-xl border border-rose-200 gap-3">
                <div className="flex items-center gap-3">
                  <X className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-rose-900">Current Status: Application Declined</p>
                      <span className="text-[10px] font-black uppercase bg-rose-200 text-rose-800 px-2 py-0.5 rounded">
                        Archived (30 Days)
                      </span>
                    </div>
                    <p className="text-xs text-rose-700 mt-0.5">
                      Record preserved in compliance archive until {verState.expiresDate || get30DaysExpiryDate()} (30 days retention). You can submit additional credentials below to re-apply.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = setApprovalStatus("pending");
                    setVerState(updated);
                    setUploadModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 bg-[#ff6b35] hover:bg-[#e0531f] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Re-apply</span>
                </button>
              </div>
            ) : verState.documents.length === 0 ? (
              /* Not yet submitted — no ghost "Under Review" */
              <div className="flex items-center gap-3 p-4 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                <Clock className="w-5 h-5 text-[#aaaaaa] shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#555555]">Current Status: Not Submitted</p>
                  <p className="text-xs text-[#888888]">
                    No documents have been uploaded yet. Submit your organization credentials below to begin the verification process.
                  </p>
                </div>
              </div>
            ) : (
              /* Has documents — actually under review */
              <div className="flex items-center gap-3 p-4 bg-[#fff0e8] rounded-xl border border-[#ff6b35]/20">
                <Clock className="w-5 h-5 text-[#ff6b35] shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#171717]">Current Status: Under Review</p>
                  <p className="text-xs text-[#666666]">
                    Submitted on {verState.expeditedAt || getRealTimeDate()}. University SuperAdmins typically process credentials in 24-48 business hours.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-[#171717]">Document Checklist</h3>
                <span className="text-xs font-bold text-[#666666]">{verState.documents.length} Files Attached</span>
              </div>
              <div className="space-y-3">
                {verState.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-[#171717]">{doc.type}</p>
                        <p className="text-xs text-[#666666] font-mono">{doc.name} • {doc.size || "1.2 MB"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md">
                        Uploaded
                      </span>
                      <button
                        onClick={() => setPreviewDocName(doc.name)}
                        className="px-3 py-1 bg-white border border-[#e6e1d8] hover:border-[#ff6b35] hover:text-[#ff6b35] rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#ff6b35]" />
                        <span>View PDF</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Upload New Document Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-[#e6e1d8] bg-[#faf8f3] gap-3">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-[#888888] shrink-0" />
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-[#171717]">Additional Campus Chapter Credentials (Optional)</p>
                      <p className="text-xs text-[#888888]">Attach awards, co-curricular charters, or sanitation & fire clearances</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setUploadModalOpen(true)}
                    className="px-4 py-2 rounded-xl border border-[#ff6b35] bg-[#fff0e8] hover:bg-[#ff6b35] hover:text-white text-xs font-bold text-[#ff6b35] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs self-start sm:self-auto shrink-0"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload PDF</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verification Requirements Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#ff6b35]" />
                <h3 className="text-lg font-black text-[#171717]">Organizer Verification Details</h3>
              </div>
              <button
                onClick={() => setShowVerificationModal(false)}
                className="text-[#888888] hover:text-[#171717] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm text-[#444444]">
              <p>
                Spott requires recognized student organizations and verified creators to confirm credentials. This ensures high trust and gives your events top placement.
              </p>
              <div className="p-3 bg-[#fff0e8] rounded-xl border border-[#ff6b35]/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff6b35]">
                  <Check className="w-4 h-4" /> Official University Registration Certificate
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff6b35]">
                  <Check className="w-4 h-4" /> Faculty Adviser Endorsement Letter
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff6b35]">
                  <Check className="w-4 h-4" /> Active Campus Chapter ID
                </div>
              </div>
              <p className="text-xs text-[#666666]">
                Average approval turnaround: <strong>24-48 business hours</strong>. You will receive an in-app notification once verified.
              </p>
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowVerificationModal(false)}
                className="px-5 py-2 rounded-xl bg-[#171717] text-white text-xs font-bold hover:bg-[#ff6b35] transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expedite Verification Modal */}
      {expediteModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Zap className="w-5 h-5 fill-amber-500 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#171717]">Expedite Verification</h3>
                  <p className="text-xs text-[#666666]">Priority SuperAdmin queue routing</p>
                </div>
              </div>
              <button
                onClick={() => setExpediteModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#888888] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 text-amber-900 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-xs text-amber-800">
                  <Clock className="w-4 h-4" />
                  <span>Accelerated Turnaround: 4–12 Business Hours</span>
                </div>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Submitting an expedite request moves your organization credentials to the top of the University Student Affairs review queue with an urgent priority tag.
                </p>
              </div>

              <div>
                <label className="block font-bold text-[#171717] mb-1.5">
                  Reason for Priority Expedite <span className="text-[#ff6b35]">*</span>
                </label>
                <textarea
                  rows={3}
                  value={expediteReason}
                  onChange={(e) => setExpediteReason(e.target.value)}
                  placeholder="e.g. Launching ticket registration for annual campus festival within 24 hours..."
                  className="w-full border border-[#e6e1d8] rounded-xl p-3 text-xs focus:outline-none focus:border-[#ff6b35] text-[#171717] resize-none"
                />
                <p className="text-[10px] text-[#888888] mt-1">
                  Provide brief context so university administrators can validate urgency.
                </p>
              </div>

              <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8] space-y-1 text-[#555555]">
                <div className="flex justify-between">
                  <span className="font-bold">Applicant:</span>
                  <span className="font-black text-[#171717]">Metro Creative Group</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Attached Credentials:</span>
                  <span className="font-black text-[#ff6b35]">{verState.documents.length} PDF Documents</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#e6e1d8] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setExpediteModalOpen(false)}
                className="px-4 py-2.5 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExpedite}
                className="px-5 py-2.5 bg-gradient-to-r from-[#ff6b35] to-[#ff8c42] hover:from-[#e0531f] hover:to-[#ff6b35] text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                <span>Submit Expedite Request</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload PDF Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#171717]">Upload Document</h3>
                  <p className="text-xs text-[#666666]">Attach university accreditation or chapter credentials</p>
                </div>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#888888] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#171717] mb-1.5">
                  Credential Type
                </label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#ff6b35] text-[#171717]"
                >
                  <option value="Campus Chapter Credential">Campus Chapter Credential</option>
                  <option value="University Accreditation Certificate">University Accreditation Certificate</option>
                  <option value="Faculty Adviser Endorsement Letter">Faculty Adviser Endorsement Letter</option>
                  <option value="Sanitation & Venue Safety Clearance">Sanitation & Venue Safety Clearance</option>
                  <option value="Student Council Recognition Certificate">Student Council Recognition Certificate</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#171717] mb-1.5">
                  Document Filename / Title <span className="text-[#ff6b35]">*</span>
                </label>
                <input
                  type="text"
                  value={uploadDocTitle}
                  onChange={(e) => setUploadDocTitle(e.target.value)}
                  placeholder="e.g. Metro_Creative_Chapter_Charter_2025"
                  className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#ff6b35] text-[#171717] font-mono"
                />
                <p className="text-[10px] text-[#888888] mt-1">
                  Format: .pdf documents under 15MB recommended.
                </p>
              </div>

              {/* Drag and Drop Box */}
              <label className="border-2 border-dashed border-[#e6e1d8] hover:border-[#ff6b35] bg-[#faf8f3] rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors block">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadDocTitle(file.name.replace(/\.[^/.]+$/, ""));
                    }
                  }}
                />
                <FileText className="w-8 h-8 text-[#ff6b35] mb-2" />
                <p className="text-xs font-black text-[#171717]">
                  {uploadDocTitle ? `${uploadDocTitle}.pdf selected` : "Click to select or drop PDF file"}
                </p>
                <p className="text-[10px] text-[#888888] mt-0.5">
                  Supports Adobe Acrobat PDF, scanned certificates with official seals
                </p>
              </label>

              {isUploading && (
                <div className="p-3 bg-[#fff0e8] rounded-xl border border-[#ff6b35]/30 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-[#ff6b35]">
                    Encrypting and uploading credentials to campus registry...
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#e6e1d8] flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2.5 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={handleConfirmUpload}
                className="px-5 py-2.5 bg-[#ff6b35] hover:bg-[#e0531f] text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{isUploading ? "Uploading..." : "Upload Credential"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#e6e1d8] space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#e6e1d8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#171717]">Edit Event Details</h3>
                  <p className="text-xs text-[#666666]">Updates are pushed to attendees and user notifications</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-[#555] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEventEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#171717] mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={editingEvent.name}
                  onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Event Date</label>
                  <input
                    type="text"
                    required
                    value={editingEvent.date}
                    onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Time</label>
                  <input
                    type="text"
                    required
                    value={editingEvent.time}
                    onChange={(e) => setEditingEvent({ ...editingEvent, time: e.target.value })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#171717] mb-1">Location / Venue</label>
                <input
                  type="text"
                  required
                  value={editingEvent.location}
                  onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Category</label>
                  <select
                    value={editingEvent.category}
                    onChange={(e) => setEditingEvent({ ...editingEvent, category: e.target.value })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35] bg-white"
                  >
                    <option value="Music">Music</option>
                    <option value="Arts & Culture">Arts & Culture</option>
                    <option value="Tech & Design">Tech & Design</option>
                    <option value="Night Markets">Night Markets</option>
                    <option value="School Events">School Events</option>
                    <option value="Community">Community</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Status</label>
                  <select
                    value={editingEvent.status}
                    onChange={(e) => setEditingEvent({ ...editingEvent, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35] bg-white"
                  >
                    <option value="Active">Active (Live)</option>
                    <option value="Draft">Draft</option>
                    <option value="Past">Past</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[#e6e1d8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-4 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#ff6b35] hover:bg-[#e0531f] text-white rounded-xl text-xs font-black shadow-md cursor-pointer transition-all"
                >
                  Save & Notify Attendees
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {previewDocName && (
        <PdfViewerModal
          documentName={previewDocName}
          organizerName="Metro Creative Group"
          onClose={() => setPreviewDocName(null)}
        />
      )}
    </div>
  );
}

export default function OrganizerDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-gray-500">Loading Dashboard...</div>}>
      <OrganizerContent />
    </Suspense>
  );
}
