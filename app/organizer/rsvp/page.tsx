"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Download,
  Search,
  Filter,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  ChevronDown,
  ArrowUpDown,
  MoreVertical,
  Check,
  UserCheck,
  FileSpreadsheet,
} from "lucide-react";
import { subscribeToEvents } from "@/lib/events-store";
import { getCurrentUser } from "@/lib/auth-store";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";

interface Attendee {
  id: string;
  name: string;
  email: string;
  status: "Confirmed" | "Pending" | "Declined";
  dateRegistered: string;
  ticketType?: string;
  phone?: string;
  notes?: string;
  checkedIn?: boolean;
  attendeesCount?: number;
  paymentStatus?: string;
  amount?: number;
  reference?: string;
  proofUrl?: string | null;
}

function RsvpManagementContent() {
  const searchParams = useSearchParams();
  const urlEventId = searchParams.get("eventId");

  const [availableEvents, setAvailableEvents] = useState<{ id: string; title: string; capacity?: number | null; requireApproval?: boolean | null }[]>([]);
  const [selectedEventKey, setSelectedEventKey] = useState<string>("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [proofToView, setProofToView] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      const response = await fetchWithSupabaseSession('/api/events?scope=organizer');
      if (!active) return;
      if (!response.ok) {
        setAvailableEvents([]);
        setSelectedEventKey("");
        setAttendees([]);
        return;
      }
      const data = await response.json().catch(() => []);
      const list = Array.isArray(data) ? data.map((event) => ({
        id: event.id,
        title: event.title,
        capacity: event.capacity,
        requireApproval: event.requireApproval,
      })) : [];
      setAvailableEvents(list);
      const nextSelectedEventKey = urlEventId && list.some((e) => e.id === urlEventId)
        ? urlEventId
        : list.some((e) => e.id === selectedEventKey) ? selectedEventKey : list[0]?.id || "";
      setSelectedEventKey(nextSelectedEventKey);
      await loadAttendeesForEvent(nextSelectedEventKey);
    };
    void loadEvents().catch(() => { if (active) { setAvailableEvents([]); setAttendees([]); } });
    const unsubscribeEvents = subscribeToEvents(() => { void loadEvents(); });
    window.addEventListener("spott_auth_changed", loadEvents);
    return () => {
      active = false;
      unsubscribeEvents();
      window.removeEventListener("spott_auth_changed", loadEvents);
    };
  }, [urlEventId, selectedEventKey]);

  async function loadAttendeesForEvent(eventKey: string) {
    if (!eventKey) {
      setAttendees([]);
      return;
    }
    setAttendees([]);
    try {
      const response = await fetchWithSupabaseSession(`/api/organizer/events/${eventKey}/attendees`);
      if (!response.ok) return;
      const body = await response.json();
      if (!Array.isArray(body.attendees)) return;
      const remote: Attendee[] = body.attendees.map((row: Record<string, unknown>) => {
        const profile = row.users as { name?: string; email?: string } | null;
        const rawStatus = String(row.status || '').toLowerCase();
        return { id: String(row.registration_id), name: String(row.attendee_name || profile?.name || ''), email: String(row.attendee_email || profile?.email || ''), phone: String(row.mobile_number || ''), status: rawStatus.includes('reject') || rawStatus === 'declined' ? 'Declined' : rawStatus.includes('pending') ? 'Pending' : 'Confirmed', dateRegistered: String(row.registration_date || ''), checkedIn: Boolean(row.checked_in_at), attendeesCount: Number(row.attendees_count || 1), notes: String(row.notes || ''), paymentStatus: String(row.payment_status || ''), amount: Number((body.event?.price || 0) as number) * Number(row.attendees_count || 1), reference: `SP-${eventKey.slice(0,6).toUpperCase()}-${String(row.user_id).slice(0,6).toUpperCase()}`, proofUrl: (row.proof_signed_url as string | null) || null };
      });
      setAttendees(remote);
    } catch {
      setAttendees([]);
    }
  }

  // Switch event handler
  const handleEventChange = (key: string) => {
    setSelectedEventKey(key);
    void loadAttendeesForEvent(key);
  };

  useEffect(() => {
    const handleSync = () => {
      if (selectedEventKey) {
        loadAttendeesForEvent(selectedEventKey);
      }
    };
    const unsubscribeEvents = subscribeToEvents(handleSync);
    window.addEventListener("spott_registered_updated", handleSync);
    return () => {
      unsubscribeEvents();
      window.removeEventListener("spott_registered_updated", handleSync);
    };
  }, [selectedEventKey]);

  // Stats calculation
  const totalRsvps = attendees.length;
  const confirmedCount = attendees.filter((a) => a.status === "Confirmed").length;
  const pendingCount = attendees.filter((a) => a.status === "Pending").length;
  const declinedCount = attendees.filter((a) => a.status === "Declined").length;

  // Filter attendees
  const filteredAttendees = useMemo(() => {
    return attendees.filter((a) => {
      const matchSearch =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.email.toLowerCase().includes(searchQuery.toLowerCase());
      const normalizedStatus = a.paymentStatus?.toLowerCase().includes("pending") ? "Pending" : a.paymentStatus?.toLowerCase() === "approved" ? "Approved" : a.paymentStatus?.toLowerCase() === "rejected" ? "Rejected" : a.status === "Confirmed" ? "Approved" : a.status === "Declined" ? "Rejected" : "Pending";
      const matchStatus = statusFilter === "All" || normalizedStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [attendees, searchQuery, statusFilter]);

  // CSV export function
  const handleExportCSV = () => {
    const currentEvent = availableEvents.find((e) => e.id === selectedEventKey);
    const eventTitle = currentEvent ? currentEvent.title : "Event";
    const headers = ["Name", "Email", "RSVP Status", "Date Registered", "Checked In", "Ticket Type", "Notes"];
    const rows = attendees.map((a) => [
      `"${a.name}"`,
      `"${a.email}"`,
      `"${a.status}"`,
      `"${a.dateRegistered}"`,
      `"${a.checkedIn ? "Yes" : "No"}"`,
      `"${a.ticketType || ""}"`,
      `"${a.notes || ""}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `RSVP_${eventTitle.replace(/\s+/g, "_")}_Guestlist.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedEvent = availableEvents.find((e) => e.id === selectedEventKey);

  // Toggle status (e.g. Cancel or Confirm / Approve)
  const handleToggleStatus = async (id: string, newStatus: "Confirmed" | "Pending" | "Declined") => {
    const affectedAttendee = attendees.find((a) => a.id === id);
    if (!affectedAttendee || affectedAttendee.status === newStatus) return;
    if (!selectedEventKey) return;
    const response = await fetchWithSupabaseSession(`/api/organizer/events/${selectedEventKey}/attendees`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId: id, status: newStatus }),
    });
    if (!response.ok) return;
    const updated = attendees.map((a) => (a.id === id ? { ...a, status: newStatus } : a));
    setAttendees(updated);
    window.dispatchEvent(new Event("spott_registered_updated"));

    if (selectedAttendee && selectedAttendee.id === id) {
      setSelectedAttendee((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const handleToggleCheckIn = async (id: string) => {
    const attendee = attendees.find((item) => item.id === id);
    if (!attendee || !selectedEventKey) return;
    const checkedIn = !attendee.checkedIn;
    const response = await fetchWithSupabaseSession(`/api/organizer/events/${selectedEventKey}/attendees`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'checkin', registrationId: id, checkedIn }),
    });
    if (!response.ok) return;
    setAttendees((current) => current.map((item) => item.id === id ? { ...item, checkedIn } : item));
    setSelectedAttendee((current) => current?.id === id ? { ...current, checkedIn } : current);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Top Header matching Wireframe 2 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#171717] tracking-tight">
            RSVP Management
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-semibold text-[#666666]">Event:</span>
            <div className="relative inline-block">
              <select
                value={selectedEventKey}
                onChange={(e) => handleEventChange(e.target.value)}
                className="appearance-none bg-white border border-[#e6e1d8] hover:border-[#ff6b35] text-[#171717] font-bold text-sm rounded-xl py-1 pl-3 pr-8 focus:outline-none cursor-pointer transition-colors shadow-2xs"
              >
                {availableEvents.length === 0 ? (
                  <option value="">No Active Event Selected</option>
                ) : (
                  availableEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-4 h-4 text-[#888888] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Export CSV Button */}
        <div>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#e6e1d8] hover:border-[#ff6b35] hover:bg-[#fff0e8] text-[#171717] hover:text-[#ff6b35] font-bold text-xs sm:text-sm shadow-2xs transition-all cursor-pointer group"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#ff6b35]" />
            <span>Export Guestlist (CSV)</span>
          </button>
        </div>
      </div>

      {/* 4 RSVP Metric Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total RSVPs */}
        <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-bold text-[#666666] uppercase tracking-wide block mb-2">
            Total RSVPs
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-[#171717]">{totalRsvps}</span>
          </div>
          <p className="text-[11px] text-[#888888] mt-2">Active registrations</p>
        </div>

        {/* Going */}
        <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm hover:border-emerald-500/40 transition-colors">
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide block mb-2">
            Going
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-emerald-600">
              {confirmedCount}
              {selectedEvent?.capacity ? (
                <span className="text-sm sm:text-base text-[#888] font-bold"> / {selectedEvent.capacity}</span>
              ) : null}
            </span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
              {selectedEvent?.capacity
                ? `${Math.round((confirmedCount / selectedEvent.capacity) * 100)}% capacity`
                : `${Math.round((confirmedCount / Math.max(totalRsvps, 1)) * 100)}%`}
            </span>
          </div>
          <p className="text-[11px] text-[#888888] mt-2">
            {selectedEvent?.capacity
              ? `${Math.max(0, selectedEvent.capacity - confirmedCount)} spots remaining`
              : `${attendees.filter((attendee) => attendee.checkedIn).length} checked in`}
          </p>
        </div>

        {/* Maybe */}
        <div className={`bg-white border rounded-2xl p-5 shadow-sm transition-colors ${
          pendingCount > 0 ? "border-[#ff6b35] bg-[#fffbf9]" : "border-[#e6e1d8] hover:border-[#ff6b35]/40"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#ff6b35] uppercase tracking-wide">
              Maybe
            </span>
            {pendingCount > 0 && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 animate-pulse">
                Needs review
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-[#ff6b35]">{pendingCount}</span>
            <span className="text-xs font-bold text-[#ff6b35] bg-[#fff0e8] px-2 py-0.5 rounded-md">
              Awaiting review
            </span>
          </div>
          <p className="text-[11px] text-[#888888] mt-2">
            {pendingCount > 0
              ? `${pendingCount} attendee${pendingCount > 1 ? "s" : ""} waiting for approval`
              : "No pending reviews"}
          </p>
        </div>

        {/* Declined */}
        <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm hover:border-rose-500/40 transition-colors">
          <span className="text-xs font-bold text-rose-600 uppercase tracking-wide block mb-2">
            Declined
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-rose-600">{declinedCount}</span>
          </div>
          <p className="text-[11px] text-[#888888] mt-2">Seats released</p>
        </div>
      </div>

      {/* Attendee Filter Bar & Table Card */}
      <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm overflow-hidden">
        {/* Filter Toolbar matching Wireframe 2 */}
        <div className="p-5 border-b border-[#e6e1d8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search attendees by name or email..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm font-medium border border-[#e6e1d8] rounded-xl focus:outline-none focus:border-[#ff6b35] transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-[#666666] hidden sm:inline">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter attendee RSVP status"
              className="px-3.5 py-2 text-xs sm:text-sm font-bold border border-[#e6e1d8] rounded-xl bg-white text-[#171717] focus:outline-none focus:border-[#ff6b35] cursor-pointer"
            >
              <option value="All">Status: All</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Table of Attendees */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase tracking-wider text-[#666666]">
                <th className="py-3.5 px-6">Full Name</th>
                <th className="py-3.5 px-6">Email</th>
                <th className="py-3.5 px-6">Mobile</th>
                <th className="py-3.5 px-6">Attendees</th>
                <th className="py-3.5 px-6">Notes</th>
                <th className="py-3.5 px-6">RSVP Status</th>
                <th className="py-3.5 px-6">RSVP Date / Time</th>
                <th className="py-3.5 px-6">Payment</th>
                <th className="py-3.5 px-6">Amount / Reference</th>
                <th className="py-3.5 px-6">Proof</th>
                <th className="py-3.5 px-6">Check-in</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e1d8]">
              {filteredAttendees.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-[#888888] text-sm">
                    {attendees.length === 0
                      ? "No RSVPs recorded yet. When guests register for your events, they will appear here in real-time."
                      : "No attendees match your search."}
                  </td>
                </tr>
              ) : (
                filteredAttendees.map((attendee) => (
                  <tr
                    key={attendee.id}
                    className="hover:bg-[#faf8f3]/60 transition-colors group"
                  >
                    <td className="py-4 px-6 font-bold text-[#171717] group-hover:text-[#ff6b35] transition-colors whitespace-nowrap">
                      {attendee.name}
                    </td>
                    <td className="py-4 px-6 text-xs text-[#555555] font-mono">
                      {attendee.email}
                    </td>
                    <td className="py-4 px-6 text-xs">{attendee.phone || "—"}</td>
                    <td className="py-4 px-6 text-xs">{attendee.attendeesCount || 1}</td>
                    <td className="max-w-48 py-4 px-6 text-xs">{attendee.notes || "—"}</td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
                          attendee.status === "Confirmed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : attendee.status === "Pending"
                            ? "bg-[#fff0e8] text-[#ff6b35] border border-[#ff6b35]/30"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            attendee.status === "Confirmed"
                              ? "bg-emerald-500"
                              : attendee.status === "Pending"
                              ? "bg-[#ff6b35]"
                              : "bg-rose-500"
                          }`}
                        />
                        {attendee.paymentStatus?.toLowerCase().includes("pending") ? "Pending" : attendee.paymentStatus?.toLowerCase() === "approved" ? "Approved" : attendee.paymentStatus?.toLowerCase() === "rejected" ? "Rejected" : attendee.status === "Confirmed" ? "Approved" : attendee.status === "Pending" ? "Pending" : "Rejected"}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs font-semibold text-[#444444] whitespace-nowrap">
                      {attendee.dateRegistered}
                    </td>
                    <td className="py-4 px-6 text-xs">{attendee.paymentStatus || "—"}</td>
                    <td className="py-4 px-6 text-xs">{attendee.amount ? `₱${attendee.amount.toLocaleString('en-PH',{minimumFractionDigits:2})}` : "—"}<br/>{attendee.reference || ""}</td>
                    <td className="py-4 px-6">{attendee.proofUrl ? <button onClick={() => setProofToView(attendee.proofUrl || null)} className="text-xs font-bold text-[#ff6b35] underline">View proof of payment</button> : "—"}</td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      {attendee.status === "Confirmed" ? (
                        <button type="button" onClick={() => handleToggleCheckIn(attendee.id)} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${attendee.checkedIn ? "bg-emerald-100 text-emerald-800" : "bg-white border border-[#e6e1d8] text-[#666666] hover:border-emerald-500"}`}>
                          {attendee.checkedIn ? "Checked in" : "Check in"}
                        </button>
                      ) : <span className="text-xs text-[#aaaaaa]">—</span>}
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => setSelectedAttendee(attendee)}
                          className="text-xs font-bold text-[#171717] hover:text-[#ff6b35] hover:underline cursor-pointer"
                        >
                          Detail
                        </button>
                        {attendee.status === "Pending" ? (
                          <>
                            <button
                              onClick={() => handleToggleStatus(attendee.id, "Confirmed")}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" /> Approve
                            </button>
                            <button
                              onClick={() => handleToggleStatus(attendee.id, "Declined")}
                              className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        ) : attendee.status === "Confirmed" ? (
                          <button
                            onClick={() => handleToggleStatus(attendee.id, "Declined")}
                            className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleStatus(attendee.id, "Confirmed")}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                          >
                            Re-activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {proofToView && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setProofToView(null)}><div className="max-h-[90vh] max-w-4xl rounded-2xl bg-white p-3" onClick={(event) => event.stopPropagation()}><button onClick={() => setProofToView(null)} className="mb-2 rounded-lg border px-3 py-1">Close</button><img src={proofToView} alt="Uploaded proof of payment" className="max-h-[80vh] max-w-full object-contain" /></div></div>}

      {/* Attendee Detail Modal */}
      {selectedAttendee && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-start justify-between pb-3 border-b border-[#e6e1d8]">
              <div>
                <h3 className="text-lg font-black text-[#171717]">{selectedAttendee.name}</h3>
                <p className="text-xs text-[#888888] font-mono mt-0.5">{selectedAttendee.email}</p>
              </div>
              <button
                onClick={() => setSelectedAttendee(null)}
                className="text-[#888888] hover:text-[#171717] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                <div>
                  <span className="text-[11px] font-bold text-[#666666] uppercase block">Ticket</span>
                  <span className="text-xs font-black text-[#171717]">
                    {selectedAttendee.ticketType || "General Admission"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#666666] uppercase block">Registered</span>
                    <span className="text-xs font-black text-[#171717]">{selectedAttendee.dateRegistered}</span>
                </div>
                {selectedAttendee.phone && (
                  <div className="col-span-2">
                    <span className="text-[11px] font-bold text-[#666666] uppercase block">Contact</span>
                    <span className="text-xs font-black text-[#171717]">{selectedAttendee.phone}</span>
                  </div>
                )}
              </div>

              <div>
                <span className="text-xs font-bold text-[#666666] block mb-2">Update RSVP Status:</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleToggleStatus(selectedAttendee.id, "Confirmed")}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      selectedAttendee.status === "Confirmed"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    Going
                  </button>
                  <button
                    onClick={() => handleToggleStatus(selectedAttendee.id, "Pending")}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      selectedAttendee.status === "Pending"
                        ? "bg-[#ff6b35] text-white border-[#ff6b35] shadow-sm"
                        : "bg-white text-[#ff6b35] border-[#ff6b35]/30 hover:bg-[#fff0e8]"
                    }`}
                  >
                    Maybe
                  </button>
                  <button
                    onClick={() => handleToggleStatus(selectedAttendee.id, "Declined")}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      selectedAttendee.status === "Declined"
                        ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                        : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                    }`}
                  >
                    Declined
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedAttendee(null)}
                className="px-5 py-2 rounded-xl bg-[#171717] text-white text-xs font-bold hover:bg-[#ff6b35] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RsvpManagementPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto py-12 text-center text-sm font-semibold text-[#666666]">
          Loading RSVP Management...
        </div>
      }
    >
      <RsvpManagementContent />
    </Suspense>
  );
}
