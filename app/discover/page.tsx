"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, MapPin, X } from "lucide-react";
import EventCard, { type EventData } from "@/components/EventCard";
import MapView from "@/components/MapView";
import { getStoredEvents } from "@/lib/events-store";

function DiscoverContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialCategory = searchParams.get("category") || "";
  const initialFilter = searchParams.get("filter") || "";
  const initialNearMe = searchParams.get("nearMe") === "true";

  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState(initialNearMe ? "nearest" : "nearest");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMapMobile, setShowMapMobile] = useState(false);

  const loadAllEvents = async () => {
    const local = getStoredEvents();
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const apiData = await res.json();
        if (Array.isArray(apiData)) {
          const existingIds = new Set(local.map((e) => e.id));
          const merged = [...local, ...apiData.filter((e: any) => !existingIds.has(e.id))];
          setEvents(merged);
          return;
        }
      }
    } catch {}
    setEvents(local);
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("spott_saved_events");
      if (stored) setSavedIds(JSON.parse(stored).map(String));
    } catch {}
    loadAllEvents();

    const handleUpdate = () => loadAllEvents();
    window.addEventListener("spott_events_updated", handleUpdate);
    return () => window.removeEventListener("spott_events_updated", handleUpdate);
  }, []);

  // Update when URL search parameters change
  useEffect(() => {
    if (searchParams.get("q") !== null) {
      setSearchQuery(searchParams.get("q") || "");
    }
    if (searchParams.get("category") !== null) {
      setSelectedCategory(searchParams.get("category") || "");
    }
  }, [searchParams]);

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setEvents(data);
      }
    } catch (error) {
      console.error("Error fetching events:", error);
    }
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

  // Filter events based on search and category
  let filteredEvents = events.filter((event) => {
    const matchesSearch =
      !searchQuery.trim() ||
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.categories.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCat =
      !selectedCategory ||
      event.categories.some((c) => c.toLowerCase() === selectedCategory.toLowerCase());

    return matchesSearch && matchesCat;
  });

  // Sort events
  if (sortBy === "price") {
    filteredEvents.sort((a, b) => a.price - b.price);
  } else if (sortBy === "date") {
    filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  const allCategories = [
    "All",
    "Music",
    "Sports",
    "Food",
    "Art",
    "Tech",
    "Comedy",
    "Night Markets",
    "School Events",
    "Concerts",
    "Workshops",
    "Community",
  ];

  return (
    <div className="h-[calc(100vh-72px)] flex flex-col bg-white">
      {/* 1. TOP SEARCH & FILTER BAR (from screen-discover wireframe) */}
      <div className="bg-white border-b border-line px-4 md:px-8 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search events, categories..."
            className="w-full pl-10 pr-4 py-2 border border-line rounded-lg text-sm bg-white focus:ring-2 focus:ring-accent focus:border-accent outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilterModal(!showFilterModal)}
          className={`flex items-center gap-1.5 px-4 py-2 border rounded-lg text-sm font-bold transition-colors cursor-pointer ${
            selectedCategory
              ? "bg-dark text-white border-dark"
              : "bg-white text-ink border-line hover:bg-gray-50"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>{selectedCategory ? selectedCategory : "Filters"}</span>
          {selectedCategory && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCategory("");
              }}
              className="ml-1 hover:text-red-300 text-xs"
            >
              ×
            </span>
          )}
        </button>
      </div>

      {/* Filter Category Modal / Dropdown */}
      {showFilterModal && (
        <div className="bg-[#faf8f3] border-b border-line p-4 px-4 md:px-8 flex flex-wrap gap-2 items-center animate-in slide-in-from-top-2 duration-150">
          <span className="text-xs font-bold text-muted mr-2">Filter by Category:</span>
          {allCategories.map((cat) => {
            const isSelected = (cat === "All" && !selectedCategory) || selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat === "All" ? "" : cat);
                  setShowFilterModal(false);
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-dark text-white border-dark"
                    : "bg-white text-ink border-line hover:border-accent hover:text-accent"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. DUAL-PANEL CONTENT (from screen-discover wireframe) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Events List */}
        <div
          className={`${
            showMapMobile ? "hidden lg:block" : "block"
          } w-full lg:w-[460px] xl:w-[500px] border-r border-line overflow-y-auto bg-white flex flex-col`}
        >
          {/* Results Header */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-line bg-white sticky top-0 z-10">
            <span className="text-sm font-bold text-ink">
              {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} found
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-xs font-bold bg-transparent border border-line rounded px-2 py-1 cursor-pointer text-ink outline-none"
              >
                <option value="nearest">Nearest ▼</option>
                <option value="date">Date</option>
                <option value="price">Price</option>
              </select>
            </div>
          </div>

          {/* Cards List */}
          <div className="p-4 space-y-3 flex-1">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white border border-line rounded-2xl p-4 h-36 animate-pulse" />
              ))
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-16 text-muted">
                <p className="font-bold text-sm">No events match your criteria.</p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("");
                  }}
                  className="mt-3 text-xs font-bold text-accent hover:underline cursor-pointer"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => setSelectedEventId(event.id)}
                  className={`cursor-pointer rounded-2xl transition-all ${
                    selectedEventId === event.id ? "ring-2 ring-accent" : ""
                  }`}
                >
                  <EventCard
                    event={{
                      ...event,
                      isSaved: savedIds.includes(event.id),
                    }}
                    variant="discover"
                    onSave={(id: string) => handleToggleSave(id)}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Map View */}
        <div className={`${showMapMobile ? "block" : "hidden lg:block"} flex-1 relative p-3 bg-[#f8fafc]`}>
          {/* Top Right "Near me" Button from wireframe */}
          <button
            onClick={() => {
              setSortBy("nearest");
              alert("Location centered: showing nearest events near you!");
            }}
            className="absolute top-6 right-6 z-20 bg-white text-ink px-4 py-2 rounded-md text-xs font-bold shadow-md border border-line hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5 text-accent" /> Near me
          </button>

          <MapView
            events={filteredEvents}
            selectedEventId={selectedEventId}
            onSelectEvent={(e) => setSelectedEventId(e.id)}
          />
        </div>
      </div>

      {/* Mobile Map/List Toggle Button */}
      <button
        onClick={() => setShowMapMobile(!showMapMobile)}
        className="lg:hidden fixed bottom-6 right-6 bg-dark text-white px-5 py-3 rounded-full text-sm font-bold shadow-lg z-30 hover:bg-ink transition-colors cursor-pointer flex items-center gap-2"
      >
        <MapPin className="w-4 h-4" />
        {showMapMobile ? "Show List" : "Map view (detailed)"}
      </button>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-72px)] flex items-center justify-center text-muted font-bold">
          Loading Discover...
        </div>
      }
    >
      <DiscoverContent />
    </Suspense>
  );
}
