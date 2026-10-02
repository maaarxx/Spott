"use client";

import { useEffect, useMemo, useState } from "react";
import type { PSGCData } from "@/lib/psgc";

export type AddressValue = { country: string; provinceOrRegionCode: string; province: string; cityCode: string; city: string; region: string; street: string };
const countryOptions = (() => {
  const list: { code: string; name: string }[] = [];
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  for (let i = 65; i <= 90; i++) for (let j = 65; j <= 90; j++) {
    const code = String.fromCharCode(i, j);
    try { const name = displayNames.of(code); if (name && name !== code && !/Unknown Region/.test(name)) list.push({ code, name }); } catch {}
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
})();

export default function ProfileAddressFields({ value, onChange, error, label = "Address", onBlur }: { value: AddressValue; onChange: (value: AddressValue) => void; error?: string; label?: string; onBlur?: () => void }) {
  const [data, setData] = useState<PSGCData | null>(null);
  const [citySearch, setCitySearch] = useState("");
  useEffect(() => { void import("@/lib/psgc").then((module) => setData(module.getPSGCData())); }, []);
  const options = useMemo(() => {
    if (!data || !value.provinceOrRegionCode) return [];
    return data.cities.filter((city) => city.provinceCode === value.provinceOrRegionCode || (city.provinceCode === null && city.regionCode === value.provinceOrRegionCode));
  }, [data, value.provinceOrRegionCode]);
  const ncr = data?.regions.find((region) => region.code === value.provinceOrRegionCode)?.code === "130000000";
  return <div className="space-y-2">
    <label className="block text-xs font-black text-[#555] uppercase tracking-wider">{label}</label>
    <select value={value.country} onBlur={onBlur} onChange={(e) => onChange({ ...value, country: e.target.value, provinceOrRegionCode: "", province: "", cityCode: "", city: "", region: "" })} className={`w-full rounded-xl border p-3 text-sm ${error ? "border-rose-400" : "border-[#e6e1d8]"}`}>
      <option value="PH">Philippines</option>{countryOptions.filter((country) => country.code !== "PH").map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
    </select>
    {value.country === "PH" ? <>
      <select value={value.provinceOrRegionCode} onBlur={onBlur} onChange={(e) => onChange({ ...value, provinceOrRegionCode: e.target.value, province: data?.provinces.find((item) => item.code === e.target.value)?.name || (e.target.value === "130000000" ? "Metro Manila (NCR)" : data?.regions.find((item) => item.code === e.target.value)?.name || ""), cityCode: "", city: "" })} className={`w-full rounded-xl border p-3 text-sm ${error ? "border-rose-400" : "border-[#e6e1d8]"}`}>
        <option value="">Select province / region</option>{data?.provinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}{data?.regions.filter((region) => region.code === "130000000").map((region) => <option key={region.code} value={region.code}>Metro Manila (NCR)</option>)}
        {data && [...new Set(data.cities.filter((city) => !city.provinceCode && city.regionCode !== "130000000").map((city) => city.regionCode))].map((regionCode) => { const region = data.regions.find((item) => item.code === regionCode); return region ? <option key={regionCode} value={regionCode}>{region.name} (independent cities)</option> : null; })}
      </select>
      <input value={citySearch} onBlur={onBlur} onChange={(e) => setCitySearch(e.target.value)} placeholder="Search city / municipality" className={`w-full rounded-xl border p-3 text-sm ${error ? "border-rose-400" : "border-[#e6e1d8]"}`} />
      <select value={value.cityCode} onBlur={onBlur} onChange={(e) => onChange({ ...value, cityCode: e.target.value, city: options.find((city) => city.code === e.target.value)?.name || "" })} className={`w-full rounded-xl border p-3 text-sm ${error ? "border-rose-400" : "border-[#e6e1d8]"}`}>
        <option value="">Select city / municipality</option>{options.filter((city) => city.name.toLowerCase().includes(citySearch.toLowerCase())).map((city) => <option key={city.code} value={city.code}>{city.name}</option>)}
      </select>{ncr && <p className="text-xs text-[#888]">Metro Manila (NCR) cities</p>}
    </> : <>
      <input value={value.region} onBlur={onBlur} onChange={(e) => onChange({ ...value, region: e.target.value })} placeholder="Region / State" className={`w-full rounded-xl border p-3 text-sm ${error ? "border-rose-400" : "border-[#e6e1d8]"}`} />
      <input value={value.city} onBlur={onBlur} onChange={(e) => onChange({ ...value, city: e.target.value })} placeholder="City" className={`w-full rounded-xl border p-3 text-sm ${error ? "border-rose-400" : "border-[#e6e1d8]"}`} />
      <p className="text-[10px] text-[#888]">For countries outside the Philippines, City and Region are free text and validated for gibberish.</p>
    </>}
    <input value={value.street} onBlur={onBlur} onChange={(e) => onChange({ ...value, street: e.target.value })} placeholder="Street / Barangay / Campus (optional)" className={`w-full rounded-xl border p-3 text-sm ${error ? "border-rose-400" : "border-[#e6e1d8]"}`} />
    {error && <p className="text-rose-600 text-[10px] mt-1">{error}</p>}
  </div>;
}
