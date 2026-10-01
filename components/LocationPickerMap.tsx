"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

export type LocationPickerMapProps = {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
};

export default function LocationPickerMap({
  lat,
  lng,
  onChange,
}: LocationPickerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const initialLat = lat ?? 14.5638;
    const initialLng = lng ?? 120.9965;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Custom Pin HTML Icon
    const pinIcon = L.divIcon({
      html: `
        <div style="display:flex;flex-direction:column;items:center;align-items:center;transform:translate(-50%,-100%);">
          <div style="background-color:#ff6b35;color:white;font-weight:900;font-size:11px;padding:3px 8px;border-radius:9999px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.3);display:flex;align-items:center;gap:4px;white-space:nowrap;border:2px solid white;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg> Event Pin
          </div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #ff6b35;margin-top:-1px;"></div>
        </div>
      `,
      className: "spott-location-pin",
      iconSize: [0, 0],
    });

    const marker = L.marker([initialLat, initialLng], {
      draggable: true,
      icon: pinIcon,
    });
    if (lat !== null && lng !== null) {
      marker.addTo(map);
    }

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onChangeRef.current(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
    });

    map.on("click", (e) => {
      marker.setLatLng(e.latlng);
      if (!map.hasLayer(marker)) {
        marker.addTo(map);
      }
      onChangeRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    });

    markerRef.current = marker;
    mapInstanceRef.current = map;

    return () => {
      try {
        map.stop();
        map.remove();
      } catch {}
      mapInstanceRef.current = null;
    };
  }, []);

  // Update marker & pan if lat/lng changes externally (e.g. preset clicked)
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      if (lat !== null && lng !== null) {
        markerRef.current.setLatLng([lat, lng]);
        mapInstanceRef.current.panTo([lat, lng], { animate: true });
        if (!mapInstanceRef.current.hasLayer(markerRef.current)) {
          markerRef.current.addTo(mapInstanceRef.current);
        }
      } else {
        if (mapInstanceRef.current.hasLayer(markerRef.current)) {
          markerRef.current.remove();
        }
      }
    }
  }, [lat, lng]);

  return (
    <div className="w-full h-64 rounded-xl overflow-hidden border border-[#e6e1d8] relative isolate z-0 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full" />
      <div className="absolute top-2 left-2 z-10 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#171717] shadow-sm border border-line flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[#ff6b35] animate-ping" />
        <span>Click or drag pin to set venue location</span>
      </div>
    </div>
  );
}
