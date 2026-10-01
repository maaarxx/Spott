"use client";

import type { EventData } from "@/components/EventCard";
import { useSyncExternalStore } from "react";

const BROADCAST_CHANNEL_NAME = "spott_events_sync";
let eventSnapshot: EventData[] = [];
const EMPTY_EVENTS: EventData[] = [];
const PUBLIC_EVENTS_CACHE_MS = 15_000;
let publicEventsCache: { events: EventData[]; expiresAt: number } | null = null;
let publicEventsRequest: Promise<EventData[]> | null = null;

function invalidatePublicEventsCache() {
  publicEventsCache = null;
  publicEventsRequest = null;
}

function normalizeEvent(event: EventData): EventData {
  let lat = typeof event.latitude === "string" ? parseFloat(event.latitude) : event.latitude;
  let lng = typeof event.longitude === "string" ? parseFloat(event.longitude) : event.longitude;
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    const loc = (event.location || event.city || "").toLowerCase();
    if (loc.includes("benilde") || loc.includes("dac") || loc.includes("sda") || loc.includes("csb")) {
      lat = 14.5638; lng = 120.9965;
    } else if (loc.includes("dlsu") || loc.includes("taft") || loc.includes("la salle")) {
      lat = 14.5648; lng = 120.9932;
    } else if (loc.includes("ust") || loc.includes("espana") || loc.includes("españa")) {
      lat = 14.6091; lng = 120.9898;
    } else if (loc.includes("diliman") || loc.includes("up") || loc.includes("upd")) {
      lat = 14.6537; lng = 121.0685;
    } else if (loc.includes("ateneo") || loc.includes("admu") || loc.includes("katipunan")) {
      lat = 14.6396; lng = 121.0777;
    } else if (loc.includes("bgc") || loc.includes("taguig") || loc.includes("bonifacio")) {
      lat = 14.5517; lng = 121.0504;
    } else if (loc.includes("makati") || loc.includes("ayala")) {
      lat = 14.5547; lng = 121.0244;
    } else if (loc.includes("intramuros")) {
      lat = 14.5898; lng = 120.9754;
    } else {
      lat = 14.5995; lng = 120.9842;
    }
  }
  return {
    ...event,
    latitude: lat,
    longitude: lng,
    verified: Boolean(event.verified),
    categories: Array.isArray(event.categories) ? event.categories : [event.category || "Community"].filter(Boolean),
    image: event.image || event.coverImage,
    coverImage: event.coverImage || event.image,
    capacity: typeof event.capacity === "number" ? event.capacity : (event.capacity ? Number(event.capacity) : 100),
  };
}

function publishUpdate() {
  if (typeof window === "undefined") return;
  invalidatePublicEventsCache();
  window.dispatchEvent(new Event("spott_events_updated"));
  try {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.postMessage({ type: "events_updated", timestamp: Date.now() });
    channel.close();
  } catch {}
}

export function broadcastEventsUpdated() {
  publishUpdate();
}

export function subscribeToEvents(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleCustom = () => {
    invalidatePublicEventsCache();
    callback();
  };
  window.addEventListener("spott_events_updated", handleCustom);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.onmessage = handleCustom;
  } catch {}
  return () => {
    window.removeEventListener("spott_events_updated", handleCustom);
    channel?.close();
  };
}

/** Deduplicate public feed requests and briefly reuse results across tab navigation. */
export function loadPublicEvents(): Promise<EventData[]> {
  if (publicEventsCache && publicEventsCache.expiresAt > Date.now()) {
    return Promise.resolve(publicEventsCache.events);
  }
  if (publicEventsRequest) return publicEventsRequest;

  publicEventsRequest = fetch("/api/events")
    .then(async (response) => {
      if (!response.ok) throw new Error("Unable to load events.");
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("Invalid events response.");
      saveStoredEvents(payload as EventData[], true);
      const events = eventSnapshot;
      publicEventsCache = { events, expiresAt: Date.now() + PUBLIC_EVENTS_CACHE_MS };
      return events;
    })
    .finally(() => {
      publicEventsRequest = null;
    });

  return publicEventsRequest;
}

/** Current-tab cache only. Supabase API responses are the durable source of truth. */
export function getStoredEvents(): EventData[] {
  return eventSnapshot;
}

export function useStoredEvents(): EventData[] {
  return useSyncExternalStore(subscribeToEvents, getStoredEvents, () => EMPTY_EVENTS);
}

/** Replace the snapshot with the latest authoritative event list returned by the API. */
export function saveStoredEvents(events: EventData[], broadcast = false) {
  eventSnapshot = events.map(normalizeEvent);
  if (broadcast) publishUpdate();
}

/** Optimistic, in-memory update. Callers must persist mutations through the API first. */
export function saveStoredEvent(event: EventData) {
  eventSnapshot = [normalizeEvent(event), ...eventSnapshot.filter((item) => item.id !== event.id)];
  publishUpdate();
}

export function deleteStoredEvent(id: string) {
  eventSnapshot = eventSnapshot.filter((event) => event.id !== id);
  publishUpdate();
}

export function clearStoredEvents() {
  eventSnapshot = [];
  publishUpdate();
}
