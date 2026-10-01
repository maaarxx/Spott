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
}

export const USERS_STORE_KEY = "spott_admin_users";
export const SIGNUP_STORE_KEY = "spott_signed_up_users";
export const USERS_UPDATED_EVENT = "spott_users_updated";
export const DELETED_USERS_KEY = "spott_deleted_user_ids";

const seedYear = 2026;

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
export function getAdminUsers(): AdminUser[] {
  if (typeof window === "undefined") return INITIAL_ADMIN_USERS;
  try {
    const raw = localStorage.getItem(USERS_STORE_KEY);
    let list: AdminUser[] = raw ? JSON.parse(raw) : [...INITIAL_ADMIN_USERS];

    if (!list || list.length === 0) {
      list = [...INITIAL_ADMIN_USERS];
    }

    let updated = false;

    // 1. Ensure all default known accounts exist in the list and have joinedAt
    // ⚠ SKIP any seed user whose ID or email was explicitly deleted by an admin
    let deletedIds: Set<string> = new Set();
    let deletedEmails: Set<string> = new Set();
    let deletedNames: Set<string> = new Set();
    try {
      const delRaw = localStorage.getItem(DELETED_USERS_KEY);
      if (delRaw) {
        const delParsed: { ids: string[]; emails: string[]; names?: string[] } = JSON.parse(delRaw);
        deletedIds = new Set(delParsed.ids || []);
        deletedEmails = new Set((delParsed.emails || []).map((e) => e.toLowerCase()));
        deletedNames = new Set((delParsed.names || []).map((n) => n.toLowerCase()));
      }
    } catch {}

    // Metro Creative Group is the active verified demo organizer. A stale
    // local tombstone must not hide its account from the admin list.
    const metroAccount = INITIAL_ADMIN_USERS.find((user) => user.email.toLowerCase() === "mcg@spott.ph");
    if (metroAccount) {
      const removedMetroId = deletedIds.delete(metroAccount.id);
      const removedMetroEmail = deletedEmails.delete(metroAccount.email.toLowerCase());
      const removedMetroName = deletedNames.delete(metroAccount.name.toLowerCase());
      const removedMetroSlugEmail = deletedEmails.delete("metrocreativegroup@spott.ph");
      const removedMetroTombstone = removedMetroId || removedMetroEmail || removedMetroName || removedMetroSlugEmail;
      if (removedMetroTombstone) {
        localStorage.setItem(DELETED_USERS_KEY, JSON.stringify({
          ids: [...deletedIds],
          emails: [...deletedEmails],
          names: [...deletedNames],
        }));
      }
    }

    for (const initU of INITIAL_ADMIN_USERS) {
      // Don't re-add if an admin explicitly deleted this seed user
      if (
        deletedIds.has(initU.id) ||
        deletedEmails.has(initU.email.toLowerCase()) ||
        deletedNames.has(initU.name.toLowerCase())
      ) continue;
      const existing = list.find(
        (u) =>
          u.email.trim().toLowerCase() === initU.email.trim().toLowerCase() ||
          u.name.trim().toLowerCase() === initU.name.trim().toLowerCase()
      );
      if (!existing) {
        list.push({ ...initU });
        updated = true;
      } else if (
        !existing.joinedAt ||
        new Date(existing.joinedAt).getTime() !== new Date(initU.joinedAt || "").getTime() ||
        existing.joined !== initU.joined
      ) {
        existing.joinedAt = initU.joinedAt;
        existing.joined = initU.joined;
        updated = true;
      }
    }

    // 2. Auto-merge newly registered users from SIGNUP_STORE_KEY
    const signupsRaw = localStorage.getItem(SIGNUP_STORE_KEY);
    if (signupsRaw) {
      try {
        const signups = JSON.parse(signupsRaw);
        if (Array.isArray(signups)) {
          for (const s of signups) {
            if (!s?.email) continue;
            const sEmail = s.email.trim().toLowerCase();
            // Skip if this signup was explicitly deleted
            if (deletedEmails.has(sEmail)) continue;
            const existing = list.find((u) => u.email.trim().toLowerCase() === sEmail);
            const signupIso = s.createdAt || s.joinedAt || new Date().toISOString();
            if (!existing) {
              const roleFormatted: "Student" | "Organizer" | "Admin" =
                s.role === "admin" ? "Admin" : s.role === "organizer" ? "Organizer" : "Student";
              list.push({
                id: `u-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                name: s.name || s.email.split("@")[0],
                email: s.email,
                role: roleFormatted,
                status: "Active",
                joinedAt: signupIso,
                joined: new Date(signupIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
              });
              updated = true;
            } else if (!existing.joinedAt) {
              existing.joinedAt = signupIso;
              updated = true;
            }
          }
        }
      } catch {}
    }

    // 3. Auto-merge approved organizers from spott_pending_organizers
    const pendingRaw = localStorage.getItem("spott_pending_organizers");
    if (pendingRaw) {
      try {
        const pendingList = JSON.parse(pendingRaw);
        if (Array.isArray(pendingList)) {
          for (const p of pendingList) {
            if (!p?.email || p.status !== "approved") continue;
            const pEmail = p.email.trim().toLowerCase();
            // Skip if this organizer was explicitly deleted
            if (deletedEmails.has(pEmail)) continue;
            const existing = list.find((u) => u.email.trim().toLowerCase() === pEmail);
            const joinIso = p.decidedAt || p.submittedAt || new Date().toISOString();
            if (!existing) {
              list.push({
                id: p.id || `u-${Date.now()}`,
                name: p.name || p.email.split("@")[0],
                email: p.email,
                role: "Organizer",
                status: "Active",
                joinedAt: joinIso,
                joined: new Date(joinIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
              });
              updated = true;
            } else if (!existing.joinedAt) {
              existing.joinedAt = joinIso;
              updated = true;
            }
          }
        }
      } catch {}
    }

    // 4. Auto-detect any organizers from published events in directory
    const eventsRaw = localStorage.getItem("spott_events_directory");
    if (eventsRaw) {
      try {
        const evList = JSON.parse(eventsRaw);
        if (Array.isArray(evList)) {
          for (const ev of evList) {
            const orgName = (ev.organizer || "").trim();
            if (!orgName) continue;
            const orgNameLower = orgName.toLowerCase();
            // Skip if this organizer's name or slug email was explicitly deleted
            const orgSlug = orgNameLower.replace(/[^a-z0-9]/g, "");
            if (
              deletedNames.has(orgNameLower) ||
              deletedEmails.has(`${orgSlug}@spott.ph`) ||
              deletedEmails.has(ev.organizerEmail?.trim().toLowerCase() || "")
            ) continue;
            const existing = list.find(
              (u) =>
                u.name.trim().toLowerCase() === orgNameLower ||
                (u.email && u.email.toLowerCase().includes(orgSlug))
            );
            if (!existing) {
              const joinIso = ev.confirmedAt || new Date().toISOString();
              list.push({
                id: `u-org-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
                name: orgName,
                email: `${orgSlug}@spott.ph`,
                role: "Organizer",
                status: "Active",
                joinedAt: joinIso,
                joined: new Date(joinIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
              });
              updated = true;
            }
          }
        }
      } catch {}
    }

    // Ensure all items have joinedAt parsed if missing
    for (const u of list) {
      if (!u.joinedAt) {
        const parsed = new Date(u.joined);
        u.joinedAt = !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
        updated = true;
      }
    }

    // *** FINAL GATE: strip any user that is in the deleted set ***
    // This catches anything that slipped through all the intermediate checks above.
    const beforeFilter = list.length;
    list = list.filter((u) => {
      if (deletedIds.has(u.id)) return false;
      if (deletedEmails.has(u.email.trim().toLowerCase())) return false;
      if (deletedNames.has(u.name.trim().toLowerCase())) return false;
      const slugEmail = `${u.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}@spott.ph`;
      if (deletedEmails.has(slugEmail)) return false;
      return true;
    });
    if (list.length !== beforeFilter) updated = true;

    // Sort by joinedAt descending (newest joined first)
    list.sort((a, b) => {
      const tA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
      const tB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
      return tB - tA;
    });

    if (updated || !raw) {
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
 * Permanently deletes a user by ID + email + name.
 * Records all three identifiers in the deleted-set so getAdminUsers() never re-adds them
 * from INITIAL_ADMIN_USERS, signup store, pending organizers, or events directory.
 */
export function deleteAdminUser(user: { id: string; email: string; name?: string }): void {
  if (typeof window === "undefined") return;
  try {
    // 1. Add to deleted set (ids + emails + names)
    const delRaw = localStorage.getItem(DELETED_USERS_KEY);
    const del: { ids: string[]; emails: string[]; names: string[] } = delRaw
      ? JSON.parse(delRaw)
      : { ids: [], emails: [], names: [] };
    if (!del.ids) del.ids = [];
    if (!del.emails) del.emails = [];
    if (!del.names) del.names = [];

    if (!del.ids.includes(user.id)) del.ids.push(user.id);
    const emailLower = user.email.trim().toLowerCase();
    if (!del.emails.includes(emailLower)) del.emails.push(emailLower);
    if (user.name) {
      const nameLower = user.name.trim().toLowerCase();
      if (!del.names.includes(nameLower)) del.names.push(nameLower);
      // Also store the slug (used for auto-generated emails like "cityartssociety@spott.ph")
      const slugEmail = `${nameLower.replace(/[^a-z0-9]/g, "")}@spott.ph`;
      if (!del.emails.includes(slugEmail)) del.emails.push(slugEmail);
    }
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(del));

    // 2. Remove from the main users list
    const current = getAdminUsers();
    const nameLower = user.name?.trim().toLowerCase() || "";
    const next = current.filter(
      (u) =>
        u.id !== user.id &&
        u.email.trim().toLowerCase() !== emailLower &&
        (nameLower ? u.name.trim().toLowerCase() !== nameLower : true)
    );
    saveAdminUsers(next);

    // 3. Also remove from signup store so they can't re-appear via that path
    try {
      const signupsRaw = localStorage.getItem(SIGNUP_STORE_KEY);
      if (signupsRaw) {
        const signups = JSON.parse(signupsRaw);
        if (Array.isArray(signups)) {
          const filtered = signups.filter((signup: unknown) => {
            if (!signup || typeof signup !== "object") return true;
            const email = (signup as { email?: unknown }).email;
            return typeof email !== "string" || email.trim().toLowerCase() !== emailLower;
          });
          localStorage.setItem(SIGNUP_STORE_KEY, JSON.stringify(filtered));
        }
      }
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

    // Load deleted set so we never re-add explicitly deleted users from API
    let deletedIds: Set<string> = new Set();
    let deletedEmails: Set<string> = new Set();
    let deletedNames: Set<string> = new Set();
    try {
      const delRaw = localStorage.getItem(DELETED_USERS_KEY);
      if (delRaw) {
        const delParsed: { ids: string[]; emails: string[]; names?: string[] } = JSON.parse(delRaw);
        deletedIds = new Set(delParsed.ids || []);
        deletedEmails = new Set((delParsed.emails || []).map((e) => e.toLowerCase()));
        deletedNames = new Set((delParsed.names || []).map((n) => n.toLowerCase()));
      }
    } catch {}

    // Supabase is authoritative for accounts that still exist there. Clear any
    // stale local-only deletion marker so a live account (such as Metro's
    // organizer account) can reappear in the admin list after a browser refresh.
    let removedStaleDeletion = false;
    for (const su of data.users) {
      if (!su?.email) continue;
      const emailLower = su.email.trim().toLowerCase();
      const nameLower = (su.name || "").trim().toLowerCase();
      if (deletedEmails.delete(emailLower)) removedStaleDeletion = true;
      if (su.user_id && deletedIds.delete(su.user_id)) removedStaleDeletion = true;
      if (nameLower && deletedNames.delete(nameLower)) removedStaleDeletion = true;
    }
    if (removedStaleDeletion) {
      localStorage.setItem(DELETED_USERS_KEY, JSON.stringify({
        ids: [...deletedIds],
        emails: [...deletedEmails],
        names: [...deletedNames],
      }));
    }

    const current = getAdminUsers();
    let modified = false;

    for (const su of data.users) {
      if (!su.email) continue;
      const emailLower = su.email.trim().toLowerCase();
      const nameLower = (su.name || "").trim().toLowerCase();

      const existing = current.find((u) => u.email.trim().toLowerCase() === emailLower);
      if (!existing) {
        const roleFormatted: "Student" | "Organizer" | "Admin" =
          su.role === "admin" ? "Admin" : su.role === "organizer" ? "Organizer" : "Student";
        const joinIso = su.created_at || new Date().toISOString();
        current.push({
          id: su.user_id || `u-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: su.name || su.email.split("@")[0],
          email: su.email,
          role: roleFormatted,
          status: "Active",
          joinedAt: joinIso,
          joined: new Date(joinIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        });
        modified = true;
      }
    }

    if (modified) {
      saveAdminUsers(current);
    }
  } catch {}
}
