"use client";

export interface UserProfile {
  email: string;
  displayName?: string;   // custom username / display name
  avatarUrl?: string;     // base64 data URL or remote URL
  phone?: string;
  address?: string;
  bio?: string;
  updatedAt?: string;
}

const PROFILE_PREFIX = "spott_user_profile_";
export const PROFILE_UPDATED_EVENT = "spott_profile_updated";

function profileKey(email: string): string {
  return `${PROFILE_PREFIX}${email.trim().toLowerCase()}`;
}

export function getUserProfile(email: string): UserProfile {
  if (typeof window === "undefined") return { email };
  try {
    const raw = localStorage.getItem(profileKey(email));
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {}
  return { email };
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  try {
    const updated: UserProfile = { ...profile, updatedAt: new Date().toISOString() };
    localStorage.setItem(profileKey(profile.email), JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { email: profile.email } }));
  } catch {}
}

export function subscribeToProfile(email: string, callback: (p: UserProfile) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail?.email || detail.email === email.trim().toLowerCase()) {
      callback(getUserProfile(email));
    }
  };
  window.addEventListener(PROFILE_UPDATED_EVENT, handler);
  return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler);
}

/** Returns the best avatar letter initials for a display name */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
