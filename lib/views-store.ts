"use client";

import { getCurrentUser } from "./auth-store";

const STORAGE_KEY_VIEWS = "spott_event_views";
const STORAGE_KEY_UNIQUE_VIEWS = "spott_event_unique_views";
const STORAGE_KEY_VISITOR_ID = "spott_visitor_id";
const BROADCAST_VIEWS_CHANNEL = "spott_views_sync";

/**
 * 1. Visitor identification
 * - If the user is logged in, use their user ID / email.
 * - Otherwise, generate a random UUID as visitor_id, store it in cookie & localStorage,
 *   and reuse it on later visits.
 */
export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "server-visitor";

  const user = getCurrentUser();
  if (user?.email) {
    return `user:${user.email.trim().toLowerCase()}`;
  }

  // Check localStorage first
  try {
    const stored = localStorage.getItem(STORAGE_KEY_VISITOR_ID);
    if (stored) return stored;
  } catch {}

  // Check cookie
  try {
    const match = document.cookie.match(/spott_visitor_id=([^;]+)/);
    if (match && match[1]) {
      const id = decodeURIComponent(match[1]);
      try {
        localStorage.setItem(STORAGE_KEY_VISITOR_ID, id);
      } catch {}
      return id;
    }
  } catch {}

  // Generate new UUID v4
  const newId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  try {
    localStorage.setItem(STORAGE_KEY_VISITOR_ID, newId);
    document.cookie = `spott_visitor_id=${encodeURIComponent(newId)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}

  return newId;
}

export function getViewsMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VIEWS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getUniqueViewsMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_UNIQUE_VIEWS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getEventViews(eventId: string, fallbackRegistrations: number = 0): number {
  if (!eventId) return 0;
  if (typeof window === "undefined") {
    return fallbackRegistrations > 0 ? fallbackRegistrations * 3 + 15 : 0;
  }

  const map = getViewsMap();
  if (typeof map[eventId] === "number") {
    return map[eventId];
  }

  // Calculate realistic initial baseline if not recorded yet
  let seed = 0;
  for (let i = 0; i < eventId.length; i++) {
    seed += eventId.charCodeAt(i);
  }
  const variance = (seed % 15) + 12;
  const initialViews =
    fallbackRegistrations > 0
      ? fallbackRegistrations * 3 + variance
      : Math.max(1, (seed % 20) + 14);

  map[eventId] = initialViews;
  try {
    localStorage.setItem(STORAGE_KEY_VIEWS, JSON.stringify(map));
  } catch {}

  return initialViews;
}

export function getEventUniqueViews(eventId: string, fallbackRegistrations: number = 0): number {
  if (!eventId) return 0;
  const uniqueMap = getUniqueViewsMap();
  if (typeof uniqueMap[eventId] === "number") {
    return uniqueMap[eventId];
  }
  const total = getEventViews(eventId, fallbackRegistrations);
  return Math.max(1, Math.round(total * 0.72));
}

/**
 * 2 & 4. Client-side trigger with SessionStorage guard and Server Deduplication
 * - Checks sessionStorage to avoid repeated calls within the same browsing session
 * - Sends view request to backend /api/views
 * - Server performs 24-hr dedupe check, bot check, and owner exclusion
 * - Increments count only if server returns counted: true
 */
export async function recordEventView(
  eventId: string,
  options?: { organizer?: string }
): Promise<{ counted: boolean; views: number }> {
  if (!eventId || typeof window === "undefined") {
    return { counted: false, views: 0 };
  }

  const map = getViewsMap();
  const currentCount = typeof map[eventId] === "number" ? map[eventId] : getEventViews(eventId);

  // Client-side SessionStorage guard:
  // Prevent double-counting on page refresh / strict mode within the same tab session
  const sessionKey = `spott_viewed_${eventId}`;
  let alreadySessionViewed = false;
  try {
    if (sessionStorage.getItem(sessionKey)) {
      alreadySessionViewed = true;
    }
  } catch {}

  if (alreadySessionViewed) {
    return { counted: false, views: currentCount };
  }

  const visitorId = getOrCreateVisitorId();
  const currentUser = getCurrentUser();

  try {
    // Send view registration to backend deduplication endpoint
    const response = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listing_id: eventId,
        visitor_id: visitorId,
        user_id: currentUser?.email ? `user:${currentUser.email.trim().toLowerCase()}` : undefined,
        user_organization: currentUser?.organization || currentUser?.name,
        organizer: options?.organizer,
      }),
    });

    const data = await response.json();

    // Mark in sessionStorage so future re-renders in this session are skipped immediately
    try {
      sessionStorage.setItem(sessionKey, "1");
    } catch {}

    if (data.counted) {
      const updatedCount = currentCount + 1;
      map[eventId] = updatedCount;

      try {
        localStorage.setItem(STORAGE_KEY_VIEWS, JSON.stringify(map));
      } catch {}

      // Update unique views
      const uniqueMap = getUniqueViewsMap();
      uniqueMap[eventId] = (uniqueMap[eventId] || Math.max(1, Math.round(currentCount * 0.72))) + 1;
      try {
        localStorage.setItem(STORAGE_KEY_UNIQUE_VIEWS, JSON.stringify(uniqueMap));
      } catch {}

      try {
        window.dispatchEvent(
          new CustomEvent("spott_views_updated", {
            detail: { eventId, views: updatedCount, counted: true },
          })
        );
        window.dispatchEvent(new Event("spott_events_updated"));
      } catch {}

      try {
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel(BROADCAST_VIEWS_CHANNEL);
          channel.postMessage({
            type: "view_recorded",
            eventId,
            views: updatedCount,
            counted: true,
          });
          channel.close();
        }
      } catch {}

      return { counted: true, views: updatedCount };
    } else {
      // Deduplicated or excluded (e.g. owner view, within 24 hours, or bot)
      return { counted: false, views: currentCount };
    }
  } catch {
    // If network fails, return current count without inflating
    return { counted: false, views: currentCount };
  }
}

export function subscribeToViews(callback: (eventId?: string) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustom = (event: Event) => {
    const eventId = (event as CustomEvent<{ eventId?: string }>).detail?.eventId;
    callback(eventId);
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY_VIEWS || e.key === STORAGE_KEY_UNIQUE_VIEWS) {
      callback();
    }
  };

  window.addEventListener("spott_views_updated", handleCustom);
  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(BROADCAST_VIEWS_CHANNEL);
      channel.onmessage = (msg) => callback(msg.data?.eventId);
    }
  } catch {}

  return () => {
    window.removeEventListener("spott_views_updated", handleCustom);
    window.removeEventListener("storage", handleStorage);
    try {
      channel?.close();
    } catch {}
  };
}
