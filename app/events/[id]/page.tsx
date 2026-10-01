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
import { getStoredEvents, saveStoredEvent, saveStoredEvents, subscribeToEvents } from "@/lib/events-store";
import { recordEventView } from "@/lib/views-store";
import type { EventData } from "@/components/EventCard";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";
import {
  getCurrentUser,
  SpottAccount,
} from "@/lib/auth-store";
import { loadSavedEventIds, toggleSavedEvent } from "@/lib/saved-events-client";

type EventDetail = EventData & { confirmations?: number };
export default function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SpottAccount | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [comments, setComments] = useState<Array<{id:string; user_id:string; content:string; created_at:string; users?: {name?:string}|null; is_owner?:boolean}>>([]);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState("");
  useEffect(() => { if (!id) return; void fetchWithSupabaseSession(`/api/events/${id}/comments`).then((r) => r.json()).then((body) => setComments(body.comments || [])).catch(() => {}); }, [id]);
  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault(); setCommentError("");
    const response = await fetchWithSupabaseSession(`/api/events/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: commentText }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setCommentError(body.error || "Unable to post comment."); return; }
    setComments((current) => [...current, { ...body.comment, is_owner: true }]); setCommentText("");
  };
  const deleteComment = async (commentId: string) => { const response = await fetchWithSupabaseSession(`/api/events/${id}/comments?commentId=${commentId}`, { method: "DELETE" }); if (response.ok) setComments((items) => items.filter((item) => item.id !== commentId)); else { const body = await response.json().catch(() => ({})); setCommentError(body.error || "Unable to delete comment."); } };
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
  const [rsvpFormOpen, setRsvpFormOpen] = useState(false);
  const [rsvpInfo, setRsvpInfo] = useState({ fullName: "", mobile: "", email: "", attendees: "1", notes: "" });
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [rsvpFormError, setRsvpFormError] = useState("");
  const [allAvailableEvents, setAllAvailableEvents] = useState<EventDetail[]>([]);
  const hasTrackedView = useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  useEffect(() => {
    const checkUserStatus = () => {
      const user = getCurrentUser();
      setCurrentUser(user);
      if (!user) {
        setIsSaved(false);
        setRsvpd(false);
        setAttendeeStatus(null);
        setSavedCount(0);
        return;
      }
      void loadSavedEventIds().then((savedIds) => {
        const hasSaved = savedIds.includes(id);
        setIsSaved(hasSaved);
        setSavedCount(hasSaved ? 1 : 0);
      }).catch(() => { setIsSaved(false); setSavedCount(0); });
      void fetchWithSupabaseSession('/api/my-registrations', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Unable to load RSVP status');
          const payload = await response.json();
          const registration = (payload.registrations || []).find((item: { event_id: string }) => item.event_id === id);
          if (!registration) {
            setRsvpd(false);
            setAttendeeStatus(null);
            return;
          }
          const status = String(registration.status || '').toLowerCase();
          const pending = status.includes('pending') || status === 'rejected' || status === 'declined';
          setRsvpd(status !== 'rejected' && status !== 'declined');
          setAttendeeStatus(pending ? 'Pending' : 'Confirmed');
        })
        .catch(() => {
          setRsvpd(false);
          setAttendeeStatus(null);
        });
    };

    checkUserStatus();

    // Track view once per page load (deduplicated on backend, guarded with useRef + sessionStorage)
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/events/${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error("Failed to fetch event");
        const data = await res.json() as EventDetail;
        if (data && data.title) {
          setEvent(data);
          saveStoredEvent(data);
          setRsvpCount(data.registrations || 0);
          setConfirmationsCount(data.confirmations || (data.confirmedAt ? 3 : 0));
          if (!hasTrackedView.current) {
            hasTrackedView.current = true;
            recordEventView(id, { organizer: data.organizer });
          }
        }
      } catch {}
    };
    void fetchEvent();

    const loadAllAvailable = async () => {
      const local = getStoredEvents();
      setAllAvailableEvents(local);

      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const apiData = await res.json();
          if (Array.isArray(apiData)) {
            saveStoredEvents(apiData, true);
            setAllAvailableEvents(apiData);
          }
        }
      } catch {}
    };

    loadAllAvailable();

    const handleSyncUpdate = () => {
      checkUserStatus();
      const currentStored = getStoredEvents();
      const match = currentStored.find((e) => e.id === id);
      const accurateCount = match?.registrations ?? 0;
      setRsvpCount(accurateCount);
      void fetchEvent();
      setAllAvailableEvents(currentStored);
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

  const handleToggleSave = async () => {
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
      const saved = await toggleSavedEvent(id);
      setIsSaved(saved);
      setSavedCount(saved ? 1 : 0);
      showToast(saved ? "Event saved to your plan!" : "Event removed from your saved plan.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update saved event.");
    }
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
    setRsvpInfo((info) => ({ ...info, fullName: currentUser.name || "", email: currentUser.email || "" }));
    setRsvpFormError("");
    setRsvpFormOpen(true);
  };

  const submitRsvpForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setRsvpFormError("");
    if (!/^09\d{9}$/.test(rsvpInfo.mobile)) { setRsvpFormError("Use a valid PH mobile number in 09XXXXXXXXX format."); return; }
    if (!rsvpInfo.fullName.trim() || rsvpInfo.fullName.trim().length > 100 || !/^\S+@\S+\.\S+$/.test(rsvpInfo.email) || Number(rsvpInfo.attendees) < 1 || Number(rsvpInfo.attendees) > 20 || rsvpInfo.notes.length > 1000) { setRsvpFormError("Please check the required fields and their limits."); return; }
    const paid = Number(event?.price) > 0;
    if (paid && (!paymentProof || !["image/jpeg","image/png","image/webp","image/gif"].includes(paymentProof.type) || paymentProof.size > 5 * 1024 * 1024)) { setRsvpFormError("Upload a JPG, PNG, WEBP, or GIF proof of payment no larger than 5 MB."); return; }
    const data = new FormData();
    Object.entries(rsvpInfo).forEach(([key, value]) => data.set(key, value));
    if (paymentProof) data.set("proof", paymentProof);
    const response = await fetchWithSupabaseSession(`/api/events/${id}/register`, { method: "POST", body: data });
    const result = await response.json();
    if (!response.ok) { setRsvpFormError(result.error || "Unable to submit RSVP."); return; }
    const attendeeState = result.attendeeStatus === "Confirmed" ? "Confirmed" : "Pending";
    setRsvpd(true);
    setAttendeeStatus(attendeeState);
    setRsvpCount(Number(result.confirmedCount) || 0);
    setEvent((previous) => previous ? { ...previous, registrations: Number(result.confirmedCount) || 0 } : previous);
    setRsvpFormOpen(false);
    setPaymentProof(null);
    showToast(paid ? "Payment submitted. Your RSVP is pending verification." : attendeeState === "Pending" ? "RSVP submitted and is pending organizer review." : "You are registered! Check My Events to view your ticket.");
    window.dispatchEvent(new Event("spott_registered_updated"));
    window.dispatchEvent(new Event("spott_events_updated"));
  };

  const handleConfirmCancelRSVP = async () => {
    const user = currentUser || getCurrentUser();
    if (!user) return;
    setIsCancellingRsvp(true);
    try {
      const response = await fetchWithSupabaseSession(`/api/events/${id}/register`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not cancel RSVP.");
      const newCount = Number(result.confirmedCount) || 0;
      setRsvpd(false);
      setAttendeeStatus(null);
      setRsvpCount(newCount);
      setEvent((prev) => (prev ? { ...prev, registrations: newCount } : null));
      setShowCancelModal(false);
      window.dispatchEvent(new Event("spott_registered_updated"));
      window.dispatchEvent(new Event("spott_events_updated"));
      showToast("RSVP cancelled. Your slot has been released.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not cancel RSVP.");
    } finally {
      setIsCancellingRsvp(false);
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

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reportReason.trim().length < 5) {
      showToast("Please provide at least 5 characters.");
      return;
    }

    const response = await fetchWithSupabaseSession(`/api/events/${id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Listing Policy / Content Concern", details: reportReason.trim() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(result.message || "Could not submit report. Sign in and try again.");
      return;
    }
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
                      <span>⏳ {Number(event?.price) > 0 ? "Pending Verification" : "RSVP Pending Organizer Approval"}</span>
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

      <section className="mt-10 rounded-2xl border border-line bg-white p-6">
        <h2 className="text-xl font-black text-ink">Comments</h2>
        <form onSubmit={submitComment} className="my-4 flex gap-2"><input value={commentText} maxLength={2000} onChange={(e) => setCommentText(e.target.value)} placeholder={currentUser ? "Share a comment…" : "Sign in to join the conversation"} disabled={!currentUser} className="min-w-0 flex-1 rounded-xl border border-line px-4 py-2"/><button disabled={!currentUser || !commentText.trim()} className="rounded-xl bg-dark px-4 py-2 font-bold text-white disabled:opacity-50">Post</button></form>
        {commentError && <p className="text-sm text-rose-600">{commentError}</p>}
        <div className="space-y-3">{comments.map((comment) => <article key={comment.id} className="rounded-xl bg-[#faf8f3] p-4"><div className="flex justify-between gap-3"><strong>{comment.users?.name || "Spott user"}</strong><time className="text-xs text-muted">{new Date(comment.created_at).toLocaleString()}</time></div><p className="mb-0 mt-2 whitespace-pre-wrap">{comment.content}</p>{comment.is_owner && <button onClick={() => deleteComment(comment.id)} className="mt-2 text-xs font-bold text-rose-600">Delete</button>}</article>)}</div>
      </section>

      {rsvpFormOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 p-4"><form onSubmit={submitRsvpForm} className="my-8 max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="m-0 text-xl font-black">RSVP for {event?.title}</h2><button type="button" onClick={() => setRsvpFormOpen(false)} aria-label="Close RSVP form"><X className="h-5 w-5" /></button></div>
        {([['Full Name','fullName','text'],['Mobile Number (09XXXXXXXXX)','mobile','tel'],['Email','email','email'],['Number of Attendees','attendees','number']] as const).map(([label,key,type]) => <label key={key} className="block text-sm font-bold">{label} <span className="text-rose-600">*</span><input required maxLength={key === 'fullName' ? 100 : key === 'email' ? 254 : key === 'mobile' ? 11 : undefined} minLength={key === 'mobile' ? 11 : undefined} inputMode={key === 'mobile' ? 'numeric' : undefined} pattern={key === 'mobile' ? '09[0-9]{9}' : undefined} min={key === 'attendees' ? 1 : undefined} max={key === 'attendees' ? 20 : undefined} type={type} value={rsvpInfo[key]} onChange={(e) => setRsvpInfo((info) => ({ ...info, [key]: key === 'mobile' ? e.target.value.replace(/\D/g, '').slice(0,11) : e.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal" /></label>)}
        <label className="block text-sm font-bold">Notes (optional)<textarea maxLength={1000} value={rsvpInfo.notes} onChange={(e) => setRsvpInfo((info) => ({ ...info, notes: e.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 font-normal" /></label>
        {Number(event?.price) > 0 && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="m-0 font-bold">Please pay ₱{(Number(event?.price) * Number(rsvpInfo.attendees || 1)).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})} via GCash/bank transfer using the QR code below, then upload your proof of payment here.</p><div className="flex items-center gap-4"><svg role="img" aria-label="Placeholder GCash QR code" viewBox="0 0 100 100" className="h-24 w-24 rounded bg-white p-2">{Array.from({length:100},(_,i)=><rect key={i} x={(i%10)*10} y={Math.floor(i/10)*10} width="10" height="10" fill={((i*7+i*i)%11)<5?'#111':'#fff'}/>)}</svg><div><b>Reference:</b> SP-{id.slice(0,6).toUpperCase()}-{currentUser?.email?.slice(0,4).toUpperCase()}<p className="mb-0 mt-1 text-xs">Demo payment instructions only</p></div></div><div className="rounded-xl border border-dashed border-amber-400 bg-white p-4"><p className="mb-2 text-sm font-bold">Upload proof of payment <span className="text-rose-600">*</span></p><input ref={proofInputRef} required type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const file=e.target.files?.[0] || null; if (file && file.size > 5*1024*1024) { setPaymentProof(null); setRsvpFormError("The selected image is over 5 MB."); e.target.value=""; return; } setRsvpFormError(""); setPaymentProof(file); }} className="sr-only"/><button type="button" onClick={() => proofInputRef.current?.click()} className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-bold hover:border-[#ff6b35]">{paymentProof ? "Choose a different image" : "Choose payment proof image"}</button>{paymentProof ? <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span className="truncate">✓ {paymentProof.name} ({(paymentProof.size/1024/1024).toFixed(2)} MB)</span><button type="button" onClick={() => { setPaymentProof(null); if (proofInputRef.current) proofInputRef.current.value=""; }} className="shrink-0 text-rose-600 underline">Remove</button></div> : <p className="mb-0 mt-2 text-xs text-muted">Choose a JPG, PNG, WEBP, or GIF image (maximum 5 MB). Payment proof is required before submitting.</p>}</div></div>}
        {rsvpFormError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{rsvpFormError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setRsvpFormOpen(false)} className="rounded-xl border border-line px-4 py-2">Cancel</button><button type="submit" disabled={Number(event?.price) > 0 && !paymentProof} className="rounded-xl bg-[#ff6b35] px-5 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Submit</button></div></form></div>}

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
