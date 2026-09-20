"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
          },
        });
        if (error) throw error;
        setMessage("Check your email for a confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center px-4 py-12 bg-paper">
      <div className="w-full max-w-md">
        <div className="bg-white border border-line rounded-2xl p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-ink mb-2">Welcome to Spott</h1>
            <p className="text-sm text-muted">
              Explore and manage events in your university project area
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-6 mb-8 border-b border-line">
            <button
              onClick={() => { setMode("login"); setError(""); setMessage(""); }}
              className={`pb-3 text-sm font-bold transition-colors relative cursor-pointer ${
                mode === "login"
                  ? "text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              Log In
              {mode === "login" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-ink" />
              )}
            </button>
            <button
              onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
              className={`pb-3 text-sm font-bold transition-colors relative cursor-pointer ${
                mode === "signup"
                  ? "text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              Sign Up
              {mode === "signup" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-ink" />
              )}
            </button>
          </div>


          {/* Error / Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-200">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-xl text-sm font-medium border border-green-200">
              {message}
            </div>
          )}

          {/* Email Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-muted mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full border border-line rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent focus:border-accent"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-muted mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full border border-line rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent focus:border-accent"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-muted">
                  Password
                </label>
                {mode === "login" && (
                  <button type="button" className="text-xs font-medium text-muted hover:text-ink transition-colors cursor-pointer">
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-line rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent focus:border-accent"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-dark text-white font-bold py-3.5 rounded-xl hover:bg-ink transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-muted">
              Just browsing?{" "}
              <Link href="/" className="text-ink font-bold hover:underline">
                Explore events without an account
              </Link>
            </p>
          </div>

          <p className="text-[10px] text-muted text-center mt-4 leading-relaxed">
            By continuing, you agree to Spott&apos;s Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
