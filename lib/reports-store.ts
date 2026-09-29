"use client";

import { addNotification } from "./notifications-store";

export interface ReportItem {
  id: string;
  reporter: string;
  reporterEmail?: string;
  eventId: string;
  event: string;
  reason: string;
  details: string;
  status: "open" | "resolved";
  submitted: string;
  resolutionNote?: string;
  decidedAt?: string;
  resolvedAt?: string;
  expiresAt?: string;
}

const STORAGE_KEY_REPORTS = "spott_incident_reports";
const REPORTS_UPDATED_EVENT = "spott_reports_updated";
const CHANNEL_NAME = "spott_reports_channel";

export function getReports(): ReportItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPORTS);
    if (!raw) return [];
    const parsed: ReportItem[] = JSON.parse(raw);
    const now = Date.now();
    let changed = false;
    const reports = parsed.filter((report) => {
      if (report.status !== "resolved") return true;

      const parsedDecision = report.decidedAt ? new Date(report.decidedAt).getTime() : NaN;
      const legacyDecision = Number.isFinite(parsedDecision) ? parsedDecision : now;
      const resolvedAt = report.resolvedAt || new Date(legacyDecision).toISOString();
      const expiresAt = report.expiresAt || new Date(legacyDecision + 30 * 24 * 60 * 60 * 1000).toISOString();
      if (!report.resolvedAt || !report.expiresAt) {
        report.resolvedAt = resolvedAt;
        report.expiresAt = expiresAt;
        changed = true;
      }
      if (new Date(expiresAt).getTime() <= now) {
        changed = true;
        return false;
      }
      return true;
    });
    if (changed) localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(reports));
    return reports;
  } catch {
    return [];
  }
}

export function saveReports(list: ReportItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(list));
    window.dispatchEvent(new Event(REPORTS_UPDATED_EVENT));
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: REPORTS_UPDATED_EVENT, timestamp: Date.now() });
      channel.close();
    } catch {}
  } catch {}
}

export function addReport(data: {
  reporter: string;
  reporterEmail?: string;
  eventId: string;
  event: string;
  reason?: string;
  details: string;
}): ReportItem {
  const list = getReports();
  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const newReport: ReportItem = {
    id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    reporter: data.reporter || "Anonymous Attendee",
    reporterEmail: data.reporterEmail || "attendee@spott.ph",
    eventId: data.eventId,
    event: data.event,
    reason: data.reason || "Policy / Content Concern",
    details: data.details,
    status: "open",
    submitted: formattedDate,
  };

  const updated = [newReport, ...list];
  saveReports(updated);

  // Send real-time notification to administrators
  try {
    addNotification({
      type: "announcement",
      title: `Incident Report: "${data.event}"`,
      message: `${newReport.reporter} reported "${data.event}": "${data.details.slice(0, 80)}${data.details.length > 80 ? "..." : ""}"`,
      targetRole: "admin",
      link: "/admin?tab=reports",
    });
  } catch {}

  return newReport;
}

export function resolveReport(id: string, resolutionNote: string = "Resolved by administrator"): ReportItem | null {
  const list = getReports();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  list[idx] = {
    ...list[idx],
    status: "resolved",
    resolutionNote,
    decidedAt: formattedDate,
    resolvedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  saveReports(list);
  return list[idx];
}

export function deleteReport(id: string) {
  const list = getReports();
  const updated = list.filter((r) => r.id !== id);
  saveReports(updated);
}

export function subscribeToReports(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleUpdate = () => callback();

  window.addEventListener(REPORTS_UPDATED_EVENT, handleUpdate);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY_REPORTS || e.key === null) {
      callback();
    }
  };
  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data?.type === REPORTS_UPDATED_EVENT) {
        callback();
      }
    };
  } catch {}

  return () => {
    window.removeEventListener(REPORTS_UPDATED_EVENT, handleUpdate);
    window.removeEventListener("storage", handleStorage);
    if (channel) {
      try {
        channel.close();
      } catch {}
    }
  };
}
