"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense, useEffect } from "react";
import {
  LayoutGrid,
  CalendarDays,
  Archive,
  PlusCircle,
  Users,
  BarChart3,
  ShieldCheck,
  Menu,
  X,
  ChevronDown,
  LogOut,
  ExternalLink,
  Shield,
  User,
} from "lucide-react";
import { logout, getCurrentUser, SpottAccount } from "@/lib/auth-store";
import { useVerificationState } from "@/lib/verification-store";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeStyle?: string;
  darkPill?: boolean;
}

const navItems: NavItem[] = [
  {
    id: "overview",
    href: "/organizer",
    label: "Overview",
    icon: LayoutGrid,
  },
  {
    id: "events",
    href: "/organizer?tab=events",
    label: "My Events",
    icon: CalendarDays,
  },
  {
    id: "archive",
    href: "/organizer?tab=archive",
    label: "Archive",
    icon: Archive,
  },
  {
    id: "create",
    href: "/organizer/create",
    label: "Create Event",
    icon: PlusCircle,
    badge: "New",
  },
  {
    id: "rsvp",
    href: "/organizer/rsvp",
    label: "RSVP",
    icon: Users,
  },
  {
    id: "analytics",
    href: "/organizer?tab=analytics",
    label: "Analytics",
    icon: BarChart3,
  },
  {
    id: "verification",
    href: "/organizer?tab=verification",
    label: "Verification",
    icon: ShieldCheck,
  },
  {
    id: "profile",
    href: "/organizer?tab=profile",
    label: "Profile",
    icon: User,
  },
];

function OrganizerNavContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [currentUser, setCurrentUser2] = useState<SpottAccount | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const verState = useVerificationState();

  useEffect(() => {
    let active = true;
    let redirecting = false;
    const syncAuth = async () => {
      if (redirecting) return;
      const cachedUser = getCurrentUser();


      setAuthorized(false);
      try {
        const response = await fetchWithSupabaseSession("/api/account", { cache: "no-store" });
        const result = await response.json();
        if (!active) return;
        if (!response.ok || result.account?.role !== "organizer" || result.account?.organizerStatus !== "approved") {
          redirecting = true;
          setCurrentUser2(null);
          await logout();
          if (active) router.replace("/login?redirect=%2Forganizer");
          return;
        }

        setCurrentUser2({
          email: result.account.email,
          name: result.account.name,
          role: "organizer",
          organization: result.account.organization || result.account.name,
          destination: "/organizer",
        });
        setAuthorized(true);
      } catch {
        if (!active) return;
        redirecting = true;
        setCurrentUser2(null);
        await logout();
        if (active) router.replace("/login?redirect=%2Forganizer");
      }
    };
    void syncAuth();
    const onAuthChange = () => syncAuth();
    window.addEventListener("spott_auth_changed", onAuthChange);

    return () => {
      active = false;
      window.removeEventListener("spott_auth_changed", onAuthChange);
    };
  }, [router]);

  const displayName = currentUser?.name || "Organizer";
  const displayOrg = currentUser?.organization || "Spott Organizer";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const isItemActive = (item: NavItem) => {
    if (item.id === "create") {
      return pathname === "/organizer/create";
    }
    if (item.id === "rsvp") {
      return pathname === "/organizer/rsvp" || (pathname === "/organizer" && currentTab === "rsvp");
    }
    if (pathname === "/organizer") {
      if (item.id === "overview") return !searchParams.get("tab") || currentTab === "overview";
      return currentTab === item.id;
    }
    return false;
  };

  if (!authorized) {
    return <div className="p-8 text-center text-sm font-bold text-gray-500">Checking organizer access…</div>;
  }

  return (
    <div className="min-h-screen bg-[#faf8f3] flex flex-col">
      {/* Top Header matching Wireframe (Spott WIREFRAME / John Doe) */}
      <header className="h-[68px] px-4 sm:px-8 bg-white border-b border-[#e6e1d8] flex items-center justify-between sticky top-0 z-50">
        {/* Brand Logo & Portal Tag */}
        <div className="flex items-center gap-3">
          <Link href="/organizer" className="flex items-center gap-2 no-underline">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff6b35] inline-block shrink-0" />
            <span className="font-black text-2xl tracking-[-1px] text-[#171717]">Spott</span>
          </Link>
          <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-gray-100 text-[#555555] border border-gray-200">
            Spott Organizer
          </span>
        </div>

        {/* Right side: John Doe profile & Portal Switcher */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <span className="text-sm font-bold text-[#171717] hidden sm:block">{displayName}</span>
              <div className="w-9 h-9 rounded-full bg-[#e8e4dc] border border-[#d5cec3] flex items-center justify-center text-sm font-black text-[#171717]">
                {initials}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#666666] hidden sm:block" />
            </button>

            {/* User Dropdown Menu */}
            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white border border-[#e6e1d8] rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-4 py-2 border-b border-[#e6e1d8]">
                  <p className="text-xs font-bold text-[#171717]">{displayName}</p>
                  <p className="text-[11px] text-[#ff6b35] font-semibold">{displayOrg}</p>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      logout();
                      router.push("/login");
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer text-left transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile menu hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-[#171717]"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Container with Sidebar and Content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Left Sidebar matching user screenshot */}
        <aside
          className={`
            fixed md:sticky top-[68px] inset-y-0 left-0 z-40
            w-64 bg-white md:bg-transparent flex flex-col
            transform transition-transform duration-300 ease-in-out md:translate-x-0
            h-[calc(100vh-68px)] shrink-0 p-5 md:pl-8 md:pr-4 overflow-y-auto
            ${mobileMenuOpen ? "translate-x-0 bg-white shadow-2xl" : "-translate-x-full md:translate-x-0"}
          `}
        >
          <div className="mb-4">
            <h2 className="text-sm font-black text-[#171717] tracking-tight">Spott Organizer</h2>
          </div>

          {/* Navigation Items: Keep verification accessible for every organizer. */}
          <nav className="space-y-1.5 flex-1">
            {navItems.map((item) => {
                const active = isItemActive(item);
                const Icon = item.icon;

              let badgeText = item.badge;
              let badgeStyle = active
                ? "bg-[#ff6b35] text-white"
                : item.badge === "Pending"
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-[#555555] group-hover:bg-gray-200";

              if (item.id === "verification") {
                if (verState?.status === "approved") {
                  badgeText = "Verified";
                  badgeStyle = active
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-100 text-emerald-800";
                } else if (verState?.status === "rejected") {
                  badgeText = "Declined";
                  badgeStyle = active
                    ? "bg-rose-600 text-white"
                    : "bg-rose-100 text-rose-800";
                } else if (verState?.documents && verState.documents.length > 0) {
                  badgeText = "Pending";
                  badgeStyle = active
                    ? "bg-amber-500 text-white"
                    : "bg-amber-100 text-amber-800";
                } else {
                  badgeText = undefined;
                }
              }

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-sm transition-all no-underline cursor-pointer select-none group
                    ${
                      active
                        ? "bg-[#171717] text-white shadow-md ring-2 ring-[#ff6b35]"
                        : "bg-transparent text-[#444444] hover:bg-gray-100 hover:text-[#171717]"
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        active ? "text-[#ff6b35]" : "text-[#777777] group-hover:text-[#ff6b35]"
                      }`}
                    />
                    <span className={active ? "text-white" : "text-[#333333] group-hover:text-[#171717]"}>
                      {item.label}
                    </span>
                  </div>

                  {badgeText && (
                    <span
                      className={`text-[10px] font-black px-2.5 py-0.5 rounded-full transition-colors ${badgeStyle}`}
                    >
                      {badgeText}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Backdrop for mobile drawer */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Content Pane */}
        <main className="flex-1 w-full p-4 sm:p-6 lg:p-10 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm font-bold text-gray-500">Loading Organizer Portal...</div>}>
      <OrganizerNavContent>{children}</OrganizerNavContent>
    </Suspense>
  );
}
