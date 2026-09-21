"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
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
  const supabase = createClient();

  const syncState = () => {
    setLocalUser(getCurrentUser());
    setUnreadNotifs(getUnreadCount("user"));
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

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("spott_auth_changed", syncState);
      window.removeEventListener("spott_notifications_updated", syncState);
    };
  }, []);

  // ALL HOOKS ARE CALLED ABOVE. Only now can we conditionally return null!
  if (pathname.startsWith("/organizer") || pathname.startsWith("/admin")) {
    return null;
  }

  const handleSignOut = async () => {
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
                <span
                  className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? "bg-accent text-white"
                      : "bg-accent text-white"
                  }`}
                >
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
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-ink hidden sm:block">
              {displayName}
            </span>
            <button
              onClick={handleSignOut}
              className="w-9 h-9 rounded-full bg-[#eee9e1] border border-line flex items-center justify-center text-sm font-bold text-ink hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
              title="Click to sign out"
            >
              {initial}
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-bold text-ink hover:text-accent border border-line hover:border-accent rounded-full transition-colors no-underline"
          >
            Log In
          </Link>
        )}

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
                    <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full font-bold">
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
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-2 text-sm font-bold text-accent"
                >
                  Log In
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
