export type GuestListEntry = {
  id?: string;
  email?: string;
  name?: string;
  status?: string;
  [field: string]: unknown;
};

function isGuestListEntry(value: unknown): value is GuestListEntry {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseGuestLists(raw: string | null): Record<string, GuestListEntry[]> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([eventId, entries]) => [
      eventId,
      Array.isArray(entries) ? entries.filter(isGuestListEntry) : [],
    ]));
  } catch {
    return {};
  }
}
