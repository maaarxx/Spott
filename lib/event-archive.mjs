const EVENT_ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function parseEventEndDate(event) {
  for (const raw of [event.endDate, event.date]) {
    if (!raw || !/\b\d{4}\b/.test(raw)) continue;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999` : raw;
    const timestamp = new Date(normalized).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

/** Archive past events and purge them at the 30-day expiry boundary. */
export function maintainEventArchive(events, now = Date.now()) {
  let changed = false;
  const retained = events.flatMap((event) => {
    const status = (event.status || "active").toLowerCase();
    const wasArchived = ["archived", "past", "completed", "done"].includes(status);
    const endTimestamp = parseEventEndDate(event);
    const hasEnded = endTimestamp !== null && endTimestamp <= now;
    const shouldArchive = wasArchived || (["active", "published"].includes(status) && hasEnded);

    if (!shouldArchive) return [event];

    const storedArchiveTime = event.archivedAt ? new Date(event.archivedAt).getTime() : NaN;
    const archivedAt = Number.isFinite(storedArchiveTime) ? event.archivedAt : new Date(now).toISOString();
    const expectedExpiry = new Date(new Date(archivedAt).getTime() + EVENT_ARCHIVE_RETENTION_MS).toISOString();
    const storedExpiry = event.archiveExpiresAt ? new Date(event.archiveExpiresAt).getTime() : NaN;
    const archiveExpiresAt = Number.isFinite(storedExpiry) && storedExpiry === new Date(expectedExpiry).getTime()
      ? event.archiveExpiresAt
      : expectedExpiry;

    if (new Date(archiveExpiresAt).getTime() <= now) {
      changed = true;
      return [];
    }

    if (event.status !== "archived" || event.archivedAt !== archivedAt || event.archiveExpiresAt !== archiveExpiresAt) {
      changed = true;
      return [{ ...event, status: "archived", archivedAt, archiveExpiresAt }];
    }
    return [event];
  });

  return { events: retained, changed };
}
