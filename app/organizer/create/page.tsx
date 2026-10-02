"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
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
  ArrowLeft,
  X,
  ImagePlus,
  Trash2,
  Check,
} from "lucide-react";
import { saveStoredEvent } from "@/lib/events-store";
import LocationPicker from "@/components/LocationPicker";
import { getCurrentUser } from "@/lib/auth-store";
import { getAllCategories, DEFAULT_APP_CATEGORIES, syncCategoriesFromDatabase } from "@/lib/categories";
import { checkEventForModeration, loadModerationConfig } from "@/lib/moderation-store";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";

import { validateEventTitle } from "@/lib/validators/name";

const eventSchema = z.object({
  title: z.string().superRefine((val, ctx) => {
    const error = validateEventTitle(val);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  }),
  description: z.string().min(1, "Event description is required"),
  date: z.string().min(1, "Please enter an event date"),
  time: z.string().min(1, "Please enter an event time"),
  location: z.string().min(1, "Please input or pin a location").max(200, "Location name is too long"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  isFree: z.boolean(),
  category: z.string().min(1, "Please select a category"),
  hasCapacityLimit: z.boolean(),
  capacity: z.coerce.number().min(1, "Capacity must be at least 1").optional().nullable(),
  requireApproval: z.boolean(),
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
  const [pinnedLat, setPinnedLat] = useState<number | null>(null);
  const [pinnedLng, setPinnedLng] = useState<number | null>(null);

  // Categories list & custom category creation
  const [categoriesList, setCategoriesList] = useState<string[]>(DEFAULT_APP_CATEGORIES);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");

  useEffect(() => {
    const sync = () => setCategoriesList(getAllCategories());
    sync();
    void syncCategoriesFromDatabase().catch(() => {});
    window.addEventListener("spott_categories_updated", sync);
    return () => window.removeEventListener("spott_categories_updated", sync);
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors, isValid },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    mode: "onChange",
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
  const locationWatched = watch("location");
  const hasCapacityLimitWatched = watch("hasCapacityLimit");

  // Validate that all required fields are filled before enabling the publish button.
  // Optional fields: Cover image, Capacity & Approval checkboxes.
  const isFormComplete = useMemo(() => {
    const hasCategory = isCustomCategory
      ? Boolean(customCategoryInput && customCategoryInput.trim().length > 0)
      : true; // isValid already checks if category is valid if not custom
    const hasCoordinates = Boolean(pinnedLat && pinnedLng);

    return (
      isValid &&
      hasCategory &&
      hasCoordinates
    );
  }, [isValid, pinnedLat, pinnedLng, isCustomCategory, customCategoryInput]);

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
      localStorage.setItem("spott_event_draft", JSON.stringify({ title: watch("title"), description: watch("description"), location: watch("location"), date: watch("date"), time: watch("time"), isFree: watch("isFree"), price: watch("price"), category: watch("category"), hasCapacityLimit: watch("hasCapacityLimit"), capacity: watch("capacity"), requireApproval: watch("requireApproval"), coverImage }));
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

    const parsedCapacity = data.hasCapacityLimit && data.capacity ? Number(data.capacity) : null;
    const requireApproval = Boolean(data.requireApproval);

    const finalCategory = isCustomCategory
      ? customCategoryInput.trim()
      : data.category;

    try {
      await loadModerationConfig();
    } catch {
      setErrorMsg("Unable to load current moderation settings. Please retry before publishing.");
      setIsSubmitting(false);
      return;
    }
    const modCheck = checkEventForModeration(data.title, data.description, parsedCapacity || 0, 0);
    const eventStatus = modCheck.isKeywordFlagged ? "flagged" : "active";

    const newEventObj = {
      id: `event-${Date.now()}`,
      title: data.title,
      description: data.description,
      date: `${data.date} ${data.time}:00`,
      price: data.isFree ? 0 : data.price,
      status: eventStatus,
      organizer: orgName,
      verified: false,
      location: data.location,
      city: "Manila",
      latitude: pinnedLat || 14.5638,
      longitude: pinnedLng || 120.9965,
      categories: [finalCategory],
      registrations: 0,
      capacity: parsedCapacity,
      requireApproval: requireApproval,
      confirmedAt: new Date().toISOString(),
      coverImage: coverImage || null,
      image: coverImage || null,
    };

    let persistedEvent = newEventObj;
    try {
      const response = await fetchWithSupabaseSession("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          category: finalCategory,
          date: data.date,
          time: data.time,
          location: data.location,
          city: "Manila",
          latitude: pinnedLat || 14.5638,
          longitude: pinnedLng || 120.9965,
          price: data.isFree ? 0 : data.price,
          capacity: parsedCapacity,
          requireApproval,
          status: eventStatus,
          coverImage: coverImage || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.event_id !== "string") {
        throw new Error(result.error || "Could not save the event to the shared database.");
      }
      persistedEvent = { ...newEventObj, id: result.event_id };
      saveStoredEvent(persistedEvent);
      setPublishedEventId(persistedEvent.id);
      setSuccess(true);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Could not save the event. Please try again.");
      setIsSubmitting(false);
      return;
    }

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
    setIsCustomCategory(false);
    setCustomCategoryInput("");
    removeCoverImage();
    setPinnedLat(null);
    setPinnedLng(null);
    try {
      localStorage.removeItem("spott_event_draft");
    } catch {}

    setIsSubmitting(false);
  };

  const onInvalid = (fieldErrors: FieldErrors<EventFormValues>) => {
    const firstField = Object.values(fieldErrors).find((field) => field?.message);
    const message = firstField?.message || "Please fill in all required fields.";
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
                  {locationWatched?.trim() && pinnedLat !== null && pinnedLng !== null ? (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                      <Check className="w-3 h-3 text-emerald-600" /> Pinned ({pinnedLat.toFixed(4)}, {pinnedLng.toFixed(4)})
                    </span>
                  ) : locationWatched?.trim() ? (
                    <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-300 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                      Unrecognized Venue — Please pin on map
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
              locationValue={locationWatched || ""}
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs sm:text-sm font-bold text-[#171717]">
                  Category
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isCustomCategory;
                    setIsCustomCategory(next);
                    if (next) {
                      setValue("category", customCategoryInput || "Custom");
                    } else {
                      setValue("category", categoriesList[0] || "Music & Concerts");
                    }
                  }}
                  className="text-xs font-bold text-[#ff6b35] hover:underline cursor-pointer"
                >
                  {isCustomCategory ? "← Select from list" : "+ Create Custom Category"}
                </button>
              </div>

              {isCustomCategory ? (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={customCategoryInput}
                    onChange={(e) => {
                      setCustomCategoryInput(e.target.value);
                      setValue("category", e.target.value);
                    }}
                    placeholder="e.g. Cosplay & Anime, Card Collectors..."
                    className="w-full border border-[#ff6b35] rounded-xl px-4 py-3 text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-[#ff6b35]/20"
                    autoFocus
                  />
                  <p className="text-[11px] text-[#888888]">
                    Your custom category will be automatically added to the discovery filter!
                  </p>
                </div>
              ) : (
                <select
                  {...register("category")}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setIsCustomCategory(true);
                      setValue("category", customCategoryInput || "Custom");
                    } else {
                      setValue("category", e.target.value);
                    }
                  }}
                  className="w-full border border-[#e6e1d8] rounded-xl px-4 py-3 text-sm font-bold bg-white focus:outline-none focus:border-[#ff6b35] cursor-pointer"
                >
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__custom__" className="font-bold text-[#ff6b35]">
                    + Add Custom Category...
                  </option>
                </select>
              )}
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

              {hasCapacityLimitWatched && (
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
                    When enabled, new attendees will enter a <strong>&quot;Pending&quot;</strong> queue in your RSVP Management dashboard until you click Approve.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Missing fields notice */}
          {!isFormComplete && (
            <div className="pt-4 flex items-center justify-end">
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shadow-2xs">
                <span>Fill in all required fields (title, date, time, venue, description) to publish</span>
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-[#e6e1d8] flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
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
            <div className="w-full sm:w-auto">
              <button
                type="submit"
                disabled={!isFormComplete || isSubmitting}
                className={`w-full sm:w-auto px-7 py-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 ${
                  !isFormComplete || isSubmitting
                    ? "bg-[#a3a3a3] text-white/80 cursor-not-allowed opacity-60 shadow-none"
                    : "bg-[#171717] hover:bg-[#ff6b35] text-white shadow-md hover:shadow-lg cursor-pointer"
                }`}
              >
                <span>
                  {isSubmitting ? "Publishing..." : "Publish Event"}
                </span>
              </button>
            </div>
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
                  {getValues("category") || "School Event"}
                </span>
                <h3 className="text-xl font-black mt-2 leading-tight drop-shadow">
                  {getValues("title") || "Untitled Event"}
                </h3>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2 text-xs text-[#555555]">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#ff6b35]" />
                  <span className="font-semibold text-[#171717]">
                    {getValues("date") || "Date TBA"} at {getValues("time") || "Time TBA"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#ff6b35]" />
                  <span>{getValues("location") || "Location TBA"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-[#ff6b35]">₱</span>
                  <span className="font-bold text-[#171717]">
                    {getValues("isFree") ? "Free Entry" : `₱${getValues("price") || "0.00"}`}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-700 mb-1">About This Event</h4>
                <p className="text-xs text-[#666666] leading-relaxed line-clamp-3">
                  {getValues("description") || "No description provided yet."}
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
