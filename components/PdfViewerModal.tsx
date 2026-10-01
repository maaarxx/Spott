"use client";

import { Download, X } from "lucide-react";

interface PdfViewerModalProps {
  documentName: string;
  organizerName?: string;
  documentUrl?: string | null;
  onClose: () => void;
}

export default function PdfViewerModal({
  documentName,
  organizerName = "Organizer",
  documentUrl,
  onClose,
}: PdfViewerModalProps) {
  const openDocument = () => {
    if (documentUrl) window.open(documentUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-[#2a2a2a] rounded-3xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-gray-700 text-white">
        <div className="h-14 px-4 bg-[#1f1f1f] border-b border-gray-700 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-xs sm:text-sm text-gray-200 truncate">{documentName}</p>
            <p className="text-[10px] text-gray-400 truncate">{organizerName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openDocument}
              disabled={!documentUrl}
              className="px-3 py-1.5 bg-[#ff6b35] hover:bg-[#e0531f] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Open PDF</span>
            </button>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-gray-300" aria-label="Close PDF preview">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-[#383838] p-3 sm:p-5">
          {documentUrl ? (
            <iframe src={documentUrl} title={`${organizerName}: ${documentName}`} className="w-full h-full rounded-lg bg-white" />
          ) : (
            <div className="h-full flex items-center justify-center text-center">
              <p className="max-w-md rounded-xl bg-white p-8 text-sm text-gray-700">
                This record has no stored PDF. The previous local-only workflow saved a filename without uploading the document.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
