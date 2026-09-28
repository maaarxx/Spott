"use client";

import { getCurrentUser } from "./auth-store";

export interface VerificationDocument {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  verified: boolean;
}

export interface VerificationState {
  organizerName: string;
  status: "pending" | "approved" | "rejected";
  isExpedited: boolean;
  expediteNote?: string;
  expeditedAt?: string;
  decidedAt?: string;
  retentionDays?: number;
  expiresDate?: string;
  decisionReason?: string;
  documents: VerificationDocument[];
}

export const getRealTimeDate = () =>
  new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const get30DaysExpiryDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function resolveOrgName(organizerName?: string): string {
  if (organizerName && organizerName.trim()) return organizerName.trim();
  const current = getCurrentUser();
  return current?.organization || current?.name || "Metro Creative Group";
}

export function getVerificationStorageKey(organizerName?: string): string {
  const name = resolveOrgName(organizerName);
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  if (slug === "metro_creative_group" || slug === "mcg_spott_ph") {
    return "spott_verification_state_v1";
  }
  return `spott_verification_state_${slug}`;
}

export const defaultVerificationState: VerificationState = {
  organizerName: "Metro Creative Group",
  status: "pending",
  isExpedited: false,
  documents: [],
};

export function getVerificationState(organizerName?: string): VerificationState {
  if (typeof window === "undefined") return defaultVerificationState;
  const name = resolveOrgName(organizerName);
  const key = getVerificationStorageKey(name);

  try {
    const data = localStorage.getItem(key);
    if (data) {
      const parsed: VerificationState = JSON.parse(data);
      // Ensure organizerName reflects current organization
      parsed.organizerName = name;
      // Auto-migrate old 2025 dates to current real-time date & year
      if (parsed.expiresDate && parsed.expiresDate.includes("2025")) {
        parsed.expiresDate = get30DaysExpiryDate();
      }
      if (parsed.decidedAt && parsed.decidedAt.includes("2025")) {
        parsed.decidedAt = getRealTimeDate();
      }
      if (parsed.expeditedAt && parsed.expeditedAt.includes("2025")) {
        parsed.expeditedAt = getRealTimeDate();
      }
      if (parsed.documents) {
        parsed.documents = parsed.documents.map((d) => ({
          ...d,
          uploadedAt: d.uploadedAt?.includes("2025") ? getRealTimeDate() : d.uploadedAt,
        }));
      }
      return parsed;
    }
  } catch {}

  return {
    organizerName: name,
    status: "pending",
    isExpedited: false,
    documents: [],
  };
}

export function saveVerificationState(state: VerificationState, organizerName?: string) {
  if (typeof window === "undefined") return;
  const name = resolveOrgName(organizerName || state.organizerName);
  const key = getVerificationStorageKey(name);
  try {
    localStorage.setItem(key, JSON.stringify({ ...state, organizerName: name }));
    window.dispatchEvent(new Event("spott_verification_updated"));
  } catch {}
}

export function setExpeditedRequest(note: string, organizerName?: string): VerificationState {
  const current = getVerificationState(organizerName);
  const updated: VerificationState = {
    ...current,
    isExpedited: true,
    expediteNote: note || "Upcoming major event requiring verified trust badge before ticket launch.",
    expeditedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };
  saveVerificationState(updated, organizerName);
  return updated;
}

export function addVerificationDocument(
  name: string,
  type: string = "University Co-Curricular Charter",
  organizerName?: string
): VerificationState {
  const current = getVerificationState(organizerName);
  const newDoc: VerificationDocument = {
    id: `doc-${Date.now()}`,
    name: name.endsWith(".pdf") ? name : `${name}.pdf`,
    type,
    size: "1.2 MB",
    uploadedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    verified: true,
  };
  const updated: VerificationState = {
    ...current,
    documents: [...(current.documents || []), newDoc],
  };
  saveVerificationState(updated, organizerName);
  return updated;
}

export function removeVerificationDocument(id: string, organizerName?: string): VerificationState {
  const current = getVerificationState(organizerName);
  const updated: VerificationState = {
    ...current,
    documents: (current.documents || []).filter((d) => d.id !== id),
  };
  saveVerificationState(updated, organizerName);
  return updated;
}

export function setApprovalStatus(
  status: "pending" | "approved" | "rejected",
  reason?: string,
  organizerName?: string
): VerificationState {
  const current = getVerificationState(organizerName);
  const now = new Date();
  const decidedAt = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const updated: VerificationState = {
    ...current,
    status,
    decidedAt: status === "pending" ? undefined : decidedAt,
    retentionDays: status === "pending" ? undefined : 30,
    expiresDate: status === "pending" ? undefined : expires,
    decisionReason:
      reason ||
      (status === "approved"
        ? "Accreditation approved by University SuperAdmin."
        : status === "rejected"
        ? "Application declined. Record preserved in 30-day archive."
        : undefined),
  };
  saveVerificationState(updated, organizerName);
  return updated;
}

export function resetVerificationState(organizerName?: string): VerificationState {
  const name = resolveOrgName(organizerName);
  const emptyState: VerificationState = {
    organizerName: name,
    status: "pending",
    isExpedited: false,
    documents: [],
  };
  saveVerificationState(emptyState, name);
  return emptyState;
}
