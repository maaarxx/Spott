"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  SPOTT_ACCOUNTS,
  RoleType,
  setCurrentUser,
  SpottAccount,
} from "@/lib/auth-store";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";

function findAccount(email: string, password: string): SpottAccount | null {
  const emailLower = email.trim().toLowerCase();
  const pwd = password.trim();

  // Check built-in accounts first
  const builtIn = Object.values(SPOTT_ACCOUNTS).find(
    (a) => a.email.toLowerCase() === emailLower && a.password === pwd
  );
  if (builtIn) return builtIn;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupRole, setSignupRole] = useState<RoleType>("user");

  // Sign-in fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign-up fields
  const [signupName, setSignupName] = useState("");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupMI, setSignupMI] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupTouched, setSignupTouched] = useState<Record<string, boolean>>({});
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [signupUsername, setSignupUsername] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  const clearErrors = () => { setAuthError(null); setNotice(null); setServerFieldErrors({}); };

  const fullName = [signupFirstName.trim(), signupMI.trim() ? `${signupMI.trim()}.` : "", signupLastName.trim()]
    .filter(Boolean).join(" ");
  const fieldErrors = {
    firstName: signupFirstName.length > 15 ? "First name must be 15 characters or fewer." : signupFirstName && !/^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]*$/u.test(signupFirstName) ? "Use letters, spaces, apostrophes, or hyphens only." : "",
    mi: signupMI && !/^[A-Za-z]$/.test(signupMI) ? "Middle initial must be one letter." : "",
    lastName: signupLastName.length > 15 ? "Last name must be 15 characters or fewer." : signupLastName && !/^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]*$/u.test(signupLastName) ? "Use letters, spaces, apostrophes, or hyphens only." : "",
    username: signupUsername && !/^[a-zA-Z0-9_]{4,20}$/.test(signupUsername) ? "Use 4–20 letters, numbers, or underscores." : "",
    email: signupEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim()) || signupEmail.trim().length > 150) ? "Enter a valid email address (maximum 150 characters)." : "",
    password: signupPassword.length > 20 ? "Password must be 20 characters or fewer." : /\s/.test(signupPassword) ? "Password cannot contain spaces." : signupPassword.length > 0 && signupPassword.length < 8 ? "Password must be at least 8 characters." : signupPassword && [signupFirstName, signupMI, signupLastName, signupUsername].flatMap((part) => part.trim().split(/[\s.'’_-]+/)).filter((part) => part.length >= 2).some((part) => signupPassword.toLowerCase().includes(part.toLowerCase())) ? "Password cannot contain your name or username." : "",
    confirm: signupConfirm && signupConfirm !== signupPassword ? "Passwords do not match." : "",
  };
  const touch = (key: string) => setSignupTouched((current) => ({ ...current, [key]: true }));

  const switchMode = (m: "signin" | "signup") => {
    setMode(m);
    clearErrors();
    if (m === "signin") {
      setEmail(""); setPassword("");
    } else {
      setSignupName(""); setSignupFirstName(""); setSignupMI(""); setSignupLastName(""); setSignupEmail(""); setSignupPassword(""); setSignupConfirm(""); setSignupTouched({});
    }
  };

  const executeLogin = (account: SpottAccount) => {
    const { password: _password, ...safeAccount } = account;
    setCurrentUser(safeAccount as SpottAccount);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      let redirectUrl: string | null = null;
      if (typeof window !== "undefined") {
        const search = new URLSearchParams(window.location.search);
        redirectUrl = search.get("redirect");
      }
      if (redirectUrl && account.role === "user") {
        const redirectTarget = new URL(redirectUrl, window.location.origin);
        if (redirectTarget.origin === window.location.origin) {
          router.push(`${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`);
        } else {
          router.push(account.destination);
        }
      } else {
        router.push(account.destination);
      }
    }, 300);
  };

  // ── Sign In ──
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (!error) {
          const response = await fetchWithSupabaseSession('/api/account');
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Unable to load your account.');
          if (result.account.role === 'organizer' && result.account.organizerStatus !== 'approved') {
            await supabase.auth.signOut();
            throw new Error(result.account.organizerStatus === 'rejected' ? 'Your organizer application was not approved. Please contact the administrator.' : 'Your organizer account is awaiting admin approval.');
          }
          const account: SpottAccount = {
            email: result.account.email, name: result.account.name, role: result.account.role,
            ...(result.account.organization ? { organization: result.account.organization } : {}),
            destination: result.account.role === 'admin' ? '/admin' : result.account.role === 'organizer' ? '/organizer' : '/',
          };
          await fetchWithSupabaseSession('/api/audit-events', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auth.login' }),
          }).catch(() => {});
          executeLogin(account);
          return;
        }
        // Demo accounts are intentionally limited to localhost. Production access
        // must use a Supabase Auth session so privileged APIs can verify the role.
        const demoAccount = findAccount(email, password);
        if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) && demoAccount) {
          executeLogin(demoAccount);
          return;
        }
        if (demoAccount) {
          throw new Error('These built-in demo credentials only work on localhost. On Vercel, create/sign in with this email through Supabase Auth, then have its public.users row assigned the admin role.');
        }
        throw new Error(error.message);
      } catch (error) {
        setLoading(false);
        setAuthError(error instanceof Error ? error.message : 'Unable to sign in.');
      }
    })();
  };

  // ── Sign Up ──
  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    const formattedName = signupRole === "user" ? fullName : signupName.trim();
    if (signupRole === "user" && (!signupFirstName.trim() || !signupLastName.trim())) {
      setSignupTouched({ firstName: true, mi: true, lastName: true, username: true, password: true, confirm: true });
      setAuthError("Please complete the highlighted fields."); return;
    }
    if (signupRole === "organizer" && !formattedName) { setAuthError("Please fill in your organization name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim()) || signupEmail.length > 150) { setAuthError("Please enter a valid email address (maximum 150 characters)."); setSignupTouched((current) => ({ ...current, email: true })); return; }
    if (signupRole === "user" && Object.values(fieldErrors).some(Boolean)) { setSignupTouched({ firstName: true, mi: true, lastName: true, username: true, password: true, confirm: true }); setAuthError("Please correct the highlighted fields."); return; }
    if (signupPassword.length < 8 || signupPassword.length > 20 || /\s/.test(signupPassword)) {
      setSignupTouched((current) => ({ ...current, password: true }));
      setAuthError("Password must be 8–20 characters with no spaces.");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setSignupTouched((current) => ({ ...current, confirm: true })); setAuthError("Passwords do not match.");
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        if (signupRole === "user") {
          const checked = await fetch("/api/register-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: signupEmail, username: signupUsername, password: signupPassword, firstName: signupFirstName.trim(), mi: signupMI.trim(), lastName: signupLastName.trim() }) });
          const checkedBody = await checked.json();
          if (!checked.ok) {
            const message = checkedBody.error || "Please check your details.";
            const lower = String(message).toLowerCase();
            const target = lower.includes("password") ? "password" : lower.includes("username") ? "username" : lower.includes("email") ? "email" : lower.includes("first name") ? "firstName" : lower.includes("middle initial") ? "mi" : lower.includes("last name") ? "lastName" : null;
            if (target) {
              setSignupTouched((current) => ({ ...current, [target]: true }));
              setServerFieldErrors((current) => ({ ...current, [target]: message }));
              return;
            }
            throw new Error(message);
          }
        }
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.auth.signUp({
          email: signupEmail.trim().toLowerCase(), password: signupPassword,
          options: { data: { name: formattedName, first_name: signupRole === "user" ? signupFirstName.trim() : "", middle_initial: signupRole === "user" ? signupMI.trim() : "", last_name: signupRole === "user" ? signupLastName.trim() : "", username: signupUsername.trim(), role: signupRole } },
        });
        if (error) throw error;
        if (data.session) {
          await fetchWithSupabaseSession('/api/audit-events', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auth.signup' }),
          }).catch(() => {});
        }
        const account: SpottAccount = {
          email: signupEmail.trim().toLowerCase(), password: signupPassword, name: formattedName,
          role: signupRole, destination: signupRole === 'organizer' ? '/organizer' : '/',
          ...(signupRole === 'organizer' ? { organization: signupName.trim() } : {}),
        };
        if (signupRole === 'organizer') {
          setNotice(data.session ? 'Organizer application submitted. Please verify your email; admin approval is required before access.' : 'Organizer application submitted. Check your email to confirm the account; admin approval is required before access.');
        } else if (data.session) {
          setNotice(`Account created for ${account.name}. Signing you in…`);
          executeLogin(account);
        } else {
          setNotice('Account created. Check your email to confirm your account, then sign in.');
        }
        setSignupName(''); setSignupFirstName(''); setSignupMI(''); setSignupLastName(''); setSignupUsername(''); setSignupEmail(''); setSignupPassword(''); setSignupConfirm(''); setSignupRole('user');
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Unable to create account.');
      } finally { setLoading(false); }
    })();
  };

  const passwordChecks = [
    { label: "8 or more characters", met: signupPassword.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(signupPassword) },
    { label: "Lowercase letter", met: /[a-z]/.test(signupPassword) },
    { label: "Number", met: /[0-9]/.test(signupPassword) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(signupPassword) },
  ];
  const strengthScore = passwordChecks.filter((check) => check.met).length;
  const hasCommonWeakPattern = /^(password|qwerty|letmein|welcome|admin|123456|12345678|abcdef)|(.)\2{3,}/i.test(signupPassword);
  const personalPassword = Boolean(fieldErrors.password.includes("name or username"));
  const passwordStrength = signupPassword.length === 0 ? "Neutral" : hasCommonWeakPattern || personalPassword || strengthScore <= 2 ? "Weak" : strengthScore <= 4 ? "Medium" : "Strong";

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
            {mode === "signin" ? "Sign In" : "Create Account"}
          </h2>
          <p className="text-xs text-[#666666] mb-5">
            {mode === "signin"
              ? "Enter your credentials — you'll be redirected to the right dashboard automatically."
              : "Fill in your details to create your Spott account."}
          </p>

          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Email Address <span className="text-rose-600">*</span>
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
                  Password <span className="text-rose-600">*</span>
                </label>
                <input
                  type={showSignInPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                    authError ? "border-rose-400 focus:border-rose-500 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button type="button" aria-label={showSignInPassword ? "Hide password" : "Show password"} onClick={() => setShowSignInPassword((shown) => !shown)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#666]">{showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showSignInPassword ? "Hide password" : "Show password"}</button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#171717] hover:bg-[#ff6b35] text-white font-black py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-sm shadow-md mt-2 flex items-center justify-center gap-2"
              >
                <span>{loading ? "Signing In…" : "Sign In"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form noValidate onSubmit={handleSignUp} className="space-y-4">
              {/* Role selector — only User and Organizer can sign up */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Register As
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["user", "organizer"] as RoleType[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSignupRole(role)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all capitalize cursor-pointer border ${
                        signupRole === role
                          ? "bg-[#171717] text-white border-[#ff6b35] ring-1 ring-[#ff6b35]"
                          : "text-[#666666] border-[#e6e1d8] hover:bg-[#faf8f3]"
                      }`}
                    >
                      {role === "organizer" ? "Organizer" : "User"}
                    </button>
                  ))}
                </div>
                {signupRole === "organizer" && (
                  <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-semibold">
                    ⏳ Organizer accounts require admin approval before you can log in.
                  </p>
                )}
              </div>

              {signupRole === "organizer" ? <div><label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">Organizer Name</label><input maxLength={50} value={signupName} onChange={(e) => setSignupName(e.target.value)} className="w-full border border-[#e6e1d8] rounded-xl px-4 py-2.5 text-sm" required placeholder="Your organization or group name" /></div> : <>
                <div className="space-y-2">
  <div className="grid grid-cols-[1fr_60px_1fr] gap-2">
    <div>
      <label className="block text-[11px] font-black uppercase mb-1.5">First Name <span className="text-rose-600">*</span></label>
      <input maxLength={15} value={signupFirstName} onChange={(e) => { touch("firstName"); setServerFieldErrors((current) => ({ ...current, firstName: "" })); setSignupFirstName(e.target.value); }} className={`w-full border rounded-xl px-3 py-2.5 text-sm ${((fieldErrors.firstName || serverFieldErrors.firstName) && signupTouched.firstName) ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8]"}`} required autoComplete="given-name" />
      {signupTouched.firstName && (serverFieldErrors.firstName || fieldErrors.firstName || (!signupFirstName.trim() ? "First name is required." : "")) && <p className="text-rose-600 text-[10px] mt-1">{serverFieldErrors.firstName || fieldErrors.firstName || "First name is required."}</p>}
    </div>
    <div>
      <label className="block text-[11px] font-black uppercase mb-1.5">MI</label>
      <input maxLength={1} value={signupMI} onChange={(e) => { touch("mi"); setServerFieldErrors((current) => ({ ...current, mi: "" })); setSignupMI(e.target.value.slice(0, 1)); }} className={`w-full border rounded-xl px-3 py-2.5 text-sm text-center ${(fieldErrors.mi || serverFieldErrors.mi) && signupTouched.mi ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8]"}`} autoComplete="additional-name" aria-label="Middle initial" />
      {signupTouched.mi && (serverFieldErrors.mi || fieldErrors.mi) && <p className="text-rose-600 text-[10px] mt-1">{serverFieldErrors.mi || fieldErrors.mi}</p>}
    </div>
    <div>
      <label className="block text-[11px] font-black uppercase mb-1.5">Last Name <span className="text-rose-600">*</span></label>
      <input maxLength={15} value={signupLastName} onChange={(e) => { touch("lastName"); setServerFieldErrors((current) => ({ ...current, lastName: "" })); setSignupLastName(e.target.value); }} className={`w-full border rounded-xl px-3 py-2.5 text-sm ${((fieldErrors.lastName || serverFieldErrors.lastName) && signupTouched.lastName) ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8]"}`} required autoComplete="family-name" />
      {signupTouched.lastName && (serverFieldErrors.lastName || fieldErrors.lastName || (!signupLastName.trim() ? "Last name is required." : "")) && <p className="text-rose-600 text-[10px] mt-1">{serverFieldErrors.lastName || fieldErrors.lastName || "Last name is required."}</p>}
    </div>
  </div>
  <div>
    <label className="block text-[11px] font-black uppercase mb-1">Username <span className="text-rose-600">*</span></label>
    <input maxLength={20} minLength={4} value={signupUsername} onChange={(e) => { touch("username"); setServerFieldErrors((current) => ({ ...current, username: "" })); setSignupUsername(e.target.value); }} className={`w-full border rounded-xl px-3 py-2.5 text-sm ${((fieldErrors.username || serverFieldErrors.username) && signupTouched.username) ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8]"}`} required autoComplete="username" />
    <div className="flex justify-between mt-1">
        {signupTouched.username && (serverFieldErrors.username || fieldErrors.username || (!signupUsername.trim() ? "Username is required." : "")) && <p className="text-rose-600 text-[10px]">{serverFieldErrors.username || fieldErrors.username || "Username is required."}</p>}
    </div>
  </div>
</div>
              </>}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Email Address <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  maxLength={150}
                  value={signupEmail}
                  onChange={(e) => { touch("email"); setServerFieldErrors((current) => ({ ...current, email: "" })); setSignupEmail(e.target.value); setAuthError(null); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                    (fieldErrors.email || serverFieldErrors.email) && signupTouched.email ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                  required
                  placeholder="your@email.com"
                  autoComplete="email"
                />
                {signupTouched.email && (serverFieldErrors.email || fieldErrors.email) && <p role="alert" className="mt-1 text-xs text-rose-700">{serverFieldErrors.email || fieldErrors.email}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Password <span className="text-rose-600">*</span>
                </label>
                <input
                  type={showSignupPassword ? "text" : "password"}
                  minLength={8} maxLength={20} onPaste={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()}
                  value={signupPassword}
                  onChange={(e) => { touch("password"); setServerFieldErrors((current) => ({ ...current, password: "" })); setSignupPassword(e.target.value.slice(0,20)); setAuthError(null); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                    (fieldErrors.password || serverFieldErrors.password) && signupTouched.password ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                  required
                  placeholder="8–20 characters"
                  autoComplete="new-password"
                />
                {signupTouched.password && (serverFieldErrors.password || fieldErrors.password) && <p role="alert" className="mt-1 text-xs text-rose-700">{serverFieldErrors.password || fieldErrors.password}</p>}
                <button type="button" aria-label={showSignupPassword ? "Hide password" : "Show password"} onClick={() => setShowSignupPassword((shown) => !shown)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#666]">{showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showSignupPassword ? "Hide password" : "Show password"}</button>
                <p className="mt-1.5 text-xs text-[#777777]">
                  Letters, numbers, and special characters are allowed; spaces are not. Maximum 20 characters.
                </p>
                <p className={`mt-1 text-xs font-bold ${passwordStrength === "Neutral" ? "text-gray-500" : passwordStrength === "Strong" ? "text-emerald-700" : passwordStrength === "Medium" ? "text-amber-700" : "text-rose-700"}`}>Strength: {passwordStrength}</p>
                <ul className="mt-1 grid grid-cols-2 gap-x-2 text-[11px]">{passwordChecks.map((check) => <li key={check.label} className={check.met ? "text-emerald-700" : "text-[#888]"}>{check.met ? "✓" : "○"} {check.label}</li>)}</ul>
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#666666] mb-1.5">
                  Confirm Password <span className="text-rose-600">*</span>
                </label>
                <input
                  type={showSignupConfirm ? "text" : "password"}
                  maxLength={20} onPaste={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()}
                  value={signupConfirm}
                  onChange={(e) => { touch("confirm"); setSignupConfirm(e.target.value.slice(0,20)); setAuthError(null); }}
                  className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold text-[#171717] focus:outline-none transition-colors ${
                    fieldErrors.confirm && signupTouched.confirm ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8] focus:border-[#ff6b35]"
                  }`}
                  required
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                />
                <button type="button" aria-label={showSignupConfirm ? "Hide password" : "Show password"} onClick={() => setShowSignupConfirm((shown) => !shown)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#666]">{showSignupConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showSignupConfirm ? "Hide password" : "Show password"}</button>
                {signupTouched.confirm && fieldErrors.confirm && <p role="alert" className="mt-1 text-xs text-rose-700">{fieldErrors.confirm}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#ff6b35] hover:bg-[#e0531f] text-white font-black py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-sm shadow-md mt-2 flex items-center justify-center gap-2"
              >
                <span>
                  {loading
                    ? "Submitting…"
                    : signupRole === "organizer"
                    ? "Submit for Approval"
                    : "Create Account"}
                </span>
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
      </div>
    </div>
  );
}
