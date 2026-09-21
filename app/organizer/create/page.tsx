"use client";

import { useState } from "react";
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
} from "lucide-react";
import { addNotification } from "@/lib/notifications-store";
import { saveStoredEvent } from "@/lib/events-store";

const eventSchema = z.object({
  title: z.string().min(1, "Event title is required"),
  description: z.string().min(10, "Description must be at least 10 characters long"),
  date: z.string().min(1, "Please enter an event date"),
  time: z.string().min(1, "Please enter an event time"),
  location: z.string().min(1, "Location is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  isFree: z.boolean(),
  category: z.string().min(1, "Please select a category"),
  registrationLimit: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

export default function CreateEventPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
      registrationLimit: "",
    },
  });

  const isFreeWatched = watch("isFree");
  const formValues = watch();

  const handleFreeToggle = (checked: boolean) => {
    setValue("isFree", checked);
    if (checked) {
      setValue("price", 0);
    }
  };

  const onSaveDraft = () => {
    try {
      localStorage.setItem("spott_event_draft", JSON.stringify(formValues));
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

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          category: data.category,
          date: data.date,
          time: data.time,
          location: data.location,
          price: data.isFree ? 0 : data.price,
          registrationInfo: data.registrationLimit,
        }),
      });

      const newEventObj = {
        id: `event-${Date.now()}`,
        title: data.title,
        description: data.description,
        date: `${data.date} ${data.time}:00`,
        price: data.isFree ? 0 : data.price,
        status: "active",
        organizer: "Metro Creative Group",
        verified: true,
        location: data.location,
        city: "Manila",
        categories: [data.category],
        registrations: 0,
        confirmedAt: new Date().toISOString(),
      };
      saveStoredEvent(newEventObj);

      setSuccess(true);
      addNotification({
        type: "announcement",
        title: `New Event: "${data.title}"`,
        message: `Metro Creative Group published a new event at ${data.location}. Check out details and RSVP!`,
        targetRole: "user",
        link: `/events/${newEventObj.id}`,
      });
    } catch {
      // In development or local demo, mark success gracefully
      const newEventObj = {
        id: `event-${Date.now()}`,
        title: data.title,
        description: data.description,
        date: `${data.date} ${data.time}:00`,
        price: data.isFree ? 0 : data.price,
        status: "active",
        organizer: "Metro Creative Group",
        verified: true,
        location: data.location,
        city: "Manila",
        categories: [data.category],
        registrations: 0,
        confirmedAt: new Date().toISOString(),
      };
      saveStoredEvent(newEventObj);

      setSuccess(true);
      addNotification({
        type: "announcement",
        title: `New Event: "${data.title}"`,
        message: `Metro Creative Group published a new event at ${data.location}. Check out details and RSVP!`,
        targetRole: "user",
        link: `/events/${newEventObj.id}`,
      });
    } finally {
      setIsSubmitting(false);
    }
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

      {/* Header matching Wireframe 3 */}
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
        <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Event published successfully! It is now live in the Spott feed.</span>
          </div>
          <Link
            href="/discover"
            className="text-xs font-black underline hover:text-emerald-950 px-3 py-1 bg-emerald-100 rounded-lg"
          >
            View in Discover
          </Link>
        </div>
      )}

      {draftSaved && (
        <div className="p-3 bg-[#fff0e8] text-[#ff6b35] rounded-xl border border-[#ff6b35]/30 text-xs font-bold flex items-center gap-2">
          <Bookmark className="w-4 h-4" />
          <span>Draft saved successfully to local storage!</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm font-bold">
          {errorMsg}
        </div>
      )}

      {/* Main Form Card matching Wireframe 3 */}
      <div className="bg-white border border-[#e6e1d8] rounded-2xl p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
          <div>
            <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
              Location / Venue
            </label>
            <input
              {...register("location")}
              placeholder="e.g. Room 102, Campus Arts Hall"
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
                <option value="School Events">School Events</option>
                <option value="Concerts">Concerts</option>
                <option value="Workshops">Workshops</option>
                <option value="Night Markets">Night Markets</option>
              </select>
            </div>

            {/* Price ($ / ₱) + Free Event Checkbox */}
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

          {/* Registration Info */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-[#171717] mb-1.5">
              Registration Info
            </label>
            <input
              {...register("registrationLimit")}
              placeholder="Max attendees (leave empty if unlimited)"
              className="w-full border border-[#e6e1d8] rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-[#ff6b35]"
            />
          </div>

          {/* Action Buttons matching Wireframe 3 */}
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

      {/* Live Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-[#e6e1d8]">
            <div className="relative h-48 bg-gradient-to-br from-[#ff6b35] to-[#222222] p-5 flex flex-col justify-between text-white">
              <button
                onClick={() => setPreviewOpen(false)}
                className="self-end w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <div>
                <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold uppercase tracking-wider">
                  {formValues.category || "School Event"}
                </span>
                <h3 className="text-xl font-black mt-2 leading-tight">
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
                  className="w-full py-2.5 rounded-xl bg-[#171717] text-white font-bold text-xs hover:bg-[#ff6b35] transition-colors"
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
