"use client";

import { fetchWithSupabaseSession } from "@/lib/audit-log-client";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "Student" | "Organizer" | "Admin";
  status: "Active" | "Pending" | "Suspended";
  joined: string;
  joinedAt?: string; // ISO 8601 string for precise real-time dynamic calculations & sorting
  avatarUrl?: string;
  phone?: string;
  address?: string;
}

export const USERS_STORE_KEY = "spott_admin_users";
export const SIGNUP_STORE_KEY = "spott_signed_up_users";
export const USERS_UPDATED_EVENT = "spott_users_updated";
export const DELETED_USERS_KEY = "spott_deleted_user_ids";

const seedYear = 2026;
let adminUsersSnapshot: AdminUser[] = [];

// Seed initial users with deterministic ISO dates
export const INITIAL_ADMIN_USERS: AdminUser[] = [
  {
    id: "u-1",
    name: "SuperAdmin",
    email: "admin@spott.ph",
    role: "Admin",
    status: "Active",
    joined: `Sep 20, ${seedYear}`,
    joinedAt: new Date(seedYear, 8, 20, 8, 0, 0).toISOString(),
  },
  {
    id: "u-2",
    name: "Metro Creative Group",
    email: "mcg@spott.ph",
    role: "Organizer",
    status: "Active",
    joined: `Sep 20, ${seedYear}`,
    joinedAt: new Date(seedYear, 8, 20, 9, 30, 0).toISOString(),
  },
  {
    id: "u-3",
    name: "Juan Dela Cruz",
    email: "jdc@spott.ph",
    role: "Student",
    status: "Active",
    joined: `Sep 20, ${seedYear}`,
    joinedAt: new Date(seedYear, 8, 20, 10, 15, 0).toISOString(),
  },
  {
    id: "u-4",
    name: "Vanguard Gaming League",
    email: "gamer@spott.ph",
    role: "Organizer",
    status: "Active",
    joined: `Sep 29, ${seedYear}`,
    joinedAt: new Date(seedYear, 8, 29, 14, 0, 0).toISOString(),
  },
  {
    id: "u-5",
    name: "Hobbyist Haven PH",
    email: "hobby@spott.ph",
    role: "Organizer",
    status: "Active",
    joined: `Sep 29, ${seedYear}`,
    joinedAt: new Date(seedYear, 8, 29, 11, 20, 0).toISOString(),
  },
  {
    id: "u-6",
    name: "Tech Manila Hub",
    email: "tech@spott.ph",
    role: "Organizer",
    status: "Active",
    joined: `Sep 29, ${seedYear}`,
    joinedAt: new Date(seedYear, 8, 29, 16, 45, 0).toISOString(),
  },
];

/**
 * Format real-time joined timestamp.
 * Returns live relative text ("Just now", "5m ago", "Today, 9:15 PM"),
 * full date/time for tooltip or subtitle, and a boolean isRecent.
 */
export function formatRealTimeJoined(user: { joined?: string; joinedAt?: string }): {
  display: string;
  relative: string;
  fullDate: string;
  isRecent: boolean;
} {
  const raw = user.joinedAt || user.joined;
  if (!raw) {
    return { display: "Just now", relative: "Just now", fullDate: "Just now", isRecent: true };
  }

  let d = new Date(raw);
  if (isNaN(d.getTime())) {
    d = new Date(`${raw} 00:00:00`);
  }
  if (isNaN(d.getTime())) {
    return { display: raw, relative: "", fullDate: raw, isRecent: false };
  }

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  const fullDate = `${dateStr} · ${timeStr}`;

  // Within 60 seconds
  if (diffSecs < 60) {
    return {
      display: "Just now",
      relative: "Just now",
      fullDate,
      isRecent: true,
    };
  }

  // Within 60 minutes
  if (diffMins < 60) {
    return {
      display: `${diffMins}m ago`,
      relative: `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`,
      fullDate,
      isRecent: true,
    };
  }

  // Today
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return {
      display: `Today, ${timeStr}`,
      relative: `${diffHours}h ago`,
      fullDate,
      isRecent: true,
    };
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return {
      display: `Yesterday, ${timeStr}`,
      relative: "Yesterday",
      fullDate,
      isRecent: false,
    };
  }

  // Within past 7 days
  if (diffDays <= 7) {
    return {
      display: `${dateStr}`,
      relative: `${diffDays}d ago`,
      fullDate,
      isRecent: false,
    };
  }

  // Older dates
  return {
    display: dateStr,
    relative: dateStr,
    fullDate,
    isRecent: false,
  };
}

/**
 * Loads the current list of admin users from localStorage.
 * Automatically synchronizes with SPOTT_ACCOUNTS, event organizers, and newly signed-up accounts.
 */
/** Current in-memory view of the authoritative users API response. */
export function getAdminUsers(): AdminUser[] {
  return adminUsersSnapshot;
}

/**
 * Updates the short-lived in-memory view and broadcasts within this browser.
 */
