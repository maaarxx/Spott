"use client";

import { useState, useEffect, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Building2,
  Calendar,
  Users,
  MapPin,
  ExternalLink,
  Share2,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Search,
  Edit3,
} from "lucide-react";
import EventCard, { type EventData } from "@/components/EventCard";
import { getStoredEvents, subscribeToEvents, saveStoredEvents } from "@/lib/events-store";
import { DEFAULT_EVENTS } from "@/lib/default-events";
import { getVerificationState } from "@/lib/verification-store";
import {
  getOrganizerProfile,
  subscribeToOrganizerProfile,
  OrganizerProfile,
} from "@/lib/organizer-store";
import {
  getCurrentUser,
  getUserSavedEvents,
  saveUserSavedEvents,
  SpottAccount,
} from "@/lib/auth-store";

export default function OrganizerProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const router = useRouter();
  const rawDecodedName = decodeURIComponent(name).trim();
  const organizerName = rawDecodedName || "Metro Creative Group";

  const [currentUser, setCurrentUser] = useState<SpottAccount | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [allEvents, setAllEvents] = useState<EventData[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "past">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [organizerProfile, setOrganizerProfile] = useState<OrganizerProfile>(() =>
    getOrganizerProfile(organizerName)
  );

  useEffect(() => {
    const syncProfile = () => {
      setOrganizerProfile(getOrganizerProfile(organizerName));
    };
    syncProfile();
    const unsub = subscribeToOrganizerProfile(syncProfile);
    return () => unsub();
  }, [organizerName]);

  const canEditProfile = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    const userOrg = (currentUser.organization || currentUser.name || "").toLowerCase().trim();
    const target = organizerName.toLowerCase().trim();
    if (userOrg.includes("metro creative") && target.includes("metro creative")) return true;
    return userOrg === target;
  }, [currentUser, organizerName]);

  // Sync Auth & Saves
  useEffect(() => {
    const syncUser = () => {
      const u = getCurrentUser();
      setCurrentUser(u);
      if (u) {
        setSavedIds(getUserSavedEvents(u.email));
      } else {
        setSavedIds([]);
      }
    };
    syncUser();
    window.addEventListener("spott_auth_changed", syncUser);
    return () => window.removeEventListener("spott_auth_changed", syncUser);
  }, []);

  // Sync Events
  useEffect(() => {
    const loadEvents = async () => {
      const stored = getStoredEvents();
      const combined = [...stored, ...DEFAULT_EVENTS];
      // Deduplicate by ID
      const seen = new Set<string>();
      const deduped: EventData[] = [];
      for (const ev of combined) {
        if (!seen.has(ev.id)) {
          seen.add(ev.id);
          deduped.push(ev);
        }
      }
      setAllEvents(deduped);

      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const apiData = await res.json();
          if (Array.isArray(apiData) && apiData.length > 0) {
            saveStoredEvents(apiData);
            const freshStored = getStoredEvents();
            const freshCombined = [...freshStored, ...DEFAULT_EVENTS, ...apiData];
            const s = new Set<string>();
            const d: EventData[] = [];
            for (const ev of freshCombined) {
              if (!s.has(ev.id)) {
                s.add(ev.id);
                d.push(ev);
              }
            }
            setAllEvents(d);
          }
        }
      } catch {}
    };

    loadEvents();
    const unsub = subscribeToEvents(loadEvents);
    return () => unsub();
  }, []);

  // Filter events belonging to this organizer
  const organizerEvents = useMemo(() => {
    const target = organizerName.toLowerCase().trim();
    const isMetro =
      target.includes("metro creative") ||
      target.includes("mcg") ||
      target === "metro creative group";

    return allEvents.filter((ev) => {
      const evOrg = (ev.organizer || "").toLowerCase().trim();
      if (isMetro) {
        return (
          !ev.organizer ||
          evOrg === "" ||
          evOrg.includes("metro creative") ||
          evOrg.includes("mcg")
        );
      }
      return evOrg === target;
    });
  }, [allEvents, organizerName]);

  // Verification status check
  const isVerified = useMemo(() => {
    const target = organizerName.toLowerCase().trim();
    const isMetro =
      target.includes("metro creative") ||
      target.includes("mcg") ||
      target === "metro creative group";

    // 1. Direct check in verification store
    const ver = getVerificationState(organizerName);
    if (ver && ver.status === "approved") return true;

    // 2. Metro Creative Group default verified status
    return isMetro;
  }, [organizerName]);

  // Accurate attendee calculations
  const stats = useMemo(() => {
    let totalAttendees = 0;
    let upcomingCount = 0;
    let pastCount = 0;
    const now = new Date();

    // Check guest list from localStorage
    let guestMap: Record<string, any[]> = {};
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("spott_guest_lists");
        if (raw) guestMap = JSON.parse(raw);
      } catch {}
    }

    organizerEvents.forEach((ev) => {
      const guests = Array.isArray(guestMap[ev.id]) ? guestMap[ev.id].length : 0;
      const baseRegs = ev.registrations || 0;
      totalAttendees += Math.max(guests, baseRegs);

      try {
        const evDate = new Date(ev.date.replace(" ", "T"));
        if (evDate >= now) {
          upcomingCount++;
        } else {
          pastCount++;
        }
      } catch {
        upcomingCount++;
      }
    });

    return {
      totalEvents: organizerEvents.length,
      upcomingCount,
      pastCount,
      totalAttendees,
    };
  }, [organizerEvents]);

  // Filtered list based on active tab and search query
  const displayedEvents = useMemo(() => {
    const now = new Date();
    return organizerEvents.filter((ev) => {
      // Tab filter
      if (activeTab === "upcoming") {
        try {
          const evDate = new Date(ev.date.replace(" ", "T"));
          if (evDate < now) return false;
        } catch {}
      } else if (activeTab === "past") {
        try {
          const evDate = new Date(ev.date.replace(" ", "T"));
          if (evDate >= now) return false;
        } catch {
          return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = ev.title.toLowerCase().includes(q);
        const matchesLoc = (ev.location || "").toLowerCase().includes(q);
        const matchesCat = (ev.categories || []).some((c) => c.toLowerCase().includes(q));
        if (!matchesTitle && !matchesLoc && !matchesCat) return false;
      }

      return true;
    });
  }, [organizerEvents, activeTab, searchQuery]);

  // Toggle Save handler for event cards
  const handleToggleSave = (eventId: string) => {
    if (!currentUser) return;
    const current = getUserSavedEvents(currentUser.email);
    let updated: string[];
    if (current.includes(eventId)) {
      updated = current.filter((id) => id !== eventId);
    } else {
      updated = [...current, eventId];
    }
    saveUserSavedEvents(updated, currentUser.email);
    setSavedIds(updated);
  };

  // Copy share profile link
  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Initials for avatar
  const initials = useMemo(() => {
    const parts = organizerName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [organizerName]);

  const isMetro =
    organizerName.toLowerCase().includes("metro creative") ||
    organizerName.toLowerCase().includes("mcg");

  return (
    <div className="min-h-screen bg-paper pb-20">
      {/* Top Header / Breadcrumb Bar */}
      <div className="border-b border-line bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            {currentUser?.role === "organizer" || canEditProfile ? (
              <Link
                href="/organizer?tab=profile"
                className="inline-flex items-center gap-1.5 font-bold text-[#ff6b35] hover:underline transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-[#ff6b35]" />
                <span>Back to Organizer Dashboard</span>
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 font-bold text-ink hover:text-accent transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-ink" />
                <span>Back to Home</span>
              </Link>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-line" />
            <Link
              href="/organizers"
              className="text-muted hover:text-accent font-medium transition-colors hover:underline"
            >
              Organizers
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-line" />
            <span className="font-semibold text-ink truncate max-w-[180px] md:max-w-xs">
              {organizerName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {canEditProfile && (
              <Link
                href="/organizer?tab=profile"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-xs font-bold text-[#ff6b35] hover:bg-orange-100 transition-all cursor-pointer shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#ff6b35]" />
                <span>Return to Dashboard</span>
              </Link>
            )}

            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-white text-xs font-semibold text-ink hover:border-accent hover:text-accent transition-all cursor-pointer shadow-2xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copiedLink ? "Link Copied" : "Share"}</span>
            </button>

            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-ink text-white text-xs font-bold hover:bg-black transition-all shadow-2xs"
            >
              Explore Home
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6 md:pt-8 space-y-8">
        {/* Organizer Hero Profile Card */}
        <div className="bg-white border border-line rounded-3xl p-6 md:p-8 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start md:items-center gap-4 md:gap-6">
              {/* Avatar Box */}
              <div className="relative shrink-0">
                <div className="w-18 h-18 md:w-22 md:h-22 rounded-2xl bg-gradient-to-br from-[#171717] via-[#262626] to-[#3a3a3a] text-white flex items-center justify-center font-extrabold text-2xl md:text-3xl tracking-wider shadow-md border border-white/10 overflow-hidden">
                  {organizerProfile.avatarUrl ? (
                    <img
                      src={organizerProfile.avatarUrl}
                      alt={organizerName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                {isVerified && (
                  <div
                    className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-md z-10 flex items-center justify-center"
                    title="Verified Organizer"
                  >
                    <CheckCircle2 className="w-5 h-5 text-[#14804a]" />
                  </div>
                )}
              </div>

              {/* Title & Badge */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight m-0">
                    {organizerName}
                  </h1>

                  {/* Verified Badge */}
                  {isVerified ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#14804a] border border-emerald-200/80 text-xs font-bold shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#14804a] shrink-0" />
                      <span>Verified Organizer</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 text-muted border border-gray-200 text-xs font-medium">
                      <Building2 className="w-3.5 h-3.5 text-muted shrink-0" />
                      <span>Community Organizer</span>
                    </span>
                  )}

                  {organizerProfile.category && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#fff0e8] text-[#ff6b35] border border-[#ff6b35]/20 text-xs font-bold shadow-2xs">
                      <span>{organizerProfile.category}</span>
                    </span>
                  )}
                </div>

                <p className="text-xs md:text-sm text-muted max-w-2xl leading-relaxed m-0">
                  {organizerProfile.caption ||
                    (isMetro
                      ? "Official creative collective and event production team creating vibrant cultural showcases, workshops, culinary pop-ups, and student community activations on Spott."
                      : "Community organizer on Spott hosting public gatherings, interactive workshops, and local cultural experiences.")}
                </p>

                <div className="flex items-center gap-3 pt-1 text-xs text-muted flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span>{organizerProfile.address || "Metro Manila, PH"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#14804a] shrink-0" />
                    <span>Spott Trusted Partner</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3 md:gap-4 border-t md:border-t-0 md:border-l border-line pt-4 md:pt-0 md:pl-8 shrink-0">
              <div className="bg-[#faf8f3] border border-line/60 rounded-2xl p-3.5 text-center min-w-[85px] md:min-w-[100px]">
                <div className="text-xl md:text-2xl font-black text-ink">
                  {stats.totalEvents}
                </div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mt-0.5">
                  Events
                </div>
              </div>

              <div className="bg-[#faf8f3] border border-line/60 rounded-2xl p-3.5 text-center min-w-[85px] md:min-w-[100px]">
                <div className="text-xl md:text-2xl font-black text-accent">
                  {stats.upcomingCount}
                </div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mt-0.5">
                  Upcoming
                </div>
              </div>

              <div className="bg-[#faf8f3] border border-line/60 rounded-2xl p-3.5 text-center min-w-[85px] md:min-w-[100px]">
                <div className="text-xl md:text-2xl font-black text-[#14804a]">
                  {stats.totalAttendees}
                </div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mt-0.5">
                  Attendees
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Events Section */}
        <div className="space-y-6">
          {/* Controls: Tabs & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink m-0 flex items-center gap-2">
                <span>Hosted Events</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-line/60 text-muted">
                  {displayedEvents.length}
                </span>
              </h2>
              <p className="text-xs text-muted mt-0.5 m-0">
                Explore all gatherings and activities hosted by {organizerName}.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Tab Pills */}
              <div className="inline-flex bg-white border border-line rounded-xl p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "all"
                      ? "bg-ink text-white shadow-2xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  All ({stats.totalEvents})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("upcoming")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "upcoming"
                      ? "bg-ink text-white shadow-2xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Upcoming ({stats.upcomingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("past")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "past"
                      ? "bg-ink text-white shadow-2xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Past ({stats.pastCount})
                </button>
              </div>

              {/* Search filter input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-line bg-white text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent w-40 md:w-52 shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Events Grid */}
          {displayedEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedEvents.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={{
                    ...ev,
                    isSaved: savedIds.includes(ev.id),
                  }}
                  variant="featured"
                  onSave={handleToggleSave}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-line rounded-3xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#faf8f3] border border-line flex items-center justify-center mx-auto text-muted">
                <Calendar className="w-6 h-6 text-muted" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-ink m-0">
                  {searchQuery ? "No matching events found" : "No events to display"}
                </h3>
                <p className="text-xs text-muted m-0">
                  {searchQuery
                    ? `No events match "${searchQuery}" for this organizer.`
                    : `This organizer has no ${activeTab === "all" ? "" : activeTab} events at this moment.`}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="px-3.5 py-2 rounded-xl border border-line text-xs font-bold text-ink hover:bg-[#faf8f3] transition-colors cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ink text-white text-xs font-bold hover:bg-black transition-all shadow-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Home</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
