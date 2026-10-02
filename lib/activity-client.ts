"use client";

import { getOrCreateVisitorId } from "./views-store";

type ActivityEvent = {
  action: "nav_click" | "event_view";
  target_id?: string;
  path: string;
};

const QUEUE_MAX_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000;

const activityQueue: ActivityEvent[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

function flushQueue() {
  if (activityQueue.length === 0) return;

  const batch = activityQueue.splice(0, 20); // max 20 per request
  
  const payload = JSON.stringify({
    visitor_id: getOrCreateVisitorId(),
    events: batch,
  });

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon("/api/activity-events", blob);
    } else {
      fetch("/api/activity-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch (err) {
    // Drop silently on failure
  }

  // If there's more in the queue, schedule another flush soon
  if (activityQueue.length > 0) {
    scheduleFlush();
  }
}

function scheduleFlush() {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(flushQueue, FLUSH_INTERVAL_MS);
}

function initActivityTracker() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flushQueue();
    }
  };

  window.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", flushQueue);
}

export function trackActivity(event: ActivityEvent) {
  if (typeof window === "undefined") return;
  
  if (!initialized) initActivityTracker();

  if (activityQueue.length >= QUEUE_MAX_SIZE) {
    // Drop silently if queue is full
    return;
  }

  activityQueue.push({
    ...event,
    path: event.path.substring(0, 200),
  });
  scheduleFlush();
}