export function saveAdminUsers(list: AdminUser[]) {
  if (typeof window === "undefined") return;
  adminUsersSnapshot = list;
  window.dispatchEvent(new Event(USERS_UPDATED_EVENT));
  try {
    const channel = new BroadcastChannel("spott_users_channel");
    channel.postMessage({ type: USERS_UPDATED_EVENT, timestamp: Date.now() });
    channel.close();
  } catch {}
}

/**
 * Permanently deletes a user by ID + email + name.
 * Records all three identifiers in the deleted-set so getAdminUsers() never re-adds them
 * from INITIAL_ADMIN_USERS, signup store, pending organizers, or events directory.
 */
/** Permanently deletes an account through the authenticated users API. */
export async function deleteAdminUser(user: { id: string; email: string; name?: string }): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const response = await fetchWithSupabaseSession("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, email: user.email }),
    });
    if (!response.ok) return false;
    saveAdminUsers(adminUsersSnapshot.filter((current) => current.id !== user.id && current.email.toLowerCase() !== user.email.toLowerCase()));
    return true;
  } catch {
    return false;
  }
}
/**
 * Registers or updates a user in the Admin user list.
 * Can be called whenever an account is created in signup or approved.
 */
export function registerUserInAdmin(user: {
  name: string;
  email: string;
  role: "user" | "organizer" | "admin" | "Student" | "Organizer" | "Admin";
  status?: "Active" | "Pending" | "Suspended";
  joinedAt?: string;
}): AdminUser {
  const current = getAdminUsers();
  const emailLower = user.email.trim().toLowerCase();
  const existingIdx = current.findIndex((u) => u.email.trim().toLowerCase() === emailLower);

  const roleFormatted: "Student" | "Organizer" | "Admin" =
    user.role === "Admin" || user.role === "admin"
      ? "Admin"
      : user.role === "Organizer" || user.role === "organizer"
      ? "Organizer"
      : "Student";

  const nowIso = user.joinedAt || new Date().toISOString();

  if (existingIdx !== -1) {
    current[existingIdx] = {
      ...current[existingIdx],
      name: user.name || current[existingIdx].name,
      role: roleFormatted,
      status: user.status || current[existingIdx].status || "Active",
      joinedAt: current[existingIdx].joinedAt || nowIso,
    };
    saveAdminUsers(current);
    return current[existingIdx];
  }

  const newUser: AdminUser = {
    id: `u-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: user.name,
    email: user.email.trim().toLowerCase(),
    role: roleFormatted,
    status: user.status || "Active",
    joinedAt: nowIso,
    joined: new Date(nowIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };

  current.unshift(newUser); // Place newest at the top
  saveAdminUsers(current);

  // Sync to backend API in background
  try {
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newUser.name,
        email: newUser.email,
        role: newUser.role.toLowerCase(),
      }),
    }).catch(() => {});
  } catch {}

  return newUser;
}

/**
 * Subscribes to real-time user updates across local events, cross-tab storage, and BroadcastChannel.
 */
export function subscribeToUsers(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleUpdate = () => {
    callback();
  };

  // Local window event
  window.addEventListener(USERS_UPDATED_EVENT, handleUpdate);

  // Cross-tab storage change
  const handleStorage = (e: StorageEvent) => {
    if (e.key === USERS_STORE_KEY || e.key === SIGNUP_STORE_KEY || e.key === null) {
      callback();
    }
  };
  window.addEventListener("storage", handleStorage);

  // Cross-tab BroadcastChannel
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel("spott_users_channel");
    channel.onmessage = (event) => {
      if (event.data?.type === USERS_UPDATED_EVENT) {
        callback();
      }
    };
  } catch {}

  // Tab switch / focus event
  window.addEventListener("focus", handleUpdate);

  return () => {
    window.removeEventListener(USERS_UPDATED_EVENT, handleUpdate);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("focus", handleUpdate);
    if (channel) {
      try {
        channel.close();
      } catch {}
    }
  };
}

/**
 * Background sync with Supabase /api/users
 */
export async function syncUsersFromApi(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetchWithSupabaseSession("/api/users");
    if (!res.ok) return;
    const data = await res.json();
    if (!data.users || !Array.isArray(data.users)) return;
    const users: AdminUser[] = data.users.filter((user: { user_id?: string; email?: string }) => user.user_id && user.email).map((user: { user_id: string; name?: string; display_name?: string; avatar_url?: string | null; phone?: string | null; address?: string | null; email: string; role?: string; created_at?: string }) => {
      const role: AdminUser['role'] = user.role === 'admin' ? 'Admin' : user.role === 'organizer' ? 'Organizer' : 'Student';
      const joinedAt = user.created_at || new Date().toISOString();
      return {
        id: user.user_id,
        name: user.display_name || user.name || user.email.split('@')[0],
        email: user.email,
        avatarUrl: user.avatar_url || undefined,
        phone: user.phone || undefined,
        address: user.address || undefined,
        role,
        status: 'Active' as const,
        joinedAt,
        joined: new Date(joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };
    });
    saveAdminUsers(users);
  } catch {}
}
