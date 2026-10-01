"use client";

import { fetchWithSupabaseSession } from '@/lib/audit-log-client';
import { getCurrentUser } from '@/lib/auth-store';

export interface ModerationSettings {
  capacityThreshold: number; // e.g. 200
  sensitivity: "Strict" | "Standard";
  autoFlagLargeEvents: boolean;
}

export const DEFAULT_MODERATION_KEYWORDS = [
  "unofficial party",
  "off-campus alcohol",
  "unauthorized vendor",
  "scalping",
  "pyrotechnics",
  "hazing",
];

export const DEFAULT_MODERATION_SETTINGS: ModerationSettings = {
  capacityThreshold: 200,
  sensitivity: "Strict",
  autoFlagLargeEvents: true,
};

const MODERATION_UPDATED_EVENT = "spott_moderation_updated";
let moderationKeywords = [...DEFAULT_MODERATION_KEYWORDS];
let moderationSettings = { ...DEFAULT_MODERATION_SETTINGS };

function publishModerationUpdate() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MODERATION_UPDATED_EVENT));
}

function applyConfig(payload: { keywords?: unknown; settings?: Partial<ModerationSettings> }) {
  if (Array.isArray(payload.keywords)) {
    moderationKeywords = [...new Set(payload.keywords.filter((keyword): keyword is string => typeof keyword === 'string').map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))];
  }
  if (payload.settings && typeof payload.settings === 'object') {
    moderationSettings = { ...DEFAULT_MODERATION_SETTINGS, ...payload.settings };
  }
  publishModerationUpdate();
}

export async function loadModerationConfig(): Promise<{ keywords: string[]; settings: ModerationSettings }> {
  const response = await fetchWithSupabaseSession('/api/moderation', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to load moderation settings.');
  applyConfig(payload);
  if (getCurrentUser()?.role === 'admin' && payload.legacyImported === false && typeof window !== 'undefined') {
    try {
      const oldKeywords = localStorage.getItem('spott_moderation_keywords');
      const oldSettings = localStorage.getItem('spott_moderation_settings');
      if (oldKeywords || oldSettings) {
        const legacyInput: { keywords?: string[]; settings?: ModerationSettings; legacyImport: boolean } = { legacyImport: true };
        if (oldKeywords) {
          const parsed = JSON.parse(oldKeywords);
          if (Array.isArray(parsed)) legacyInput.keywords = parsed;
        }
        if (oldSettings) legacyInput.settings = { ...DEFAULT_MODERATION_SETTINGS, ...JSON.parse(oldSettings) };
        if (legacyInput.keywords || legacyInput.settings) return await persistModerationConfig(legacyInput);
      }
    } catch {
      // Keep database values authoritative if an old local setting is invalid.
    }
  }
  return { keywords: getModerationKeywords(), settings: getModerationSettings() };
}

export async function persistModerationConfig(input: { keywords?: string[]; settings?: Partial<ModerationSettings>; legacyImport?: boolean }): Promise<{ keywords: string[]; settings: ModerationSettings }> {
  const response = await fetchWithSupabaseSession('/api/moderation', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to save moderation settings.');
  applyConfig(payload);
  return { keywords: getModerationKeywords(), settings: getModerationSettings() };
}

export function getModerationKeywords(): string[] {
  return [...moderationKeywords];
}

export function saveModerationKeywords(keywords: string[]): string[] {
  const cleaned = Array.from(new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)));
  moderationKeywords = cleaned;
  publishModerationUpdate();
  return [...cleaned];
}

export function addModerationKeyword(keyword: string): string[] {
  const current = getModerationKeywords();
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed || current.includes(trimmed)) return current;
  const updated = [...current, trimmed];
  return saveModerationKeywords(updated);
}

export function removeModerationKeyword(keyword: string): string[] {
  const current = getModerationKeywords();
  const updated = current.filter((k) => k.toLowerCase() !== keyword.toLowerCase());
  return saveModerationKeywords(updated);
}

export function resetModerationKeywords(): string[] {
  return saveModerationKeywords(DEFAULT_MODERATION_KEYWORDS);
}

export function getModerationSettings(): ModerationSettings {
  return { ...moderationSettings };
}

export function saveModerationSettings(settings: Partial<ModerationSettings>): ModerationSettings {
  const current = getModerationSettings();
  const updated: ModerationSettings = {
    ...current,
    ...settings,
    capacityThreshold: Math.max(10, Number(settings.capacityThreshold) || 200),
  };
  moderationSettings = updated;
  publishModerationUpdate();
  return updated;
}

export function checkEventForModeration(
  title: string = "",
  description: string = "",
  capacity: number = 0,
  rsvps: number = 0
): {
  isKeywordFlagged: boolean;
  matchedKeywords: string[];
  isLargeGathering: boolean;
  threshold: number;
} {
  const keywords = getModerationKeywords();
  const settings = getModerationSettings();
  const content = `${title} ${description}`.toLowerCase();

  const matchedKeywords = keywords.filter((k) => content.includes(k.toLowerCase()));
  const isKeywordFlagged = matchedKeywords.length > 0;
  const isLargeGathering = Math.max(capacity, rsvps) >= settings.capacityThreshold;

  return {
    isKeywordFlagged,
    matchedKeywords,
    isLargeGathering,
    threshold: settings.capacityThreshold,
  };
}

export function subscribeToModeration(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleUpdate = () => callback();
  window.addEventListener(MODERATION_UPDATED_EVENT, handleUpdate);
  return () => {
    window.removeEventListener(MODERATION_UPDATED_EVENT, handleUpdate);
  };
}
