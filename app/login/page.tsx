"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Shield,
  Layers,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  LogIn,
  UserPlus,
} from "lucide-react";
import {
  SPOTT_ACCOUNTS,
  RoleType,
  setCurrentUser,
  wipeAllData,
  SpottAccount,
} from "@/lib/auth-store";

// ─── Simple in-memory "registered users" store (persisted in localStorage) ───
const SIGNUP_STORE_KEY = "spott_signed_up_users";

function getSignedUpUsers(): SpottAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SIGNUP_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSignedUpUser(acc: SpottAccount) {
  if (typeof window === "undefined") return;
  const existing = getSignedUpUsers();
  existing.push(acc);
  localStorage.setItem(SIGNUP_STORE_KEY, JSON.stringify(existing));
}

function findAccount(email: string, password: string): SpottAccount | null {
  const emailLower = email.trim().toLowerCase();
  const pwd = password.trim();

  // Check built-in accounts first
  const builtIn = Object.values(SPOTT_ACCOUNTS).find(
    (a) => a.email.toLowerCase() === emailLower && a.password === pwd
  );
  if (builtIn) return builtIn;

  // Check user-registered accounts
  const registered = getSignedUpUsers().find(
    (a) => a.email.toLowerCase() === emailLower && a.password === pwd
  );
  return registered || null;
}

