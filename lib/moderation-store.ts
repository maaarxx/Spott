"use client";

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

const KEYWORDS_STORAGE_KEY = "spott_moderation_keywords";
const SETTINGS_STORAGE_KEY = "spott_moderation_settings";
const MODERATION_UPDATED_EVENT = "spott_moderation_updated";

export function getModerationKeywords(): string[] {
  if (typeof window === "undefined") return DEFAULT_MODERATION_KEYWORDS;
  try {
    const raw = localStorage.getItem(KEYWORDS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(DEFAULT_MODERATION_KEYWORDS));
      return DEFAULT_MODERATION_KEYWORDS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MODERATION_KEYWORDS;
  } catch {
    return DEFAULT_MODERATION_KEYWORDS;
  }
}

export function saveModerationKeywords(keywords: string[]): string[] {
  if (typeof window === "undefined") return keywords;
  const cleaned = Array.from(new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)));
  try {
    localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(cleaned));
    window.dispatchEvent(new Event(MODERATION_UPDATED_EVENT));
  } catch {}
  return cleaned;
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
  if (typeof window === "undefined") return DEFAULT_MODERATION_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_MODERATION_SETTINGS));
      return DEFAULT_MODERATION_SETTINGS;
    }
    return { ...DEFAULT_MODERATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MODERATION_SETTINGS;
  }
}

export function saveModerationSettings(settings: Partial<ModerationSettings>): ModerationSettings {
  const current = getModerationSettings();
  const updated: ModerationSettings = {
    ...current,
    ...settings,
    capacityThreshold: Math.max(10, Number(settings.capacityThreshold) || 200),
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event(MODERATION_UPDATED_EVENT));
    } catch {}
  }
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
  window.addEventListener("storage", (e) => {
    if (e.key === KEYWORDS_STORAGE_KEY || e.key === SETTINGS_STORAGE_KEY) {
      callback();
    }
  });
  return () => {
    window.removeEventListener(MODERATION_UPDATED_EVENT, handleUpdate);
  };
}
