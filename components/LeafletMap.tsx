"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { EventData } from "./EventCard";

type LeafletMapProps = {
  events: EventData[];
  selectedEventId?: string | null;
  onSelectEvent?: (event: EventData) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  pinMode?: boolean;
};

export default function LeafletMap({
  events,
  selectedEventId,
  onSelectEvent,
  center,
  zoom = 13,
  pinMode = false,
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});

  const defaultCenter: [number, number] = center
    ? [center.lat, center.lng]
    : [14.5995, 120.9842]; // Metro Manila

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up previous instance if exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: zoom,
      zoomControl: false, // We'll add custom positioned zoom control
      attributionControl: false,
    });

    // Official OpenStreetMap standard tiles - 100% Free, Zero API Key, Zero Watermark
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Zoom control on bottom-right
    L.control
      .zoom({
        position: "bottomright",
      })
      .addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers when events change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove existing markers
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    const validEvents = events.filter((e) => e.latitude && e.longitude);

    validEvents.forEach((event) => {
      const lat = event.latitude!;
      const lng = event.longitude!;
      const isFree = Number(event.price) === 0;
      const priceText = isFree ? "Free" : `₱${event.price}`;
      const isSelected = selectedEventId === event.id;

      // Custom HTML pin marker (clean teardrop pin for venue/location mode, or price pill for discover mode)
      const markerHtml = pinMode
        ? `
          <div style="transform:translate(-50%,-100%);filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));cursor:pointer;">
            <div style="background-color:#ff6b35;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);">
              <div style="width:10px;height:10px;background-color:white;border-radius:50%;transform:rotate(45deg);"></div>
            </div>
          </div>
        `
        : `
          <div class="spott-marker-pill ${isSelected ? "selected" : ""} ${isFree ? "free" : ""}">
            ${priceText}
          </div>
        `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: pinMode ? "spott-location-pin" : "spott-leaflet-marker",
        iconSize: pinMode ? [32, 32] : [60, 28],
        iconAnchor: pinMode ? [16, 32] : [30, 14],
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

      // Popup Content
      const popupHtml = `
        <div class="p-1 min-w-[200px]">
          <span style="font-size:10px; font-weight:900; text-transform:uppercase; color:#ff6b35; letter-spacing:0.5px;">
            ${event.categories?.[0] || "Community"}
          </span>
          <h4 style="margin:2px 0 4px 0; font-size:14px; font-weight:800; color:#171717; line-height:1.2;">
            ${event.title}
          </h4>
          <p style="margin:0 0 6px 0; font-size:12px; color:#666; display:flex; align-items:center; gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${event.location || event.city}</span>
          </p>
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:6px;">
            <span style="font-size:12px; font-weight:900; color:#171717;">
              ${priceText}
            </span>
            <a href="/events/${event.id}" style="font-size:11px; font-weight:800; color:#ff6b35; text-decoration:none;">
              View Details →
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        className: "spott-custom-popup",
      });

      marker.on("click", () => {
        onSelectEvent?.(event);
      });

      markersRef.current[event.id] = marker;
    });

    // Auto fit bounds if multiple events and not centered on specific coordinates
    if (validEvents.length > 1 && !center) {
      const group = L.featureGroup(Object.values(markersRef.current));
      map.fitBounds(group.getBounds().pad(0.15));
    }
  }, [events, selectedEventId]);

  // Handle selectedEventId flyTo
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedEventId) return;

    const event = events.find((e) => e.id === selectedEventId);
    if (event && event.latitude && event.longitude) {
      map.flyTo([event.latitude, event.longitude], 15, {
        duration: 1.2,
      });

      const marker = markersRef.current[selectedEventId];
      if (marker) {
        marker.openPopup();
      }
    }
  }, [selectedEventId, events]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainerRef} className="w-full h-full min-h-[400px] z-0 rounded-xl" />
    </div>
  );
}
