import assert from "node:assert/strict";
import test from "node:test";
import { maintainEventArchive } from "../lib/event-archive.mjs";

const DAY = 24 * 60 * 60 * 1000;

test("active event archives after its scheduled end and receives an exact 30-day expiry", () => {
  const now = Date.parse("2026-09-29T12:00:00.000Z");
  const { events, changed } = maintainEventArchive([
    { id: "ended", status: "active", endDate: "2026-09-29T11:59:59.000Z" },
  ], now);

  assert.equal(changed, true);
  assert.equal(events[0].status, "archived");
  assert.equal(events[0].archivedAt, new Date(now).toISOString());
  assert.equal(new Date(events[0].archiveExpiresAt).getTime() - now, 30 * DAY);
});

test("future events and drafts stay in their current state", () => {
  const now = Date.parse("2026-09-29T12:00:00.000Z");
  const { events, changed } = maintainEventArchive([
    { id: "upcoming", status: "active", date: "2026-10-01T09:00:00.000Z" },
    { id: "draft", status: "draft", date: "2026-09-01T09:00:00.000Z" },
  ], now);

  assert.equal(changed, false);
  assert.deepEqual(events.map((event) => event.status), ["active", "draft"]);
});

test("archived events are available until the exact expiry boundary then purged", () => {
  const archivedAt = "2026-08-30T12:00:00.000Z";
  const event = {
    id: "archive", status: "archived", archivedAt,
    archiveExpiresAt: new Date(Date.parse(archivedAt) + 30 * DAY).toISOString(),
  };

  assert.equal(maintainEventArchive([event], Date.parse(archivedAt) + 30 * DAY - 1).events.length, 1);
  const expired = maintainEventArchive([event], Date.parse(archivedAt) + 30 * DAY);
  assert.equal(expired.events.length, 0);
  assert.equal(expired.changed, true);
});

test("legacy past statuses enter the archive and get a stable expiry", () => {
  const now = Date.parse("2026-09-29T12:00:00.000Z");
  const { events } = maintainEventArchive([
    { id: "legacy", status: "Past", date: "2026-09-01" },
  ], now);

  assert.equal(events[0].status, "archived");
  assert.equal(new Date(events[0].archiveExpiresAt).getTime() - new Date(events[0].archivedAt).getTime(), 30 * DAY);
});
