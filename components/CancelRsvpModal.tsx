"use client";

import { AlertCircle, AlertTriangle, X } from "lucide-react";

interface CancelRsvpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  eventTitle?: string;
  isSubmitting?: boolean;
}

export default function CancelRsvpModal({
  isOpen,
  onClose,
  onConfirm,
  eventTitle,
  isSubmitting = false,
}: CancelRsvpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-line relative animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-rsvp-title"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-ink hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with Icon Badge */}
        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <AlertCircle className="w-5 h-5 stroke-[2]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 id="cancel-rsvp-title" className="text-lg font-bold text-ink leading-tight m-0">
              Cancel your RSVP?
            </h3>
            {eventTitle && (
              <p className="text-xs font-semibold text-accent mt-1 m-0 truncate">
                {eventTitle}
              </p>
            )}
          </div>
        </div>

        {/* Warning Information Box - Clean UI with No Emojis */}
        <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3.5 mb-5 space-y-2 text-xs text-[#3d3832] leading-relaxed">
          <p className="m-0 font-medium text-ink">
            Are you sure you want to cancel your registration?
          </p>
          <div className="flex items-start gap-2 text-rose-700 font-semibold pt-0.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />
            <span>This means other users may take your slot.</span>
          </div>
          <p className="m-0 text-muted leading-normal">
            You may still RSVP again later if slots are still available.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl font-bold text-xs text-ink hover:bg-gray-100 border border-line transition-all cursor-pointer"
          >
            Keep My Spot
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? "Cancelling…" : "Yes, Cancel RSVP"}
          </button>
        </div>
      </div>
    </div>
  );
}
