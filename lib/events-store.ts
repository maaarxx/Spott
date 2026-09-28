"use client";

import type { EventData } from "@/components/EventCard";
import { removeNotificationsForEvent } from "@/lib/notifications-store";

const STORAGE_KEY_EVENTS = "spott_events_directory";
const STORAGE_KEY_UPDATE_PULSE = "spott_events_last_update";
const BROADCAST_CHANNEL_NAME = "spott_events_sync";

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
    const list: EventData[] = JSON.parse(raw);
    return list.map((e) => {
      let lat = e.latitude;
      let lng = e.longitude;
      if (!lat || !lng) {
        if (e.location?.toLowerCase().includes("benilde") || e.location?.toLowerCase().includes("dac")) {
          lat = 14.5638;
          lng = 120.9965;
        } else if (e.location?.toLowerCase().includes("ust")) {
          lat = 14.6091;
          lng = 120.9898;
        } else if (e.location?.toLowerCase().includes("diliman") || e.location?.toLowerCase().includes("up")) {
          lat = 14.6537;
          lng = 121.0685;
        } else {
          lat = 14.5648;
          lng = 120.9932;
        }
      }
      return {
        ...e,
        latitude: lat,
        longitude: lng,
        image: e.image || e.coverImage,
        coverImage: e.coverImage || e.image,
      };
    });
  } catch {
    return [];
  }
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
