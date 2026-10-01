"use client";

import { useSyncExternalStore } from "react";
import { getCurrentUser } from "./auth-store";

export interface VerificationDocument {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  verified: boolean;
  sizeBytes?: number;
  url?: string;
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

const listeners = new Set<() => void>();
const verificationByOrganization = new Map<string, VerificationState>();

function organizationKey(name: string): string {
  return name.trim().toLowerCase();
}

function emitUpdate(broadcast = true) {
  for (const listener of listeners) listener();
  if (broadcast && typeof window !== "undefined") window.dispatchEvent(new Event("spott_verification_updated"));
}

function subscribeToVerification(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window !== "undefined") window.addEventListener("spott_auth_changed", callback);
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") window.removeEventListener("spott_auth_changed", callback);
  };
}

export const getRealTimeDate = () =>
  new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const get30DaysExpiryDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function resolveOrgName(organizerName?: string): string {
  if (organizerName?.trim()) return organizerName.trim();
  const current = getCurrentUser();
  return current?.organization || current?.name || "Organizer";
}

// Kept for reading old UI identifiers only. Verification records are no longer
// loaded from or written to those localStorage keys.
export function getVerificationStorageKey(organizerName?: string): string {
  const slug = resolveOrgName(organizerName).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return `spott_verification_state_${slug}`;
}

export const defaultVerificationState: VerificationState = {
  organizerName: "Organizer",
  status: "pending",
  isExpedited: false,
  documents: [],
};

export function getVerificationState(organizerName?: string): VerificationState {
  const name = resolveOrgName(organizerName);
  return verificationByOrganization.get(organizationKey(name)) || {
    ...defaultVerificationState,
    organizerName: name,
    documents: [],
  };
}

export function saveVerificationState(state: VerificationState, organizerName?: string, broadcast = true) {
  const name = resolveOrgName(organizerName || state.organizerName);
  verificationByOrganization.set(organizationKey(name), { ...state, organizerName: name });
  emitUpdate(broadcast);
}

export function useVerificationState(): VerificationState | null {
  const name = resolveOrgName();
  const key = organizationKey(name);
  return useSyncExternalStore(
    subscribeToVerification,
    () => verificationByOrganization.get(key) || null,
    () => null,
  );
}
