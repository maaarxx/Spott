"use client";

import { createClient as createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { fetchWithSupabaseSession } from '@/lib/audit-log-client';

export type RoleType = "user" | "organizer" | "admin";

export type SpottAccount = {
  email: string;
  password?: string;
  name: string;
  displayName?: string;
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

export function clearLocalAuthState() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_AUTH);
    window.dispatchEvent(new Event("spott_auth_changed"));
  } catch {}
}

/** Refresh the display cache from the authenticated Supabase profile. The
 * database and verified Supabase session remain authoritative; local storage
 * is only a synchronous client cache for existing UI components. */
export async function refreshCurrentUserFromDatabase(): Promise<SpottAccount | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetchWithSupabaseSession('/api/account', { cache: 'no-store' });
    if (response.status === 401) {
      const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const cached = getCurrentUser();
      if (!(isLocal && cached && Object.values(SPOTT_ACCOUNTS).some((account) => account.email === cached.email))) {
        clearLocalAuthState();
      }
      return null;
    }
    if (!response.ok) return getCurrentUser();
    const payload = await response.json();
    const profile = payload.account;
    if (!profile?.email || !['user', 'organizer', 'admin'].includes(profile.role)) return null;
    const account: SpottAccount = {
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      ...(profile.display_name ? { displayName: profile.display_name } : {}),
      role: profile.role,
      destination: profile.role === 'admin' ? '/admin' : profile.role === 'organizer' ? '/organizer' : '/',
      ...(profile.organization ? { organization: profile.organization } : {}),
    };
    setCurrentUser(account);
    return account;
  } catch {
    return getCurrentUser();
  }
}

export async function logout() {
  if (typeof window === "undefined") return;
  try {
    const supabase = createSupabaseBrowserClient();
    const controller = new AbortController();
    const auditTimeout = window.setTimeout(() => controller.abort(), 1500);
    try {
      await fetchWithSupabaseSession('/api/audit-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth.logout' }),
        signal: controller.signal,
      });
    } catch {
      // A logging failure should never prevent the user from signing out.
    } finally {
      window.clearTimeout(auditTimeout);
    }
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Supabase sign-out failed:', error.message);
  } catch (error) {
    console.error('Supabase sign-out failed:', error);
  }
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
