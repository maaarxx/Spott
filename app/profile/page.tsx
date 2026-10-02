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
import ProfileAddressFields, { type AddressValue } from "@/components/ProfileAddressFields";
import { isGibberishText, normalizeProfileText, validatePhonePH, validatePersonOrOrgText, validateUsername } from "@/lib/validators/name";

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
  const [username, setUsername] = useState(profile?.username || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.address || "");
  const [addressValue, setAddressValue] = useState<AddressValue>({ country: "PH", provinceOrRegionCode: "", province: "", cityCode: "", city: "", region: "", street: "" });
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarPreview, setAvatarPreview] = useState<string>(profile?.avatarUrl || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  const [phoneError, setPhoneError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [bioError, setBioError] = useState("");
  const [availability, setAvailability] = useState<"checking" | "available" | "taken" | "">("");

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
      setUsername(loaded.username || "");
      setPhone(loaded.phone || "");
      setAddress(loaded.address || "");
      if (loaded.address) void import("@/lib/psgc").then(({ findPHLocation, getPSGCData }) => {
        const parsed = findPHLocation(loaded.address || "");
        if (!parsed) { setAddressValue((current) => ({ ...current, street: loaded.address || "" })); setAddressError("Please re-select your country, province/region, and city to update this legacy address."); return; }
        const data = getPSGCData();
        const city = data.cities.find((item) => item.code === parsed.cityCode);
        const province = data.provinces.find((item) => item.code === parsed.provinceOrRegionCode);
        const region = data.regions.find((item) => item.code === parsed.provinceOrRegionCode);
        const parts = loaded.address!.split(",").map((part) => part.trim());
        setAddressValue({ country: "PH", provinceOrRegionCode: parsed.provinceOrRegionCode, province: province?.name || (region?.code === "130000000" ? "Metro Manila (NCR)" : region?.name || ""), cityCode: parsed.cityCode, city: city?.name || "", region: "", street: parts.slice(0, Math.max(0, parts.length - 3)).join(", ") });
        void region;
      });
      setBio(loaded.bio || "");
      setAvatarPreview(loaded.avatarUrl || "");
    }).catch((error) => {
      if (active) setSaveMsg({ type: "error", text: error instanceof Error ? error.message : "Unable to load your profile." });
    });
    return () => { active = false; };
  }, [router, user]);

  useEffect(() => {
    const problem = username ? validateUsername(username) : null;
    if (problem || !username || username.toLowerCase() === (profile?.username || "").toLowerCase()) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setAvailability("checking");
      void fetchWithSupabaseSession(`/api/username-available?u=${encodeURIComponent(username)}`).then(async (response) => {
        const result = await response.json();
        if (cancelled) return;
        setAvailability(result.available ? "available" : "taken");
        if (!result.available) setUsernameError("That username is already taken.");
      }).catch(() => setAvailability(""));
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [username, profile?.username]);

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
    if (!validateFields()) return;
    setSaving(true);
    setSaveMsg(null);

    try {
      const form = new FormData();
      form.set("username", username.trim());
      form.set("phone", phone.trim());
      const composedAddress = addressValue.country === "PH"
        ? [addressValue.street.trim(), addressValue.city, addressValue.province, "Philippines"].filter(Boolean).join(", ")
        : [addressValue.street.trim(), addressValue.city.trim(), addressValue.region.trim(), addressValue.country].filter(Boolean).join(", ");
      form.set("address", composedAddress || address.trim());
      form.set("country", addressValue.country);
      form.set("province_or_region_code", addressValue.provinceOrRegionCode);
      form.set("city_code", addressValue.cityCode);
      form.set("city", addressValue.city);
      form.set("region", addressValue.region);
      form.set("street", addressValue.street);
      form.set("bio", normalizeProfileText(bio));
      form.set("avatar_action", avatarRemoved ? "remove" : "keep");
      if (avatarFile) form.set("avatar", avatarFile);
      const response = await fetchWithSupabaseSession("/api/profile", { method: "PATCH", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.profile) {
        if (payload.fieldErrors) { setUsernameError(payload.fieldErrors.username || ""); setPhoneError(payload.fieldErrors.phone || ""); setAddressError(payload.fieldErrors.address || ""); setBioError(payload.fieldErrors.bio || ""); }
        throw new Error(payload.error || "Failed to save. Please try again.");
      }
      const updated = payload.profile as UserProfile;
      import('@/lib/fetch-dedupe').then(m => m.invalidateCache('/api/profile'));
      saveUserProfile(updated);
      setProfile(updated);
      setCurrentUser({ ...user, displayName: updated.displayName || user.name });
      setUsername(updated.username || "");
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

  const validateFields = () => {
    let isValid = true;
    const phoneProblem = phone ? validatePhonePH(phone) : null;
    if (phoneProblem) {
      setPhoneError(phoneProblem);
      isValid = false;
    } else {
      setPhoneError("");
    }
    
    const addressStarted = Boolean(addressValue.street || addressValue.cityCode || addressValue.city || addressValue.region || addressValue.provinceOrRegionCode);
    let addressProblem = !addressStarted ? "" : addressValue.country === "PH" ? (addressValue.cityCode && addressValue.provinceOrRegionCode ? "" : "Please select a valid city in the selected province or region.") : (addressValue.city && addressValue.region ? (isGibberishText(`${addressValue.city} ${addressValue.region}`) ? "Enter a real city and region/state." : "") : "Please enter a city and region/state.");
    if (!addressProblem && addressValue.street) addressProblem = validatePersonOrOrgText(addressValue.street, { label: "Street / Barangay", allowDigits: true, maxLen: 150 }) || "";
    setAddressError(addressProblem); if (addressProblem) isValid = false;
    
    if (username) {
      const problem = validateUsername(username); setUsernameError(problem || ""); if (problem || availability === "taken") isValid = false;
    }
    const bioProblem = bio ? validatePersonOrOrgText(bio, { label: "Bio", allowDigits: true, maxLen: 300 }) : null; setBioError(bioProblem || ""); if (bioProblem) isValid = false;
    
    return isValid;
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

  const visibleUsernameError = usernameError || (username ? (validateUsername(username) || "") : "");
  const visiblePhoneError = phoneError || (phone ? (validatePhonePH(phone) || "") : "");
  const visibleBioError = bioError || (bio ? (validatePersonOrOrgText(bio, { label: "Bio", allowDigits: true, maxLen: 300 }) || "") : "");

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
                Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#aaa] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={displayName}
                  readOnly
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#e6e1d8] rounded-xl bg-gray-50 text-gray-500 font-bold cursor-not-allowed"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-black text-[#555] uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative">
                <span className="text-[#aaa] font-bold absolute left-4 top-1/2 -translate-y-1/2">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { const value = e.target.value; setUsername(value); setUsernameError(value ? (validateUsername(value) || "") : ""); setAvailability(""); }}
                  onBlur={() => setUsernameError(username ? (validateUsername(username) || "") : "")}
                  placeholder="your_username"
                  maxLength={20}
                  className={`w-full pl-8 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-[#ff6b35] bg-white text-[#171717] font-bold ${visibleUsernameError ? "border-rose-400 bg-rose-50/30" : "border-[#e6e1d8]"}`}
                />
              </div>
              {visibleUsernameError && <p className="text-rose-600 text-[10px] mt-1">{visibleUsernameError}</p>}
              {!usernameError && availability === "available" && <p className="text-emerald-600 text-[10px] mt-1">Available</p>}
              {!usernameError && availability === "checking" && <p className="text-[#888] text-[10px] mt-1">Checking availability…</p>}
              <p className="text-[10px] text-[#888] mt-1.5">
                Username can only contain letters, numbers, and underscores. You can only change your username once every 30 days.
              </p>
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
                  onBlur={() => setPhoneError(phone ? (validatePhonePH(phone) || "") : "")}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9+]/g, '');
                    setPhone(val);
                    setPhoneError(val && val.length >= 11 ? (validatePhonePH(val) || "") : "");
                  }}
                  placeholder="09123456789"
                  maxLength={13}
                  className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-[#ff6b35] bg-white text-[#171717] font-bold ${visiblePhoneError ? 'border-rose-400 bg-rose-50/30' : 'border-[#e6e1d8]'}`}
                />
              </div>
              {visiblePhoneError && <p className="text-rose-600 text-[10px] mt-1">{visiblePhoneError}</p>}
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-black text-[#555] uppercase tracking-wider mb-1.5">
                Address
              </label>
              <ProfileAddressFields value={addressValue} onChange={(value) => { setAddressValue(value); setAddressError(""); }} error={addressError} onBlur={() => {
                const started = Boolean(addressValue.street || addressValue.cityCode || addressValue.city || addressValue.region || addressValue.provinceOrRegionCode);
                const problem = !started ? "" : addressValue.country === "PH" ? (addressValue.cityCode && addressValue.provinceOrRegionCode ? "" : "Please select a valid city in the selected province or region.") : !addressValue.city || !addressValue.region ? "Please enter a city and region/state." : isGibberishText(`${addressValue.city} ${addressValue.region}`) ? "Enter a real city and region/state." : "";
                setAddressError(problem || (addressValue.street ? (validatePersonOrOrgText(addressValue.street, { label: "Street / Barangay", allowDigits: true, maxLen: 150 }) || "") : ""));
              }} />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-black text-[#555] uppercase tracking-wider mb-1.5">
                Bio <span className="text-[#aaa] font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                onBlur={() => setBioError(bio ? (validatePersonOrOrgText(bio, { label: "Bio", allowDigits: true, maxLen: 300 }) || "") : "")}
                placeholder="Tell us a bit about yourself..."
                rows={3}
                maxLength={300}
                className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-[#ff6b35] bg-white text-[#171717] font-medium resize-none ${visibleBioError ? 'border-rose-400 bg-rose-50/30' : 'border-[#e6e1d8]'}`}
              />
              {visibleBioError && <p className="text-rose-600 text-[10px] mt-1">{visibleBioError}</p>}
              <p className="text-right text-[11px] text-[#aaa] mt-1">{bio.length}/300</p>
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving || Boolean(visibleUsernameError || visiblePhoneError || visibleBioError || addressError || availability === "taken")}
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
