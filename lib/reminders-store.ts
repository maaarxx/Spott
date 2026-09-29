"use client";

import { addNotification } from "./notifications-store";
import { getCurrentUser } from "./auth-store";

export interface EventReminder {
  id: string;
  userId: string;
  eventId: string;
  eventTitle: string;
  remindAt: string; // ISO string
  offsetLabel: string;
  offsetMinutes: number;
  sent: boolean;
  createdAt: string;
}

const STORAGE_KEY_REMINDERS = "spott_event_reminders_v2";
const REMINDERS_UPDATED_EVENT = "spott_reminders_updated";

export function getAllReminders(): EventReminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REMINDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAllReminders(reminders: EventReminder[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_REMINDERS, JSON.stringify(reminders));
    window.dispatchEvent(new Event(REMINDERS_UPDATED_EVENT));
  } catch {}
}

export function getUserRemindersForEvent(eventId: string, userEmailOrId?: string): EventReminder[] {
  if (typeof window === "undefined") return [];
  const currentUser = getCurrentUser();
  const targetUser = (userEmailOrId || currentUser?.email || "anonymous").trim().toLowerCase();

  const all = getAllReminders();
  return all.filter(
    (r) =>
      r.eventId === eventId &&
      (r.userId.toLowerCase() === targetUser || r.userId.toLowerCase() === `user:${targetUser}`)
  );
}

export function hasUserReminder(eventId: string, offsetLabel?: string, userEmailOrId?: string): boolean {
  const reminders = getUserRemindersForEvent(eventId, userEmailOrId);
  if (!offsetLabel) return reminders.length > 0;
  return reminders.some((r) => r.offsetLabel === offsetLabel);
}

export async function setEventReminder(params: {
  eventId: string;
  eventTitle: string;
  eventDate: string; // ISO or parseable date string
  offsetLabel: string; // e.g., "1 day before", "3 hours before", "1 hour before", "30 minutes before"
  offsetMinutes: number;
  userEmailOrId?: string;
}): Promise<{ success: boolean; reminder?: EventReminder; error?: string }> {
  const currentUser = getCurrentUser();
  const userId = (params.userEmailOrId || currentUser?.email || "anonymous").trim().toLowerCase();

  // Parse event date/time
  const eventTimeMs = new Date(params.eventDate.includes(" ") ? params.eventDate.replace(" ", "T") : params.eventDate).getTime();
  if (isNaN(eventTimeMs)) {
    return { success: false, error: "Invalid event date format." };
  }

  const remindAtMs = eventTimeMs - params.offsetMinutes * 60 * 1000;
  const nowMs = Date.now();

  if (remindAtMs <= nowMs) {
    return {
      success: false,
      error: `The reminder time (${params.offsetLabel}) is already in the past. Please choose a shorter interval.`,
    };
  }

  const remindAtIso = new Date(remindAtMs).toISOString();
  const all = getAllReminders();

  // Deduplicate on (userId, eventId, offsetLabel)
  const existingIdx = all.findIndex(
    (r) =>
      r.eventId === params.eventId &&
      (r.userId.toLowerCase() === userId || r.userId.toLowerCase() === `user:${userId}`) &&
      r.offsetLabel === params.offsetLabel
  );

  const newReminder: EventReminder = {
    id: `rem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    userId,
    eventId: params.eventId,
    eventTitle: params.eventTitle,
    remindAt: remindAtIso,
    offsetLabel: params.offsetLabel,
    offsetMinutes: params.offsetMinutes,
    sent: false,
    createdAt: new Date().toISOString(),
  };

  if (existingIdx !== -1) {
    all[existingIdx] = newReminder;
  } else {
    all.push(newReminder);
  }

  saveAllReminders(all);

  // Sync with backend API
  try {
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newReminder.id,
        user_id: userId,
        event_id: params.eventId,
        event_title: params.eventTitle,
        remind_at: remindAtIso,
        offset_label: params.offsetLabel,
      }),
    });
  } catch {}

  return { success: true, reminder: newReminder };
}

export async function removeEventReminder(
  eventId: string,
  offsetLabel?: string,
  userEmailOrId?: string
): Promise<boolean> {
  const currentUser = getCurrentUser();
  const userId = (userEmailOrId || currentUser?.email || "anonymous").trim().toLowerCase();

  const all = getAllReminders();
  const updated = all.filter((r) => {
    const isTargetUser = r.userId.toLowerCase() === userId || r.userId.toLowerCase() === `user:${userId}`;
    if (!isTargetUser || r.eventId !== eventId) return true;
    if (offsetLabel && r.offsetLabel !== offsetLabel) return true;
    return false; // delete this match
  });

  saveAllReminders(updated);

  try {
    await fetch("/api/reminders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        user_id: userId,
        offset_label: offsetLabel,
      }),
    });
  } catch {}

  return true;
}

/**
 * 4. Reminders sync: If an event's date or time changes, recompute remind_at
 * for all pending reminders of that event.
 */
export function recomputeRemindersForEvent(eventId: string, newDateString: string) {
  const eventTimeMs = new Date(
    newDateString.includes(" ") ? newDateString.replace(" ", "T") : newDateString
  ).getTime();
  if (isNaN(eventTimeMs)) return;

  const all = getAllReminders();
  let modified = false;

  const updated = all.map((r) => {
    if (r.eventId === eventId) {
      const newRemindAtMs = eventTimeMs - r.offsetMinutes * 60 * 1000;
      modified = true;
      return {
        ...r,
        remindAt: new Date(newRemindAtMs).toISOString(),
        // If the new reminder time is in the future, allow it to trigger again
        sent: newRemindAtMs <= Date.now() ? r.sent : false,
      };
    }
    return r;
  });

  if (modified) {
    saveAllReminders(updated);
  }
}

/**
 * 3. Scheduler: checks pending reminders where remindAt <= now() and fires
 * a 'reminder' notification to the user, then marks sent = true.
 */
export function processDueReminders(): number {
  if (typeof window === "undefined") return 0;
  const all = getAllReminders();
  const nowMs = Date.now();
  let triggeredCount = 0;
  let modified = false;

  const updated = all.map((r) => {
    if (!r.sent && new Date(r.remindAt).getTime() <= nowMs) {
      triggeredCount++;
      modified = true;

      // Send user-side Reminder Notification
      addNotification({
        type: "reminder",
        title: `Reminder: "${r.eventTitle}"`,
        message: `Your upcoming event "${r.eventTitle}" starts soon (${r.offsetLabel}). Make sure to check your directions and ticket pass!`,
        targetRole: "user",
        link: `/events/${r.eventId}`,
      });

      return { ...r, sent: true };
    }
    return r;
  });

  if (modified) {
    saveAllReminders(updated);
  }

  return triggeredCount;
}

export function subscribeToReminders(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(REMINDERS_UPDATED_EVENT, callback);
  return () => window.removeEventListener(REMINDERS_UPDATED_EVENT, callback);
}
