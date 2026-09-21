"use client";

import { useState } from "react";
import {
  FileText,
  Download,
  Printer,
  ZoomIn,
  ZoomOut,
  X,
  ShieldCheck,
  Award,
  CheckCircle2,
} from "lucide-react";

interface PdfViewerModalProps {
  documentName: string;
  organizerName?: string;
  onClose: () => void;
}

export default function PdfViewerModal({
  documentName,
  organizerName = "Metro Creative Group",
  onClose,
}: PdfViewerModalProps) {
  const [zoom, setZoom] = useState(100);

  const handleDownload = () => {
    // Generate text/pdf simulation download
    const element = document.createElement("a");
    const file = new Blob([`Official Document: ${documentName}\nIssued to: ${organizerName}\nStatus: Verified by University OSA`], {
      type: "text/plain",
    });
    element.href = URL.createObjectURL(file);
    element.download = documentName;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const isAdviserDoc = documentName.toLowerCase().includes("adviser");

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-[#2a2a2a] rounded-3xl max-w-3xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-gray-700 text-white">
        {/* Top PDF Controls Bar */}
        <div className="h-14 px-4 bg-[#1f1f1f] border-b border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-xs shrink-0">
              PDF
            </div>
            <span className="font-bold text-xs sm:text-sm text-gray-200 truncate">
              {documentName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg text-xs font-bold text-gray-300">
              <button
                onClick={() => setZoom((z) => Math.max(z - 15, 70))}
                className="p-1 hover:text-white cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-10 text-center">{zoom}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(z + 15, 140))}
                className="p-1 hover:text-white cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Download Button */}
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-[#ff6b35] hover:bg-[#e0531f] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PDF Page Viewer Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center bg-[#383838]">
          <div
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
            className="w-[600px] min-h-[800px] bg-white text-gray-900 rounded-lg shadow-2xl p-8 sm:p-12 relative flex flex-col justify-between border border-gray-300 transition-transform duration-150 select-none"
          >
            {/* Document Decorative Watermark */}
            <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
              <Award className="w-96 h-96 text-black" />
            </div>

            {/* Document Header */}
            <div className="text-center border-b-2 border-gray-900 pb-6 relative">
              <div className="flex justify-center mb-2">
                <div className="w-16 h-16 rounded-full border-2 border-amber-600 flex items-center justify-center bg-amber-50">
                  <ShieldCheck className="w-10 h-10 text-amber-700" />
                </div>
              </div>
              <p className="text-[11px] font-black uppercase tracking-[2px] text-gray-600">
                University Board of Regents • Office of Student Affairs
              </p>
              <h2 className="text-xl sm:text-2xl font-serif font-black tracking-tight text-gray-900 mt-1">
                {isAdviserDoc
                  ? "FACULTY ADVISER OFFICIAL ENDORSEMENT"
                  : "CERTIFICATE OF RECOGNITION & ACCREDITATION"}
              </h2>
              <p className="text-[10px] font-mono text-gray-500 mt-1">
                REF NO: OSA-ACCR-{new Date().getFullYear()}-0842-A • ACADEMIC YEAR {new Date().getFullYear()}-{new Date().getFullYear() + 1}
              </p>
            </div>

            {/* Document Body */}
            <div className="space-y-6 my-auto py-6 text-xs sm:text-sm leading-relaxed text-gray-800">
              <p className="text-justify indent-8">
                This document officially verifies that <strong>{organizerName}</strong> has satisfied all institutional charters, co-curricular standards, and safety governance bylaws established by the Office of Student Affairs.
              </p>

              <div className="p-4 bg-amber-50/70 border border-amber-300 rounded-xl space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-600">Recognized Chapter:</span>
                  <span className="font-black text-gray-900">{organizerName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-600">Accreditation Category:</span>
                  <span className="font-black text-gray-900">Arts, Culture & Campus Programming</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-600">Faculty Sponsor:</span>
                  <span className="font-black text-gray-900">Dr. Helena Vance, Ph.D.</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-600">Campus Status:</span>
                  <span className="font-black text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approved / In Good Standing
                  </span>
                </div>
              </div>

              <p className="text-justify text-xs text-gray-600">
                The chapter is authorized to host registered events, solicit reservations via the Spott Platform, and conduct activities in all verified university venues.
              </p>
            </div>

            {/* Signatures & Seal */}
            <div className="pt-6 border-t border-gray-300 grid grid-cols-2 gap-8 items-end">
              <div className="text-center">
                <div className="font-serif italic text-lg text-blue-900 font-bold -rotate-3 mb-1">
                  Dr. Helena Vance
                </div>
                <div className="border-t border-gray-700 pt-1">
                  <p className="text-xs font-bold text-gray-900">Dr. Helena Vance, Ph.D.</p>
                  <p className="text-[10px] text-gray-500">Faculty Adviser, Metro Creative</p>
                </div>
              </div>

              <div className="text-center">
                <div className="font-serif italic text-lg text-blue-900 font-bold rotate-2 mb-1">
                  Marcus Sterling, Ed.D.
                </div>
                <div className="border-t border-gray-700 pt-1">
                  <p className="text-xs font-bold text-gray-900">Marcus Sterling, Ed.D.</p>
                  <p className="text-[10px] text-gray-500">Dean of Student Affairs</p>
                </div>
              </div>
            </div>

            {/* Document Footer Barcode & Stamp */}
            <div className="mt-8 pt-3 border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-400 font-mono">
              <span>AUTHENTICITY HASH: SHA256-8A9F-{new Date().getFullYear()}</span>
              <span>VERIFIED VIA SPOTT CAMPUS REGISTRY</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
