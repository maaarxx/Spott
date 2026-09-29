"use client";

export const DEFAULT_APP_CATEGORIES: string[] = [
  "Music & Concerts",
  "Hobbies & Collectibles",
  "Tech & Innovation",
  "Esports & Gaming",
  "Art & Culture",
  "Food & Drinks",
  "Night Markets",
  "School Events",
  "Workshops",
  "Sports & Fitness",
  "Comedy & Entertainment",
  "Outdoor & Adventure",
  "Networking & Business",
];

const STORAGE_KEY_CUSTOM_CATEGORIES = "spott_custom_categories";

type EventSearchData = {
  title?: string;
  location?: string;
  city?: string;
  address?: string;
  venue?: string;
  venue_name?: string;
  location_name?: string;
  locations?: { address?: string; venue_name?: string };
  description?: string;
  organizer?: string;
  categories?: string[];
  category?: string;
};

export function getCustomCategories(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_CATEGORIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string" && c.trim()) : [];
  } catch {
    return [];
  }
}

export function saveCustomCategory(category: string): void {
  if (typeof window === "undefined" || !category) return;
  const trimmed = category.trim();
  if (!trimmed) return;

  try {
    const current = getCustomCategories();
    if (!current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...current, trimmed];
      localStorage.setItem(STORAGE_KEY_CUSTOM_CATEGORIES, JSON.stringify(updated));
      window.dispatchEvent(new Event("spott_categories_updated"));
    }
  } catch {}
}

/**
 * Returns deduplicated list of categories from:
 * 1. Default canonical app categories
 * 2. Custom categories created by organizers
 * 3. Any categories present in active events
 */
export function getAllCategories(events: { categories?: string[]; category?: string }[] = []): string[] {
  const result: string[] = [...DEFAULT_APP_CATEGORIES];
  const seenLower = new Set(result.map((c) => c.toLowerCase()));

  // 1. Add saved custom categories
  const customList = getCustomCategories();
  for (const cat of customList) {
    const trimmed = cat.trim();
    if (trimmed && !seenLower.has(trimmed.toLowerCase())) {
      seenLower.add(trimmed.toLowerCase());
      result.push(trimmed);
    }
  }

  // 2. Add categories from events if any exist that aren't yet registered
  for (const e of events) {
    const list = Array.isArray(e.categories)
      ? e.categories
      : (e.category ? [e.category] : []);

    for (const raw of list) {
      if (!raw || typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();

      // Normalize common short versions to standard canonical names
      if (lower === "music" || lower === "concerts") {
        continue;
      }
      if (lower === "tech" || lower === "innovations" || lower === "tech and innovation") {
        continue;
      }
      if (lower === "gaming" || lower === "esports") {
        continue;
      }
      if (lower === "hobbies" || lower === "collectibles") {
        continue;
      }

      if (!seenLower.has(lower)) {
        seenLower.add(lower);
        result.push(trimmed);
      }
    }
  }

  return result;
}

export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  "music & concerts": [
    "music", "concert", "concerts", "gig", "gigs", "live band", "acoustic", "band", "bands", "orchestra", "indie soundscapes", "soundscapes", "audio", "jam"
  ],
  "hobbies & collectibles": [
    "hobby", "hobbies", "collectibles", "collectible", "cards", "card", "pokemon", "gacha", "anime", "tcg", "toys", "figures", "manga", "cosplay"
  ],
  "tech & innovation": [
    "tech", "technology", "innovation", "innovations", "developer", "coding", "software", "ai", "hardware", "gadgets", "apple", "samsung", "ios", "android"
  ],
  "esports & gaming": [
    "esports", "gaming", "gamer", "game", "games", "valorant", "mlbb", "hok", "league of legends", "tournament", "lan"
  ],
  "art & culture": [
    "art", "arts", "culture", "exhibition", "gallery", "painting", "visual arts", "museum"
  ],
  "food & drinks": [
    "food", "drinks", "drink", "dining", "culinary", "bazaar", "coffee", "cafe"
  ],
  "night markets": [
    "market", "markets", "night market", "bazaar", "pop-up"
  ],
  "school events": [
    "school", "campus", "university", "college", "student"
  ],
  "workshops": [
    "workshop", "workshops", "seminar", "masterclass", "training", "bootcamp"
  ],
  "sports & fitness": [
    "sports", "sport", "fitness", "run", "marathon", "yoga", "gym"
  ],
  "comedy & entertainment": [
    "comedy", "standup", "entertainment", "show", "open mic"
  ],
  "outdoor & adventure": [
    "outdoor", "adventure", "hiking", "camp", "camping", "trail"
  ],
  "networking & business": [
    "networking", "business", "summit", "conference", "startup"
  ],
};

/**
 * Robust category matching:
 * Matches "Music" with "Music & Concerts", "Tech" with "Tech & Innovation",
 * "Hobbies" with "Hobbies & Collectibles", "Gaming" with "Esports & Gaming",
 * or exact matches for custom categories.
 */
