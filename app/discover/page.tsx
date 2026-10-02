"use client";

import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, MapPin, X, ChevronDown, Check } from "lucide-react";
import EventCard, { type EventData } from "@/components/EventCard";
import MapView from "@/components/MapView";
import { useStoredEvents } from "@/lib/events-store";
import { loadPublicEvents } from "@/lib/events-store";
import { getCurrentUser } from "@/lib/auth-store";
import { loadSavedEventIds, toggleSavedEvent } from "@/lib/saved-events-client";
import { getAllCategories, matchesCategory, matchesSearchQuery, matchesDirectText, syncCategoriesFromDatabase } from "@/lib/categories";

const RADIUS_OPTIONS = [
  { label: "1 kilometer", value: 1 },
  { label: "2 kilometers", value: 2 },
  { label: "5 kilometers", value: 5 },
  { label: "10 kilometers", value: 10 },
  { label: "19 kilometers", value: 19 },
  { label: "20 kilometers", value: 20 },
  { label: "40 kilometers", value: 40 },
  { label: "60 kilometers", value: 60 },
  { label: "80 kilometers", value: 80 },
  { label: "100 kilometers", value: 100 },
  { label: "250 kilometers", value: 250 },
  { label: "500 kilometers", value: 500 },
];

function DiscoverContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialCategory = searchParams.get("category") || "";
  const initialFilter = searchParams.get("filter") || "";
  const initialNearMe = searchParams.get("nearMe") === "true";

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
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState(initialNearMe ? "nearest" : "nearest");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMapMobile, setShowMapMobile] = useState(false);
  const [categoriesList, setCategoriesList] = useState<string[]>(["All"]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedRadius, setSelectedRadius] = useState<number | null>(null);
  const [showRadiusDropdown, setShowRadiusDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(initialNearMe);
  const [locationNotice, setLocationNotice] = useState<string | null>(
    initialNearMe ? "Requesting device location permission to find events near you..." : null
  );

  const mapRadiusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (mapRadiusDropdownRef.current && !mapRadiusDropdownRef.current.contains(target)) {
        setShowRadiusDropdown(false);
      }
    };
    if (showRadiusDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showRadiusDropdown]);

  useEffect(() => {
    let active = true;
    loadPublicEvents()
      .then((apiData: EventData[]) => {
        if (!active || !Array.isArray(apiData)) return;
        setRemoteEvents(apiData.map((event) => ({
          ...event,
          categories: Array.isArray(event.categories) ? event.categories : [event.category || "Community"].filter(Boolean),
          latitude: typeof event.latitude === "string" ? parseFloat(event.latitude) : event.latitude,
          longitude: typeof event.longitude === "string" ? parseFloat(event.longitude) : event.longitude,
        })));
      })
      .catch(() => {});

    const syncSaved = () => {
      const user = getCurrentUser();
      if (!user) {
        setSavedIds([]);
        return;
      }
      void loadSavedEventIds().then(setSavedIds).catch(() => setSavedIds([]));
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
    const syncCats = () => {
      setCategoriesList(["All", ...getAllCategories(events)]);
    };
    syncCats();
    window.addEventListener("spott_categories_updated", syncCats);
    return () => window.removeEventListener("spott_categories_updated", syncCats);
  }, [events]);

  useEffect(() => {
    void syncCategoriesFromDatabase().catch(() => {});
  }, []);

  const handleToggleSave = async (eventId: string) => {
    const user = getCurrentUser();
    if (!user) {
      router.push(`/login?redirect=/events/${eventId}`);
      return;
    }
    const isAlreadySaved = savedIds.includes(eventId);
    try {
      const saved = await toggleSavedEvent(eventId);
      setSavedIds((ids) => saved ? [...new Set([...ids, eventId])] : ids.filter((id) => id !== eventId));
    } catch (error) {
      console.error(error);
    }
  };

  // Haversine distance calculator in km
  function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const refLat = userLocation?.lat ?? 14.5547;
  const refLng = userLocation?.lng ?? 121.0244;

  // Filter events based on search, category, and radius
  const filteredEvents = events.filter((event) => {
    const categories = Array.isArray(event.categories) ? event.categories : [];
    const matchesSearch = matchesSearchQuery(event, searchQuery);
    const hasDirectMatch = searchQuery.trim() ? matchesDirectText(event, searchQuery) : false;

    const matchesCat =
      !selectedCategory ||
      matchesCategory(categories, selectedCategory) ||
      hasDirectMatch;

    if (!matchesSearch || !matchesCat) return false;

    // Radius filter
    if (selectedRadius) {
      const dist = getDistanceKm(
        refLat,
        refLng,
        event.latitude || 14.5995,
        event.longitude || 120.9842
      );
      if (dist > selectedRadius) {
        return false;
      }
    }

    return true;
  });

  // Sort events
  if (sortBy === "nearest") {
    filteredEvents.sort((a, b) => {
      const distA = getDistanceKm(refLat, refLng, a.latitude || 14.5995, a.longitude || 120.9842);
      const distB = getDistanceKm(refLat, refLng, b.latitude || 14.5995, b.longitude || 120.9842);
      return distA - distB;
    });
  } else if (sortBy === "price") {
    filteredEvents.sort((a, b) => a.price - b.price);
  } else if (sortBy === "date") {
    filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  const requestUserLocation = (onSuccess?: (coords: { lat: number; lng: number }) => void) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setLocationNotice("Requesting device location permission to find events near you...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setSortBy("nearest");
        setLocationNotice("✓ Location enabled: Showing events closest to you!");
        setTimeout(() => setLocationNotice(null), 4000);
        onSuccess?.(coords);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          setLocationNotice("Location permission denied. Showing events from standard Manila baseline.");
        } else {
          setLocationNotice("Could not determine your location. Showing events from standard Manila baseline.");
        }
        setTimeout(() => setLocationNotice(null), 5000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const handleNearMeClick = () => {
    if (userLocation) {
      // Toggle off
      setUserLocation(null);
      setSelectedRadius(null);
      setLocationNotice(null);
      return;
    }
    requestUserLocation();
  };

  const handleSelectRadius = (value: number | null) => {
    setSelectedRadius(value);
    setShowRadiusDropdown(false);
    if (value !== null && !userLocation) {
      requestUserLocation();
    }
  };

  useEffect(() => {
    if (!initialNearMe) return;
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setIsLocating(false);
        setUserLocation(coords);
        setSortBy("nearest");
        setLocationNotice("✓ Location enabled: Showing events closest to you!");
        setTimeout(() => setLocationNotice(null), 4000);
      },
      (error) => {
        setIsLocating(false);
        setLocationNotice(error.code === 1
          ? "Location permission denied. Showing events from standard Manila baseline."
          : "Could not determine your location. Showing events from standard Manila baseline.");
        setTimeout(() => setLocationNotice(null), 5000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [initialNearMe]);

  // Radius Dropdown Component matching exact user reference styling
  const radiusDropdownMenu = (
    <div className="absolute right-0 top-full mt-2 w-60 bg-[#1c1f22] border border-[#2b3036] rounded-xl shadow-2xl py-1.5 z-50 text-[#e2e8f0] animate-in fade-in zoom-in-95 duration-150">
      <div className="max-h-72 overflow-y-auto">
        {selectedRadius !== null && (
          <button
            type="button"
            onClick={() => handleSelectRadius(null)}
            className="w-full text-left px-4 py-2 text-xs font-bold text-muted hover:text-white hover:bg-[#282d32] border-b border-[#2b3036] cursor-pointer flex items-center justify-between transition-colors"
          >
            <span>Any Distance (Clear)</span>
            <X className="w-3.5 h-3.5 text-muted hover:text-red-400" />
          </button>
        )}
        {RADIUS_OPTIONS.map((opt) => {
          const isSelected = selectedRadius === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelectRadius(opt.value)}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-between cursor-pointer ${
                isSelected
                  ? "bg-[#2d3236] text-white"
                  : "text-[#d1d5db] hover:bg-[#282d32] hover:text-white"
              }`}
            >
              <span>{opt.label}</span>
              {isSelected && (
                <svg
                  className="w-4 h-4 text-[#38bdf8]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-72px)] flex flex-col bg-white">
      {/* 1. TOP SEARCH & FILTER BAR */}
      <div className="bg-white border-b border-line px-4 md:px-8 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            maxLength={50}
            placeholder="Search events, categories..."
            className="w-full pl-10 pr-4 py-2 border border-line rounded-lg text-sm bg-white focus:ring-2 focus:ring-accent focus:border-accent outline-none"
            value={searchQuery}
            onChange={(e) => {
              // limit consecutive repeating characters to max 4 to prevent gibberish spam
              const val = e.target.value.replace(/(.)\1{4,}/g, '$1$1$1$1');
              setSearchQuery(val);
            }}
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

        {/* Category Filters Button */}
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
          {categoriesList.map((cat) => {
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

      {/* 2. DUAL-PANEL CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Events List */}
        <div
          className={`${
            showMapMobile ? "hidden lg:block" : "block"
          } w-full lg:w-[460px] xl:w-[500px] border-r border-line overflow-y-auto bg-white flex flex-col`}
        >
          {/* Results Header */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-line bg-white sticky top-0 z-10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-ink">
                {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} found
              </span>
              {selectedRadius && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#ff6b35] bg-orange-50 border border-orange-200/80 px-2 py-0.5 rounded-full">
                  <span>within {selectedRadius} km</span>
                  <button
                    type="button"
                    onClick={() => setSelectedRadius(null)}
                    className="hover:text-ink ml-0.5 text-xs font-extrabold cursor-pointer"
                    title="Remove radius filter"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
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
                    setSelectedRadius(null);
                  }}
                  className="mt-3 text-xs font-bold text-accent hover:underline cursor-pointer"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              filteredEvents.map((event) => {
                const dist = userLocation
                  ? getDistanceKm(
                      userLocation.lat,
                      userLocation.lng,
                      event.latitude || 14.5995,
                      event.longitude || 120.9842
                    )
                  : undefined;

                return (
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
                        distanceKm: dist,
                        isSaved: savedIds.includes(event.id),
                      }}
                      variant="discover"
                      onSave={(id: string) => handleToggleSave(id)}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Map View */}
        <div className={`${showMapMobile ? "block" : "hidden lg:block"} flex-1 relative p-3 bg-[#f8fafc]`}>
          {/* Top Right Controls on Map: "Near me" and "Radius" dropdown */}
          <div className="absolute top-6 right-6 z-20 flex items-center gap-2" ref={mapRadiusDropdownRef}>
            <button
              type="button"
              onClick={handleNearMeClick}
              disabled={isLocating}
              className={`px-4 py-2 rounded-md text-xs font-bold shadow-md border transition-all cursor-pointer flex items-center gap-1.5 ${
                userLocation
                  ? "bg-[#ff6b35] text-white border-[#ff6b35] shadow-lg scale-105"
                  : "bg-white text-ink border-line hover:bg-gray-50 hover:border-accent"
              }`}
            >
              <MapPin className={`w-3.5 h-3.5 ${userLocation ? "text-white" : "text-accent"}`} />
              <span>{isLocating ? "Detecting location..." : "Near me"}</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRadiusDropdown(!showRadiusDropdown)}
                className={`px-3 py-2 rounded-md text-xs font-bold shadow-md border transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedRadius
                    ? "bg-[#1c1f22] text-white border-[#2b3036]"
                    : "bg-white text-ink border-line hover:bg-gray-50 hover:border-accent"
                }`}
              >
                <span className={selectedRadius ? "text-[#38bdf8]" : ""}>
                  {selectedRadius ? `${selectedRadius} km` : "Radius"}
                </span>
                <ChevronDown className="w-3 h-3 text-muted" />
              </button>
              {showRadiusDropdown && radiusDropdownMenu}
            </div>
          </div>

          {/* Floating Location Notice Banner */}
          {locationNotice && (
            <div className="absolute top-18 right-6 z-20 bg-[#171717] text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl max-w-sm animate-in fade-in slide-in-from-top-2 duration-200">
              {locationNotice}
            </div>
          )}

          <MapView
            events={filteredEvents}
            selectedEventId={selectedEventId}
            onSelectEvent={(e) => setSelectedEventId(e.id)}
            userLocation={userLocation}
            radiusKm={selectedRadius}
            center={userLocation || undefined}
            zoom={userLocation ? 13 : undefined}
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
      <DiscoverContentShell />
    </Suspense>
  );
}

function DiscoverContentShell() {
  const searchParams = useSearchParams();
  return <DiscoverContent key={searchParams.toString()} />;
}
