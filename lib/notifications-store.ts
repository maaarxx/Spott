"use client";

import { fetchWithSupabaseSession } from "./audit-log-client";

export type NotificationType = "all" | "reminder" | "update" | "announcement";
export type TargetRole = "all" | "user" | "organizer" | "admin";

export type NotificationItem = {
  id: string;
  type: "reminder" | "update" | "announcement";
  title: string;
  message: string;
  targetRole: TargetRole;
  recipientEmail?: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
  eventId?: string;
};

const NOTIFICATIONS_UPDATED_EVENT = "spott_notifications_updated";
let notificationSnapshot: NotificationItem[] = [];

export async function syncNotificationsFromApi(): Promise<NotificationItem[]> {
  const response = await fetchWithSupabaseSession('/api/notifications', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load notifications.');
  const payload = await response.json();
  notificationSnapshot = Array.isArray(payload.notifications) ? payload.notifications : [];
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
  return notificationSnapshot;
}

export function getNotifications(role: TargetRole = 'all'): NotificationItem[] {
  return role === 'all'
    ? notificationSnapshot
    : notificationSnapshot.filter((notification) => notification.targetRole === role || notification.targetRole === 'all');
}

export async function addNotification(data: {
  type: "reminder" | "update" | "announcement";
  title: string;
  message: string;
  targetRole?: TargetRole;
  recipientEmail?: string;
  link?: string;
}): Promise<boolean> {
  try {
    const response = await fetchWithSupabaseSession('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) return false;
    await syncNotificationsFromApi().catch(() => []);
    return true;
  } catch {
    return false;
  }
}

export async function markAsRead(id: string): Promise<boolean> {
  try {
    const response = await fetchWithSupabaseSession(`/api/notifications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: true }),
    });
    if (!response.ok) return false;
    notificationSnapshot = notificationSnapshot.map((item) => item.id === id ? { ...item, isRead: true } : item);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export async function markAllAsRead(): Promise<boolean> {
  try {
    const response = await fetchWithSupabaseSession('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    if (!response.ok) return false;
    notificationSnapshot = notificationSnapshot.map((item) => ({ ...item, isRead: true }));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function getUnreadCount(role: TargetRole = 'user'): number {
  return getNotifications(role).filter((item) => !item.isRead).length;
}

export async function clearAllNotifications(): Promise<boolean> {
  try {
    const response = await fetchWithSupabaseSession('/api/notifications', { method: 'DELETE' });
    if (!response.ok) return false;
    notificationSnapshot = [];
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export async function deleteNotification(id: string): Promise<boolean> {
  try {
    const response = await fetchWithSupabaseSession(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) return false;
    notificationSnapshot = notificationSnapshot.filter((item) => item.id !== id);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export async function cleanupGhostNotifications(validEventIds: string[]): Promise<void> {
  const validIds = new Set(validEventIds);
  const ghostNotifications = notificationSnapshot.filter((item) => item.eventId && !validIds.has(item.eventId));
  await Promise.all(ghostNotifications.map((item) => deleteNotification(item.id)));
}

export async function removeNotificationsForEvent(eventId: string, _eventTitle?: string): Promise<boolean> {
  try {
    const response = await fetchWithSupabaseSession(`/api/notifications?event_id=${encodeURIComponent(eventId)}`, { method: 'DELETE' });
    if (!response.ok) return false;
    notificationSnapshot = notificationSnapshot.filter((item) => item.eventId !== eventId);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** New-event announcements are written by the API that publishes the event. */
export function syncNotificationsForEvents(_events: Array<{
  id: string;
  title: string;
  organizer?: string;
  city?: string;
  location?: string;
  date?: string;
}>): void {}
