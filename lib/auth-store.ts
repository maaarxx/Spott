"use client";

export type RoleType = "user" | "organizer" | "admin";

export type SpottAccount = {
  email: string;
  password?: string;
  name: string;
  role: RoleType;
  organization?: string;
  destination: string;
};

export const SPOTT_ACCOUNTS: Record<string, SpottAccount> = {
  user: {
    email: "jdc@spott.ph",
    password: "user123",
    name: "Juan Dela Cruz",
    role: "user",
    destination: "/",
  },
  organizer: {
    email: "mcg@spott.ph",
    password: "organizer123",
    name: "Metro Creative Group",
    role: "organizer",
    organization: "Metro Creative Group",
    destination: "/organizer",
  },
  hobbyist: {
    email: "hobby@spott.ph",
    password: "hobby123",
    name: "Hobbyist Haven PH",
    role: "organizer",
    organization: "Hobbyist Haven PH",
    destination: "/organizer",
  },
  techtist: {
    email: "tech@spott.ph",
    password: "tech123",
    name: "Tech Manila Hub",
    role: "organizer",
    organization: "Tech Manila Hub",
    destination: "/organizer",
  },
  gamer: {
    email: "gamer@spott.ph",
    password: "gamer123",
    name: "Vanguard Gaming League",
    role: "organizer",
    organization: "Vanguard Gaming League",
    destination: "/organizer",
  },
  admin: {
    email: "admin@spott.ph",
    password: "admin123",
    name: "SuperAdmin",
    role: "admin",
    organization: "Spott Central Administration",
    destination: "/admin",
  },
};

const STORAGE_KEY_AUTH = "spott_current_user";

export function getCurrentUser(): SpottAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTH);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCurrentUser(account: SpottAccount) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(account));
    window.dispatchEvent(new Event("spott_auth_changed"));
  } catch {}
}

export function logout() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_AUTH);
    // Legacy global keys cleared so anonymous visitors never see leftover data
    localStorage.removeItem("spott_saved_events");
    localStorage.removeItem("spott_registered_events");
    localStorage.removeItem("spott_event_reminders");
    window.dispatchEvent(new Event("spott_auth_changed"));
    window.dispatchEvent(new Event("spott_saved_updated"));
    window.dispatchEvent(new Event("spott_registered_updated"));
  } catch {}
}

/**
 * Multi-tenant Isolated Saved & Registered Events Store
 * Each user's saved items, registrations, and reminders are keyed strictly by user email.
 * Anonymous users always return empty arrays and cannot persist data.
 */

export function getUserSavedEvents(email?: string): string[] {
  if (typeof window === "undefined") return [];
  const current = email ? { email } : getCurrentUser();
  if (!current?.email) return []; // Anonymous has NO saved events

  const userEmail = current.email.trim().toLowerCase();
  const key = `spott_saved_events_${userEmail}`;
  const raw = localStorage.getItem(key);

  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }

  // Restore/seed default saved events for Juan Dela Cruz if key wasn't initialized yet
  if (userEmail === "jdc@spott.ph") {
    const defaultJdcSaved = ["event-1", "event-2"];
    try {
      localStorage.setItem(key, JSON.stringify(defaultJdcSaved));
    } catch {}
    return defaultJdcSaved;
  }

  return [];
}

export function saveUserSavedEvents(ids: string[], email?: string) {
  if (typeof window === "undefined") return;
  const current = email ? { email } : getCurrentUser();
  if (!current?.email) return; // Anonymous cannot save

  const userEmail = current.email.trim().toLowerCase();
  const key = `spott_saved_events_${userEmail}`;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
    // Clear legacy global key so no cross-contamination occurs
    localStorage.removeItem("spott_saved_events");
    window.dispatchEvent(new Event("spott_saved_updated"));
  } catch {}
}

