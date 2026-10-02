import raw from "../data/psgc.json" with { type: "json" };

export type PSGCRegion = { code: string; name: string; regionName: string };
export type PSGCProvince = { code: string; name: string; regionCode: string };
export type PSGCCity = { code: string; name: string; regionCode: string; provinceCode: string | null; districtCode: string | null };
export type PSGCData = { source: string; fetchedAt: string; regions: PSGCRegion[]; provinces: PSGCProvince[]; cities: PSGCCity[] };
const data = raw as PSGCData;
export const getPSGCData = () => data;
export const getCitiesForProvince = (provinceCode: string) => data.cities.filter((city) => city.provinceCode === provinceCode);
export const getCitiesForRegion = (regionCode: string) => data.cities.filter((city) => city.provinceCode === null && city.regionCode === regionCode);
export function validatePHLocation(provinceOrRegionCode: string, cityCode: string) {
  const province = data.provinces.find((item) => item.code === provinceOrRegionCode);
  const region = data.regions.find((item) => item.code === provinceOrRegionCode);
  if (!province && !region) return { error: "Please select a valid province or region." as const };
  const city = data.cities.find((item) => item.code === cityCode);
  const belongs = city && (province ? city.provinceCode === province.code : city.provinceCode === null && city.regionCode === region!.code);
  if (!belongs) return { error: "Please select a valid city in the selected province or region." as const };
  return { province: province?.name || "Metro Manila (NCR)", region: province ? data.regions.find((item) => item.code === province.regionCode)?.name || "" : region!.name, city: city!.name };
}
export function findPHLocation(address: string) {
  const parts = address.split(",").map((part) => part.trim().toLowerCase());
  const city = data.cities.find((item) => parts.some((part) => item.name.toLowerCase() === part || item.name.replace(/^(city of |city of )/i, "").toLowerCase() === part));
  if (!city) return null;
  return { provinceOrRegionCode: city.provinceCode || city.regionCode, cityCode: city.code };
}