export function matchesCategory(
  eventCategories: string[] | string | undefined,
  selectedCategory: string
): boolean {
  if (!selectedCategory || selectedCategory === "All" || selectedCategory === "All categories") {
    return true;
  }
  const cats = Array.isArray(eventCategories)
    ? eventCategories
    : (eventCategories ? [eventCategories] : []);

  if (cats.length === 0) return false;

  const sel = selectedCategory.toLowerCase().trim();
  const selWords = sel.split(/[\s&,/]+/).filter((w) => w.length > 2);

  return cats.some((cat) => {
    if (!cat) return false;
    const c = cat.toLowerCase().trim();
    if (c === sel) return true;
    if (c.includes(sel) || sel.includes(c)) return true;
    const cWords = c.split(/[\s&,/]+/).filter((w) => w.length > 2);
    if (selWords.some((sw) => cWords.includes(sw))) return true;

    // Check synonym groups
    for (const [groupName, syns] of Object.entries(CATEGORY_SYNONYMS)) {
      const selMatchesGroup = groupName === sel || groupName.includes(sel) || syns.includes(sel);
      const catMatchesGroup = groupName === c || groupName.includes(c) || syns.includes(c);
      if (selMatchesGroup && catMatchesGroup) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Intelligent event search matching:
 * Searches across title, location, city, address, description, organizer,
 * categories, category synonyms, and handles singular/plural variants.
 */
export function matchesSearchQuery(
  event: EventSearchData,
  searchQuery: string
): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;

  const rawQ = searchQuery.toLowerCase().trim();
  const qWords = rawQ.split(/\s+/).filter(Boolean);

  // Generate stems (e.g. "concerts" -> "concert", "hobbies" -> "hobby")
  const stems = new Set<string>([rawQ]);
  if (rawQ.endsWith("ies") && rawQ.length > 4) {
    stems.add(rawQ.slice(0, -3) + "y");
  } else if (rawQ.endsWith("s") && rawQ.length > 3) {
    stems.add(rawQ.slice(0, -1));
  } else {
    stems.add(rawQ + "s");
  }

  const title = (event.title || "").toLowerCase();
  const location = typeof event.location === "string" ? event.location.toLowerCase() : "";
  const city = (event.city || "").toLowerCase();
  const address = (
    event.address ||
    event.venue ||
    event.venue_name ||
    event.location_name ||
    event.locations?.address ||
    event.locations?.venue_name ||
    ""
  ).toLowerCase();
  const desc = (event.description || "").toLowerCase();
  const org = (event.organizer || "").toLowerCase();

  const rawCats: string[] = Array.isArray(event.categories)
    ? event.categories
    : event.category
    ? [event.category]
    : [];
  const cats = rawCats.filter(Boolean).map((c) => c.toLowerCase());

  // Combined searchable text
  const combinedText = `${title} ${location} ${city} ${address} ${desc} ${org} ${cats.join(" ")}`;

  // 1. Direct text match with raw query or any stem
  for (const stem of stems) {
    if (combinedText.includes(stem)) {
      return true;
    }
  }

  // 2. Category matching: Check if search query matches any category via matchesCategory or synonyms
  for (const cat of cats) {
    if (matchesCategory(cat, rawQ)) return true;
    for (const stem of stems) {
      if (matchesCategory(cat, stem)) return true;
    }
  }

  // 3. Check synonym mapping:
  // If query corresponds to a synonym group, does event have any category in that group?
  for (const [groupName, syns] of Object.entries(CATEGORY_SYNONYMS)) {
    const queryMatchesGroup =
      groupName.includes(rawQ) ||
      syns.some((syn) => stems.has(syn) || syn.includes(rawQ) || rawQ.includes(syn));

    if (queryMatchesGroup) {
      const eventBelongsToGroup = cats.some((cat) => {
        if (cat === groupName || groupName.includes(cat) || cat.includes(groupName)) return true;
        return syns.some((syn) => cat.includes(syn) || syn.includes(cat));
      });
      if (eventBelongsToGroup) return true;
    }
  }

  // 4. Multi-word queries: Check if every word matches in text or via category synonyms
  if (qWords.length > 1) {
    const allWordsMatch = qWords.every((word) => {
      const wordStem = word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
      if (combinedText.includes(word) || combinedText.includes(wordStem)) return true;

      return cats.some((cat) => {
        for (const [groupName, syns] of Object.entries(CATEGORY_SYNONYMS)) {
          if (
            (cat === groupName || groupName.includes(cat) || syns.some((s) => cat.includes(s))) &&
            (syns.includes(word) || syns.includes(wordStem) || groupName.includes(word))
          ) {
            return true;
          }
        }
        return false;
      });
    });

    if (allWordsMatch) return true;
  }

  return false;
}

/**
 * Checks whether an event has a direct text match in its title, location,
 * address, venue, city, description, or organizer (ignoring category filters).
 */
export function matchesDirectText(
  event: EventSearchData,
  query: string
): boolean {
  if (!query || !query.trim()) return false;
  const rawQ = query.toLowerCase().trim();
  const stems = [rawQ];
  if (rawQ.endsWith("ies") && rawQ.length > 4) stems.push(rawQ.slice(0, -3) + "y");
  else if (rawQ.endsWith("s") && rawQ.length > 3) stems.push(rawQ.slice(0, -1));
  else stems.push(rawQ + "s");

  const title = (event.title || "").toLowerCase();
  const location = typeof event.location === "string" ? event.location.toLowerCase() : "";
  const city = (event.city || "").toLowerCase();
  const address = (
    event.address ||
    event.venue ||
    event.venue_name ||
    event.location_name ||
    event.locations?.address ||
    event.locations?.venue_name ||
    ""
  ).toLowerCase();
  const desc = (event.description || "").toLowerCase();
  const org = (event.organizer || "").toLowerCase();

  const text = `${title} ${location} ${city} ${address} ${desc} ${org}`;
  return stems.some((s) => text.includes(s));
}
