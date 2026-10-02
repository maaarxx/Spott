"use client";

import { getCurrentUser } from "./auth-store";
import { fetchWithSupabaseSession } from "./audit-log-client";
import { getStoredEvents } from "./events-store";
import { DEFAULT_EVENTS } from "./default-events";
import type { EventData } from "@/components/EventCard";
import type { AddressValue } from "@/components/ProfileAddressFields";

export class OrganizerProfileSaveError extends Error {
  fieldErrors?: Record<string, string>;
  constructor(message: string, fieldErrors?: Record<string, string>) { super(message); this.fieldErrors = fieldErrors; }
}

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

const profileCache = new Map<string, OrganizerProfile>();

export function getProfileStorageKey(name: string): string {
  return name.trim().toLowerCase();
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
  "hobbyist haven ph": {
    name: "Hobbyist Haven PH",
    avatarUrl: "",
    caption:
      "Philippines' premier community hub for Pokemon TCG, One Piece Card Game, anime figures, gacha collectors, and pop-culture swap meets.",
    address: "The District Dasmariñas / SM Mall of Asia, Cavite & Manila",
    email: "hello@hobbyisthaven.ph",
    website: "https://hobbyisthaven.ph",
    category: "Hobbies & Collectibles",
  },
  "tech manila hub": {
    name: "Tech Manila Hub",
    avatarUrl: "",
    caption:
      "Premier Philippine community for Apple iOS & Android developers, smartphone power users, gadget modders, and emerging mobile tech innovators.",
    address: "BGC Innovation Hub, Taguig / Baguio Tech Corridor",
    email: "community@techmanilahub.ph",
    website: "https://techmanilahub.ph",
    category: "Technology & Innovation",
  },
  "vanguard gaming league": {
    name: "Vanguard Gaming League",
    avatarUrl: "",
    caption:
      "National grassroots and collegiate esports tournament circuit hosting premier LAN battles for Mobile Legends: Bang Bang, Honor of Kings, and Valorant.",
    address: "Taft Cyber Arena, Manila / Dasmariñas Esports Arena",
    email: "clutch@vanguardgaming.ph",
    website: "https://vanguardgaming.ph",
    category: "Esports & Gaming",
  },
};

export function getOrganizerProfile(organizerName?: string): OrganizerProfile {
  const current = getCurrentUser();
  const name =
    organizerName?.trim() ||
    current?.organization ||
    current?.name ||
    "Metro Creative Group";

  const normalized = name.toLowerCase().trim();
  const cached = profileCache.get(normalized);
  if (cached) return { ...cached };

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
    profileCache.set(name.toLowerCase().trim(), updated);
    window.dispatchEvent(new Event("spott_organizer_profile_updated"));
  }

  return updated;
}

function mapDatabaseProfile(row: Record<string, unknown>): OrganizerProfile {
  return {
    name: String(row.name || ""),
    avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : "",
    caption: typeof row.caption === "string" ? row.caption : "",
    address: typeof row.address === "string" ? row.address : "",
    email: typeof row.email === "string" ? row.email : "",
    website: typeof row.website === "string" ? row.website : "",
    category: typeof row.category === "string" ? row.category : "",
  };
}

