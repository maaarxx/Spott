"use client";

export type PendingOrganizerStatus = "pending" | "approved" | "rejected";

export type PendingOrganizer = {
  id: string;
  name: string;          // organizer/group name
  email: string;
  password: string;      // stored so we can activate on approval
  submittedAt: string;   // ISO date string
  status: PendingOrganizerStatus;
  decidedAt?: string;
};

const STORE_KEY = "spott_pending_organizers";
const EVENT_NAME = "spott_pending_organizers_updated";
const CHANNEL_NAME = "spott_pending_organizers_channel";

function load(): PendingOrganizer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(list: PendingOrganizer[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT_NAME));
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: EVENT_NAME, timestamp: Date.now() });
      channel.close();
    } catch {}
  } catch {}
}

export function getPendingOrganizers(): PendingOrganizer[] {
  return load();
}

export function addPendingOrganizer(
  data: Pick<PendingOrganizer, "name" | "email" | "password">
): PendingOrganizer {
  const list = load();
  const entry: PendingOrganizer = {
    id: `org-${Date.now()}`,
    ...data,
    submittedAt: new Date().toISOString(),
    status: "pending",
  };
  list.push(entry);
  save(list);
  return entry;
}

export function approveOrganizer(id: string): PendingOrganizer | null {
  const list = load();
  const idx = list.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    status: "approved",
    decidedAt: new Date().toISOString(),
  };
  save(list);
  return list[idx];
}

export function rejectOrganizer(id: string): PendingOrganizer | null {
  const list = load();
  const idx = list.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    status: "rejected",
    decidedAt: new Date().toISOString(),
  };
  save(list);
  return list[idx];
}

export function subscribeToPendingOrganizers(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleUpdate = () => callback();

  window.addEventListener(EVENT_NAME, handleUpdate);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORE_KEY || e.key === null) {
      callback();
    }
  };
  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data?.type === EVENT_NAME) {
        callback();
      }
    };
  } catch {}

  window.addEventListener("focus", handleUpdate);

  return () => {
    window.removeEventListener(EVENT_NAME, handleUpdate);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("focus", handleUpdate);
    if (channel) {
      try {
        channel.close();
      } catch {}
    }
  };
}

export const PENDING_ORGANIZERS_EVENT = EVENT_NAME;
