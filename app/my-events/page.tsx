"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Bookmark, MapPin } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import type { EventData } from "@/components/EventCard";
import { DEFAULT_EVENTS } from "@/lib/default-events";

type Tab = "saved" | "registered" | "upcoming" | "past";

export default function MyEventsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("saved");
  // Instant rendering from DEFAULT_EVENTS - zero buffering!
  const [events, setEvents] = useState<EventData[]>(DEFAULT_EVENTS);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("spott_saved_events");
      if (stored) {
        setSavedIds(JSON.parse(stored).map(String));
      }
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
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };

  const now = new Date();
  const savedEvents = savedIds.length > 0
    ? events.filter((e) => savedIds.includes(e.id))
    : events.slice(0, 3);
  const registeredEvents = events.slice(0, 1);
  const upcomingEvents = events.filter((e) => new Date(e.date) > now);
  const pastEvents = events.filter((e) => new Date(e.date) <= now);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "saved", label: "Saved", count: savedEvents.length },
    { key: "registered", label: "Registered", count: registeredEvents.length },
    { key: "upcoming", label: "Upcoming", count: upcomingEvents.length },
    { key: "past", label: "Past", count: pastEvents.length },
  ];

  const currentEvents = {
    saved: savedEvents,
    registered: registeredEvents,
    upcoming: upcomingEvents,
    past: pastEvents,
  }[activeTab];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
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
        {/* Events List */}
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
                className="bg-white border border-line rounded-2xl p-5 flex flex-col sm:flex-row justify-between gap-4 hover:border-gray-300 transition-colors"
              >
                <div className="space-y-1">
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
                  <Link
                    href={`/events/${event.id}`}
                    className="text-lg font-bold text-ink hover:text-accent transition-colors block"
                  >
                    {event.title}
                  </Link>
                  <div className="flex items-center gap-4 text-xs text-muted pt-1">
                    <span>
                      {format(new Date(event.date), "EEE, MMM d • h:mm a")}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {event.location}
                    </span>
                  </div>
                </div>

                <div className="flex sm:flex-col justify-between items-end gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-line">
                  <span className="font-bold text-ink text-sm">
                    {event.price === 0 ? "Free Entry" : `₱${event.price}`}
                  </span>
                  {activeTab === "saved" && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-white bg-dark px-3 py-1.5 rounded-lg">
                      <CheckCircle2 className="w-3 h-3" /> Saved
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Summary Statistics */}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
