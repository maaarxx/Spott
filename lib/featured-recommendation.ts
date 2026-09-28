import type { EventData } from "@/components/EventCard";

export interface FeaturedRecommendationOptions {
  limit?: number;
  userInterests?: string[];
  maxPerCategory?: number;
}

export interface ScoredEvent {
  event: EventData;
  score: number;
  factors: {
    popularity: number;
    recency: number;
    relevance: number;
    trending: number;
    newness: number;
  };
  reason: "Trending" | "Popular" | "Happening Soon" | "Recommended for You" | "New" | "Featured";
}

/**
 * Featured Events Recommendation Algorithm
 * 
 * Formula:
 * Featured Score = (0.30 * Popularity) + (0.25 * Recency) + (0.20 * Relevance) + (0.15 * Trending) + (0.10 * Newness)
 */
export function getRecommendedFeaturedEvents(
  allEvents: EventData[],
  savedEventIds: string[] = [],
  options: FeaturedRecommendationOptions = {}
): ScoredEvent[] {
  const { limit = 6, userInterests = [], maxPerCategory = 2 } = options;
  const now = new Date();
  const nowTime = now.getTime();

  // 1. FILTERING (Hard Gates)
  const validEvents = allEvents.filter((evt) => {
    if (!evt || !evt.id || !evt.title?.trim()) return false;
    if (evt.status === "cancelled" || evt.status === "past") return false;
    if (!evt.location?.trim() || evt.location === "TBA") return false;

    // Check expiration
    try {
      const parsedDate = new Date(evt.date.replace(" ", "T"));
      if (isNaN(parsedDate.getTime())) return false;
      // Must not be expired (must be now or in future)
      if (parsedDate.getTime() < nowTime - 2 * 60 * 60 * 1000) return false; // allow 2h grace for live ongoing events
    } catch {
      return false;
    }

    return true;
  });

  // Deduplicate
  const uniqueMap = new Map<string, EventData>();
  validEvents.forEach((e) => {
    if (!uniqueMap.has(e.id)) uniqueMap.set(e.id, e);
  });
  const candidates = Array.from(uniqueMap.values());

  if (candidates.length === 0) return [];

  // Find max values for normalization
  const maxRegistrations = Math.max(1, ...candidates.map((e) => e.registrations || 0));

  // 2. SCORING EVERY EVENT
  const scoredList: ScoredEvent[] = candidates.map((evt) => {
    const parsedDate = new Date(evt.date.replace(" ", "T"));
    const eventTime = parsedDate.getTime();
    const daysUntil = Math.max(0, (eventTime - nowTime) / (1000 * 60 * 60 * 24));

    // A. Popularity (30%)
    // Based on registrations and whether users bookmarked/saved it
    const isSavedByCurUser = savedEventIds.includes(evt.id) ? 1.0 : 0.0;
    const regScore = (evt.registrations || 0) / maxRegistrations;
    const popularity = Math.min(1.0, 0.7 * regScore + 0.3 * (isSavedByCurUser ? 1.0 : regScore > 0 ? 0.4 : 0.1));

    // B. Recency (25%)
    // Events happening soon receive highest scores (next 1-14 days), decreases as date gets farther
    let recency = 0.05;
    if (daysUntil <= 14) {
      recency = 1.0 - (daysUntil / 14) * 0.45; // 1.0 down to 0.55
    } else if (daysUntil <= 60) {
      recency = Math.max(0.05, 0.55 - ((daysUntil - 14) / 46) * 0.45); // 0.55 down to 0.10
    }

    // C. User Interest / Relevance (20%)
    // Compare category with user preferences. If user has no preference, neutral (0.5).
    let relevance = 0.5; // neutral
    if (userInterests.length > 0) {
      const matchesCategory = (evt.categories || []).some((c) =>
        userInterests.some((ui) => ui.toLowerCase() === c.toLowerCase())
      );
      relevance = matchesCategory ? 1.0 : 0.2;
    }

    // D. Trending / Engagement (15%)
    // Events with confirmed registrations or verified active status
    let trending = 0.4;
    if (evt.confirmedAt) {
      const daysSinceConfirmed = (nowTime - new Date(evt.confirmedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceConfirmed <= 7) {
        trending = Math.min(1.0, 0.6 + (0.4 * regScore));
      }
    } else if (evt.registrations && evt.registrations > 5) {
      trending = Math.min(1.0, 0.5 + (0.5 * regScore));
    }

    // E. Newness (10%)
    // Newly added events receive a temporary boost
    let newness = 0.1;
    let createdAtTime = nowTime;
    if (evt.confirmedAt) {
      createdAtTime = new Date(evt.confirmedAt).getTime();
    } else if (evt.id.startsWith("event-")) {
      const ts = parseInt(evt.id.replace("event-", ""), 10);
      if (!isNaN(ts)) createdAtTime = ts;
    }
    const daysSinceCreation = Math.max(0, (nowTime - createdAtTime) / (1000 * 60 * 60 * 24));
    if (daysSinceCreation <= 3) newness = 1.0;
    else if (daysSinceCreation <= 7) newness = 0.7;
    else if (daysSinceCreation <= 14) newness = 0.4;
    else newness = 0.1;

    // Weighted Total Score
    const finalScore = Number(
      (
        0.30 * popularity +
        0.25 * recency +
        0.20 * relevance +
        0.15 * trending +
        0.10 * newness
      ).toFixed(4)
    );

    // Explainability Reason: pick strongest characteristic
    let reason: ScoredEvent["reason"] = "Featured";
    if (trending >= 0.75) {
      reason = "Trending";
    } else if (popularity >= 0.70) {
      reason = "Popular";
    } else if (daysUntil <= 3) {
      reason = "Happening Soon";
    } else if (relevance >= 0.9 && userInterests.length > 0) {
      reason = "Recommended for You";
    } else if (newness >= 0.8) {
      reason = "New";
    } else if (daysUntil <= 7) {
      reason = "Happening Soon";
    }

    return {
      event: {
        ...evt,
        featuredReason: reason,
      },
      score: finalScore,
      factors: {
        popularity: Number(popularity.toFixed(2)),
        recency: Number(recency.toFixed(2)),
        relevance: Number(relevance.toFixed(2)),
        trending: Number(trending.toFixed(2)),
        newness: Number(newness.toFixed(2)),
      },
      reason,
    };
  });

  // 3. RANKING
  scoredList.sort((a, b) => b.score - a.score);

  // 4. DIVERSITY ENFORCEMENT
  // Do not let a single category dominate the featured list
  const selected: ScoredEvent[] = [];
  const categoryCounts = new Map<string, number>();
  const deferred: ScoredEvent[] = [];

  for (const item of scoredList) {
    const primaryCat = item.event.categories?.[0] || "General";
    const currentCount = categoryCounts.get(primaryCat) || 0;

    if (currentCount < maxPerCategory) {
      selected.push(item);
      categoryCounts.set(primaryCat, currentCount + 1);
    } else {
      deferred.push(item);
    }

    if (selected.length >= limit) break;
  }

  // If diversity constraint left us with fewer than limit, fill from deferred
  if (selected.length < limit && deferred.length > 0) {
    for (const item of deferred) {
      selected.push(item);
      if (selected.length >= limit) break;
    }
  }

  return selected;
}
