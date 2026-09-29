import type { EventData } from "@/components/EventCard";

export function maintainEventArchive(
  events: EventData[],
  now?: number
): { events: EventData[]; changed: boolean };
