"use client";

import { getCurrentUser } from "./auth-store";

export type NotificationType = "all" | "reminder" | "update" | "cancellation" | "announcement";
export type TargetRole = "all" | "user" | "organizer" | "admin";

export type NotificationItem = {
  id: string;
  type: "reminder" | "update" | "cancellation" | "announcement";
  title: string;
  message: string;
  targetRole: TargetRole;
  recipientEmail?: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
};

const STORAGE_KEY_NOTIFS = "spott_notifications";
const STORAGE_PREFIX_READ = "spott_read_notifs_";

const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

function getUserReadStorageKey(email?: string): string {
  const current = getCurrentUser();
  const userEmail = (email || current?.email || "guest").trim().toLowerCase();
  return `${STORAGE_PREFIX_READ}${userEmail}`;
}

export function getUserReadNotifIds(email?: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const key = getUserReadStorageKey(email);
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function setUserReadNotifIds(ids: Set<string>, email?: string) {
  if (typeof window === "undefined") return;
  try {
    const key = getUserReadStorageKey(email);
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

export function getNotifications(role: TargetRole = "all", email?: string): NotificationItem[] {
  if (typeof window === "undefined") return INITIAL_NOTIFICATIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFS);
    const list: NotificationItem[] = raw ? JSON.parse(raw) : INITIAL_NOTIFICATIONS;
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(INITIAL_NOTIFICATIONS));
    }

    // Role filtering
    let filtered = list;
    if (role !== "all") {
      filtered = list.filter((n) => n.targetRole === role || n.targetRole === "all");
    }

    const currentEmail = (email || getCurrentUser()?.email || "").trim().toLowerCase();
    filtered = filtered.filter(
      (notification) =>
        !notification.recipientEmail ||
        (!!currentEmail && notification.recipientEmail.trim().toLowerCase() === currentEmail)
    );

    // User-scoped read tracking: each user (especially new users) has their own read status
    const readIds = getUserReadNotifIds(email);
    return filtered.map((n) => ({
      ...n,
      isRead: readIds.has(n.id),
    }));
  } catch {
    return INITIAL_NOTIFICATIONS;
  }
}

export function addNotification(
  data: {
    type: "reminder" | "update" | "cancellation" | "announcement";
    title: string;
    message: string;
    targetRole?: TargetRole;
    recipientEmail?: string;
    link?: string;
  }
): NotificationItem {
  const newItem: NotificationItem = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: data.type,
    title: data.title,
    message: data.message,
    targetRole: data.targetRole || "all",
    recipientEmail: data.recipientEmail?.trim().toLowerCase(),
    isRead: false,
    createdAt: new Date().toISOString(),
    link: data.link,
  };

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_NOTIFS);
      const existing: NotificationItem[] = raw ? JSON.parse(raw) : [];
      const updated = [newItem, ...existing];
      localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
      window.dispatchEvent(new Event("spott_notifications_updated"));
    } catch {}
  }

  return newItem;
}

export function markAsRead(id: string, email?: string) {
  if (typeof window === "undefined") return;
  try {
    const readIds = getUserReadNotifIds(email);
    readIds.add(id);
    setUserReadNotifIds(readIds, email);
  } catch {}
}

export function markAllAsRead(role: TargetRole = "all", email?: string) {
  if (typeof window === "undefined") return;
  try {
    const list = getNotifications(role, email);
    const readIds = getUserReadNotifIds(email);
    list.forEach((n) => readIds.add(n.id));
    setUserReadNotifIds(readIds, email);
  } catch {}
}

export function getUnreadCount(role: TargetRole = "user", email?: string): number {
  if (typeof window === "undefined") return 0;
  const list = getNotifications(role, email);
  return list.filter((n) => !n.isRead).length;
}

export function clearAllNotifications() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_NOTIFS);
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

export function deleteNotification(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFS);
    const list: NotificationItem[] = raw ? JSON.parse(raw) : [];
    const updated = list.filter((n) => n.id !== id);
    localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

export function cleanupGhostNotifications(validEventIds: string[]) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFS);
    const list: NotificationItem[] = raw ? JSON.parse(raw) : [];
    const validSet = new Set(validEventIds);
    const updated = list.filter((n) => {
      if (n.link && n.link.startsWith("/events/")) {
        const id = n.link.replace("/events/", "").trim();
        return validSet.has(id);
      }
      return true;
    });
    localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

export function removeNotificationsForEvent(eventId: string, eventTitle?: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFS);
    const list: NotificationItem[] = raw ? JSON.parse(raw) : [];
    const idClean = eventId ? eventId.trim().toLowerCase() : "";
    const titleClean = eventTitle ? eventTitle.trim().toLowerCase() : "";

    const updated = list.filter((n) => {
      const linkMatch = Boolean(idClean && n.link && n.link.toLowerCase().includes(idClean));
      const titleMatch = Boolean(
        (titleClean && n.title.toLowerCase().includes(titleClean)) ||
        (idClean && n.title.toLowerCase().includes(idClean))
      );
      const messageMatch = Boolean(
        (titleClean && n.message.toLowerCase().includes(titleClean)) ||
        (idClean && n.message.toLowerCase().includes(idClean))
      );

      return !(linkMatch || titleMatch || messageMatch);
    });

    localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

export function syncNotificationsForEvents(events: Array<{
  id: string;
  title: string;
  organizer?: string;
  city?: string;
  location?: string;
  date?: string;
}>) {
  if (typeof window === "undefined" || !events?.length) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFS);
    const existing: NotificationItem[] = raw ? JSON.parse(raw) : [];
    const existingLinks = new Set(existing.map((n) => n.link).filter(Boolean));
    const newNotifs: NotificationItem[] = [];

    for (const ev of events) {
      if (!ev || !ev.id) continue;
      const link = `/events/${ev.id}`;
      if (!existingLinks.has(link)) {
        existingLinks.add(link);
        const orgName = ev.organizer || "Campus Organizer";
        newNotifs.push({
          id: `notif-${ev.id}`,
          type: "announcement",
          title: `New Event: "${ev.title}"`,
          message: `${orgName} published a new event: "${ev.title}" (${ev.city || ev.location || "Philippines"}). Check it out and RSVP!`,
          targetRole: "all",
          isRead: false,
          createdAt: ev.date || new Date().toISOString(),
          link,
        });
      }
    }

    if (newNotifs.length > 0) {
      const updated = [...newNotifs, ...existing];
      localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
      window.dispatchEvent(new Event("spott_notifications_updated"));
    }
  } catch {}
}