export async function loadOrganizerProfileFromDatabase(name?: string): Promise<OrganizerProfile> {
  const url = name ? `/api/organizer/profile?name=${encodeURIComponent(name)}` : "/api/organizer/profile";
  const response = await fetchWithSupabaseSession(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.profile) throw new Error(payload.error || "Unable to load organizer profile.");
  let profile = mapDatabaseProfile(payload.profile);
  if (typeof window !== "undefined") {
    try {
      const legacyKey = `spott_organizer_profile_${profile.name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "_")}`;
      const raw = localStorage.getItem(legacyKey);
      const legacy = raw ? JSON.parse(raw) as OrganizerProfile : null;
      if (legacy) {
        const form = new FormData();
        form.set("organization_name", profile.name);
        let hasImport = false;
        for (const [field, current, oldValue] of [
          ['description', profile.caption, legacy.caption],
          ['address', profile.address, legacy.address],
          ['public_email', profile.email, legacy.email],
          ['website', profile.website, legacy.website],
          ['category', profile.category, legacy.category],
        ] as const) {
          if (!current && typeof oldValue === 'string' && oldValue.trim()) {
            form.set(field, oldValue.trim());
            hasImport = true;
          }
        }
        if (!profile.avatarUrl && typeof legacy.avatarUrl === 'string') {
          const match = legacy.avatarUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
          if (match) {
            const binary = atob(match[2]);
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
            const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
            form.set('avatar', new File([bytes], `legacy-organizer.${ext}`, { type: match[1] }));
            hasImport = true;
          }
        }
        if (hasImport) {
          form.set('migration_mode', 'true');
          form.set('avatar_action', 'keep');
          const migrated = await fetchWithSupabaseSession('/api/organizer/profile', { method: 'PATCH', body: form });
          const migratedPayload = await migrated.json().catch(() => ({}));
          if (migrated.ok && migratedPayload.profile) profile = mapDatabaseProfile(migratedPayload.profile);
        }
      }
    } catch {
      // Retain the old browser copy if migration is unavailable.
    }
  }
  profileCache.set(profile.name.toLowerCase().trim(), profile);
  return profile;
}

export async function saveOrganizerProfileToDatabase(
  profile: OrganizerProfile,
  avatarFile?: File | null,
  removeAvatar = false,
  addressValue?: AddressValue,
): Promise<OrganizerProfile> {
  const form = new FormData();
  form.set("organization_name", profile.name);
  form.set("description", profile.caption || "");
  form.set("address", profile.address || "");
  if (addressValue) {
    form.set("country", addressValue.country);
    form.set("province_or_region_code", addressValue.provinceOrRegionCode);
    form.set("city_code", addressValue.cityCode);
    form.set("city", addressValue.city);
    form.set("region", addressValue.region);
  }
  form.set("public_email", profile.email || "");
  form.set("website", profile.website || "");
  form.set("category", profile.category || "");
  form.set("avatar_action", removeAvatar ? "remove" : "keep");
  if (avatarFile) form.set("avatar", avatarFile);
  const response = await fetchWithSupabaseSession("/api/organizer/profile", { method: "PATCH", body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.profile) throw new OrganizerProfileSaveError(payload.error || "Unable to save organizer profile.", payload.fieldErrors);
  return saveOrganizerProfile(mapDatabaseProfile(payload.profile));
}

export function subscribeToOrganizerProfile(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleUpdate = () => callback();
  window.addEventListener("spott_organizer_profile_updated", handleUpdate);

  return () => {
    window.removeEventListener("spott_organizer_profile_updated", handleUpdate);
  };
}

/**
 * Returns a list of all distinct organizers found in the system
 * (from registered profiles, events, and default groups)
 */
export function getAllOrganizersList(extraEvents?: EventData[]): Array<OrganizerProfile & { eventCount: number; isVerified: boolean }> {
  const orgMap = new Map<string, OrganizerProfile>();

  // 1. Seed with known default profiles
  Object.values(DEFAULT_ORGANIZER_PROFILES).forEach((p) => {
    orgMap.set(p.name.toLowerCase().trim(), { ...p });
  });

  // 2. Discover organizers from all events
  const storedEvents = typeof window !== "undefined" ? getStoredEvents() : [];
  const eventPool = [...storedEvents, ...DEFAULT_EVENTS, ...(extraEvents || [])];
  const seenEventIds = new Set<string>();
  const allEvents: EventData[] = [];
  for (const ev of eventPool) {
    if (!seenEventIds.has(ev.id)) {
      seenEventIds.add(ev.id);
      allEvents.push(ev);
    }
  }

  allEvents.forEach((ev) => {
    const orgName = (ev.organizer || "Metro Creative Group").trim();
    const key = orgName.toLowerCase();
    if (!orgMap.has(key)) {
      const prof = getOrganizerProfile(orgName);
      orgMap.set(key, prof);
    }
  });

  // Database-loaded profile cache only; localStorage is never the profile source.
  profileCache.forEach((profile, key) => orgMap.set(key, { ...profile }));

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

    const isVerified = eventsForOrg.some((event) => Boolean(event.verified));

    result.push({
      ...prof,
      eventCount: eventsForOrg.length,
      isVerified,
    });
  });

  return result.sort((a, b) => b.eventCount - a.eventCount);
}
