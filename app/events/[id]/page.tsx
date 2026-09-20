"use client";

import { useState, useEffect, use } from "react";
import { format } from "date-fns";
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
} from "lucide-react";
import Link from "next/link";
import MapView from "@/components/MapView";
import { DEFAULT_EVENTS } from "@/lib/default-events";

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
};

export default function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const initialEvent = (DEFAULT_EVENTS.find((e) => e.id === id) || DEFAULT_EVENTS[0]) as EventDetail;
  const [event, setEvent] = useState<EventDetail | null>(initialEvent);
  const [loading, setLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedCount, setSavedCount] = useState(134);
  const [rsvpd, setRsvpd] = useState(false);
  const [rsvpCount, setRsvpCount] = useState(initialEvent?.registrations || 42);
  const [confirmationStatus, setConfirmationStatus] = useState<string | null>(null);
  const [confirmationsCount, setConfirmationsCount] = useState(12);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);


  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/events/${id}`);
        if (!res.ok) throw new Error("Failed to fetch event");
        const data = await res.json();
        setEvent(data);
        if (data.registrations) setRsvpCount(data.registrations);
      } catch {
        // Fallback to default events already initialized
      }
    };

    fetchEvent();

    // Check if saved
    try {
      const stored = localStorage.getItem("spott_saved_events");
      if (stored) {
        const ids = JSON.parse(stored);
        setIsSaved(ids.includes(id));
      }
    } catch {}
  }, [id]);

  const handleToggleSave = () => {
    try {
      const stored = localStorage.getItem("spott_saved_events");
      let ids: string[] = stored ? JSON.parse(stored) : [];
      if (isSaved) {
        ids = ids.filter((itemId) => itemId !== id);
        setIsSaved(false);
        setSavedCount((c) => Math.max(0, c - 1));
        showToast("Event removed from your saved plan.");
      } else {
        ids.push(id);
        setIsSaved(true);
        setSavedCount((c) => c + 1);
        showToast("Event saved to your plan!");
      }
      localStorage.setItem("spott_saved_events", JSON.stringify(ids));
      window.dispatchEvent(new Event("spott_saved_updated"));
    } catch {}
  };

  const handleRSVP = () => {
    if (rsvpd) {
      setRsvpd(false);
      setRsvpCount((c) => Math.max(0, c - 1));
      showToast("RSVP cancelled.");
    } else {
      setRsvpd(true);
      setRsvpCount((c) => c + 1);
      showToast("You are registered! See you there.");
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

  // Related events for "Events Like This"
  const relatedEvents = DEFAULT_EVENTS.filter((e) => e.id !== event.id).slice(0, 3);

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
            href="/discover"
            className="hover:text-ink transition-colors flex items-center gap-1 no-underline font-medium text-muted"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Discover
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
            <div className="w-full h-72 md:h-96 rounded-2xl bg-gradient-to-br from-[#222] via-[#2f3238] to-[#1e2025] flex flex-col items-center justify-center p-8 text-center text-white relative overflow-hidden select-none border border-line shadow-sm">
              <span className="text-xs font-black uppercase tracking-[3px] text-accent/80 mb-2">
                {categoryLabel}
              </span>
              <h2 className="text-2xl md:text-3xl font-black max-w-lg leading-tight m-0 text-white/90">
                {event.title}
              </h2>
              <span className="text-xs text-gray-400 mt-2 font-medium">
                📍 {event.location}
              </span>
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
              <span className="bg-[#fff0e8] text-accent border border-accent/20 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md">
                ACTIVE
              </span>
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink m-0">
              {event.title}
            </h1>

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
                  {event.organizer}
                  {event.verified && (
                    <CheckCircle2 className="w-4 h-4 text-[#14804a]" />
                  )}
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
              <div className="space-y-3">
                {relatedEvents.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3.5 bg-white border border-line rounded-xl hover:shadow-xs transition-shadow"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-14 h-14 rounded-lg bg-gray-100 border border-line flex flex-col items-center justify-center text-center p-1 shrink-0">
                        <span className="text-[9px] font-black uppercase text-accent">
                          {item.categories[0]?.slice(0, 3)}
                        </span>
                        <span className="text-[11px] font-bold text-ink leading-tight">
                          {format(new Date(item.date.replace(" ", "T")), "MMM d")}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted block mb-0.5">
                          {item.categories[0] || "Community"}
                        </span>
                        <Link
                          href={`/events/${item.id}`}
                          className="font-bold text-sm text-ink hover:text-accent transition-colors no-underline block truncate"
                        >
                          {item.title}
                        </Link>
                        <p className="text-xs text-muted m-0 truncate">
                          {item.location} · {Number(item.price) === 0 ? "Free" : `₱${item.price}`}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/events/${item.id}`}
                      className="border border-line hover:border-accent text-xs font-bold px-3 py-1.5 rounded-lg text-ink hover:text-accent no-underline shrink-0"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
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

              {/* RSVP Button */}
              <button
                type="button"
                onClick={handleRSVP}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                  rsvpd
                    ? "bg-[#14804a] text-white shadow-sm hover:bg-[#0f683a]"
                    : "bg-dark hover:bg-ink text-white"
                }`}
              >
                {rsvpd ? "✓ Registered for this Event" : "RSVP / Register"}
              </button>

              {/* Save & Share Buttons */}
              <div className="grid grid-cols-2 gap-3">
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

                <button
                  type="button"
                  onClick={handleShare}
                  className="border border-line hover:bg-gray-50 text-ink py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>

              <div className="text-[11px] text-muted text-center">
                Last updated: Sep 11, 2026 · 2:34 PM
              </div>

              <hr className="border-line m-0" />

              {/* Still happening? Feedback */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-sm text-ink m-0">Still happening?</h4>
                <p className="text-xs text-muted m-0">
                  {confirmationsCount} attendees confirmed this event is still on.
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

              <hr className="border-line m-0" />

              {/* Activity Signal matching wireframe */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted m-0 mb-3">
                  Activity Signal
                </h4>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted">RSVPs</span>
                  <span className="font-bold text-ink">{rsvpCount}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted">Saves</span>
                  <span className="font-bold text-ink">{savedCount}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted">Confirmations</span>
                  <span className="font-bold text-ink">{confirmationsCount}</span>
                </div>
              </div>

              <hr className="border-line m-0" />

              {/* POTENTIALLY OUTDATED Alert Box */}
              <div className="p-3 bg-[#faf8f3] border border-line rounded-xl space-y-1">
                <b className="text-[11px] font-black uppercase text-ink tracking-wider block">
                  POTENTIALLY OUTDATED
                </b>
                <p className="text-[11px] text-muted leading-relaxed m-0">
                  This event info was last verified over 14 days ago. Confirm with organizer.
                </p>
              </div>

              {/* Report link & form */}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
