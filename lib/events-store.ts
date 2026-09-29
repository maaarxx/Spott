"use client";

import type { EventData } from "@/components/EventCard";
import { useSyncExternalStore } from "react";
import { removeNotificationsForEvent } from "@/lib/notifications-store";
import { getVerificationState } from "@/lib/verification-store";
import { maintainEventArchive } from "@/lib/event-archive.mjs";

const STORAGE_KEY_EVENTS = "spott_events_directory";
const STORAGE_KEY_UPDATE_PULSE = "spott_events_last_update";
const BROADCAST_CHANNEL_NAME = "spott_events_sync";
const EMPTY_EVENTS: EventData[] = [];
let cachedEventsRaw: string | null | undefined;
let cachedEventsSnapshot: EventData[] = EMPTY_EVENTS;
function persistMaintainedEvents(events: EventData[], changed: boolean) {
  if (changed && typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(events));
    } catch {}
  }
}

export function broadcastEventsUpdated() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_UPDATE_PULSE, Date.now().toString());
  } catch {}
  try {
    window.dispatchEvent(new Event("spott_events_updated"));
  } catch {}
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage({ type: "events_updated", timestamp: Date.now() });
      channel.close();
    }
  } catch {}
}

export function subscribeToEvents(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustom = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (
      !e.key ||
      e.key === STORAGE_KEY_EVENTS ||
      e.key === STORAGE_KEY_UPDATE_PULSE ||
      e.key.startsWith("spott_registered_events") ||
      e.key === "spott_guest_lists" ||
      e.key.startsWith("spott_saved_events")
    ) {
      callback();
    }
  };

  window.addEventListener("spott_events_updated", handleCustom);
  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = () => callback();
    }
  } catch {}

  return () => {
    window.removeEventListener("spott_events_updated", handleCustom);
    window.removeEventListener("storage", handleStorage);
    try {
      channel?.close();
    } catch {}
  };
}

export function getStoredEvents(): EventData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EVENTS);
    if (!raw) return [];
    const maintained = maintainEventArchive(JSON.parse(raw));
    const list: EventData[] = maintained.events;
    persistMaintainedEvents(list, maintained.changed);
    return list.map((e) => {
      let lat = typeof e.latitude === "string" ? parseFloat(e.latitude) : e.latitude;
      let lng = typeof e.longitude === "string" ? parseFloat(e.longitude) : e.longitude;
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        const loc = (e.location || e.city || "").toLowerCase();
        if (loc.includes("benilde") || loc.includes("dac") || loc.includes("sda") || loc.includes("csb")) {
          lat = 14.5638;
          lng = 120.9965;
        } else if (loc.includes("dlsu") || loc.includes("taft") || loc.includes("la salle")) {
          lat = 14.5648;
          lng = 120.9932;
        } else if (loc.includes("ust") || loc.includes("espana") || loc.includes("españa")) {
          lat = 14.6091;
          lng = 120.9898;
        } else if (loc.includes("diliman") || loc.includes("up") || loc.includes("upd")) {
          lat = 14.6537;
          lng = 121.0685;
        } else if (loc.includes("ateneo") || loc.includes("admu") || loc.includes("katipunan")) {
          lat = 14.6396;
          lng = 121.0777;
        } else if (loc.includes("bgc") || loc.includes("taguig") || loc.includes("bonifacio")) {
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
      const org = (e.organizer || "Metro Creative Group").trim();
      const isMetro = org.toLowerCase().includes("metro creative") || org.toLowerCase() === "mcg";
      const isVerified = isMetro || getVerificationState(org).status === "approved";

      return {
        ...e,
        latitude: lat,
        longitude: lng,
        verified: isVerified,
        categories: Array.isArray(e.categories) ? e.categories : [e.category || "Community"].filter(Boolean),
        image: e.image || e.coverImage,
        coverImage: e.coverImage || e.image,
        capacity: typeof e.capacity === "number" ? e.capacity : (e.capacity ? Number(e.capacity) : 100),
      };
    });
  } catch {
    return [];
  }
}

function getStoredEventsSnapshot(): EventData[] {
  if (typeof window === "undefined") return EMPTY_EVENTS;
  const raw = localStorage.getItem(STORAGE_KEY_EVENTS);
  if (raw === cachedEventsRaw) return cachedEventsSnapshot;
  cachedEventsSnapshot = getStoredEvents();
  cachedEventsRaw = localStorage.getItem(STORAGE_KEY_EVENTS);
  return cachedEventsSnapshot;
}

export function useStoredEvents(): EventData[] {
  return useSyncExternalStore(subscribeToEvents, getStoredEventsSnapshot, () => EMPTY_EVENTS);
}

export function saveStoredEvent(event: EventData) {
  if (typeof window === "undefined") return;
  try {
    const existing = getStoredEvents();
    const filtered = existing.filter((e) => e.id !== event.id);
    const updated = [event, ...filtered];
    localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(updated));
    broadcastEventsUpdated();
  } catch (e) {
    // If quota exceeded (due to heavy base64 images), strip images and save event metadata
    try {
      const existing = getStoredEvents();
      const safeEvent = { ...event, coverImage: null, image: null };
      const safeExisting = existing.map((it) => ({ ...it, coverImage: null, image: null })).filter((it) => it.id !== event.id);
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify([safeEvent, ...safeExisting]));
      broadcastEventsUpdated();
    } catch (innerErr) {
      console.error("Failed to save event to localStorage:", innerErr);
    }
  }
}

export function saveStoredEvents(events: EventData[], broadcast: boolean = false) {
  if (typeof window === "undefined" || !events.length) return;
  try {
    const existing = getStoredEvents();
    const map = new Map<string, EventData>();
    existing.forEach((e) => map.set(e.id, e));
    let hasChanges = false;
    for (const e of events) {
      const prev = map.get(e.id);
      if (!prev) {
        hasChanges = true;
        map.set(e.id, e);
      } else {
        // Only mark changed if registrations or capacity or status changed
        if (
          prev.registrations !== e.registrations ||
          prev.confirmedAt !== e.confirmedAt ||
          prev.status !== e.status
        ) {
          hasChanges = true;
        }
        map.set(e.id, { ...prev, ...e });
      }
    }

    if (!hasChanges) {
      return;
    }

    const updated = Array.from(map.values());
    localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(updated));
    if (broadcast) {
      broadcastEventsUpdated();
    }
  } catch (e) {
    try {
      const existing = getStoredEvents();
      const map = new Map<string, EventData>();
      existing.forEach((it) => map.set(it.id, { ...it, coverImage: null, image: null }));
      events.forEach((it) => map.set(it.id, { ...map.get(it.id), ...it, coverImage: null, image: null }));
      const safe = Array.from(map.values());
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(safe));
      if (broadcast) {
        broadcastEventsUpdated();
      }
    } catch (innerErr) {
      console.error("Failed to batch save events to localStorage:", innerErr);
    }
  }
}

export function deleteStoredEvent(id: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = getStoredEvents();
    const target = existing.find((e) => e.id === id);
    const updated = existing.filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(updated));
    broadcastEventsUpdated();

    // Also remove notifications related to this removed event
    if (target) {
      removeNotificationsForEvent(target.id, target.title);
    } else {
      removeNotificationsForEvent(id);
    }
  } catch {}
}

export function clearStoredEvents() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_EVENTS);
    broadcastEventsUpdated();
  } catch {}
}
