"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Menu, X, ChevronDown, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { getCurrentUser, logout, SpottAccount } from "@/lib/auth-store";
import { getUnreadCount } from "@/lib/notifications-store";
import type { User } from "@supabase/supabase-js";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/my-events", label: "My Events" },
  { href: "/notifications", label: "Notifications" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [localUser, setLocalUser] = useState<SpottAccount | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const syncState = () => {
    const cur = getCurrentUser();
    setLocalUser(cur);
    setUnreadNotifs(getUnreadCount(cur?.role || "user", cur?.email));
  };

  useEffect(() => {
    setMounted(true);
    syncState();

    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch {
        // offline fallback
      }
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    window.addEventListener("spott_auth_changed", syncState);
    window.addEventListener("spott_notifications_updated", syncState);
    window.addEventListener("storage", syncState);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("spott_auth_changed", syncState);
      window.removeEventListener("spott_notifications_updated", syncState);
      window.removeEventListener("storage", syncState);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ALL HOOKS ARE CALLED ABOVE. Only now can we conditionally return null!
  if (pathname.startsWith("/organizer") || pathname.startsWith("/admin")) {
    return null;
  }

  const handleSignOut = async () => {
    setDropdownOpen(false);
    try {
      await supabase.auth.signOut();
    } catch {}
    logout();
    setUser(null);
    setLocalUser(null);
    router.push("/login");
  };

  const displayName =
    (mounted && localUser?.name) ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "User";
  const initial = displayName.charAt(0).toUpperCase();

  const isUserLoggedIn = mounted && Boolean(user || localUser);

  return (
    <header className="h-[72px] px-[6vw] flex items-center justify-between border-b border-line bg-white sticky top-0 z-50">
      {/* Brand Logo: Spott with Orange Dot */}
      <Link href="/" className="flex items-center gap-2 no-underline">
        <span className="w-2.5 h-2.5 rounded-full bg-accent inline-block shrink-0" />
        <span className="font-black text-[25px] tracking-[-1px] text-ink">Spott</span>
      </Link>

      {/* Desktop Nav */}
      <nav className="hidden md:flex items-center gap-1">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          const isNotif = link.href === "/notifications";

          // Hide Notifications when not logged in
          if (isNotif && !isUserLoggedIn) return null;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-1.5 text-sm font-bold rounded transition-colors no-underline flex items-center gap-1.5 relative ${
                isActive
                  ? "bg-dark text-white"
                  : "text-ink hover:text-accent"
              }`}
            >
              <span>{link.label}</span>
              {isNotif && mounted && unreadNotifs > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-xs flex items-center justify-center min-w-[18px] h-[18px] animate-pulse">
                  {unreadNotifs}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {isUserLoggedIn ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <span className="text-sm font-bold text-ink hidden sm:block">{displayName}</span>
              <div className="w-9 h-9 rounded-full bg-[#eee9e1] border border-line flex items-center justify-center text-sm font-bold text-ink">
                {initial}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#666666] hidden sm:block" />
            </button>

            {/* Dropdown */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white border border-[#e6e1d8] rounded-2xl shadow-xl py-2 z-50">
                <div className="px-4 py-2 border-b border-[#e6e1d8]">
                  <p className="text-xs font-bold text-[#171717]">{displayName}</p>
                  <p className="text-[11px] text-[#ff6b35] font-semibold capitalize">
                    {(mounted && localUser?.role) || "User"}
                  </p>
                </div>
                <div className="pt-1">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer text-left transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : pathname !== "/login" ? (
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-bold text-ink hover:text-accent border border-line hover:border-accent rounded-full transition-colors no-underline"
          >
            Log In
          </Link>
        ) : null}

        {/* Mobile Hamburger */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="absolute top-[72px] left-0 right-0 bg-white border-b border-line shadow-lg md:hidden z-50 p-4">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              const isNotif = link.href === "/notifications";

              // Hide Notifications when not logged in
              if (isNotif && !isUserLoggedIn) return null;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`px-4 py-2.5 text-sm font-bold rounded transition-colors no-underline flex items-center justify-between ${
                    isActive
                      ? "bg-dark text-white"
                      : "text-ink hover:text-accent"
                  }`}
                >
                  <span>{link.label}</span>
                  {isNotif && mounted && unreadNotifs > 0 && (
                    <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold shadow-xs">
                      {unreadNotifs}
                    </span>
                  )}
                </Link>
              );
            })}
            <div className="pt-2 border-t border-line mt-2">
              {isUserLoggedIn ? (
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    handleSignOut();
                  }}
                  className="w-full text-left px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded"
                >
                  Log Out ({displayName})
                </button>
              ) : pathname !== "/login" ? (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-2 text-sm font-bold text-accent"
                >
                  Log In
                </Link>
              ) : null}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
