"use client";

import { addNotification } from "./notifications-store";
import { getCurrentUser } from "./auth-store";
import { fetchWithSupabaseSession } from "./audit-log-client";

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

const REMINDERS_UPDATED_EVENT = "spott_reminders_updated";
let reminderSnapshot: EventReminder[] = [];

function fromDatabase(row: Record<string, unknown>): EventReminder {
  return {
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    eventId: String(row.event_id || ""),
    eventTitle: String(row.event_title || ""),
    remindAt: String(row.remind_at || ""),
    offsetLabel: String(row.offset_label || ""),
    offsetMinutes: Number(row.offset_minutes || 0),
    sent: Boolean(row.sent),
    createdAt: String(row.created_at || ""),
  };
}

export async function loadUserReminders(): Promise<EventReminder[]> {
  const response = await fetchWithSupabaseSession("/api/reminders", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load reminders.");
  const rows = await response.json();
  reminderSnapshot = Array.isArray(rows) ? rows.map(fromDatabase) : [];
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REMINDERS_UPDATED_EVENT));
  return reminderSnapshot;
}

export function getAllReminders(): EventReminder[] {
  return reminderSnapshot;
}

export function saveAllReminders(reminders: EventReminder[]) {
  reminderSnapshot = reminders;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REMINDERS_UPDATED_EVENT));
}

export function getUserRemindersForEvent(eventId: string, userEmailOrId?: string): EventReminder[] {
  if (typeof window === "undefined") return [];
  const currentUser = getCurrentUser();
  const targetUser = (userEmailOrId || currentUser?.email || "").trim().toLowerCase();

  const all = getAllReminders();
  return all.filter(
    (r) =>
      r.eventId === eventId &&
      (!targetUser || r.userId.toLowerCase() === targetUser || r.userId.toLowerCase() === `user:${targetUser}` || Boolean(currentUser))
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
  try {
    const response = await fetchWithSupabaseSession("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: params.eventId,
        event_title: params.eventTitle,
        remind_at: remindAtIso,
        offset_label: params.offsetLabel,
        offset_minutes: params.offsetMinutes,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, error: payload.error || "Unable to save reminder." };
    const newReminder = fromDatabase(payload.reminder || {});
    import('./fetch-dedupe').then(m => m.invalidateCache('/api/reminders'));
    saveAllReminders([newReminder, ...reminderSnapshot.filter((reminder) => reminder.id !== newReminder.id && !(reminder.eventId === newReminder.eventId && reminder.offsetLabel === newReminder.offsetLabel))]);
    return { success: true, reminder: newReminder };
  } catch {
    return { success: false, error: "Unable to reach the database. Please try again." };
  }
}

export async function removeEventReminder(
  eventId: string,
  offsetLabel?: string,
  userEmailOrId?: string
): Promise<boolean> {
  void userEmailOrId;

  try {
    const response = await fetchWithSupabaseSession("/api/reminders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        offset_label: offsetLabel,
      }),
    });
    if (!response.ok) return false;
    import('./fetch-dedupe').then(m => m.invalidateCache('/api/reminders'));
    saveAllReminders(reminderSnapshot.filter((r) => r.eventId !== eventId || (offsetLabel && r.offsetLabel !== offsetLabel)));
    return true;
  } catch {
    return false;
  }
}

/**
 * 4. Reminders sync: If an event's date or time changes, recompute remind_at
 * for all pending reminders of that event.
 */
export async function recomputeRemindersForEvent(eventId: string, newDateString: string) {
  const eventTimeMs = new Date(
    newDateString.includes(" ") ? newDateString.replace(" ", "T") : newDateString
  ).getTime();
  if (isNaN(eventTimeMs)) return;

  const response = await fetchWithSupabaseSession("/api/reminders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId, event_date: new Date(eventTimeMs).toISOString() }),
  });
  if (!response.ok) throw new Error("Unable to reschedule reminders.");
  const payload = await response.json();
  const updatedRows = Array.isArray(payload.reminders) ? payload.reminders.map(fromDatabase) : [];
  import('./fetch-dedupe').then(m => m.invalidateCache('/api/reminders'));
  saveAllReminders([
    ...reminderSnapshot.filter((reminder) => reminder.eventId !== eventId),
    ...updatedRows,
  ]);
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
