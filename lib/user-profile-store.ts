"use client";

import { fetchWithSupabaseSession } from '@/lib/audit-log-client';

export interface UserProfile {
  email: string;
  displayName?: string;   // custom username / display name
  avatarUrl?: string;     // base64 data URL or remote URL
  phone?: string;
  address?: string;
  bio?: string;
  updatedAt?: string;
}

export const PROFILE_UPDATED_EVENT = "spott_profile_updated";
const profileCache = new Map<string, UserProfile>();

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getUserProfile(email: string): UserProfile {
  return profileCache.get(normalizedEmail(email)) || { email };
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  profileCache.set(normalizedEmail(profile.email), { ...profile, updatedAt: new Date().toISOString() });
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { email: normalizedEmail(profile.email) } }));
}

export async function loadUserProfileFromDatabase(email: string): Promise<UserProfile> {
  const response = await fetchWithSupabaseSession('/api/profile', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.profile) throw new Error(payload.error || 'Unable to load profile.');
  let profile = payload.profile as UserProfile;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`spott_user_profile_${normalizedEmail(email)}`);
      const legacy = raw ? JSON.parse(raw) as UserProfile : null;
      if (legacy) {
        const form = new FormData();
        let hasImport = false;
        for (const [field, existing, oldValue] of [
          ['display_name', profile.displayName, legacy.displayName],
          ['phone', profile.phone, legacy.phone],
          ['address', profile.address, legacy.address],
          ['bio', profile.bio, legacy.bio],
        ] as const) {
          if (!existing && typeof oldValue === 'string' && oldValue.trim()) {
            form.set(field, oldValue.trim());
            hasImport = true;
          }
        }
        if (!profile.avatarUrl && typeof legacy.avatarUrl === 'string') {
          const match = legacy.avatarUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
          if (match) {
            const binary = atob(match[2]);
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
            const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
            form.set('avatar', new File([bytes], `legacy-avatar.${ext}`, { type: match[1] }));
            hasImport = true;
          }
        }
        if (hasImport) {
          form.set('migration_mode', 'true');
          form.set('avatar_action', 'keep');
          const migrated = await fetchWithSupabaseSession('/api/profile', { method: 'PATCH', body: form });
          const migratedPayload = await migrated.json().catch(() => ({}));
          if (migrated.ok && migratedPayload.profile) {
            import('./fetch-dedupe').then(m => m.invalidateCache('/api/profile'));
            profile = migratedPayload.profile as UserProfile;
          }
        }
      }
    } catch {
      // Leave the original browser-local record intact if migration is unavailable.
    }
  }
  saveUserProfile({ ...profile, email });
  return getUserProfile(email);
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
