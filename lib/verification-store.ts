"use client";

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

const STORAGE_KEY = "spott_verification_state_v1";

export const defaultVerificationState: VerificationState = {
  organizerName: "Metro Creative Group",
  status: "pending",
  isExpedited: false,
  documents: [],
};

export function getVerificationState(): VerificationState {
  if (typeof window === "undefined") return defaultVerificationState;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed: VerificationState = JSON.parse(data);
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
  return defaultVerificationState;
}

export function saveVerificationState(state: VerificationState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event("spott_verification_updated"));
  } catch {}
}

export function setExpeditedRequest(note: string): VerificationState {
  const current = getVerificationState();
  const updated: VerificationState = {
    ...current,
    isExpedited: true,
    expediteNote: note || "Upcoming major concert on Oct 24 requiring verified trust badge before ticket launch.",
    expeditedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };
  saveVerificationState(updated);
  return updated;
}

export function addVerificationDocument(name: string, type: string = "Campus Chapter Credential"): VerificationState {
  const current = getVerificationState();
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
    documents: [...current.documents, newDoc],
  };
  saveVerificationState(updated);
  return updated;
}

export function setApprovalStatus(
  status: "pending" | "approved" | "rejected",
  reason?: string
): VerificationState {
  const current = getVerificationState();
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
  saveVerificationState(updated);
  return updated;
}

export function resetVerificationState(): VerificationState {
  saveVerificationState(defaultVerificationState);
  return defaultVerificationState;
}
