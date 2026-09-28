"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import {
  Sparkles,
  Eye,
  Bookmark,
  Calendar,
  Clock,
  MapPin,
  Tag,
  CheckCircle2,
  Users,
  DollarSign,
  ArrowLeft,
  X,
  ImagePlus,
  Trash2,
  Check,
} from "lucide-react";
import { addNotification } from "@/lib/notifications-store";
import { saveStoredEvent } from "@/lib/events-store";
import LocationPicker from "@/components/LocationPicker";
import { getCurrentUser } from "@/lib/auth-store";
import { getVerificationState } from "@/lib/verification-store";

const eventSchema = z.object({
  title: z.string().min(1, "Event title is required"),
  description: z.string().min(1, "Event description is required"),
  date: z.string().min(1, "Please enter an event date"),
  time: z.string().min(1, "Please enter an event time"),
  location: z.string().min(1, "Location is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  isFree: z.boolean(),
  category: z.string().min(1, "Please select a category"),
  hasCapacityLimit: z.boolean().default(false),
  capacity: z.coerce.number().min(1, "Capacity must be at least 1").optional().nullable(),
  requireApproval: z.boolean().default(false),
});

type EventFormValues = z.infer<typeof eventSchema>;

export default function CreateEventPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [publishedEventId, setPublishedEventId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Cover image state
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverFileName, setCoverFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pinned location coordinates
  const [pinnedLat, setPinnedLat] = useState<number>(14.5638);
  const [pinnedLng, setPinnedLng] = useState<number>(120.9965);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema) as any,
    defaultValues: {
      price: 0,
      isFree: true,
      category: "School Events",
      title: "",
      description: "",
      location: "",
      date: `${new Date().getFullYear()}-10-24`,
      time: "14:00",
      hasCapacityLimit: false,
      capacity: 50,
      requireApproval: false,
    },
  });

  const isFreeWatched = watch("isFree");
  const formValues = watch();

  const handleFreeToggle = (checked: boolean) => {
    setValue("isFree", checked);
    if (checked) setValue("price", 0);
  };

  // Compress image to ensure it easily fits in localStorage and network payloads (~40-80KB)
  const compressImageFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = Math.round(width);
          canvas.height = Math.round(height);
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL("image/jpeg", 0.72);
          resolve(compressed);
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle cover image file selection → compress to lightweight data URL
  const handleCoverImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file (JPG, PNG, GIF, WebP).");
      return;
    }
    setCoverFileName(file.name);
    try {
      const compressedDataUrl = await compressImageFile(file);
      setCoverImage(compressedDataUrl);
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => setCoverImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeCoverImage = () => {
    setCoverImage(null);
    setCoverFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSaveDraft = () => {
    try {
      localStorage.setItem("spott_event_draft", JSON.stringify({ ...formValues, coverImage }));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3500);
    } catch {
      setDraftSaved(true);
    }
  };

  const onSubmit = async (data: EventFormValues) => {
    setIsSubmitting(true);
    setErrorMsg("");
    setSuccess(false);

    if (!data.location || !data.location.trim()) {
      setErrorMsg("Please enter a valid venue or location.");
      setIsSubmitting(false);
      return;
    }

    if (!pinnedLat || !pinnedLng) {
      setErrorMsg("Venue location is not pinned. Please type an address or click the map to set a pin.");
      setIsSubmitting(false);
      return;
    }

    const user = getCurrentUser();
    const orgName = user?.organization || user?.name || "Metro Creative Group";
    const isApproved = getVerificationState(orgName).status === "approved";

    const parsedCapacity = data.hasCapacityLimit && data.capacity ? Number(data.capacity) : null;
    const requireApproval = Boolean(data.requireApproval);

    const newEventObj = {
      id: `event-${Date.now()}`,
      title: data.title,
      description: data.description,
      date: `${data.date} ${data.time}:00`,
      price: data.isFree ? 0 : data.price,
      status: "active",
      organizer: orgName,
      verified: isApproved,
      location: data.location,
      city: "Manila",
      latitude: pinnedLat,
      longitude: pinnedLng,
      categories: [data.category],
      registrations: 0,
      capacity: parsedCapacity,
      requireApproval: requireApproval,
      confirmedAt: new Date().toISOString(),
      coverImage: coverImage || null,
      image: coverImage || null,
    };

    // 1. Immediately save to directory and broadcast so event is instantly published
    saveStoredEvent(newEventObj as any);
    setPublishedEventId(newEventObj.id);
    setSuccess(true);
    addNotification({
      type: "announcement",
      title: `New Event: "${data.title}"`,
      message: `${orgName} published a new event at ${data.location}. Check out details and RSVP!`,
      targetRole: "user",
      link: `/events/${newEventObj.id}`,
    });

    // 2. Fire-and-forget sync to API in background with 2-second timeout (never blocks UI)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          id: newEventObj.id,
          title: data.title,
          description: data.description,
          category: data.category,
          date: data.date,
          time: data.time,
          location: data.location,
          latitude: pinnedLat,
          longitude: pinnedLng,
          price: data.isFree ? 0 : data.price,
          capacity: parsedCapacity,
          requireApproval: requireApproval,
          organizer: "Metro Creative Group",
          coverImage: coverImage || null,
        }),
      })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    } catch {}

    // Reset form fields back to empty/default and clear uploaded cover image
    reset({
      price: 0,
      isFree: true,
      category: "School Events",
      title: "",
      description: "",
      location: "",
      date: `${new Date().getFullYear()}-10-24`,
      time: "14:00",
      hasCapacityLimit: false,
      capacity: 50,
      requireApproval: false,
    });
    removeCoverImage();
    setPinnedLat(14.5638);
    setPinnedLng(120.9965);
    try {
      localStorage.removeItem("spott_event_draft");
    } catch {}

    setIsSubmitting(false);
  };

  const onInvalid = (fieldErrors: any) => {
    const firstKey = Object.keys(fieldErrors)[0];
    const message = fieldErrors[firstKey]?.message || "Please fill in all required fields.";
    setErrorMsg(message);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#666666] hover:text-[#ff6b35] transition-colors no-underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Organizer Overview</span>
        </Link>
        <span className="text-[11px] font-bold text-[#ff6b35] bg-[#fff0e8] px-3 py-1 rounded-full border border-[#ff6b35]/20">
          Organizer Mode
        </span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#171717] tracking-tight">
          Create New Event
        </h1>
        <p className="text-sm text-[#666666] font-medium mt-1">
          List a new event for other participants to discover.
        </p>
      </div>

      {/* Alerts */}
      {success && (
        <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Event published successfully! It is now live in the Spott feed and across all pages.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {publishedEventId && (
              <Link
                href={`/events/${publishedEventId}`}
                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition font-bold no-underline inline-flex items-center gap-1"
              >
                View Live Event →
              </Link>
            )}
            <Link
              href="/organizer"
              className="text-xs bg-white text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition font-bold no-underline"
            >
              Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setSuccess(false)}
              className="text-emerald-700 hover:text-emerald-950 p-1 text-sm font-bold cursor-pointer ml-1"
              title="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {draftSaved && (
        <div className="p-3 bg-[#fff0e8] text-[#ff6b35] rounded-xl border border-[#ff6b35]/30 text-xs font-bold flex items-center gap-2">
          <Bookmark className="w-4 h-4" />
          <span>Draft saved successfully to local storage!</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm font-bold flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg("")}
            className="text-red-700 hover:text-red-950 p-1 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Form Card */}
      <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">

          {/* ── Cover Image Upload ── */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
              Cover Image <span className="text-[#888888] font-normal">(optional)</span>
            </label>

            {coverImage ? (
              /* Image preview */
              <div className="relative rounded-2xl overflow-hidden border border-[#e6e1d8] group">
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="w-full h-52 object-cover"
                />
                {/* Overlay with filename + remove */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end justify-between p-4 opacity-0 group-hover:opacity-100">
                  <span className="text-white text-xs font-bold truncate max-w-[70%] bg-black/50 px-2 py-1 rounded-lg">
                    {coverFileName}
                  </span>
                  <button
                    type="button"
                    onClick={removeCoverImage}
                    className="p-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
                {/* Always-visible remove button for accessibility */}
                <button
                  type="button"
                  onClick={removeCoverImage}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                  title="Remove cover image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* Upload zone */
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-40 border-2 border-dashed border-[#e6e1d8] hover:border-[#ff6b35] rounded-2xl flex flex-col items-center justify-center gap-3 text-[#888888] hover:text-[#ff6b35] hover:bg-[#fff8f5] transition-all cursor-pointer group"
              >
                <span className="w-12 h-12 rounded-2xl bg-[#faf8f3] group-hover:bg-[#fff0e8] flex items-center justify-center transition-colors">
                  <ImagePlus className="w-6 h-6" />
                </span>
                <div className="text-center">
                  <p className="text-sm font-bold">Click to upload cover image</p>
                  <p className="text-xs mt-0.5 text-[#aaa]">JPG, PNG, GIF, WebP — max 5 MB</p>
                </div>
              </button>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverImageChange}
            />
          </div>

          {/* Event Title */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
              Event Title
            </label>
            <input
              {...register("title")}
              placeholder="e.g. Acoustic Sessions at the Quad"
              className={`w-full border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                errors.title
                  ? "border-red-400 focus:ring-1 focus:ring-red-400"
                  : "border-[#e6e1d8] focus:border-[#ff6b35] focus:ring-1 focus:ring-[#ff6b35]/20"
              }`}
            />
            {errors.title && (
              <p className="text-red-500 text-xs mt-1 font-semibold">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
              Description
            </label>
            <textarea
              {...register("description")}
              rows={4}
              placeholder="Enter descriptive text about your schedule, activities, guidelines..."
              className={`w-full border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                errors.description
                  ? "border-red-400 focus:ring-1 focus:ring-red-400"
                  : "border-[#e6e1d8] focus:border-[#ff6b35] focus:ring-1 focus:ring-[#ff6b35]/20"
              }`}
            />
            {errors.description && (
              <p className="text-red-500 text-xs mt-1 font-semibold">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Date & Time Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
                Date
              </label>
              <input
                type="date"
                {...register("date")}
                className={`w-full border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                  errors.date
                    ? "border-red-400"
                    : "border-[#e6e1d8] focus:border-[#ff6b35] focus:ring-1 focus:ring-[#ff6b35]/20"
                }`}
              />
              {errors.date && (
                <p className="text-red-500 text-xs mt-1 font-semibold">{errors.date.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
                Time
              </label>
              <input
                type="time"
                {...register("time")}
                className={`w-full border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                  errors.time
                    ? "border-red-400"
                    : "border-[#e6e1d8] focus:border-[#ff6b35] focus:ring-1 focus:ring-[#ff6b35]/20"
                }`}
              />
              {errors.time && (
                <p className="text-red-500 text-xs mt-1 font-semibold">{errors.time.message}</p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span>Location / Venue</span>
                  {watch("location")?.trim() ? (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                      <Check className="w-3 h-3 text-emerald-600" /> Pinned ({pinnedLat.toFixed(4)}, {pinnedLng.toFixed(4)})
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      Type venue to auto-pin
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-normal text-[#888888]">
                  Auto-pins marker on map
                </span>
              </label>
              <input
                {...register("location")}
                placeholder="e.g. DAC Theater, D+A Campus, De La Salle-College of Saint Benilde, Malate, Manila"
                className={`w-full border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                  errors.location
                    ? "border-red-400"
                    : "border-[#e6e1d8] focus:border-[#ff6b35] focus:ring-1 focus:ring-[#ff6b35]/20"
                }`}
              />
              {errors.location && (
                <p className="text-red-500 text-xs mt-1 font-semibold">{errors.location.message}</p>
              )}
            </div>

            {/* Pin Location on Map */}
            <LocationPicker
              locationValue={watch("location") || ""}
              onLocationChange={(val) => setValue("location", val, { shouldValidate: true })}
              lat={pinnedLat}
              lng={pinnedLng}
              onCoordinatesChange={(lat, lng) => {
                setPinnedLat(lat);
                setPinnedLng(lng);
              }}
            />
          </div>

          {/* Category & Price Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
                Category
              </label>
              <select
                {...register("category")}
                className="w-full border border-[#e6e1d8] rounded-xl px-4 py-3 text-sm font-bold bg-white focus:outline-none focus:border-[#ff6b35]"
              >
                <option value="Music & Concerts">Music & Concerts</option>
                <option value="Night Markets">Night Markets</option>
                <option value="School Events">School Events</option>
                <option value="Food & Drinks">Food & Drinks</option>
                <option value="Art & Culture">Art & Culture</option>
                <option value="Workshops">Workshops</option>
                <option value="Sports & Fitness">Sports & Fitness</option>
                <option value="Tech">Tech</option>
                <option value="Comedy">Comedy</option>
                <option value="Outdoor">Outdoor</option>
                <option value="Networking">Networking</option>
              </select>
            </div>

            {/* Price + Free Event Checkbox */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
                Price (₱)
              </label>
              <div className="space-y-2">
                <input
                  type="number"
                  step="0.01"
                  disabled={isFreeWatched}
                  {...register("price")}
                  placeholder="0.00"
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none transition-all ${
                    isFreeWatched
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200"
                      : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                />
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isFreeWatched}
                    onChange={(e) => handleFreeToggle(e.target.checked)}
                    className="w-4 h-4 rounded text-[#ff6b35] focus:ring-[#ff6b35] border-[#e6e1d8] accent-[#ff6b35]"
                  />
                  <span className="text-xs font-bold text-[#555555]">This is a free event</span>
                </label>
              </div>
            </div>
          </div>

          {/* Capacity & RSVP Approval Settings */}
          <div className="bg-[#faf8f3] border border-[#e6e1d8] rounded-2xl p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="text-sm font-black text-[#171717] flex items-center gap-2">
                <span>Capacity & Registration Rules</span>
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                Set attendee limits and choose whether to screen/approve reservations.
              </p>
            </div>

            {/* Capacity Limit Checkbox & Input */}
            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  {...register("hasCapacityLimit")}
                  className="w-4 h-4 mt-0.5 rounded text-[#ff6b35] focus:ring-[#ff6b35] border-[#e6e1d8] accent-[#ff6b35]"
                />
                <div>
                  <span className="text-xs sm:text-sm font-bold text-[#171717] block">
                    Limit attendee capacity (Limited Slots)
                  </span>
                  <span className="text-xs text-[#777]">
                    Leave unchecked if this event has unlimited slots.
                  </span>
                </div>
              </label>

              {watch("hasCapacityLimit") && (
                <div className="pl-6 pt-1">
                  <label className="block text-xs font-bold text-[#171717] mb-1">
                    Maximum Capacity / Available Seats
                  </label>
                  <div className="flex items-center gap-2 max-w-xs">
                    <input
                      type="number"
                      min={1}
                      {...register("capacity")}
                      placeholder="e.g. 50"
                      className="w-full border border-[#e6e1d8] rounded-xl px-4 py-2.5 text-sm font-bold bg-white focus:outline-none focus:border-[#ff6b35]"
                    />
                    <span className="text-xs text-[#888] font-bold shrink-0">slots</span>
                  </div>
                  {errors.capacity && (
                    <p className="text-red-500 text-xs mt-1 font-semibold">{errors.capacity.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Require Approval Toggle */}
            <div className="pt-3 border-t border-[#e6e1d8]">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  {...register("requireApproval")}
                  className="w-4 h-4 mt-0.5 rounded text-[#ff6b35] focus:ring-[#ff6b35] border-[#e6e1d8] accent-[#ff6b35]"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-[#171717]">
                      Require Organizer Approval for RSVPs
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      Screening / Pending
                    </span>
                  </div>
                  <span className="text-xs text-[#666] block mt-0.5">
                    When enabled, new attendees will enter a <strong>"Pending"</strong> queue in your RSVP Management dashboard until you click Approve.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-[#e6e1d8] flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
            <button
              type="button"
              onClick={onSaveDraft}
              className="w-full sm:w-auto px-5 py-3 rounded-xl border border-[#e6e1d8] text-xs font-bold text-[#171717] hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="w-full sm:w-auto px-5 py-3 rounded-xl border border-[#e6e1d8] hover:border-[#ff6b35] text-xs font-bold text-[#171717] hover:text-[#ff6b35] hover:bg-[#fff0e8] transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <Eye className="w-4 h-4" />
              <span>Preview</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-7 py-3 rounded-xl bg-[#171717] hover:bg-[#ff6b35] text-white text-xs sm:text-sm font-black shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Publishing..." : "Publish Event"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Live Preview Modal ── */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-[#e6e1d8] relative z-10 my-auto">

            {/* Header: real image if uploaded, else gradient fallback */}
            <div className="relative h-52 flex flex-col justify-between text-white overflow-hidden">
              {coverImage ? (
                <>
                  <img
                    src={coverImage}
                    alt="Event cover"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Dark gradient overlay so text stays readable */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
                </>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#ff6b35] to-[#222222]" />
              )}

              {/* Close button */}
              <div className="relative z-10 flex justify-end p-4">
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Event meta at bottom of image */}
              <div className="relative z-10 p-5 pb-4">
                <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold uppercase tracking-wider">
                  {formValues.category || "School Event"}
                </span>
                <h3 className="text-xl font-black mt-2 leading-tight drop-shadow">
                  {formValues.title || "Untitled Event"}
                </h3>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2 text-xs text-[#555555]">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#ff6b35]" />
                  <span className="font-semibold text-[#171717]">
                    {formValues.date || "Date TBA"} at {formValues.time || "Time TBA"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#ff6b35]" />
                  <span>{formValues.location || "Location TBA"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#ff6b35]" />
                  <span className="font-bold text-[#171717]">
                    {formValues.isFree ? "Free Entry" : `₱${formValues.price || "0.00"}`}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-700 mb-1">About This Event</h4>
                <p className="text-xs text-[#666666] leading-relaxed line-clamp-3">
                  {formValues.description || "No description provided yet."}
                </p>
              </div>

              <div className="pt-3">
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-[#171717] text-white font-bold text-xs hover:bg-[#ff6b35] transition-colors cursor-pointer"
                >
                  Return to Editor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