export function getUserRegisteredEvents(email?: string): string[] {
  if (typeof window === "undefined") return [];
  const current = getCurrentUser();
  const userEmail = (email || current?.email || "").trim().toLowerCase();
  if (!userEmail) return []; // Anonymous has NO registrations

  const key = `spott_registered_events_${userEmail}`;
  const seededKey = `spott_registered_reconciled_${userEmail}`;
  const registeredSet = new Set<string>();

  // 1. Read existing user-scoped registered key
  const raw = localStorage.getItem(key);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {}
  }

  // 2. Cross-reference spott_guest_lists to recover any RSVPs from guest lists on initial load
  try {
    const rawGuests = localStorage.getItem("spott_guest_lists");
    if (rawGuests) {
      const guestMap: unknown = JSON.parse(rawGuests);
      if (guestMap && typeof guestMap === "object" && !Array.isArray(guestMap)) {
        for (const [eventId, guestList] of Object.entries(guestMap)) {
          if (Array.isArray(guestList)) {
            const isAttending = guestList.some((guest: unknown) => {
              if (!guest || typeof guest !== "object") return false;
              const attendee = guest as { status?: unknown; email?: unknown; name?: unknown };
              const attendeeEmail = typeof attendee.email === "string" ? attendee.email.trim().toLowerCase() : "";
              const attendeeName = typeof attendee.name === "string" ? attendee.name.trim().toLowerCase() : "";
              return attendee.status !== "Declined" && (
                attendeeEmail === userEmail ||
                Boolean(current?.name && attendeeName === current.name.trim().toLowerCase())
              );
            });
            if (isAttending) registeredSet.add(eventId);
          }
        }
      }
    }
  } catch {}

  // 3. One-time initial seed recovery for demo user Juan Dela Cruz (only if never reconciled before)
  const alreadyReconciled = localStorage.getItem(seededKey) === "true";
  if (!alreadyReconciled && userEmail === "jdc@spott.ph") {
    try {
      const rawEvents = localStorage.getItem("spott_events_directory");
      if (rawEvents) {
        const eventsList = JSON.parse(rawEvents);
        if (Array.isArray(eventsList)) {
          eventsList.forEach((event: unknown) => {
            if (!event || typeof event !== "object") return;
            const storedEvent = event as { id?: unknown; registrations?: unknown };
            if (storedEvent.id && Number(storedEvent.registrations || 0) > 0) {
              registeredSet.add(String(storedEvent.id));
            }
          });
        }
      }
    } catch {}
    localStorage.setItem(seededKey, "true");
  }

  const result = Array.from(registeredSet);

  // Sync to user's storage key
  try {
    localStorage.setItem(key, JSON.stringify(result));
    localStorage.setItem(seededKey, "true");
  } catch {}

  return result;
}

export function saveUserRegisteredEvents(ids: string[], email?: string) {
  if (typeof window === "undefined") return;
  const current = email ? { email } : getCurrentUser();
  if (!current?.email) return; // Anonymous cannot register

  const userEmail = current.email.trim().toLowerCase();
  const key = `spott_registered_events_${userEmail}`;
  const seededKey = `spott_registered_reconciled_${userEmail}`;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
    localStorage.setItem(seededKey, "true");
    // Clear legacy global key so no cross-contamination occurs
    localStorage.removeItem("spott_registered_events");
    window.dispatchEvent(new Event("spott_registered_updated"));
  } catch {}
}

export function getUserReminders(email?: string): string[] {
  if (typeof window === "undefined") return [];
  const current = email ? { email } : getCurrentUser();
  if (!current?.email) return [];

  const userEmail = current.email.trim().toLowerCase();
  const key = `spott_event_reminders_${userEmail}`;
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function saveUserReminders(ids: string[], email?: string) {
  if (typeof window === "undefined") return;
  const current = email ? { email } : getCurrentUser();
  if (!current?.email) return;

  const userEmail = current.email.trim().toLowerCase();
  const key = `spott_event_reminders_${userEmail}`;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
    localStorage.removeItem("spott_event_reminders");
  } catch {}
}

/**
 * Wipes out all client mock data, local cache, stale notifications,
 * and resets verification/storage to a pristine baseline.
 */
export function wipeAllData() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("spott_current_user");
    localStorage.removeItem("spott_notifications");
    localStorage.removeItem("spott_saved_events");
    localStorage.removeItem("spott_verification_state");
    localStorage.removeItem("spott_verification_state_v1");
    localStorage.removeItem("spott_organizer_events");
    localStorage.removeItem("spott_admin_events");
    localStorage.removeItem("spott_event_draft");
    localStorage.removeItem("spott_events_directory");
    localStorage.removeItem("spott_guest_lists");
    // Also request server database purge asynchronously
    try {
      fetch("/api/admin/clear-data", { method: "POST" }).catch(() => {});
    } catch {}
    window.dispatchEvent(new Event("spott_auth_changed"));
    window.dispatchEvent(new Event("spott_notifications_updated"));
    window.dispatchEvent(new Event("spott_verification_updated"));
    window.dispatchEvent(new Event("spott_saved_updated"));
    window.dispatchEvent(new Event("spott_events_updated"));
  } catch {}
}
