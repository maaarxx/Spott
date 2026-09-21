"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, RefreshCw, CheckCircle2, ArrowRight } from "lucide-react";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  NotificationItem,
  NotificationType,
} from "@/lib/notifications-store";
import { getCurrentUser } from "@/lib/auth-store";

export default function NotificationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NotificationType>("all");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotifs = () => {
    const user = getCurrentUser();
    const role = user?.role || "user";
    const data = getNotifications(role);
    setNotifications(data);
  };

  useEffect(() => {
    loadNotifs();

    const handleUpdate = () => {
      loadNotifs();
    };

    window.addEventListener("spott_notifications_updated", handleUpdate);
    window.addEventListener("spott_auth_changed", handleUpdate);

    return () => {
      window.removeEventListener("spott_notifications_updated", handleUpdate);
      window.removeEventListener("spott_auth_changed", handleUpdate);
    };
  }, []);

  const handleItemClick = (notification: NotificationItem) => {
    markAsRead(notification.id);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const tabs: { key: NotificationType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "update", label: "Updates" },
    { key: "reminder", label: "Reminders" },
    { key: "cancellation", label: "Cancellations" },
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
              <span className="text-xs font-bold bg-accent text-white px-2.5 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </h1>
          <p className="text-xs text-muted mt-1">
            Real-time activity alerts, event schedule updates, and accreditation status.
          </p>
        </div>

        <button
          onClick={() => markAllAsRead()}
          className="text-xs font-bold text-ink hover:text-accent border border-line hover:border-accent/40 bg-white px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs"
        >
          Mark all as read
        </button>
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
              You're all caught up! Updates from organizers, event schedule changes, and accreditation decisions will appear here in real time.
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
                    ? "bg-[#fff9f5] hover:bg-[#fff0e8]/50"
                    : "hover:bg-[#faf8f3]"
                }`}
              >
                {/* Icon Avatar */}
                <div className="w-10 h-10 rounded-xl bg-white border border-line flex-shrink-0 flex items-center justify-center text-base shadow-xs group-hover:scale-105 transition-transform">
                  {notification.type === "reminder" && "🔔"}
                  {notification.type === "update" && "📝"}
                  {notification.type === "cancellation" && "❌"}
                  {notification.type === "announcement" && "📢"}
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
                          : notification.type === "cancellation"
                          ? "bg-rose-50 text-rose-700 border border-rose-200/50"
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

                {/* Unread indicator / Link Arrow */}
                <div className="flex-shrink-0 flex items-center gap-2 pt-1">
                  {!notification.isRead && (
                    <span className="w-2.5 h-2.5 bg-accent rounded-full shrink-0 shadow-xs" />
                  )}
                  {notification.link && (
                    <ArrowRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 group-hover:text-accent transition-all shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
