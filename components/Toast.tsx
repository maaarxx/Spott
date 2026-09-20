"use client";

import { useState, useEffect, useCallback } from "react";

type ToastType = "success" | "error" | "info";

type ToastState = {
  message: string;
  type: ToastType;
  visible: boolean;
};

let toastCallback: ((message: string, type?: ToastType) => void) | null = null;

export function showToast(message: string, type: ToastType = "success") {
  toastCallback?.(message, type);
}

export default function Toast() {
  const [toast, setToast] = useState<ToastState>({ message: "", type: "success", visible: false });

  const show = useCallback((message: string, type: ToastType = "success") => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2500);
  }, []);

  useEffect(() => {
    toastCallback = show;
    return () => {
      toastCallback = null;
    };
  }, [show]);

  if (!toast.visible) return null;

  const bgColor = toast.type === "error" ? "bg-red-600" : toast.type === "info" ? "bg-dark" : "bg-dark";

  return (
    <div
      className={`fixed right-5 bottom-5 ${bgColor} text-white px-5 py-3.5 rounded-xl font-medium text-sm z-[100] shadow-lg`}
      style={{ animation: "toast-slide-in 0.2s ease-out" }}
      role="status"
    >
      {toast.message}
    </div>
  );
}
