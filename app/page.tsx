"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, MapPin } from "lucide-react";
import EventCard, { type EventData } from "@/components/EventCard";
import CategoryPills from "@/components/CategoryPills";

import { DEFAULT_EVENTS } from "@/lib/default-events";

const POPULAR_CATEGORIES = [
  "Music & Concerts",
  "Night Markets",
  "School Events",
  "Food & Drinks",
  "Art & Culture",
  "Workshops",
  "Sports & Fitness",
  "Tech",
  "Comedy",
  "Outdoor",
  "Networking",
];

const CATEGORIES = POPULAR_CATEGORIES;

export default function Home() {
  const router = useRouter();
  // Instant render from DEFAULT_EVENTS - zero buffering!
  const [events, setEvents] = useState<EventData[]>(DEFAULT_EVENTS);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("spott_saved_events");
      if (stored) setSavedIds(JSON.parse(stored).map(String));
    } catch {}
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setEvents(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim());
    }
    if (selectedCategory) {
      params.set("category", selectedCategory);
    }
    router.push(`/discover?${params.toString()}`);
  };

  const handleNearMeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim());
    }
    params.set("nearMe", "true");
    router.push(`/discover?${params.toString()}`);
  };

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    // Directly navigate and connect to the discover tab
    router.push(`/discover?category=${encodeURIComponent(cat)}`);
  };

  const handleToggleSave = (eventId: string) => {
    const isAlreadySaved = savedIds.includes(eventId);
    const updated = isAlreadySaved
      ? savedIds.filter((id) => id !== eventId)
      : [...savedIds, eventId];
    setSavedIds(updated);
    try {
      localStorage.setItem("spott_saved_events", JSON.stringify(updated));
      window.dispatchEvent(new Event("spott_saved_updated"));
    } catch {}
  };

  const featuredEvents = events.slice(0, 3);
  const upcomingEvents = events.length > 3 ? events.slice(3, 7) : events.slice(0, 4);

  return (
    <div className="bg-white min-h-screen">
      {/* 1. HERO SEARCH SECTION (Redesigned with Spott brand aesthetics from Pic 1 & integrated search from Pic 2) */}
      <section className="bg-[#faf6f0] border-b border-line relative overflow-hidden py-16 md:py-20 px-4 md:px-8">
        {/* Soft background peach circle on the right matching Pic 1 */}
        <div 
          className="absolute -right-12 md:right-12 top-1/2 -translate-y-1/2 w-72 h-72 md:w-96 md:h-96 rounded-full bg-[#ff6b35]/12 pointer-events-none blur-sm"
          aria-hidden="true"
        />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-3xl">
            {/* Subtitle / Tagline */}
            <p className="text-xs md:text-sm font-black tracking-widest text-muted uppercase mb-3">
              SPOTT • SPOTTING YOUR NEXT SPOT!
            </p>

            {/* Heading with 'near you.' in orange accent */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-ink leading-[1.08] mb-4">
              Find something<br />
              happening <span className="text-accent">near you.</span>
            </h1>

            {/* Description paragraph */}
            <p className="text-sm md:text-base text-muted max-w-xl mb-8 leading-relaxed">
              Discover local concerts, food markets, workshops, sports and community events in one place.
            </p>

            {/* Integrated Search Bar */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-col sm:flex-row items-stretch sm:items-center bg-white border border-line rounded-2xl p-2 shadow-sm max-w-2xl focus-within:ring-2 focus-within:ring-accent focus-within:border-accent gap-2"
            >
              <div className="flex items-center flex-1 px-3">
                <Search className="w-4 h-4 text-muted shrink-0 mr-2.5" />
                <input
                  type="text"
                  placeholder="Search events, categories, locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full py-2 text-sm text-ink outline-none bg-transparent placeholder:text-muted/70"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="submit"
                  className="bg-accent hover:bg-[#e0531b] text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  Explore events
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

      {/* 2. CATEGORY PILLS (Navigates directly to Discover tab with category filtered) */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-4">
        <CategoryPills
          categories={CATEGORIES}
          selected={selectedCategory}
          onSelect={handleCategorySelect}
        />
      </section>

      <main className="max-w-7xl mx-auto px-4 md:px-8 pb-16 space-y-12">
        {/* 3. FEATURED EVENTS SECTION */}
        <section className="pt-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-ink">Featured Events</h2>
            <Link
              href="/discover?filter=featured"
              className="text-sm font-bold text-ink hover:text-accent transition-colors no-underline flex items-center gap-1"
            >
              See all <ChevronRight className="w-4 h-4" />
            </Link>
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredEvents.map((event) => (
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

        {/* 4. UPCOMING NEAR YOU SECTION */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-ink">Upcoming Near You</h2>
            <Link
              href="/discover?sort=nearest"
              className="text-sm font-bold text-ink hover:text-accent transition-colors no-underline flex items-center gap-1"
            >
              See all <ChevronRight className="w-4 h-4" />
            </Link>
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
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
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

        {/* 5. EXPLORE EVENTS BUTTON (Direct connection to Discover tab) */}
        <div className="text-center pt-4 pb-8">
          <Link
            href="/discover"
            className="inline-block bg-dark hover:bg-accent text-white font-bold text-sm px-8 py-3.5 rounded-lg no-underline transition-colors shadow-sm"
          >
            Explore Events
          </Link>
        </div>
      </main>
    </div>
  );
}
