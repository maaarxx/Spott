"use client";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "Student" | "Organizer" | "Admin";
  status: "Active" | "Pending" | "Suspended";
  joined: string;
}

export const USERS_STORE_KEY = "spott_admin_users";
export const SIGNUP_STORE_KEY = "spott_signed_up_users";
export const USERS_UPDATED_EVENT = "spott_users_updated";

const currentYear = new Date().getFullYear();

export const INITIAL_ADMIN_USERS: AdminUser[] = [
  { id: "u-1", name: "SuperAdmin", email: "admin@spott.ph", role: "Admin", status: "Active", joined: `Jan 01, ${currentYear}` },
  { id: "u-2", name: "Metro Creative Group", email: "mcg@spott.ph", role: "Organizer", status: "Active", joined: `Jan 01, ${currentYear}` },
  { id: "u-3", name: "Juan Dela Cruz", email: "jdc@spott.ph", role: "Student", status: "Active", joined: `Jan 01, ${currentYear}` },
];

/**
 * Loads the current list of admin users from localStorage.
 * Automatically synchronizes with any signed-up users in `spott_signed_up_users` so new accounts always appear.
 */
export function getAdminUsers(): AdminUser[] {
  if (typeof window === "undefined") return INITIAL_ADMIN_USERS;
  try {
    const raw = localStorage.getItem(USERS_STORE_KEY);
    let list: AdminUser[] = raw ? JSON.parse(raw) : [...INITIAL_ADMIN_USERS];

    // Ensure initial users are present if list is empty
    if (!list || list.length === 0) {
      list = [...INITIAL_ADMIN_USERS];
    }

    // Auto-merge newly registered users from SIGNUP_STORE_KEY
    const signupsRaw = localStorage.getItem(SIGNUP_STORE_KEY);
    if (signupsRaw) {
      try {
        const signups = JSON.parse(signupsRaw);
        if (Array.isArray(signups)) {
          let updated = false;
          for (const s of signups) {
            if (!s?.email) continue;
            const sEmail = s.email.trim().toLowerCase();
            const exists = list.some((u) => u.email.trim().toLowerCase() === sEmail);
            if (!exists) {
              const roleFormatted: "Student" | "Organizer" | "Admin" =
                s.role === "admin" ? "Admin" : s.role === "organizer" ? "Organizer" : "Student";
              list.push({
                id: `u-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                name: s.name || s.email.split("@")[0],
                email: s.email,
                role: roleFormatted,
                status: "Active",
                joined: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
              });
              updated = true;
            }
          }
          if (updated) {
            localStorage.setItem(USERS_STORE_KEY, JSON.stringify(list));
          }
        }
      } catch {}
    }

    if (!raw) {
      localStorage.setItem(USERS_STORE_KEY, JSON.stringify(list));
    }

    return list;
  } catch {
    return INITIAL_ADMIN_USERS;
  }
}

/**
 * Saves the admin users list to localStorage and broadcasts update locally and across tabs.
 */
export function saveAdminUsers(list: AdminUser[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USERS_STORE_KEY, JSON.stringify(list));
    // Local window notification
    window.dispatchEvent(new Event(USERS_UPDATED_EVENT));
    // Cross-tab broadcast
    try {
      const channel = new BroadcastChannel("spott_users_channel");
      channel.postMessage({ type: USERS_UPDATED_EVENT, timestamp: Date.now() });
      channel.close();
    } catch {}
  } catch {}
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

  if (existingIdx !== -1) {
    current[existingIdx] = {
      ...current[existingIdx],
      name: user.name || current[existingIdx].name,
      role: roleFormatted,
      status: user.status || current[existingIdx].status || "Active",
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
    joined: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };

  current.push(newUser);
  saveAdminUsers(current);
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
