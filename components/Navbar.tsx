"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/my-events", label: "My Events" },
  { href: "/notifications", label: "Notifications" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
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

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setUser(null);
    window.location.href = "/";
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="h-[72px] px-[6vw] flex items-center justify-between border-b border-line bg-white sticky top-0 z-50">
      {/* Brand Logo: Spott with Orange Dot */}
      <Link href="/" className="flex items-center gap-2 no-underline">
        <span className="w-2.5 h-2.5 rounded-full bg-accent inline-block shrink-0" />
        <span className="font-black text-[25px] tracking-[-1px] text-ink">Spott</span>
      </Link>

      {/* Desktop Nav - Wireframe UX layout */}
      <nav className="hidden md:flex items-center gap-1">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-1.5 text-sm font-bold rounded transition-colors no-underline ${
                isActive
                  ? "bg-dark text-white"
                  : "text-ink hover:text-accent"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Right controls: User profile avatar (from wireframe, NO Demo Account button) */}
      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-ink hidden sm:block">
              {displayName}
            </span>
            <button
              onClick={handleSignOut}
              className="w-9 h-9 rounded-full bg-[#eee9e1] border border-line flex items-center justify-center text-sm font-bold text-ink hover:bg-accent hover:text-white transition-colors cursor-pointer"
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
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`px-4 py-2.5 text-sm font-bold rounded transition-colors no-underline ${
                    isActive
                      ? "bg-dark text-white"
                      : "text-ink hover:text-accent"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {!user && (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="px-4 py-2.5 text-sm font-bold text-accent rounded transition-colors no-underline border-t border-line mt-1 pt-3"
              >
                Log In
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
