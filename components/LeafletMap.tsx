"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { EventData } from "./EventCard";

// Defensively patch Leaflet DomUtil to prevent 'Cannot read properties of undefined (reading _leaflet_pos)'
if (typeof window !== "undefined" && L && L.DomUtil) {
  const origGetPos = L.DomUtil.getPosition;
  L.DomUtil.getPosition = function (el: HTMLElement) {
    if (!el) return new L.Point(0, 0);
    try {
      return origGetPos.call(L.DomUtil, el) || new L.Point(0, 0);
    } catch {
      return new L.Point(0, 0);
    }
  };

  const origSetPos = L.DomUtil.setPosition;
  L.DomUtil.setPosition = function (el: HTMLElement, point: L.Point) {
    if (!el) return;
    try {
      origSetPos.call(L.DomUtil, el, point);
    } catch {}
  };
}

type LeafletMapProps = {
  events: EventData[];
  selectedEventId?: string | null;
  onSelectEvent?: (event: EventData) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  pinMode?: boolean;
  userLocation?: { lat: number; lng: number } | null;
  radiusKm?: number | null;
};

export default function LeafletMap({
  events,
  selectedEventId,
  onSelectEvent,
  center,
  zoom = 13,
  pinMode = false,
  userLocation,
  radiusKm,
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const userMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);

  const defaultCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : center
    ? [center.lat, center.lng]
    : [14.5995, 120.9842]; // Metro Manila

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up previous instance if exists
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.stop();
        mapInstanceRef.current.remove();
      } catch {}
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: zoom,
      zoomControl: false,
      attributionControl: false,
    });

    // Official OpenStreetMap standard tiles
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
      try {
        map.stop();
        map.remove();
      } catch {}
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers when events list changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove existing markers safely
    Object.values(markersRef.current).forEach((marker) => {
      try {
        marker.remove();
      } catch {}
    });
    markersRef.current = {};

    if (!events || events.length === 0) return;

    const resolvedCoordsList: { event: EventData; lat: number; lng: number }[] = [];

    // Resolve coordinates and disperse overlapping markers
    events.forEach((event) => {
      let lat = typeof event.latitude === "string" ? parseFloat(event.latitude) : event.latitude;
      let lng = typeof event.longitude === "string" ? parseFloat(event.longitude) : event.longitude;

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        const loc = (event.location || event.city || "").toLowerCase();
        if (loc.includes("benilde") || loc.includes("dac") || loc.includes("sda")) {
          lat = 14.5638;
          lng = 120.9965;
        } else if (loc.includes("dlsu") || loc.includes("taft")) {
          lat = 14.5648;
          lng = 120.9932;
        } else if (loc.includes("ust") || loc.includes("espana") || loc.includes("españa")) {
          lat = 14.6091;
          lng = 120.9898;
        } else if (loc.includes("diliman") || loc.includes("up")) {
          lat = 14.6537;
          lng = 121.0685;
        } else if (loc.includes("bgc") || loc.includes("taguig")) {
          lat = 14.5517;
          lng = 121.0504;
        } else if (loc.includes("makati") || loc.includes("ayala")) {
          lat = 14.5547;
          lng = 121.0244;
        } else if (loc.includes("intramuros")) {
          lat = 14.5898;
          lng = 120.9754;
        } else {
          lat = 14.5995;
          lng = 120.9842;
        }
      }

      // Check if any previous event shares virtually identical coordinates (within ~30 meters)
      const duplicateCount = resolvedCoordsList.filter(
        (prev) => Math.abs(prev.lat - lat!) < 0.00035 && Math.abs(prev.lng - lng!) < 0.00035
      ).length;

      if (duplicateCount > 0) {
        // Disperse overlapping pins in a small circular rosette so every single event is visible and clickable!
        const angle = (duplicateCount * (2 * Math.PI)) / 6;
        const offsetRadius = 0.00045 * (1 + Math.floor(duplicateCount / 6) * 0.5);
        lat = lat + offsetRadius * Math.sin(angle);
        lng = lng + (offsetRadius * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180);
      }

      resolvedCoordsList.push({ event, lat, lng });
    });

    resolvedCoordsList.forEach(({ event, lat, lng }) => {
      const isFree = Number(event.price) === 0;
      const priceText = isFree ? "Free" : `₱${event.price}`;
      const isSelected = selectedEventId === event.id;

      // Custom HTML pin marker
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
            ${(event.categories && event.categories[0]) || "Community"}
          </span>
          <h4 style="margin:2px 0 4px 0; font-size:14px; font-weight:800; color:#171717; line-height:1.2;">
            ${event.title || "Event"}
          </h4>
          <p style="margin:0 0 6px 0; font-size:12px; color:#666; display:flex; align-items:center; gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${event.location || event.city || "Manila"}</span>
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

    // Auto fit bounds if not centered on specific coordinates and userLocation is not active
    if (!center && !userLocation && resolvedCoordsList.length > 0) {
      if (resolvedCoordsList.length === 1) {
        map.setView([resolvedCoordsList[0].lat, resolvedCoordsList[0].lng], 14);
      } else {
        const group = L.featureGroup(Object.values(markersRef.current));
        const bounds = group.getBounds();
        if (bounds.isValid()) {
          if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
            map.setView(bounds.getCenter(), 14);
          } else {
            map.fitBounds(bounds.pad(0.15), { maxZoom: 16 });
          }
        }
      }
    }
  }, [events, pinMode, userLocation]);

  // Handle userLocation marker and smooth flyTo
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      try {
        userMarkerRef.current.remove();
      } catch {}
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const userMarkerHtml = `
        <div style="position:relative; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">
          <div style="position:absolute; width:32px; height:32px; background:rgba(255,107,53,0.35); border-radius:50%; animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="width:14px; height:14px; background:#ff6b35; border:3px solid #ffffff; border-radius:50%; box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>
        </div>
      `;
      const userIcon = L.divIcon({
        html: userMarkerHtml,
        className: "spott-user-location-marker",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: userIcon,
        zIndexOffset: 1000,
      })
        .addTo(map)
        .bindPopup(
          `<div style="font-weight:bold; font-size:12px; padding:3px 6px; color:#171717;">📍 You Are Here</div>`
        );

      if (!radiusKm) {
        map.flyTo([userLocation.lat, userLocation.lng], 13.5, { duration: 1.2 });
      }
    }
  }, [userLocation]);

  // Handle radius circle visualization and map framing
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (radiusCircleRef.current) {
      try {
        radiusCircleRef.current.remove();
      } catch {}
      radiusCircleRef.current = null;
    }

    if (userLocation && radiusKm && radiusKm > 0) {
      const circle = L.circle([userLocation.lat, userLocation.lng], {
        radius: radiusKm * 1000,
        color: "#ff6b35",
        fillColor: "#ff6b35",
        fillOpacity: 0.07,
        weight: 1.5,
        dashArray: "6, 6",
      }).addTo(map);

      radiusCircleRef.current = circle;

      // Fit map to show the entire selected radius
      const bounds = circle.getBounds();
      map.fitBounds(bounds.pad(0.08), { maxZoom: 16 });
    }
  }, [userLocation, radiusKm]);

  // Handle selectedEventId visual toggle & smooth flyTo without destroying markers
  useEffect(() => {
    // 1. Update DOM classes on markers directly (instant, zero recreation)
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement();
      if (!el) return;
      const pill = el.querySelector(".spott-marker-pill");
      if (pill) {
        if (id === selectedEventId) {
          pill.classList.add("selected");
        } else {
          pill.classList.remove("selected");
        }
      }
    });

    // 2. Fly to selected marker if exists
    const map = mapInstanceRef.current;
    if (!map || !selectedEventId) return;

    const marker = markersRef.current[selectedEventId];
    if (marker) {
      try {
        const pos = marker.getLatLng();
        map.flyTo(pos, 15, { duration: 0.8 });
        marker.openPopup();
      } catch {}
    }
  }, [selectedEventId]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainerRef} className="w-full h-full min-h-[400px] z-0 rounded-xl" />
    </div>
  );
}
