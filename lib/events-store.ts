"use client";

import type { EventData } from "@/components/EventCard";

const STORAGE_KEY_EVENTS = "spott_events_directory";

export function getStoredEvents(): EventData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EVENTS);
    if (!raw) return [];
    return JSON.parse(raw);
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
    window.dispatchEvent(new Event("spott_events_updated"));
  } catch {}
}

export function deleteStoredEvent(id: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = getStoredEvents();
    const updated = existing.filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(updated));
    window.dispatchEvent(new Event("spott_events_updated"));
  } catch {}
}

export function clearStoredEvents() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_EVENTS);
    window.dispatchEvent(new Event("spott_events_updated"));
  } catch {}
}
