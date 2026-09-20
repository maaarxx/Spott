"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";

type NotificationType = "all" | "reminder" | "update" | "cancellation" | "announcement";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<NotificationType>("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setNotifications(data);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      // Fallback demo data
      setNotifications([
        { id: "1", type: "update", title: "Your event Jazz Night has been updated", message: "", isRead: false, createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
        { id: "2", type: "reminder", title: "Reminder: Yoga in the Park starts in 1 hour", message: "", isRead: false, createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
        { id: "3", type: "cancellation", title: "Art Walk has been cancelled", message: "", isRead: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
        { id: "4", type: "update", title: "New attendee registered for Metro Tech Summit", message: "", isRead: true, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
        { id: "5", type: "announcement", title: "Weekly update from Spott team: System maintenance scheduled", message: "", isRead: true, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const tabs: { key: NotificationType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "reminder", label: "Reminders" },
    { key: "update", label: "Updates" },
    { key: "cancellation", label: "Cancellations" },
    { key: "announcement", label: "Announcements" },
  ];

  const filteredNotifications = activeTab === "all"
    ? notifications
    : notifications.filter((n) => n.type === activeTab);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${Math.floor(diffHours)} hours ago`;
    if (diffDays < 2) return "Yesterday";
    return `${Math.floor(diffDays)} days ago`;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-ink">Notifications</h1>
        <button
          onClick={markAllAsRead}
          className="text-sm font-medium text-muted hover:text-ink transition-colors cursor-pointer"
        >
          Mark all as read
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-dark text-white"
                : "bg-white text-ink border border-line hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="bg-white border border-line rounded-2xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 skeleton rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 skeleton rounded w-2/3" />
                  <div className="h-3 skeleton rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-16 text-muted">
            No notifications to display.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start gap-4 p-5 transition-colors ${
                  !notification.isRead ? "bg-accent-soft/30" : "hover:bg-gray-50"
                }`}
              >
                {/* Avatar */}
                <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0 flex items-center justify-center text-xs text-muted">
                  {notification.type === "reminder" && "🔔"}
                  {notification.type === "update" && "📝"}
                  {notification.type === "cancellation" && "❌"}
                  {notification.type === "announcement" && "📢"}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!notification.isRead ? "font-bold text-ink" : "text-ink"}`}>
                    {notification.title}
                  </p>
                  <p className="text-xs text-muted mt-1">{formatTime(notification.createdAt)}</p>
                </div>

                {/* Action */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  {!notification.isRead ? (
                    <span className="w-2.5 h-2.5 bg-dark rounded-full" />
                  ) : (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="text-xs text-muted hover:text-ink transition-colors cursor-pointer"
                    >
                      Read
                    </button>
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
