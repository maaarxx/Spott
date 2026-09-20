"use client";

import Link from "next/link";
import { format } from "date-fns";
import { CheckCircle2, Bookmark, MapPin, Calendar } from "lucide-react";

export type EventData = {
  id: string;
  title: string;
  description?: string;
  date: string;
  endDate?: string;
  price: number;
  status?: string;
  organizer?: string;
  verified?: boolean;
  location?: string;
  address?: string;
  city?: string;
  categories: string[];
  registrations?: number;
  latitude?: number;
  longitude?: number;
  confirmedAt?: string | null;
  isSaved?: boolean;
};

type EventCardProps = {
  event: EventData;
  variant?: "featured" | "list" | "discover";
  onSave?: (eventId: string) => void;
};

export default function EventCard({
  event,
  variant = "featured",
  onSave,
}: EventCardProps) {
  let dateFormatted = "Upcoming";
  try {
    const parsed = new Date(event.date.replace(" ", "T"));
    dateFormatted = format(parsed, "EEE, MMM d · h:mm a");
  } catch {
    dateFormatted = event.date;
  }

  const priceLabel =
    Number(event.price) === 0 ? "Free Entry" : `₱${Number(event.price).toLocaleString()}`;
  const categoryLabel = event.categories?.[0] || "Community";

  // 1. LIST VARIANT (Wireframe: "Upcoming Near You")
  if (variant === "list") {
    return (
      <div className="flex items-center gap-4 bg-white border border-line rounded-2xl p-4 hover:shadow-sm transition-all group">
        {/* Thumbnail Visual */}
        <Link
          href={`/events/${event.id}`}
          className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#262626] to-[#444] text-white flex-shrink-0 flex flex-col items-center justify-center p-2 text-center no-underline transition-transform group-hover:scale-102"
        >
          <span className="text-[10px] font-black uppercase text-accent tracking-wider">
            {categoryLabel.slice(0, 4)}
          </span>
          <span className="text-xs font-black leading-tight mt-0.5">
            {format(new Date(event.date.replace(" ", "T")), "MMM d")}
          </span>
        </Link>

        {/* Middle Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted">
              {categoryLabel}
            </span>
            <span className="text-muted text-[10px]">•</span>
            {event.verified ? (
              <span className="text-[9px] font-black uppercase tracking-wider bg-[#14804a]/10 text-[#14804a] border border-[#14804a]/20 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" /> Verified
              </span>
            ) : (
              <span className="text-[9px] font-black uppercase tracking-wider bg-[#fff0e8] text-accent border border-accent/20 px-1.5 py-0.5 rounded">
                Upcoming
              </span>
            )}
          </div>

          <Link href={`/events/${event.id}`} className="no-underline">
            <h3 className="font-bold text-ink text-base leading-tight mb-1 truncate hover:text-accent transition-colors">
              {event.title}
            </h3>
          </Link>

          <p className="text-xs text-muted truncate m-0">
            {dateFormatted} · {event.location || event.city}
          </p>
        </div>

        {/* Right Price & Save Button */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-bold text-ink">{priceLabel}</span>
          <button
            type="button"
            onClick={() => onSave?.(event.id)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-all cursor-pointer ${
              event.isSaved
                ? "bg-[#fff0e8] text-accent border-accent/30 shadow-xs"
                : "bg-white text-ink border-line hover:border-accent hover:text-accent hover:bg-[#faf8f3]"
            }`}
          >
            <Bookmark
              className="w-3.5 h-3.5"
              fill={event.isSaved ? "currentColor" : "none"}
            />
            {event.isSaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  // 2. DISCOVER VARIANT (Wireframe: Discover Dual Pane)
  if (variant === "discover") {
    return (
      <div className="bg-white border border-line rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col group">
        <div className="relative h-36 bg-gradient-to-br from-[#262626] to-[#4a4a4a] flex items-center justify-center text-white p-4">
          <span className="text-xs font-black uppercase tracking-widest text-[#ff6b35]/80">
            {categoryLabel}
          </span>
          <span className="absolute top-3 left-3 text-[10px] font-black uppercase bg-white text-ink px-2 py-0.5 rounded shadow-sm">
            {priceLabel}
          </span>
          <button
            type="button"
            onClick={() => onSave?.(event.id)}
            className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              event.isSaved
                ? "bg-accent text-white"
                : "bg-white/90 text-ink hover:bg-white"
            }`}
          >
            <Bookmark
              className="w-4 h-4"
              fill={event.isSaved ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="p-4 flex flex-col flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider bg-dark text-white px-2 py-0.5 rounded">
              {categoryLabel}
            </span>
            {event.verified && (
              <span className="text-[10px] font-black uppercase tracking-wider text-[#14804a] flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          <Link href={`/events/${event.id}`} className="no-underline">
            <h3 className="font-bold text-ink text-base leading-tight mb-2 hover:text-accent transition-colors line-clamp-1">
              {event.title}
            </h3>
          </Link>
          <p className="text-xs text-muted mb-1">{dateFormatted}</p>
          <p className="text-xs text-muted flex items-center gap-1 m-0 truncate">
            <MapPin className="w-3 h-3 shrink-0" /> {event.location || event.city}
          </p>
        </div>
      </div>
    );
  }

  // 3. FEATURED VARIANT (Wireframe: "Featured Events")
  return (
    <div className="bg-white border border-line rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col group">
      {/* Top Visual Area with Verified Pill */}
      <div className="relative h-44 bg-gradient-to-br from-[#262626] via-[#333] to-[#4a4a4a] flex items-center justify-center p-4 select-none">
        <span className="text-sm font-black tracking-widest text-[#ff6b35]/70 uppercase">
          {categoryLabel}
        </span>
        {event.verified && (
          <div className="absolute top-3 left-3 bg-dark text-white text-[10px] font-black px-2.5 py-1 rounded-md flex items-center gap-1 uppercase tracking-wider shadow-sm">
            <CheckCircle2 className="w-3 h-3 text-[#14804a]" /> Verified
          </div>
        )}
        <button
          type="button"
          onClick={() => onSave?.(event.id)}
          className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
            event.isSaved
              ? "bg-accent text-white"
              : "bg-white/90 text-ink hover:bg-white"
          }`}
          title="Save event"
        >
          <Bookmark
            className="w-4 h-4"
            fill={event.isSaved ? "currentColor" : "none"}
          />
        </button>
      </div>

      {/* Card Content matching wireframe */}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-muted">
            {categoryLabel}
          </span>
          <span className="text-xs font-bold text-ink">{priceLabel}</span>
        </div>

        <Link href={`/events/${event.id}`} className="no-underline">
          <h3 className="font-bold text-lg text-ink leading-tight mb-2 hover:text-accent transition-colors line-clamp-1">
            {event.title}
          </h3>
        </Link>

        <p className="text-xs text-muted mb-1.5 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-muted shrink-0" />
          <span>{dateFormatted}</span>
        </p>

        <p className="text-xs text-muted flex items-center gap-1.5 m-0 truncate">
          <MapPin className="w-3.5 h-3.5 text-muted shrink-0" />
          <span>{event.location || event.city}</span>
        </p>
      </div>
    </div>
  );
}