function emailExists(email: string): boolean {
  const emailLower = email.trim().toLowerCase();
  const builtIn = Object.values(SPOTT_ACCOUNTS).some(
    (a) => a.email.toLowerCase() === emailLower
  );
  if (builtIn) return true;
  return getSignedUpUsers().some((a) => a.email.toLowerCase() === emailLower);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [selectedRole, setSelectedRole] = useState<RoleType>("user");

  // Sign-in fields
  const [email, setEmail] = useState(SPOTT_ACCOUNTS.user.email);
  const [password, setPassword] = useState(SPOTT_ACCOUNTS.user.password);

  // Sign-up fields
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  const clearErrors = () => { setAuthError(null); setNotice(null); };

  const handleRoleSelect = (role: RoleType) => {
    setSelectedRole(role);
    if (mode === "signin") {
      setEmail(SPOTT_ACCOUNTS[role].email);
      setPassword(SPOTT_ACCOUNTS[role].password);
    }
    clearErrors();
  };

  const switchMode = (m: "signin" | "signup") => {
    setMode(m);
    clearErrors();
    if (m === "signin") {
      setEmail(SPOTT_ACCOUNTS[selectedRole].email);
      setPassword(SPOTT_ACCOUNTS[selectedRole].password);
    } else {
      setSignupName(""); setSignupEmail(""); setSignupPassword(""); setSignupConfirm("");
    }
  };

  const executeLogin = (account: SpottAccount) => {
    setCurrentUser(account);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.push(account.destination);
    }, 300);
  };


  // ── Sign In ──
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    const account = findAccount(email, password);
    if (account) {
      // Enforce role match: credentials must belong to the selected role tab
      if (account.role !== selectedRole) {
        setLoading(false);
        setAuthError(
          `This account is registered as "${account.role.charAt(0).toUpperCase() + account.role.slice(1)}", not "${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}". Please select the correct role tab above.`
        );
        return;
      }
      executeLogin(account);
    } else {
      setLoading(false);
      setAuthError("Invalid email or password. Please check your credentials and try again.");
    }
  };

  // ── Sign Up ──
  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    if (!signupName.trim()) {
      setAuthError("Full name is required.");
      return;
    }
    if (signupPassword.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setAuthError("Passwords do not match.");
      return;
    }
    if (emailExists(signupEmail)) {
      setAuthError("An account with this email already exists. Please sign in instead.");
      return;
    }

    const destination = selectedRole === "user" ? "/" : selectedRole === "organizer" ? "/organizer" : "/admin";
    const newAccount: SpottAccount = {
      email: signupEmail.trim().toLowerCase(),
      password: signupPassword,
      name: signupName.trim(),
      role: selectedRole,
      destination,
      ...(selectedRole === "organizer" ? { organization: signupName.trim() } : {}),
    };

    setLoading(true);
    setTimeout(() => {
      saveSignedUpUser(newAccount);
      setLoading(false);
      setNotice(`✓ Account created for ${newAccount.name}! Signing you in…`);
      setTimeout(() => executeLogin(newAccount), 800);
    }, 500);
  };

  const handleWipeData = () => {
    wipeAllData();
    if (typeof window !== "undefined") {
      localStorage.removeItem(SIGNUP_STORE_KEY);
    }
    setNotice("✓ All data, accounts, and local cache have been wiped clean.");
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
          <h1 className="text-2xl font-black text-[#171717] tracking-tight">Portal Access</h1>
          <p className="text-xs sm:text-sm text-[#666666] font-medium mt-1">
            Sign in to your account or create a new one to get started.
          </p>
        </div>

        {/* Sign In / Sign Up Toggle */}
        <div className="bg-white border border-[#e6e1d8] rounded-2xl p-1.5 mb-5 shadow-sm grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === "signin"
                ? "bg-[#171717] text-white shadow-sm"
                : "text-[#666666] hover:bg-[#faf8f3]"
            }`}
          >
            <LogIn className={`w-3.5 h-3.5 ${mode === "signin" ? "text-[#ff6b35]" : ""}`} />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === "signup"
                ? "bg-[#171717] text-white shadow-sm"
                : "text-[#666666] hover:bg-[#faf8f3]"
            }`}
          >
            <UserPlus className={`w-3.5 h-3.5 ${mode === "signup" ? "text-[#ff6b35]" : ""}`} />
            Sign Up
          </button>
        </div>

        {/* Role Selector Tabs */}
        <div className="bg-white border border-[#e6e1d8] rounded-2xl p-1.5 mb-5 shadow-sm grid grid-cols-3 gap-1.5">
          {(["user", "organizer", "admin"] as RoleType[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => handleRoleSelect(role)}
              className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                selectedRole === role
                  ? "bg-[#171717] text-white shadow-sm ring-2 ring-[#ff6b35]"
                  : "text-[#666666] hover:bg-[#faf8f3]"
              }`}
            >
              {role === "user" ? (
                <User className={`w-3.5 h-3.5 ${selectedRole === role ? "text-[#ff6b35]" : ""}`} />
              ) : role === "organizer" ? (
                <Layers className={`w-3.5 h-3.5 ${selectedRole === role ? "text-[#ff6b35]" : ""}`} />
              ) : (
                <Shield className={`w-3.5 h-3.5 ${selectedRole === role ? "text-[#ff6b35]" : ""}`} />
              )}
              <span className="capitalize">{role}</span>
            </button>
          ))}
        </div>

        {/* Notices */}
        {notice && (
          <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
        {authError && (
          <div className="mb-5 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-800 flex items-center gap-2 shadow-xs">
            <span className="w-4 h-4 shrink-0 text-rose-600 text-base leading-none font-black">✕</span>
            <span>{authError}</span>
          </div>
        )}



        {/* ── Main Auth Card ── */}
        <div className="bg-white border border-[#e6e1d8] rounded-3xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-lg font-black text-[#171717] mb-1">
            {mode === "signin"
              ? `Sign In — ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}`
              : `Create ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} Account`}
          </h2>
          <p className="text-xs text-[#666666] mb-5">
            {mode === "signin"
              ? `Routes to ${selectedRole === "user" ? "Home" : selectedRole === "organizer" ? "Spott Organizer" : "Admin Dashboard"} upon successful sign in.`
              : `Registering as a ${selectedRole}. Fill in your details to create your Spott account.`}
          </p>

          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setAuthError(null); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                    authError ? "border-rose-400 focus:border-rose-500 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                  required
                  autoComplete="email"
                  placeholder="you@spott.ph"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                    authError ? "border-rose-400 focus:border-rose-500 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#171717] hover:bg-[#ff6b35] text-white font-black py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-sm shadow-md mt-2 flex items-center justify-center gap-2"
              >
                <span>{loading ? "Signing In…" : `Enter ${selectedRole === "user" ? "Home" : selectedRole === "organizer" ? "Spott Organizer" : "Admin Portal"}`}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-center text-xs text-[#888888] mt-1">
                Don&apos;t have an account?{" "}
                <button type="button" onClick={() => switchMode("signup")} className="font-black text-[#ff6b35] hover:underline cursor-pointer bg-transparent border-0 p-0">
                  Sign Up
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => { setSignupName(e.target.value); setAuthError(null); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                    authError && !signupName.trim() ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                  required
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => { setSignupEmail(e.target.value); setAuthError(null); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                    authError ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                  required
                  placeholder="your@email.com"
                  autoComplete="email"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={signupPassword}
                    onChange={(e) => { setSignupPassword(e.target.value); setAuthError(null); }}
                    className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                      authError ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                    }`}
                    required
                    placeholder="Min. 6 chars"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                    Confirm
                  </label>
                  <input
                    type="password"
                    value={signupConfirm}
                    onChange={(e) => { setSignupConfirm(e.target.value); setAuthError(null); }}
                    className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                      authError && signupPassword !== signupConfirm ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                    }`}
                    required
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#ff6b35] hover:bg-[#e0531f] text-white font-black py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-sm shadow-md mt-2 flex items-center justify-center gap-2"
              >
                <span>{loading ? "Creating Account…" : "Create Account & Sign In"}</span>
                <UserPlus className="w-4 h-4" />
              </button>
              <p className="text-center text-xs text-[#888888] mt-1">
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("signin")} className="font-black text-[#ff6b35] hover:underline cursor-pointer bg-transparent border-0 p-0">
                  Sign In
                </button>
              </p>
            </form>
          )}


        </div>

        {/* Wipe Data */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleWipeData}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-rose-600 transition-colors cursor-pointer bg-transparent border-0 p-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Wipe All Data &amp; Reset Clean State</span>
          </button>
        </div>
      </div>
    </div>
  );
}
