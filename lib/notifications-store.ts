"use client";

export type NotificationType = "all" | "reminder" | "update" | "cancellation" | "announcement";
export type TargetRole = "all" | "user" | "organizer" | "admin";

export type NotificationItem = {
  id: string;
  type: "reminder" | "update" | "cancellation" | "announcement";
  title: string;
  message: string;
  targetRole: TargetRole;
  isRead: boolean;
  createdAt: string;
  link?: string;
};

const STORAGE_KEY_NOTIFS = "spott_notifications";

const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

export function getNotifications(role: TargetRole = "all"): NotificationItem[] {
  if (typeof window === "undefined") return INITIAL_NOTIFICATIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFS);
    let list: NotificationItem[] = raw ? JSON.parse(raw) : INITIAL_NOTIFICATIONS;
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(INITIAL_NOTIFICATIONS));
    }
    if (role === "all") return list;
    return list.filter((n) => n.targetRole === role || n.targetRole === "all");
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
    link?: string;
  }
): NotificationItem {
  const newItem: NotificationItem = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: data.type,
    title: data.title,
    message: data.message,
    targetRole: data.targetRole || "all",
    isRead: false,
    createdAt: new Date().toISOString(),
    link: data.link,
  };

  if (typeof window !== "undefined") {
    try {
      const existing = getNotifications("all");
      const updated = [newItem, ...existing];
      localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
      window.dispatchEvent(new Event("spott_notifications_updated"));
    } catch {}
  }

  return newItem;
}

export function markAsRead(id: string) {
  if (typeof window === "undefined") return;
  try {
    const list = getNotifications("all");
    const updated = list.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

export function markAllAsRead(role: TargetRole = "all") {
  if (typeof window === "undefined") return;
  try {
    const list = getNotifications("all");
    const updated = list.map((n) => {
      if (role === "all" || n.targetRole === role || n.targetRole === "all") {
        return { ...n, isRead: true };
      }
      return n;
    });
    localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

export function getUnreadCount(role: TargetRole = "user"): number {
  if (typeof window === "undefined") return 0;
  const list = getNotifications(role);
  return list.filter((n) => !n.isRead).length;
}

export function clearAllNotifications() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_NOTIFS);
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

export function removeNotificationsForEvent(eventId: string, eventTitle?: string) {
  if (typeof window === "undefined") return;
  try {
    const list = getNotifications("all");
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

      // Filter out notifications associated with this removed event
      return !(linkMatch || titleMatch || messageMatch);
    });

    localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
    window.dispatchEvent(new Event("spott_notifications_updated"));
  } catch {}
}

