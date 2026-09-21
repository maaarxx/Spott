"use client";

export type RoleType = "user" | "organizer" | "admin";

export type SpottAccount = {
  email: string;
  password: string;
  name: string;
  role: RoleType;
  organization?: string;
  destination: string;
};

export const SPOTT_ACCOUNTS: Record<RoleType, SpottAccount> = {
  user: {
    email: "user@spott.ph",
    password: "user123",
    name: "Juan Dela Cruz",
    role: "user",
    destination: "/", // User route to Home as requested
  },
  organizer: {
    email: "organizer@spott.ph",
    password: "organizer123",
    name: "Metro Creative Group",
    role: "organizer",
    organization: "Metro Creative Group",
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
    window.dispatchEvent(new Event("spott_auth_changed"));
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
