"use client";

import { useState, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Users,
  Eye,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Edit3,
  PlusCircle,
  ArrowUpRight,
  Sparkles,
  Search,
  Filter,
  BarChart3,
  ShieldCheck,
  Check,
  FileText,
  UploadCloud,
  Layers,
  MapPin,
  Calendar,
  DollarSign,
  Copy,
  Trash2,
  Share2,
  MoreVertical,
  Activity,
  PieChart,
  SlidersHorizontal,
  X,
  Zap,
  Archive,
  History,
  RotateCcw,
  ArrowLeft,
  Mail,
  Globe,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { useEffect } from "react";
import {
  defaultVerificationState,
  getRealTimeDate,
  get30DaysExpiryDate,
  saveVerificationState,
  VerificationState,
  VerificationDocument,
} from "@/lib/verification-store";
import PdfViewerModal from "@/components/PdfViewerModal";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";
import { removeNotificationsForEvent } from "@/lib/notifications-store";
import { getStoredEvents, saveStoredEvent, saveStoredEvents, deleteStoredEvent, subscribeToEvents } from "@/lib/events-store";
import { getCurrentUser, refreshCurrentUserFromDatabase } from "@/lib/auth-store";
import type { EventData } from "@/components/EventCard";
import {
  getEventViews,
  getEventUniqueViews,
  subscribeToViews,
} from "@/lib/views-store";
import {
  getOrganizerProfile,
  loadOrganizerProfileFromDatabase,
  saveOrganizerProfileToDatabase,
  subscribeToOrganizerProfile,
  OrganizerProfile,
} from "@/lib/organizer-store";
import { getAllCategories, matchesCategory, syncCategoriesFromDatabase } from "@/lib/categories";
import { recomputeRemindersForEvent } from "@/lib/reminders-store";

export const DEFAULT_FOCUS_PRESETS = [
  "Creative Arts & Design",
  "Esports & Gaming",
  "Hobbies & Collectibles",
  "Technology & Innovation",
  "Music, Sound & Nightlife",
  "Campus & Student Org",
  "Sports & Active Recreation",
  "Food & Culinary Pop-ups",
  "Community & Cultural",
];

function isOrgEvent(eventOrg: string | undefined | null, currentOrg: string): boolean {
  const normCurrent = (currentOrg || "").trim().toLowerCase();
  const normEvent = (eventOrg || "").trim().toLowerCase();
  if (!normCurrent) return true;
  if (!normEvent) {
    return normCurrent.includes("metro creative") || normCurrent === "mcg";
  }
  if (normCurrent === normEvent) return true;
  if (normCurrent.includes("metro creative") && (normEvent.includes("metro creative") || normEvent === "mcg")) return true;
  if (normCurrent.includes("vanguard") && normEvent.includes("vanguard")) return true;
  if (normCurrent.includes("hobbyist") && normEvent.includes("hobbyist")) return true;
  if (normCurrent.includes("tech manila") && normEvent.includes("tech manila")) return true;
  return normCurrent.includes(normEvent) || normEvent.includes(normCurrent);
}

const currentYear = new Date().getFullYear();

export interface OrganizerEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  rsvps: number;
  pendingRsvps: number;
  capacity: number;
  views: number;
  uniqueViews?: number;
  status: "Active" | "Draft" | "Archived" | "Cancelled";
  archivedAt?: string | null;
  archiveExpiresAt?: string | null;
  createdAt?: string | null;
  location: string;
  category: string;
  price: number;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

interface DatabaseRegistration {
  event_id: string;
  user_id: string;
  registration_date?: string | null;
  status?: string;
  attendee_email?: string | null;
  attendee_name?: string | null;
}

const initialEvents: OrganizerEvent[] = [];

// Daily RSVP data for Organizer Analytics Chart
function OrganizerContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const [analyticsMonth, setAnalyticsMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthlyRegistrations, setMonthlyRegistrations] = useState<DatabaseRegistration[]>([]);

  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<{ day: string; count: number } | null>(null);
  const [alertNotice, setAlertNotice] = useState<string | null>(null);

  // Verification & Document Store state (SSR-safe baseline)
  const [verState, setVerState] = useState<VerificationState>(defaultVerificationState);
  const [previewDocName, setPreviewDocName] = useState<string | null>(null);
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [verBannerFadingOut, setVerBannerFadingOut] = useState(false);
  const [verBannerHidden, setVerBannerHidden] = useState(false);
  const [verificationHydrated, setVerificationHydrated] = useState(false);

  // Profile editing state
  const [profileData, setProfileData] = useState<OrganizerProfile>(() => {
    return getOrganizerProfile();
  });
  const [isCustomFocus, setIsCustomFocus] = useState(false);
  const [customFocusText, setCustomFocusText] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarRemoved, setProfileAvatarRemoved] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [currentOrgName, setCurrentOrgName] = useState<string>("Metro Creative Group");

  useEffect(() => {
    let active = true;
    const syncProfile = () => {
      const user = getCurrentUser();
      const orgName = user?.organization || user?.name || "Metro Creative Group";
      setCurrentOrgName(orgName);
      setProfileData(getOrganizerProfile(orgName));
      void loadOrganizerProfileFromDatabase(orgName).then((prof) => {
        if (!active) return;
        setProfileData(prof);
        setIsCustomFocus(Boolean(prof.category && !DEFAULT_FOCUS_PRESETS.includes(prof.category)));
        setCustomFocusText(prof.category || "");
      }).catch(() => {});
    };
    syncProfile();
    const unsub = subscribeToOrganizerProfile(syncProfile);
    window.addEventListener("spott_auth_changed", syncProfile);
    return () => {
      active = false;
      unsub();
      window.removeEventListener("spott_auth_changed", syncProfile);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchWithSupabaseSession(`/api/organizer/analytics/rsvps?month=${encodeURIComponent(analyticsMonth)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load RSVP analytics from the database.");
        const payload = await response.json();
        if (active) setMonthlyRegistrations(Array.isArray(payload.registrations) ? payload.registrations : []);
      })
      .catch(() => {
        if (active) setMonthlyRegistrations([]);
      });
    return () => { active = false; };
  }, [analyticsMonth]);

  const handleAvatarFile = (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showAlert("Image must be smaller than 2MB.");
      return;
    }
    const reader = new FileReader();
    setProfileAvatarFile(file);
    setProfileAvatarRemoved(false);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileData((prev) => ({ ...prev, avatarUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await saveOrganizerProfileToDatabase(profileData, profileAvatarFile, profileAvatarRemoved);
      setProfileData(saved);
      setCurrentOrgName(saved.name);
      await refreshCurrentUserFromDatabase();
      setProfileAvatarFile(null);
      setProfileAvatarRemoved(false);
      setProfileSaved(true);
      showAlert("Profile changes saved! Public organizer page has been updated.");
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : "Unable to save organizer profile.");
    }
  };

  useEffect(() => {
    if (!verificationHydrated) return;
    const orgSlug = currentOrgName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const dismissedKey = `spott_verification_overview_dismissed_${orgSlug}`;

    if (verState.status === "approved") {
      let wasDismissed = false;
      try {
        wasDismissed = localStorage.getItem(dismissedKey) === "true";
      } catch {}
      if (wasDismissed) {
        setVerBannerFadingOut(false);
        setVerBannerHidden(true);
        return;
      }
      setVerBannerHidden(false);
      const fadeTimer = setTimeout(() => setVerBannerFadingOut(true), 2000);
      const hideTimer = setTimeout(() => {
        try {
          localStorage.setItem(dismissedKey, "true");
        } catch {}
        setVerBannerHidden(true);
      }, 2700);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    } else {
      try {
        localStorage.removeItem(dismissedKey);
      } catch {}
      setVerBannerFadingOut(false);
      setVerBannerHidden(false);
    }
  }, [verState.status, currentOrgName, verificationHydrated]);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDocTitle, setUploadDocTitle] = useState("");
  const [uploadDocType, setUploadDocType] = useState("University Co-Curricular Charter");
  const [uploadDocumentFile, setUploadDocumentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Expedite modal state
  const [expediteModalOpen, setExpediteModalOpen] = useState(false);
  const [expediteReason, setExpediteReason] = useState(
    "Priority verification request for upcoming campus event season."
  );

  const mapToOrganizerEvents = (list: EventData[]): OrganizerEvent[] => {
    return list.map((e) => {
      let timeStr = "TBA";
      let dateStr = e.date || "";
      if (e.date && e.date.includes(" ")) {
        const parts = e.date.split(" ");
        dateStr = parts[0];
        timeStr = parts.slice(1).join(" ");
      } else if (e.date && e.date.includes("T")) {
        const parts = e.date.split("T");
        dateStr = parts[0];
        timeStr = parts[1].slice(0, 5);
      }
      return {
        id: e.id,
        name: e.title,
        date: dateStr,
        time: timeStr,
        rsvps: e.registrations || 0,
        pendingRsvps: e.pendingRegistrations || 0,
        capacity: typeof e.capacity === "number" ? e.capacity : (e.capacity ? Number(e.capacity) : 100),
        views: getEventViews(e.id, e.registrations || 0),
        uniqueViews: getEventUniqueViews(e.id, e.registrations || 0),
        status: (["archived", "past", "completed", "done"].includes(String(e.status).toLowerCase())
          ? "Archived"
          : e.status === "cancelled"
            ? "Cancelled"
            : e.status === "draft"
              ? "Draft"
              : "Active") as OrganizerEvent["status"],
        archivedAt: e.archivedAt || null,
        archiveExpiresAt: e.archiveExpiresAt || null,
        createdAt: e.createdAt || e.confirmedAt || null,
        cancelledAt: e.cancelled_at || e.cancelledAt || null,
        cancelReason: e.cancel_reason || e.cancelReason || null,
        location: e.location || "Campus Venue",
        category: e.categories?.[0] || "School Events",
        price: e.price || 0,
      };
    });
  };

  const syncEvents = async () => {
    const user = getCurrentUser();
    const myOrg = (user?.organization || user?.name || "Metro Creative Group").trim().toLowerCase();

    const filterForOrg = (list: EventData[]) => {
      return list.filter((e) => isOrgEvent(e.organizer, myOrg));
    };

    const stored = getStoredEvents();
    const orgEvents = filterForOrg(stored);
    setEvents(mapToOrganizerEvents(orgEvents));

    fetch("/api/events?scope=organizer")
      .then(r => r.ok ? r.json() : null)
      .then(apiData => {
        let latestEvents = orgEvents;
        if (Array.isArray(apiData)) {
          saveStoredEvents(apiData, false);
          latestEvents = filterForOrg(apiData);
          setEvents(mapToOrganizerEvents(latestEvents));
        }
        const eventIds = latestEvents.map((e) => e.id);
        if (eventIds.length > 0) {
          fetch(`/api/views?listing_ids=${encodeURIComponent(eventIds.join(","))}`)
            .then((r) => r.json())
            .then((data) => {
              if (data?.viewsMap) {
                setEvents((prev) =>
                  prev.map((e) => ({
                    ...e,
                    views: data.viewsMap[e.id] ?? 0,
                    uniqueViews: data.uniqueViewsMap?.[e.id] ?? 0,
                  }))
                );
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        // Fallback: if events fetch fails, still try to fetch views for stored events
        const eventIds = orgEvents.map((e) => e.id);
        if (eventIds.length > 0) {
          fetch(`/api/views?listing_ids=${encodeURIComponent(eventIds.join(","))}`)
            .then((r) => r.json())
            .then((data) => {
              if (data?.viewsMap) {
                setEvents((prev) =>
                  prev.map((e) => ({
                    ...e,
                    views: data.viewsMap[e.id] ?? 0,
                    uniqueViews: data.uniqueViewsMap?.[e.id] ?? 0,
                  }))
                );
              }
            })
            .catch(() => {});
        }
      });
  };

  useEffect(() => {
    syncEvents();
    const unsubscribeEvents = subscribeToEvents(syncEvents);
    const unsubscribeViews = subscribeToViews(syncEvents);
    window.addEventListener("spott_registered_updated", syncEvents);
    window.addEventListener("spott_views_updated", syncEvents);
    window.addEventListener("spott_auth_changed", syncEvents);
    const remoteRefresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncEvents();
    }, 30000);

    const syncCats = () => setCategoriesList(getAllCategories());
    syncCats();
    void syncCategoriesFromDatabase().catch(() => {});
    window.addEventListener("spott_categories_updated", syncCats);

    return () => {
      unsubscribeEvents();
      unsubscribeViews();
      window.removeEventListener("spott_registered_updated", syncEvents);
      window.removeEventListener("spott_views_updated", syncEvents);
      window.removeEventListener("spott_auth_changed", syncEvents);
      window.clearInterval(remoteRefresh);
      window.removeEventListener("spott_categories_updated", syncCats);
    };
  }, []);

  useEffect(() => {
    const user = getCurrentUser();
    const orgName = user?.organization || user?.name || "Metro Creative Group";
    setCurrentOrgName(orgName);
    setVerificationHydrated(true);

    const syncRemoteVerification = async () => {
      try {
        const statusResponse = await fetchWithSupabaseSession('/api/verification', { cache: 'no-store' });
        if (!statusResponse.ok) return;
        const statusPayload = await statusResponse.json();
        const organizerProfile = await loadOrganizerProfileFromDatabase(orgName).catch(() => null);
        if (organizerProfile) {
          setProfileData(organizerProfile);
          setIsCustomFocus(Boolean(organizerProfile.category && !DEFAULT_FOCUS_PRESETS.includes(organizerProfile.category)));
          setCustomFocusText(organizerProfile.category || "");
        }
        const documentsResponse = await fetchWithSupabaseSession('/api/verification/documents', { cache: 'no-store' });
        if (!documentsResponse.ok) return;
        const documentsPayload = await documentsResponse.json();
        const remote = statusPayload.verification || {};
        const status = remote.verification_status === 'verified' ? 'approved'
          : remote.verification_status === 'rejected' ? 'rejected' : 'pending';
        const documents: VerificationDocument[] = (documentsPayload.documents || []).map((doc: {
          id: string; name: string; type: string; sizeBytes: number; uploadedAt: string; url: string;
        }) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          size: doc.sizeBytes ? `${(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB` : '',
          sizeBytes: doc.sizeBytes,
          uploadedAt: new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          verified: status === 'approved',
          url: doc.url,
        }));
        const nextState: VerificationState = {
          organizerName: remote.organization_name || orgName,
          status,
          isExpedited: Boolean(remote.expedited_at),
          expediteNote: remote.expedite_note || undefined,
          expeditedAt: remote.expedited_at ? new Date(remote.expedited_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
          decidedAt: remote.decided_at ? new Date(remote.decided_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
          expiresDate: remote.expires_at ? new Date(remote.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
          decisionReason: remote.decision_reason || undefined,
          retentionDays: remote.expires_at ? 30 : undefined,
          documents,
        };
        setVerState(nextState);
        saveVerificationState(nextState, orgName, false);
      } catch { /* Keep the current status if the server is temporarily unavailable. */ }
    };
    void syncRemoteVerification();
    const verificationInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncRemoteVerification();
    }, 60000);

    const handleUpdate = () => { void syncRemoteVerification(); };
    window.addEventListener("spott_verification_updated", handleUpdate);
    window.addEventListener("spott_auth_changed", handleUpdate);
    return () => {
      window.removeEventListener("spott_verification_updated", handleUpdate);
      window.removeEventListener("spott_auth_changed", handleUpdate);
      window.clearInterval(verificationInterval);
    };
  }, []);

  const showAlert = (msg: string) => {
    setAlertNotice(msg);
    setTimeout(() => setAlertNotice(null), 3500);
  };

  const persistVerificationStatus = async (status: 'pending' | 'verified' | 'rejected', expediteNote?: string) => {
    try {
      const response = await fetchWithSupabaseSession('/api/verification', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, expediteNote }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        showAlert(payload.error || 'Could not sync verification status across devices.');
        return false;
      }
      return true;
    } catch {
      showAlert('Could not sync verification status across devices.');
      return false;
    }
  };

  const handleConfirmExpedite = async () => {
    const success = await persistVerificationStatus('pending', expediteReason || 'Upcoming major event requiring priority verification.');
    if (!success) return;
    const updated = { ...verState, isExpedited: true, expediteNote: expediteReason, expeditedAt: getRealTimeDate() };
    setVerState(updated);
    saveVerificationState(updated, currentOrgName, false);
    setExpediteModalOpen(false);
    showAlert("⚡ Verification expedited! Priority review request sent to university administrators.");
  };

  const handleConfirmUpload = async () => {
    if (!uploadDocumentFile) {
      showAlert("Select the PDF file you want to upload.");
      return;
    }
    setIsUploading(true);
    try {
      const form = new FormData();
      form.set('file', uploadDocumentFile);
      form.set('document_type', uploadDocType);
      form.set('document_name', uploadDocTitle);
      const response = await fetchWithSupabaseSession('/api/verification/documents', { method: 'POST', body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to upload credential.');
      const uploaded = payload.documents?.[0];
      if (uploaded) {
        const updated = {
          ...verState,
          status: 'pending' as const,
          documents: [
            { id: uploaded.id, name: uploaded.name, type: uploaded.type, sizeBytes: uploaded.sizeBytes, size: `${(uploaded.sizeBytes / 1024 / 1024).toFixed(2)} MB`, uploadedAt: new Date(uploaded.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), verified: false, url: uploaded.url },
            ...verState.documents,
          ],
        };
        setVerState(updated);
        saveVerificationState(updated, currentOrgName, false);
      }
      setUploadModalOpen(false);
      setUploadDocTitle("");
      setUploadDocumentFile(null);
      showAlert(`Uploaded "${uploadDocumentFile.name}" to your verification application.`);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Unable to upload credential.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveDoc = async (id: string, name: string) => {
    const response = await fetchWithSupabaseSession('/api/verification/documents', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document_id: id }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showAlert(payload.error || 'Unable to archive document.');
      return;
    }
    const updated = { ...verState, documents: verState.documents.filter((doc) => doc.id !== id) };
    setVerState(updated);
    saveVerificationState(updated, currentOrgName, false);
    showAlert(`Archived "${name}" from the active verification application.`);
  };

  const visibleEvents = activeTab === "archive"
    ? events.filter((event) => event.status === "Archived")
    : events.filter((event) => event.status !== "Archived");
  const filteredEvents = visibleEvents.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = activeTab === "archive" || statusFilter === "All" || e.status === statusFilter;
    const catMatch = categoryFilter === "All" || matchesCategory(e.category, categoryFilter);
    return matchesSearch && matchesStatus && catMatch;
  });

  const monthlyRsvpStats = useMemo(() => {
    const [year, month] = analyticsMonth.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const weekCount = Math.ceil(new Date(year, month, 0).getDate() / 7);
    const weeks = Array.from({ length: weekCount }, (_, index) => ({ label: `Week ${index + 1}`, count: 0 }));
    const statusCounts = { Confirmed: 0, Pending: 0, Declined: 0 };
    const attendeeVisits = new Map<string, number>();
    let total = 0;
    for (const registration of monthlyRegistrations) {
      const registeredAt = new Date(registration.registration_date || "");
      if (!Number.isFinite(registeredAt.getTime()) || registeredAt < start || registeredAt >= end) continue;
      const normalizedStatus = String(registration.status || "").toLowerCase();
      const displayStatus = ["confirmed", "registered", "approved"].includes(normalizedStatus)
        ? "Confirmed"
        : ["rejected", "declined", "cancelled"].includes(normalizedStatus)
          ? "Declined"
          : "Pending";
      statusCounts[displayStatus] += 1;
      
      if (displayStatus !== "Declined") {
        total += 1;
        const bucket = Math.min(weeks.length - 1, Math.floor((registeredAt.getDate() - 1) / 7));
        weeks[bucket].count += 1;
        const attendeeKey = String(registration.attendee_email || registration.attendee_name || registration.user_id || "unknown").trim().toLowerCase();
        attendeeVisits.set(attendeeKey, (attendeeVisits.get(attendeeKey) || 0) + 1);
      }
    }
    const uniqueAttendees = attendeeVisits.size;
    const repeatAttendees = Array.from(attendeeVisits.values()).filter((count) => count > 1).length;
    const maxWeek = Math.max(...weeks.map((week) => week.count), 1);
    return {
      total,
      statusCounts,
      uniqueAttendees,
      repeatRate: uniqueAttendees ? Math.round((repeatAttendees / uniqueAttendees) * 100) : 0,
      weeks: weeks.map((week) => ({ ...week, height: week.count ? Math.max(12, Math.round((week.count / maxWeek) * 100)) : 4 })),
      start,
      end: new Date(end.getTime() - 1),
    };
  }, [monthlyRegistrations, analyticsMonth]);

  const monthlyEventsCreated = events.filter((event) => {
    const createdAt = event.createdAt ? new Date(event.createdAt).getTime() : NaN;
    return Number.isFinite(createdAt) && createdAt >= monthlyRsvpStats.start.getTime() && createdAt <= monthlyRsvpStats.end.getTime();
  }).length;

  const activeEvents = events.filter((event) => event.status !== "Archived");
  const upcomingEvents = activeEvents
    .filter((event) => event.status === "Active")
    .filter((event) => {
      const eventTime = new Date(`${event.date}T${event.time || "23:59"}`).getTime();
      return Number.isFinite(eventTime) && eventTime >= Date.now();
    })
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
  const totalEvents = activeEvents.length;
  const totalRSVPs = activeEvents.reduce((acc, curr) => acc + curr.rsvps + curr.pendingRsvps, 0);
  const totalViews = activeEvents.reduce((acc, curr) => acc + curr.views, 0);
  const totalUniqueViews = activeEvents.reduce((acc, curr) => acc + (curr.uniqueViews || (curr.views > 0 ? Math.max(1, Math.round(curr.views * 0.72)) : 0)), 0);
  const regRate = Math.round((totalRSVPs / Math.max(totalViews, 1)) * 100);

  const activeCount = events.filter((e) => e.status === "Active").length;
  const draftCount = events.filter((e) => e.status === "Draft").length;
  const archivedCount = events.filter((e) => e.status === "Archived").length;
  const cancelledCount = events.filter((e) => e.status === "Cancelled").length;

  const [cancellingEvent, setCancellingEvent] = useState<OrganizerEvent | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleDuplicate = async (evt: OrganizerEvent) => {
    try {
      const response = await fetchWithSupabaseSession('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${evt.name} (Copy)`,
          description: `Duplicate of ${evt.name}`,
          category: evt.category || 'Community',
          date: evt.date,
          time: evt.time || '14:00',
          location: evt.location,
          city: 'Manila',
          price: evt.price,
          capacity: evt.capacity || null,
          status: 'draft',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.event_id !== 'string') throw new Error(result.error || 'Could not duplicate event.');
      await syncEvents();
      showAlert(`Duplicated "${evt.name}" as a database draft.`);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not duplicate event.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const target = events.find((e) => e.id === id);
    const activeRsvpCount = target ? target.rsvps + target.pendingRsvps : 0;
    if (target && target.status !== "Draft" && activeRsvpCount > 0) {
      showAlert(`⚠️ Cannot delete "${name}" because it has ${activeRsvpCount} active RSVP(s). Please use "Cancel Event" to notify attendees.`);
      return;
    }

    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const response = await fetchWithSupabaseSession(`/api/events/${id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Could not delete "${name}".`);
      deleteStoredEvent(id);
      removeNotificationsForEvent(id, name);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      showAlert(`Deleted "${name}".`);
    } catch (error) { showAlert(error instanceof Error ? error.message : `Could not delete "${name}".`); }
  };

  const handleConfirmCancelEvent = async () => {
    if (!cancellingEvent || isCancelling) return;
    setIsCancelling(true);
    const reason = cancelReasonInput.trim() || "Event cancelled by organizer.";

    try {
      const response = await fetchWithSupabaseSession(`/api/events/${cancellingEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          cancel_reason: reason,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not cancel event.');
      const cancelledAt = new Date().toISOString();
      const stored = getStoredEvents().find((e) => e.id === cancellingEvent.id);
      if (stored) saveStoredEvent({ ...stored, status: 'cancelled', cancelled_at: cancelledAt, cancel_reason: reason });
      setEvents((prev) => prev.map((e) => e.id === cancellingEvent.id ? { ...e, status: 'Cancelled', cancelReason: reason, cancelledAt } : e));
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not cancel event.');
      setIsCancelling(false);
      return;
    }

    setIsCancelling(false);
    setCancellingEvent(null);
    setCancelReasonInput("");
    showAlert(`✓ Event "${cancellingEvent.name}" has been cancelled and attendees notified.`);
  };

  // Edit Event state
  const [editingEvent, setEditingEvent] = useState<OrganizerEvent | null>(null);

  const handleSaveEventEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || isSavingEdit) return;
    setIsSavingEdit(true);

    const existing = getStoredEvents().find((ev) => ev.id === editingEvent.id);

    // Compare fields for changes
    const changes: string[] = [];
    if (existing) {
      if (editingEvent.name.trim() !== (existing.title || "").trim()) {
        changes.push(`Title changed to "${editingEvent.name}"`);
      }
      const oldDateStr = existing.date || "";
      const newDateStr = `${editingEvent.date} ${editingEvent.time}`;
      if (oldDateStr !== newDateStr) {
        changes.push(`Schedule changed to ${editingEvent.date} at ${editingEvent.time}`);
      }
      if (editingEvent.location.trim() !== (existing.location || "").trim()) {
        changes.push(`Venue changed to "${editingEvent.location}"`);
      }
      if (Number(editingEvent.price) !== Number(existing.price || 0)) {
        changes.push(`Price updated to ₱${editingEvent.price}`);
      }
    }

    const updatedEventData = {
      ...existing,
      id: editingEvent.id,
      title: editingEvent.name,
      description: existing?.description || `Updated event: ${editingEvent.name}`,
      date: `${editingEvent.date} ${editingEvent.time}`,
      price: editingEvent.price,
      status: editingEvent.status.toLowerCase(),
      organizer: existing?.organizer || "Metro Creative Group",
      verified: true,
      location: editingEvent.location,
      city: existing?.city || "Manila",
      categories: [editingEvent.category],
      registrations: editingEvent.rsvps,
      capacity: Number(editingEvent.capacity) || 100,
      confirmedAt: new Date().toISOString(),
    };

    try {
      const response = await fetchWithSupabaseSession(`/api/events/${editingEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingEvent.name,
          date: `${editingEvent.date} ${editingEvent.time}`,
          location: editingEvent.location,
          price: editingEvent.price,
          status: editingEvent.status.toLowerCase(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save event changes.');
      saveStoredEvent(updatedEventData);
      setEvents((prev) => prev.map((ev) => (ev.id === editingEvent.id ? editingEvent : ev)));
      if (existing && existing.date !== `${editingEvent.date} ${editingEvent.time}`) {
        try {
          await recomputeRemindersForEvent(editingEvent.id, `${editingEvent.date} ${editingEvent.time}`);
        } catch {
          showAlert('Event saved, but its reminders could not be rescheduled.');
        }
      }
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Could not save event changes.');
      setIsSavingEdit(false);
      return;
    }

    setIsSavingEdit(false);
    setEditingEvent(null);
    showAlert(`✓ Saved details for "${editingEvent.name}".`);
  };

  const handleToggleStatus = async (id: string) => {
    const event = events.find((item) => item.id === id);
    if (!event) return;
    const newStatus = event.status === "Active" ? "Draft" : "Active";
    try {
      const response = await fetchWithSupabaseSession(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus.toLowerCase() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not update event status.');
      const stored = getStoredEvents().find((item) => item.id === id);
      if (stored) saveStoredEvent({ ...stored, status: newStatus.toLowerCase() });
      setEvents((current) => current.map((item) => item.id === id ? { ...item, status: newStatus } : item));
      showAlert(`Event "${event.name}" is now ${newStatus}.`);
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Could not update event status.'); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Alert message */}
      {alertNotice && (
        <div className="p-3.5 bg-[#fff0e8] text-[#ff6b35] rounded-xl border border-[#ff6b35]/30 text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs">
          <span>{alertNotice}</span>
          <button onClick={() => setAlertNotice(null)} className="text-[#ff6b35] font-black">
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. OVERVIEW TAB: High Level Dashboard (Wireframe 1)                       */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <>
          {/* Welcome & Overview Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-black text-[#171717] tracking-tight">
                  Welcome back, {currentOrgName}
                </h1>
              </div>
              <p className="text-sm sm:text-base text-[#666666] font-medium">
                Manage your upcoming projects and view tracking metrics.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/organizer/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff6b35] text-white font-bold text-sm shadow-md hover:bg-[#e0531f] transition-all no-underline shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create Event</span>
              </Link>
            </div>
          </div>

          {/* 4 Metric Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs sm:text-sm font-bold text-[#666666] tracking-wide uppercase">
                  Total Events
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                  <CalendarDays className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-[#171717]">{totalEvents}</span>
                {activeCount > 0 && (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {activeCount} Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#888888] mt-2">
                {totalEvents === 0 ? "No events yet" : `${activeCount} active, ${draftCount} draft, ${archivedCount} archived`}
              </p>
            </div>

            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs sm:text-sm font-bold text-[#666666] tracking-wide uppercase">
                  Total RSVPs
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-[#171717]">{totalRSVPs}</span>
                {totalRSVPs > 0 && (
                  <span className="text-xs font-semibold text-[#ff6b35] bg-[#fff0e8] px-2 py-0.5 rounded-md">
                    Across {totalEvents} event{totalEvents !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#888888] mt-2">
                {totalRSVPs === 0 ? "No RSVPs yet" : `${totalRSVPs} total registrations`}
              </p>
            </div>

            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs sm:text-sm font-bold text-[#666666] tracking-wide uppercase">
                  Total Views
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                  <Eye className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-[#171717]">{totalViews}</span>
                {totalViews > 0 && (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {totalUniqueViews} unique
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#888888] mt-2">
                {totalViews === 0
                  ? "No views tracked yet"
                  : `${totalUniqueViews} unique visitor${totalUniqueViews !== 1 ? 's' : ''} (24h deduplicated)`}
              </p>
            </div>

            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 sm:p-6 shadow-sm hover:border-[#ff6b35]/50 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs sm:text-sm font-bold text-[#666666] tracking-wide uppercase">
                  Registrations
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#faf8f3] group-hover:bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center transition-colors">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-[#171717]">
                  {totalEvents > 0 ? `${regRate}%` : "0%"}
                </span>
                {totalEvents > 0 && (
                  <span className="text-xs font-semibold text-[#ff6b35] bg-[#fff0e8] px-2 py-0.5 rounded-md">
                    {regRate >= 50 ? "On track" : "Building up"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#888888] mt-2">
                {totalEvents === 0 ? "No events to measure" : "RSVP to view ratio"}
              </p>
            </div>
          </div>

          {/* Verification Status Banner (fades out and hides when verified, only returns if rejected or reset) */}
          {!verBannerHidden && (
            <div
              className={`rounded-2xl p-5 sm:p-6 shadow-sm relative overflow-hidden border transition-all duration-700 ${
                verBannerFadingOut ? "opacity-0 -translate-y-3 pointer-events-none" : "opacity-100 translate-y-0"
              } ${
                verState.status === "approved"
                  ? "bg-gradient-to-r from-white via-white to-emerald-50/40 border-emerald-300"
                  : verState.status === "rejected"
                  ? "bg-gradient-to-r from-white via-white to-rose-50/40 border-rose-300"
                  : "bg-gradient-to-r from-white via-white to-[#fff8f5] border-[#ff6b35]/30"
              }`}
            >
            <div
              className={`absolute top-0 left-0 w-1.5 h-full ${
                verState.status === "approved"
                  ? "bg-emerald-500"
                  : verState.status === "rejected"
                  ? "bg-rose-500"
                  : "bg-[#ff6b35]"
              }`}
            />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-3xl" suppressHydrationWarning>
                <div className="flex items-center gap-2.5 flex-wrap" suppressHydrationWarning>
                  <h3 className="text-base sm:text-lg font-black text-[#171717]" suppressHydrationWarning>
                    Verification Status:{" "}
                    {verState.status === "approved"
                      ? "Verified"
                      : verState.status === "rejected"
                      ? "Declined"
                      : verState.documents.length === 0
                      ? "Not Submitted"
                      : "Pending"}
                  </h3>

                  {verState.status === "approved" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-emerald-600 text-white shadow-xs">
                      <CheckCircle2 className="w-3 h-3" />
                      Verified Badge Active
                    </span>
                  ) : verState.status === "rejected" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-rose-600 text-white shadow-xs">
                      <X className="w-3 h-3" />
                      Application Declined
                    </span>
                  ) : verState.documents.length === 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-gray-100 text-[#666666] border border-[#e6e1d8]">
                      <Clock className="w-3 h-3" />
                      Not Submitted
                    </span>
                  ) : verState.isExpedited ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-amber-500 text-white shadow-xs animate-pulse">
                      <Zap className="w-3 h-3" />
                      Priority Expedited
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wide bg-[#fff0e8] text-[#ff6b35] border border-[#ff6b35]/30">
                      <Clock className="w-3 h-3" />
                      Under Review
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-[#555555] leading-relaxed">
                  {verState.status === "approved"
                    ? "Your student organization credentials have been verified by the university. The official checkmark badge is active across all your public event pages and listings."
                    : verState.status === "rejected"
                    ? `Application was declined. This record is preserved in the 30-day compliance archive until ${verState.expiresDate || get30DaysExpiryDate()} (30 days retention). You may re-apply with new or updated credentials.`
                    : verState.documents.length === 0
                    ? "No credentials submitted yet. Click 'Start Submission' to upload your organization documents and begin the verification process."
                    : verState.isExpedited
                    ? `Emergency review active (${verState.expeditedAt || "Today"}). University Student Affairs administrators have prioritized your submission under accelerated 4-12hr emergency turnaround.`
                    : "Your student organization credentials are currently under verification. Once approved by university administrators, a checkmark badge will appear on your public events pages to establish trust."}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {verState.status === "rejected" ? (
                  <button
                    onClick={async () => {
                      if (await persistVerificationStatus('pending')) {
                        const updated = { ...verState, status: 'pending' as const };
                        setVerState(updated);
                        saveVerificationState(updated, currentOrgName, false);
                        setUploadModalOpen(true);
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-[#ff6b35] text-white text-xs font-bold hover:bg-[#e0531f] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-Apply / Submit Credentials</span>
                  </button>
                ) : verState.status === "approved" ? (
                  <button
                    onClick={() => setShowVerificationModal(true)}
                    className="px-4 py-2 rounded-xl bg-white border border-[#e6e1d8] text-xs font-bold text-[#171717] hover:border-emerald-500 hover:text-emerald-700 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>View Badge Details</span>
                  </button>
                ) : verState.documents.length === 0 ? (
                  /* Not yet submitted */
                  <button
                    onClick={() => setUploadModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-[#ff6b35] text-white text-xs font-bold hover:bg-[#e0531f] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Start Submission</span>
                  </button>
                ) : (
                  /* Has documents — actually pending review */
                  <>
                    <button
                      onClick={() => setShowVerificationModal(true)}
                      className="px-4 py-2 rounded-xl bg-white border border-[#e6e1d8] text-xs font-bold text-[#171717] hover:border-[#ff6b35] hover:text-[#ff6b35] transition-all cursor-pointer shadow-2xs"
                    >
                      View Requirements
                    </button>
                    {verState.isExpedited ? (
                      <span className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-default shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Expedite Active</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => setExpediteModalOpen(true)}
                        className="px-4 py-2 rounded-xl bg-[#171717] text-white text-xs font-bold hover:bg-[#ff6b35] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Zap className="w-3.5 h-3.5 text-[#ff6b35]" />
                        <span>Expedite Review</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Recent Events Preview Table */}
          <div className="bg-white border border-[#e6e1d8] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-[#e6e1d8] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-[#171717]">Upcoming Event Highlights</h2>
                <p className="text-xs text-[#666666] mt-0.5">Next scheduled live events and attendee activity</p>
              </div>
              <Link
                href="/organizer?tab=events"
                className="text-xs font-bold text-[#ff6b35] hover:underline flex items-center gap-1"
              >
                  <span>View My Events</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[#faf8f3] border-b border-[#e6e1d8] text-[11px] font-black uppercase text-[#666666]">
                    <th className="py-3 px-6">Event Name</th>
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-6 text-center">RSVPs</th>
                    <th className="py-3 px-6 text-center">Views</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e1d8]">
                  {upcomingEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-[#888888]">
                        No upcoming live events. Publish an event or check the event archive for completed events.
                      </td>
                    </tr>
                  ) : (
                    upcomingEvents.slice(0, 3).map((evt) => (
                      <tr key={evt.id} className="hover:bg-[#faf8f3]/60 transition-colors">
                        <td className="py-4 px-6 font-bold text-[#171717]">{evt.name}</td>
                        <td className="py-4 px-6 text-xs text-[#555555]">{evt.date}</td>
                        <td className="py-4 px-6 text-center font-bold">{evt.rsvps + evt.pendingRsvps}</td>
                        <td className="py-4 px-6 text-center">
                          <span className="font-bold text-[#171717]">{evt.views}</span>
                          <span className="text-[10px] text-[#888888] block">
                            {evt.uniqueViews || Math.max(1, Math.round(evt.views * 0.72))} unique
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            evt.status === "Active"
                              ? "bg-emerald-50 text-emerald-700"
                              : evt.status === "Draft"
                              ? "bg-amber-50 text-amber-700"
                              : evt.status === "Cancelled"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-gray-100 text-gray-700"
                          }`}>
                            {evt.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <Link href={`/organizer/rsvp?eventId=${evt.id}`} className="text-xs font-bold text-[#ff6b35] hover:underline mr-3">
                            RSVPs
                          </Link>
                          <button
                            type="button"
                            onClick={() => setEditingEvent(evt)}
                            className="text-xs font-bold text-[#171717] hover:text-[#ff6b35] cursor-pointer"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. MY EVENTS TAB: Dedicated Event Management & Publishing                 */}
      {/* ========================================================================= */}
      {(activeTab === "events" || activeTab === "archive") && (
        <div className="space-y-6">
          {/* Header & Quick Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717] tracking-tight">
                {activeTab === "archive" ? "Archived Events" : "My Events Management"}
              </h1>
              <p className="text-sm text-[#666666] mt-0.5">
                {activeTab === "archive"
                  ? `${archivedCount} completed events retained for 30 days after archiving.`
                  : "Full directory of your created campus events, ticket capacity, and live publishing controls."}
              </p>
            </div>
            {activeTab !== "archive" && <Link
              href="/organizer/create"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff6b35] text-white font-bold text-sm shadow-md hover:bg-[#e0531f] transition-all no-underline shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create New Event</span>
            </Link>}
          </div>

          {/* Quick Filter Counts */}
          {activeTab === "events" && <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <button
              onClick={() => setStatusFilter("All")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "All" ? "bg-[#171717] text-white border-[#171717] shadow-sm" : "bg-white border-[#e6e1d8] hover:border-[#ff6b35]"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${statusFilter === "All" ? "text-gray-300" : "text-[#888888]"}`}>All Listings</span>
              <span className="text-2xl font-black">{totalEvents}</span>
            </button>
            <button
              onClick={() => setStatusFilter("Active")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "Active" ? "bg-[#171717] text-white border-[#171717] shadow-sm" : "bg-white border-[#e6e1d8] hover:border-emerald-500"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${statusFilter === "Active" ? "text-emerald-400" : "text-emerald-600"}`}>Live / Active</span>
              <span className="text-2xl font-black text-emerald-500">{activeCount}</span>
            </button>
            <button
              onClick={() => setStatusFilter("Draft")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "Draft" ? "bg-[#171717] text-white border-[#171717] shadow-sm" : "bg-white border-[#e6e1d8] hover:border-amber-500"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${statusFilter === "Draft" ? "text-amber-400" : "text-amber-600"}`}>Drafts</span>
              <span className="text-2xl font-black text-amber-500">{draftCount}</span>
            </button>
            <Link href="/organizer?tab=archive" className="no-underline p-4 rounded-2xl border text-left transition-all bg-white border-[#e6e1d8] hover:border-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider block text-gray-500">Archived / Past</span>
              <span className="text-2xl font-black">{archivedCount}</span>
            </Link>
            <button
              onClick={() => setStatusFilter("Cancelled")}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "Cancelled" ? "bg-[#171717] text-white border-[#171717] shadow-sm" : "bg-white border-[#e6e1d8] hover:border-rose-500"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${statusFilter === "Cancelled" ? "text-rose-400" : "text-rose-600"}`}>Cancelled</span>
              <span className="text-2xl font-black text-rose-500">{cancelledCount}</span>
            </button>
          </div>}

          {/* Search & Category Filter Toolbar */}
          <div className="bg-white border border-[#e6e1d8] rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#888888] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search event title, venue, or address..."
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm font-medium border border-[#e6e1d8] rounded-xl focus:outline-none focus:border-[#ff6b35]"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3.5 py-2 text-xs font-bold border border-[#e6e1d8] rounded-xl bg-white text-[#171717] focus:outline-none focus:border-[#ff6b35] cursor-pointer"
              >
                <option value="All">All Categories</option>
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Detailed Event Cards List */}
          <div className="space-y-4">
            {filteredEvents.length === 0 ? (
              <div className="bg-white border border-[#e6e1d8] rounded-2xl p-12 text-center text-[#888888] text-sm">
                No events found matching your search and filter criteria.
              </div>
            ) : (
              filteredEvents.map((evt) => {
                const fillPercent = Math.round((evt.rsvps / Math.max(evt.capacity, 1)) * 100);
                return (
                  <div
                    key={evt.id}
                    className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm hover:border-[#ff6b35]/60 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                  >
                    {/* Left Info */}
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                            evt.status === "Active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : evt.status === "Draft"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : evt.status === "Cancelled"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-gray-100 text-gray-700 border border-gray-200"
                          }`}
                        >
                          {evt.status}
                        </span>
                        <span className="text-xs font-bold text-[#ff6b35] bg-[#fff0e8] px-2.5 py-0.5 rounded-full border border-[#ff6b35]/20">
                          {evt.category}
                        </span>
                        <span className="text-xs font-bold text-[#666666]">
                          {evt.price === 0 ? "Free Event" : `₱${evt.price}`}
                        </span>
                      </div>

                      <h3 className="text-xl font-black text-[#171717]">{evt.name}</h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-[#666666]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#ff6b35]" />
                          <span>{evt.date} • {evt.time}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#ff6b35]" />
                          <span>{evt.location}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-[#ff6b35]" />
                          <span>{evt.views} views ({evt.uniqueViews || Math.max(1, Math.round(evt.views * 0.72))} unique)</span>
                        </div>
                      </div>

                      {/* Capacity Progress Bar */}
                      <div className="space-y-1 max-w-md pt-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-[#171717]">{evt.rsvps} of {evt.capacity} RSVPs filled</span>
                          <span className="text-[#ff6b35]">{fillPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.min(fillPercent, 100)}%` }}
                            className="h-full bg-[#ff6b35] rounded-full transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right Actions */}
                    <div className="flex flex-wrap lg:flex-col items-end gap-2 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-[#e6e1d8]">
                      {evt.status === "Archived" ? (
                        <p className="text-xs font-semibold text-[#666666]">
                          Retained until {evt.archiveExpiresAt ? new Date(evt.archiveExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "30 days after archive"}
                        </p>
                      ) : <>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/organizer/rsvp?eventId=${evt.id}`}
                          className="px-4 py-2 bg-[#ff6b35] text-white text-xs font-bold rounded-xl hover:bg-[#e0531f] transition-all no-underline shadow-xs flex items-center gap-1.5"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Manage RSVPs ({evt.rsvps + evt.pendingRsvps})</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditingEvent(evt)}
                          className="px-4 py-2 bg-white border border-[#e6e1d8] text-[#171717] text-xs font-bold rounded-xl hover:border-[#ff6b35] hover:text-[#ff6b35] transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        {evt.status === "Active" && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancellingEvent(evt);
                              setCancelReasonInput("");
                            }}
                            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                            title="Cancel event and notify attendees"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Cancel Event</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStatus(evt.id)}
                          className="px-3 py-1.5 text-xs font-bold text-[#666666] hover:text-[#171717] border border-[#e6e1d8] rounded-lg bg-[#faf8f3] cursor-pointer"
                        >
                          {evt.status === "Active" ? "Unpublish to Draft" : "Publish Live"}
                        </button>
                        <button
                          onClick={() => handleDuplicate(evt)}
                          className="p-1.5 text-[#666666] hover:text-[#ff6b35] rounded-lg hover:bg-gray-100 cursor-pointer"
                          title="Duplicate Event"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(evt.id, evt.name)}
                          className="p-1.5 text-rose-600 hover:text-rose-700 rounded-lg hover:bg-rose-50 cursor-pointer"
                          title="Delete Event"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      </>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ANALYTICS TAB: Rich Visual Charts & Metrics                            */}
      {/* ========================================================================= */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Organizer Analytics & Insights</h1>
              <p className="text-sm text-[#666666] mt-0.5">
                Monthly event and attendee activity for {monthlyRsvpStats.start.toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-[#666666]">
              Reporting month
              <input type="month" value={analyticsMonth} max={new Date().toISOString().slice(0, 7)} onChange={(event) => setAnalyticsMonth(event.target.value)} className="px-3 py-2 rounded-xl border border-[#e6e1d8] bg-white text-sm font-semibold normal-case tracking-normal text-[#171717]" />
            </label>
          </div>

          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">RSVPs This Month</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">
                {monthlyRsvpStats.total}
              </p>
              <p className="text-xs text-[#666666] font-bold mt-2 flex items-center gap-1">
                {monthlyRsvpStats.statusCounts.Confirmed} confirmed · {monthlyRsvpStats.statusCounts.Pending} awaiting review
              </p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Avg RSVPs / Event</span>
              <p className="text-3xl sm:text-4xl font-black text-[#ff6b35]">
                {monthlyEventsCreated}
              </p>
              <p className="text-xs text-[#666666] font-medium mt-2">Events created in selected month</p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Unique Attendees</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">
                {monthlyRsvpStats.uniqueAttendees}
              </p>
              <p className="text-xs text-[#666666] font-medium mt-2">
                {monthlyRsvpStats.repeatRate}% returned for multiple RSVPs
              </p>
            </div>
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-bold text-[#666666] uppercase block mb-1">Listing Views · All Time</span>
              <p className="text-3xl sm:text-4xl font-black text-[#171717]">{totalViews}</p>
              <p className="text-xs text-emerald-600 font-semibold mt-2">
                {totalUniqueViews} unique visitor{totalUniqueViews !== 1 ? 's' : ''} across listings
              </p>
            </div>
          </div>

          {/* Chart Grid 1: Weekly RSVP Velocity & Status Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Weekly RSVP Velocity (Bar Chart) */}
            <div className="lg:col-span-2 bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-black text-[#171717]">RSVPs by Week</h3>
                  <p className="text-xs text-[#666666]">Registrations during the selected month</p>
                </div>
                {hoveredDay && (
                  <span className="text-xs font-black text-[#ff6b35] bg-[#fff0e8] px-2.5 py-1 rounded-lg">
                    {hoveredDay.day}: {hoveredDay.count} signups
                  </span>
                )}
              </div>

              {/* Bar visualization */}
              <div className="pt-6 pb-2">
                <div className="h-44 flex items-end justify-between gap-4 px-2 border-b border-[#e6e1d8]">
                  {monthlyRsvpStats.weeks.map((d) => (
                    <div
                      key={d.label}
                      className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end cursor-pointer group"
                      onMouseEnter={() => setHoveredDay({ day: d.label, count: d.count })}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black text-[#171717] bg-white border px-1.5 py-0.5 rounded shadow-xs mb-1">
                        {d.count}
                      </div>
                      <div
                        style={{ height: `${d.height}%` }}
                        className={`w-full max-w-[40px] rounded-t-xl transition-all duration-300 ${
                          d.count > 0 && d.height === 100
                            ? "bg-gradient-to-t from-[#ff6b35] to-[#ff8c42] shadow-sm"
                            : "bg-[#e8e4dc] group-hover:bg-[#ff6b35]/70"
                        }`}
                      />
                      <span className="text-xs font-bold text-[#666666] group-hover:text-[#ff6b35] mt-1">
                        {d.label}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-[#888888] font-medium pt-2 px-1">
                  <span>{monthlyRsvpStats.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span className="font-bold text-[#ff6b35]">
                    {monthlyRsvpStats.total > 0 ? `${monthlyRsvpStats.total} RSVP${monthlyRsvpStats.total === 1 ? "" : "s"} this month` : "No RSVPs this month"}
                  </span>
                  <span>{monthlyRsvpStats.end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              </div>
            </div>

            {/* Chart 2: RSVP Status Breakdown Donut/Segments */}
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-base font-black text-[#171717]">RSVP Status Distribution</h3>
                <p className="text-xs text-[#666666]">
                  Status breakdown for {monthlyRsvpStats.total} RSVPs in this month
                </p>
              </div>

              {/* Segmented bar visual */}
              <div className="py-6 space-y-4">
                {monthlyRsvpStats.total === 0 ? (
                  <div className="h-5 w-full bg-gray-100 rounded-full" />
                ) : (
                  <div className="h-5 w-full flex rounded-full overflow-hidden shadow-inner">
                    <div style={{ width: `${monthlyRsvpStats.statusCounts.Confirmed / monthlyRsvpStats.total * 100}%` }} className="bg-emerald-500" title="Confirmed" />
                    <div style={{ width: `${monthlyRsvpStats.statusCounts.Pending / monthlyRsvpStats.total * 100}%` }} className="bg-[#ff6b35]" title="Pending" />
                    <div style={{ width: `${monthlyRsvpStats.statusCounts.Declined / monthlyRsvpStats.total * 100}%` }} className="bg-rose-500" title="Declined" />
                  </div>
                )}

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span>Confirmed Guests</span>
                    </div>
                    <span className="text-[#171717]">
                      {monthlyRsvpStats.statusCounts.Confirmed} ({Math.round(monthlyRsvpStats.statusCounts.Confirmed / Math.max(monthlyRsvpStats.total, 1) * 100)}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#ff6b35]" />
                      <span>Pending Verification</span>
                    </div>
                    <span className="text-[#171717]">
                      {monthlyRsvpStats.statusCounts.Pending} ({Math.round(monthlyRsvpStats.statusCounts.Pending / Math.max(monthlyRsvpStats.total, 1) * 100)}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-rose-500" />
                      <span>Declined / Cancelled</span>
                    </div>
                    <span className="text-[#171717]">
                      {monthlyRsvpStats.statusCounts.Declined} ({Math.round(monthlyRsvpStats.statusCounts.Declined / Math.max(monthlyRsvpStats.total, 1) * 100)}%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8] text-xs text-[#555555]">
                ⚡ <strong>Tip:</strong> Sending a reminder 24h before increases check-in rates by +18%.
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-black text-[#171717]">Reporting Window</h3>
            <p className="text-xs text-[#666666] mt-1">
              Monthly RSVP and event totals use records dated {monthlyRsvpStats.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} through {monthlyRsvpStats.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Values refresh when registrations or event data change.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
              <div className="p-4 rounded-xl bg-[#faf8f3] border border-[#e6e1d8]">
                <span className="text-[10px] uppercase tracking-wide font-bold text-[#888888]">Events created</span>
                <p className="text-xl font-black text-[#171717] mt-1">{monthlyEventsCreated}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#faf8f3] border border-[#e6e1d8]">
                <span className="text-[10px] uppercase tracking-wide font-bold text-[#888888]">RSVP submissions</span>
                <p className="text-xl font-black text-[#171717] mt-1">{monthlyRsvpStats.total}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#faf8f3] border border-[#e6e1d8]">
                <span className="text-[10px] uppercase tracking-wide font-bold text-[#888888]">Listing views · all time</span>
                <p className="text-xl font-black text-[#171717] mt-1">{totalViews}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. VERIFICATION TAB: Club Accreditation Details                           */}
      {/* ========================================================================= */}
      {activeTab === "verification" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#171717]">Organization Verification</h1>
            <p className="text-sm text-[#666666] mt-1">
              Verify your student organization to gain the official Spott trust checkmark badge.
            </p>
          </div>

          <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
            {verState.status === "approved" ? (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-900">Current Status: Verified & Approved</p>
                  <p className="text-xs text-emerald-700">
                    Official accreditation granted. Verified badge is active on your public event pages.
                  </p>
                </div>
              </div>
            ) : verState.status === "rejected" ? (
              <div className="flex items-center justify-between p-4 bg-rose-50 rounded-xl border border-rose-200 gap-3">
                <div className="flex items-center gap-3">
                  <X className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-rose-900">Current Status: Application Declined</p>
                      <span className="text-[10px] font-black uppercase bg-rose-200 text-rose-800 px-2 py-0.5 rounded">
                        Archived (30 Days)
                      </span>
                    </div>
                    <p className="text-xs text-rose-700 mt-0.5">
                      Record preserved in compliance archive until {verState.expiresDate || get30DaysExpiryDate()} (30 days retention). You can submit additional credentials below to re-apply.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (await persistVerificationStatus('pending')) {
                      const updated = { ...verState, status: 'pending' as const };
                      setVerState(updated);
                      saveVerificationState(updated, currentOrgName, false);
                      setUploadModalOpen(true);
                    }
                  }}
                  className="px-3.5 py-1.5 bg-[#ff6b35] hover:bg-[#e0531f] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Re-apply</span>
                </button>
              </div>
            ) : verState.documents.length === 0 ? (
              /* Not yet submitted — no ghost "Under Review" */
              <div className="flex items-center gap-3 p-4 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                <Clock className="w-5 h-5 text-[#aaaaaa] shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#555555]">Current Status: Not Submitted</p>
                  <p className="text-xs text-[#888888]">
                    No documents have been uploaded yet. Submit your organization credentials below to begin the verification process.
                  </p>
                </div>
              </div>
            ) : (
              /* Has documents — actually under review */
              <div className="flex items-center gap-3 p-4 bg-[#fff0e8] rounded-xl border border-[#ff6b35]/20">
                <Clock className="w-5 h-5 text-[#ff6b35] shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[#171717]">Current Status: Under Review</p>
                  <p className="text-xs text-[#666666]">
                    Submitted on {verState.expeditedAt || getRealTimeDate()}. University SuperAdmins typically process credentials in 24-48 business hours.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-[#171717]">Document Checklist</h3>
                <span className="text-xs font-bold text-[#666666]">{verState.documents.length} Files Attached</span>
              </div>
              <div className="space-y-3">
                {verState.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-[#171717]">{doc.type}</p>
                        <p className="text-xs text-[#666666] font-mono">{doc.name} • {doc.size || "1.2 MB"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md">
                        Uploaded
                      </span>
                      <button
                        onClick={() => { setPreviewDocName(doc.name); setPreviewDocUrl(doc.url || null); }}
                        className="px-3 py-1 bg-white border border-[#e6e1d8] hover:border-[#ff6b35] hover:text-[#ff6b35] rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#ff6b35]" />
                        <span>View PDF</span>
                      </button>
                      <button
                        onClick={() => handleRemoveDoc(doc.id, doc.name)}
                        title="Remove Document"
                        className="p-1.5 text-[#888888] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Show initial upload card only when no documents uploaded yet */}
                {verState.documents.length === 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-dashed border-[#e6e1d8] bg-[#faf8f3] gap-3">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-[#888888] shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-[#171717]">University Co-Curricular Chapter Charter</p>
                        <p className="text-xs text-[#888888]">Submit your official university organization charter or accreditation certificate</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setUploadModalOpen(true)}
                      className="px-4 py-2 rounded-xl border border-[#ff6b35] bg-[#fff0e8] hover:bg-[#ff6b35] hover:text-white text-xs font-bold text-[#ff6b35] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs self-start sm:self-auto shrink-0"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>Upload PDF</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. PROFILE TAB: Organizer Public Brand & Credentials                      */}
      {/* ========================================================================= */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#171717] tracking-tight">
                Public Organizer Profile
              </h1>
              <p className="text-sm text-[#666666] mt-0.5">
                Customize your organization logo, bio description, and venue address visible to all attendees.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowProfilePreview(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#e6e1d8] bg-white text-xs font-bold text-[#171717] hover:border-[#ff6b35] hover:text-[#ff6b35] transition-all shadow-2xs cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-[#ff6b35]" />
              <span>Preview</span>
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
              {/* Profile Picture / Logo Section */}
              <div className="pb-6 border-b border-[#e6e1d8]">
                <h3 className="text-base font-black text-[#171717] mb-1">Organization Avatar & Logo</h3>
                <p className="text-xs text-[#666666] mb-4">
                  This photo represents your organization across event cards, details pages, and public organizer pages.
                </p>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#171717] via-[#262626] to-[#3a3a3a] text-white flex items-center justify-center font-black text-2xl tracking-wider shadow-sm border border-white/10 shrink-0 overflow-hidden relative">
                    {profileData.avatarUrl ? (
                      <img
                        src={profileData.avatarUrl}
                        alt={profileData.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{profileData.name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#171717] text-white text-xs font-bold hover:bg-[#ff6b35] transition-all cursor-pointer shadow-2xs">
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Upload New Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleAvatarFile(e.target.files[0]);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>

                      {profileData.avatarUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileData((prev) => ({ ...prev, avatarUrl: "" }));
                            setProfileAvatarFile(null);
                            setProfileAvatarRemoved(true);
                          }}
                          className="px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Remove Photo
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#888888] m-0">
                      Recommended: Square PNG or JPG, max 2MB. Clear logos work best on light and dark backgrounds.
                    </p>
                  </div>
                </div>
              </div>

              {/* Text Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-black text-[#171717] mb-1.5 uppercase tracking-wide">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder="e.g. Metro Creative Group"
                    className="w-full text-xs font-bold border border-[#e6e1d8] rounded-xl p-3 focus:outline-none focus:border-[#ff6b35] text-[#171717]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-black text-[#171717] uppercase tracking-wide">
                      Category / Focus
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isCustomFocus) {
                          setIsCustomFocus(true);
                          setCustomFocusText(profileData.category || "");
                        } else {
                          setIsCustomFocus(false);
                          if (!DEFAULT_FOCUS_PRESETS.includes(profileData.category || "")) {
                            setProfileData((prev) => ({ ...prev, category: DEFAULT_FOCUS_PRESETS[0] }));
                          }
                        }
                      }}
                      className="text-[11px] font-bold text-[#ff6b35] hover:underline cursor-pointer"
                    >
                      {isCustomFocus ? "Choose from presets" : "+ Custom Focus"}
                    </button>
                  </div>

                  {isCustomFocus ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={customFocusText}
                        onChange={(e) => {
                          setCustomFocusText(e.target.value);
                          setProfileData((prev) => ({ ...prev, category: e.target.value }));
                        }}
                        placeholder="e.g. Esports & Gaming, Indie Art Collective, Tech Incubator..."
                        className="w-full text-xs font-bold border border-[#ff6b35] rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#ff6b35]/20 text-[#171717] bg-white"
                        autoFocus
                      />
                      <p className="text-[11px] text-[#888888]">
                        Custom focus is shown on your organizer profile and public event badges.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={profileData.category || DEFAULT_FOCUS_PRESETS[0]}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          setIsCustomFocus(true);
                          setCustomFocusText(profileData.category || "");
                        } else {
                          setProfileData((prev) => ({ ...prev, category: e.target.value }));
                        }
                      }}
                      className="w-full text-xs font-bold border border-[#e6e1d8] rounded-xl p-3 focus:outline-none focus:border-[#ff6b35] text-[#171717] bg-white cursor-pointer"
                    >
                      {DEFAULT_FOCUS_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                      {profileData.category && !DEFAULT_FOCUS_PRESETS.includes(profileData.category) && (
                        <option value={profileData.category}>{profileData.category}</option>
                      )}
                      <option value="__custom__" className="font-bold text-[#ff6b35]">
                        + Add Custom Focus / Category...
                      </option>
                    </select>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-[#171717] mb-1.5 uppercase tracking-wide">
                    Address / Campus Location
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-[#ff6b35] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={profileData.address || ""}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="e.g. D+A Campus, De La Salle-College of Saint Benilde, Taft Ave, Malate, Manila"
                      className="w-full text-xs font-bold border border-[#e6e1d8] rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:border-[#ff6b35] text-[#171717]"
                    />
                  </div>
                  <p className="text-[11px] text-[#888888] mt-1">
                    Helps attendees locate your headquarters, campus venue, or base city.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-[#171717] mb-1.5 uppercase tracking-wide">
                    Caption & About Description
                  </label>
                  <textarea
                    rows={4}
                    value={profileData.caption || ""}
                    onChange={(e) => setProfileData((prev) => ({ ...prev, caption: e.target.value }))}
                    placeholder="Describe your organization, events, activities, and community..."
                    className="w-full text-xs leading-relaxed border border-[#e6e1d8] rounded-xl p-3 focus:outline-none focus:border-[#ff6b35] text-[#171717] resize-none"
                  />
                  <p className="text-[11px] text-[#888888] mt-1">
                    This caption is prominently displayed on your public profile header and organizer cards.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black text-[#171717] mb-1.5 uppercase tracking-wide">
                    Official Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={profileData.email || ""}
                    onChange={(e) => setProfileData((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="contact@yourorg.ph"
                    className="w-full text-xs font-bold border border-[#e6e1d8] rounded-xl p-3 focus:outline-none focus:border-[#ff6b35] text-[#171717]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[#171717] mb-1.5 uppercase tracking-wide">
                    Website or Social Link (Optional)
                  </label>
                  <input
                    type="url"
                    value={profileData.website || ""}
                    onChange={(e) => setProfileData((prev) => ({ ...prev, website: e.target.value }))}
                    placeholder="https://instagram.com/yourorg"
                    className="w-full text-xs font-bold border border-[#e6e1d8] rounded-xl p-3 focus:outline-none focus:border-[#ff6b35] text-[#171717]"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-[#e6e1d8] flex items-center justify-between flex-wrap gap-3">
                <span className="text-xs text-[#666666]">
                  {profileSaved ? (
                    <span className="text-emerald-600 font-bold inline-flex items-center gap-1">
                      <Check className="w-4 h-4" /> Changes saved to public profile!
                    </span>
                  ) : (
                    "All changes are instantly published across Spott."
                  )}
                </span>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#ff6b35] text-white text-xs font-bold hover:bg-[#e0531f] transition-all shadow-md cursor-pointer inline-flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Verification Requirements Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#ff6b35]" />
                <h3 className="text-lg font-black text-[#171717]">Organizer Verification Details</h3>
              </div>
              <button
                onClick={() => setShowVerificationModal(false)}
                className="text-[#888888] hover:text-[#171717] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm text-[#444444]">
              <p>
                Spott requires recognized student organizations and verified creators to confirm credentials. This ensures high trust and gives your events top placement.
              </p>
              <div className="p-3 bg-[#fff0e8] rounded-xl border border-[#ff6b35]/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff6b35]">
                  <Check className="w-4 h-4" /> Official University Registration Certificate
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff6b35]">
                  <Check className="w-4 h-4" /> Faculty Adviser Endorsement Letter
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff6b35]">
                  <Check className="w-4 h-4" /> Active Campus Chapter ID
                </div>
              </div>
              <p className="text-xs text-[#666666]">
                Average approval turnaround: <strong>24-48 business hours</strong>. You will receive an in-app notification once verified.
              </p>
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowVerificationModal(false)}
                className="px-5 py-2 rounded-xl bg-[#171717] text-white text-xs font-bold hover:bg-[#ff6b35] transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expedite Verification Modal */}
      {expediteModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Zap className="w-5 h-5 fill-amber-500 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#171717]">Expedite Verification</h3>
                  <p className="text-xs text-[#666666]">Priority SuperAdmin queue routing</p>
                </div>
              </div>
              <button
                onClick={() => setExpediteModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#888888] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 text-amber-900 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-xs text-amber-800">
                  <Clock className="w-4 h-4" />
                  <span>Accelerated Turnaround: 4–12 Business Hours</span>
                </div>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Submitting an expedite request moves your organization credentials to the top of the University Student Affairs review queue with an urgent priority tag.
                </p>
              </div>

              <div>
                <label className="block font-bold text-[#171717] mb-1.5">
                  Reason for Priority Expedite <span className="text-[#ff6b35]">*</span>
                </label>
                <textarea
                  rows={3}
                  value={expediteReason}
                  onChange={(e) => setExpediteReason(e.target.value)}
                  placeholder="e.g. Launching ticket registration for annual campus festival within 24 hours..."
                  className="w-full border border-[#e6e1d8] rounded-xl p-3 text-xs focus:outline-none focus:border-[#ff6b35] text-[#171717] resize-none"
                />
                <p className="text-[10px] text-[#888888] mt-1">
                  Provide brief context so university administrators can validate urgency.
                </p>
              </div>

              <div className="p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8] space-y-1 text-[#555555]">
                <div className="flex justify-between">
                  <span className="font-bold">Applicant:</span>
                  <span className="font-black text-[#171717]">Metro Creative Group</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Attached Credentials:</span>
                  <span className="font-black text-[#ff6b35]">{verState.documents.length} PDF Documents</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#e6e1d8] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setExpediteModalOpen(false)}
                className="px-4 py-2.5 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExpedite}
                className="px-5 py-2.5 bg-gradient-to-r from-[#ff6b35] to-[#ff8c42] hover:from-[#e0531f] hover:to-[#ff6b35] text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                <span>Submit Expedite Request</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload PDF Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-[#e6e1d8]">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6e1d8]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#171717]">Upload Document</h3>
                  <p className="text-xs text-[#666666]">Attach university accreditation or chapter credentials</p>
                </div>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#888888] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#171717] mb-1.5">
                  Credential Type
                </label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#ff6b35] text-[#171717]"
                >
                  <option value="University Co-Curricular Charter">University Co-Curricular Charter</option>
                  <option value="University Accreditation Certificate">University Accreditation Certificate</option>
                  <option value="Faculty Adviser Endorsement Letter">Faculty Adviser Endorsement Letter</option>
                  <option value="Student Council Recognition Certificate">Student Council Recognition Certificate</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#171717] mb-1.5">
                  Document Filename / Title <span className="text-[#ff6b35]">*</span>
                </label>
                <input
                  type="text"
                  value={uploadDocTitle}
                  onChange={(e) => setUploadDocTitle(e.target.value)}
                  placeholder="e.g. Metro_Creative_Chapter_Charter_2025"
                  className="w-full border border-[#e6e1d8] rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#ff6b35] text-[#171717] font-mono"
                />
                <p className="text-[10px] text-[#888888] mt-1">
                  Choose a PDF file under 15 MB. It will be stored privately.
                </p>
              </div>

              {/* Drag and Drop Box */}
              <label className="border-2 border-dashed border-[#e6e1d8] hover:border-[#ff6b35] bg-[#faf8f3] rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors block">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadDocumentFile(file);
                      setUploadDocTitle(file.name.replace(/\.[^/.]+$/, ""));
                    }
                  }}
                />
                <FileText className="w-8 h-8 text-[#ff6b35] mb-2" />
                <p className="text-xs font-black text-[#171717]">
                  {uploadDocTitle ? `${uploadDocTitle}.pdf selected` : "Click to select or drop PDF file"}
                </p>
                <p className="text-[10px] text-[#888888] mt-0.5">
                  Supports Adobe Acrobat PDF, scanned certificates with official seals
                </p>
              </label>

              {isUploading && (
                <div className="p-3 bg-[#fff0e8] rounded-xl border border-[#ff6b35]/30 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-[#ff6b35]">
                    Encrypting and uploading credentials to campus registry...
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#e6e1d8] flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2.5 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555555] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={handleConfirmUpload}
                className="px-5 py-2.5 bg-[#ff6b35] hover:bg-[#e0531f] text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{isUploading ? "Uploading..." : "Upload Credential"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#e6e1d8] space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#e6e1d8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#fff0e8] text-[#ff6b35] flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#171717]">Edit Event Details</h3>
                  <p className="text-xs text-[#666666]">Updates are pushed to attendees and user notifications</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-[#555] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEventEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#171717] mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={editingEvent.name}
                  onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Event Date</label>
                  <input
                    type="text"
                    required
                    value={editingEvent.date}
                    onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Time</label>
                  <input
                    type="text"
                    required
                    value={editingEvent.time}
                    onChange={(e) => setEditingEvent({ ...editingEvent, time: e.target.value })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#171717] mb-1">Location / Venue</label>
                <input
                  type="text"
                  required
                  value={editingEvent.location}
                  onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
                  className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Category</label>
                  <select
                    value={editingEvent.category}
                    onChange={(e) => setEditingEvent({ ...editingEvent, category: e.target.value })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35] bg-white"
                  >
                    <option value="Music">Music</option>
                    <option value="Arts & Culture">Arts & Culture</option>
                    <option value="Tech & Design">Tech & Design</option>
                    <option value="Night Markets">Night Markets</option>
                    <option value="School Events">School Events</option>
                    <option value="Community">Community</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Status</label>
                  <select
                    value={editingEvent.status}
                    onChange={(e) => setEditingEvent({ ...editingEvent, status: e.target.value as OrganizerEvent["status"] })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35] bg-white"
                  >
                    <option value="Active">Active (Live)</option>
                    <option value="Draft">Draft</option>
                    <option value="Archived">Archived</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Price (₱)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingEvent.price}
                    onChange={(e) => setEditingEvent({ ...editingEvent, price: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#171717] mb-1">Capacity / Total Slots</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingEvent.capacity ?? 100}
                    onChange={(e) => setEditingEvent({ ...editingEvent, capacity: Number(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#171717] outline-none focus:border-[#ff6b35]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#e6e1d8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555] hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 bg-[#ff6b35] hover:bg-[#e0531f] disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                >
                  {isSavingEdit ? "Saving changes..." : "Save & Notify Attendees"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Event Confirmation Modal */}
      {cancellingEvent && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-[#e6e1d8] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#171717]">Cancel Event</h3>
                  <p className="text-xs text-[#666666]">This action notifies all RSVPed attendees</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancellingEvent(null)}
                disabled={isCancelling}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-[#555] flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Are you sure you want to cancel &quot;{cancellingEvent.name}&quot;?</span>
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                All <strong>{cancellingEvent.rsvps} attendee(s)</strong> with active or pending RSVPs will immediately receive an official cancellation notification in their Spott inbox.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#171717] mb-1.5">
                Cancellation Reason <span className="text-[#888888] font-normal">(Optional)</span>
              </label>
              <textarea
                rows={3}
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                placeholder="e.g. Inclement weather warning, venue maintenance, organizer reschedule..."
                className="w-full px-3 py-2 border border-[#e6e1d8] rounded-xl text-xs font-medium text-[#171717] outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="pt-2 border-t border-[#e6e1d8] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => setCancellingEvent(null)}
                className="px-4 py-2 border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#555] hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                Nevermind
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancelEvent}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md cursor-pointer transition-all flex items-center gap-1.5"
              >
                {isCancelling ? "Cancelling..." : "Confirm & Notify Attendees"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Public Preview Modal */}
      {showProfilePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#fcfbf9] w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-[#e6e1d8] flex flex-col overflow-hidden">
            {/* Top Toolbar */}
            <div className="px-6 py-4 bg-white border-b border-[#e6e1d8] flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#ff6b35] flex items-center justify-center font-bold">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-[#171717] tracking-tight">Public Profile Preview</h2>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold">
                      Attendee View
                    </span>
                  </div>
                  <p className="text-[11px] text-[#666666]">
                    This is exactly how attendees and students see your organizer brand.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfilePreview(false)}
                  className="p-2 text-[#777] hover:text-[#171717] hover:bg-[#f0ece1] rounded-xl transition-colors cursor-pointer"
                  title="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Render Public Profile Representation */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Organizer Hero Card */}
              <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 sm:p-8 shadow-xs relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                  <div className="relative shrink-0">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#171717] via-[#262626] to-[#3a3a3a] text-white flex items-center justify-center font-black text-2xl tracking-wider shadow-sm border border-white/10 overflow-hidden">
                      {profileData.avatarUrl ? (
                        <img
                          src={profileData.avatarUrl}
                          alt={profileData.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{(profileData.name || "MC").slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    {verState.status === "approved" && (
                      <div
                        className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-md z-10 flex items-center justify-center"
                        title="Verified Organizer"
                      >
                        <CheckCircle2 className="w-5 h-5 text-[#14804a]" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl sm:text-2xl font-black text-[#171717] tracking-tight">
                        {profileData.name || "Organizer Name"}
                      </h3>
                      {verState.status === "approved" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#14804a] border border-emerald-200 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#14804a]" />
                          <span>Verified Organizer</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 text-[#666] border border-gray-200 text-xs font-medium">
                          <span>Community Organizer</span>
                        </span>
                      )}
                      {profileData.category && (
                        <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-[#ff6b35] border border-orange-200/70 text-xs font-bold">
                          {profileData.category}
                        </span>
                      )}
                    </div>

                    {profileData.address && (
                      <div className="flex items-center gap-1.5 text-xs text-[#666]">
                        <MapPin className="w-3.5 h-3.5 text-[#ff6b35] shrink-0" />
                        <span>{profileData.address}</span>
                      </div>
                    )}

                    <p className="text-xs text-[#444] pt-1 leading-relaxed max-w-2xl">
                      {profileData.caption || "No bio description provided yet."}
                    </p>

                    <div className="flex items-center gap-3 pt-2 text-xs flex-wrap">
                      {profileData.email && (
                        <div className="flex items-center gap-1 text-[#666]">
                          <Mail className="w-3.5 h-3.5 text-[#ff6b35]" />
                          <span>{profileData.email}</span>
                        </div>
                      )}
                      {profileData.website && (
                        <div className="flex items-center gap-1 text-[#ff6b35]">
                          <Globe className="w-3.5 h-3.5" />
                          <span className="underline">{profileData.website}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-[#e6e1d8] rounded-xl p-4 text-center">
                  <div className="text-xl font-black text-[#171717]">{events.length}</div>
                  <div className="text-[11px] font-semibold text-[#777]">Total Events</div>
                </div>
                <div className="bg-white border border-[#e6e1d8] rounded-xl p-4 text-center">
                  <div className="text-xl font-black text-[#14804a]">
                    {events.filter((e) => e.status === "Active").length}
                  </div>
                  <div className="text-[11px] font-semibold text-[#777]">Active Events</div>
                </div>
                <div className="bg-white border border-[#e6e1d8] rounded-xl p-4 text-center">
                  <div className="text-xl font-black text-[#ff6b35]">
                    {events.reduce((sum, e) => sum + (e.rsvps || 0), 0)}
                  </div>
                  <div className="text-[11px] font-semibold text-[#777]">Total RSVPs</div>
                </div>
              </div>

              {/* Events by Organizer Preview */}
              <div>
                <h4 className="text-sm font-black text-[#171717] mb-3">
                  Events by {profileData.name || "Organizer"}
                </h4>
                {events.length === 0 ? (
                  <div className="bg-white border border-[#e6e1d8] rounded-xl p-6 text-center text-xs text-[#777]">
                    No published events yet. Events you create will show up here for attendees.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {events.slice(0, 4).map((ev) => (
                      <div
                        key={ev.id}
                        className="bg-white border border-[#e6e1d8] rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black text-[#171717] truncate">{ev.name}</div>
                          <div className="text-[11px] text-[#777] flex items-center gap-1.5 mt-0.5">
                            <Calendar className="w-3 h-3 text-[#ff6b35]" />
                            <span>{ev.date}</span>
                            <span>•</span>
                            <MapPin className="w-3 h-3 text-[#ff6b35]" />
                            <span className="truncate">{ev.location}</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 bg-emerald-50 text-[#14804a] border border-emerald-200">
                          {ev.rsvps} RSVPs
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-white border-t border-[#e6e1d8] flex items-center justify-between">
              <span className="text-xs text-[#777]">
                Closing preview will keep your current form edits.
              </span>
              <button
                type="button"
                onClick={() => setShowProfilePreview(false)}
                className="px-4 py-2 bg-[#171717] hover:bg-[#ff6b35] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {previewDocName && (
        <PdfViewerModal
          documentName={previewDocName}
          documentUrl={previewDocUrl}
          organizerName="Metro Creative Group"
          onClose={() => { setPreviewDocName(null); setPreviewDocUrl(null); }}
        />
      )}
    </div>
  );
}

export default function OrganizerDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-gray-500">Loading Dashboard...</div>}>
      <OrganizerContent />
    </Suspense>
  );
}
