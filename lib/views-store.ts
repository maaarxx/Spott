"use client";

import { getCurrentUser } from "./auth-store";

const STORAGE_KEY_VISITOR_ID = "spott_visitor_id";
const BROADCAST_VIEWS_CHANNEL = "spott_views_sync";

/**
 * 1. Visitor identification
 * - If the user is logged in, use their user ID / email.
 * - Otherwise, generate a random UUID as visitor_id and store it in a cookie,
 *   and reuse it on later visits.
 */
export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "server-visitor";

  const user = getCurrentUser();
  if (user?.email) {
    return `user:${user.email.trim().toLowerCase()}`;
  }

  // Check cookie
  try {
    const match = document.cookie.match(/spott_visitor_id=([^;]+)/);
    if (match && match[1]) {
      const id = decodeURIComponent(match[1]);
      return id;
    }
  } catch {}

  // Generate new UUID v4
  const newId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  try { document.cookie = `spott_visitor_id=${encodeURIComponent(newId)}; path=/; max-age=31536000; SameSite=Lax`; } catch {}

  return newId;
}

export function getViewsMap(): Record<string, number> {
  return {};
}

export function getUniqueViewsMap(): Record<string, number> {
  return {};
}

export function getEventViews(eventId: string, fallbackRegistrations: number = 0): number {
  if (!eventId) return 0;
  void fallbackRegistrations;
  return 0;
}

export function getEventUniqueViews(eventId: string, fallbackRegistrations: number = 0): number {
  if (!eventId) return 0;
  void fallbackRegistrations;
  return 0;
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

  window.addEventListener("spott_views_updated", handleCustom);

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(BROADCAST_VIEWS_CHANNEL);
      channel.onmessage = (msg) => callback(msg.data?.eventId);
    }
  } catch {}

  return () => {
    window.removeEventListener("spott_views_updated", handleCustom);
    try {
      channel?.close();
    } catch {}
  };
}
