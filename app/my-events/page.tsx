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
  Lock,
  LogIn,
} from "lucide-react";
import Link from "next/link";
import { format, addDays, isBefore, parseISO } from "date-fns";
import type { EventData } from "@/components/EventCard";
import { DEFAULT_EVENTS } from "@/lib/default-events";
import { getStoredEvents, subscribeToEvents } from "@/lib/events-store";
import { addNotification } from "@/lib/notifications-store";
import {
  getCurrentUser,
  getUserSavedEvents,
  saveUserSavedEvents,
  getUserRegisteredEvents,
  saveUserRegisteredEvents,
  getUserReminders,
  saveUserReminders,
  SpottAccount,
} from "@/lib/auth-store";
import {
  setEventReminder,
  removeEventReminder,
  getUserRemindersForEvent,
  hasUserReminder,
} from "@/lib/reminders-store";
import CancelRsvpModal from "@/components/CancelRsvpModal";

type Tab = "saved" | "registered" | "created" | "upcoming" | "past";

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

function toggleUserReminder(eventId: string, email?: string): boolean {
  const reminders = getUserReminders(email);
  const idx = reminders.indexOf(eventId);
  if (idx === -1) {
    reminders.push(eventId);
    saveUserReminders(reminders, email);
    return true; // added
  } else {
    reminders.splice(idx, 1);
    saveUserReminders(reminders, email);
    return false; // removed
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function MyEventsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SpottAccount | null>(null);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("saved");
  const [events, setEvents] = useState<EventData[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);
  const [reminders, setReminders] = useState<string[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "info" } | null>(null);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [eventToCancel, setEventToCancel] = useState<EventData | null>(null);
  const [isCancellingRsvp, setIsCancellingRsvp] = useState(false);

  const loadAllEvents = async () => {
    const local = getStoredEvents();
    // Show local events immediately
    setEvents(local);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const res = await fetch("/api/events", { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const apiData = await res.json();
        if (Array.isArray(apiData)) {
          const freshLocal = getStoredEvents();
          const existingIds = new Set(freshLocal.map((e) => e.id));
          const merged = [...freshLocal, ...apiData.filter((e: any) => !existingIds.has(e.id))];
          setEvents(merged);
        }
      }
    } catch {}
  };

  const syncStorage = () => {
    const user = getCurrentUser();
    setCurrentUser(user);
    setMounted(true);

    if (!user) {
      setSavedIds([]);
      setRegisteredIds([]);
      setReminders([]);
      return;
    }

    setSavedIds(getUserSavedEvents(user.email));
    setRegisteredIds(getUserRegisteredEvents(user.email));
    setReminders(getUserReminders(user.email));
  };

  useEffect(() => {
    syncStorage();
    loadAllEvents();

    const onStorageChange = () => {
      syncStorage();
      loadAllEvents();
    };

    const unsubscribeEvents = subscribeToEvents(onStorageChange);
    window.addEventListener("spott_saved_updated", onStorageChange);
    window.addEventListener("spott_registered_updated", onStorageChange);
    window.addEventListener("spott_auth_changed", onStorageChange);
    window.addEventListener("storage", onStorageChange);

    return () => {
      unsubscribeEvents();
      window.removeEventListener("spott_saved_updated", onStorageChange);
      window.removeEventListener("spott_registered_updated", onStorageChange);
      window.removeEventListener("spott_auth_changed", onStorageChange);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);

  const handleToggleSave = (eventId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentUser) return;
    const current = getUserSavedEvents(currentUser.email);
    let ids = [...current];
    if (ids.includes(eventId)) {
      ids = ids.filter((id) => id !== eventId);
      showToast("Event removed from your saved list.", "info");
    } else {
      ids.push(eventId);
      showToast("Event saved!", "success");
    }
    saveUserSavedEvents(ids, currentUser.email);
    setSavedIds(ids);
  };

  const handleConfirmCancelRSVP = () => {
    if (!currentUser || !eventToCancel) return;
    setIsCancellingRsvp(true);

    try {
      const eventId = eventToCancel.id;
      // 1. Remove from registered events
      const currentRegs = getUserRegisteredEvents(currentUser.email);
      const regIds = currentRegs.filter((id) => id !== eventId);
      saveUserRegisteredEvents(regIds, currentUser.email);
      setRegisteredIds(regIds);

      // 2. Decrement registrations count in directory
      const storedEvents = getStoredEvents();
      const foundIndex = storedEvents.findIndex((e) => e.id === eventId);
      if (foundIndex !== -1) {
        const currentCount = storedEvents[foundIndex].registrations || 0;
        storedEvents[foundIndex].registrations = Math.max(0, currentCount - 1);
        localStorage.setItem("spott_events_directory", JSON.stringify(storedEvents));
      }

      // 3. Remove from guest list
      const rawGuests = localStorage.getItem("spott_guest_lists");
      let guestMap: Record<string, any[]> = {};
      try {
        guestMap = rawGuests ? JSON.parse(rawGuests) : {};
      } catch {}
      let currentGuestList = guestMap[eventId] || [];
      currentGuestList = currentGuestList.filter(
        (a) => a.email?.toLowerCase() !== currentUser.email.toLowerCase() && a.id !== currentUser.email
      );
      guestMap[eventId] = currentGuestList;
      localStorage.setItem("spott_guest_lists", JSON.stringify(guestMap));

      // 4. Update UI & broadcast
      setIsCancellingRsvp(false);
      setShowCancelModal(false);
      setEventToCancel(null);

      window.dispatchEvent(new Event("spott_registered_updated"));
      window.dispatchEvent(new Event("spott_events_updated"));

      showToast("RSVP cancelled. Your slot has been released.", "info");
    } catch {
      setIsCancellingRsvp(false);
      setShowCancelModal(false);
      setEventToCancel(null);
    }
  };

  const showToast = (msg: string, type: "success" | "info" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const now = new Date();
  const savedEvents = events.filter((e) => savedIds.includes(e.id));
  const registeredEvents = events.filter((e) => registeredIds.includes(e.id));
  const userOrgName = (currentUser?.organization || currentUser?.name || "").toLowerCase();
  const createdEvents = currentUser && currentUser.role === "organizer"
    ? events.filter((e) => (e.organizer || "").toLowerCase() === userOrgName)
    : [];
  const userEventIds = new Set([...savedIds, ...registeredIds]);
  const userEvents = events.filter((e) => userEventIds.has(e.id));
  const upcomingEvents = userEvents.filter((e) => new Date(e.date) > now);
  const pastEvents = userEvents.filter((e) => new Date(e.date) <= now);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "saved", label: "Saved", count: savedEvents.length },
    { key: "registered", label: "Registered", count: registeredEvents.length },
    { key: "created", label: "Created Events", count: createdEvents.length },
    { key: "upcoming", label: "Upcoming", count: upcomingEvents.length },
    { key: "past", label: "Past", count: pastEvents.length },
  ];

  const currentEvents = {
    saved: savedEvents,
    registered: registeredEvents,
    created: createdEvents,
    upcoming: upcomingEvents,
    past: pastEvents,
  }[activeTab];

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

  const handleSetReminder = async (event: EventData, label: string, minutesBefore: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentUser) return;
    const isAlreadySet = hasUserReminder(event.id, label, currentUser.email);
    if (isAlreadySet) {
      await removeEventReminder(event.id, label, currentUser.email);
      setReminders(getUserReminders(currentUser.email));
      setReminderPickerOpen(false);
      showToast(`Reminder removed for "${event.title}".`, "info");
      return;
    }

    const res = await setEventReminder({
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.date,
      offsetLabel: label,
      offsetMinutes: minutesBefore,
      userEmailOrId: currentUser.email,
    });
    setReminderPickerOpen(false);

    if (res.success) {
      setReminders(getUserReminders(currentUser.email));
      showToast(`Reminder set for "${event.title}" (${label})!`);
    } else {
      showToast(`⚠️ ${res.error || "Failed to set reminder."}`, "info");
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

  // 1. Loading state before client hydration
  if (!mounted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 2. Anonymous / Guest user: Clean, minimal locked screen
  if (!currentUser) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-sm w-full bg-white rounded-3xl border border-line shadow-xs p-8 text-center space-y-5">
          {/* Lock Icon Badge */}
          <div className="w-14 h-14 rounded-2xl bg-[#fff0e8] border border-[#ff6b35]/20 flex items-center justify-center mx-auto text-[#ff6b35]">
            <Lock className="w-6 h-6 stroke-[2.2]" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-ink tracking-tight m-0">
              Log in to view your events
            </h2>
            <p className="text-xs text-muted m-0 leading-relaxed max-w-xs mx-auto">
              Sign in to manage your registered tickets, saved events, and personal reminders.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <Link
              href="/login?redirect=/my-events"
              className="w-full flex items-center justify-center gap-2 bg-[#ff6b35] hover:bg-[#e0531f] text-white font-bold text-xs sm:text-sm py-3 px-5 rounded-xl transition-all shadow-xs no-underline cursor-pointer"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>Log in to continue</span>
            </Link>

            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors no-underline pt-1"
            >
              <span>Explore public events</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
                You haven&apos;t {activeTab} any events yet. Explore events happening around you.
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
                <div className="flex gap-4 items-start flex-1 min-w-0">
                  {(event.coverImage || event.image) ? (
                    <img
                      src={(event.coverImage || event.image)!}
                      alt={event.title}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0 border border-line"
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gradient-to-br from-[#262626] to-[#444] text-white flex flex-col items-center justify-center shrink-0 text-center p-1">
                      <span className="text-[10px] font-black uppercase text-[#ff6b35]">
                        {(event.categories?.[0] || "EVT").slice(0, 4)}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1 flex-1 min-w-0">
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
                    <h3 className="text-lg font-bold text-ink group-hover:text-accent transition-colors flex items-center gap-1 m-0 truncate">
                      <span className="truncate">{event.title}</span>
                      <ArrowUpRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 group-hover:text-accent transition-all shrink-0" />
                    </h3>
                    <div className="flex items-center gap-4 text-xs text-muted pt-1 truncate">
                      <span>{format(new Date(event.date), "EEE, MMM d • h:mm a")}</span>
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" /> {event.location}
                      </span>
                    </div>
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
                      onClick={(e) => { e.stopPropagation(); handleSetReminder(event, "1 hour before", 60, e); }}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                        isReminderSet(event.id)
                          ? "border-[#ff6b35] bg-[#fff0e8] text-[#ff6b35]"
                          : "border-line hover:border-[#ff6b35] hover:bg-[#fff0e8] text-muted hover:text-[#ff6b35]"
                      }`}
                    >
                      {isReminderSet(event.id) ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                    </button>
                    {activeTab === "saved" && (
                      <button
                        type="button"
                        onClick={(e) => handleToggleSave(event.id, e)}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-dark hover:bg-rose-600 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        title="Click to remove from saved"
                      >
                        <Bookmark className="w-3 h-3 fill-current" /> Saved
                      </button>
                    )}
                    {activeTab === "registered" && (() => {
                      let isPending = false;
                      try {
                        const raw = localStorage.getItem("spott_guest_lists");
                        if (raw && currentUser?.email) {
                          const map = JSON.parse(raw);
                          const list = map[event.id];
                          if (Array.isArray(list)) {
                            const att = list.find((a: any) => a.email?.toLowerCase() === currentUser.email.toLowerCase());
                            if (att?.status === "Pending") isPending = true;
                          }
                        }
                      } catch {}

                      return (
                        <div className="flex items-center gap-1.5">
                          {isPending ? (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-lg shadow-2xs">
                              <Clock className="w-3 h-3 text-amber-600" /> Pending Approval
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#14804a] px-3 py-1.5 rounded-lg">
                              <CheckCircle2 className="w-3 h-3" /> Registered
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEventToCancel(event);
                              setShowCancelModal(true);
                            }}
                            className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50/60 hover:bg-rose-100 border border-rose-200/80 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Cancel RSVP"
                          >
                            <X className="w-3 h-3" /> Cancel
                          </button>
                        </div>
                      );
                    })()}
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
                      { label: "1 day before", mins: 1440 },
                      { label: "3 hours before", mins: 180 },
                      { label: "1 hour before", mins: 60 },
                      { label: "30 minutes before", mins: 30 },
                    ].map(({ label, mins }) => {
                      const isSet = quickActionEvent && hasUserReminder(quickActionEvent.id, label, currentUser?.email);
                      return (
                        <button
                          key={mins}
                          onClick={(e) => handleSetReminder(quickActionEvent, label, mins, e)}
                          className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer text-left ${
                            isSet
                              ? "bg-[#fff0e8] text-[#ff6b35]"
                              : "text-ink hover:bg-[#fff0e8] hover:text-[#ff6b35]"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Clock className="w-3.5 h-3.5 text-[#ff6b35] shrink-0" />
                            <span>{label}</span>
                          </div>
                          {isSet && (
                            <span className="text-[10px] font-black uppercase tracking-wider text-[#ff6b35]">
                              Active (Remove)
                            </span>
                          )}
                        </button>
                      );
                    })}
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

      {/* Cancel RSVP Confirmation Modal */}
      <CancelRsvpModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setEventToCancel(null);
        }}
        onConfirm={handleConfirmCancelRSVP}
        eventTitle={eventToCancel?.title}
        isSubmitting={isCancellingRsvp}
      />
    </div>
  );
}
