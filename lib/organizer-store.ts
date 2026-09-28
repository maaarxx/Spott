"use client";

import { getCurrentUser } from "./auth-store";
import { getStoredEvents } from "./events-store";
import { DEFAULT_EVENTS } from "./default-events";
import { getVerificationState } from "./verification-store";

export interface OrganizerProfile {
  name: string;
  avatarUrl?: string;
  caption?: string;
  address?: string;
  email?: string;
  website?: string;
  category?: string;
  updatedAt?: string;
}

const STORAGE_PREFIX = "spott_organizer_profile_";

export function getProfileStorageKey(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return `${STORAGE_PREFIX}${slug}`;
}

export const DEFAULT_ORGANIZER_PROFILES: Record<string, OrganizerProfile> = {
  "metro creative group": {
    name: "Metro Creative Group",
    avatarUrl: "",
    caption:
      "Official creative collective and event production team creating vibrant cultural showcases, workshops, culinary pop-ups, and student community activations on Spott.",
    address: "D+A Campus, De La Salle-College of Saint Benilde, Taft Ave, Malate, Manila",
    email: "hello@metrocreative.ph",
    website: "https://metrocreative.ph",
    category: "Creative Arts & Design",
  },
};

export function getOrganizerProfile(organizerName?: string): OrganizerProfile {
  const current = getCurrentUser();
  const name =
    organizerName?.trim() ||
    current?.organization ||
    current?.name ||
    "Metro Creative Group";

  const key = getProfileStorageKey(name);
  const normalized = name.toLowerCase().trim();

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_ORGANIZER_PROFILES[normalized],
          ...parsed,
          name,
        };
      }
    } catch {}
  }

  // Fallback to defaults or generate baseline
  if (DEFAULT_ORGANIZER_PROFILES[normalized]) {
    return { ...DEFAULT_ORGANIZER_PROFILES[normalized] };
  }

  return {
    name,
    avatarUrl: "",
    caption:
      "Community organizer on Spott hosting public gatherings, interactive workshops, and local cultural experiences.",
    address: "Metro Manila, Philippines",
    email: "",
    website: "",
    category: "Community & Campus",
  };
}

export function saveOrganizerProfile(
  profile: Partial<OrganizerProfile> & { name: string }
): OrganizerProfile {
  const name = profile.name.trim();
  const current = getOrganizerProfile(name);
  const updated: OrganizerProfile = {
    ...current,
    ...profile,
    name,
    updatedAt: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };

  if (typeof window !== "undefined") {
    try {
      const key = getProfileStorageKey(name);
      localStorage.setItem(key, JSON.stringify(updated));
      window.dispatchEvent(new Event("spott_organizer_profile_updated"));
    } catch (e) {
      console.error("Failed to save organizer profile:", e);
    }
  }

  return updated;
}

export function subscribeToOrganizerProfile(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleUpdate = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(STORAGE_PREFIX)) {
      callback();
    }
  };

  window.addEventListener("spott_organizer_profile_updated", handleUpdate);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("spott_organizer_profile_updated", handleUpdate);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * Returns a list of all distinct organizers found in the system
 * (from registered profiles, events, and default groups)
 */
export function getAllOrganizersList(): Array<OrganizerProfile & { eventCount: number; isVerified: boolean }> {
  const orgMap = new Map<string, OrganizerProfile>();

  // 1. Seed with known default profiles
  Object.values(DEFAULT_ORGANIZER_PROFILES).forEach((p) => {
    orgMap.set(p.name.toLowerCase().trim(), { ...p });
  });

  // 2. Discover organizers from all events
  const storedEvents = typeof window !== "undefined" ? getStoredEvents() : [];
  const allEvents = [...storedEvents, ...DEFAULT_EVENTS];

  allEvents.forEach((ev) => {
    const orgName = (ev.organizer || "Metro Creative Group").trim();
    const key = orgName.toLowerCase();
    if (!orgMap.has(key)) {
      const prof = getOrganizerProfile(orgName);
      orgMap.set(key, prof);
    }
  });

  // 3. Merge stored profile overrides from localStorage if any
  if (typeof window !== "undefined") {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const p: OrganizerProfile = JSON.parse(raw);
            if (p.name) {
              const key = p.name.toLowerCase().trim();
              const existing = orgMap.get(key) || getOrganizerProfile(p.name);
              orgMap.set(key, { ...existing, ...p });
            }
          }
        }
      }
    } catch {}
  }

  // Calculate event count & verification status for each
  const result: Array<OrganizerProfile & { eventCount: number; isVerified: boolean }> = [];

  orgMap.forEach((prof) => {
    const target = prof.name.toLowerCase().trim();
    const isMetro =
      target.includes("metro creative") ||
      target.includes("mcg") ||
      target === "metro creative group";

    const eventsForOrg = allEvents.filter((ev) => {
      const evOrg = (ev.organizer || "").toLowerCase().trim();
      if (isMetro) {
        return (
          !ev.organizer ||
          evOrg === "" ||
          evOrg.includes("metro creative") ||
          evOrg.includes("mcg")
        );
      }
      return evOrg === target;
    });

    const ver = getVerificationState(prof.name);
    const isVerified =
      (ver && ver.status === "approved") ||
      isMetro ||
      eventsForOrg.some((e) => e.verified);

    result.push({
      ...prof,
      eventCount: eventsForOrg.length,
      isVerified,
    });
  });

  return result.sort((a, b) => b.eventCount - a.eventCount);
}
