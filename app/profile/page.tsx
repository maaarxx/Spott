"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Camera,
  User,
  Phone,
  MapPin,
  Save,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Pencil,
  X,
  Mail,
  Shield,
} from "lucide-react";
import { getCurrentUser, setCurrentUser, SpottAccount } from "@/lib/auth-store";
import { useHydrated } from "@/lib/use-hydrated";
import { fetchWithSupabaseSession } from "@/lib/audit-log-client";
import {
  getUserProfile,
  loadUserProfileFromDatabase,
  saveUserProfile,
  UserProfile,
  getInitials,
} from "@/lib/user-profile-store";

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mounted = useHydrated();
  const [user, setUser] = useState<SpottAccount | null>(() => getCurrentUser());
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const current = getCurrentUser();
    return current ? getUserProfile(current.email) : null;
  });

  // Form fields
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.address || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarPreview, setAvatarPreview] = useState<string>(profile?.avatarUrl || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    let active = true;
    void loadUserProfileFromDatabase(user.email).then((loaded) => {
      if (!active) return;
      setProfile(loaded);
      setDisplayName(loaded.displayName || user.name);
      setPhone(loaded.phone || "");
      setAddress(loaded.address || "");
      setBio(loaded.bio || "");
      setAvatarPreview(loaded.avatarUrl || "");
    }).catch((error) => {
      if (active) setSaveMsg({ type: "error", text: error instanceof Error ? error.message : "Unable to load your profile." });
    });
    return () => { active = false; };
  }, [router, user]);

  if (!mounted) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2 MB.");
      return;
    }
    setAvatarError("");
    setAvatarFile(file);
    setAvatarRemoved(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setAvatarPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview("");
    setAvatarFile(null);
    setAvatarRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaveMsg(null);

    try {
      const form = new FormData();
      form.set("display_name", displayName.trim() || user.name);
      form.set("phone", phone.trim());
      form.set("address", address.trim());
      form.set("bio", bio.trim());
      form.set("avatar_action", avatarRemoved ? "remove" : "keep");
      if (avatarFile) form.set("avatar", avatarFile);
      const response = await fetchWithSupabaseSession("/api/profile", { method: "PATCH", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Failed to save. Please try again.");
      const updated = payload.profile as UserProfile;
      saveUserProfile(updated);
      setProfile(updated);
      setCurrentUser({ ...user, displayName: updated.displayName || user.name });
      setAvatarPreview(updated.avatarUrl || "");
      setAvatarFile(null);
      setAvatarRemoved(false);
      setSaveMsg({ type: "success", text: "Profile saved successfully!" });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (error) {
      setSaveMsg({ type: "error", text: error instanceof Error ? error.message : "Failed to save. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const initials = getInitials(displayName || user?.name || "U");
  const roleLabel =
    user?.role === "admin"
      ? "Administrator"
      : user?.role === "organizer"
      ? "Organizer"
      : "User";

  const roleColor =
    user?.role === "admin"
      ? "bg-black text-white"
      : user?.role === "organizer"
      ? "bg-[#fff0e8] text-[#ff6b35]"
      : "bg-gray-100 text-gray-700";

  return (
    <div className="min-h-screen bg-[#faf8f3]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#e6e1d8] px-4 sm:px-6 h-14 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#555] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-black text-[#171717] text-base">My Profile</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Save Notice */}
        {saveMsg && (
          <div
            className={`flex items-center gap-2.5 p-3.5 rounded-2xl text-sm font-bold shadow-sm ${
              saveMsg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            {saveMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            {saveMsg.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* Avatar Card */}
          <div className="bg-white border border-[#e6e1d8] rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-black text-[#171717] mb-5 flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#ff6b35]" />
              Profile Photo
            </h2>

            <div className="flex items-center gap-5">
              {/* Avatar preview */}
              <div className="relative group shrink-0">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#e6e1d8] bg-[#eee9e1] flex items-center justify-center shadow-sm">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-black text-[#555]">
                      {initials}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="flex-1">
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-[#ff6b35] hover:bg-[#e0531f] text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Upload Photo
                  </button>
                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-[#888888] mt-2">JPG, PNG or GIF · Max 2 MB</p>
                {avatarError && (
                  <p className="text-xs text-rose-600 font-bold mt-1">{avatarError}</p>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Account Info (read-only) */}
          <div className="bg-white border border-[#e6e1d8] rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-black text-[#171717] mb-5 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#ff6b35]" />
              Account Info
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                <Mail className="w-4 h-4 text-[#888]" />
                <div>
                  <p className="text-[10px] text-[#888] font-bold uppercase tracking-wider">Email</p>
                  <p className="text-sm font-bold text-[#171717]">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-[#faf8f3] rounded-xl border border-[#e6e1d8]">
                <Shield className="w-4 h-4 text-[#888]" />
                <div>
                  <p className="text-[10px] text-[#888] font-bold uppercase tracking-wider">Role</p>
                  <span className={`text-xs font-extrabold px-2.5 py-1 rounded-md ${roleColor}`}>
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Editable Fields */}
          <div className="bg-white border border-[#e6e1d8] rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-black text-[#171717] flex items-center gap-2">
              <Pencil className="w-4 h-4 text-[#ff6b35]" />
              Personal Details
            </h2>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-black text-[#555] uppercase tracking-wider mb-1.5">
                Display Name / Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#aaa] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name as shown to others"
                  maxLength={60}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#e6e1d8] rounded-xl focus:outline-none focus:border-[#ff6b35] bg-white text-[#171717] font-bold"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-black text-[#555] uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#aaa] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+63 912 345 6789"
                  maxLength={20}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#e6e1d8] rounded-xl focus:outline-none focus:border-[#ff6b35] bg-white text-[#171717] font-bold"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-black text-[#555] uppercase tracking-wider mb-1.5">
                Address
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-[#aaa] absolute left-3.5 top-3.5" />
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="City, Province, Philippines"
                  rows={2}
                  maxLength={200}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#e6e1d8] rounded-xl focus:outline-none focus:border-[#ff6b35] bg-white text-[#171717] font-bold resize-none"
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-black text-[#555] uppercase tracking-wider mb-1.5">
                Bio <span className="text-[#aaa] font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us a bit about yourself..."
                rows={3}
                maxLength={300}
                className="w-full px-4 py-2.5 text-sm border border-[#e6e1d8] rounded-xl focus:outline-none focus:border-[#ff6b35] bg-white text-[#171717] font-medium resize-none"
              />
              <p className="text-right text-[11px] text-[#aaa] mt-1">{bio.length}/300</p>
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 bg-[#ff6b35] hover:bg-[#e0531f] disabled:opacity-60 text-white rounded-2xl text-sm font-black transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
