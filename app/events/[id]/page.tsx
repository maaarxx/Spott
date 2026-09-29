"use client";

import { useState, useEffect, use, useMemo, useRef } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import {
  MapPin,
  CheckCircle2,
  Share2,
  Bookmark,
  Calendar,
  Clock,
  Building2,
  ExternalLink,
  ChevronLeft,
  LogIn,
  Lock,
  X,
  Users,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import MapView from "@/components/MapView";
import CancelRsvpModal from "@/components/CancelRsvpModal";
import { DEFAULT_EVENTS } from "@/lib/default-events";
import { getStoredEvents, saveStoredEvent, saveStoredEvents, subscribeToEvents } from "@/lib/events-store";
import { recordEventView } from "@/lib/views-store";
import { addNotification } from "@/lib/notifications-store";
import { addReport } from "@/lib/reports-store";
import { getUserProfile } from "@/lib/user-profile-store";
import {
  getCurrentUser,
  getUserSavedEvents,
  saveUserSavedEvents,
  getUserRegisteredEvents,
  saveUserRegisteredEvents,
  SPOTT_ACCOUNTS,
  SpottAccount,
} from "@/lib/auth-store";

type EventDetail = {
  id: string;
  title: string;
  description: string;
  date: string;
  endDate?: string;
  price: number;
  status: string;
  organizer: string;
  verified: boolean;
  location: string;
  address: string;
  city: string;
  categories: string[];
  registrations: number;
  latitude?: number;
  longitude?: number;
  confirmedAt?: string | null;
  coverImage?: string | null;
  image?: string | null;
  capacity?: number | null;
  requireApproval?: boolean;
  cancel_reason?: string;
  cancelled_at?: string;
};

export default function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const initialEvent = (DEFAULT_EVENTS.find((e) => e.id === id) || null) as EventDetail | null;
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SpottAccount | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(initialEvent);
  const [loading, setLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [rsvpd, setRsvpd] = useState(false);
  const [attendeeStatus, setAttendeeStatus] = useState<"Confirmed" | "Pending" | "Declined" | null>(null);
  const [rsvpCount, setRsvpCount] = useState(0);
  const [confirmationStatus, setConfirmationStatus] = useState<string | null>(null);
  const [confirmationsCount, setConfirmationsCount] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancellingRsvp, setIsCancellingRsvp] = useState(false);
  const [allAvailableEvents, setAllAvailableEvents] = useState<EventDetail[]>([]);
  const hasTrackedView = useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  useEffect(() => {
    const getAccurateRsvps = (baseRegistrations: number, isUserConfirmed: boolean): number => {
      let guestListCount = 0;
      let hasGuestList = false;
      try {
        const rawGuests = localStorage.getItem("spott_guest_lists");
        if (rawGuests) {
          const guestMap = JSON.parse(rawGuests);
          if (Array.isArray(guestMap[id])) {
            hasGuestList = true;
            guestListCount = guestMap[id].filter(
              (a: any) => a.status === "Confirmed"
            ).length;
          }
        }
      } catch {}

      if (hasGuestList) {
        return guestListCount;
      }

      if (isUserConfirmed) {
        return Math.max(baseRegistrations, 1);
      }
      return baseRegistrations;
    };

    // 1. Check saved & registered status scoped to logged-in user
    const checkUserStatus = (): { isRsvpd: boolean; isConfirmed: boolean } => {
      try {
        const user = getCurrentUser();
        setCurrentUser(user);

        if (!user) {
          setIsSaved(false);
          setRsvpd(false);
          setAttendeeStatus(null);
          setSavedCount(0);
          return { isRsvpd: false, isConfirmed: false };
        }

        const savedIds = getUserSavedEvents(user.email);
        const hasSaved = savedIds.includes(id);
        setIsSaved(hasSaved);
        setSavedCount(hasSaved ? 1 : 0);

        const regIds = getUserRegisteredEvents(user.email);
        let hasReg = regIds.includes(id);
        let foundStatus: "Confirmed" | "Pending" | "Declined" | null = null;

        try {
          const rawGuests = localStorage.getItem("spott_guest_lists");
          if (rawGuests) {
            const guestMap = JSON.parse(rawGuests);
            const list = guestMap[id];
            if (Array.isArray(list)) {
              const matched = list.find(
                (a: any) => a.email?.toLowerCase() === user.email.toLowerCase()
              );
              if (matched) {
                foundStatus = matched.status || "Confirmed";
                hasReg = matched.status !== "Declined";
              }
            }
          }
        } catch {}

        if (hasReg && !foundStatus) {
          foundStatus = "Confirmed";
        }

        setRsvpd(hasReg);
        setAttendeeStatus(hasReg ? foundStatus : null);
        return { isRsvpd: hasReg, isConfirmed: hasReg && foundStatus === "Confirmed" };
      } catch {
        setIsSaved(false);
        setRsvpd(false);
        setAttendeeStatus(null);
        setSavedCount(0);
        return { isRsvpd: false, isConfirmed: false };
      }
    };

    const userStatus = checkUserStatus();

    // 2. Check local storage first (organizer created events)
    const stored = getStoredEvents();
    const foundLocal = stored.find((e) => e.id === id);

    // Track view once per page load (deduplicated on backend, guarded with useRef + sessionStorage)
    if (!hasTrackedView.current) {
      hasTrackedView.current = true;
      recordEventView(id, { organizer: foundLocal?.organizer || initialEvent?.organizer });
    }
    if (foundLocal) {
      setEvent(foundLocal as any);
      const accurateCount = getAccurateRsvps(foundLocal.registrations || 0, userStatus.isConfirmed);
      setRsvpCount(accurateCount);
      setConfirmationsCount((foundLocal as any).confirmations || 0);

      // If guest list exists for this event, sync the confirmed registrations count
      try {
        const rawGuests = localStorage.getItem("spott_guest_lists");
        if (rawGuests) {
          const guestMap = JSON.parse(rawGuests);
          if (Array.isArray(guestMap[id])) {
            const confirmedCount = guestMap[id].filter((a: any) => a.status === "Confirmed").length;
            if (foundLocal.registrations !== confirmedCount) {
              foundLocal.registrations = confirmedCount;
              const updated = stored.map((e) => (e.id === id ? { ...e, registrations: confirmedCount } : e));
              localStorage.setItem("spott_events_directory", JSON.stringify(updated));
            }
          }
        }
      } catch {}
    } else {
      // 3. Otherwise fetch from API / fallback
      const fetchEvent = async () => {
        try {
          const res = await fetch(`/api/events/${id}`);
          if (!res.ok) throw new Error("Failed to fetch event");
          const data = await res.json();
          if (data && data.title) {
            setEvent(data);
            const accurateCount = getAccurateRsvps(data.registrations || 0, userStatus.isConfirmed);
            setRsvpCount(accurateCount);
            setConfirmationsCount(data.confirmations || (data.confirmedAt ? 3 : 0));
          }
        } catch {
          const fallback = DEFAULT_EVENTS.find((e) => e.id === id);
          if (fallback) {
            setEvent(fallback as any);
            const accurateCount = getAccurateRsvps(fallback.registrations || 0, userStatus.isConfirmed);
            setRsvpCount(accurateCount);
          }
        }
      };

      fetchEvent();
    }

    const loadAllAvailable = async () => {
      const local = getStoredEvents();
      setAllAvailableEvents(local as any);

      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const apiData = await res.json();
          if (Array.isArray(apiData) && apiData.length > 0) {
            saveStoredEvents(apiData, false);
            const freshLocal = getStoredEvents();
            const pool = [...freshLocal, ...apiData];
            const seen = new Set<string>();
            const deduped: EventDetail[] = [];
            for (const item of pool) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                deduped.push(item as any);
              }
            }
            setAllAvailableEvents(deduped);
          }
        }
      } catch {}
    };

    loadAllAvailable();

    const handleSyncUpdate = () => {
      const currentStatus = checkUserStatus();
      const currentStored = getStoredEvents();
      const match = currentStored.find((e) => e.id === id);
      const accurateCount = getAccurateRsvps(match?.registrations ?? 0, currentStatus.isConfirmed);
      setRsvpCount(accurateCount);
      if (match) {
        setEvent((prev) => (prev ? { ...prev, ...match, registrations: accurateCount } : match as any));
      }
      setAllAvailableEvents(currentStored as any);
    };

    const unsubscribeEvents = subscribeToEvents(handleSyncUpdate);
    window.addEventListener("spott_registered_updated", handleSyncUpdate);
    window.addEventListener("spott_saved_updated", handleSyncUpdate);
    window.addEventListener("spott_auth_changed", handleSyncUpdate);
    return () => {
      unsubscribeEvents();
      window.removeEventListener("spott_registered_updated", handleSyncUpdate);
      window.removeEventListener("spott_saved_updated", handleSyncUpdate);
      window.removeEventListener("spott_auth_changed", handleSyncUpdate);
    };
  }, [id]);

  const handleToggleSave = () => {
    if (!currentUser) {
      showToast("Please log in to save events.");
      router.push(`/login?redirect=/events/${id}`);
      return;
    }

    const user = currentUser || getCurrentUser();
    if (!user) {
      router.push(`/login?redirect=/events/${id}`);
      return;
    }

    try {
      const currentSaves = getUserSavedEvents(user.email);
      let ids = [...currentSaves];

      if (isSaved) {
        ids = ids.filter((itemId) => itemId !== id);
        setIsSaved(false);
        setSavedCount((c) => Math.max(0, c - 1));
        showToast("Event removed from your saved plan.");
      } else {
        if (!ids.includes(id)) ids.push(id);
        setIsSaved(true);
        setSavedCount((c) => c + 1);
        showToast("Event saved to your plan!");
      }
      saveUserSavedEvents(ids, user.email);
    } catch {}
  };

  const handleRSVP = () => {
    if (!currentUser) {
      showToast("Please log in to RSVP for this event.");
      router.push(`/login?redirect=/events/${id}`);
      return;
    }

    if (rsvpd) {
      setShowCancelModal(true);
      return;
    }

    try {
      const user = currentUser || getCurrentUser();
      if (!user) return;

      const storedEvents = getStoredEvents();
      const foundIndex = storedEvents.findIndex((e) => e.id === id);
      const eventTarget = (foundIndex !== -1 ? storedEvents[foundIndex] : event) as EventDetail | null;

      const requireApproval = Boolean(eventTarget?.requireApproval);
      const rawCap = eventTarget?.capacity;
      const effectiveCap = typeof rawCap === "number" ? rawCap : (rawCap ? Number(rawCap) : 100);
      const isCapacityLimited = effectiveCap > 0;
      const currentConfirmed = eventTarget?.registrations || 0;
      const isFull = isCapacityLimited && currentConfirmed >= effectiveCap;

      const newStatus: "Confirmed" | "Pending" = (requireApproval || isFull) ? "Pending" : "Confirmed";

      // 1. Update registered event IDs for user
      const currentRegs = getUserRegisteredEvents(user.email);
      const regIds = [...currentRegs];
      if (!regIds.includes(id)) regIds.push(id);
      saveUserRegisteredEvents(regIds, user.email);

      // 2. Only increment registrations count if Confirmed
      let newCount = currentConfirmed;
      if (newStatus === "Confirmed") {
        newCount = currentConfirmed + 1;
        if (foundIndex !== -1) {
          storedEvents[foundIndex].registrations = newCount;
          localStorage.setItem("spott_events_directory", JSON.stringify(storedEvents));
        } else if (event) {
          const eventToSave = {
            ...event,
            registrations: newCount,
          };
          localStorage.setItem("spott_events_directory", JSON.stringify([eventToSave, ...storedEvents]));
        }
      }

      // 3. Update organizer guest lists in spott_guest_lists
      const rawGuests = localStorage.getItem("spott_guest_lists");
      let guestMap: Record<string, any[]> = {};
      try {
        guestMap = rawGuests ? JSON.parse(rawGuests) : {};
      } catch {}

      const currentGuestList = guestMap[id] || [];
      const alreadyAttendingIdx = currentGuestList.findIndex(
        (a) => a.email?.toLowerCase() === user.email.toLowerCase() || a.id === user.email
      );
      const newAttendee = {
        id: `att-${Date.now()}`,
        name: user.name || "Guest Attendee",
        email: user.email,
        status: newStatus,
        dateRegistered: new Date().toISOString().split("T")[0],
        ticketType: "General Admission",
        phone: getUserProfile(user.email).phone,
        notes: isFull ? "Waitlist (Event Full)" : requireApproval ? "Awaiting Screening" : "Direct RSVP",
      };

      if (alreadyAttendingIdx !== -1) {
        currentGuestList[alreadyAttendingIdx] = newAttendee;
      } else {
        currentGuestList.unshift(newAttendee);
      }
      guestMap[id] = currentGuestList;
      localStorage.setItem("spott_guest_lists", JSON.stringify(guestMap));

      // 4. Update UI states
      setRsvpd(true);
      setAttendeeStatus(newStatus);
      setRsvpCount(newCount);
      setEvent((prev) => (prev ? { ...prev, registrations: newCount } : null));

      // 5. Notify organizer
      addNotification({
        type: newStatus === "Pending" ? "reminder" : "announcement",
        title: newStatus === "Pending" ? `RSVP Needs Approval: "${eventTarget?.title}"` : `New Confirmed RSVP: "${eventTarget?.title}"`,
        message: `${user.name} (${user.email}) registered for your event. Status: ${newStatus}.`,
        targetRole: "organizer",
        link: `/organizer/rsvp?eventId=${id}`,
      });

      // 6. Broadcast updates
      window.dispatchEvent(new Event("spott_registered_updated"));
      window.dispatchEvent(new Event("spott_events_updated"));

      if (newStatus === "Pending") {
        if (isFull) {
          showToast("Event is full! You have been placed on the Pending waitlist.");
        } else {
          showToast("RSVP Submitted! Your registration is pending organizer review.");
        }
      } else {
        showToast("You are registered! Check My Events to view your ticket.");
      }
    } catch (e) {
      console.error("Failed to update RSVP:", e);
    }
  };

  const handleConfirmCancelRSVP = () => {
    const user = currentUser || getCurrentUser();
    if (!user) return;
    setIsCancellingRsvp(true);

    try {
      // 1. Remove from user registered IDs
      const currentRegs = getUserRegisteredEvents(user.email);
      const regIds = currentRegs.filter((itemId) => itemId !== id);
      saveUserRegisteredEvents(regIds, user.email);

      // 2. Decrement registrations count in directory ONLY if attendee was Confirmed
      const wasConfirmed = attendeeStatus === "Confirmed";
      const storedEvents = getStoredEvents();
      const foundIndex = storedEvents.findIndex((e) => e.id === id);
      const curCount = foundIndex !== -1 ? (storedEvents[foundIndex].registrations || 0) : (event?.registrations || 0);
      const newCount = wasConfirmed ? Math.max(0, curCount - 1) : curCount;

      if (wasConfirmed) {
        if (foundIndex !== -1) {
          storedEvents[foundIndex].registrations = newCount;
          localStorage.setItem("spott_events_directory", JSON.stringify(storedEvents));
        } else if (event) {
          const eventToSave = { ...event, registrations: newCount };
          localStorage.setItem("spott_events_directory", JSON.stringify([eventToSave, ...storedEvents]));
        }
      }

      // 3. Remove attendee from organizer guest lists
      const rawGuests = localStorage.getItem("spott_guest_lists");
      let guestMap: Record<string, any[]> = {};
      try {
        guestMap = rawGuests ? JSON.parse(rawGuests) : {};
      } catch {}

      const userEmail = user.email.trim().toLowerCase();
      const userName = (user.name || "").trim().toLowerCase();
      let currentGuestList = guestMap[id] || [];
      currentGuestList = currentGuestList.filter(
        (a) =>
          a.email?.toLowerCase() !== userEmail &&
          a.id !== userEmail &&
          (!userName || a.name?.toLowerCase() !== userName)
      );
      guestMap[id] = currentGuestList;
      localStorage.setItem("spott_guest_lists", JSON.stringify(guestMap));

      // 4. Update UI states immediately
      setRsvpd(false);
      setAttendeeStatus(null);
      setRsvpCount(newCount);
      setEvent((prev) => (prev ? { ...prev, registrations: newCount } : null));
      setIsCancellingRsvp(false);
      setShowCancelModal(false);

      // 5. Broadcast updates
      window.dispatchEvent(new Event("spott_registered_updated"));
      window.dispatchEvent(new Event("spott_events_updated"));

      showToast("RSVP cancelled. Your slot has been released.");
    } catch {
      setIsCancellingRsvp(false);
      setShowCancelModal(false);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      showToast("Event link copied to clipboard!");
    } else {
      showToast("Link: " + window.location.href);
    }
  };

  const handleConfirmation = (type: "yes" | "not_sure") => {
    if (type === "yes") {
      setConfirmationStatus("Thanks for confirming!");
      setConfirmationsCount((c) => c + 1);
    } else {
      setConfirmationStatus("Thanks for letting us know.");
    }
    showToast("Feedback submitted. Thank you!");
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reportReason.trim().length < 5) {
      showToast("Please provide at least 5 characters.");
      return;
    }

    const user = getCurrentUser();
    const reporterName = user?.name || "John Doe";
    const reporterEmail = user?.email || "jd@spott.ph";

    addReport({
      reporter: reporterName,
      reporterEmail: reporterEmail,
      eventId: id,
      event: event?.title || "Community Event",
      reason: "Listing Policy / Content Concern",
      details: reportReason.trim(),
    });

    setReportSubmitted(true);
    setShowReport(false);
    showToast("Report submitted for administrator review.");
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 animate-pulse space-y-6">
        <div className="h-4 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-80 bg-gray-200 rounded-2xl" />
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
          <div className="h-96 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-ink mb-2">Event Not Found</h2>
        <p className="text-muted text-sm mb-6">
          The event you are looking for does not exist or has been removed.
        </p>
        <Link
          href="/discover"
          className="inline-block bg-dark text-white px-6 py-2.5 rounded-lg font-bold text-sm no-underline hover:bg-ink"
        >
          Back to Discover
        </Link>
      </div>
    );
  }

  let formattedDate = "Upcoming Date";
  let formattedTime = "Time TBA";
  try {
    const start = new Date(event.date.replace(" ", "T"));
    formattedDate = format(start, "EEEE, MMMM d, yyyy");
    formattedTime = format(start, "h:mm a");
    if (event.endDate) {
      const end = new Date(event.endDate.replace(" ", "T"));
      formattedTime += ` - ${format(end, "h:mm a")}`;
    } else {
      formattedTime += " - 11:00 PM";
    }
  } catch {}

  const isFree = Number(event.price) === 0;
  const priceDisplay = isFree ? "Free admission" : `₱${Number(event.price).toLocaleString()}`;
  const categoryLabel = event.categories?.[0] || "Community";

  // Related events for "Events Like This" (matched by shared categories, with fallbacks)
  const relatedEvents = (() => {
    if (!event) return [];
    const currentCats = (event.categories || []).map((c) => c.toLowerCase().trim());
    const currentId = event.id;

    // Filter out the current event
    const candidates = allAvailableEvents.filter((e) => e.id !== currentId);

    // 1. Matches that share at least one category
    const categoryMatches = candidates.filter((item) => {
      const itemCats = (item.categories || []).map((c) => c.toLowerCase().trim());
      if (itemCats.length === 0 || currentCats.length === 0) return false;
      return currentCats.some((cat) =>
        itemCats.some((ic) => ic === cat || ic.includes(cat) || cat.includes(ic))
      );
    });

    // 2. Fallbacks if category matches are fewer than 3
    const fallbacks = candidates.filter(
      (item) => !categoryMatches.some((m) => m.id === item.id)
    );

    return [...categoryMatches, ...fallbacks].slice(0, 3);
  })();

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    (event.address || event.location || "") + " " + (event.city || "")
  )}`;

  return (
    <div className="bg-white min-h-screen">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#222] text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-bold animate-in fade-in duration-200">
          {toastMessage}
        </div>
      )}

      {/* Breadcrumb matching screen-event-details wireframe */}
      <div className="border-b border-line bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 text-xs text-muted flex items-center gap-1.5 truncate">
          <Link
            href="/"
            className="hover:text-ink transition-colors flex items-center gap-1 no-underline font-medium text-muted"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-ink font-bold truncate">{event.title}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* ========================================================= */}
          {/* LEFT COLUMN: Main Event Content (from screen-event-details) */}
          {/* ========================================================= */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Image Banner */}
            <div className="w-full h-72 md:h-96 rounded-2xl bg-[#faf8f3] relative overflow-hidden select-none border border-line shadow-sm">
              {(event.coverImage || event.image) ? (
                <img
                  src={(event.coverImage || event.image)!}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#222] via-[#2f3238] to-[#1e2025] flex flex-col items-center justify-center p-8 text-center text-white">
                  <span className="text-xs font-black uppercase tracking-[3px] text-accent/80 mb-2">
                    {categoryLabel}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-black max-w-lg leading-tight m-0 text-white/90">
                    {event.title}
                  </h2>
                  <span className="text-xs text-gray-400 mt-2 font-medium flex items-center justify-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-accent" /> {event.location}
                  </span>
                </div>
              )}
            </div>

            {/* Badges Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-dark text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md">
                {categoryLabel}
              </span>
              {event.verified && (
                <span className="bg-white border border-line text-ink text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md flex items-center gap-1 shadow-xs">
                  <CheckCircle2 className="w-3 h-3 text-[#14804a]" /> Verified
                </span>
              )}
              {event.status?.toLowerCase() === "cancelled" ? (
                <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md">
                  CANCELLED
                </span>
              ) : (
                <span className="bg-[#fff0e8] text-accent border border-accent/20 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md">
                  {event.status?.toUpperCase() || "ACTIVE"}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink m-0">
              {event.title}
            </h1>

            {/* Cancellation Notice Banner */}
            {event.status?.toLowerCase() === "cancelled" && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm space-y-1 animate-in fade-in">
                <div className="flex items-center gap-2 font-black text-rose-900">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>This event has been cancelled by the organizer.</span>
                </div>
                {event.cancel_reason && (
                  <p className="text-xs text-rose-700 font-medium pl-7">
                    Organizer note: &quot;{event.cancel_reason}&quot;
                  </p>
                )}
                {event.cancelled_at && (
                  <p className="text-[11px] text-rose-600/80 pl-7">
                    Cancelled on {format(new Date(event.cancelled_at), "MMM d, yyyy · h:mm a")}
                  </p>
                )}
              </div>
            )}

            {/* Details Table Grid matching wireframe */}
            <div className="border border-line rounded-xl overflow-hidden divide-y divide-line text-sm">
              <div className="grid grid-cols-3 md:grid-cols-4 p-3.5 bg-white items-center">
                <span className="text-xs font-black text-muted uppercase tracking-wider">
                  DATE
                </span>
                <span className="col-span-2 md:col-span-3 font-semibold text-ink">
                  {formattedDate}
                </span>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 p-3.5 bg-white items-center">
                <span className="text-xs font-black text-muted uppercase tracking-wider">
                  TIME
                </span>
                <span className="col-span-2 md:col-span-3 font-semibold text-ink">
                  {formattedTime}
                </span>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 p-3.5 bg-white items-start">
                <span className="text-xs font-black text-muted uppercase tracking-wider pt-0.5">
                  VENUE
                </span>
                <div className="col-span-2 md:col-span-3 font-semibold text-ink">
                  <div>{event.location}</div>
                  <div className="text-xs text-muted font-normal mt-0.5">
                    {event.address || `${event.location}, ${event.city}`}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 p-3.5 bg-white items-center">
                <span className="text-xs font-black text-muted uppercase tracking-wider">
                  PRICE
                </span>
                <span className="col-span-2 md:col-span-3 font-semibold text-ink">
                  {priceDisplay}
                </span>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 p-3.5 bg-white items-center">
                <span className="text-xs font-black text-muted uppercase tracking-wider">
                  ORGANIZER
                </span>
                <span className="col-span-2 md:col-span-3 font-semibold text-ink flex items-center gap-1.5">
                  <Link
                    href={`/organizers/${encodeURIComponent(event.organizer || "Metro Creative Group")}`}
                    className="inline-flex items-center gap-1.5 text-ink hover:text-accent font-semibold group transition-colors"
                  >
                    <span className="group-hover:underline underline-offset-2">
                      {event.organizer || "Metro Creative Group"}
                    </span>
                    {event.verified && (
                      <CheckCircle2 className="w-4 h-4 text-[#14804a] shrink-0" />
                    )}
                    <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors ml-0.5 opacity-70 group-hover:opacity-100" />
                  </Link>
                </span>
              </div>
            </div>

            {/* About This Event */}
            <div className="pt-2">
              <h3 className="text-xl font-bold text-ink mb-3">About This Event</h3>
              <p className="text-muted text-sm leading-relaxed whitespace-pre-line m-0">
                {event.description ||
                  `Experience the vibrant community gathering featuring local vendors, food, music, and activities for everyone.\n\nBring your friends and family for an engaging experience with verified organizers and authentic local spots.`}
              </p>
              <p className="text-xs text-muted mt-3">
                Pets are welcome. Parking available on premises or nearby streets.
              </p>
            </div>

            {/* Location Section & Map */}
            <div className="pt-4 border-t border-line space-y-3">
              <h3 className="text-xl font-bold text-ink m-0">Location</h3>
              <p className="text-xs text-muted m-0 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>
                  {event.location}, {event.address || event.city}
                </span>
              </p>

              {/* Map embed view */}
              <div className="h-64 rounded-xl overflow-hidden border border-line relative shadow-xs">
                <MapView
                  events={[event]}
                  pinMode={true}
                  center={
                    event.latitude && event.longitude
                      ? { lat: event.latitude, lng: event.longitude }
                      : undefined
                  }
                  zoom={15}
                />
              </div>

              <div className="pt-1">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-accent hover:underline inline-flex items-center gap-1 no-underline"
                >
                  Open in Maps <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Events Like This Section */}
            <div className="pt-6 border-t border-line">
              <h3 className="text-xl font-bold text-ink mb-4">Events Like This</h3>
              {relatedEvents.length === 0 ? (
                <div className="text-sm text-muted bg-gray-50 border border-line rounded-xl p-5 text-center">
                  No similar events found right now. Check back soon!
                </div>
              ) : (
                <div className="space-y-3">
                  {relatedEvents.map((item) => {
                    let formattedItemDate = "Upcoming";
                    try {
                      if (item.date) {
                        const d = new Date(item.date.replace(" ", "T"));
                        if (!isNaN(d.getTime())) {
                          formattedItemDate = format(d, "MMM d");
                        }
                      }
                    } catch {}

                    const itemCat = item.categories?.[0] || "Community";
                    const itemCover = item.coverImage || item.image;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3.5 bg-white border border-line rounded-xl hover:shadow-sm hover:border-gray-300 transition-all group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {itemCover ? (
                            <div className="w-14 h-14 rounded-lg overflow-hidden border border-line bg-gray-100 shrink-0 relative">
                              <img
                                src={itemCover}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            </div>
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-orange-50 border border-orange-200/50 flex flex-col items-center justify-center text-center p-1 shrink-0">
                              <span className="text-[9px] font-black uppercase text-[#ff6b35]">
                                {itemCat.slice(0, 3)}
                              </span>
                              <span className="text-[11px] font-bold text-ink leading-tight">
                                {formattedItemDate}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-black uppercase tracking-wider text-[#ff6b35] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                                {itemCat}
                              </span>
                              <span className="text-xs text-muted">
                                {formattedItemDate}
                              </span>
                            </div>
                            <Link
                              href={`/events/${item.id}`}
                              className="font-bold text-sm text-ink hover:text-[#ff6b35] transition-colors no-underline block truncate"
                            >
                              {item.title}
                            </Link>
                            <p className="text-xs text-muted m-0 truncate">
                              {item.location || item.city || "Philippines"} · {Number(item.price) === 0 ? "Free" : `₱${Number(item.price).toLocaleString()}`}
                            </p>
                          </div>
                        </div>

                        <Link
                          href={`/events/${item.id}`}
                          className="border border-line hover:border-[#ff6b35] text-xs font-bold px-3 py-1.5 rounded-lg text-ink hover:text-[#ff6b35] hover:bg-orange-50/50 no-underline shrink-0 ml-3 transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: Sidebar Action Card (from screen-event-details) */}
          {/* ========================================================= */}
          <div className="lg:col-span-1">
            <div className="border border-line rounded-2xl p-6 bg-white shadow-sm sticky top-24 space-y-6">
              {/* Price Heading */}
              <div>
                <h3 className="text-2xl font-black text-ink m-0">
                  {priceDisplay}
                </h3>
              </div>

              {/* RSVP Button / Registered Status Card */}
              {event.status?.toLowerCase() === "cancelled" ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled
                    className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    <span>Event Cancelled</span>
                  </button>
                  <p className="text-center text-xs text-rose-600 font-semibold m-0">
                    RSVPs are closed because the organizer cancelled this event.
                  </p>
                </div>
              ) : !currentUser ? (
                <button
                  type="button"
                  onClick={handleRSVP}
                  className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-[#ff6b35] hover:bg-[#e0531f] text-white shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span>Log in to RSVP</span>
                </button>
              ) : rsvpd ? (
                <div className="space-y-2">
                  {attendeeStatus === "Pending" ? (
                    <div className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-amber-50 text-amber-900 border border-amber-300 flex items-center justify-center gap-2 shadow-xs text-center">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>⏳ RSVP Pending Organizer Approval</span>
                    </div>
                  ) : (
                    <div className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center justify-center gap-2 shadow-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>✓ Registered for this Event</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="w-full py-2 px-3 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50/70 rounded-xl transition-colors border border-rose-200/80 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel RSVP</span>
                  </button>
                </div>
              ) : (() => {
                const rawCap = event?.capacity;
                const effectiveCap = typeof rawCap === "number" ? rawCap : (rawCap ? Number(rawCap) : 100);
                const isFull = effectiveCap > 0 && (event?.registrations || 0) >= effectiveCap;

                return (
                  <button
                    type="button"
                    onClick={handleRSVP}
                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 text-white ${
                      isFull
                        ? "bg-amber-600 hover:bg-amber-700 shadow-sm"
                        : event?.requireApproval
                        ? "bg-[#ff6b35] hover:bg-[#e0531f] shadow-sm"
                        : "bg-dark hover:bg-ink"
                    }`}
                  >
                    {isFull ? (
                      <span>Join Waitlist (RSVP Pending)</span>
                    ) : event?.requireApproval ? (
                      <span>Request RSVP</span>
                    ) : (
                      <span>RSVP / Register</span>
                    )}
                  </button>
                );
              })()}

              {/* Subtle 'n spots left' indicator under RSVP button, above share button on lower right */}
              {(() => {
                const rawCap = event?.capacity;
                const capacity = typeof rawCap === "number" ? rawCap : (rawCap ? Number(rawCap) : 100);
                if (capacity <= 0) return null;
                const slotsTaken = rsvpCount || 0;
                const slotsLeft = Math.max(0, capacity - slotsTaken);
                const isFull = slotsLeft === 0;

                return (
                  <div className="flex justify-end -mt-3.5 pt-0.5">
                    <span className={`text-[11px] font-bold inline-flex items-center gap-1 ${
                      isFull
                        ? "text-rose-600"
                        : slotsLeft <= 5
                        ? "text-amber-600"
                        : "text-emerald-700"
                    }`}>
                      <Users className="w-3 h-3 text-[#ff6b35]" />
                      <span>{isFull ? "0 spots left (Waitlist)" : `${slotsLeft} spot${slotsLeft !== 1 ? "s" : ""} left`}</span>
                    </span>
                  </div>
                );
              })()}

              {/* Save & Share Buttons */}
              <div className={currentUser ? "grid grid-cols-2 gap-3" : "flex"}>
                {currentUser && (
                  <button
                    type="button"
                    onClick={handleToggleSave}
                    className={`border py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      isSaved
                        ? "bg-[#fff0e8] text-accent border-accent/40"
                        : "border-line text-ink hover:bg-gray-50"
                    }`}
                  >
                    <Bookmark
                      className="w-4 h-4"
                      fill={isSaved ? "currentColor" : "none"}
                    />
                    <span>{isSaved ? "Saved" : "Save"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleShare}
                  className={`border border-line hover:bg-gray-50 text-ink py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    !currentUser ? "w-full" : ""
                  }`}
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>

              <hr className="border-line m-0" />

              {/* Still happening? Feedback - only visible to logged-in users */}
              {currentUser && (
                <>
                  <hr className="border-line m-0" />
                  <div className="space-y-2.5">
                    <h4 className="font-bold text-sm text-ink m-0">Still happening?</h4>
                    <p className="text-xs text-muted m-0">
                      {confirmationsCount > 0
                        ? `${confirmationsCount} attendee${confirmationsCount > 1 ? "s" : ""} confirmed this event is still on.`
                        : "No confirmations yet. Be the first to confirm!"}
                    </p>

                    {confirmationStatus ? (
                      <div className="p-2.5 bg-[#f0f9f4] border border-[#14804a]/20 rounded-lg text-xs font-bold text-[#14804a] text-center">
                        ✓ {confirmationStatus}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleConfirmation("yes")}
                          className="py-2 px-3 border border-line rounded-lg text-xs font-bold hover:bg-[#faf8f3] hover:border-ink transition-colors cursor-pointer"
                        >
                          Yes, still on
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmation("not_sure")}
                          className="py-2 px-3 border border-line rounded-lg text-xs font-bold hover:bg-[#faf8f3] transition-colors cursor-pointer text-muted"
                        >
                          Not sure
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              <hr className="border-line m-0" />

              {/* Activity Signal - numbers blurred for anonymous users */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted m-0">
                    Activity Signal
                  </h4>
                  {!currentUser && (
                    <Link
                      href={`/login?redirect=/events/${id}`}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ff6b35] hover:underline"
                    >
                      <Lock className="w-2.5 h-2.5" />
                      <span>Log in to view</span>
                    </Link>
                  )}
                </div>
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-muted">RSVPs</span>
                  {!currentUser ? (
                    <span className="font-bold text-ink filter blur-[5px] select-none opacity-60">
                      {rsvpCount > 0 ? rsvpCount : 12}
                    </span>
                  ) : (
                    <span className="font-bold text-ink">{rsvpCount}</span>
                  )}
                </div>
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-muted">Saves</span>
                  {!currentUser ? (
                    <span className="font-bold text-ink filter blur-[5px] select-none opacity-60">
                      {savedCount > 0 ? savedCount : 8}
                    </span>
                  ) : (
                    <span className="font-bold text-ink">{savedCount}</span>
                  )}
                </div>
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-muted">Confirmations</span>
                  {!currentUser ? (
                    <span className="font-bold text-ink filter blur-[5px] select-none opacity-60">
                      {confirmationsCount > 0 ? confirmationsCount : 5}
                    </span>
                  ) : (
                    <span className="font-bold text-ink">{confirmationsCount}</span>
                  )}
                </div>
              </div>

              <hr className="border-line m-0" />

              {/* Dynamic Status / Outdated Alert Box */}
              {(() => {
                let isOutdated = false;
                try {
                  if (event.date) {
                    const eventTime = new Date(event.date.replace(" ", "T")).getTime();
                    isOutdated = Date.now() - eventTime > 14 * 24 * 60 * 60 * 1000;
                  }
                } catch {}

                if (isOutdated) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                      <b className="text-[11px] font-black uppercase text-amber-900 tracking-wider block">
                        POTENTIALLY OUTDATED
                      </b>
                      <p className="text-[11px] text-amber-800 leading-relaxed m-0">
                        This event was scheduled over 14 days ago. Please confirm details with organizer.
                      </p>
                    </div>
                  );
                }

                if (event.verified) {
                  return (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <b className="text-[11px] font-black uppercase tracking-wider">
                          VERIFIED & ACTIVE
                        </b>
                      </div>
                      <p className="text-[11px] text-emerald-700 leading-relaxed m-0">
                        This event is active and verified by {event.organizer || "Metro Creative Group"}.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="p-3 bg-gray-50 border border-line rounded-xl space-y-1">
                    <b className="text-[11px] font-black uppercase text-gray-700 tracking-wider block">
                      COMMUNITY EVENT · ACTIVE
                    </b>
                    <p className="text-[11px] text-muted leading-relaxed m-0">
                      Hosted by {event.organizer || "Community Organizer"}.
                    </p>
                  </div>
                );
              })()}

              {/* Report link & form - only for logged-in users */}
              {currentUser && (
                <div className="pt-1 text-center">
                  {reportSubmitted ? (
                    <span className="text-xs text-[#14804a] font-bold">
                      ✓ Report submitted to administrator
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowReport(!showReport)}
                        className="text-xs text-muted hover:text-ink hover:underline cursor-pointer border-0 bg-transparent p-0"
                      >
                        Report this event
                      </button>

                      {showReport && (
                        <form
                          onSubmit={handleReportSubmit}
                          className="mt-3 text-left space-y-2 p-3 bg-gray-50 border border-line rounded-xl animate-in fade-in"
                        >
                          <textarea
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value)}
                            maxLength={500}
                            placeholder="Reason for report (required)..."
                            className="w-full min-h-[70px] p-2 text-xs border border-line rounded-lg bg-white outline-none focus:border-accent"
                            required
                          />
                          <button
                            type="submit"
                            className="w-full py-1.5 bg-dark hover:bg-ink text-white font-bold text-xs rounded-lg cursor-pointer"
                          >
                            Submit Report
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel RSVP Confirmation Modal */}
      <CancelRsvpModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancelRSVP}
        eventTitle={event?.title}
        isSubmitting={isCancellingRsvp}
      />
    </div>
  );
}
