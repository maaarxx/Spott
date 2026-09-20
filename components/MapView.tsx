"use client";

import dynamic from "next/dynamic";
import type { EventData } from "./EventCard";

// Dynamic import with ssr: false ensures Leaflet is only loaded on the client,
// preventing server-side rendering issues without any direct DOM manipulation.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] bg-[#f0f2f5] rounded-xl flex items-center justify-center text-muted text-sm font-bold animate-pulse">
      Loading OpenStreetMap...
    </div>
  ),
});

export type MapViewProps = {
  events: EventData[];
  selectedEventId?: string | null;
  onSelectEvent?: (event: EventData) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
};

export default function MapView({
  events,
  selectedEventId,
  onSelectEvent,
  center,
  zoom = 13,
}: MapViewProps) {
  return (
    <div className="w-full h-full min-h-[400px] rounded-xl overflow-hidden shadow-sm relative">
      <LeafletMap
        events={events}
        selectedEventId={selectedEventId}
        onSelectEvent={onSelectEvent}
        center={center}
        zoom={zoom}
      />
    </div>
  );
}
