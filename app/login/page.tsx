"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import {
  SPOTT_ACCOUNTS,
  RoleType,
  setCurrentUser,
  wipeAllData,
} from "@/lib/auth-store";

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<RoleType>("user");
  const [email, setEmail] = useState(SPOTT_ACCOUNTS.user.email);
  const [password, setPassword] = useState(SPOTT_ACCOUNTS.user.password);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleRoleSelect = (role: RoleType) => {
    setSelectedRole(role);
    setEmail(SPOTT_ACCOUNTS[role].email);
    setPassword(SPOTT_ACCOUNTS[role].password);
    setNotice(null);
  };

  const executeLogin = (role: RoleType) => {
    const account = SPOTT_ACCOUNTS[role];
    setCurrentUser(account);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.push(account.destination);
    }, 300);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      // Offline/local instant auth for provided accounts
      let matchedRole: RoleType = selectedRole;
      if (email.toLowerCase().includes("admin")) matchedRole = "admin";
      else if (email.toLowerCase().includes("organizer")) matchedRole = "organizer";
      else matchedRole = "user";

      executeLogin(matchedRole);
    } catch {
      executeLogin(selectedRole);
    } finally {
      setLoading(false);
    }
  };

  const handleWipeData = () => {
    wipeAllData();
    setNotice("✓ All mock data, local cache, and test history have been wiped clean.");
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center px-4 py-12 bg-[#faf8f3]">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-3 no-underline">
            <span className="w-3 h-3 rounded-full bg-[#ff6b35] inline-block shrink-0" />
            <span className="font-black text-3xl tracking-[-1px] text-[#171717]">Spott</span>
          </Link>
          <h1 className="text-2xl font-black text-[#171717] tracking-tight">Portal Sign In</h1>
          <p className="text-xs sm:text-sm text-[#666666] font-medium mt-1">
            Sign in with your designated account to enter your portal.
          </p>
        </div>

        {/* Global Action / Wipe Notice */}
        {notice && (
          <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Role Selector Tabs */}
        <div className="bg-white border border-[#e6e1d8] rounded-2xl p-1.5 mb-6 shadow-sm grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => handleRoleSelect("user")}
            className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
              selectedRole === "user"
                ? "bg-[#171717] text-white shadow-sm ring-2 ring-[#ff6b35]"
                : "text-[#666666] hover:bg-[#faf8f3]"
            }`}
          >
            <User className={`w-3.5 h-3.5 ${selectedRole === "user" ? "text-[#ff6b35]" : ""}`} />
            <span>User</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleSelect("organizer")}
            className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
              selectedRole === "organizer"
                ? "bg-[#171717] text-white shadow-sm ring-2 ring-[#ff6b35]"
                : "text-[#666666] hover:bg-[#faf8f3]"
            }`}
          >
            <Layers className={`w-3.5 h-3.5 ${selectedRole === "organizer" ? "text-[#ff6b35]" : ""}`} />
            <span>Organizer</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleSelect("admin")}
            className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
              selectedRole === "admin"
                ? "bg-[#171717] text-white shadow-sm ring-2 ring-[#ff6b35]"
                : "text-[#666666] hover:bg-[#faf8f3]"
            }`}
          >
            <Shield className={`w-3.5 h-3.5 ${selectedRole === "admin" ? "text-[#ff6b35]" : ""}`} />
            <span>Admin</span>
          </button>
        </div>

        {/* Selected Account Information Pill */}
        <div className="mb-6 p-4 rounded-2xl bg-[#fff0e8] border border-[#ff6b35]/20 flex items-center justify-between text-xs font-bold text-[#ff6b35]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <div>
              <p className="m-0 font-black text-ink">
                {selectedRole === "organizer"
                  ? "Spott Organizer (Metro Creative Group)"
                  : selectedRole === "admin"
                  ? "SuperAdmin Portal"
                  : "User Account (Student / Attendee)"}
              </p>
              <p className="m-0 text-[11px] text-[#ff6b35]">
                {SPOTT_ACCOUNTS[selectedRole].email} · {SPOTT_ACCOUNTS[selectedRole].password}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => executeLogin(selectedRole)}
            className="shrink-0 px-3.5 py-1.5 rounded-xl bg-[#ff6b35] text-white hover:bg-[#e0531f] transition-all cursor-pointer text-xs font-black shadow-xs"
          >
            Quick Enter →
          </button>
        </div>

        {/* Main Authentication Card */}
        <div className="bg-white border border-[#e6e1d8] rounded-3xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-lg font-black text-[#171717] mb-1">
            Sign In with {selectedRole.toUpperCase()} Account
          </h2>
          <p className="text-xs text-[#666666] mb-5">
            Routes directly to {selectedRole === "user" ? "Home (/)" : selectedRole === "organizer" ? "Spott Organizer (/organizer)" : "Admin Dashboard (/admin)"}.
          </p>

          {/* Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-[#e6e1d8] rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none focus:border-[#ff6b35]"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-[#e6e1d8] rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none focus:border-[#ff6b35]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#171717] hover:bg-[#ff6b35] text-white font-black py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-sm shadow-md mt-2 flex items-center justify-center gap-2"
            >
              <span>
                {loading ? "Signing In..." : `Enter ${selectedRole === "user" ? "Home" : selectedRole === "organizer" ? "Spott Organizer" : "Admin Portal"}`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Access Bar */}
          <div className="mt-6 pt-5 border-t border-[#e6e1d8]">
            <p className="text-[11px] font-bold text-[#888888] uppercase tracking-wider text-center mb-3">
              One-Click Direct Portal Access
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => executeLogin("user")}
                className="py-2.5 px-2 bg-[#faf8f3] hover:bg-[#ff6b35] hover:text-white border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#444444] transition-colors cursor-pointer text-center"
              >
                User (Home)
              </button>
              <button
                type="button"
                onClick={() => executeLogin("organizer")}
                className="py-2.5 px-2 bg-[#faf8f3] hover:bg-[#ff6b35] hover:text-white border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#444444] transition-colors cursor-pointer text-center"
              >
                Organizer
              </button>
              <button
                type="button"
                onClick={() => executeLogin("admin")}
                className="py-2.5 px-2 bg-[#faf8f3] hover:bg-[#ff6b35] hover:text-white border border-[#e6e1d8] rounded-xl text-xs font-bold text-[#444444] transition-colors cursor-pointer text-center"
              >
                Admin
              </button>
            </div>
          </div>
        </div>

        {/* Wipe Data and Placeholders */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleWipeData}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-rose-600 transition-colors cursor-pointer bg-transparent border-0 p-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Wipe All Data & Reset Clean State</span>
          </button>
        </div>
      </div>
    </div>
  );
}
