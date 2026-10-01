"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Building2,
  Calendar,
  MapPin,
  Search,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  getAllOrganizersList,
  subscribeToOrganizerProfile,
  OrganizerProfile,
} from "@/lib/organizer-store";
import { subscribeToEvents, loadPublicEvents } from "@/lib/events-store";
import { useHydrated } from "@/lib/use-hydrated";
import type { EventData } from "@/components/EventCard";

export default function OrganizersDirectoryPage() {
  const mounted = useHydrated();
  const [organizers, setOrganizers] = useState<
    Array<OrganizerProfile & { eventCount: number; isVerified: boolean }>
  >(() => getAllOrganizersList());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "verified">("all");

  useEffect(() => {
    let active = true;
    loadPublicEvents()
      .then((apiData: EventData[]) => {
        if (!active || !Array.isArray(apiData) || apiData.length === 0) return;
        setOrganizers(getAllOrganizersList(apiData));
      })
      .catch(() => {});
    const unsubProfile = subscribeToOrganizerProfile(() => setOrganizers(getAllOrganizersList()));
    const unsubEvents = subscribeToEvents(() => setOrganizers(getAllOrganizersList()));
    return () => {
      active = false;
      unsubProfile();
      unsubEvents();
    };
  }, []);

  const filtered = useMemo(() => {
    return organizers.filter((org) => {
      if (filterType === "verified" && !org.isVerified) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = org.name.toLowerCase().includes(q);
        const matchesCaption = (org.caption || "").toLowerCase().includes(q);
        const matchesAddress = (org.address || "").toLowerCase().includes(q);
        const matchesCat = (org.category || "").toLowerCase().includes(q);
        if (!matchesName && !matchesCaption && !matchesAddress && !matchesCat) {
          return false;
        }
      }
      return true;
    });
  }, [organizers, filterType, searchQuery]);

  const verifiedCount = useMemo(() => {
    return organizers.filter((o) => o.isVerified).length;
  }, [organizers]);

  if (!mounted) return <div className="min-h-[60vh]" aria-busy="true" />;

  return (
    <div className="min-h-screen bg-paper pb-20">
      {/* Top Header / Breadcrumb Bar */}
      <div className="border-b border-line bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 font-bold text-ink hover:text-accent transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-ink" />
              <span>Back to Home</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-line" />
            <span className="font-semibold text-ink">Organizers</span>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-ink text-white text-xs font-bold hover:bg-black transition-all shadow-2xs"
          >
            Browse Events
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 space-y-8">
        {/* Header Hero */}
        <div className="bg-white border border-line rounded-3xl p-6 md:p-8 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          <div className="relative z-10 max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-bold border border-accent/20">
              <Building2 className="w-3.5 h-3.5" />
              <span>Campus & Community Partners</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-ink tracking-tight m-0">
              Organizers
            </h1>
            <p className="text-sm md:text-base text-muted leading-relaxed m-0">
              Connect with accredited student organizations, creative collectives, and campus groups hosting verified experiences on Spott.
            </p>
          </div>
        </div>

        {/* Minimalist Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-line rounded-2xl p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === "all"
                  ? "bg-ink text-white shadow-2xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              All Organizers ({organizers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("verified")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === "verified"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified Only ({verifiedCount})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search organizer or campus..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-line bg-paper text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent shadow-2xs"
            />
          </div>
        </div>

        {/* Organizers Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((org) => {
              const initials = org.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase() || "OR";

              return (
                <Link
                  key={org.name}
                  href={`/organizers/${encodeURIComponent(org.name)}`}
                  className="group bg-white border border-line rounded-2xl p-6 hover:border-accent/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Top Row: Avatar + Verified Pill */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="relative shrink-0">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#171717] via-[#262626] to-[#3a3a3a] text-white flex items-center justify-center font-extrabold text-lg tracking-wider overflow-hidden shadow-xs">
                          {org.avatarUrl ? (
                            <img
                              src={org.avatarUrl}
                              alt={org.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </div>
                        {org.isVerified && (
                          <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-md z-10 flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4 text-[#14804a]" />
                          </div>
                        )}
                      </div>

                      {org.isVerified ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#14804a] border border-emerald-200 text-[11px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-[#14804a]" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-muted border border-gray-200 text-[10px] font-medium">
                          Community
                        </span>
                      )}
                    </div>

                    {/* Name & Caption */}
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-bold text-ink group-hover:text-accent transition-colors flex items-center justify-between m-0">
                        <span className="line-clamp-1">{org.name}</span>
                        <ArrowUpRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 group-hover:text-accent transition-all shrink-0 ml-1" />
                      </h3>

                      <p className="text-xs text-muted line-clamp-2 leading-relaxed m-0">
                        {org.caption || "Community event organizer hosting local gatherings and workshops on Spott."}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Metadata */}
                  <div className="pt-4 mt-4 border-t border-line/70 flex items-center justify-between text-xs text-muted">
                    <span className="flex items-center gap-1 truncate max-w-[170px]">
                      <MapPin className="w-3 h-3 text-accent shrink-0" />
                      <span className="truncate">{org.address || "Metro Manila"}</span>
                    </span>

                    <span className="font-semibold text-ink bg-[#faf8f3] border border-line px-2 py-0.5 rounded-md shrink-0">
                      {org.eventCount} event{org.eventCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-line rounded-3xl p-12 text-center max-w-md mx-auto shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-paper border border-line flex items-center justify-center mx-auto text-muted">
              <Building2 className="w-6 h-6 text-muted" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-ink m-0">No Organizers Found</h3>
              <p className="text-xs text-muted m-0">
                {searchQuery
                  ? `No organizer matched "${searchQuery}".`
                  : "No organizers matching this filter."}
              </p>
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="px-4 py-1.5 rounded-xl border border-line text-xs font-bold text-ink hover:bg-paper cursor-pointer transition-colors"
              >
                Clear Search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
