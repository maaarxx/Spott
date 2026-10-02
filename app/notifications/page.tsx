"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, RefreshCw, CheckCircle2, ArrowRight, Trash2, X, FileEdit, XCircle, Megaphone } from "lucide-react";
import { NotificationItem, NotificationType } from "@/lib/notifications-store";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";

export default function NotificationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NotificationType>("all");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotifs = async () => {
    setLoading(true);
    try {
      const response = await fetchWithSupabaseSession('/api/notifications');
      const body = await response.json().catch(() => ({}));
      setNotifications(response.ok && Array.isArray(body.notifications) ? body.notifications : []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadNotifs(); }, 0);
    const interval = setInterval(() => { void loadNotifs(); }, 30000);

    const handleUpdate = () => {
      loadNotifs();
    };

    window.addEventListener("spott_notifications_updated", handleUpdate);
    window.addEventListener("spott_reminders_updated", handleUpdate);
    window.addEventListener("spott_auth_changed", handleUpdate);

    return () => {
      window.clearTimeout(initialLoad);
      clearInterval(interval);
      window.removeEventListener("spott_notifications_updated", handleUpdate);
      window.removeEventListener("spott_reminders_updated", handleUpdate);
      window.removeEventListener("spott_auth_changed", handleUpdate);
    };
  }, []);

  const handleItemClick = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      const response = await fetchWithSupabaseSession(`/api/notifications/${encodeURIComponent(notification.id)}`, { method: 'PATCH' });
      if (response.ok) {
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
        import('@/lib/fetch-dedupe').then(m => m.invalidateCache('/api/notifications'));
      }
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const tabs: { key: NotificationType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "update", label: "Updates" },
    { key: "reminder", label: "Reminders" },
    { key: "announcement", label: "Announcements" },
  ];

  const filteredNotifications =
    activeTab === "all"
      ? notifications
      : notifications.filter((n) => n.type === activeTab);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      return `${diffDays}d ago`;
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-ink tracking-tight flex items-center gap-2.5">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs font-bold bg-red-500 text-white px-2.5 py-0.5 rounded-full shadow-xs animate-pulse">
                {unreadCount} new
              </span>
            )}
          </h1>
          <p className="text-xs text-muted mt-1">
            Real-time activity alerts, event schedule updates, and accreditation status.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              void fetchWithSupabaseSession('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAllRead: true }) })
                .then((response) => { if (response.ok) { setNotifications((items) => items.map((item) => ({ ...item, isRead: true }))); import('@/lib/fetch-dedupe').then(m => m.invalidateCache('/api/notifications')); } });
            }}
            className="text-xs font-bold text-ink hover:text-accent border border-line hover:border-accent/40 bg-white px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs"
          >
            Mark all read
          </button>
          <button
            onClick={() => {
              if (confirm("Are you sure you want to clear all notifications?")) {
                void fetchWithSupabaseSession('/api/notifications', { method: 'DELETE' })
                  .then((response) => { if (response.ok) { setNotifications([]); import('@/lib/fetch-dedupe').then(m => m.invalidateCache('/api/notifications')); } });
              }
            }}
            className="text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 bg-white px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs inline-flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear all</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tab) => {
          const count =
            tab.key === "all"
              ? notifications.length
              : notifications.filter((n) => n.type === tab.key).length;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? "bg-dark text-white shadow-sm ring-1 ring-dark"
                  : "bg-white text-ink border border-line hover:bg-gray-50"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.key
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Notifications List */}
      <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-5 animate-pulse">
                <div className="w-10 h-10 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-[#fff0e8] text-accent flex items-center justify-center mx-auto mb-3">
              <Bell className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-bold text-ink mb-1">No notifications yet</h3>
            <p className="text-xs text-muted max-w-sm mx-auto">
              You&apos;re all caught up! Updates from organizers, event schedule changes, and accreditation decisions will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleItemClick(notification)}
                className={`flex items-start gap-4 p-4 sm:p-5 transition-all cursor-pointer group ${
                  !notification.isRead
                    ? "bg-red-50/30 hover:bg-red-50/60 border-l-4 border-l-red-500"
                    : "hover:bg-[#faf8f3]"
                }`}
              >
                {/* Icon Avatar */}
                <div className="w-10 h-10 rounded-xl bg-white border border-line flex-shrink-0 flex items-center justify-center text-base shadow-xs group-hover:scale-105 transition-transform">
                  {notification.type === "reminder" && <Bell className="w-4 h-4 text-amber-600" />}
                  {notification.type === "update" && <FileEdit className="w-4 h-4 text-blue-600" />}
                  {notification.type === "announcement" && <Megaphone className="w-4 h-4 text-[#ff6b35]" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                        notification.type === "update"
                          ? "bg-blue-50 text-blue-700 border border-blue-200/50"
                          : notification.type === "reminder"
                          ? "bg-amber-50 text-amber-700 border border-amber-200/50"
                          : "bg-[#fff0e8] text-accent border border-accent/20"
                      }`}
                    >
                      {notification.type}
                    </span>
                    <span className="text-xs text-muted font-medium">
                      {formatTime(notification.createdAt)}
                    </span>
                  </div>

                  <h4
                    className={`text-sm leading-snug mb-1 group-hover:text-accent transition-colors ${
                      !notification.isRead ? "font-bold text-ink" : "font-semibold text-ink"
                    }`}
                  >
                    {notification.title}
                  </h4>

                  {notification.message && (
                    <p className="text-xs text-[#555] leading-relaxed m-0">
                      {notification.message}
                    </p>
                  )}
                </div>

                {/* Actions: Unread indicator, Link Arrow & Delete */}
                <div className="flex-shrink-0 flex items-center gap-2 pt-1">
                  {!notification.isRead && (
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full shrink-0 shadow-xs ring-4 ring-red-100" />
                  )}
                  {notification.link && (
                    <ArrowRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 group-hover:text-accent transition-all shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void fetchWithSupabaseSession(`/api/notifications/${encodeURIComponent(notification.id)}`, { method: 'DELETE' })
                        .then((response) => { if (response.ok) { setNotifications((items) => items.filter((item) => item.id !== notification.id)); import('@/lib/fetch-dedupe').then(m => m.invalidateCache('/api/notifications')); } });
                    }}
                    title="Delete notification"
                    className="p-1 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
