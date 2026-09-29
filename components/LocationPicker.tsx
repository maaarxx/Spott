"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 bg-[#f0f2f5] rounded-xl flex items-center justify-center text-muted text-xs font-bold animate-pulse border border-[#e6e1d8]">
      Loading map for pinning location...
    </div>
  ),
});

type LocationPickerProps = {
  locationValue: string;
  onLocationChange?: (val: string) => void;
  lat: number;
  lng: number;
  onCoordinatesChange: (lat: number, lng: number) => void;
};

// Known Philippine campuses & metropolitan venues for instant zero-latency auto-pinning and proximity matching
const KNOWN_LANDMARKS: { keywords: string[]; lat: number; lng: number; label: string }[] = [
  {
    keywords: ["benilde", "csb", "dac", "d+a", "sda", "de la salle-college of saint benilde", "saint benilde"],
    lat: 14.5638,
    lng: 120.9965,
    label: "CSB Design + Arts Campus, Malate, Manila",
  },
  {
    keywords: ["dlsu", "la salle", "lasalle", "taft", "henry sy"],
    lat: 14.5648,
    lng: 120.9932,
    label: "DLSU Manila, 2401 Taft Ave, Malate, Manila",
  },
  {
    keywords: ["ust", "españa", "espana", "santissimo", "plaza mayor", "thomasian"],
    lat: 14.6091,
    lng: 120.9898,
    label: "UST Manila, España Blvd, Sampaloc, Manila",
  },
  {
    keywords: ["up diliman", "diliman", "sunken garden", "upd", "quezon hall"],
    lat: 14.6537,
    lng: 121.0685,
    label: "UP Diliman, Roxas Ave, Quezon City",
  },
  {
    keywords: ["ateneo", "admu", "loyola", "katipunan", "arete"],
    lat: 14.6396,
    lng: 121.0777,
    label: "Ateneo de Manila, Katipunan Ave, Quezon City",
  },
  {
    keywords: ["bgc", "bonifacio", "high street", "arts center", "taguig", "serendra"],
    lat: 14.5517,
    lng: 121.0504,
    label: "BGC Arts Center, 26th St, Taguig, Metro Manila",
  },
  {
    keywords: ["makati", "ayala", "greenbelt", "glorietta", "salcedo", "legazpi"],
    lat: 14.5547,
    lng: 121.0244,
    label: "Ayala Avenue, Makati Central Business District",
  },
  {
    keywords: ["ortigas", "pasig", "megamall", "robinsons galleria", "podium"],
    lat: 14.5855,
    lng: 121.0594,
    label: "Ortigas Center, Pasig, Metro Manila",
  },
  {
    keywords: ["feu", "morayta", "nicanor reyes"],
    lat: 14.6042,
    lng: 120.9882,
    label: "FEU Manila, Nicanor Reyes St, Sampaloc, Manila",
  },
  {
    keywords: ["mapua", "intramuros", "plm", "letran", "san agustin"],
    lat: 14.5898,
    lng: 120.9754,
    label: "Intramuros, Manila, Metro Manila",
  },
  {
    keywords: ["adamson", "san marcelino"],
    lat: 14.5866,
    lng: 120.9859,
    label: "Adamson University, 900 San Marcelino St, Ermita, Manila",
  },
  {
    keywords: ["san beda", "mendiola", "ceu"],
    lat: 14.5997,
    lng: 120.9939,
    label: "Mendiola, San Miguel, Manila",
  },
  {
    keywords: ["alabang", "filinvest", "muntinlupa"],
    lat: 14.4214,
    lng: 121.0425,
    label: "Filinvest City, Alabang, Muntinlupa",
  },
  {
    keywords: ["cubao", "araneta", "gateway", "smart araneta"],
    lat: 14.6206,
    lng: 121.0526,
    label: "Araneta City, Cubao, Quezon City",
  },
  {
    keywords: ["quezon city", "qc circle"],
    lat: 14.6760,
    lng: 121.0437,
    label: "Quezon City, Metro Manila",
  },
  {
    keywords: ["manila", "rizal park", "luneta"],
    lat: 14.5995,
    lng: 120.9842,
    label: "Manila City, Metro Manila",
  },
];

export default function LocationPicker({
  locationValue,
  onLocationChange,
  lat,
  lng,
  onCoordinatesChange,
}: LocationPickerProps) {
  const [manualPinSet, setManualPinSet] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onCoordsRef = useRef(onCoordinatesChange);
  const onLocationChangeRef = useRef(onLocationChange);
  useEffect(() => {
    onCoordsRef.current = onCoordinatesChange;
    onLocationChangeRef.current = onLocationChange;
  }, [onCoordinatesChange, onLocationChange]);

  // Auto-pin location whenever user inputs text
  useEffect(() => {
    const query = locationValue?.trim() || "";

    if (!query) {
      return;
    }

    // If manual pin was just set by map clicking, don't trigger re-geocoding loop
    if (manualPinSet) {
      return;
    }

    const lowerQuery = query.toLowerCase();

    // 1. Instant check against known campus/landmark dictionary
    const localMatch = KNOWN_LANDMARKS.find((lm) =>
      lm.keywords.some((kw) => lowerQuery.includes(kw))
    );

    if (localMatch) {
      onCoordsRef.current(localMatch.lat, localMatch.lng);
      return;
    }

    // 2. Debounced online geocoding for arbitrary addresses
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&countrycodes=ph&limit=1`;

        const res = await fetch(searchUrl, {
          signal: controller.signal,
          headers: { "Accept-Language": "en" },
        });

        if (!res.ok) throw new Error("Geocoding failed");
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
          const newLat = parseFloat(data[0].lat);
          const newLng = parseFloat(data[0].lon);
          onCoordsRef.current(Number(newLat.toFixed(6)), Number(newLng.toFixed(6)));
        }
      } catch (error: unknown) {
        if (!(error instanceof Error) || error.name !== "AbortError") {
          // Keep current pin if online query fails
        }
      }
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locationValue, manualPinSet]);

  // Handle map click or drag: Auto-fills location text input AND updates coordinates!
  const handleMapPinChange = async (newLat: number, newLng: number) => {
    setManualPinSet(true);
    onCoordsRef.current(newLat, newLng);

    // 1. Check proximity to known campus landmarks
    const closeMatch = KNOWN_LANDMARKS.find((lm) => {
      const dLat = Math.abs(lm.lat - newLat);
      const dLng = Math.abs(lm.lng - newLng);
      return dLat < 0.006 && dLng < 0.006;
    });

    if (closeMatch) {
      onLocationChangeRef.current?.(closeMatch.label);
      setTimeout(() => setManualPinSet(false), 800);
      return;
    }

    // 2. Set an immediate readable venue string so the form input is never blank
    const fallbackAddr = `Venue at ${newLat.toFixed(4)}, ${newLng.toFixed(4)}`;
    onLocationChangeRef.current?.(fallbackAddr);

    // 3. Online reverse geocoding via OpenStreetMap Nominatim for exact address
    try {
      const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&zoom=18&addressdetails=1`;
      const res = await fetch(revUrl, {
        headers: { "Accept-Language": "en" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          const parts = data.display_name.split(", ");
          // Take first 3-4 segments (e.g. "Vito Cruz, Malate, Manila, Metro Manila")
          const cleanAddr = parts.slice(0, 4).join(", ");
          onLocationChangeRef.current?.(cleanAddr);
        }
      }
    } catch {}

    setTimeout(() => setManualPinSet(false), 800);
  };

  return (
    <LocationPickerMap
      lat={lat}
      lng={lng}
      onChange={handleMapPinChange}
    />
  );
}
