"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Bookmark,
  MapPin,
  ArrowUpRight,
  CalendarPlus,
  Bell,
  BellRing,
  ExternalLink,
  Clock,
  X,
} from "lucide-react";
import Link from "next/link";
import { format, addDays, isBefore, parseISO } from "date-fns";
import type { EventData } from "@/components/EventCard";
import { DEFAULT_EVENTS } from "@/lib/default-events";
import { addNotification } from "@/lib/notifications-store";

type Tab = "saved" | "registered" | "upcoming" | "past";

// ─── Google Calendar URL builder ────────────────────────────────────────────
function buildGoogleCalendarUrl(event: EventData): string {
  const startDate = new Date(event.date);
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // +2 hrs default

  const pad = (n: number) => String(n).padStart(2, "0");
  const toGCal = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toGCal(startDate)}/${toGCal(endDate)}`,
    details: `Event on Spott. ${event.description || ""}\n\nView event: ${typeof window !== "undefined" ? window.location.origin : ""}/events/${event.id}`,
    location: event.location || "",
    sf: "true",
    output: "xml",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ─── Reminder store (localStorage) ──────────────────────────────────────────
const REMINDER_KEY = "spott_event_reminders";

function getReminders(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(REMINDER_KEY) || "[]");
  } catch {
    return [];
  }
}

function toggleReminder(eventId: string): boolean {
  const reminders = getReminders();
  const idx = reminders.indexOf(eventId);
  if (idx === -1) {
    reminders.push(eventId);
    localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
    return true; // added
  } else {
    reminders.splice(idx, 1);
    localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
    return false; // removed
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function MyEventsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("saved");
  const [events, setEvents] = useState<EventData[]>(DEFAULT_EVENTS);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [reminders, setReminders] = useState<string[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "info" } | null>(null);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("spott_saved_events");
      if (stored) setSavedIds(JSON.parse(stored).map(String));
    } catch {}
    setReminders(getReminders());
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setEvents(data);
    } catch {}
  };

  const showToast = (msg: string, type: "success" | "info" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const now = new Date();
  const savedEvents = savedIds.length > 0 ? events.filter((e) => savedIds.includes(e.id)) : events.slice(0, 3);
  const registeredEvents = events.slice(0, 1);
  const upcomingEvents = events.filter((e) => new Date(e.date) > now);
  const pastEvents = events.filter((e) => new Date(e.date) <= now);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "saved", label: "Saved", count: savedEvents.length },
    { key: "registered", label: "Registered", count: registeredEvents.length },
    { key: "upcoming", label: "Upcoming", count: upcomingEvents.length },
    { key: "past", label: "Past", count: pastEvents.length },
  ];

  const currentEvents = { saved: savedEvents, registered: registeredEvents, upcoming: upcomingEvents, past: pastEvents }[activeTab];

  // The "selected" event for Quick Actions = first upcoming, else first in current tab, else null
  const quickActionEvent: EventData | null = upcomingEvents[0] ?? currentEvents[0] ?? null;

  const handleAddToGoogleCalendar = () => {
    if (!quickActionEvent) {
      showToast("No upcoming event to add. Save or register for an event first.", "info");
      return;
    }
    setCalendarEventId(quickActionEvent.id);
    const url = buildGoogleCalendarUrl(quickActionEvent);
    window.open(url, "_blank", "noopener,noreferrer");
    showToast(`✓ Opened Google Calendar for "${quickActionEvent.title}"`);
  };

  const handleAddSpecificToCalendar = (event: EventData, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildGoogleCalendarUrl(event);
    window.open(url, "_blank", "noopener,noreferrer");
    showToast(`✓ Opened Google Calendar for "${event.title}"`);
  };

  const handleSetReminder = (event: EventData, minutesBefore: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const added = toggleReminder(event.id);
    setReminders(getReminders());
    setReminderPickerOpen(false);

    if (added) {
      // Fire a Spott in-app notification for the reminder
      addNotification({
        type: "reminder",
        title: `Reminder Set: "${event.title}"`,
        message: `You'll be reminded ${minutesBefore >= 60 ? `${minutesBefore / 60}h` : `${minutesBefore}min`} before the event on ${format(new Date(event.date), "EEE, MMM d • h:mm a")}.`,
        targetRole: "user",
        link: `/events/${event.id}`,
      });
      showToast(`🔔 Reminder set for "${event.title}"!`);
    } else {
      showToast(`Reminder removed for "${event.title}".`, "info");
    }
  };

  const handleToggleReminder = () => {
    if (!quickActionEvent) {
      showToast("No upcoming event to set a reminder for.", "info");
      return;
    }
    setReminderPickerOpen((v) => !v);
  };

  const isReminderSet = (id: string) => reminders.includes(id);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-bold text-white transition-all animate-in slide-in-from-bottom-4 ${
            toast.type === "success" ? "bg-[#171717]" : "bg-[#666666]"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-[#ff6b35] shrink-0" />
          ) : (
            <Bell className="w-4 h-4 text-white/70 shrink-0" />
          )}
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-60 hover:opacity-100 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <h1 className="text-3xl font-bold text-ink mb-6">My Events Dashboard</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-dark text-white"
                : "bg-white text-ink border border-line hover:bg-gray-50"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Events List ── */}
        <div className="lg:col-span-2 space-y-4">
          {currentEvents.length === 0 ? (
            <div className="bg-white border border-line rounded-2xl p-12 text-center">
              <Bookmark className="w-12 h-12 text-muted mx-auto mb-4 stroke-1" />
              <h3 className="font-bold text-lg text-ink mb-2">No events found</h3>
              <p className="text-muted text-sm mb-6">
                You haven't {activeTab} any events yet. Explore events happening around you.
              </p>
              <Link
                href="/discover"
                className="bg-accent text-white px-6 py-2.5 rounded-full font-bold text-sm hover:bg-[#e0531b] transition-colors inline-block"
              >
                Discover Events
              </Link>
            </div>
          ) : (
            currentEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => router.push(`/events/${event.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/events/${event.id}`);
                  }
                }}
                className="bg-white border border-line rounded-2xl p-5 flex flex-col sm:flex-row justify-between gap-4 hover:border-accent/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent">
                      {event.categories?.[0] || "Event"}
                    </span>
                    {event.verified && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[#14804a]">
                        <CheckCircle2 className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-ink group-hover:text-accent transition-colors flex items-center gap-1 m-0">
                    <span>{event.title}</span>
                    <ArrowUpRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 group-hover:text-accent transition-all shrink-0" />
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-muted pt-1">
                    <span>{format(new Date(event.date), "EEE, MMM d • h:mm a")}</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {event.location}
                    </span>
                  </div>
                </div>

                {/* Per-card quick actions */}
                <div className="flex sm:flex-col justify-between items-end gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-line shrink-0">
                  <span className="font-bold text-ink text-sm">
                    {event.price === 0 ? "Free Entry" : `₱${event.price}`}
                  </span>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {/* Google Calendar */}
                    <button
                      title="Add to Google Calendar"
                      onClick={(e) => handleAddSpecificToCalendar(event, e)}
                      className="p-1.5 rounded-lg border border-line hover:border-[#ff6b35] hover:bg-[#fff0e8] text-muted hover:text-[#ff6b35] transition-all cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                    </button>
                    {/* Reminder */}
                    <button
                      title={isReminderSet(event.id) ? "Reminder set — click to remove" : "Set reminder"}
                      onClick={(e) => { e.stopPropagation(); handleSetReminder(event, 60); }}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                        isReminderSet(event.id)
                          ? "border-[#ff6b35] bg-[#fff0e8] text-[#ff6b35]"
                          : "border-line hover:border-[#ff6b35] hover:bg-[#fff0e8] text-muted hover:text-[#ff6b35]"
                      }`}
                    >
                      {isReminderSet(event.id) ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                    </button>
                    {activeTab === "saved" && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-white bg-dark px-3 py-1.5 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" /> Saved
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-6">
          {/* ── QUICK ACTIONS ── */}
          <div className="bg-white border border-line rounded-2xl p-6">
            <h3 className="font-bold text-ink mb-1">Quick Actions</h3>
            {quickActionEvent ? (
              <p className="text-xs text-muted mb-4 leading-relaxed">
                Actions for{" "}
                <span className="font-bold text-[#171717] truncate">
                  {quickActionEvent.title}
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted mb-4">Save or register for events to use quick actions.</p>
            )}

            <div className="space-y-2">
              {/* Add to Google Calendar */}
              <button
                onClick={handleAddToGoogleCalendar}
                disabled={!quickActionEvent}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-line hover:border-[#ff6b35] hover:bg-[#fff8f5] text-sm font-bold text-ink hover:text-[#ff6b35] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group text-left"
              >
                <span className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] flex items-center justify-center shrink-0 transition-colors">
                  <CalendarPlus className="w-4 h-4 text-[#ff6b35]" />
                </span>
                <span className="flex-1">Add to Google Calendar</span>
                <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-[#ff6b35] shrink-0 transition-colors" />
              </button>

              {/* Set Event Reminder */}
              <div className="relative">
                <button
                  onClick={handleToggleReminder}
                  disabled={!quickActionEvent}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group text-left ${
                    quickActionEvent && isReminderSet(quickActionEvent.id)
                      ? "border-[#ff6b35] bg-[#fff8f5] text-[#ff6b35]"
                      : "border-line hover:border-[#ff6b35] hover:bg-[#fff8f5] text-ink hover:text-[#ff6b35]"
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    quickActionEvent && isReminderSet(quickActionEvent.id)
                      ? "bg-[#fff0e8]"
                      : "bg-[#faf8f3] group-hover:bg-[#fff0e8]"
                  }`}>
                    {quickActionEvent && isReminderSet(quickActionEvent.id)
                      ? <BellRing className="w-4 h-4 text-[#ff6b35]" />
                      : <Bell className="w-4 h-4 text-[#ff6b35]" />
                    }
                  </span>
                  <span className="flex-1">
                    {quickActionEvent && isReminderSet(quickActionEvent.id)
                      ? "Reminder Active — Click to Change"
                      : "Set Event Reminder"}
                  </span>
                </button>

                {/* Reminder time picker dropdown */}
                {reminderPickerOpen && quickActionEvent && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-[#e6e1d8] rounded-2xl shadow-lg z-20 p-3 space-y-1">
                    <p className="text-[11px] font-black uppercase tracking-wider text-muted px-2 pb-1">
                      Remind me before event
                    </p>
                    {[
                      { label: "15 minutes before", mins: 15 },
                      { label: "30 minutes before", mins: 30 },
                      { label: "1 hour before", mins: 60 },
                      { label: "2 hours before", mins: 120 },
                      { label: "1 day before", mins: 1440 },
                    ].map(({ label, mins }) => (
                      <button
                        key={mins}
                        onClick={(e) => handleSetReminder(quickActionEvent, mins, e)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-ink hover:bg-[#fff0e8] hover:text-[#ff6b35] transition-colors cursor-pointer text-left"
                      >
                        <Clock className="w-3.5 h-3.5 text-[#ff6b35] shrink-0" />
                        {label}
                      </button>
                    ))}
                    <button
                      onClick={() => setReminderPickerOpen(false)}
                      className="w-full px-3 py-2 rounded-xl text-xs font-bold text-muted hover:bg-gray-50 transition-colors cursor-pointer text-center"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Active reminders count hint */}
            {reminders.length > 0 && (
              <p className="text-[11px] text-muted mt-3 flex items-center gap-1.5">
                <BellRing className="w-3 h-3 text-[#ff6b35]" />
                {reminders.length} reminder{reminders.length !== 1 ? "s" : ""} active across your events
              </p>
            )}
          </div>

          {/* ── Summary Statistics ── */}
          <div className="bg-white border border-line rounded-2xl p-6">
            <h3 className="font-bold text-ink mb-4">Summary Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Saved Events</span>
                <span className="font-bold text-ink">{savedEvents.length} events</span>
              </div>
              <hr className="border-line" />
              <div className="flex justify-between text-sm">
                <span className="text-muted">Registered Events</span>
                <span className="font-bold text-ink">{registeredEvents.length} events</span>
              </div>
              <hr className="border-line" />
              <div className="flex justify-between text-sm">
                <span className="text-muted">Upcoming this week</span>
                <span className="font-bold text-ink">{upcomingEvents.length} events</span>
              </div>
              <hr className="border-line" />
              <div className="flex justify-between text-sm">
                <span className="text-muted">With Reminders</span>
                <span className="font-bold text-[#ff6b35]">
                  {reminders.length} event{reminders.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
