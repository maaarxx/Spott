"use client";

import { useState, useMemo, useEffect } from "react";
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
import { getStoredEvents } from "@/lib/events-store";

interface Attendee {
  id: string;
  name: string;
  email: string;
  status: "Confirmed" | "Pending" | "Declined";
  dateRegistered: string;
  ticketType?: string;
  phone?: string;
  notes?: string;
}

export default function RsvpManagementPage() {
  const [availableEvents, setAvailableEvents] = useState<{ id: string; title: string }[]>([]);
  const [selectedEventKey, setSelectedEventKey] = useState<string>("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);

  useEffect(() => {
    const loadEvents = () => {
      const stored = getStoredEvents();
      const list = stored.map((e) => ({ id: e.id, title: e.title }));
      setAvailableEvents(list);
      if (list.length > 0 && !selectedEventKey) {
        setSelectedEventKey(list[0].id);
      }
    };
    loadEvents();
    window.addEventListener("spott_events_updated", loadEvents);
    return () => window.removeEventListener("spott_events_updated", loadEvents);
  }, [selectedEventKey]);

  // Switch event handler
  const handleEventChange = (key: string) => {
    setSelectedEventKey(key);
    try {
      const raw = localStorage.getItem("spott_guest_lists");
      if (raw) {
        const parsed = JSON.parse(raw);
        setAttendees(parsed[key] || []);
        return;
      }
    } catch {}
    setAttendees([]);
  };

  useEffect(() => {
    if (selectedEventKey) {
      try {
        const raw = localStorage.getItem("spott_guest_lists");
        if (raw) {
          const parsed = JSON.parse(raw);
          setAttendees(parsed[selectedEventKey] || []);
          return;
        }
      } catch {}
      setAttendees([]);
    }
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
      const matchStatus = statusFilter === "All" || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [attendees, searchQuery, statusFilter]);

  // CSV export function
  const handleExportCSV = () => {
    const currentEvent = availableEvents.find((e) => e.id === selectedEventKey);
    const eventTitle = currentEvent ? currentEvent.title : "Event";
    const headers = ["Name", "Email", "RSVP Status", "Date Registered", "Ticket Type", "Notes"];
    const rows = attendees.map((a) => [
      `"${a.name}"`,
      `"${a.email}"`,
      `"${a.status}"`,
      `"${a.dateRegistered}"`,
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

  // Toggle status (e.g. Cancel or Confirm)
  const handleToggleStatus = (id: string, newStatus: "Confirmed" | "Pending" | "Declined") => {
    setAttendees((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );
    if (selectedAttendee && selectedAttendee.id === id) {
      setSelectedAttendee((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
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

        {/* Confirmed */}
        <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm hover:border-emerald-500/40 transition-colors">
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide block mb-2">
            Confirmed
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-emerald-600">{confirmedCount}</span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
              {Math.round((confirmedCount / Math.max(totalRsvps, 1)) * 100)}%
            </span>
          </div>
          <p className="text-[11px] text-[#888888] mt-2">Checked-in & reserved</p>
        </div>

        {/* Pending */}
        <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm hover:border-[#ff6b35]/40 transition-colors">
          <span className="text-xs font-bold text-[#ff6b35] uppercase tracking-wide block mb-2">
            Pending
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-[#ff6b35]">{pendingCount}</span>
            <span className="text-xs font-bold text-[#ff6b35] bg-[#fff0e8] px-2 py-0.5 rounded-md">
              Awaiting review
            </span>
          </div>
          <p className="text-[11px] text-[#888888] mt-2">Needs confirmation</p>
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
              <option value="Confirmed">Confirmed</option>
              <option value="Pending">Pending</option>
              <option value="Declined">Declined</option>
            </select>
          </div>
        </div>

        {/* Table of Attendees */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase tracking-wider text-[#666666]">
                <th className="py-3.5 px-6">Name</th>
                <th className="py-3.5 px-6">Email</th>
                <th className="py-3.5 px-6">RSVP Status</th>
                <th className="py-3.5 px-6">Date Registered</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e1d8]">
              {filteredAttendees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#888888] text-sm">
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
                        {attendee.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs font-semibold text-[#444444] whitespace-nowrap">
                      {attendee.dateRegistered}
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => setSelectedAttendee(attendee)}
                          className="text-xs font-bold text-[#171717] hover:text-[#ff6b35] hover:underline cursor-pointer"
                        >
                          Detail
                        </button>
                        {attendee.status !== "Declined" ? (
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

              {selectedAttendee.notes && (
                <div>
                  <span className="text-xs font-bold text-[#666666] block mb-1">Attendee Note:</span>
                  <p className="text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-200 text-[#444444]">
                    "{selectedAttendee.notes}"
                  </p>
                </div>
              )}

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
                    Confirmed
                  </button>
                  <button
                    onClick={() => handleToggleStatus(selectedAttendee.id, "Pending")}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      selectedAttendee.status === "Pending"
                        ? "bg-[#ff6b35] text-white border-[#ff6b35] shadow-sm"
                        : "bg-white text-[#ff6b35] border-[#ff6b35]/30 hover:bg-[#fff0e8]"
                    }`}
                  >
                    Pending
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
