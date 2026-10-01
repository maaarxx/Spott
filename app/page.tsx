"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Search,
  MapPin,
  Calendar,
  Filter,
  ArrowLeft,
  SlidersHorizontal,
  Sparkles,
  X,
  Users,
  Compass,
  Building2,
  ArrowUpDown,
  CheckCircle2,
} from "lucide-react";
import EventCard, { type EventData } from "@/components/EventCard";
import CategoryPills from "@/components/CategoryPills";
import { getStoredEvents, subscribeToEvents, saveStoredEvents, useStoredEvents } from "@/lib/events-store";
import { syncNotificationsForEvents } from "@/lib/notifications-store";
import { getRecommendedFeaturedEvents } from "@/lib/featured-recommendation";
import { getCurrentUser, getUserSavedEvents, saveUserSavedEvents } from "@/lib/auth-store";
import {
  getAllOrganizersList,
  subscribeToOrganizerProfile,
  OrganizerProfile,
} from "@/lib/organizer-store";
import { getAllCategories, matchesCategory, matchesSearchQuery, matchesDirectText, DEFAULT_APP_CATEGORIES } from "@/lib/categories";

export default function Home() {
  const [nowTime] = useState(() => Date.now() - 2 * 60 * 60 * 1000);
  const router = useRouter();
  const storedEvents = useStoredEvents();
  const [remoteEvents, setRemoteEvents] = useState<EventData[]>([]);
  const events = useMemo(() => {
    const merged = new Map(storedEvents.map((event) => [event.id, event]));
    remoteEvents.forEach((event) => {
      if (!merged.has(event.id)) merged.set(event.id, event);
    });
    return [...merged.values()];
  }, [storedEvents, remoteEvents]);
  const [loading, setLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>(DEFAULT_APP_CATEGORIES);
  const [organizers, setOrganizers] = useState<
    Array<OrganizerProfile & { eventCount: number; isVerified: boolean }>
  >([]);

  // Navigation / View state within Home tab
  const [viewMode, setViewMode] = useState<"overview" | "all">("overview");

  // Filtering states on Home
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "weekend" | "month">("all");
  const [selectedOrganizer, setSelectedOrganizer] = useState("all");
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "paid">("all");
  const [sortBy, setSortBy] = useState<"recommended" | "soonest" | "popular">("recommended");
  const [filterFeaturedOnly, setFilterFeaturedOnly] = useState(false);
  const [nearMeOnly, setNearMeOnly] = useState(false);

  const isSearchOrNearMe = Boolean(searchQuery.trim() || nearMeOnly);
  const isViewAllEvents = viewMode === "all" && !isSearchOrNearMe;

  useEffect(() => {
    let active = true;
    fetch("/api/events")
      .then((res) => (res.ok ? res.json() : []))
      .then((apiData: EventData[]) => {
        if (!active || !Array.isArray(apiData) || apiData.length === 0) return;
        saveStoredEvents(apiData, false);
        syncNotificationsForEvents(apiData);
        setRemoteEvents(apiData);
      })
      .catch(() => {});

    const syncSaved = () => {
      const user = getCurrentUser();
      if (!user) {
        setSavedIds([]);
        return;
      }
      setSavedIds(getUserSavedEvents(user.email));
    };

    syncSaved();

    window.addEventListener("spott_saved_updated", syncSaved);
    window.addEventListener("spott_auth_changed", syncSaved);
    window.addEventListener("storage", syncSaved);

    return () => {
      active = false;
      window.removeEventListener("spott_saved_updated", syncSaved);
      window.removeEventListener("spott_auth_changed", syncSaved);
      window.removeEventListener("storage", syncSaved);
    };
  }, []);

  useEffect(() => {
    const syncOrganizers = () => {
      setOrganizers(getAllOrganizersList());
    };
    syncOrganizers();
    const unsubProfile = subscribeToOrganizerProfile(syncOrganizers);
    const unsubEvents = subscribeToEvents(syncOrganizers);
    return () => {
      unsubProfile();
      unsubEvents();
    };
  }, [events]);

  useEffect(() => {
    const syncCats = () => {
      setCategoriesList(getAllCategories(events));
    };
    syncCats();
    window.addEventListener("spott_categories_updated", syncCats);
    return () => window.removeEventListener("spott_categories_updated", syncCats);
  }, [events]);

  const handleToggleSave = (eventId: string) => {
    const user = getCurrentUser();
    if (!user) {
      router.push(`/login?redirect=/events/${eventId}`);
      return;
    }
    const isAlreadySaved = savedIds.includes(eventId);
    const updated = isAlreadySaved
      ? savedIds.filter((id) => id !== eventId)
      : [...savedIds, eventId];
    setSavedIds(updated);
    saveUserSavedEvents(updated, user.email);
  };

  // Derive distinct organizers from active events
  const distinctOrganizers = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.organizer && e.organizer.trim()) {
        set.add(e.organizer.trim());
      }
    });
    return Array.from(set);
  }, [events]);

  // Derive user's category preferences from saved items
  const userInterests = useMemo(() => {
    return Array.from(
      new Set(
        events
          .filter((e) => savedIds.includes(e.id))
          .flatMap((e) => e.categories || [])
      )
    );
  }, [events, savedIds]);

  // FEATURED RECOMMENDATION ALGORITHM (30% Pop, 25% Recency, 20% Relevance, 15% Trending, 10% Newness)
  const scoredFeatured = useMemo(() => {
    return getRecommendedFeaturedEvents(events, savedIds, {
      limit: 6,
      userInterests,
      maxPerCategory: 2,
    });
  }, [events, savedIds, userInterests]);

  const top3FeaturedEvents = useMemo(() => {
    return scoredFeatured.slice(0, 3).map((s) => s.event);
  }, [scoredFeatured]);

  const allFeaturedEvents = useMemo(() => {
    return scoredFeatured.map((s) => s.event);
  }, [scoredFeatured]);

  // Upcoming near user (sorted chronologically)
  const upcomingNearEvents = useMemo(() => {
    return events
      .filter((e) => {
        const t = new Date(e.date.replace(" ", "T")).getTime();
        return !isNaN(t) && t >= nowTime;
      })
      .sort(
        (a, b) =>
          new Date(a.date.replace(" ", "T")).getTime() -
          new Date(b.date.replace(" ", "T")).getTime()
      );
  }, [events]);

  // Filtered events when searching or browsing all events on Home
  const filteredEvents = useMemo(() => {
    let pool = [...events];

    // If filtering by featured only
    if (filterFeaturedOnly) {
      const featIds = new Set(allFeaturedEvents.map((f) => f.id));
      pool = pool.filter((e) => featIds.has(e.id));
    }

    // Category filter: applies unless the event has a direct keyword match in address, venue, or title
    if (selectedCategory && selectedCategory !== "All") {
      pool = pool.filter((e) => {
        if (matchesCategory(e.categories || e.category, selectedCategory)) {
          return true;
        }
        // Direct keyword match in address, venue, or title should not be hidden
        if (searchQuery.trim() && matchesDirectText(e, searchQuery)) {
          return true;
        }
        return false;
      });
    }

    // Search Query (Title, description, venue, address, organizer, categories, synonyms)
    if (searchQuery.trim()) {
      pool = pool.filter((e) => matchesSearchQuery(e, searchQuery));
    }

    // Date Filter
    if (dateFilter !== "all") {
      const now = new Date();
      pool = pool.filter((e) => {
        const d = new Date(e.date.replace(" ", "T"));
        if (isNaN(d.getTime())) return true;
        if (dateFilter === "today") {
          return d.toDateString() === now.toDateString();
        }
        if (dateFilter === "weekend") {
          const day = d.getDay();
          return day === 0 || day === 6; // Sunday or Saturday
        }
        if (dateFilter === "month") {
          return (
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          );
        }
        return true;
      });
    }

    // Organizer Filter
    if (selectedOrganizer !== "all") {
      pool = pool.filter((e) => e.organizer === selectedOrganizer);
    }

    // Price Filter
    if (priceFilter === "free") {
      pool = pool.filter((e) => Number(e.price) === 0);
    } else if (priceFilter === "paid") {
      pool = pool.filter((e) => Number(e.price) > 0);
    }

    // Near Me Filter: Show upcoming events happening near user
    if (nearMeOnly) {
      pool = pool.filter((e) => {
        const t = new Date(e.date.replace(" ", "T")).getTime();
        return !isNaN(t) && t >= nowTime;
      });
    }

    // Sort order
    if (sortBy === "soonest") {
      pool.sort(
        (a, b) =>
          new Date(a.date.replace(" ", "T")).getTime() -
          new Date(b.date.replace(" ", "T")).getTime()
      );
    } else if (sortBy === "popular") {
      pool.sort((a, b) => (b.registrations || 0) - (a.registrations || 0));
    }

    return pool;
  }, [
    events,
    filterFeaturedOnly,
    allFeaturedEvents,
    selectedCategory,
    searchQuery,
    dateFilter,
    selectedOrganizer,
    priceFilter,
    sortBy,
    nearMeOnly,
  ]);

  // Click on a category pill: filters directly on Home!
  const handleCategorySelect = (cat: string) => {
    if (selectedCategory === cat) {
      setSelectedCategory("");
    } else {
      setSelectedCategory(cat);
      // Switch view to show matching events right on Home
      setViewMode("all");
      setFilterFeaturedOnly(false);
    }
  };

  // Search submit on Home
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedCategory("");
    setNearMeOnly(false);
    setViewMode("all");
    setFilterFeaturedOnly(false);
    window.scrollTo({ top: 380, behavior: "smooth" });
  };

  // Near me button click on Home: Navigate to discover with location map
  const handleNearMeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push("/discover?nearMe=true");
  };

  // "See all" on Featured Events
  const handleSeeAllFeatured = (e: React.MouseEvent) => {
    e.preventDefault();
    setFilterFeaturedOnly(true);
    setSelectedCategory("");
    setDateFilter("all");
    setViewMode("all");
    window.scrollTo({ top: 400, behavior: "smooth" });
  };

  // "See all" on Upcoming Near You
  const handleSeeAllUpcoming = (e: React.MouseEvent) => {
    e.preventDefault();
    setFilterFeaturedOnly(false);
    setSortBy("soonest");
    setViewMode("all");
    window.scrollTo({ top: 400, behavior: "smooth" });
  };

  // Reset / Clear all filters
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("");
    setDateFilter("all");
    setSelectedOrganizer("all");
    setPriceFilter("all");
    setSortBy("recommended");
    setFilterFeaturedOnly(false);
    setNearMeOnly(false);
  };

  return (
    <div className="bg-white min-h-screen">
      {/* 1. HERO SEARCH SECTION */}
      <section className="bg-[#faf6f0] border-b border-line relative overflow-hidden py-14 md:py-18 px-4 md:px-8">
        <div
          className="absolute -right-12 md:right-12 top-1/2 -translate-y-1/2 w-72 h-72 md:w-96 md:h-96 rounded-full bg-[#ff6b35]/12 pointer-events-none blur-sm"
          aria-hidden="true"
        />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-3xl">
            <p className="text-xs md:text-sm font-black tracking-widest text-muted uppercase mb-3">
              SPOTT • SPOTTING YOUR NEXT SPOT!
            </p>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-ink leading-[1.08] mb-4">
              Events happening <span className="text-[#ff6b35]">near you.</span>
            </h1>

            <p className="text-sm md:text-base text-muted font-medium mb-8 leading-relaxed max-w-xl">
              Discover verified campus activities, live performances, exhibitions,
              and workshops right across Metro Manila and university districts.
            </p>

            {/* Integrated Search Bar: filters right on Home */}
            <form onSubmit={handleSearchSubmit} className="relative max-w-2xl">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 bg-white rounded-2xl border border-line shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all">
                <div className="flex items-center gap-2 px-3 flex-1">
                  <Search className="w-5 h-5 text-muted shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by event, artist, venue, or address..."
                    className="w-full bg-transparent text-ink placeholder:text-muted/70 text-sm font-medium focus:outline-none py-2"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-muted hover:text-ink text-xs p-1"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="bg-accent hover:bg-accent-hover text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={handleNearMeClick}
                  className="bg-dark hover:bg-ink text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <MapPin className="w-3.5 h-3.5 text-accent" /> Near Me
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* 2. CATEGORY PILLS: Filter directly on Home */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 pt-6 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-muted uppercase tracking-wider">
            Filter by Category
          </span>
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory("")}
              className="text-xs font-bold text-[#ff6b35] hover:underline cursor-pointer"
            >
              Clear Category Filter
            </button>
          )}
        </div>
        <CategoryPills
          categories={categoriesList}
          selected={selectedCategory}
          onSelect={handleCategorySelect}
        />
      </section>

      {/* 3. MAIN CONTENT: OVERVIEW MODE vs ALL EVENTS DIRECTORY */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 pb-16 space-y-12">
        {viewMode === "overview" && !selectedCategory && !searchQuery.trim() ? (
          <>
            {/* 3.A FEATURED EVENTS SECTION (Powered by Recommendation Algorithm) */}
            <section className="pt-4">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-ink flex items-center gap-2">
                    <span>Featured Events</span>
                    <span className="text-xs font-bold text-[#ff6b35] bg-[#fff0e8] border border-[#ff6b35]/20 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#ff6b35]" />
                      <span>Top Picks</span>
                    </span>
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Recommended based on popularity, recency, and trending activity
                  </p>
                </div>
                <button
                  onClick={handleSeeAllFeatured}
                  className="text-sm font-bold text-ink hover:text-accent transition-colors cursor-pointer flex items-center gap-1"
                >
                  See all <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-white border border-line rounded-2xl overflow-hidden p-4 space-y-3"
                    >
                      <div className="h-44 bg-gray-100 animate-pulse rounded-xl" />
                      <div className="h-4 bg-gray-100 animate-pulse rounded w-1/3" />
                      <div className="h-5 bg-gray-100 animate-pulse rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : top3FeaturedEvents.length === 0 ? (
                <div className="bg-[#faf8f3] border border-dashed border-[#e6e1d8] rounded-2xl p-10 text-center">
                  <Sparkles className="w-8 h-8 text-[#ff6b35]/60 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-ink">No featured events right now</h3>
                  <p className="text-xs text-muted max-w-sm mx-auto mt-1">
                    Newly published campus events will be dynamically recommended here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {top3FeaturedEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={{
                        ...event,
                        isSaved: savedIds.includes(event.id),
                      }}
                      variant="featured"
                      onSave={handleToggleSave}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 3.B UPCOMING NEAR YOU SECTION */}
            <section>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-ink flex items-center gap-2">
                    <span>Upcoming Near You</span>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-600" />
                      <span>Metro Manila</span>
                    </span>
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Chronologically organized for your upcoming schedule
                  </p>
                </div>
                <button
                  onClick={handleSeeAllUpcoming}
                  className="text-sm font-bold text-ink hover:text-accent transition-colors cursor-pointer flex items-center gap-1"
                >
                  See all <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-white border border-line rounded-2xl p-4 h-24 animate-pulse"
                    />
                  ))}
                </div>
              ) : upcomingNearEvents.length === 0 ? (
                <div className="bg-[#faf8f3] border border-dashed border-[#e6e1d8] rounded-2xl p-10 text-center">
                  <MapPin className="w-8 h-8 text-muted/50 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-ink">
                    No upcoming events scheduled
                  </h3>
                  <p className="text-xs text-muted max-w-sm mx-auto mt-1">
                    Stay tuned! Newly published events near your campus will appear here in real-time.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingNearEvents.slice(0, 4).map((event) => (
                    <EventCard
                      key={event.id}
                      event={{
                        ...event,
                        isSaved: savedIds.includes(event.id),
                      }}
                      variant="list"
                      onSave={handleToggleSave}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 3.B ORGANIZERS SECTION (Square Cards with See All) */}
            {organizers.length > 0 && (
              <section className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl md:text-2xl font-extrabold text-ink tracking-tight flex items-center gap-2">
                      <span>Organizers</span>
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      Accredited campus clubs, creative collectives, and community partners
                    </p>
                  </div>
                  <Link
                    href="/organizers"
                    className="text-xs font-bold text-ink hover:text-accent flex items-center gap-1 transition-colors group cursor-pointer"
                  >
                    <span>See all</span>
                    <ChevronRight className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
                  </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                  {organizers.slice(0, 6).map((org) => {
                    const initials =
                      org.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase() || "OR";

                    return (
                      <Link
                        key={org.name}
                        href={`/organizers/${encodeURIComponent(org.name)}`}
                        className="group bg-white border border-line rounded-2xl p-4 flex flex-col items-center justify-between text-center aspect-square hover:border-accent/40 hover:shadow-md hover:-translate-y-1 transition-all select-none cursor-pointer relative overflow-hidden"
                      >
                        {/* Avatar / Logo */}
                        <div className="relative shrink-0 group-hover:scale-105 transition-transform">
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#171717] via-[#262626] to-[#3a3a3a] text-white flex items-center justify-center font-extrabold text-base sm:text-lg tracking-wider shadow-xs overflow-hidden">
                            {org.avatarUrl ? (
                              <img
                                src={org.avatarUrl}
                                alt={org.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{initials}</span>
                            )}
                          </div>
                          {org.isVerified && (
                            <div
                              className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-md z-10 flex items-center justify-center"
                              title="Verified Organizer"
                            >
                              <CheckCircle2 className="w-4 h-4 text-[#14804a]" />
                            </div>
                          )}
                        </div>

                        {/* Organizer Name & Event Count */}
                        <div className="w-full space-y-0.5 mt-2">
                          <span className="font-bold text-xs sm:text-sm text-ink group-hover:text-accent transition-colors line-clamp-1 block">
                            {org.name}
                          </span>
                          <span className="text-[11px] text-muted font-medium block truncate">
                            {org.eventCount} event{org.eventCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 3.C VIEW ALL EVENTS BUTTON: Opens full directory on Home */}
            <div className="text-center pt-4 pb-8">
              <button
                onClick={() => {
                  setViewMode("all");
                  resetFilters();
                  window.scrollTo({ top: 400, behavior: "smooth" });
                }}
                className="bg-dark hover:bg-accent text-white font-bold text-sm px-8 py-3.5 rounded-xl transition-all shadow-sm cursor-pointer inline-flex items-center gap-2 group"
              >
                <Compass className="w-4 h-4 group-hover:rotate-45 transition-transform" />
                <span>View All Events</span>
              </button>
            </div>
          </>
        ) : (
          /* ========================================================================= */
          /* 4. FULL "VIEW ALL EVENTS" IN-PAGE DIRECTORY (STAYS IN HOME TAB)            */
          /* ========================================================================= */
          <div className="space-y-6 pt-4">
            {/* Header with Back button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
              <div>
                <button
                  onClick={() => {
                    setViewMode("overview");
                    resetFilters();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#666666] hover:text-[#ff6b35] transition-colors cursor-pointer mb-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Home Overview</span>
                </button>
                <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight flex items-center gap-2.5">
                  <span>
                    {nearMeOnly
                      ? "Events Near You"
                      : searchQuery.trim() && selectedCategory
                      ? `${selectedCategory} • Search: "${searchQuery}"`
                      : searchQuery.trim()
                      ? `Search: "${searchQuery}"`
                      : filterFeaturedOnly
                      ? "Featured Recommendations"
                      : selectedCategory
                      ? `${selectedCategory} Events`
                      : "All Events"}
                  </span>
                  <span className="text-xs font-bold bg-[#faf8f3] text-muted border border-[#e6e1d8] px-2.5 py-0.5 rounded-full">
                    {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
                  </span>
                </h2>
              </div>

              {/* Clear All Filters button: Only shown when browsing All Events */}
              {isViewAllEvents &&
                (selectedCategory ||
                  dateFilter !== "all" ||
                  selectedOrganizer !== "all" ||
                  priceFilter !== "all") && (
                  <button
                    onClick={resetFilters}
                    className="text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl transition-colors cursor-pointer self-start sm:self-auto inline-flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear All Filters</span>
                  </button>
                )}
            </div>

            {/* Minimalist Filter Toolbar: Only shown when browsing All Events */}
            {isViewAllEvents && (
              <div className="bg-white border border-line rounded-2xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  {/* Date Filter Pill */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-paper border border-line text-xs font-semibold text-ink">
                    <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
                      className="bg-transparent text-xs font-bold text-ink focus:outline-none cursor-pointer pr-1"
                      title="Filter by date"
                    >
                      <option value="all">All Dates</option>
                      <option value="today">Today</option>
                      <option value="weekend">This Weekend</option>
                      <option value="month">This Month</option>
                    </select>
                  </div>

                  {/* Organizer Filter Pill */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-paper border border-line text-xs font-semibold text-ink max-w-[200px] sm:max-w-[240px]">
                    <Building2 className="w-3.5 h-3.5 text-accent shrink-0" />
                    <select
                      value={selectedOrganizer}
                      onChange={(e) => setSelectedOrganizer(e.target.value)}
                      className="bg-transparent text-xs font-bold text-ink focus:outline-none cursor-pointer truncate pr-1"
                      title="Filter by organizer"
                    >
                      <option value="all">All Organizers</option>
                      {distinctOrganizers.map((org) => (
                        <option key={org} value={org}>
                          {org}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Price Filter Pill */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-paper border border-line text-xs font-semibold text-ink">
                    <span className="shrink-0 font-black text-accent">₱</span>
                    <select
                      value={priceFilter}
                      onChange={(e) => setPriceFilter(e.target.value as typeof priceFilter)}
                      className="bg-transparent text-xs font-bold text-ink focus:outline-none cursor-pointer pr-1"
                      title="Filter by price"
                    >
                      <option value="all">All Prices</option>
                      <option value="free">Free Entry</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                </div>

                {/* Sort Ranking Pill */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-paper border border-line text-xs font-semibold text-ink shrink-0">
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted shrink-0" />
                  <span className="text-[11px] text-muted font-normal hidden md:inline">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="bg-transparent text-xs font-bold text-ink focus:outline-none cursor-pointer pr-1"
                    title="Sort events"
                  >
                    <option value="recommended">Recommended</option>
                    <option value="soonest">Soonest</option>
                    <option value="popular">Most Popular</option>
                  </select>
                </div>
              </div>
            )}



            {/* Results Grid */}
            {filteredEvents.length === 0 ? (
              <div className="bg-[#faf8f3] border border-dashed border-[#e6e1d8] rounded-2xl p-12 text-center space-y-3">
                <Search className="w-8 h-8 text-muted mx-auto" />
                <h3 className="text-base font-bold text-ink">No events match your active filters</h3>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  Try clearing some filter options or changing your search terms to discover more events.
                </p>
                <button
                  onClick={resetFilters}
                  className="text-xs font-bold bg-[#ff6b35] text-white px-4 py-2 rounded-xl hover:bg-[#e0531f] transition-all cursor-pointer shadow-xs inline-block"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={{
                      ...event,
                      isSaved: savedIds.includes(event.id),
                    }}
                    variant="discover"
                    onSave={handleToggleSave}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
